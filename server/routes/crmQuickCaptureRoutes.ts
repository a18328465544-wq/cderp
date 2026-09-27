import type {Express, Request, RequestHandler} from "express";
import type {AuthenticatedRequest} from "../httpAuth.ts";
import {saveStateRecords} from "../db.ts";
import {ensureCrmCustomerAccount, upsertCrmCustomerAccount} from "../crmAccountRepository.ts";
import {syncCrmFollowUp} from "../crmCommandRepository.ts";
import {
  confirmQuickCaptureAuditInTransaction,
  findLeadByIdempotencyKey,
  findQuickCaptureAudit,
  insertQuickCaptureLead,
  insertQuickCaptureTask,
  saveQuickCaptureAudit,
} from "../crmQuickCaptureRepository.ts";
import {
  createQuickCaptureLeadId,
  createQuickCaptureTaskId,
  parseQuickCaptureText,
  QuickCaptureValidationError,
  validateQuickCaptureConfirm,
} from "../crmQuickCapture.ts";
import {compactStateMerge, stateMergeRecords, statePatchResponse, type StateMergePatch} from "../statePatch.ts";
import {storeDateTime} from "../../src/utils/storeTime.ts";
import {crmQuickCaptureConfirmDto, crmQuickCaptureParseDto, parseHttpDto} from "../httpDto.ts";
import type {AppState, createStoreActions} from "../store.ts";
import type {SystemUserAccount} from "../../src/types.ts";

type QuickCaptureRequest = AuthenticatedRequest<SystemUserAccount>;

type CrmQuickCaptureDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  asyncRoute: (handler: RequestHandler) => RequestHandler;
  getState: () => AppState;
  actions: (req: Request) => ReturnType<typeof createStoreActions>;
  actorForRequest: (req: QuickCaptureRequest) => string;
};

function recordsByIds<T extends {id: string}>(items: T[], ids: Iterable<string | undefined>) {
  const idSet = new Set(Array.from(ids).filter(Boolean));
  return idSet.size ? items.filter((item) => idSet.has(item.id)) : [];
}

function okMerge(data: unknown, stateMerge: StateMergePatch) {
  return statePatchResponse(data, stateMerge);
}

function isUniqueViolation(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as {code?: unknown}).code === "23505");
}

/**
 * Quick capture is a CRM workflow with its own audit/idempotency transaction;
 * keeping it behind one route boundary prevents the composition root from
 * becoming a second CRM command implementation.
 */
export function registerCrmQuickCaptureRoutes(app: Express, dependencies: CrmQuickCaptureDependencies) {
  app.post(
    "/api/gpu_erp/crm/quick-capture/parse",
    dependencies.requireMenu("crm"),
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as QuickCaptureRequest;
      const state = dependencies.getState();
      const command = parseHttpDto(crmQuickCaptureParseDto, req.body);
      const result = await parseQuickCaptureText(
        command,
        {products: state.products, customers: state.customers},
      );
      await saveQuickCaptureAudit({
        id: result.parseId,
        rawText: result.rawText,
        sourceType: result.sourceType,
        parsed: result,
        actorId: dependencies.actorForRequest(authRequest),
        model: result.model,
      });
      res.json({data: result});
    }),
  );

  app.post(
    "/api/gpu_erp/crm/quick-capture/confirm",
    dependencies.requireMenu("crm"),
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as QuickCaptureRequest;
      const state = dependencies.getState();
      const input = validateQuickCaptureConfirm(parseHttpDto(crmQuickCaptureConfirmDto, req.body));
      const audit = await findQuickCaptureAudit(input.parseId);
      if (!audit) throw new QuickCaptureValidationError("解析记录已过期，请重新解析后再确认", "CRM_QUICK_CAPTURE_PARSE_NOT_FOUND", 404);
      if (audit.rawText !== input.rawText) throw new QuickCaptureValidationError("解析原文已变化，请重新解析后再确认", "CRM_QUICK_CAPTURE_PARSE_MISMATCH", 409);
      if (audit.sourceType !== input.sourceType) throw new QuickCaptureValidationError("解析来源已变化，请重新解析后再确认", "CRM_QUICK_CAPTURE_SOURCE_MISMATCH", 409);
      const existing = await findLeadByIdempotencyKey(input.idempotencyKey);
      if (existing) {
        res.json({data: {lead: existing, task: null, customer: state.customers.find((item) => item.id === existing.customerId) || null, duplicate: true}});
        return;
      }

      const fields = input.fields;
      let customer: AppState["customers"][number];
      let createdCustomer: AppState["customers"][number] | null = null;
      if (input.matchAction === "link_existing") {
        const matchedCustomer = state.customers.find((item) => item.id === input.matchedCustomerId);
        if (!matchedCustomer) throw new QuickCaptureValidationError("要关联的客户不存在，请重新匹配", "CRM_QUICK_CAPTURE_CUSTOMER_NOT_FOUND", 404);
        customer = matchedCustomer;
      } else {
        const exactMatch = state.customers.find((item) => {
          const phone = String(fields.phone || "").trim().toLowerCase();
          const currentPhone = String(item.phone || item.contact || "").trim().toLowerCase();
          const wechat = String(fields.wechat || "").trim().toLowerCase();
          const currentWechat = String(item.wechat || "").trim().toLowerCase();
          const qq = String(fields.qq || "").trim().toLowerCase();
          const currentQq = String(item.qq || "").trim().toLowerCase();
          return (phone && currentPhone === phone) || (wechat && currentWechat === wechat) || (qq && currentQq === qq);
        });
        if (exactMatch) {
          throw new QuickCaptureValidationError(`联系方式已匹配客户【${exactMatch.name}】，请在预览中选择“关联已有客户”`, "CRM_QUICK_CAPTURE_MATCH_REQUIRED", 409);
        }
        const intent = fields.intentType === "回收" ? "高" : fields.priority === "高" ? "高" : fields.priority === "低" ? "低" : "中";
        if (!fields.customerName) throw new QuickCaptureValidationError("客户名称不能为空", "CRM_QUICK_CAPTURE_CUSTOMER_NAME_REQUIRED", 400);
        createdCustomer = dependencies.actions(authRequest).createCustomer({
          name: fields.customerName,
          contact: fields.phone,
          phone: fields.phone,
          wechat: fields.wechat,
          qq: fields.qq,
          city: fields.city,
          company: fields.company,
          firstChannel: fields.source || "CRM快捷录入",
          source: fields.source || "CRM快捷录入",
          type: fields.intentType === "回收" ? "个人卖家客户" : "个人买家客户",
          intent,
          budget: fields.expectedPrice || 0,
          estimatedAmount: fields.quotedPrice || fields.expectedPrice || 0,
          nextFollowTime: fields.followUpTime,
          nextFollowUpAt: fields.followUpTime,
          nextAction: fields.productModel ? `确认 ${fields.productModel} 的需求和价格` : "补充需求和联系方式",
          tags: fields.tags,
          remarks: fields.note,
          fromCrm: true,
        });
        customer = createdCustomer;
      }

      const actor = dependencies.actorForRequest(authRequest);
      const followUp = dependencies.actions(authRequest).createCrmFollowUp({
        customerId: customer.id,
        contactMethod: fields.wechat ? "微信" : fields.phone ? "电话" : "其他",
        content: fields.note || `快捷录入线索：${fields.productModel || fields.productName || "待确认商品"}`,
        result: "继续跟进",
        handler: actor,
        followTime: storeDateTime(),
        nextFollowTime: fields.followUpTime,
        nextFollowUpAt: fields.followUpTime,
        nextAction: fields.productModel ? `确认 ${fields.productModel} 的需求和价格` : "补充需求和联系方式",
        estimatedAmount: fields.quotedPrice || fields.expectedPrice || 0,
        dealProbability: fields.priority === "高" ? 70 : fields.priority === "低" ? 20 : 40,
        remarks: "由客户线索快捷录入自动创建",
      });

      const stateMerge = compactStateMerge({
        customers: recordsByIds(state.customers, [customer.id]),
        crmFollowUps: [followUp],
        logs: state.logs.slice(0, 1),
      });
      const leadId = createQuickCaptureLeadId();
      const taskId = createQuickCaptureTaskId();
      let savedLead: Awaited<ReturnType<typeof insertQuickCaptureLead>> | null = null;
      let savedTask: Awaited<ReturnType<typeof insertQuickCaptureTask>> | null = null;
      try {
        await saveStateRecords(
          stateMergeRecords(stateMerge),
          async (client) => {
            const account = createdCustomer
              ? await upsertCrmCustomerAccount(client, customer, "created", actor)
              : await ensureCrmCustomerAccount(client, customer);
            const matchedAccount = input.matchAction === "link_existing" ? account.accountId : undefined;
            savedLead = await insertQuickCaptureLead(client, {
              id: leadId,
              customerId: customer.id,
              sourceType: input.sourceType,
              source: fields.source,
              intentType: fields.intentType,
              productCategory: fields.productCategory,
              productName: fields.productName,
              productModel: fields.productModel,
              productId: fields.productId,
              quantity: fields.quantity,
              expectedPrice: fields.expectedPrice,
              quotedPrice: fields.quotedPrice,
              transactionType: fields.transactionType,
              deliveryMethod: fields.deliveryMethod,
              followUpTime: fields.followUpTime,
              priority: fields.priority || "中",
              stage: fields.stage || "新线索",
              tags: fields.tags,
              note: fields.note,
              rawText: input.rawText,
              confidence: input.confidence,
              missingFields: input.missingFields,
              conflicts: input.conflicts,
              matchedCustomerId: input.matchedCustomerId,
              createdBy: actor,
              accountId: account.accountId,
              matchedAccountId: matchedAccount,
              idempotencyKey: input.idempotencyKey,
            });
            savedLead = savedLead ? {...savedLead, customerId: customer.id, customerName: customer.name, matchedCustomerId: input.matchedCustomerId} : savedLead;
            savedTask = await insertQuickCaptureTask(client, {
              id: taskId,
              leadId,
              customerId: customer.id,
              accountId: account.accountId,
              taskType: "客户跟进",
              title: fields.followUpTime ? `跟进客户：${customer.name}` : `补充线索：${customer.name}`,
              dueAt: fields.followUpTime,
              status: "待处理",
              assignee: actor,
              createdBy: actor,
            });
            savedTask = savedTask ? {...savedTask, customerId: customer.id} : savedTask;
            await syncCrmFollowUp(client, followUp, customer, actor);
            await confirmQuickCaptureAuditInTransaction(client, {
              id: input.parseId,
              finalPayload: {...input, leadId, taskId},
              status: "confirmed",
              leadId,
            });
          },
        );
      } catch (error) {
        // The unique idempotency key is the database backstop when two tabs confirm together.
        if (isUniqueViolation(error)) {
          const existingAfterRace = await findLeadByIdempotencyKey(input.idempotencyKey);
          if (existingAfterRace) {
            res.json({data: {lead: existingAfterRace, task: null, customer: state.customers.find((item) => item.id === existingAfterRace.customerId) || null, duplicate: true}});
            return;
          }
        }
        throw error;
      }
      res.status(201).json(okMerge({customer, lead: savedLead, task: savedTask, followUp}, stateMerge));
    }),
  );
}
