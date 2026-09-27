import {zodResolver} from "@hookform/resolvers/zod";
import {Controller, useForm} from "react-hook-form";
import {useEffect} from "react";
import {Input, Select, Textarea} from "@/src/components/ui";
import {ErpAmountInput, ErpDatePicker, ErpUploader} from "@/src/components/common";
import type {FinanceAccountItem} from "@/src/types/finance-account";
import {financeIncomeCategories, financeIncomePaymentMethods, type FinanceIncomeFormValues, type FinanceIncomeItem} from "@/src/types/finance-income";
import {storeDate} from "@/src/utils/storeTime";
import {financeIncomeSchema} from "../finance-income.schema";
import {useFinanceIncomeMediaUpload} from "../hooks/useFinanceIncomeMediaUpload";
import {FinanceEntryDialogShell, FinanceEntryField, useFinanceEntryPreview} from "./FinanceEntryDialogShell";

const defaults = (): FinanceIncomeFormValues => ({source: "", accountId: "", amount: 0, paymentMethod: "微信", businessType: "其他收入", referenceNo: "", date: storeDate(), remarks: "", images: []});

type FinanceIncomeDialogProps = {
  open: boolean;
  item: FinanceIncomeItem | null;
  accounts: FinanceAccountItem[];
  pending: boolean;
  error?: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: FinanceIncomeFormValues) => Promise<void>;
};

export function FinanceIncomeDialog({open, item, accounts, pending, error, onOpenChange, onSubmit}: FinanceIncomeDialogProps) {
  const {preview, setPreview} = useFinanceEntryPreview();
  const form = useForm<FinanceIncomeFormValues>({defaultValues: defaults(), resolver: zodResolver(financeIncomeSchema), mode: "onBlur"});
  const media = useFinanceIncomeMediaUpload((urls) => form.setValue("images", urls, {shouldDirty: true, shouldValidate: true}));

  useEffect(() => {
    if (!open) return;
    const values: FinanceIncomeFormValues = item
      ? {
        source: item.source,
        accountId: item.accountId,
        amount: item.amount,
        paymentMethod: item.paymentMethod,
        businessType: financeIncomeCategories.includes(item.businessType as typeof financeIncomeCategories[number])
          ? item.businessType as typeof financeIncomeCategories[number]
          : "其他收入",
        referenceNo: item.referenceNo || "",
        date: item.time.slice(0, 10),
        remarks: item.remarks || "",
        images: item.images,
      }
      : defaults();
    form.reset(values);
    media.reset(values.images);
  }, [form, item, media.reset, open]);

  return (
    <FinanceEntryDialogShell
      open={open}
      pending={pending}
      title={item ? "编辑非经营收入" : "新增非经营收入"}
      description="只登记非销售、非采购单自动生成的临时收入；保存后由后端同步账户和财务流水。"
      submitLabel={media.blocking ? "请处理图片状态" : pending ? "保存中…" : item ? "保存修改" : "登记收入"}
      submitDisabled={media.blocking}
      error={error}
      preview={preview}
      previewAlt="收入凭证预览"
      onOpenChange={onOpenChange}
      onSubmit={(event) => { void form.handleSubmit(onSubmit)(event); }}
      onPreviewChange={setPreview}
    >
      <FinanceEntryField label="收入来源" error={form.formState.errors.source?.message}>
        <Input {...form.register("source")} placeholder="例如：平台返点、物流赔偿" disabled={pending} />
      </FinanceEntryField>
      <FinanceEntryField label="收入类型" error={form.formState.errors.businessType?.message}>
        <Controller
          control={form.control}
          name="businessType"
          render={({field}) => <Select value={field.value} onValueChange={field.onChange} options={financeIncomeCategories.map((value) => ({value, label: value}))} disabled={pending} aria-label="收入类型" />}
        />
      </FinanceEntryField>
      <FinanceEntryField label="结算账户" error={form.formState.errors.accountId?.message}>
        <Controller
          control={form.control}
          name="accountId"
          render={({field}) => (
            <Select
              value={field.value}
              onValueChange={field.onChange}
              options={accounts.filter((account) => account.enabled).map((account) => ({value: account.id, label: `${account.name} · ${account.type}`}))}
              disabled={pending}
              placeholder="请选择入账账户"
              aria-label="结算账户"
            />
          )}
        />
      </FinanceEntryField>
      <FinanceEntryField label="入账方式" error={form.formState.errors.paymentMethod?.message}>
        <Controller
          control={form.control}
          name="paymentMethod"
          render={({field}) => <Select value={field.value} onValueChange={field.onChange} options={financeIncomePaymentMethods.map((value) => ({value, label: value}))} disabled={pending} aria-label="入账方式" />}
        />
      </FinanceEntryField>
      <FinanceEntryField label="金额" error={form.formState.errors.amount?.message}>
        <Controller
          control={form.control}
          name="amount"
          render={({field}) => <ErpAmountInput value={field.value} onValueChange={(value) => field.onChange(value.floatValue || 0)} disabled={pending} aria-label="收入金额" />}
        />
      </FinanceEntryField>
      <FinanceEntryField label="日期" error={form.formState.errors.date?.message}>
        <Controller
          control={form.control}
          name="date"
          render={({field}) => <ErpDatePicker value={field.value} onChange={field.onChange} disabled={pending} aria-label="收入日期" />}
        />
      </FinanceEntryField>
      <FinanceEntryField label="外部参考号（选填）" error={form.formState.errors.referenceNo?.message}>
        <Input {...form.register("referenceNo")} placeholder="转账单号、赔偿单号等；不是 ERP 关联单号" disabled={pending} />
      </FinanceEntryField>
      <FinanceEntryField label="备注（选填）" error={form.formState.errors.remarks?.message}>
        <Textarea {...form.register("remarks")} className="min-h-20" maxLength={200} disabled={pending} placeholder="说明收入背景、核对信息" />
      </FinanceEntryField>
      <div className="md:col-span-2">
        <ErpUploader
          items={media.items}
          maxCount={6}
          accept={media.accept}
          disabled={pending}
          description="上传转账截图或收入凭证；统一压缩到约 100KB 后保存真实媒体 URL。"
          error={media.error}
          onFilesSelected={media.addFiles}
          onRetry={media.retry}
          onRemove={media.remove}
          onPreview={(value) => setPreview(value.previewUrl)}
        />
      </div>
    </FinanceEntryDialogShell>
  );
}
