import {zodResolver} from "@hookform/resolvers/zod";
import {useEffect, useMemo, useState} from "react";
import {useForm} from "react-hook-form";
import {Camera, CircleDollarSign, Combine, PackageOpen, Unplug} from "lucide-react";
import {Button, Input, Select, Textarea} from "@/src/components/ui";
import {DashboardSection, ErpBarcodeScannerDialog, ErpFormSection, ErpStatusBadge, ErpSubmitBar, ErpUnsavedChangesDialog, useErpDirtyGuard, useErpUnsavedChangesGuard} from "@/src/components/common";
import {formatCurrency} from "@/src/lib/format";
import {useWorkspaceTabBlocker, useWorkspaceTabDirty, useWorkspaceTabDraft} from "@/src/hooks/useWorkspaceTabRuntime";
import {productCategoryValues, type ProductCategory} from "@/src/types/core";
import type {AssemblyFormValues, AssemblyReferenceData} from "@/src/types/assembly";
import {assemblyFormSchema} from "../assembly.schema";
import {createAssemblyFormDefaults} from "../assembly.defaults";
import {AssemblyInventoryPicker} from "./AssemblyInventoryPicker";
import {AssemblyPartEditor} from "./AssemblyPartEditor";

const categories = productCategoryValues;

export function AssemblyOperationForm({handler, references, showCost, showProfit, submitting, error, onSubmit}: {handler: string; references: AssemblyReferenceData; showCost: boolean; showProfit: boolean; submitting: boolean; error?: string; onSubmit: (values: AssemblyFormValues, reset: () => void) => void}) {
  const {draft: restoredDraft, saveDraft, discardDraft} = useWorkspaceTabDraft<{values: AssemblyFormValues}>("assembly");
  const [restoredDraftActive, setRestoredDraftActive] = useState(Boolean(restoredDraft));
  const form = useForm<AssemblyFormValues>({resolver: zodResolver(assemblyFormSchema), defaultValues: restoredDraft?.values || createAssemblyFormDefaults(handler), mode: "onBlur"});
  const mode = form.watch("type");
  const beforeSn = form.watch("beforeSn");
  const afterParts = form.watch("afterParts");
  const beforeParts = form.watch("beforeParts");
  const formValues = form.watch();
  const [scanTarget, setScanTarget] = useState<{kind: "beforeSn" | "afterSn" | "beforeParts" | "afterParts"; index?: number} | null>(null);
  const isDirty = form.formState.isDirty || restoredDraftActive;
  useEffect(() => {
    const persist = () => {
      if (!form.formState.isDirty && !restoredDraftActive) {
        discardDraft();
        return;
      }
      saveDraft({values: form.getValues()});
    };
    persist();
    const subscription = form.watch(persist);
    return () => subscription.unsubscribe();
  }, [discardDraft, form, restoredDraftActive, saveDraft]);
  useErpDirtyGuard(isDirty);
  useWorkspaceTabDirty("assembly", isDirty);
  const blocker = useWorkspaceTabBlocker(isDirty);
  const unsavedChanges = useErpUnsavedChangesGuard(isDirty);
  useEffect(() => {form.setValue("handler", handler);}, [form, handler]);
  const source = references.inventory.find((item) => item.sn.toLowerCase() === beforeSn.trim().toLowerCase() || item.id.toLowerCase() === beforeSn.trim().toLowerCase());
  const activeParts = mode === "拆卸" ? afterParts : beforeParts;
  const totals = useMemo(() => ({cost: activeParts.reduce((sum, part) => sum + part.costPrice, 0), sell: activeParts.reduce((sum, part) => sum + part.estSellPrice, 0)}), [activeParts]);
  const resetForm = () => {
    blocker.markSaved();
    unsavedChanges.markSaved();
    discardDraft();
    setRestoredDraftActive(false);
    form.reset(createAssemblyFormDefaults(handler));
  };
  const applyScan = (code: string) => {
    if (!scanTarget) return;
    if (scanTarget.kind === "beforeSn") form.setValue("beforeSn", code, {shouldDirty: true, shouldValidate: true});
    else if (scanTarget.kind === "afterSn") form.setValue("afterSn", code, {shouldDirty: true, shouldValidate: true});
    else if (scanTarget.index !== undefined) form.setValue(`${scanTarget.kind}.${scanTarget.index}.sn`, code, {shouldDirty: true, shouldValidate: true});
  };

  return <form className="space-y-4" onSubmit={form.handleSubmit((values) => onSubmit(values, resetForm))}>
    <ErpFormSection title="操作类型" description="拆卸会把一件库存拆成多个新库存；组装会把多个来源配件合成一件新库存。最终状态由服务端原子处理。"><div className="grid gap-3 sm:grid-cols-2"><Button type="button" size="lg" variant={mode === "拆卸" ? "primary" : "secondary"} className="h-auto min-h-24 flex-col items-stretch justify-start rounded-[var(--erp-radius-lg)] p-4 text-left" aria-pressed={mode === "拆卸"} onClick={() => form.setValue("type", "拆卸", {shouldDirty: true})}><span className="flex items-center gap-2 font-semibold"><Unplug className="h-4 w-4 text-[var(--erp-color-warning)]" />拆卸库存</span><span className="mt-1 block text-xs font-normal text-[var(--erp-color-text-secondary)]">原库存标记已拆卸，新配件进入库存</span></Button><Button type="button" size="lg" variant={mode === "组装" ? "primary" : "secondary"} className="h-auto min-h-24 flex-col items-stretch justify-start rounded-[var(--erp-radius-lg)] p-4 text-left" aria-pressed={mode === "组装"} onClick={() => form.setValue("type", "组装", {shouldDirty: true})}><span className="flex items-center gap-2 font-semibold"><Combine className="h-4 w-4 text-[var(--erp-color-primary)]" />组装成品</span><span className="mt-1 block text-xs font-normal text-[var(--erp-color-text-secondary)]">来源配件标记已组装，新成品进入库存</span></Button></div></ErpFormSection>
    {mode === "拆卸" ? <ErpFormSection title="拆卸来源" description="可按库存编号、商品名称或 SN 检索；服务端会再次校验真实库存。"><div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]"><AssemblyInventoryPicker value={beforeSn} options={references.inventory} label="选择拆卸来源库存" disabled={submitting} onClear={() => form.setValue("beforeSn", "", {shouldDirty: true, shouldValidate: true})} onSelect={(option) => form.setValue("beforeSn", option.sn, {shouldDirty: true, shouldValidate: true})} /><Button type="button" size="icon" variant="secondary" onClick={() => setScanTarget({kind: "beforeSn"})} aria-label="扫描拆卸前SN"><Camera className="h-4 w-4" /></Button></div>{source && <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-3 text-xs"><strong>{source.productName}</strong><span className="erp-data-number">{source.sn}</span><ErpStatusBadge label={source.status} tone="neutral" /><span>{source.warehouse || "未分配库位"}</span>{showCost && source.costPrice !== undefined && <span>原始成本 {formatCurrency(source.costPrice)}</span>}</div>}</ErpFormSection> : <ErpFormSection title="组装成品" description="组装后 SN 必须唯一；来源配件只允许选择已入库或已上架库存。"><div className="grid gap-3 md:grid-cols-3"><label className="text-sm font-semibold">成品名称<Input className="mt-2" {...form.register("afterProductName")} disabled={submitting} /></label><label className="text-sm font-semibold">成品分类<Select className="mt-2" value={form.watch("afterCategory")} options={categories.map((value) => ({value, label: value}))} onValueChange={(value) => form.setValue("afterCategory", value as ProductCategory, {shouldDirty: true})} disabled={submitting} /></label><label className="text-sm font-semibold">组装后 SN<div className="mt-2 flex gap-1"><Input {...form.register("afterSn")} className="erp-data-number" disabled={submitting} /><Button type="button" size="icon" variant="secondary" onClick={() => setScanTarget({kind: "afterSn"})}><Camera className="h-4 w-4" /></Button></div></label></div></ErpFormSection>}
    <ErpFormSection title={mode === "拆卸" ? "拆后配件" : "来源配件"} description={mode === "拆卸" ? "可关联商品模板并录入每个新配件的独立 SN；成本留空时由服务端按剩余金额分配。" : "每行必须对应真实可组装库存，不生成虚假 SN 或前端库存 ID。"}><AssemblyPartEditor kind={mode === "拆卸" ? "afterParts" : "beforeParts"} form={form} inventory={references.inventory} products={references.products} showCost={showCost} showProfit={showProfit} disabled={submitting} onScan={(kind, index) => setScanTarget({kind, index})} /></ErpFormSection>
    <ErpFormSection title="经办与备注"><div className="grid gap-3 md:grid-cols-[240px_minmax(0,1fr)]"><label className="text-sm font-semibold">经办人<Input className="mt-2" value={handler} disabled /></label><label className="text-sm font-semibold">操作备注<Textarea className="mt-2 min-h-20" {...form.register("remarks")} placeholder="记录拆装原因、测试说明或后续处理要求" disabled={submitting} /></label></div></ErpFormSection>
    <DashboardSection title="操作摘要"><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Summary icon={<PackageOpen className="h-4 w-4" />} label="配件数量" value={`${activeParts.length} 件`} /><Summary icon={<CircleDollarSign className="h-4 w-4" />} label="成本合计" value={showCost ? formatCurrency(totals.cost) : "无权限"} /><Summary icon={<CircleDollarSign className="h-4 w-4" />} label="预计价值" value={showProfit ? formatCurrency(totals.sell) : "无权限"} /><Summary icon={<Combine className="h-4 w-4" />} label="预计差额" value={showCost && showProfit ? formatCurrency(totals.sell - totals.cost) : "无权限"} /></div></DashboardSection>
    {error && <p role="alert" className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] p-3 text-sm text-[var(--erp-color-danger)]">{error}</p>}
    <ErpSubmitBar dirty={isDirty} canSubmit={assemblyFormSchema.safeParse(formValues).success} blockedReason={`请完善${mode}来源、SN 和配件信息`} submitting={submitting} submitLabel={`保存${mode}单`} onCancel={() => unsavedChanges.requestLeave(resetForm)} />
    <ErpBarcodeScannerDialog open={Boolean(scanTarget)} onOpenChange={(open) => {if (!open) setScanTarget(null);}} onDetected={applyScan} title="扫描库存 SN" description="识别库存条码或二维码，只回填当前拆装字段。" />
    <ErpUnsavedChangesDialog open={blocker.status === "blocked"} onStay={() => blocker.reset?.()} onLeave={() => blocker.proceed?.()} />
    {unsavedChanges.dialog}
  </form>;
}

function Summary({icon, label, value}: {icon: React.ReactNode; label: string; value: string}) {return <div className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-3"><span className="flex items-center gap-2 text-xs text-[var(--erp-color-text-secondary)]">{icon}{label}</span><strong className="mt-2 block erp-data-number">{value}</strong></div>;}
