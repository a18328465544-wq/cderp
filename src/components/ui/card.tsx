import type {HTMLAttributes, ReactNode} from "react";
import {cn} from "@/src/lib/cn";

export function Card({className, children, "data-erp-component": dataComponent = "card", ...props}: HTMLAttributes<HTMLElement> & {children: ReactNode; "data-erp-component"?: string}) {
  return <section {...props} data-erp-component={dataComponent} className={cn("erp-card-surface min-w-0 border", className)}>{children}</section>;
}

export function CardHeader({className, children, ...props}: HTMLAttributes<HTMLDivElement> & {children: ReactNode}) {
  return <div {...props} data-erp-region="card-header" className={cn("flex min-w-0 flex-wrap items-start justify-between gap-3 border-b border-[var(--erp-color-border-soft)] px-[var(--erp-card-padding)] py-4 [&>*]:min-w-0 sm:flex-nowrap", className)}>{children}</div>;
}

export function CardContent({className, children, ...props}: HTMLAttributes<HTMLDivElement> & {children: ReactNode}) {
  return <div {...props} data-erp-region="card-content" className={cn("min-w-0 p-[var(--erp-card-padding)]", className)}>{children}</div>;
}
