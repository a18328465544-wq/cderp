import {ArrowRight, MoreHorizontal} from "lucide-react";
import {useState, type ReactNode} from "react";
import {cn} from "@/src/lib/cn";
import {Popover} from "@/src/components/ui";

export type QuickStatusTone = "neutral" | "info" | "success" | "warning" | "danger";
export type QuickStatusVariant = "compact" | "workflow";

export interface QuickStatusItemData {
  icon: ReactNode;
  label: ReactNode;
  value: ReactNode;
  /** Semantic tone used for status color and accessibility context. */
  tone?: QuickStatusTone;
  /** Optional supporting copy; compact mode exposes it through the item tooltip. */
  description?: ReactNode;
  tooltip?: string;
  /** Optional workflow action. */
  action?: () => void;
}

const toneClasses: Record<QuickStatusTone, {icon: string; value: string}> = {
  neutral: {icon: "bg-[var(--erp-color-surface-muted)] text-[var(--erp-color-text-secondary)]", value: "text-[var(--erp-color-text)]"},
  info: {icon: "bg-[var(--erp-color-info-soft)] text-[var(--erp-color-primary)]", value: "text-[var(--erp-color-primary)]"},
  success: {icon: "bg-[var(--erp-color-success-soft)] text-[var(--erp-color-success)]", value: "text-[var(--erp-color-success)]"},
  warning: {icon: "bg-[var(--erp-color-warning-soft)] text-[var(--erp-color-warning)]", value: "text-[var(--erp-color-warning)]"},
  danger: {icon: "bg-[var(--erp-color-danger-soft)] text-[var(--erp-color-danger)]", value: "text-[var(--erp-color-danger)]"},
};

function resolveTone(item: QuickStatusItemData): QuickStatusTone {
  return item.tone ?? "neutral";
}

function resolveTooltip(item: QuickStatusItemData) {
  if (item.tooltip) return item.tooltip;
  return typeof item.description === "string" ? item.description : undefined;
}

export function QuickStatusItem({item, variant = "compact"}: {item: QuickStatusItemData; variant?: QuickStatusVariant}) {
  const tone = toneClasses[resolveTone(item)];
  const action = item.action;
  const tooltip = resolveTooltip(item);
  const compact = variant === "compact";
  const content = compact ? <>
    <span className={cn("flex h-[var(--erp-quick-status-icon-size)] w-[var(--erp-quick-status-icon-size)] shrink-0 items-center justify-center rounded-full", tone.icon)} aria-hidden="true">{item.icon}</span>
    <span className={cn("erp-data-number min-w-0 truncate text-sm font-semibold", tone.value)}>{item.value}</span>
    <span className="min-w-0 truncate text-xs font-medium text-[var(--erp-color-text-secondary)]">{item.label}</span>
  </> : <>
    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", tone.icon)} aria-hidden="true">{item.icon}</span>
    <span className="min-w-0 flex-1">
      <span className="block truncate text-xs font-medium text-[var(--erp-color-text-secondary)]">{item.label}</span>
      <span className={cn("erp-data-number mt-0.5 block truncate text-sm font-semibold", tone.value)}>{item.value}</span>
      {item.description ? <span className="erp-annotation-slot mt-0.5 text-xs text-[var(--erp-color-text-muted)]">{item.description}</span> : null}
    </span>
    {action ? <ArrowRight className="h-4 w-4 shrink-0 text-[var(--erp-color-text-muted)]" aria-hidden="true" /> : null}
  </>;

  const className = compact
    ? "erp-focus-ring inline-flex min-h-[var(--erp-quick-status-height)] max-w-full min-w-0 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[var(--erp-radius-md)] px-1.5 py-1 text-left"
    : "erp-focus-ring flex min-w-0 items-center gap-2 rounded-[var(--erp-radius-md)] px-3 py-2 text-left";

  if (!action) return <div data-erp-component="quick-status-item" data-variant={variant} className={className} title={tooltip}>{content}</div>;
  return <button data-erp-component="quick-status-item" data-variant={variant} type="button" onClick={action} className={cn(className, "transition-colors hover:bg-[var(--erp-color-surface-muted)]")} title={tooltip}>{content}</button>;
}

function QuickStatusOverflow({items, variant, expanded, onOpenChange}: {items: ReadonlyArray<QuickStatusItemData>; variant: QuickStatusVariant; expanded: boolean; onOpenChange: (open: boolean) => void}) {
  if (!items.length) return null;
  return <Popover.Root open={expanded} onOpenChange={onOpenChange}>
    <Popover.Trigger className="erp-focus-ring inline-flex min-h-[var(--erp-quick-status-height)] items-center gap-1 rounded-[var(--erp-radius-sm)] px-2 text-xs font-medium text-[var(--erp-color-primary)] hover:bg-[var(--erp-color-surface-muted)]">更多 {items.length}<MoreHorizontal className="h-3.5 w-3.5" /></Popover.Trigger>
    <Popover.Portal>
      <Popover.Positioner className="outline-none" sideOffset={6} align="end">
        <Popover.Popup className="w-72 max-w-[calc(100vw-1.5rem)] rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-2 shadow-[var(--erp-shadow-popover)] outline-none">{items.map((item, index) => <QuickStatusItem key={index} item={item} variant={variant} />)}</Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  </Popover.Root>;
}

export interface QuickStatusGroupProps {
  items: ReadonlyArray<QuickStatusItemData>;
  maxVisible?: 1 | 2 | 3 | 4;
  className?: string;
  variant?: QuickStatusVariant;
}

export function QuickStatusGroup({items, maxVisible = 4, className, variant = "compact"}: QuickStatusGroupProps) {
  const [expanded, setExpanded] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  if (!items.length) return null;

  const visible = items.slice(0, maxVisible);
  const overflow = items.slice(visible.length);

  if (variant === "workflow") {
    const first = visible[0]!;
    return <div data-erp-component="quick-status-group" data-variant="workflow" className={cn("relative min-w-0 sm:flex sm:items-center sm:gap-2", className)}>
      <div className="hidden min-w-0 flex-1 grid-cols-1 gap-2 sm:grid sm:grid-cols-2 xl:grid-cols-4">
        {visible.map((item, index) => <QuickStatusItem key={index} item={item} variant="workflow" />)}
      </div>
      <div className="flex min-w-0 items-center gap-2 sm:hidden">
        <div className="min-w-0 flex-1"><QuickStatusItem item={first} variant="workflow" /></div>
        {items.length > 1 ? <Popover.Root open={mobileExpanded} onOpenChange={setMobileExpanded}>
          <Popover.Trigger className="erp-focus-ring inline-flex h-9 shrink-0 items-center gap-1 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-2.5 text-xs font-medium text-[var(--erp-color-text-secondary)]"><MoreHorizontal className="h-4 w-4" />{items.length - 1} 项</Popover.Trigger>
          <Popover.Portal><Popover.Positioner className="outline-none" sideOffset={6} align="end"><Popover.Popup className="w-full min-w-0 rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-2 shadow-[var(--erp-shadow-popover)] outline-none sm:min-w-[260px]">{items.slice(1).map((item, index) => <QuickStatusItem key={index} item={item} variant="workflow" />)}</Popover.Popup></Popover.Positioner></Popover.Portal>
        </Popover.Root> : null}
      </div>
      <div className="hidden shrink-0 items-center justify-end sm:flex"><QuickStatusOverflow items={overflow} variant="workflow" expanded={expanded} onOpenChange={setExpanded} /></div>
    </div>;
  }

  return <div data-erp-component="quick-status-group" data-variant="compact" className={cn("relative flex min-w-0 flex-wrap items-center gap-x-[var(--erp-quick-status-gap)] gap-y-1", className)}>
    {visible.map((item, index) => <QuickStatusItem key={index} item={item} variant="compact" />)}
    <QuickStatusOverflow items={overflow} variant="compact" expanded={expanded} onOpenChange={setExpanded} />
  </div>;
}
