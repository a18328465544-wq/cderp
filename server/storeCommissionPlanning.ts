import type {
  CardInventory,
  CommissionAdjustment,
  CommissionMode,
  CommissionRules,
  PurchaseCommissionRecord,
  PurchaseInvoice,
  SalesInvoice,
} from "../src/types.ts";
import {calculateCommission} from "../src/utils/commissionRules.ts";
import {appendCommissionAdjustment, commissionStatus, effectiveCommissionAmount} from "./commissionRecords.ts";

export type CommissionPlanningState = {
  inventory: CardInventory[];
  purchaseInvoices: PurchaseInvoice[];
  purchaseCommissions: PurchaseCommissionRecord[];
  commissionRules: CommissionRules;
};

export type CommissionPlanningDependencies = {
  state: CommissionPlanningState;
  genId: (prefix: string) => string;
  nowStamp: () => string;
  systemActor: () => string;
};

/**
 * Commission records are derived from the physical card and the outbound invoice.
 * This boundary keeps creation and return reversal symmetric without moving the
 * source-of-truth calculation into an HTTP route.
 */
export function createCommissionPlanningHelpers(dependencies: CommissionPlanningDependencies) {
  const {state, genId, nowStamp, systemActor} = dependencies;

  const findPurchaseInvoiceForCard = (card: CardInventory) => {
    if (card.purchaseInvoiceNo) {
      const linked = state.purchaseInvoices.find((invoice) =>
        invoice.invoiceNo === card.purchaseInvoiceNo || invoice.id === card.purchaseInvoiceNo,
      );
      if (linked) return linked;
    }
    const legacyInvoiceNo = card.remarks?.match(/进货单:([^；\s]+)/)?.[1];
    if (!legacyInvoiceNo) return undefined;
    return state.purchaseInvoices.find((invoice) =>
      invoice.invoiceNo === legacyInvoiceNo || invoice.id === legacyInvoiceNo,
    );
  };

  const ensurePurchaseCommissionsForSale = (invoice: SalesInvoice, outboundTime: string, outboundHandler: string) => {
    const created: PurchaseCommissionRecord[] = [];

    invoice.items.forEach((item) => {
      const card = state.inventory.find((inventoryItem) => inventoryItem.id === item.inventoryId);
      if (!card || (card.category || "显卡") !== "显卡") return;
      const alreadyCreated = state.purchaseCommissions.some((record) =>
        record.inventoryId === card.id && record.salesInvoiceNo === invoice.invoiceNo,
      );
      if (alreadyCreated) return;

      const purchaseInvoice = findPurchaseInvoiceForCard(card);
      const costPrice = Number(card.costPrice || item.costPrice || 0);
      const salesPrice = Number(card.salesPrice || item.sellPrice || 0);
      const grossProfit = Number((salesPrice - costPrice).toFixed(2));
      const calculationContext = {
        purchaseAmount: costPrice,
        salesAmount: salesPrice,
        profit: Math.max(0, grossProfit),
      };
      const purchaseRule = state.commissionRules.purchase;
      const salesRule = state.commissionRules.sales;
      const purchaseEffective = !purchaseRule.effectiveDate || outboundTime.slice(0, 10) >= purchaseRule.effectiveDate;
      const salesEffective = !salesRule.effectiveDate || outboundTime.slice(0, 10) >= salesRule.effectiveDate;
      const purchaseCalculation = calculateCommission(purchaseRule, calculationContext);
      const salesCalculation = calculateCommission(salesRule, calculationContext);
      const purchaseTargetEnabled = purchaseRule.targets.purchaseHandler || purchaseRule.targets.warehouseManager || purchaseRule.targets.customMemberIds.length > 0;
      const salesTargetEnabled = salesRule.targets.salesHandler || salesRule.targets.warehouseManager || salesRule.targets.customMemberIds.length > 0;
      const purchaseCommissionAmount = purchaseEffective && purchaseTargetEnabled ? purchaseCalculation.amount : 0;
      const salesCommissionAmount = salesEffective && salesTargetEnabled ? salesCalculation.amount : 0;

      created.push({
        id: genId("TC"),
        accountingStatus: "已提交",
        accountingEventId: invoice.accountingEventId || purchaseInvoice?.accountingEventId,
        inventoryId: card.id,
        sn: card.sn || item.sn,
        productId: card.productId || item.productId,
        productName: card.productName || item.productName,
        purchaseInvoiceNo: card.purchaseInvoiceNo || purchaseInvoice?.invoiceNo,
        salesInvoiceNo: invoice.invoiceNo,
        purchaseHandler: card.purchaseHandler || purchaseInvoice?.handleBy || "未记录",
        salesHandler: invoice.handleBy,
        outboundHandler,
        costPrice,
        salesPrice,
        grossProfit,
        rate: purchaseCalculation.rate,
        commissionAmount: purchaseCommissionAmount,
        purchaseRate: purchaseCalculation.rate,
        purchaseCommissionAmount,
        purchaseCalculationMethod: purchaseCalculation.method,
        salesRate: salesCalculation.rate,
        salesCommissionAmount,
        salesCalculationMethod: salesCalculation.method,
        status: "待结算",
        createdAt: outboundTime,
        remarks: `按已生效提成规则自动生成；进货${purchaseRule.payoutCycle === "monthly" ? "按月" : "按单"}发放，卖货${salesRule.payoutCycle === "monthly" ? "按月" : "按单"}发放`,
      });
    });

    if (created.length) state.purchaseCommissions = [...created, ...state.purchaseCommissions];
    return created;
  };

  const adjustCommissionForSalesReturn = (invoiceNo: string, inventoryId: string | undefined, returnNo: string) => {
    if (!inventoryId) return;
    const shouldAdjustPurchase = state.commissionRules.purchase.adjustOnReturn;
    const shouldAdjustSales = state.commissionRules.sales.adjustOnReturn;
    if (!shouldAdjustPurchase && !shouldAdjustSales) return;
    state.purchaseCommissions = state.purchaseCommissions.map((record) => {
      if (record.salesInvoiceNo !== invoiceNo || record.inventoryId !== inventoryId) return record;
      let updated = record;
      const adjustments: CommissionAdjustment[] = [];
      const actor = systemActor();
      for (const mode of ["purchase", "sales"] as CommissionMode[]) {
        const enabled = mode === "purchase" ? shouldAdjustPurchase : shouldAdjustSales;
        if (enabled && effectiveCommissionAmount(record, mode) > 0) {
          adjustments.push({
            id: genId("TCA"),
            mode,
            amount: -effectiveCommissionAmount(record, mode),
            reason: "销售退货",
            documentNo: returnNo,
            note: `关联销售单 ${invoiceNo}`,
            createdAt: nowStamp(),
            createdBy: actor,
          });
        }
      }
      for (const adjustment of adjustments) updated = appendCommissionAdjustment(updated, adjustment);
      const purchaseChanged = updated !== record && adjustments.some((item) => item.mode === "purchase");
      const salesChanged = updated !== record && adjustments.some((item) => item.mode === "sales");
      if (!purchaseChanged && !salesChanged) return record;
      return {
        ...updated,
        ...(purchaseChanged && commissionStatus(record, "purchase") !== "已结算" ? {purchaseStatus: "已冲销" as const} : {}),
        ...(salesChanged && commissionStatus(record, "sales") !== "已结算" ? {salesStatus: "已冲销" as const} : {}),
        remarks: `${record.remarks || ""}${record.remarks ? "；" : ""}销售退货 ${returnNo} 已追加提成冲减记录`,
      };
    });
  };

  return {
    findPurchaseInvoiceForCard,
    ensurePurchaseCommissionsForSale,
    adjustCommissionForSalesReturn,
  };
}
