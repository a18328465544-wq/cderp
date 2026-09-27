import {AlertCircle, RefreshCw} from "lucide-react";
import {Button, Card, CardContent} from "@/src/components/ui";

export function ErpPageError({title = "页面加载失败", description, requestId, onRetry}: {title?: string; description: string; requestId?: string; onRetry?: () => void}) {
  return <Card><CardContent className="flex flex-col items-center gap-3 p-8 text-center"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--erp-color-danger-soft)] text-[var(--erp-color-danger)]"><AlertCircle className="h-5 w-5" /></span><h2 className="text-base font-semibold">{title}</h2><p className="max-w-md text-sm text-[var(--erp-color-text-secondary)]">{description}</p>{requestId && <p className="text-xs text-[var(--erp-color-text-muted)]">请求 ID：<code className="rounded bg-[var(--erp-color-surface-muted)] px-1.5 py-0.5 erp-data-number">{requestId}</code></p>}{onRetry && <Button size="sm" onClick={onRetry}><RefreshCw className="h-4 w-4" />重试</Button>}</CardContent></Card>;
}
