export {ErpMetricCard as FinanceMetricCard, type ErpMetricTone as FinanceMetricTone, type ErpMetricVariant as FinanceMetricVariant} from "@/src/components/common/ErpMetricCard";

export function FinanceDetailRow({
  label,
  value,
  small = false,
}: {
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-[var(--erp-color-text-muted)]">{label}</p>
      <p
        className={`${small ? "text-sm" : ""} mt-0.5 truncate font-medium`}
      >
        {value}
      </p>
    </div>
  );
}

export function FinanceDetailMetric({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <div className="rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] p-3">
      <p className="text-xs text-[var(--erp-color-text-muted)]">{label}</p>
      <p
        className={`mt-1 erp-data-number text-base font-semibold ${warning ? "text-[var(--erp-color-warning)]" : "text-[var(--erp-color-text)]"}`}
      >
        {value}
      </p>
    </div>
  );
}
