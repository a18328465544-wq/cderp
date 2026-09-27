import {AlertCircle, CheckCircle2, ImagePlus, LoaderCircle, Maximize2, RotateCw, Trash2, UploadCloud} from "lucide-react";
import {useRef, type ChangeEvent} from "react";
import {Button} from "@/src/components/ui";
import {ErpStatusBadge} from "./ErpStatusBadge";

export type ErpUploaderItemStatus = "local" | "compressing" | "uploading" | "uploaded" | "failed";

export interface ErpUploaderItem {
  id: string;
  name: string;
  previewUrl?: string;
  status: ErpUploaderItemStatus;
  error?: string;
  sizeBytes?: number;
  compressedBytes?: number;
}

export interface ErpUploaderProps {
  items: ErpUploaderItem[];
  maxCount: number;
  accept: string;
  disabled?: boolean;
  description?: string;
  uploadedDescription?: string;
  footerDescription?: string;
  error?: string;
  onFilesSelected: (files: File[]) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onPreview?: (item: ErpUploaderItem) => void;
  /** Allows a feature section to provide its own heading without duplicating it. */
  showHeading?: boolean;
  compact?: boolean;
}

const statusLabel: Record<ErpUploaderItemStatus, string> = {
  local: "待上传",
  compressing: "压缩中",
  uploading: "上传中",
  uploaded: "已上传",
  failed: "上传失败",
};

const statusTone: Record<ErpUploaderItemStatus, "neutral" | "info" | "success" | "warning" | "danger"> = {
  local: "neutral",
  compressing: "info",
  uploading: "info",
  uploaded: "success",
  failed: "danger",
};

function formatBytes(bytes: number | undefined): string {
  if (!bytes || bytes < 1_024) return bytes ? `${bytes}B` : "";
  return `${(bytes / 1_024).toFixed(1)}KB`;
}

export function ErpUploader({items, maxCount, accept, disabled = false, description, uploadedDescription = "图片已上传，等待随业务记录保存", footerDescription, error, onFilesSelected, onRetry, onRemove, onPreview, showHeading = true, compact = false}: ErpUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const selectFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (files.length) onFilesSelected(files);
  };

  return <div className={compact ? "space-y-2" : "space-y-3"}>
    <input ref={inputRef} className="sr-only" type="file" accept={accept} multiple onChange={selectFiles} disabled={disabled || items.length >= maxCount} />
    {showHeading ? <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[var(--erp-color-text)]">图片附件</p>
        <p className="mt-1 text-xs text-[var(--erp-color-text-muted)]">{description || `支持 JPG、PNG、WEBP，最多 ${maxCount} 张。`}</p>
      </div>
      <Button type="button" size="sm" variant="secondary" onClick={() => inputRef.current?.click()} disabled={disabled || items.length >= maxCount}>
        <UploadCloud className="h-4 w-4" />选择图片
      </Button>
    </div> : <div className="flex justify-end"><Button type="button" size="sm" variant="secondary" onClick={() => inputRef.current?.click()} disabled={disabled || items.length >= maxCount}><UploadCloud className="h-4 w-4" />添加图片</Button></div>}

    {error && <p role="alert" className="flex items-start gap-2 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] px-3 py-2 text-xs text-[var(--erp-color-danger)]"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}

    {items.length === 0 ? <div className={`flex items-center justify-center rounded-[var(--erp-radius-md)] border border-dashed border-[var(--erp-color-border-strong)] bg-[var(--erp-color-surface-muted)]/50 px-4 text-center text-xs text-[var(--erp-color-text-muted)] ${compact ? "min-h-16" : "min-h-24"}`}><ImagePlus className="mr-2 h-4 w-4" />选择外观、包装、快递或回收凭证图片</div> : <div className={compact ? "grid gap-2 sm:grid-cols-3 xl:grid-cols-6" : "grid gap-3 sm:grid-cols-2 xl:grid-cols-3"}>
      {items.map((item) => <div key={item.id} className="overflow-hidden rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)]">
        <div className={`relative bg-[var(--erp-color-surface-muted)] ${compact ? "aspect-square" : "aspect-[4/3]"}`}>
          {item.previewUrl ? <img src={item.previewUrl} alt={item.name} loading="lazy" decoding="async" className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center text-[var(--erp-color-text-muted)]"><ImagePlus className="h-7 w-7" /></div>}
          <div className="absolute left-2 top-2"><ErpStatusBadge label={statusLabel[item.status]} tone={statusTone[item.status]} /></div>
          {item.status === "uploaded" && <div className="absolute right-2 top-2 rounded-full bg-[var(--erp-color-success-soft)] p-1 text-[var(--erp-color-success)]"><CheckCircle2 className="h-4 w-4" /></div>}
          {(item.status === "compressing" || item.status === "uploading") && <div className="absolute inset-0 flex items-center justify-center bg-[var(--erp-color-surface)]/70"><LoaderCircle className="h-6 w-6 animate-spin text-[var(--erp-color-primary)]" /></div>}
        </div>
        <div className={compact ? "space-y-1.5 p-2" : "space-y-2 p-3"}>
          <p className="truncate text-xs font-semibold text-[var(--erp-color-text)]" title={item.name}>{item.name}</p>
          <div className="flex items-center justify-between gap-2 text-xs text-[var(--erp-color-text-muted)]"><span>{formatBytes(item.compressedBytes || item.sizeBytes)}</span>{item.compressedBytes ? <span>压缩后</span> : null}</div>
          {item.error && <p role="alert" className="text-xs text-[var(--erp-color-danger)]">{item.error}</p>}
          {item.status === "uploaded" && <p className="text-xs text-[var(--erp-color-success)]">{uploadedDescription}</p>}
          <div className="flex items-center justify-end gap-1">
            {onPreview && <Button type="button" size="icon" variant="ghost" aria-label={`预览${item.name}`} title="预览" onClick={() => onPreview(item)} disabled={!item.previewUrl}><Maximize2 className="h-4 w-4" /></Button>}
            {item.status === "failed" && <Button type="button" size="icon" variant="ghost" aria-label={`重试${item.name}`} title="重试" onClick={() => onRetry(item.id)} disabled={disabled}><RotateCw className="h-4 w-4" /></Button>}
            <Button type="button" size="icon" variant="ghost" aria-label={`删除${item.name}`} title="删除" onClick={() => onRemove(item.id)} disabled={disabled || item.status === "uploading"}><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>)}
    </div>}
    <p className="text-xs text-[var(--erp-color-text-muted)]">{footerDescription || `已选择 ${items.length} / ${maxCount} 张。图片会在上传前压缩到约 100KB。`}</p>
  </div>;
}
