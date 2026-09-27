import type {ReactNode} from "react";
import {Button} from "@/src/components/ui";
import {DashboardSection, ErpDetailDrawer, ErpDetailFact, ErpDetailFactGrid, ErpMetricCard, type ErpMetricTone} from "@/src/components/common";
import {formatCurrency} from "@/src/lib/format";

export type FinanceEntryKind = "income" | "expense";

/** Stable projection shared by income and expense detail drawers. */
export interface FinanceEntryDetailItem {
  id: string;
  businessType: string;
  accountName: string;
  amount: number;
  handler: string;
  paymentMethod: string;
  referenceNo?: string;
  time: string;
  images: string[];
  remarks?: string;
  editable: boolean;
  deletable: boolean;
  restrictionReason?: string;
}

export function FinanceEntryDetailDrawer({item, kind, subject, canEdit, canDelete, onClose, onEdit, onDelete}: {
  item: FinanceEntryDetailItem | null;
  kind: FinanceEntryKind;
  subject: string;
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isIncome = kind === "income";
  const noun = isIncome ? "收入" : "支出";
  return (
    <ErpDetailDrawer
      open={Boolean(item)}
      modal={false}
      resizable
      drawerKey={`finance-${kind}-entry-detail`}
      defaultWidth={680}
      minWidth={520}
      maxWidth={820}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={item?.businessType || `${noun}详情`}
      description={item ? `${item.id} · ${item.time}` : undefined}
      footer={
        item && (
          <div className="flex justify-end gap-2">
            {canDelete && item.deletable && <Button size="sm" variant="danger" onClick={onDelete}>冲销</Button>}
            {canEdit && item.editable && <Button size="sm" variant="primary" onClick={onEdit}>编辑</Button>}
          </div>
        )
      }
    >
      <div className="space-y-5">
        {item && (
          <>
            <ErpDetailFactGrid>
              <FinanceEntryFact label="金额" value={formatCurrency(item.amount)} kind={kind} />
              <FinanceEntryFact label="结算账户" value={item.accountName} />
            </ErpDetailFactGrid>
            <DashboardSection title="登记信息">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <FinanceEntryRow label={isIncome ? "收入来源" : "支出对象"} value={subject} />
                <FinanceEntryRow label={isIncome ? "入账方式" : "支付方式"} value={item.paymentMethod} />
                <FinanceEntryRow label="经办人" value={item.handler} />
                <FinanceEntryRow label="外部参考号" value={item.referenceNo || "未填写"} />
              </div>
            </DashboardSection>
            {item.images.length > 0 && (
              <DashboardSection title={`${noun}凭证`}>
                <div className="grid grid-cols-2 gap-3">
                  {item.images.map((url, index) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer">
                      <img src={url} alt={`${noun}凭证 ${index + 1}`} className="h-36 w-full rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] object-cover" />
                    </a>
                  ))}
                </div>
              </DashboardSection>
            )}
            {item.remarks && <p className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-3 text-sm">{item.remarks}</p>}
            {item.restrictionReason && <p className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-warning-soft)] p-3 text-xs text-[var(--erp-color-warning)]">{item.restrictionReason}</p>}
          </>
        )}
      </div>
    </ErpDetailDrawer>
  );
}

export function FinanceEntryDeleteDrawer({item, kind, subject, pending, onClose, onConfirm}: {
  item: Pick<FinanceEntryDetailItem, "businessType" | "amount"> & {subject?: string} | null;
  kind: FinanceEntryKind;
  subject?: string;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const noun = kind === "income" ? "收入" : "支出";
  const resolvedSubject = subject ?? item?.subject ?? "";
  return (
    <ErpDetailDrawer
      open={Boolean(item)}
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
      title={`冲销${noun}记录`}
      description="服务端将同时回滚账户余额和关联流水"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={pending}>取消</Button>
          <Button variant="danger" onClick={onConfirm} disabled={pending}>{pending ? "冲销中…" : "确认冲销"}</Button>
        </div>
      }
    >
      <p className="text-sm leading-6 text-[var(--erp-color-text-secondary)]">
        确认冲销 {item?.businessType}「{resolvedSubject}」的 {formatCurrency(item?.amount || 0)} {noun}？系统会反向修正账户、业务余额和账务流水，并保留操作记录。
      </p>
    </ErpDetailDrawer>
  );
}

export function FinanceEntryMetric({label, value, detail, icon, tone}: {label: string; value: string; detail: string; icon: ReactNode; tone: ErpMetricTone}) {
  return <ErpMetricCard label={label} value={value} detail={detail} icon={icon} tone={tone} valueTone={tone} />;
}

export function FinanceEntryFact({label, value, kind}: {label: string; value: string; kind?: FinanceEntryKind}) {
  return <ErpDetailFact label={label} value={value} tone={kind === "income" ? "success" : kind === "expense" ? "danger" : "default"} />;
}

export function FinanceEntryRow({label, value}: {label: string; value: string}) {
  return <div><p className="text-xs text-[var(--erp-color-text-muted)]">{label}</p><p className="mt-1 font-medium">{value}</p></div>;
}
