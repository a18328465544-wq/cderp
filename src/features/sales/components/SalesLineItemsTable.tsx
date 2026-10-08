import {ErpMobileOrderLine} from "@/src/components/common/ErpMobileOrderLine";
import {ErpQuantityStepper} from "@/src/components/common/ErpQuantityStepper";
import {Plus, Trash2} from "lucide-react";
import {useState} from "react";
import {useErpPhone} from "@/src/hooks/useErpViewport";
import {formatCurrency} from "@/src/lib/format";
import {Controller, useWatch, type Control, type FieldArrayWithId, type UseFormSetValue} from "react-hook-form";
import {Button, Card, CardContent, Input} from "@/src/components/ui";
import {ErpAmountInput, ErpEmptyState} from "@/src/components/common";
import {InventoryItemPicker} from "@/src/components/domain";
import type {SalesFormValues, SalesProductCandidate} from "@/src/types/sales";
import {calculateSalesLineTotal, calculateSalesUnitPrice, isSalesLineFilled} from "@/src/features/sales/sales.calculations";
import {focusNextLineItemControl} from "@/src/lib/lineItemFocus";
import {editableQuantityValue, quantityFromInput} from "@/src/lib/lineItemQuantity";

export function SalesLineItemsTable({
  control,
  setValue,
  fields,
  selectedCandidates,
  pickerKeyword,
  pickerOptions,
  pickerLoading,
  pickerError,
  pickerDisabled,
  onPickerKeywordChange,
  onPickerFocus,
  onPickerRetry,
  onCandidateSelect,
  onCandidateClear,
  onAdd,
  onRemove,
}: {
  control: Control<SalesFormValues>;
  setValue: UseFormSetValue<SalesFormValues>;
  fields: FieldArrayWithId<SalesFormValues, "items", "id">[];
  selectedCandidates: Record<string, SalesProductCandidate | null>;
  pickerKeyword: (fieldId: string) => string;
  pickerOptions: (fieldId: string) => SalesProductCandidate[];
  pickerLoading: (fieldId: string) => boolean;
  pickerError?: (fieldId: string) => string | undefined;
  pickerDisabled?: boolean;
  onPickerKeywordChange: (fieldId: string, value: string) => void;
  onPickerFocus: (fieldId: string) => void;
  onPickerRetry: () => void;
  onCandidateSelect: (fieldId: string, index: number, option: SalesProductCandidate) => void;
  onCandidateClear: (fieldId: string, index: number) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  const items = useWatch({control, name: "items"});
  const phone = useErpPhone();
  const [editingId, setEditingId] = useState(fields[0]?.productId ? "__none__" : fields[0]?.id || "");
  const activeId = editingId === "__none__" ? undefined : fields.some((field) => field.id === editingId) ? editingId : fields.at(-1)?.id;
  const addMobileLine = () => {
    const spare = fields.find((field, index) => field.id !== activeId && !items[index]?.productId && !items[index]?.sellPrice && !items[index]?.remarks && !pickerKeyword(field.id));
    if (spare) setEditingId(spare.id);
    else {onAdd(); setEditingId("__new__");}
  };

  const [phonePickerIndex, setPhonePickerIndex] = useState<number | null>(null);
  const [phonePickerRequest, setPhonePickerRequest] = useState(0);
  const openPhonePicker = (index: number) => {
    if (fields[index]) onPickerFocus(fields[index].id);
    setPhonePickerIndex(index);
    setPhonePickerRequest((request) => request + 1);
  };
  const addPhoneProduct = () => {
    const spare = fields.findIndex((field, index) => !isSalesLineFilled(items[index] || field));
    if (spare >= 0) openPhonePicker(spare);
    else {const index = fields.length; onAdd(); openPhonePicker(index);}
  };
  const phonePickerField = phonePickerIndex !== null ? fields[phonePickerIndex] : undefined;
  if (phone) return <Card className="erp-mobile-order-items" data-erp-component="transaction-line-items">
    <CardContent>
      <div className="erp-mobile-order-list-heading"><h2>商品清单</h2>{items.some(isSalesLineFilled) && <Button type="button" variant="ghost" disabled={pickerDisabled} onClick={addPhoneProduct}><Plus className="h-4 w-4" />添加商品</Button>}</div>
      <div data-erp-region="line-items-cards">
        {fields.map((field, index) => {
          const item = items[index] || field;
          if (!isSalesLineFilled(item)) return null;
          const selected = selectedCandidates[field.id];
          const label = `第 ${index + 1} 行商品`;
          return <ErpMobileOrderLine key={field.id} label={label} name={item.productName || "请选择商品"} imageUrl={selected?.imageUrl} metadata={selected ? `${item.vram || item.model} · ${selected.availabilityKnown === false ? "库存提交时核验" : `可售 ${selected.availableQuantity} 件`}` : item.model}
            disabled={pickerDisabled} total={formatCurrency(calculateSalesLineTotal(item.quantity, item.sellPrice))}
            price={<Controller control={control} name={`items.${index}.sellPrice`} render={({field: input}) => <ErpAmountInput value={input.value || ""} placeholder="输入售价" disabled={pickerDisabled} onBlur={input.onBlur} onValueChange={(value) => input.onChange(Math.round(value.floatValue || 0))} aria-label={`第 ${index + 1} 行销售单价`} />} />}
            quantity={<Controller control={control} name={`items.${index}.quantity`} render={({field: input}) => <ErpQuantityStepper value={input.value} onChange={input.onChange} max={selected?.availabilityKnown === false ? undefined : selected?.availableQuantity} disabled={pickerDisabled} label={`第 ${index + 1} 行数量`} />} />}
            onReplace={() => openPhonePicker(index)} onRemove={() => onRemove(index)}
            extra={<div className="space-y-2.5">
              <label className="block text-xs font-medium text-[var(--erp-color-text-secondary)]">整行成交金额<ErpAmountInput className="mt-1" value={calculateSalesLineTotal(item.quantity, item.sellPrice)} disabled={pickerDisabled || item.quantity < 1} onValueChange={(value, source) => {if (source.source === "event") setValue(`items.${index}.sellPrice`, calculateSalesUnitPrice(value.floatValue || 0, item.quantity), {shouldDirty: true, shouldValidate: true});}} aria-label={`第 ${index + 1} 行销售总价`} /></label>
              <label className="block text-xs font-medium text-[var(--erp-color-text-secondary)]">明细备注<Controller control={control} name={`items.${index}.remarks`} render={({field: input}) => <Input {...input} className="mt-1 text-xs" disabled={pickerDisabled} aria-label={`第 ${index + 1} 行备注`} placeholder="包装或客户特殊要求" />} /></label>
            </div>}
          />;
        })}
        {!items.some(isSalesLineFilled) && <div className="erp-mobile-order-empty"><p>添加本次销售的商品</p><span>选好型号后，直接填写售价和数量</span><Button type="button" variant="primary" disabled={pickerDisabled} onClick={addPhoneProduct}><Plus className="h-4 w-4" />添加商品</Button></div>}
      </div>
      {phonePickerIndex !== null && phonePickerField && <InventoryItemPicker key={phonePickerField.id} value={selectedCandidates[phonePickerField.id] || null} keyword={pickerKeyword(phonePickerField.id)} options={pickerOptions(phonePickerField.id)} loading={pickerLoading(phonePickerField.id)} error={pickerError?.(phonePickerField.id)} disabled={pickerDisabled} phoneOpenRequest={phonePickerRequest} hidePhoneTrigger onPhoneOpenChange={(open) => {if (!open) setPhonePickerIndex(null);}}
        onFocus={() => onPickerFocus(phonePickerField.id)} onKeywordChange={(value) => onPickerKeywordChange(phonePickerField.id, value)} onRetry={onPickerRetry} onSelect={(option) => onCandidateSelect(phonePickerField.id, phonePickerIndex, option)} onClear={() => onCandidateClear(phonePickerField.id, phonePickerIndex)} />}
    </CardContent>
  </Card>;

  return (
    <Card data-erp-component="transaction-line-items" className="erp-transaction-line-items">
      <CardContent>
        <div data-erp-region="line-items-table" className="erp-transaction-line-items-table overflow-hidden rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)]">
          <div className="erp-scrollbar max-h-[420px] overflow-auto">
            <table className="w-full min-w-[984px] table-fixed border-collapse text-sm">
              <colgroup>
                <col className="w-[320px]" />
                <col className="w-[96px]" />
                <col className="w-[132px]" />
                <col className="w-[132px]" />
                <col className="w-[220px]" />
                <col className="w-[84px]" />
              </colgroup>
              <thead className="erp-refresh-indicator-layer sticky top-0 bg-[var(--erp-color-surface-muted)]">
                <tr className="text-xs text-[var(--erp-color-text-secondary)]">
                  <th className="erp-table-sticky-edge-layer sticky left-0 border-b border-r border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)] px-3 py-3 text-center font-semibold">
                    商品规格 / 可售库存
                  </th>
                  <th className="border-b border-r border-[var(--erp-color-border)] px-3 py-3 text-center font-semibold">
                    数量
                  </th>
                  <th className="border-b border-r border-[var(--erp-color-border)] px-3 py-3 text-center font-semibold">
                    销售单价(元)
                  </th>
                  <th className="border-b border-r border-[var(--erp-color-border)] px-3 py-3 text-center font-semibold">
                    销售总价(元)
                  </th>
                  <th className="border-b border-r border-[var(--erp-color-border)] px-3 py-3 text-center font-semibold">
                    备注
                  </th>
                  <th className="erp-table-sticky-edge-layer sticky right-0 border-b border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)] px-3 py-3 text-center font-semibold">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field, index) => {
                  const selected = selectedCandidates[field.id] || null;
                  const quantity = items[index]?.quantity ?? 1;
                  const lineTotal = calculateSalesLineTotal(quantity, items[index]?.sellPrice || 0);

                  return (
                    <tr
                      key={field.id}
                      className="group align-middle transition-colors hover:bg-[var(--erp-color-surface-muted)]/60 last:[&>td]:border-b-0"
                    >
                      <td className="erp-content-sticky-layer sticky left-0 border-b border-r border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-3 py-2 group-hover:bg-[var(--erp-color-surface-muted)]">
                        <InventoryItemPicker
                          value={selected}
                          keyword={pickerKeyword(field.id)}
                          options={pickerOptions(field.id)}
                          loading={pickerLoading(field.id)}
                          error={pickerError?.(field.id)}
                          disabled={pickerDisabled}
                          onFocus={() => onPickerFocus(field.id)}
                          onKeywordChange={(value) => onPickerKeywordChange(field.id, value)}
                          onRetry={onPickerRetry}
                          onSelect={(option) => {onCandidateSelect(field.id, index, option); if (phone) setEditingId("__none__");}}
                          onClear={() => onCandidateClear(field.id, index)}
                        />
                        {selected && (
                          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--erp-color-text-muted)]">
                            <span className="break-words font-medium text-[var(--erp-color-text-secondary)]">
                              {selected.brand} {selected.model}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{selected.vram || "无规格信息"}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-semibold text-[var(--erp-color-success)]">
                              {selected.availabilityKnown === false ? "库存提交时核验" : `可售 ${selected.availableQuantity} 张`}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="border-b border-r border-[var(--erp-color-border)] px-3 py-2">
                        <Controller
                          control={control}
                          name={`items.${index}.quantity`}
                          render={({field: input}) => (
                            <Input
                              {...input}
                              value={editableQuantityValue(input.value)}
                              type="number"
                              inputMode="numeric"
                              enterKeyHint="next"
                              min={1}
                              max={selected?.availabilityKnown === false ? undefined : selected?.availableQuantity || undefined}
                              step={1}
                              className="text-center erp-data-number font-semibold"
                              onChange={(event) => {
                                const available = selected?.availabilityKnown === false ? undefined : selected?.availableQuantity;
                                input.onChange(quantityFromInput(event.target.value, {max: available, integer: true}));
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                                  event.preventDefault();
                                  focusNextLineItemControl(event.currentTarget, '[aria-label="选择销售商品"]', index, true);
                                }
                              }}
                              aria-label={`第 ${index + 1} 行数量`}
                              aria-invalid={input.value < 1}
                            />
                          )}
                        />
                      </td>
                      <td className="border-b border-r border-[var(--erp-color-border)] px-3 py-2">
                        <Controller
                          control={control}
                          name={`items.${index}.sellPrice`}
                          render={({field: input}) => (
                            <ErpAmountInput
                              value={input.value}
                              onBlur={input.onBlur}
                              onValueChange={(values) => input.onChange(Math.round(values.floatValue || 0))}
                              aria-label={`第 ${index + 1} 行销售单价`}
                            />
                          )}
                        />
                      </td>
                      <td className="border-b border-r border-[var(--erp-color-border)] px-3 py-2">
                        <ErpAmountInput
                          value={lineTotal}
                          disabled={quantity < 1}
                          onValueChange={(values, source) => {
                            if (source.source !== "event") return;
                            const unitPrice = calculateSalesUnitPrice(values.floatValue || 0, quantity);
                            setValue(`items.${index}.sellPrice`, unitPrice, {
                              shouldDirty: true,
                              shouldValidate: true,
                            });
                          }}
                          aria-label={`第 ${index + 1} 行销售总价`}
                        />
                      </td>
                      <td className="border-b border-r border-[var(--erp-color-border)] px-3 py-2">
                        <Controller
                          control={control}
                          name={`items.${index}.remarks`}
                          render={({field: input}) => (
                            <Input
                              {...input}
                              className="text-center text-xs"
                              placeholder="客户特殊要求或包装说明"
                              aria-label={`第 ${index + 1} 行备注`}
                            />
                          )}
                        />
                      </td>
                      <td className="erp-content-sticky-layer sticky right-0 border-b border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-3 py-2 text-center group-hover:bg-[var(--erp-color-surface-muted)]">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`删除第 ${index + 1} 行`}
                          onClick={() => onRemove(index)}
                          disabled={fields.length <= 1}
                        >
                          <Trash2 className="h-4 w-4 text-[var(--erp-color-danger)]" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-t border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)]/40 px-3 py-2">
            <Button type="button" variant="secondary" size="sm" onClick={onAdd}>
              <Plus className="h-4 w-4" />
              增加一行商品
            </Button>
            <p className="text-xs text-[var(--erp-color-text-muted)]">
              提示：按商品规格汇总可售库存，已扣除待出库占用；出库时按单扫码核验绑定实物 SN。
            </p>
          </div>
        </div>
        <div data-erp-region="line-items-cards" className="erp-transaction-line-items-cards space-y-3">
          {fields.map((field, index) => {
            const selected = selectedCandidates[field.id] || null;
            const quantity = items[index]?.quantity ?? 1;
            const lineTotal = calculateSalesLineTotal(quantity, items[index]?.sellPrice || 0);

            return (
              <article data-phone-order-row="true" data-phone-order-selected={Boolean(selected)} key={field.id} hidden={phone && field.id !== activeId && !selected && !items[index]?.sellPrice && !items[index]?.remarks && !pickerKeyword(field.id) || undefined} data-erp-component="transaction-line-item-card" aria-label={`第 ${index + 1} 行销售商品`} className="rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-3">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  {phone && selected?.imageUrl && <img src={selected.imageUrl} alt="" className="erp-phone-order-image" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-[var(--erp-color-text-muted)]">商品明细 {index + 1}</p>
                    <p className="mt-1 break-words text-sm font-semibold text-[var(--erp-color-text)]" title={selected?.productName || undefined}>{selected?.productName || "待选择商品"}</p>
                  </div>
                  <Button type="button" variant="ghost" size="iconTouch" aria-label={`删除第 ${index + 1} 行`} onClick={() => onRemove(index)} disabled={fields.length <= 1}>
                    <Trash2 className="h-4 w-4 text-[var(--erp-color-danger)]" />
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">{phone && selected && <Controller control={control} name={`items.${index}.quantity`} render={({field: input}) => <ErpQuantityStepper value={input.value} onChange={input.onChange} max={selected.availabilityKnown === false ? undefined : selected.availableQuantity} disabled={pickerDisabled} label={`第 ${index + 1} 行数量`} />} />}<span className="erp-data-number text-xs text-[var(--erp-color-text-secondary)]">{quantity} 件 · {formatCurrency(lineTotal)}</span><Button type="button" variant="ghost" size="sm" onClick={() => setEditingId(field.id)} aria-expanded={field.id === activeId}>编辑商品</Button></div>
                <div hidden={phone && field.id !== activeId || undefined} className="mt-3 space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-[var(--erp-color-text-secondary)]">商品规格 / 可售库存</p>
                    <div className="mt-1.5">
                      <InventoryItemPicker
                        value={selected}
                        keyword={pickerKeyword(field.id)}
                        options={pickerOptions(field.id)}
                        loading={pickerLoading(field.id)}
                        error={pickerError?.(field.id)}
                        disabled={pickerDisabled}
                        onFocus={() => onPickerFocus(field.id)}
                        onKeywordChange={(value) => onPickerKeywordChange(field.id, value)}
                        onRetry={onPickerRetry}
                        onSelect={(option) => {onCandidateSelect(field.id, index, option); if (phone) setEditingId("__none__");}}
                        onClear={() => onCandidateClear(field.id, index)}
                      />
                    </div>
                    {selected && (
                      <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--erp-color-text-muted)]">
                        <span className="break-words font-medium text-[var(--erp-color-text-secondary)]">{selected.brand} {selected.model}</span>
                        <span aria-hidden="true">·</span>
                        <span>{selected.vram || "无规格信息"}</span>
                        <span aria-hidden="true">·</span>
                    <span className="font-semibold text-[var(--erp-color-success)]">{selected.availabilityKnown === false ? "库存提交时核验" : `可售 ${selected.availableQuantity} 张`}</span>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block min-w-0 text-xs font-semibold text-[var(--erp-color-text-secondary)]">数量
                      <div className="mt-1.5">
                        <Controller control={control} name={`items.${index}.quantity`} render={({field: input}) => <Input {...input} value={editableQuantityValue(input.value)} type="number" inputMode="numeric" enterKeyHint="next" min={1} max={selected?.availabilityKnown === false ? undefined : selected?.availableQuantity || undefined} step={1} className="text-center erp-data-number font-semibold" onChange={(event) => { const available = selected?.availabilityKnown === false ? undefined : selected?.availableQuantity; input.onChange(quantityFromInput(event.target.value, {max: available, integer: true})); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); focusNextLineItemControl(event.currentTarget, '[aria-label="选择销售商品"]', index, true); } }} aria-invalid={input.value < 1} aria-label={`第 ${index + 1} 行数量`} />} />
                      </div>
                    </label>
                    <label className="block min-w-0 text-xs font-semibold text-[var(--erp-color-text-secondary)]">销售单价(元)
                      <div className="mt-1.5">
                        <Controller control={control} name={`items.${index}.sellPrice`} render={({field: input}) => <ErpAmountInput value={input.value} onBlur={input.onBlur} onValueChange={(values) => input.onChange(Math.round(values.floatValue || 0))} aria-label={`第 ${index + 1} 行销售单价`} />} />
                      </div>
                    </label>
                  </div>
                  <label className="block text-xs font-semibold text-[var(--erp-color-text-secondary)]">销售总价(元)
                    <div className="mt-1.5">
                      <ErpAmountInput value={lineTotal} disabled={quantity < 1} onValueChange={(values, source) => { if (source.source !== "event") return; const unitPrice = calculateSalesUnitPrice(values.floatValue || 0, quantity); setValue(`items.${index}.sellPrice`, unitPrice, {shouldDirty: true, shouldValidate: true}); }} aria-label={`第 ${index + 1} 行销售总价`} />
                    </div>
                  </label>
                  <label className="block text-xs font-semibold text-[var(--erp-color-text-secondary)]">备注
                    <div className="mt-1.5"><Controller control={control} name={`items.${index}.remarks`} render={({field: input}) => <Input {...input} className="text-left text-xs" placeholder="客户特殊要求或包装说明" aria-label={`第 ${index + 1} 行备注`} />} /></div>
                  </label>
                </div>
              </article>
            );
          })}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)]/40 px-3 py-2">
            <Button type="button" variant="secondary" size="sm" onClick={addMobileLine}><Plus className="h-4 w-4" />添加商品</Button>
            <p className="min-w-0 flex-1 text-xs leading-5 text-[var(--erp-color-text-muted)]">提示：按商品规格汇总可售库存，已扣除待出库占用；出库时按单扫码核验绑定实物 SN。</p>
          </div>
        </div>
        {fields.length === 0 ? (
          <ErpEmptyState title="暂无销售明细" description="添加至少一行商品后才能提交销售单。" />
        ) : null}
      </CardContent>
    </Card>
  );
}
