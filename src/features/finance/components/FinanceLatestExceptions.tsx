import {AlertTriangle, CheckCircle2} from "lucide-react";
import {formatCurrency} from "@/src/lib/format";
import type {FinanceDailyClosing} from "@/src/types/finance-closing";

export function FinanceLatestExceptions({item}: {item: FinanceDailyClosing}) {
  const entries = [
    item.snapshot.unreviewed > 0
      ? {label: "待复核流水", value: `${item.snapshot.unreviewed} 项`, tone: "danger" as const}
      : null,
    item.snapshot.accountReconciliationDifferences > 0
      ? {label: "账户对账差异", value: `${item.snapshot.accountReconciliationDifferences} 项`, tone: "warning" as const}
      : null,
    item.snapshot.receivable > 0
      ? {label: "客户应收", value: formatCurrency(item.snapshot.receivable), tone: "danger" as const}
      : null,
    item.snapshot.payable > 0
      ? {label: "供应商应付", value: formatCurrency(item.snapshot.payable), tone: "warning" as const}
      : null,
  ].filter(
    (entry): entry is {label: string; value: string; tone: "danger" | "warning"} => Boolean(entry),
  );
  if (!entries.length)
    return (
      <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-center">
        <CheckCircle2 className="h-8 w-8 text-[var(--erp-color-success)]" />
        <p className="font-semibold">最新日结没有异常</p>
        <p className="text-xs text-[var(--erp-color-text-muted)]">快照中的待复核、对账差异、应收应付均为零。</p>
      </div>
    );
  return (
    <div className="space-y-2">
      {entries.map((entry) => (
        <div key={entry.label} className="flex items-center justify-between rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] px-3 py-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className={`h-4 w-4 ${entry.tone === "danger" ? "text-[var(--erp-color-danger)]" : "text-[var(--erp-color-warning)]"}`} />
            <span className="text-sm font-medium">{entry.label}</span>
          </div>
          <span className={`erp-data-number text-sm font-semibold ${entry.tone === "danger" ? "text-[var(--erp-color-danger)]" : "text-[var(--erp-color-warning)]"}`}>{entry.value}</span>
        </div>
      ))}
    </div>
  );
}
