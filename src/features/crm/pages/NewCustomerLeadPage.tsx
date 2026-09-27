import {useMutation, useQueryClient} from "@tanstack/react-query";
import {Check, Link2, Loader2, LogIn, MessageSquareText, RefreshCw, Sparkles, UserPlus} from "lucide-react";
import {useState, type FormEvent, type ReactNode} from "react";
import {Link, useNavigate} from "@tanstack/react-router";
import {notify} from "@/src/utils/notification";
import {Button, Card, CardContent, Select, Textarea} from "@/src/components/ui";
import {ErpCrmPageFrame, ErpFormSection, ErpPageContent, ErpPageError, ErpPageHeader, ErpStatusBadge, ErpSubmitBar, ErpUnsavedChangesDialog, useErpDirtyGuard} from "@/src/components/common";
import {crmApi, refreshErpAfterDocument} from "@/src/services/api";
import {createCapabilities, useAuth} from "@/src/app/auth";
import type {QuickCaptureConfirmInput, QuickCaptureParseResult, QuickCaptureSourceType} from "@/src/types/crm";
import {useWorkspaceTabActivity, useWorkspaceTabBlocker, useWorkspaceTabDirty} from "@/src/hooks/useWorkspaceTabRuntime";

const sourceOptions = [{value: "manual", label: "手工录入"}, {value: "chat", label: "聊天记录"}, {value: "voice", label: "语音转写"}] satisfies Array<{value: QuickCaptureSourceType; label: string}>;

export function NewCustomerLeadPage() {
  const queryClient = useQueryClient();
  const {session, status, error, refresh} = useAuth();
  const canAccess = createCapabilities(session).menu("crm");
  if (status === "loading") return <LeadState title="正在验证 CRM 权限" icon={<RefreshCw className="h-5 w-5 animate-spin" />} />;
  if (status === "error") return <ErpPageError title="无法读取登录状态" description={error?.message || "请重新登录后继续。"} onRetry={() => void refresh()} />;
  if (!session) return <LeadState title="登录状态为空" icon={<LogIn className="h-5 w-5" />} />;
  if (!canAccess) return <LeadState title="当前账号没有 CRM 权限" description="服务器已拒绝 crm 菜单访问（403）。" icon={<UserPlus className="h-5 w-5" />} />;
  return <LeadForm onSuccess={() => refreshErpAfterDocument(queryClient)} />;
}

function LeadForm({onSuccess}: {onSuccess: () => void | Promise<void>}) {
  const navigate = useNavigate();
  const [sourceType, setSourceType] = useState<QuickCaptureSourceType>("manual");
  const [rawText, setRawText] = useState("");
  const [parsed, setParsed] = useState<QuickCaptureParseResult | null>(null);
  const [matchedCustomerId, setMatchedCustomerId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const dirty = Boolean(rawText.trim() && !success);
  const {tabId} = useWorkspaceTabActivity();
  useWorkspaceTabDirty(tabId || "customers", dirty);
  useErpDirtyGuard(dirty);
  const blocker = useWorkspaceTabBlocker(dirty);
  const parseMutation = useMutation({mutationFn: () => crmApi.parseQuickCapture(rawText.trim(), sourceType), onSuccess: (result) => { setParsed(result); setMatchedCustomerId(result.customerCandidates[0]?.customerId || ""); setError(""); notify.success("客户线索已解析"); }});
  const confirmMutation = useMutation({mutationFn: (input: QuickCaptureConfirmInput) => crmApi.confirmQuickCapture(input), onSuccess: async () => { blocker.markSaved(); setSuccess("客户线索已保存，客户档案、跟进任务和时间线已同步。"); notify.success("客户线索已保存"); await onSuccess(); }});
  const submitParse = (event: FormEvent) => { event.preventDefault(); if (parsed) return confirm(); setError(""); if (!rawText.trim()) return setError("请粘贴聊天记录或填写客户线索"); parseMutation.mutate(); };
  const confirm = () => {
    if (!parsed) return;
    if (!parsed.fields.customerName) return setError("解析结果缺少客户名称，请补充原文后重新解析");
    const matchAction = matchedCustomerId ? "link_existing" : "create_new";
    confirmMutation.mutate({parseId: parsed.parseId, rawText: parsed.rawText, sourceType: parsed.sourceType, fields: parsed.fields, confidence: parsed.confidence, missingFields: parsed.missingFields, conflicts: parsed.conflicts, matchAction, matchedCustomerId: matchAction === "link_existing" ? matchedCustomerId : undefined, idempotencyKey: createIdempotencyKey()});
  };
  return <ErpCrmPageFrame className="max-w-[1450px]">
    <ErpPageHeader density="default" title="新增客户线索" subtitle="粘贴一句话或聊天记录，由现有 CRM 规则解析并在确认后写入客户、跟进和时间线。" actions={<Link to="/crm" className="inline-flex h-9 items-center gap-2 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-white px-3 text-xs font-semibold"><Link2 className="h-4 w-4" />返回客户 CRM</Link>} />
    <ErpPageContent className="space-y-[var(--erp-page-gap)]">
    {success && <Card className="border-[var(--erp-color-border-strong)] bg-[var(--erp-color-success-soft)]"><CardContent className="flex items-center gap-2 p-4 text-sm font-semibold text-[var(--erp-color-success)]"><Check className="h-4 w-4" />{success}</CardContent></Card>}
    {error && <Card className="border-[var(--erp-color-border-strong)] bg-[var(--erp-color-danger-soft)]"><CardContent className="p-4 text-sm text-[var(--erp-color-danger)]">{error}</CardContent></Card>}
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <form className="min-w-0 space-y-5" onSubmit={submitParse}>
        <ErpFormSection title="一句话录入" description="支持客户姓名、电话、微信、需求型号、预算、意向和跟进时间；确认前不会写入 CRM."><div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
          <label className="text-sm font-semibold">输入来源<Select className="mt-2" value={sourceType} options={sourceOptions} onValueChange={(value) => setSourceType(value as QuickCaptureSourceType)} aria-label="输入来源" /></label>
          <label className="text-sm font-semibold">线索内容<Textarea className="mt-2 min-h-44" value={rawText} onChange={(event) => setRawText(event.target.value)} placeholder="例如：王总微信要一张 4090，预算 15000，周五到店看货，电话 13800000000" required /></label>
        </div><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-[var(--erp-color-text-muted)]">解析服务由现有 FastAPI 提供，失败时不会创建半成品客户。</span><Button type="submit" variant="primary" disabled={parseMutation.isPending}>{parseMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" />解析中…</> : <><Sparkles className="h-4 w-4" />解析线索</>}</Button></div></ErpFormSection>
        {parsed && <ErpFormSection title="解析预览" description={<span className="flex items-center gap-2">规则来源：{parsed.source === "ai" ? "AI" : "规则引擎"}<ErpStatusBadge label={`置信度 ${Math.round(parsed.confidence * 100)}%`} tone={parsed.confidence >= 0.8 ? "success" : "warning"} /></span>}><div className="grid gap-3 sm:grid-cols-2">{previewField("客户名称", parsed.fields.customerName)}{previewField("联系方式", parsed.fields.phone || parsed.fields.wechat || parsed.fields.qq)}{previewField("意向", parsed.fields.intentType)}{previewField("商品", parsed.fields.productName || parsed.fields.productModel)}{previewField("预算", parsed.fields.expectedPrice ? `¥${parsed.fields.expectedPrice}` : undefined)}{previewField("跟进时间", parsed.fields.followUpTime)}{previewField("阶段", parsed.fields.stage)}{previewField("优先级", parsed.fields.priority)}</div>{parsed.missingFields.length > 0 && <p className="mt-4 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-warning-soft)] px-3 py-2 text-xs text-[var(--erp-color-warning)]">待补充：{parsed.missingFields.join("、")}</p>}{parsed.conflicts.length > 0 && <p className="mt-3 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] px-3 py-2 text-xs text-[var(--erp-color-danger)]">存在字段冲突，请核对原文：{parsed.conflicts.map((item) => item.message).join("；")}</p>}</ErpFormSection>}
        <ErpSubmitBar dirty={dirty} canSubmit={Boolean(parsed?.fields.customerName)} blockedReason={parsed ? "解析结果缺少客户名称" : "请先解析客户线索"} submitting={confirmMutation.isPending} onCancel={() => void navigate({to: "/crm"})} submitLabel="确认保存" />
      </form>
      <aside className="min-w-0 space-y-5">
        <Card><CardContent className="p-5"><div className="flex items-center gap-2"><MessageSquareText className="h-5 w-5 text-[var(--erp-color-primary)]" /><h2 className="font-semibold">确认规则</h2></div><ul className="mt-4 space-y-3 text-sm text-[var(--erp-color-text-secondary)]"><li>• 解析阶段只生成预览，不修改数据库。</li><li>• 确认阶段由后端复用原客户等级规则，核心客户仍强制 S 级。</li><li>• 联系方式命中已有档案时，必须关联已有客户。</li><li>• 幂等键避免重复点击创建两条线索。</li></ul></CardContent></Card>
        {parsed && <Card><CardContent className="p-5"><div className="flex items-center gap-2"><UserPlus className="h-5 w-5 text-[var(--erp-color-primary)]" /><h2 className="font-semibold">客户归属</h2></div><div className="mt-4 space-y-3"><label className="block text-sm font-semibold">关联已有客户（可选）<Select searchable searchPlaceholder="搜索客户姓名或联系方式" emptyText="没有找到匹配的客户" className="mt-2" value={matchedCustomerId} options={[{value: "", label: "创建新客户"}, ...parsed.customerCandidates.map((candidate) => ({value: candidate.customerId, label: `${candidate.name} · ${candidate.contact || "无联系方式"}`}))]} onValueChange={setMatchedCustomerId} placeholder="创建新客户" aria-label="关联已有客户" /></label><Button className="w-full" variant="primary" disabled={confirmMutation.isPending} onClick={confirm}>{confirmMutation.isPending ? "保存中…" : "确认保存线索"}</Button></div></CardContent></Card>}
      </aside>
    </div>
    <ErpUnsavedChangesDialog open={blocker.status === "blocked"} onStay={() => blocker.reset?.()} onLeave={() => blocker.proceed?.()} />
    </ErpPageContent>
  </ErpCrmPageFrame>;
}

function previewField(label: string, value: string | number | undefined) { return <div className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-3"><p className="text-xs text-[var(--erp-color-text-muted)]">{label}</p><p className="mt-1 text-sm font-semibold text-[var(--erp-color-text)]">{value || "未识别"}</p></div>; }
function createIdempotencyKey() { return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `lead-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function LeadState({title, description, icon}: {title: string; description?: string; icon: ReactNode}) { return <Card><CardContent className="flex min-h-56 flex-col items-center justify-center gap-3 p-8 text-center"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--erp-color-info-soft)] text-[var(--erp-color-primary)]">{icon}</span><h1 className="text-lg font-semibold">{title}</h1>{description && <p className="max-w-md text-sm text-[var(--erp-color-text-secondary)]">{description}</p>}</CardContent></Card>; }
