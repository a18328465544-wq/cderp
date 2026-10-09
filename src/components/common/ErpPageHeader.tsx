import {Children, Fragment, isValidElement, useState, type ReactNode} from "react";
import {MoreHorizontal, RefreshCw} from "lucide-react";
import {Button} from "@/src/components/ui";
import {useErpPhone} from "@/src/hooks/useErpViewport";
import {ErpDialogShell} from "./ErpDialogShell";
import {cn} from "@/src/lib/cn";
import {QuickStatusGroup, type QuickStatusItemData, type QuickStatusVariant} from "./ErpQuickStatus";
import {ErpPageActions, ErpPageContext, ErpPageIdentity, ErpPageTopbar} from "./ErpPageFrame";

export interface ErpPageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /**
   * High-density pages omit explanatory copy by default. Opt into the default
   * header only when the line changes a decision or communicates a safety
   * constraint (for example, a form workflow or a permission boundary).
   */
  density?: "compact" | "default";
  quickStatus?: ReadonlyArray<QuickStatusItemData>;
  quickStatusVariant?: QuickStatusVariant;
  dateContent?: ReactNode;
  actions?: ReactNode;
  /** Caller-owned back action; used by native phone task headers. */
  leading?: ReactNode;
}

export function isRefreshAction(element: ReactNode): boolean {
  if (!isValidElement(element)) return false;
  const props = element.props as {children?: ReactNode; "aria-label"?: string; title?: string; "data-erp-action"?: string};
  if (props["data-erp-action"] === "refresh") return true;
  if (typeof props["aria-label"] === "string" && props["aria-label"].includes("刷新")) return true;
  if (typeof props.title === "string" && props.title.includes("刷新")) return true;
  const text = Children.toArray(props.children).filter((c): c is string => typeof c === "string").join("");
  if (text.includes("刷新")) return true;
  const hasRefreshIcon = Children.toArray(props.children).some((c) => isValidElement(c) && (c.type === RefreshCw || (typeof c.type === "function" && c.type.name === "RefreshCw") || (c.type as {displayName?: string})?.displayName === "RefreshCw"));
  return hasRefreshIcon;
}

export function resolvePhonePageActions(actions: ReactNode): ReactNode[] {
  return Children.toArray(actions).flatMap((child) => isValidElement<{children?: ReactNode}>(child) && (child.type === Fragment || child.type === "div") ? resolvePhonePageActions(child.props.children) : [child]);
}

export function ErpPageHeader({title, subtitle, density = "compact", quickStatus, quickStatusVariant = "compact", dateContent, actions, leading}: ErpPageHeaderProps) {
  const phone = useErpPhone();
  const [moreOpen, setMoreOpen] = useState(false);
  const rawActions = resolvePhonePageActions(actions);
  const actionItems = phone ? rawActions.filter((item) => !isRefreshAction(item)) : rawActions;
  const primaryIndex = actionItems.findIndex((item) => isValidElement<{variant?: string}>(item) && item.props.variant === "primary");
  const primary = actionItems[primaryIndex < 0 ? 0 : primaryIndex];
  const secondary = actionItems.filter((_, index) => index !== (primaryIndex < 0 ? 0 : primaryIndex));
  const hasQuickStatus = Boolean(quickStatus?.length);
  const showSubtitle = density === "default" && !phone;
  const rightArea = dateContent || actions ? <ErpPageActions className={hasQuickStatus ? "lg:w-full xl:w-auto" : undefined}>{dateContent}{phone && secondary.length ? <>{primary}<Button type="button" variant="ghost" size="icon" aria-label="更多页面操作" onClick={() => setMoreOpen(true)}><MoreHorizontal className="h-5 w-5" /></Button></> : actions}</ErpPageActions> : null;
  return <><ErpPageTopbar
    data-erp-component="page-header"
    data-density={density}
    // The persistent sidebar leaves a narrow canvas at tablet widths. Keep
    // the identity, quick-status strip, and actions in a readable stack until
    // the wide desktop canvas is available; otherwise short titles wrap into
    // two lines beside a partially wrapped status strip.
    className={cn(density === "default" && "gap-4", hasQuickStatus && "xl:grid xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.8fr)_auto] xl:items-center xl:gap-4")}
  >
    {leading && <div className="shrink-0">{leading}</div>}
    <ErpPageIdentity title={title} subtitle={showSubtitle ? subtitle : undefined} reserveSubtitle={showSubtitle && Boolean(subtitle)} />
    {hasQuickStatus ? <ErpPageContext><QuickStatusGroup items={quickStatus!} variant={quickStatusVariant} className="min-w-0" /></ErpPageContext> : null}
    {rightArea}
  </ErpPageTopbar>{phone && secondary.length > 0 && <ErpDialogShell open={moreOpen} onOpenChange={setMoreOpen} title="页面操作" mobilePresentation="sheet"><div className="erp-phone-action-menu">{secondary}</div></ErpDialogShell>}</>;
}
