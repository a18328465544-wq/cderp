import type {HTMLAttributes, ReactNode} from "react";
import {cn} from "@/src/lib/cn";
import {ErpPageFrame, type ErpPageFrameDensity} from "./ErpPageFrame";

/**
 * Shared page-frame primitives. They only describe the work pattern of a page;
 * business data and actions stay in the feature that owns the page.
 */
type FrameProps = HTMLAttributes<HTMLDivElement> & {children: ReactNode};

function FrameBase({density = "standard", className, children, ...props}: FrameProps & {density?: ErpPageFrameDensity}) {
  return <ErpPageFrame {...props} density={density} className={className}>{children}</ErpPageFrame>;
}

export function ErpListPageFrame({className, children, ...props}: FrameProps) {
  return <FrameBase {...props} density="standard" data-page-frame="list" className={className}>{children}</FrameBase>;
}

export function ErpTransactionPageFrame({className, children, ...props}: FrameProps) {
  return <FrameBase {...props} density="compact" data-page-frame="transaction" className={className}>{children}</FrameBase>;
}

export function ErpTransactionColumns({className, children, ...props}: FrameProps) {
  return <div {...props} data-page-frame-region="transaction-columns" className={cn("grid min-w-0 items-start gap-3 xl:grid-cols-[minmax(0,1fr)_380px]", className)}>{children}</div>;
}

export function ErpTransactionPrimary({className, children, ...props}: FrameProps) {
  return <div {...props} data-page-frame-region="transaction-primary" className={cn("min-w-0 space-y-3", className)}>{children}</div>;
}

export function ErpTransactionSecondary({className, children, ...props}: FrameProps) {
  return <aside {...props} data-page-frame-region="transaction-secondary" className={cn("space-y-3 xl:sticky xl:top-20", className)}>{children}</aside>;
}

export function ErpWarehousePageFrame({className, children, ...props}: FrameProps) {
  return <FrameBase {...props} density="standard" data-page-frame="warehouse" className={className}>{children}</FrameBase>;
}

export function ErpFinancePageFrame({className, children, ...props}: FrameProps) {
  return <FrameBase {...props} density="standard" data-page-frame="finance" className={className}>{children}</FrameBase>;
}

export function ErpCrmPageFrame({className, children, ...props}: FrameProps) {
  return <FrameBase {...props} density="standard" data-page-frame="crm" className={className}>{children}</FrameBase>;
}

export function ErpAnalyticsPageFrame({className, children, ...props}: FrameProps) {
  return <ErpPageFrame {...props} density="standard" data-page-frame="analytics" data-analytics-layout="reference-v2" className={className}>{children}</ErpPageFrame>;
}

export function ErpDetailPageFrame({className, children, ...props}: FrameProps) {
  return <FrameBase {...props} density="standard" data-page-frame="detail" className={className}>{children}</FrameBase>;
}

export function ErpSettingsPageFrame({className, children, ...props}: FrameProps) {
  return <FrameBase {...props} density="standard" data-page-frame="settings" className={className}>{children}</FrameBase>;
}
