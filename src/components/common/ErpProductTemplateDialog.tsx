import {zodResolver} from "@hookform/resolvers/zod";
import {useEffect, useMemo, useState, type ReactNode} from "react";
import {Controller, useForm} from "react-hook-form";
import {Sparkles} from "lucide-react";
import {Button, Input, Textarea} from "@/src/components/ui";
import {ErpAmountInput} from "./ErpAmountInput";
import {ErpDialogShell} from "./ErpDialogShell";
import {ErpField} from "./ErpField";
import {ErpImagePreviewDialog} from "./ErpImagePreviewDialog";
import {ErpUploader} from "./ErpUploader";
import type {ProductCategory} from "@/src/types/core";
import type {ProductLibraryItem, ProductTemplateFormValues} from "@/src/types/product";
import {buildProductTemplateName} from "@/src/lib/productName";
import {productCategoryValues, productTemplateSchema} from "./productTemplateSchema";
import {getProductTemplateFields, type ProductTemplateFieldKey} from "./productTemplateFieldConfig";
import {useProductMediaUpload} from "./useProductMediaUpload";

const emptyValues: ProductTemplateFormValues = {category: "显卡", brand: "", model: "", version: "", vram: "", refBuyPrice: 0, refSellPrice: 0, remarks: "", imageUrls: []};
const textFieldKeys: readonly ProductTemplateFieldKey[] = ["brand", "model", "version", "vram"];

function valuesFromProduct(product: ProductLibraryItem | null, initialValues?: Partial<ProductTemplateFormValues>): ProductTemplateFormValues {
  const base = product ? {category: product.category, brand: product.brand, model: product.model, version: product.version === "-" ? "" : product.version, vram: product.vram === "-" ? "" : product.vram, refBuyPrice: product.refBuyPrice || 0, refSellPrice: product.refSellPrice || 0, remarks: product.remarks || "", imageUrls: product.imageUrls} : {...emptyValues, imageUrls: []};
  return {...base, ...initialValues, imageUrls: initialValues?.imageUrls ?? base.imageUrls};
}

export interface ErpProductTemplateDialogProps {
  open: boolean;
  product: ProductLibraryItem | null;
  /** Optional values used by a caller such as a search-to-create flow. */
  initialValues?: Partial<ProductTemplateFormValues>;
  showCost: boolean;
  showProfit: boolean;
  pending: boolean;
  error?: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: ProductTemplateFormValues) => Promise<void>;
}

/**
 * The single Product Library template editor for create and edit flows.
 * Feature pages own only the mutation and post-submit behavior; fields,
 * validation, media handling and permission presentation stay here.
 */
export function ErpProductTemplateDialog({open, product, initialValues, showCost, showProfit, pending, error, onOpenChange, onSubmit}: ErpProductTemplateDialogProps) {
  const form = useForm<ProductTemplateFormValues>({defaultValues: emptyValues, resolver: zodResolver(productTemplateSchema), mode: "onBlur"});
  const {control, register, reset, handleSubmit, setValue, watch, formState} = form;
  const setImageUrls = (urls: string[]) => setValue("imageUrls", urls, {shouldDirty: true, shouldValidate: true});
  const media = useProductMediaUpload(setImageUrls);
  const [previewUrl, setPreviewUrl] = useState<string>();
  const values = watch();
  const fieldDefinitions = useMemo(() => getProductTemplateFields(values.category), [values.category]);
  const previewName = useMemo(() => {
    const brand = values.brand.trim();
    const model = values.model.trim();
    if (!brand || !model) return "填写品牌、型号等核心信息后自动生成";
    return buildProductTemplateName(brand, model, values.version || "", values.vram || "");
  }, [values.brand, values.model, values.version, values.vram]);

  useEffect(() => {
    if (!open) return;
    const next = valuesFromProduct(product, initialValues);
    reset(next);
    media.reset(next.imageUrls);
    setPreviewUrl(undefined);
  }, [initialValues, open, product, reset, media.reset]);

  const message = (field: keyof ProductTemplateFormValues) => formState.errors[field]?.message ? String(formState.errors[field]?.message) : undefined;
  const handleCategoryChange = (nextCategory: ProductCategory, onChange: (value: ProductCategory) => void) => {
    onChange(nextCategory);
    const visible = new Set(getProductTemplateFields(nextCategory).map((definition) => definition.key));
    textFieldKeys.forEach((key) => {
      if (!visible.has(key)) setValue(key, "", {shouldDirty: true, shouldValidate: true});
    });
  };

  const formId = "product-template-form";
  return <>
    <ErpDialogShell
      open={open}
      onOpenChange={onOpenChange}
      pending={pending}
      size="xl"
      title={<span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-[var(--erp-color-primary)]" />{product ? "编辑商品规格模板" : "新建商品规格模板"}</span>}
      description="用于采购、销售、检测和库存共用；标准名称由核心字段自动生成。"
      footer={<><Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>取消</Button><Button form={formId} type="submit" variant="primary" disabled={pending || media.blocking}>{pending ? "保存中…" : media.blocking ? "等待图片处理" : product ? "保存修改" : "保存模板"}</Button></>}
    >
      <form id={formId} onSubmit={(event) => {void handleSubmit(onSubmit)(event);}} className="space-y-4">
        <section className="rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)]/45 p-3 sm:p-4" aria-labelledby="product-category-title">
          <div className="mb-2 flex items-center justify-between gap-3"><h2 id="product-category-title" className="text-sm font-semibold text-[var(--erp-color-text)]">商品分类</h2><span className="text-xs text-[var(--erp-color-text-muted)]">当前：{values.category}</span></div>
          <Controller control={control} name="category" render={({field}) => <div className="flex flex-wrap gap-2">{productCategoryValues.map((category) => <Button key={category} type="button" size="sm" variant={field.value === category ? "primary" : "secondary"} className={field.value === category ? "shadow-sm" : "bg-[var(--erp-color-surface)]"} onClick={() => handleCategoryChange(category, field.onChange)} disabled={pending} aria-pressed={field.value === category}>{category}</Button>)}</div>} />
        </section>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
          <section className="rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-4" aria-labelledby="product-basic-title">
            <div className="mb-4"><h2 id="product-basic-title" className="text-sm font-semibold text-[var(--erp-color-text)]">基本信息</h2><p className="mt-1 text-xs text-[var(--erp-color-text-secondary)]">填写可识别商品身份的核心字段。</p></div>
            <div className="grid gap-3 sm:grid-cols-2">{fieldDefinitions.map((definition, index) => <Field key={definition.key} label={definition.label} required={definition.required} error={message(definition.key)}><Input {...register(definition.key)} placeholder={definition.placeholder} disabled={pending} autoFocus={index === 0} /></Field>)}</div>
            <div className="mt-4 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)] px-3 py-3" aria-live="polite"><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-[var(--erp-color-text-secondary)]">标准商品名称</p><span className="text-xs text-[var(--erp-color-text-muted)]">系统生成预览</span></div><p className={`mt-1 truncate text-sm font-semibold ${previewName.startsWith("填写") ? "text-[var(--erp-color-text-muted)]" : "text-[var(--erp-color-text)]"}`} title={previewName}>{previewName}</p></div>
          </section>

          <section className="rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-4" aria-labelledby="product-supplement-title">
            <div className="mb-4"><h2 id="product-supplement-title" className="text-sm font-semibold text-[var(--erp-color-text)]">补充信息</h2><p className="mt-1 text-xs text-[var(--erp-color-text-secondary)]">价格和备注为可选信息。</p></div>
            <div className="space-y-3">
              {showCost ? <Field label="建议回收买入价" error={message("refBuyPrice")}><Controller control={control} name="refBuyPrice" render={({field}) => <ErpAmountInput value={field.value} onBlur={field.onBlur} onValueChange={(detail) => field.onChange(detail.floatValue || 0)} disabled={pending} aria-label="建议回收买入价" />} /></Field> : <PermissionNotice>当前账号无参考成本查看权限，该字段按 0 提交。</PermissionNotice>}
              {showProfit ? <Field label="建议销售卖出价" error={message("refSellPrice")}><Controller control={control} name="refSellPrice" render={({field}) => <ErpAmountInput value={field.value} onBlur={field.onBlur} onValueChange={(detail) => field.onChange(detail.floatValue || 0)} disabled={pending} aria-label="建议销售卖出价" />} /></Field> : <PermissionNotice>当前账号无参考利润查看权限，该字段按 0 提交。</PermissionNotice>}
              <Field label="备注"><Textarea {...register("remarks")} className="min-h-24" maxLength={300} placeholder="补充回收、质检或包装提示" disabled={pending} /></Field>
            </div>
          </section>
        </div>

        <section className="rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-4" aria-labelledby="product-images-title">
          <div className="mb-3"><h2 id="product-images-title" className="text-sm font-semibold text-[var(--erp-color-text)]">商品图片</h2><p className="mt-1 text-xs text-[var(--erp-color-text-secondary)]">可选，最多 6 张；支持 JPG、PNG、WEBP。</p></div>
          <ErpUploader items={media.items} maxCount={6} accept={media.accept} disabled={pending} showHeading={false} compact description="外观、包装和规格图片" uploadedDescription="图片已上传，等待随商品模板保存" footerDescription={`已选择 ${media.items.length} / 6 张；图片会在上传前压缩到约 100KB。`} error={media.error} onFilesSelected={media.addFiles} onRetry={media.retry} onRemove={media.remove} onPreview={(item) => setPreviewUrl(item.previewUrl)} />
        </section>
        {error && <p role="alert" className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] px-3 py-2 text-xs text-[var(--erp-color-danger)]">{error}</p>}
      </form>
    </ErpDialogShell>
    <ErpImagePreviewDialog open={Boolean(previewUrl)} src={previewUrl} alt="商品图片预览" title="商品图片预览" onOpenChange={(next) => {if (!next) setPreviewUrl(undefined);}} />
  </>;
}

function Field({label, required = false, error, children}: {label: string; required?: boolean; error?: string; children: ReactNode}) {
  return <ErpField label={label} required={required} error={error}>{children}</ErpField>;
}

function PermissionNotice({children}: {children: ReactNode}) {
  return <div className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-warning-soft)] px-3 py-2 text-xs leading-5 text-[var(--erp-color-warning)]">{children}</div>;
}
