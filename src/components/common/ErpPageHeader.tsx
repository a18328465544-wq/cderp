import type {ReactNode} from "react";
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
}

export function ErpPageHeader({title, subtitle, density = "compact", quickStatus, quickStatusVariant = "compact", dateContent, actions}: ErpPageHeaderProps) {
  const hasQuickStatus = Boolean(quickStatus?.length);
  const showSubtitle = density === "default";
  const rightArea = dateContent || actions ? <ErpPageActions className={hasQuickStatus ? "lg:w-full xl:w-auto" : undefined}>{dateContent}{actions}</ErpPageActions> : null;
  return <ErpPageTopbar
    data-erp-component="page-header"
    data-density={density}
    // The persistent sidebar leaves a narrow canvas at tablet widths. Keep
    // the identity, quick-status strip, and actions in a readable stack until
    // the wide desktop canvas is available; otherwise short titles wrap into
    // two lines beside a partially wrapped status strip.
    className={cn(density === "default" && "gap-4", hasQuickStatus && "xl:grid xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.8fr)_auto] xl:items-center xl:gap-4")}
  >
    <ErpPageIdentity title={title} subtitle={showSubtitle ? subtitle : undefined} reserveSubtitle={showSubtitle && Boolean(subtitle)} />
    {hasQuickStatus ? <ErpPageContext><QuickStatusGroup items={quickStatus!} variant={quickStatusVariant} className="min-w-0" /></ErpPageContext> : null}
    {rightArea}
  </ErpPageTopbar>;
}
