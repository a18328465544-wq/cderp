import {Check, ClipboardPaste, AlertTriangle, XCircle} from "lucide-react";
import {useMemo, useState} from "react";
import {Button, Input, Select, Textarea} from "@/src/components/ui";
import {ErpAmountInput, ErpDetailDrawer, ErpEmptyState, ErpPageError, ErpStatusBadge} from "@/src/components/common";
import {productDisplayName} from "@/src/lib/productName";
import type {PurchaseLineFormValue, PurchaseProductOption} from "@/src/types/purchase";
import {
  parsePurchasePaste,
  PURCHASE_PASTE_MAX_ROWS,
  PURCHASE_PASTE_MAX_TEXT_LENGTH,
  revalidatePurchasePasteRows,
  selectPurchasePasteProduct,
  updatePurchasePasteRow,
  type PurchasePasteOptions,
  type PurchasePasteResult,
  type PurchasePasteRow,
  type PurchasePasteRowStatus,
  type PurchasePasteEditableField,
} from "@/src/features/purchase/utils/parse-purchase-paste";

interface PurchasePasteDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: readonly PurchaseProductOption[];
  defaults: PurchaseLineFormValue;
  existingItems: readonly PurchaseLineFormValue[];
  canEnterCost: boolean;
  canEnterEstimatedSell: boolean;
  onConfirm: (rows: PurchaseLineFormValue[]) => void;
}

function resultWithRows(result: PurchasePasteResult, rows: PurchasePasteRow[]): PurchasePasteResult {
  return {
    ...result,
    parsedRows: rows,
    validRows: rows.filter((row) => row.status === "valid"),
    warningRows: rows.filter((row) => row.status === "warning"),
    invalidRows: rows.filter((row) => row.status === "invalid"),
    needsConfirmationRows: rows.filter((row) => row.status === "needs-confirmation"),
  };
}

function statusLabel(status: PurchasePasteRowStatus): string {
  if (status === "valid") return "可加入";
  if (status === "warning") return "需确认";
  if (status === "needs-confirmation") return "需选商品";
  return "无法加入";
}

function statusTone(status: PurchasePasteRowStatus): "neutral" | "info" | "success" | "warning" | "danger" {
  if (status === "valid") return "success";
  if (status === "warning") return "warning";
  if (status === "needs-confirmation") return "info";
  return "danger";
}

function eligible(row: PurchasePasteRow): boolean {
  return row.status === "valid" || row.status === "warning";
}

function rowOptions(products: readonly PurchaseProductOption[]) {
  return products.map((product) => ({value: product.id, label: productDisplayName(product)}));
}

export function PurchasePasteDrawer({open, onOpenChange, products, defaults, existingItems, canEnterCost, canEnterEstimatedSell, onConfirm}: PurchasePasteDrawerProps) {
  const [rawText, setRawText] = useState("");
  const [result, setResult] = useState<PurchasePasteResult | null>(null);
  const [includedIds, setIncludedIds] = useState<Set<string>>(new Set());
  const options = useMemo<PurchasePasteOptions>(() => ({defaults, products, existingItems, canEnterCost, canEnterEstimatedSell, maxTextLength: PURCHASE_PASTE_MAX_TEXT_LENGTH, maxRows: PURCHASE_PASTE_MAX_ROWS}), [canEnterCost, canEnterEstimatedSell, defaults, existingItems, products]);
  const productOptions = useMemo(() => rowOptions(products), [products]);

  const parse = () => {
    const next = parsePurchasePaste(rawText, options);
    setResult(next);
    setIncludedIds(new Set(next.parsedRows.filter(eligible).map((row) => row.id)));
  };

  const updateRows = (rows: PurchasePasteRow[]) => {
    const nextRows = revalidatePurchasePasteRows(rows, options);
    setResult((current) => current ? resultWithRows(current, nextRows) : current);
    setIncludedIds((current) => {
      const next = new Set<string>();
      nextRows.forEach((row) => { if (eligible(row) && (current.has(row.id) || !current.size)) next.add(row.id); });
      return next;
    });
  };

  const updateField = (row: PurchasePasteRow, field: PurchasePasteEditableField, value: PurchaseLineFormValue[PurchasePasteEditableField]) => {
    updateRows((result?.parsedRows || []).map((item) => item.id === row.id ? updatePurchasePasteRow(item, field, value, options) : item));
  };

  const chooseProduct = (row: PurchasePasteRow, productId: string) => {
    updateRows((result?.parsedRows || []).map((item) => item.id === row.id ? selectPurchasePasteProduct(item, productId, options) : item));
  };

  const confirm = () => {
    if (!result) return;
    const refreshedRows = revalidatePurchasePasteRows(result.parsedRows, options);
    setResult(resultWithRows(result, refreshedRows));
    const rowsToAdd = refreshedRows.filter((row) => includedIds.has(row.id) && eligible(row) && !row.errors.length);
    if (!rowsToAdd.length) return;
    onConfirm(rowsToAdd.map((row) => ({...row.line, tempId: undefined})));
    const addedIds = new Set(rowsToAdd.map((row) => row.id));
    const remaining = refreshedRows.filter((row) => !addedIds.has(row.id));
    setResult(resultWithRows(result, remaining));
    setIncludedIds(new Set(remaining.filter(eligible).map((row) => row.id)));
  };

  const toggleIncluded = (row: PurchasePasteRow) => {
    setIncludedIds((current) => {
      const next = new Set(current);
      if (next.has(row.id)) next.delete(row.id); else if (eligible(row)) next.add(row.id);
      return next;
    });
  };

  const canConfirm = Boolean(result?.parsedRows.some((row) => includedIds.has(row.id) && eligible(row) && !row.errors.length));
  const description = "支持 Excel Tab 或不含千位逗号的逗号格式；先预览和修正，再加入当前采购表单。";

  return <ErpDetailDrawer open={open} onOpenChange={onOpenChange} title={<span className="flex items-center gap-2"><ClipboardPaste className="h-5 w-5 text-[var(--erp-color-primary)]" />批量粘贴采购明细</span>} description={description} footer={<div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-[var(--erp-color-text-muted)]">加入后不会立即提交采购单，也不会生成 SN 或库存 ID。</p><div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>关闭</Button><Button type="button" variant="primary" onClick={confirm} disabled={!canConfirm}><Check className="h-4 w-4" />确认加入{canConfirm ? `（${includedIds.size} 行）` : ""}</Button></div></div>}>
    <div className="space-y-4">
      <div className="rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)] p-3 text-xs leading-5 text-[var(--erp-color-text-secondary)]">
        <p className="font-semibold text-[var(--erp-color-text)]">粘贴格式</p>
        <p>无表头固定格式：商品名称、采购价、预计售价、备注。推荐使用带表头的 Excel Tab，可额外填写品牌、型号、版本、显存和数量。</p>
        <p className="mt-1 text-[var(--erp-color-primary)]">SN、成色、质保、库位和库存状态统一在检测质检阶段录入，批量粘贴不处理这些字段。</p>
        <p className="mt-1">内容上限 {PURCHASE_PASTE_MAX_TEXT_LENGTH.toLocaleString()} 个字符、{PURCHASE_PASTE_MAX_ROWS} 行；逗号格式的金额请填写 18000，不要写 18,000。</p>
      </div>
      <label className="block text-sm font-semibold">采购明细文本<Textarea className="mt-2 min-h-40" value={rawText} onChange={(event) => setRawText(event.target.value)} placeholder={"商品名称\t采购价\t预计售价\t备注\n华硕 RTX 4090\t18000\t19500\t包装完好"} aria-label="采购明细粘贴文本" /></label>
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-[var(--erp-color-text-muted)]">已输入 {rawText.length.toLocaleString()} / {PURCHASE_PASTE_MAX_TEXT_LENGTH.toLocaleString()} 字符</p><Button type="button" variant="primary" onClick={parse}>解析并预览</Button></div>
      {result?.errors.length ? <ErpPageError title="无法解析这次粘贴" description={result.errors.join(" ")} /> : null}
      {result && !result.errors.length ? <div className="flex flex-wrap gap-2"><ErpStatusBadge label={`可加入 ${result.validRows.length} 行`} tone="success" /><ErpStatusBadge label={`需确认 ${result.warningRows.length} 行`} tone="warning" /><ErpStatusBadge label={`需选商品 ${result.needsConfirmationRows.length} 行`} tone="info" /><ErpStatusBadge label={`错误 ${result.invalidRows.length} 行`} tone="danger" /></div> : null}
      {result && !result.errors.length && !result.parsedRows.length ? <ErpEmptyState title="没有可预览的明细" description="请检查粘贴内容后重新解析。" /> : null}
      {result && !result.errors.length && result.parsedRows.length ? <div className="space-y-3">{result.parsedRows.map((row) => <PasteRowCard key={row.id} row={row} products={productOptions} canEnterCost={canEnterCost} canEnterEstimatedSell={canEnterEstimatedSell} included={includedIds.has(row.id)} onToggle={() => toggleIncluded(row)} onChooseProduct={(value) => chooseProduct(row, value)} onUpdate={(field, value) => updateField(row, field, value)} />)}</div> : null}
    </div>
  </ErpDetailDrawer>;
}

function PasteRowCard({row, products, canEnterCost, canEnterEstimatedSell, included, onToggle, onChooseProduct, onUpdate}: {row: PurchasePasteRow; products: ReturnType<typeof rowOptions>; canEnterCost: boolean; canEnterEstimatedSell: boolean; included: boolean; onToggle: () => void; onChooseProduct: (value: string) => void; onUpdate: <K extends PurchasePasteEditableField>(field: K, value: PurchaseLineFormValue[K]) => void}) {
  return <article className="rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-3 shadow-[var(--erp-shadow-card)]">
    <div className="flex items-start gap-3"><input type="checkbox" checked={included} onChange={onToggle} disabled={!eligible(row)} className="mt-1 accent-[var(--erp-color-primary)]" aria-label={`选择第 ${row.lineNumber} 行`} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><ErpStatusBadge label={statusLabel(row.status)} tone={statusTone(row.status)} /><span className="text-xs text-[var(--erp-color-text-muted)]">第 {row.lineNumber} 行</span></div><p className="mt-1 break-all text-xs text-[var(--erp-color-text-secondary)]">原文：{row.rawText}</p></div>{row.status === "invalid" ? <XCircle className="h-4 w-4 shrink-0 text-[var(--erp-color-danger)]" /> : row.status === "needs-confirmation" ? <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--erp-color-warning)]" /> : null}</div>
    <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold sm:col-span-2">商品模板<Select searchable searchPlaceholder="搜索现有商品模板" emptyText="没有找到匹配的商品模板" className="mt-1" value={row.line.productId} options={products} onValueChange={onChooseProduct} placeholder="请选择现有商品模板" aria-label={`第 ${row.lineNumber} 行商品模板`} /></label><label className="text-xs font-semibold">数量<Input className="mt-1" type="number" min={1} step={1} value={row.line.quantity} onChange={(event) => onUpdate("quantity", Math.max(0, Number(event.target.value) || 0))} aria-label={`第 ${row.lineNumber} 行数量`} /></label><label className="text-xs font-semibold">采购价{canEnterCost ? <ErpAmountInput className="mt-1" value={row.line.buyPrice} onValueChange={(detail) => onUpdate("buyPrice", detail.floatValue || 0)} aria-label={`第 ${row.lineNumber} 行采购价`} /> : <span className="mt-1 flex h-10 items-center rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] px-3 text-xs font-normal text-[var(--erp-color-text-muted)]">当前表单不可录入</span>}</label><label className="text-xs font-semibold">预计售价{canEnterEstimatedSell ? <ErpAmountInput className="mt-1" value={row.line.estSellPrice} onValueChange={(detail) => onUpdate("estSellPrice", detail.floatValue || 0)} aria-label={`第 ${row.lineNumber} 行预计售价`} /> : <span className="mt-1 flex h-10 items-center rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] px-3 text-xs font-normal text-[var(--erp-color-text-muted)]">当前表单不可录入</span>}</label><label className="text-xs font-semibold sm:col-span-2">行备注<Textarea className="mt-1 min-h-16 text-xs" value={row.line.remarks} onChange={(event) => onUpdate("remarks", event.target.value)} aria-label={`第 ${row.lineNumber} 行备注`} /></label></div>
    {row.candidates.length > 1 ? <p className="mt-2 text-xs text-[var(--erp-color-warning)]">发现多个严格匹配候选，请从商品模板中手动选择。</p> : null}
    {row.errors.length ? <div className="mt-2 space-y-1 text-xs text-[var(--erp-color-danger)]">{row.errors.map((error) => <p key={error}>{error}</p>)}</div> : null}
    {row.warnings.length ? <div className="mt-2 space-y-1 text-xs text-[var(--erp-color-warning)]">{row.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div> : null}
  </article>;
}
