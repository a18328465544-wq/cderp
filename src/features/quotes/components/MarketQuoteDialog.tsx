import {zodResolver} from "@hookform/resolvers/zod";
import {Controller, useForm} from "react-hook-form";
import {useEffect} from "react";
import {Button, Input, Select, Textarea} from "@/src/components/ui";
import {ErpAmountInput, ErpDialogShell, ErpField, ErpFormSection, ErpPageError} from "@/src/components/common";
import type {MarketQuoteFormValues, MarketQuoteItem} from "@/src/types/quote";
import {defaultMarketQuoteValues, marketQuoteSchema} from "../quote.schema";

export function MarketQuoteDialog({open, quote, pending, error, onOpenChange, onSubmit}: {open: boolean; quote: MarketQuoteItem | null; pending: boolean; error?: string; onOpenChange: (open: boolean) => void; onSubmit: (values: MarketQuoteFormValues) => Promise<void>}) {
  const form = useForm<MarketQuoteFormValues>({resolver: zodResolver(marketQuoteSchema), defaultValues: defaultMarketQuoteValues});
  useEffect(() => {
    form.reset(quote ? {model: quote.model, brand: quote.brand, buyPrice: quote.buyPrice || 0, sellPrice: quote.sellPrice || 0, trend: quote.trend, note: quote.note || ""} : defaultMarketQuoteValues);
  }, [form, open, quote]);
  const fieldError = (name: keyof MarketQuoteFormValues) => form.formState.errors[name]?.message;
  return <ErpDialogShell open={open} onOpenChange={onOpenChange} pending={pending} size="lg" title={quote ? "更新行情价格" : "新增行情参考"} description="更新时由服务端记录真实历史点，并同步关联在库商品价格。" footer={<><Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>取消</Button><Button type="submit" form="market-quote-form" variant="primary" disabled={pending}>{pending ? "保存中…" : quote ? "保存更新" : "创建行情"}</Button></>}>
    <form id="market-quote-form" onSubmit={(event) => {void form.handleSubmit(onSubmit)(event);}} className="space-y-4">
      {error && <ErpPageError title="保存失败" description={error} />}
      <ErpFormSection title="行情信息" description={quote ? "型号与品牌沿用原记录，避免改变关联关系。" : "录入当前可执行的回收与销售参考价。"}>
        <div className="grid gap-4 sm:grid-cols-2">
          <ErpField label="商品型号" error={fieldError("model")}><Input {...form.register("model")} disabled={pending || Boolean(quote)} placeholder="例如 RTX 4090" /></ErpField>
          <ErpField label="品牌" error={fieldError("brand")}><Input {...form.register("brand")} disabled={pending || Boolean(quote)} placeholder="例如 NVIDIA" /></ErpField>
          <ErpField label="回收参考价" error={fieldError("buyPrice")}><Controller control={form.control} name="buyPrice" render={({field}) => <ErpAmountInput value={field.value} onBlur={field.onBlur} onValueChange={(value) => field.onChange(value.floatValue || 0)} disabled={pending} />} /></ErpField>
          <ErpField label="销售参考价" error={fieldError("sellPrice")}><Controller control={form.control} name="sellPrice" render={({field}) => <ErpAmountInput value={field.value} onBlur={field.onBlur} onValueChange={(value) => field.onChange(value.floatValue || 0)} disabled={pending} />} /></ErpField>
          <ErpField label="走势" error={fieldError("trend")}><Controller control={form.control} name="trend" render={({field}) => <Select value={field.value} onValueChange={field.onChange} options={[{value: "stable", label: "价格平稳"}, {value: "up", label: "参考价上调"}, {value: "down", label: "参考价下调"}]} disabled={pending} aria-label="走势" />} /></ErpField>
          <ErpField label="波动说明" error={fieldError("note")} className="sm:col-span-2"><Textarea {...form.register("note")} disabled={pending} placeholder="说明近期价格变化和报价注意事项" /></ErpField>
        </div>
      </ErpFormSection>
    </form>
  </ErpDialogShell>;
}
