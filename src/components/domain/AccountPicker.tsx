import {CircleDollarSign, LockKeyhole} from "lucide-react";
import {Button, Select} from "@/src/components/ui";
import type {SalesSettlementAccountOption} from "@/src/types/sales";

export function AccountPicker({value, options, loading, error, disabled, onChange, onRetry, purpose = "收款"}: {value: string; options: SalesSettlementAccountOption[]; loading?: boolean; error?: string; disabled?: boolean; onChange: (value: string) => void; onRetry?: () => void; purpose?: "收款" | "付款"}) {
  const accountOptions = options.filter((option) => option.enabled).map((option) => ({value: option.id, label: <span className="flex min-w-0 items-center gap-2"><CircleDollarSign className="h-4 w-4 shrink-0 text-[var(--erp-color-text-muted)]" /><span className="truncate">{option.name}{option.availableBalance === undefined ? "" : ` · 可用 ¥${option.availableBalance.toLocaleString()}`}</span></span>}));
  return <div><Select value={value} options={accountOptions} onValueChange={onChange} disabled={disabled || loading || Boolean(error)} placeholder={loading ? "正在读取账户…" : error ? `${purpose}账户不可用` : `选择${purpose}账户`} aria-label={`${purpose}账户`} />{error ? <Button type="button" variant="ghost" size="xs" onClick={onRetry} disabled={!onRetry} className="mt-1 px-0 text-[var(--erp-color-danger)]"><LockKeyhole className="h-3.5 w-3.5" />{error} · 重试</Button> : null}</div>;
}
