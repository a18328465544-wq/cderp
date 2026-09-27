import {zodResolver} from "@hookform/resolvers/zod";
import {Controller, useForm} from "react-hook-form";
import {useEffect} from "react";
import {Input, Select, Textarea} from "@/src/components/ui";
import {ErpAmountInput, ErpDatePicker, ErpUploader} from "@/src/components/common";
import type {FinanceAccountItem} from "@/src/types/finance-account";
import {financeExpenseCategories, financeExpensePaymentMethods, type FinanceExpenseFormValues, type FinanceExpenseItem} from "@/src/types/finance-expense";
import {storeDate} from "@/src/utils/storeTime";
import {financeExpenseSchema} from "../finance-expense.schema";
import {useFinanceExpenseMediaUpload} from "../hooks/useFinanceExpenseMediaUpload";
import {FinanceEntryDialogShell, FinanceEntryField, useFinanceEntryPreview} from "./FinanceEntryDialogShell";

const defaults = (): FinanceExpenseFormValues => ({party: "", accountId: "", amount: 0, paymentMethod: "微信", businessType: "其他支出", referenceNo: "", date: storeDate(), remarks: "", images: []});

type FinanceExpenseDialogProps = {
  open: boolean;
  item: FinanceExpenseItem | null;
  accounts: FinanceAccountItem[];
  pending: boolean;
  error?: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: FinanceExpenseFormValues) => Promise<void>;
};

export function FinanceExpenseDialog({open, item, accounts, pending, error, onOpenChange, onSubmit}: FinanceExpenseDialogProps) {
  const {preview, setPreview} = useFinanceEntryPreview();
  const form = useForm<FinanceExpenseFormValues>({defaultValues: defaults(), resolver: zodResolver(financeExpenseSchema), mode: "onBlur"});
  const media = useFinanceExpenseMediaUpload((urls) => form.setValue("images", urls, {shouldDirty: true, shouldValidate: true}));

  useEffect(() => {
    if (!open) return;
    const values: FinanceExpenseFormValues = item
      ? {
        party: item.party,
        accountId: item.accountId,
        amount: item.amount,
        paymentMethod: item.paymentMethod,
        businessType: financeExpenseCategories.includes(item.businessType as typeof financeExpenseCategories[number])
          ? item.businessType as typeof financeExpenseCategories[number]
          : "其他支出",
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
      title={item ? "编辑非经营支出" : "新增非经营支出"}
      description="只登记非采购、非退款流程自动生成的临时支出；保存后由后端同步账户和财务流水。"
      submitLabel={media.blocking ? "请处理图片状态" : pending ? "保存中…" : item ? "保存修改" : "登记支出"}
      submitDisabled={media.blocking}
      error={error}
      preview={preview}
      previewAlt="支出凭证预览"
      onOpenChange={onOpenChange}
      onSubmit={(event) => { void form.handleSubmit(onSubmit)(event); }}
      onPreviewChange={setPreview}
    >
      <FinanceEntryField label="支出对象" error={form.formState.errors.party?.message}>
        <Input {...form.register("party")} placeholder="例如：员工、物流、平台" disabled={pending} />
      </FinanceEntryField>
      <FinanceEntryField label="支出类型" error={form.formState.errors.businessType?.message}>
        <Controller
          control={form.control}
          name="businessType"
          render={({field}) => <Select value={field.value} onValueChange={field.onChange} options={financeExpenseCategories.map((value) => ({value, label: value}))} disabled={pending} aria-label="支出类型" />}
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
              placeholder="请选择出账账户"
              aria-label="支出账户"
            />
          )}
        />
      </FinanceEntryField>
      <FinanceEntryField label="支付方式" error={form.formState.errors.paymentMethod?.message}>
        <Controller
          control={form.control}
          name="paymentMethod"
          render={({field}) => <Select value={field.value} onValueChange={field.onChange} options={financeExpensePaymentMethods.map((value) => ({value, label: value}))} disabled={pending} aria-label="支付方式" />}
        />
      </FinanceEntryField>
      <FinanceEntryField label="金额" error={form.formState.errors.amount?.message}>
        <Controller
          control={form.control}
          name="amount"
          render={({field}) => <ErpAmountInput value={field.value} onValueChange={(value) => field.onChange(value.floatValue || 0)} disabled={pending} aria-label="支出金额" />}
        />
      </FinanceEntryField>
      <FinanceEntryField label="日期" error={form.formState.errors.date?.message}>
        <Controller
          control={form.control}
          name="date"
          render={({field}) => <ErpDatePicker value={field.value} onChange={field.onChange} disabled={pending} aria-label="支出日期" />}
        />
      </FinanceEntryField>
      <FinanceEntryField label="外部参考号（选填）" error={form.formState.errors.referenceNo?.message}>
        <Input {...form.register("referenceNo")} placeholder="票据号、物流单号等；不是 ERP 关联单号" disabled={pending} />
      </FinanceEntryField>
      <FinanceEntryField label="备注（选填）" error={form.formState.errors.remarks?.message}>
        <Textarea {...form.register("remarks")} className="min-h-20" maxLength={300} disabled={pending} placeholder="说明用途、审批或核对信息" />
      </FinanceEntryField>
      <div className="md:col-span-2">
        <ErpUploader
          items={media.items}
          maxCount={6}
          accept={media.accept}
          disabled={pending}
          description="上传报销、付款或支出凭证；统一压缩到约 100KB 后保存真实媒体 URL。"
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
