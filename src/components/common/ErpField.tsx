import {cloneElement, isValidElement, useId, type ReactNode} from "react";
import {cn} from "@/src/lib/cn";

type FieldControlProps = {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
};

type FieldChildProps = FieldControlProps & {
  /** React Hook Form's Controller exposes its rendered control through this prop. */
  render?: (props: unknown) => ReactNode;
};

export interface ErpFieldProps {
  label: ReactNode;
  children: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  /** Keep a stable validation slot for dense forms whose rows must not jump. */
  reserveErrorSpace?: boolean;
  className?: string;
}

/** Shared form field label, hint and error contract. */
export function ErpField({label, children, htmlFor, hint, error, required = false, reserveErrorSpace = false, className}: ErpFieldProps) {
  const generatedId = useId().replace(/:/g, "");
  const childProps = isValidElement(children) ? children.props as FieldChildProps : undefined;
  const controlId = htmlFor || childProps?.id || `erp-field-${generatedId}`;
  const describedBy = [childProps?.["aria-describedby"], hint ? `${controlId}-hint` : "", error ? `${controlId}-error` : ""].filter(Boolean).join(" ") || undefined;
  const controlProps: FieldControlProps = {
    id: childProps?.id || controlId,
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : childProps?.["aria-invalid"],
  };
  const control = isValidElement(children)
    ? typeof childProps?.render === "function"
      ? cloneElement(children, {
        render: (renderProps: unknown) => {
          const rendered = childProps.render?.(renderProps);
          return isValidElement(rendered) ? cloneElement(rendered, controlProps) : rendered;
        },
      } as Record<string, unknown>)
      : cloneElement(children, controlProps)
    : children;
  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={controlId} className="block text-erp-sm font-medium text-[var(--erp-color-text-secondary)]">
        {label}{required ? <span className="ml-0.5 text-[var(--erp-color-danger)]" aria-hidden="true">*</span> : null}
      </label>
      <div className="mt-1.5 min-w-0" data-erp-field-control="true" data-erp-describedby={describedBy}>{control}</div>
      {hint ? <p id={`${controlId}-hint`} className="mt-1 text-xs leading-4 text-[var(--erp-color-text-muted)]">{hint}</p> : null}
      {error || reserveErrorSpace ? <p id={error ? `${controlId}-error` : undefined} role={error ? "alert" : undefined} aria-hidden={error ? undefined : true} data-empty={!error || undefined} className="erp-annotation-slot mt-1 text-xs leading-4 text-[var(--erp-color-danger)]">{error || "\u00a0"}</p> : null}
    </div>
  );
}
