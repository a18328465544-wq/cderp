import {Children, isValidElement, useState, type HTMLAttributes, type ReactNode} from "react";
import {cn, hasMaxWidthUtilityClass} from "@/src/lib/cn";
import {useErpPhone} from "@/src/hooks/useErpViewport";
import {Button} from "@/src/components/ui";
import {ErpDialogShell} from "./ErpDialogShell";

/**
 * The shared outer page contract. It owns canvas width and first-level rhythm;
 * feature pages only provide the regions that have business meaning.
 */
export type ErpPageFrameDensity = "compact" | "standard" | "comfortable";

export interface ErpPageFrameProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  density?: ErpPageFrameDensity;
  /** On phones place the existing toolbar after the header, without duplicating it. */
  mobileSearchFirst?: boolean;
}

/** Stable React keys preserve control state when the viewport changes. DOM
 * order, reading order and keyboard focus order stay aligned on both layouts. */
export function resolvePageFrameChildren(children: ReactNode, phone: boolean, toolbarPosition = 1) {
  const regions = Children.toArray(children);
  const toolbarIndex = regions.findIndex((region) => isValidElement(region) && (region.type === ErpPageToolbar || typeof region.type === "function" && "mobileToolbar" in region.type && region.type.mobileToolbar === true));
  if (phone && toolbarIndex > toolbarPosition) {
    const [toolbar] = regions.splice(toolbarIndex, 1);
    if (toolbar !== undefined) regions.splice(toolbarPosition, 0, toolbar);
  }
  return regions;
}

function usePhoneSearchFirst(enabled: boolean) {
  const phone = useErpPhone();
  return enabled && phone;
}

const densityClasses: Record<ErpPageFrameDensity, string> = {
  compact: "space-y-[var(--erp-page-gap-compact)]",
  standard: "space-y-[var(--erp-page-gap)] xl:space-y-[var(--erp-page-gap-comfortable)]",
  comfortable: "space-y-[var(--erp-page-gap-comfortable)]",
};

export function ErpPageFrame({density = "standard", mobileSearchFirst = false, className, children, ...props}: ErpPageFrameProps) {
  const phone = usePhoneSearchFirst(mobileSearchFirst);
  const hasCustomMaxWidth = hasMaxWidthUtilityClass(className);
  return (
    <div
      {...props}
      data-erp-component="page-frame"
      data-page-density={density}
      className={cn(
        "mx-auto w-full pb-6",
        hasCustomMaxWidth ? undefined : "max-w-[var(--erp-page-max-width)]",
        densityClasses[density],
        className,
      )}
    >
      {mobileSearchFirst ? resolvePageFrameChildren(children, phone) : children}
    </div>
  );
}

export interface ErpPageTopbarProps extends HTMLAttributes<HTMLElement> {
  children?: ReactNode;
}

export function ErpPageTopbar({className, children, ...props}: ErpPageTopbarProps) {
  return (
    <header {...props} data-erp-region="page-topbar" className={cn("flex min-w-0 max-w-full flex-col gap-3 xl:flex-row xl:items-center xl:justify-between", className)}>
      {children}
    </header>
  );
}

export interface ErpPageIdentityProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  subtitle?: ReactNode;
  reserveSubtitle?: boolean;
  children?: ReactNode;
}

export function ErpPageIdentity({title, subtitle, reserveSubtitle = false, className, children, ...props}: ErpPageIdentityProps) {
  return (
    <div {...props} data-erp-region="page-identity" className={cn("min-w-0", className)}>
      {title ? <h1 className="min-w-0 max-w-full break-normal text-erp-xl font-semibold tracking-tight text-[var(--erp-color-text)] sm:text-erp-2xl">{title}</h1> : null}
      {(subtitle || reserveSubtitle) ? <p className="erp-annotation-slot mt-1 max-w-3xl text-sm text-[var(--erp-color-text-secondary)]" data-empty={!subtitle || undefined} aria-hidden={!subtitle || undefined}>{subtitle || "\u00a0"}</p> : null}
      {children}
    </div>
  );
}

export function ErpPageTabs({className, children, ...props}: HTMLAttributes<HTMLElement> & {children?: ReactNode}) {
  return <nav {...props} data-erp-region="page-tabs" className={cn("erp-scrollbar min-w-0 max-w-full overflow-x-auto overscroll-x-contain", className)}>{children}</nav>;
}

export function ErpPageActions({className, children, ...props}: HTMLAttributes<HTMLDivElement> & {children?: ReactNode}) {
  return <div {...props} data-erp-region="page-actions" className={cn("flex min-w-0 max-w-full shrink-0 flex-wrap items-center justify-start gap-2 lg:justify-end", className)}>{children}</div>;
}

export function ErpPageContext({className, children, ...props}: HTMLAttributes<HTMLElement> & {children?: ReactNode}) {
  if (!children) return null;
  return <section {...props} data-erp-region="page-context" className={cn("min-w-0", className)}>{children}</section>;
}

export function ErpPageToolbar({className, children, ...props}: HTMLAttributes<HTMLElement> & {children?: ReactNode}) {
  if (!children) return null;
  return <section {...props} data-erp-region="page-toolbar" className={cn("min-w-0", className)}>{children}</section>;
}

/** A single alignment line between a list filter and its table. */
export function ErpTableResultsBar({summary, actions, className, ...props}: HTMLAttributes<HTMLElement> & {summary?: ReactNode; actions: ReactNode}) {
  const phone = useErpPhone();
  const [settingsOpen, setSettingsOpen] = useState(false);
  return <><section {...props} data-erp-region="table-results" className={cn("flex min-h-[var(--erp-control-height-filter)] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-2 sm:px-4", className)}>
    {summary ? <div data-erp-region="table-results-summary" className="min-w-0 text-xs text-[var(--erp-color-text-secondary)]">{summary}</div> : null}
    {phone ? <Button type="button" variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>列表设置</Button> : <div data-erp-region="table-results-actions" className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">{actions}</div>}
  </section>{phone && <ErpDialogShell open={settingsOpen} onOpenChange={setSettingsOpen} title="列表设置" mobilePresentation="sheet"><div className="flex flex-wrap gap-2">{actions}</div></ErpDialogShell>}</>;
}

export function ErpPageContent({className, children, mobileSearchFirst = true, ...props}: HTMLAttributes<HTMLElement> & {children?: ReactNode; mobileSearchFirst?: boolean}) {
  const phone = usePhoneSearchFirst(mobileSearchFirst);
  return <section {...props} data-erp-region="page-content" className={cn("min-w-0", className)}>{mobileSearchFirst ? resolvePageFrameChildren(children, phone, 0) : children}</section>;
}
