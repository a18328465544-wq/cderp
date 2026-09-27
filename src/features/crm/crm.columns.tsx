import type {ColumnDef} from "@tanstack/react-table";
import {CalendarClock, Eye, MessageSquarePlus} from "lucide-react";
import {Button} from "@/src/components/ui";
import {ErpStatusBadge} from "@/src/components/common";
import {formatCurrency} from "@/src/lib/format";
import type {CrmAccount} from "@/src/types/crm";
import {formatStoreDateTime, isStoreDateTimeBeforeNow} from "@/src/utils/storeTime";

function statusTone(status: string) {
  if (status === "已成交") return "success" as const;
  if (status === "跟进中") return "info" as const;
  if (status === "流失") return "danger" as const;
  if (status === "沉睡") return "warning" as const;
  return "neutral" as const;
}

function intentTone(intent: string | undefined) {
  if (intent === "高") return "danger" as const;
  if (intent === "中") return "warning" as const;
  return "neutral" as const;
}

function levelTone(level: string | undefined) {
  if (level === "S级" || level === "A级") return "success" as const;
  if (level === "R级" || level === "黑名单") return "danger" as const;
  return level ? "info" as const : "neutral" as const;
}

function dateText(value: string | undefined) {
  return formatStoreDateTime(value);
}

function isOverdue(value: string | undefined) {
  return isStoreDateTimeBeforeNow(value);
}

export function createCrmColumns({onDetail, onFollowUp}: {onDetail: (account: CrmAccount) => void; onFollowUp: (account: CrmAccount) => void}): ColumnDef<CrmAccount, unknown>[] {
  return [
    {id: "customer", header: "客户", size: 220, enableSorting: false, cell: ({row}) => <div className="min-w-0"><div className="flex items-center gap-2"><span className="truncate font-semibold text-[var(--erp-color-text)]">{row.original.displayName}</span>{row.original.isCoreCustomer && <ErpStatusBadge label="核心" tone="success" />}</div><p className="mt-1 truncate text-xs text-[var(--erp-color-text-muted)]">{row.original.companyName || row.original.source || row.original.id}</p></div>},
    {id: "contact", header: "联系方式", size: 180, enableSorting: false, cell: ({row}) => <div><p className="erp-data-number text-xs">{row.original.phone || "—"}</p><p className="mt-1 text-xs text-[var(--erp-color-text-muted)]">{row.original.wechat ? `微信 ${row.original.wechat}` : row.original.qq ? `QQ ${row.original.qq}` : "无其他联系方式"}</p></div>},
    {id: "level", header: "等级 / 意向", size: 140, enableSorting: false, cell: ({row}) => <div className="flex flex-wrap gap-1.5"><ErpStatusBadge label={row.original.level || "未评级"} tone={levelTone(row.original.level)} /><ErpStatusBadge label={`${row.original.intent || "中"}意向`} tone={intentTone(row.original.intent)} /></div>},
    {id: "status", header: "阶段", size: 135, enableSorting: false, cell: ({row}) => <div><ErpStatusBadge label={row.original.businessStatus} tone={statusTone(row.original.businessStatus)} /><p className="mt-1 text-xs text-[var(--erp-color-text-muted)]">{row.original.stage || "未设置阶段"}</p></div>},
    {id: "owner", accessorKey: "owner", header: "负责人", size: 100, enableSorting: false, cell: ({row}) => row.original.owner || "未分配"},
    {id: "nextFollowAt", header: "下次跟进", size: 150, enableSorting: false, cell: ({row}) => <div className={isOverdue(row.original.nextFollowAt) && !["已成交", "流失"].includes(row.original.businessStatus) ? "text-[var(--erp-color-danger)]" : "text-[var(--erp-color-text-secondary)]"}><p className="flex items-center gap-1 erp-data-number text-xs font-semibold"><CalendarClock className="h-3.5 w-3.5" />{dateText(row.original.nextFollowAt)}</p><p className="mt-1 max-w-40 truncate text-xs text-[var(--erp-color-text-muted)]">{row.original.nextAction || "未设置动作"}</p></div>},
    {id: "opportunity", header: "预计成交", size: 150, enableSorting: false, cell: ({row}) => <div><p className="erp-data-number font-semibold">{row.original.estimatedAmount === undefined ? "—" : formatCurrency(row.original.estimatedAmount)}</p><p className="mt-1 text-xs text-[var(--erp-color-text-muted)]">概率 {row.original.dealProbability === undefined ? "—" : `${row.original.dealProbability}%`}</p></div>},
    {id: "updatedAt", accessorKey: "updatedAt", header: "最近更新", size: 135, enableSorting: false, cell: ({row}) => <span className="erp-data-number text-xs text-[var(--erp-color-text-secondary)]">{dateText(row.original.updatedAt)}</span>},
    {id: "actions", header: "操作", size: 96, enableSorting: false, enableResizing: false, cell: ({row}) => <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}><Button type="button" size="icon" variant="ghost" title="新增跟进" aria-label={`新增${row.original.displayName}的跟进`} disabled={!row.original.legacyCustomerId} onClick={() => onFollowUp(row.original)}><MessageSquarePlus className="h-4 w-4" /></Button><Button type="button" size="icon" variant="ghost" title="查看详情" aria-label={`查看${row.original.displayName}`} onClick={() => onDetail(row.original)}><Eye className="h-4 w-4" /></Button></div>},
  ];
}
