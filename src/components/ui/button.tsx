import {Button as BaseButton} from "@base-ui/react/button";
import type {ButtonHTMLAttributes, ReactNode} from "react";
import {cn} from "@/src/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "warning";
export type ButtonSize = "xs" | "sm" | "md" | "lg" | "icon" | "iconTouch";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-[var(--erp-color-primary)] text-white shadow-sm hover:bg-[var(--erp-color-primary-hover)]",
  secondary: "border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] text-[var(--erp-color-text)] hover:border-[var(--erp-color-border-strong)] hover:bg-[var(--erp-color-surface-muted)]",
  ghost: "text-[var(--erp-color-text-secondary)] hover:bg-[var(--erp-color-surface-muted)] hover:text-[var(--erp-color-text)]",
  danger: "bg-[var(--erp-color-danger)] text-white hover:brightness-95",
  warning: "bg-[var(--erp-color-warning)] text-white hover:brightness-95",
};

const sizes: Record<ButtonSize, string> = {
  xs: "h-7 gap-1 px-2 text-xs",
  sm: "h-[var(--erp-control-height-filter)] gap-1.5 px-3 text-xs",
  md: "h-10 gap-2 px-4 text-sm",
  lg: "h-11 gap-2 px-5 text-sm",
  icon: "h-9 w-9 justify-center p-0",
  iconTouch: "h-10 w-10 justify-center p-0",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: ReactNode;
}

export function Button({variant = "secondary", size = "md", className, children, ...props}: ButtonProps) {
  return (
    <BaseButton
      {...props}
      type={props.type ?? "button"}
      className={cn("erp-focus-ring inline-flex shrink-0 items-center justify-center rounded-[var(--erp-radius-control)] font-medium transition-[background-color,border-color,color,box-shadow] disabled:pointer-events-none disabled:opacity-50", variants[variant], sizes[size], className)}
    >
      {children}
    </BaseButton>
  );
}
