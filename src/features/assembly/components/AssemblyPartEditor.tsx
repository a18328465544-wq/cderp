import {Controller, type UseFormReturn} from "react-hook-form";
import {Camera, Plus, Trash2} from "lucide-react";
import {Button, Input, Select} from "@/src/components/ui";
import {ErpAmountInput} from "@/src/components/common";
import {productCategoryValues, type ProductCategory} from "@/src/types/core";
import type {AssemblyFormValues, AssemblyInventoryOption, AssemblyProductOption} from "@/src/types/assembly";
import {inventorySellableStatuses} from "@/src/utils/inventoryFilters";
import {createAssemblyPartDefaults} from "../assembly.defaults";
import {AssemblyInventoryPicker} from "./AssemblyInventoryPicker";

const categoryOptions = productCategoryValues.map((value) => ({value, label: value}));

export function AssemblyPartEditor({kind, form, inventory, products, showCost, showProfit, disabled, onScan}: {kind: "beforeParts" | "afterParts"; form: UseFormReturn<AssemblyFormValues>; inventory: AssemblyInventoryOption[]; products: AssemblyProductOption[]; showCost: boolean; showProfit: boolean; disabled?: boolean; onScan: (kind: "beforeParts" | "afterParts", index: number) => void}) {
  const parts = form.watch(kind);
  const replace = (index: number, patch: Partial<AssemblyFormValues[typeof kind][number]>) => form.setValue(`${kind}.${index}` as const, {...parts[index]!, ...patch}, {shouldDirty: true, shouldValidate: true});
  const remove = (index: number) => form.setValue(kind, parts.filter((_, current) => current !== index), {shouldDirty: true, shouldValidate: true});
  const add = () => form.setValue(kind, [...parts, createAssemblyPartDefaults(parts.length)], {shouldDirty: true, shouldValidate: true});
  const assemblySources = kind === "beforeParts";

  return <div className="space-y-3">
    <div className="hidden xl:block">
      <div className="erp-scrollbar overflow-x-auto rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)]">
      <table className="w-full min-w-[1040px] border-collapse text-sm">
        <thead className="bg-[var(--erp-color-surface-muted)] text-xs text-[var(--erp-color-text-secondary)]">
          <tr>
            <th className="px-3 py-3 text-left">{assemblySources ? "来源库存" : "商品模板 / 配件名称"}</th>
            <th className="px-3 py-3 text-left">分类</th>
            <th className="px-3 py-3 text-left">SN</th>
            {showCost && <th className="px-3 py-3 text-left">成本分配</th>}
            {showProfit && <th className="px-3 py-3 text-left">预计售价</th>}
            <th className="px-3 py-3 text-left">备注</th>
            <th className="w-12 px-3 py-3" />
          </tr>
        </thead>
        <tbody>
          {parts.map((part, index) => <tr key={`${kind}-${index}`} className="border-t border-[var(--erp-color-border)] align-top">
            <td className="min-w-72 px-3 py-2">
              {assemblySources ? <AssemblyInventoryPicker label={`选择第${index + 1}个组装来源库存`} value={part.sn} options={inventory} allowedStatuses={inventorySellableStatuses} disabled={disabled} onClear={() => replace(index, {productId: "", partName: `配件-${index + 1}`, sn: "", category: "其他配件", costPrice: 0, estSellPrice: 0, marketPrice: 0})} onSelect={(option) => replace(index, {productId: option.productId || "", partName: option.productName, category: option.category, sn: option.sn, costPrice: option.costPrice || 0, estSellPrice: option.estSellPrice || 0, marketPrice: option.marketPrice || 0})} /> : <div className="space-y-2">
                <Select searchable searchPlaceholder="搜索商品模板" emptyText="没有找到匹配的商品模板" value={part.productId} placeholder="选择模板（可选）" options={products.map((product) => ({value: product.id, label: product.name}))} disabled={disabled} aria-label={`第${index + 1}行商品模板`} onValueChange={(id) => {const product = products.find((item) => item.id === id); if (product) replace(index, {productId: product.id, partName: product.name, category: product.category, costPrice: product.refBuyPrice || 0, estSellPrice: product.refSellPrice || 0, marketPrice: product.refSellPrice || 0});}} />
                <Input value={part.partName} onChange={(event) => replace(index, {partName: event.target.value, productId: ""})} placeholder="配件名称" disabled={disabled} />
              </div>}
            </td>
            <td className="min-w-32 px-3 py-2"><Select value={part.category} options={categoryOptions} disabled={disabled || assemblySources} onValueChange={(value) => replace(index, {category: value as ProductCategory})} /></td>
            <td className="min-w-52 px-3 py-2"><div className="flex gap-1"><Input value={part.sn} onChange={(event) => replace(index, {sn: event.target.value})} placeholder="扫码或输入 SN" disabled={disabled || assemblySources} className="erp-data-number" /><Button type="button" size="icon" variant="secondary" disabled={disabled || assemblySources} onClick={() => onScan(kind, index)} aria-label={`扫描第${index + 1}行SN`}><Camera className="h-4 w-4" /></Button></div></td>
            {showCost && <td className="min-w-36 px-3 py-2"><Controller control={form.control} name={`${kind}.${index}.costPrice`} render={({field}) => <ErpAmountInput value={field.value} onValueChange={(detail) => field.onChange(detail.floatValue || 0)} disabled={disabled || assemblySources} aria-label={`第${index + 1}行成本`} />} /></td>}
            {showProfit && <td className="min-w-36 px-3 py-2"><Controller control={form.control} name={`${kind}.${index}.estSellPrice`} render={({field}) => <ErpAmountInput value={field.value} onValueChange={(detail) => {field.onChange(detail.floatValue || 0); form.setValue(`${kind}.${index}.marketPrice`, detail.floatValue || 0, {shouldDirty: true});}} disabled={disabled || assemblySources} aria-label={`第${index + 1}行预计售价`} />} /></td>}
            <td className="min-w-44 px-3 py-2"><Input value={part.remarks} onChange={(event) => replace(index, {remarks: event.target.value})} placeholder="行备注" disabled={disabled} /></td>
            <td className="px-3 py-2"><Button type="button" size="icon" variant="ghost" disabled={disabled || parts.length <= 1} onClick={() => remove(index)} aria-label={`删除第${index + 1}行`}><Trash2 className="h-4 w-4 text-[var(--erp-color-danger)]" /></Button></td>
          </tr>)}
        </tbody>
      </table>
      </div>
      <Button type="button" size="sm" variant="secondary" className="mt-3" onClick={add} disabled={disabled}><Plus className="h-4 w-4" />增加配件行</Button>
    </div>
    <div className="space-y-3 xl:hidden" data-erp-region="mobile-assembly-parts">
      {parts.map((part, index) => <article key={`${kind}-mobile-${index}`} aria-label={`第 ${index + 1} 行配件`} className="min-w-0 rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-3 shadow-[var(--erp-shadow-card)]">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <h3 className="min-w-0 truncate text-sm font-semibold text-[var(--erp-color-text)]">配件明细 {index + 1}</h3>
          <Button type="button" size="iconTouch" variant="ghost" className="shrink-0" disabled={disabled || parts.length <= 1} onClick={() => remove(index)} aria-label={`删除第${index + 1}行`}><Trash2 className="h-4 w-4 text-[var(--erp-color-danger)]" /></Button>
        </div>
        <div className="mt-3 grid min-w-0 gap-3">
          <div className="min-w-0">
            <span className="mb-1.5 block text-xs font-semibold text-[var(--erp-color-text-secondary)]">{assemblySources ? "来源库存" : "商品模板 / 配件名称"}</span>
            {assemblySources ? <AssemblyInventoryPicker label={`选择第${index + 1}个组装来源库存`} value={part.sn} options={inventory} allowedStatuses={inventorySellableStatuses} disabled={disabled} onClear={() => replace(index, {productId: "", partName: `配件-${index + 1}`, sn: "", category: "其他配件", costPrice: 0, estSellPrice: 0, marketPrice: 0})} onSelect={(option) => replace(index, {productId: option.productId || "", partName: option.productName, category: option.category, sn: option.sn, costPrice: option.costPrice || 0, estSellPrice: option.estSellPrice || 0, marketPrice: option.marketPrice || 0})} /> : <div className="min-w-0 space-y-2">
              <Select searchable searchPlaceholder="搜索商品模板" emptyText="没有找到匹配的商品模板" value={part.productId} placeholder="选择模板（可选）" options={products.map((product) => ({value: product.id, label: product.name}))} disabled={disabled} aria-label={`第${index + 1}行商品模板`} onValueChange={(id) => {const product = products.find((item) => item.id === id); if (product) replace(index, {productId: product.id, partName: product.name, category: product.category, costPrice: product.refBuyPrice || 0, estSellPrice: product.refSellPrice || 0, marketPrice: product.refSellPrice || 0});}} />
              <Input value={part.partName} onChange={(event) => replace(index, {partName: event.target.value, productId: ""})} placeholder="配件名称" disabled={disabled} />
            </div>}
          </div>
          <label className="min-w-0 text-xs font-semibold text-[var(--erp-color-text-secondary)]">分类<Select className="mt-1.5 w-full" value={part.category} options={categoryOptions} disabled={disabled || assemblySources} onValueChange={(value) => replace(index, {category: value as ProductCategory})} /></label>
          <div className="min-w-0">
            <span className="mb-1.5 block text-xs font-semibold text-[var(--erp-color-text-secondary)]">SN</span>
            <div className="flex min-w-0 gap-1"><Input value={part.sn} onChange={(event) => replace(index, {sn: event.target.value})} placeholder="扫码或输入 SN" disabled={disabled || assemblySources} className="min-w-0 flex-1 erp-data-number" /><Button type="button" size="iconTouch" variant="secondary" className="shrink-0" disabled={disabled || assemblySources} onClick={() => onScan(kind, index)} aria-label={`扫描第${index + 1}行SN`}><Camera className="h-4 w-4" /></Button></div>
          </div>
          {showCost && <label className="min-w-0 text-xs font-semibold text-[var(--erp-color-text-secondary)]">成本分配<Controller control={form.control} name={`${kind}.${index}.costPrice`} render={({field}) => <ErpAmountInput className="mt-1.5 w-full" value={field.value} onValueChange={(detail) => field.onChange(detail.floatValue || 0)} disabled={disabled || assemblySources} aria-label={`第${index + 1}行成本`} />} /></label>}
          {showProfit && <label className="min-w-0 text-xs font-semibold text-[var(--erp-color-text-secondary)]">预计售价<Controller control={form.control} name={`${kind}.${index}.estSellPrice`} render={({field}) => <ErpAmountInput className="mt-1.5 w-full" value={field.value} onValueChange={(detail) => {field.onChange(detail.floatValue || 0); form.setValue(`${kind}.${index}.marketPrice`, detail.floatValue || 0, {shouldDirty: true});}} disabled={disabled || assemblySources} aria-label={`第${index + 1}行预计售价`} />} /></label>}
          <label className="min-w-0 text-xs font-semibold text-[var(--erp-color-text-secondary)]">备注<Input className="mt-1.5 w-full" value={part.remarks} onChange={(event) => replace(index, {remarks: event.target.value})} placeholder="行备注" disabled={disabled} /></label>
        </div>
      </article>)}
      <Button type="button" size="sm" variant="secondary" onClick={add} disabled={disabled}><Plus className="h-4 w-4" />增加配件行</Button>
    </div>
  </div>;
}
