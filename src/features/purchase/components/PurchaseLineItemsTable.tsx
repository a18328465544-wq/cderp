import {ErpMobileOrderLine} from "@/src/components/common/ErpMobileOrderLine";
import {ErpQuantityStepper} from "@/src/components/common/ErpQuantityStepper";
import {Plus, Trash2} from "lucide-react";
import {Controller, type Control, type FieldArrayWithId} from "react-hook-form";
import {useMemo, useState} from "react";
import {useErpPhone} from "@/src/hooks/useErpViewport";
import {Button, Card, CardContent, Input, Select} from "@/src/components/ui";
import {ErpAmountInput, ErpEmptyState} from "@/src/components/common";
import {formatCurrency} from "@/src/lib/format";
import {productDisplayName} from "@/src/lib/productName";
import type {PurchaseFormValues, PurchaseLineFormValue, PurchaseProductOption} from "@/src/types/purchase";
import {mergeSelectedPurchaseProducts} from "./purchaseProductOptions";
import {productSearchMatches} from "@/src/utils/productSearch";
import {focusNextLineItemControl} from "@/src/lib/lineItemFocus";
import {editableQuantityValue, quantityFromInput} from "@/src/lib/lineItemQuantity";
import {purchaseQuantity, purchaseQuantityError} from "@/src/utils/purchaseQuantity";
import {PURCHASE_MAX_PHYSICAL_ITEMS} from "@/src/types/purchase";
import {isPurchaseLineFilled} from "@/src/lib/purchase";

export function PurchaseLineItemsTable({control, fields, items, products, canEnterCost, showProfit, canCreateProduct, disabled, productsLoading, onProductKeywordChange, onProductSelect, onProductClear, onAdd, onRemove, onOpenCreateProduct}: {
  control: Control<PurchaseFormValues>;
  fields: FieldArrayWithId<PurchaseFormValues, "items", "id">[];
  items: PurchaseLineFormValue[];
  products: PurchaseProductOption[];
  /** Current purchase price entry follows purchase_add/form semantics, not historical showCost. */
  canEnterCost: boolean;
  showProfit: boolean;
  canCreateProduct?: boolean;
  disabled?: boolean;
  productsLoading?: boolean;
  onProductKeywordChange?: (keyword: string) => void;
  onProductSelect: (index: number, productId: string, product?: PurchaseProductOption) => void;
  onProductClear: (index: number) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onOpenCreateProduct?: (index: number, initialName?: string) => void;
}) {
  const [recentProductIds, setRecentProductIds] = useState<string[]>([]);
  const phone = useErpPhone();
  const [editingId, setEditingId] = useState(fields[0]?.productId ? "__none__" : fields[0]?.id || "");
  const activeId = editingId === "__none__" ? undefined : fields.some((field) => field.id === editingId) ? editingId : fields.at(-1)?.id;
  const addMobileLine = () => {
    const spare = fields.find((field, index) => field.id !== activeId && !isPurchaseLineFilled(items[index] || field));
    if (spare) setEditingId(spare.id);
    else {onAdd(); setEditingId("__new__");}
  };
  const productsWithSelected = useMemo(() => mergeSelectedPurchaseProducts(products, items), [items, products]);
  const orderedProducts = useMemo(() => [...productsWithSelected].sort((left, right) => {
    const leftIndex = recentProductIds.indexOf(left.id);
    const rightIndex = recentProductIds.indexOf(right.id);
    if (leftIndex === -1 && rightIndex === -1) return 0;
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  }), [productsWithSelected, recentProductIds]);
  const productOptions = useMemo(() => orderedProducts.map((product) => { const label = productDisplayName(product); return {value: product.id, label, labelText: label, description: phone ? `${product.category} · ${product.brand} ${product.model}${canEnterCost && product.refBuyPrice ? ` · 参考采购 ${formatCurrency(product.refBuyPrice)}` : ""}` : undefined, searchText: `${product.name} ${product.brand} ${product.model} ${product.version} ${product.vram}`}; }), [orderedProducts, phone, canEnterCost]);
  const productById = useMemo(() => new Map(productsWithSelected.map((product) => [product.id, product])), [productsWithSelected]);
  const searchFilter = (option: {value: string}, query: string) => {const product = productById.get(option.value); return Boolean(product && productSearchMatches(product, query));};
  const hasProducts = productsWithSelected.length > 0;
  const handleProductSelect = (index: number, productId: string) => {
    setRecentProductIds((current) => [productId, ...current.filter((id) => id !== productId)].slice(0, 6));
    onProductSelect(index, productId, productsWithSelected.find((product) => product.id === productId));
  };
  const [phonePickerIndex, setPhonePickerIndex] = useState<number | null>(null);
  const [phonePickerRequest, setPhonePickerRequest] = useState(0);
  const openPhonePicker = (index: number) => {setPhonePickerIndex(index); setPhonePickerRequest((request) => request + 1);};
  const addPhoneProduct = () => {
    const spare = fields.findIndex((field, index) => !isPurchaseLineFilled(items[index] || field));
    if (spare >= 0) openPhonePicker(spare);
    else {const index = fields.length; onAdd(); openPhonePicker(index);}
  };
  const phonePickerField = phonePickerIndex !== null ? fields[phonePickerIndex] : undefined;
  if (phone) return <Card data-erp-component="transaction-line-items" className="erp-mobile-order-items"><CardContent>
    <div className="erp-mobile-order-list-heading"><h2>商品清单</h2>{items.some(isPurchaseLineFilled) && <Button type="button" variant="ghost" disabled={disabled} onClick={addPhoneProduct}><Plus className="h-4 w-4" />添加商品</Button>}</div>
    <div data-erp-region="line-items-cards">{fields.map((field, index) => {
      const item = items[index] || field;
      if (!isPurchaseLineFilled(item)) return null;
      return <ErpMobileOrderLine key={field.id} label={`第 ${index + 1} 行商品`} name={item.productName || "请选择商品"} metadata={[item.category, item.vram || item.model].filter(Boolean).join(" · ")} disabled={disabled} total={canEnterCost ? formatCurrency(item.buyPrice * item.quantity) : "—"}
        price={canEnterCost ? <Controller control={control} name={`items.${index}.buyPrice`} render={({field: input}) => <ErpAmountInput value={input.value || ""} placeholder="输入采购价" onBlur={input.onBlur} onValueChange={(value) => input.onChange(value.floatValue || 0)} disabled={disabled} aria-label={`第 ${index + 1} 行进货价`} />} /> : <span>当前不可录入</span>}
        quantity={<Controller control={control} name={`items.${index}.quantity`} render={({field: input}) => <ErpQuantityStepper value={input.value} onChange={input.onChange} max={PURCHASE_MAX_PHYSICAL_ITEMS} disabled={disabled} label={`第 ${index + 1} 行数量`} />} />}
        onReplace={() => openPhonePicker(index)} onRemove={() => onRemove(index)}
        extra={<div className="space-y-2.5">
          {showProfit && <label className="block text-xs font-medium text-[var(--erp-color-text-secondary)]">预估售价<Controller control={control} name={`items.${index}.estSellPrice`} render={({field: input}) => <ErpAmountInput className="mt-1" value={input.value} onBlur={input.onBlur} onValueChange={(value) => input.onChange(value.floatValue || 0)} disabled={disabled} aria-label={`第 ${index + 1} 行预估售价`} />} /></label>}
          <label className="block text-xs font-medium text-[var(--erp-color-text-secondary)]">明细备注<Controller control={control} name={`items.${index}.remarks`} render={({field: input}) => <Input {...input} className="mt-1 text-xs" disabled={disabled} placeholder="包装、来源或谈价说明" aria-label={`第 ${index + 1} 行备注`} />} /></label>
        </div>}
      />;
    })}{!items.some(isPurchaseLineFilled) && <div className="erp-mobile-order-empty"><p>添加本次采购的商品</p><span>只录采购价和数量，SN 等信息在质检时确认</span><Button type="button" variant="primary" disabled={disabled} onClick={addPhoneProduct}><Plus className="h-4 w-4" />添加商品</Button></div>}</div>
    {phonePickerIndex !== null && phonePickerField && <Controller control={control} name={`items.${phonePickerIndex}.productId`} render={({field: input}) => <Select searchable phoneDialogTitle="选择商品" phoneOpenRequest={phonePickerRequest} hidePhoneTrigger onPhoneOpenChange={(open) => {if (!open) setPhonePickerIndex(null);}}
      value={input.value} options={productOptions} searchFilter={searchFilter} searchLoading={productsLoading} onSearchValueChange={onProductKeywordChange} aria-label={`第 ${phonePickerIndex + 1} 行商品`} searchPlaceholder="搜索商品名称、型号或品牌" emptyText="没有找到匹配的商品规格" disabled={disabled}
      onValueChange={(value) => handleProductSelect(phonePickerIndex, value)} onClear={() => onProductClear(phonePickerIndex)} quickCreateAction={canCreateProduct && onOpenCreateProduct ? {label: "新建商品", onClick: (query) => onOpenCreateProduct(phonePickerIndex, query), disabled} : undefined} />} />}
  </CardContent></Card>;
  return <Card data-erp-component="transaction-line-items" className="erp-transaction-line-items"><CardContent>
    {!hasProducts ? <div className="rounded-[var(--erp-radius-md)] border border-dashed border-[var(--erp-color-warning)] bg-[var(--erp-color-warning-soft)] px-4 py-3 text-sm text-[var(--erp-color-warning)]">当前没有可用商品规格，或当前账号没有商品读取权限。请先建立商品模板并确认 products 权限。</div> : null}
    <div data-erp-region="line-items-table" className={`${!hasProducts ? "mt-3 " : ""}erp-transaction-line-items-table overflow-hidden rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)]`}>
      <div className="erp-scrollbar max-h-[420px] overflow-auto">
      <table className="w-full min-w-[1076px] table-fixed border-collapse text-sm">
        <colgroup><col className="w-[300px]" /><col className="w-[132px]" /><col className="w-[132px]" /><col className="w-[96px]" /><col className="w-[112px]" /><col className="w-[220px]" /><col className="w-[84px]" /></colgroup>
        <thead className="sticky top-0 erp-refresh-indicator-layer bg-[var(--erp-color-surface-muted)]"><tr className="text-xs text-[var(--erp-color-text-secondary)]"><th className="sticky left-0 erp-table-sticky-edge-layer border-b border-r border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)] px-3 py-3 text-center font-semibold">商品型号</th><th className="border-b border-r border-[var(--erp-color-border)] px-3 py-3 text-center font-semibold">进货价(元)</th><th className="border-b border-r border-[var(--erp-color-border)] px-3 py-3 text-center font-semibold">预估售价(元)</th><th className="border-b border-r border-[var(--erp-color-border)] px-3 py-3 text-center font-semibold">数量</th><th className="border-b border-r border-[var(--erp-color-border)] px-3 py-3 text-center font-semibold">预计利润</th><th className="border-b border-r border-[var(--erp-color-border)] px-3 py-3 text-center font-semibold">备注</th><th className="sticky right-0 erp-table-sticky-edge-layer border-b border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)] px-3 py-3 text-center font-semibold">操作</th></tr></thead>
        <tbody>{fields.map((field, index) => {
          const item = items[index] || field;
          const filled = isPurchaseLineFilled(item);
          const missingProductIdentity = filled && (!item.productId || !item.productName.trim());
          const expectedProfit = (item.estSellPrice - item.buyPrice) * purchaseQuantity(item.quantity);
          return <tr key={field.id} className="group align-middle last:[&>td]:border-b-0 hover:bg-[var(--erp-color-surface-muted)]/60">
            <td className="sticky left-0 erp-content-sticky-layer border-b border-r border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-3 py-2 group-hover:bg-[var(--erp-color-surface-muted)]">
              <Controller control={control} name={`items.${index}.productId` as const} render={({field: input}) => <Select searchable searchPlaceholder="搜索商品…" emptyText="没有找到匹配的商品规格" className="min-w-0" value={input.value} options={productOptions} searchFilter={searchFilter} searchLoading={productsLoading} onSearchValueChange={onProductKeywordChange} onValueChange={(value) => { input.onChange(value); handleProductSelect(index, value); if (phone) setEditingId("__none__"); }} onClear={() => onProductClear(index)} quickCreateAction={canCreateProduct && onOpenCreateProduct ? {label: "新建商品", onClick: (searchText) => onOpenCreateProduct(index, searchText || item.productName), disabled} : undefined} disabled={disabled || (!hasProducts && !(canCreateProduct && onOpenCreateProduct))} placeholder={hasProducts ? "选择商品规格" : "搜索或新建商品"} aria-label={`第 ${index + 1} 行商品`} aria-invalid={missingProductIdentity} />} />
            </td>
            <td className="border-b border-r border-[var(--erp-color-border)] px-3 py-2">{canEnterCost ? <Controller control={control} name={`items.${index}.buyPrice` as const} render={({field: input}) => <ErpAmountInput value={input.value} onBlur={input.onBlur} onValueChange={(detail) => input.onChange(detail.floatValue || 0)} disabled={disabled} aria-label={`第 ${index + 1} 行进货价`} />} /> : <span className="flex h-10 items-center justify-center rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] px-2 text-xs text-[var(--erp-color-text-muted)]">不可录入</span>}</td>
            <td className="border-b border-r border-[var(--erp-color-border)] px-3 py-2">{showProfit ? <Controller control={control} name={`items.${index}.estSellPrice` as const} render={({field: input}) => <ErpAmountInput value={input.value} onBlur={input.onBlur} onValueChange={(detail) => input.onChange(detail.floatValue || 0)} disabled={disabled} aria-label={`第 ${index + 1} 行预估售价`} />} /> : <span className="flex h-10 items-center justify-center rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] px-2 text-xs text-[var(--erp-color-text-muted)]">—</span>}</td>
            <td className="border-b border-r border-[var(--erp-color-border)] px-3 py-2">
              <Controller control={control} name={`items.${index}.quantity` as const} render={({field: input}) => <Input {...input} value={editableQuantityValue(input.value)} type="number" inputMode="numeric" enterKeyHint="next" min={1} max={PURCHASE_MAX_PHYSICAL_ITEMS} step={1} className="text-center erp-data-number font-semibold" onChange={(event) => input.onChange(quantityFromInput(event.target.value))} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); focusNextLineItemControl(event.currentTarget, '[role="combobox"][aria-label$=" 行商品"]', index); } }} disabled={disabled} aria-invalid={filled && Boolean(purchaseQuantityError([{quantity: input.value}]))} aria-label={`第 ${index + 1} 行数量`} />} />
            </td>
            <td className="border-b border-r border-[var(--erp-color-border)] px-3 py-2 text-center"><span className={`whitespace-nowrap erp-data-number text-sm font-semibold ${expectedProfit < 0 ? "text-[var(--erp-color-danger)]" : expectedProfit > 0 ? "text-[var(--erp-color-success)]" : "text-[var(--erp-color-text)]"}`}>{canEnterCost && showProfit ? formatCurrency(expectedProfit) : "—"}</span></td>
            <td className="border-b border-r border-[var(--erp-color-border)] px-3 py-2"><Controller control={control} name={`items.${index}.remarks` as const} render={({field: input}) => <Input {...input} className="text-center text-xs" placeholder="商品来源、包装或谈价说明" disabled={disabled} aria-label={`第 ${index + 1} 行备注`} />} /></td>
            <td className="sticky right-0 erp-content-sticky-layer border-b border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-3 py-2 text-center group-hover:bg-[var(--erp-color-surface-muted)]"><Button type="button" variant="ghost" size="icon" aria-label={`删除第 ${index + 1} 行`} onClick={() => onRemove(index)} disabled={disabled || fields.length <= 1}><Trash2 className="h-4 w-4 text-[var(--erp-color-danger)]" /></Button></td>
          </tr>;
        })}</tbody>
      </table>
      </div>
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-t border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)]/40 px-3 py-2"><Button type="button" variant="secondary" size="sm" onClick={onAdd} disabled={disabled}><Plus className="h-4 w-4" />增加一行商品</Button><p className="text-xs text-[var(--erp-color-text-muted)]">提示：数量可录入同型号多张；显卡入库后在“检测质检”绑定 SN。</p></div>
    </div>
    <div data-erp-region="line-items-cards" className={`${!hasProducts ? "mt-3 " : ""}erp-transaction-line-items-cards space-y-3`}>
      {fields.map((field, index) => {
        const item = items[index] || field;
        const filled = isPurchaseLineFilled(item);
        const missingProductIdentity = filled && (!item.productId || !item.productName.trim());
        const expectedProfit = (item.estSellPrice - item.buyPrice) * purchaseQuantity(item.quantity);
        const productMeta = [item.brand, item.model, item.version, item.vram].filter(Boolean).join(" · ");
        return <article data-phone-order-row="true" data-phone-order-selected={filled} key={field.id} hidden={phone && field.id !== activeId && !filled || undefined} data-erp-component="transaction-line-item-card" aria-label={`第 ${index + 1} 行采购商品`} className="rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-3">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[var(--erp-color-text-muted)]">商品明细 {index + 1}</p>
              <p className="mt-1 break-words text-sm font-semibold text-[var(--erp-color-text)]" title={item.productName || undefined}>{item.productName || "待选择商品"}</p>
              {productMeta ? <p className="mt-1 break-words text-xs text-[var(--erp-color-text-muted)]">{productMeta}</p> : null}
            </div>
            <Button type="button" variant="ghost" size="iconTouch" aria-label={`删除第 ${index + 1} 行`} onClick={() => onRemove(index)} disabled={disabled || fields.length <= 1}>
              <Trash2 className="h-4 w-4 text-[var(--erp-color-danger)]" />
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">{phone && filled && <Controller control={control} name={`items.${index}.quantity`} render={({field: input}) => <ErpQuantityStepper value={input.value} onChange={input.onChange} max={PURCHASE_MAX_PHYSICAL_ITEMS} disabled={disabled} label={`第 ${index + 1} 行数量`} />} />}<span className="erp-data-number text-xs text-[var(--erp-color-text-secondary)]">{item.quantity} 件{canEnterCost ? ` · ${formatCurrency(item.buyPrice * item.quantity)}` : ""}</span><Button type="button" variant="ghost" size="sm" onClick={() => setEditingId(field.id)} aria-expanded={field.id === activeId}>编辑商品</Button></div>
          <div hidden={phone && field.id !== activeId || undefined} className="mt-3 space-y-3">
            <label className="block text-xs font-semibold text-[var(--erp-color-text-secondary)]">商品型号
              <div className="mt-1.5">
                <Controller control={control} name={`items.${index}.productId` as const} render={({field: input}) => <Select searchable searchPlaceholder="搜索商品…" emptyText="没有找到匹配的商品规格" className="min-w-0" value={input.value} options={productOptions} searchFilter={searchFilter} searchLoading={productsLoading} onSearchValueChange={onProductKeywordChange} onValueChange={(value) => { input.onChange(value); handleProductSelect(index, value); if (phone) setEditingId("__none__"); }} onClear={() => onProductClear(index)} quickCreateAction={canCreateProduct && onOpenCreateProduct ? {label: "新建商品", onClick: (searchText) => onOpenCreateProduct(index, searchText || item.productName), disabled} : undefined} disabled={disabled || (!hasProducts && !(canCreateProduct && onOpenCreateProduct))} placeholder={hasProducts ? "选择商品规格" : "搜索或新建商品"} aria-label={`第 ${index + 1} 行商品`} aria-invalid={missingProductIdentity} />} />
              </div>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block min-w-0 text-xs font-semibold text-[var(--erp-color-text-secondary)]">进货价(元)
                <div className="mt-1.5">{canEnterCost ? <Controller control={control} name={`items.${index}.buyPrice` as const} render={({field: input}) => <ErpAmountInput value={input.value} onBlur={input.onBlur} onValueChange={(detail) => input.onChange(detail.floatValue || 0)} disabled={disabled} aria-label={`第 ${index + 1} 行进货价`} />} /> : <span className="flex h-10 items-center justify-center rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] px-2 text-xs text-[var(--erp-color-text-muted)]">不可录入</span>}</div>
              </label>
              <label className="block min-w-0 text-xs font-semibold text-[var(--erp-color-text-secondary)]">预估售价(元)
                <div className="mt-1.5">{showProfit ? <Controller control={control} name={`items.${index}.estSellPrice` as const} render={({field: input}) => <ErpAmountInput value={input.value} onBlur={input.onBlur} onValueChange={(detail) => input.onChange(detail.floatValue || 0)} disabled={disabled} aria-label={`第 ${index + 1} 行预估售价`} />} /> : <span className="flex h-10 items-center justify-center rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] px-2 text-xs text-[var(--erp-color-text-muted)]">—</span>}</div>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block min-w-0 text-xs font-semibold text-[var(--erp-color-text-secondary)]">数量
                <div className="mt-1.5"><Controller control={control} name={`items.${index}.quantity` as const} render={({field: input}) => <Input {...input} value={editableQuantityValue(input.value)} type="number" inputMode="numeric" enterKeyHint="next" min={1} max={PURCHASE_MAX_PHYSICAL_ITEMS} step={1} className="text-center erp-data-number font-semibold" onChange={(event) => input.onChange(quantityFromInput(event.target.value))} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); focusNextLineItemControl(event.currentTarget, '[role="combobox"][aria-label$=" 行商品"]', index); } }} disabled={disabled} aria-invalid={filled && Boolean(purchaseQuantityError([{quantity: input.value}]))} aria-label={`第 ${index + 1} 行数量`} />} /></div>
              </label>
              <div className="min-w-0 text-xs font-semibold text-[var(--erp-color-text-secondary)]">预计利润
                <div className="mt-1.5 flex h-10 items-center rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] px-3"><span className={`whitespace-nowrap erp-data-number text-sm font-semibold ${expectedProfit < 0 ? "text-[var(--erp-color-danger)]" : expectedProfit > 0 ? "text-[var(--erp-color-success)]" : "text-[var(--erp-color-text)]"}`}>{canEnterCost && showProfit ? formatCurrency(expectedProfit) : "—"}</span></div>
              </div>
            </div>
            <label className="block text-xs font-semibold text-[var(--erp-color-text-secondary)]">备注
              <div className="mt-1.5"><Controller control={control} name={`items.${index}.remarks` as const} render={({field: input}) => <Input {...input} className="text-left text-xs" placeholder="商品来源、包装或谈价说明" disabled={disabled} aria-label={`第 ${index + 1} 行备注`} />} /></div>
            </label>
          </div>
        </article>;
      })}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)]/40 px-3 py-2">
        <Button type="button" variant="secondary" size="sm" onClick={addMobileLine} disabled={disabled}><Plus className="h-4 w-4" />添加商品</Button>
        <p className="min-w-0 flex-1 text-xs leading-5 text-[var(--erp-color-text-muted)]">提示：数量可录入同型号多张；显卡入库后在“检测质检”绑定 SN。</p>
      </div>
    </div>
    {fields.length === 0 ? <ErpEmptyState title="暂无采购明细" description="添加至少一行商品后才能提交采购单。" /> : null}
  </CardContent></Card>;
}
