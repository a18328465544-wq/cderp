import {forwardRef, type InputHTMLAttributes, type ReactNode} from "react";
import {cn} from "@/src/lib/cn";

export type ErpChoiceVariant = "card" | "inline";

export interface ErpCheckboxFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
  description?: ReactNode;
  variant?: ErpChoiceVariant;
}

/** Shared checkbox geometry; native input semantics remain intact. */
export const ErpCheckboxField = forwardRef<HTMLInputElement, ErpCheckboxFieldProps>(function ErpCheckboxField({label, description, variant = "card", className, id, ...props}, ref) {
  const labelClassName = variant === "inline"
    ? "flex min-h-0 cursor-pointer items-start gap-2.5 px-1 py-1.5 text-sm font-medium text-[var(--erp-color-text)] transition-colors hover:bg-[var(--erp-color-surface-muted)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
    : "flex min-h-10 cursor-pointer items-start gap-2.5 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-3 py-2 text-sm font-medium text-[var(--erp-color-text)] transition-colors hover:bg-[var(--erp-color-surface-muted)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60";
  return <label htmlFor={id} className={cn(labelClassName, className)}>
    <input {...props} ref={ref} id={id} type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--erp-color-primary)]" />
    <span className="min-w-0">{label}{description ? <span className="mt-0.5 block text-xs font-normal leading-5 text-[var(--erp-color-text-muted)]">{description}</span> : null}</span>
  </label>;
});

export interface ErpRadioFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  variant?: ErpChoiceVariant;
  onChange?: () => void;
  children?: ReactNode;
}

/** Shared radio geometry for both option cards and compact inline choices. */
export const ErpRadioField = forwardRef<HTMLInputElement, ErpRadioFieldProps>(function ErpRadioField({label, description, variant = "card", className, id, children, onChange, ...props}, ref) {
  const labelClassName = variant === "inline"
    ? "flex min-h-0 cursor-pointer items-start gap-2.5 rounded-[var(--erp-radius-md)] px-1 py-1.5 text-sm font-medium text-[var(--erp-color-text)] transition-colors hover:bg-[var(--erp-color-surface-muted)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
    : "flex min-h-10 cursor-pointer items-start gap-2 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-3 py-2 text-sm font-medium text-[var(--erp-color-text)] has-[:checked]:border-[var(--erp-color-primary)] has-[:checked]:bg-[var(--erp-color-info-soft)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60";
  return <label htmlFor={id} className={cn(labelClassName, className)}>
    <input {...props} ref={ref} id={id} type="radio" onChange={onChange} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--erp-color-primary)]" />
    <span className="min-w-0 flex-1">{children ? <span className="flex flex-wrap items-center justify-between gap-2"><span>{label}</span>{children}</span> : label}{description ? <span className="mt-0.5 block text-xs font-normal leading-5 text-[var(--erp-color-text-muted)]">{description}</span> : null}</span>
  </label>;
});

export interface ErpRadioOption<T extends string> {
  value: T;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

export function ErpRadioGroup<T extends string>({name, value, options, onChange, className, variant = "card"}: {name: string; value: T; options: readonly ErpRadioOption<T>[]; onChange: (value: T) => void; className?: string; variant?: ErpChoiceVariant}) {
  return <div role="radiogroup" aria-label={name} className={cn("flex flex-wrap gap-2", className)}>{options.map((option) => <ErpRadioField key={option.value} name={name} value={option.value} checked={value === option.value} disabled={option.disabled} onChange={() => onChange(option.value)} label={option.label} description={option.description} variant={variant} />)}</div>;
}
