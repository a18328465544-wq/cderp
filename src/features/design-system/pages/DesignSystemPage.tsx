import {Boxes, ClipboardList, PackageCheck, TrendingUp, Warehouse} from "lucide-react";
import {useEffect, useState} from "react";
import {Avatar, Badge, Button, Card, CardContent, CardHeader, Select, Separator, Skeleton, Textarea} from "@/src/components/ui";
import {DashboardSection, ErpDashboardPageFrame, ErpAmountInput, ErpDataTable, ErpDatePicker, ErpDateRangePicker, ErpSubmitBar, ErpEmptyState, ErpFilterBar, ErpFormSection, ErpLoadingState, ErpMetricCard, ErpPageContent, ErpPageError, ErpPageHeader, ErpPageToolbar, ErpSearchInput, ErpStatusBadge, MetricsRegion, QuickStatusGroup, type QuickStatusItemData} from "@/src/components/common";
import {formatCurrency} from "@/src/lib/format";

type DemoRow = {id: string; name: string; status: string; amount: number};

const demoRows: DemoRow[] = [
  {id: "demo-1", name: "RTX 4090 测试卡", status: "已入库", amount: 12800},
  {id: "demo-2", name: "RTX 4080 Super", status: "待检测", amount: 7600},
];

const demoColumns = [
  {accessorKey: "name", header: "商品名称"},
  {accessorKey: "status", header: "状态", cell: ({row}: {row: {original: DemoRow}}) => <ErpStatusBadge label={row.original.status} tone={row.original.status === "已入库" ? "success" : "warning"} />},
  {accessorKey: "amount", header: "金额", cell: ({row}: {row: {original: DemoRow}}) => <span className="erp-data-number font-semibold">{formatCurrency(row.original.amount)}</span>},
];

const avatarSrc = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36' height='36' viewBox='0 0 36 36'%3E%3Crect width='36' height='36' rx='18' fill='%230a84ff'/%3E%3Ctext x='18' y='23' text-anchor='middle' font-size='16' fill='white'%3E郭%3C/text%3E%3C/svg%3E";

export function DesignSystemPage() {
  const [amount, setAmount] = useState(12800);
  const [date, setDate] = useState("");
  const [selectValue, setSelectValue] = useState("inventory");
  const [entityValue, setEntityValue] = useState("");
  const [keyword, setKeyword] = useState("");
  const [stressFilter, setStressFilter] = useState("");
  const [stressDate, setStressDate] = useState({startDate: "2026-10-01", endDate: "2026-10-08"});
  const isDevelopment = typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname);

  if (!isDevelopment) return <ErpPageError title="组件展示页不可用" description="该页面仅在本地开发环境开放，不进入生产菜单。" />;

  const quickStatus: QuickStatusItemData[] = [
    {icon: <ClipboardList className="h-4 w-4" />, label: "今日待处理", value: "17", tone: "warning", tooltip: "待跟进事项", action: () => setKeyword("待处理")},
    {icon: <Warehouse className="h-4 w-4" />, label: "待检测", value: "14", tone: "info", tooltip: "检测前库存"},
    {icon: <PackageCheck className="h-4 w-4" />, label: "待出库", value: "2", tone: "success", tooltip: "销售单待出库"},
    {icon: <Boxes className="h-4 w-4" />, label: "异常", value: "1", tone: "danger", tooltip: "需要优先处理"},
  ];
  const workflowQuickStatus: QuickStatusItemData[] = [
    {icon: <PackageCheck className="h-4 w-4" />, label: "入库核验", value: "14 张", tone: "info", description: "完成库存检测", action: () => undefined},
    {icon: <Warehouse className="h-4 w-4" />, label: "库存确认", value: "12 张", tone: "success", description: "确认可用库存", action: () => undefined},
    {icon: <ClipboardList className="h-4 w-4" />, label: "完成处理", value: "10 张", tone: "success", description: "进入下一业务环节"},
  ];

  return <ErpDashboardPageFrame>
    <ErpPageHeader title="组件展示与验收" subtitle="Frontend V2 Design System · 仅开发环境可见" quickStatus={quickStatus} />
    <ErpPageContent className="space-y-[var(--erp-page-gap)]">
    <DashboardSection title="Quick Status v2" description="Compact 是默认状态摘要；只有真实流程场景才使用 Workflow 变体。">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-3"><p className="mb-2 text-xs font-semibold text-[var(--erp-color-text-secondary)]">Compact</p><QuickStatusGroup items={quickStatus} /></div>
        <div className="min-w-0 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-3"><p className="mb-2 text-xs font-semibold text-[var(--erp-color-text-secondary)]">Interactive · 点击首项筛选</p><QuickStatusGroup items={quickStatus.slice(0, 2)} /></div>
        <div className="min-w-0 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-3"><p className="mb-2 text-xs font-semibold text-[var(--erp-color-text-secondary)]">Workflow · 仅流程场景</p><QuickStatusGroup variant="workflow" items={workflowQuickStatus} /></div>
      </div>
    </DashboardSection>
    <DashboardSection title="Token 基准" description="颜色、间距、圆角和控件高度只从 src/styles/tokens.css 读取。">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <TokenSwatch name="Canvas" value="--erp-color-canvas" className="bg-[var(--erp-color-canvas)]" />
        <TokenSwatch name="Primary" value="--erp-color-primary" className="bg-[var(--erp-color-primary)]" dark />
        <TokenSwatch name="Success" value="--erp-color-success" className="bg-[var(--erp-color-success)]" dark />
        <TokenSwatch name="Danger" value="--erp-color-danger" className="bg-[var(--erp-color-danger)]" dark />
        <TokenSwatch name="收入 / 收款" value="--erp-color-income" className="bg-[var(--erp-color-income)]" dark />
        <TokenSwatch name="支出 / 付款" value="--erp-color-expense" className="bg-[var(--erp-color-expense)]" dark />
        <TokenSwatch name="净额 / 中性汇总" value="--erp-color-net" className="bg-[var(--erp-color-net)]" dark />
        <TokenSwatch name="待处理 / 风险" value="--erp-color-risk" className="bg-[var(--erp-color-risk)]" dark />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label="页面标题" token="--erp-font-page-title" /><Metric label="正文" token="--erp-font-body" /><Metric label="默认控件" token="--erp-control-height" /><Metric label="卡片圆角" token="--erp-radius-card" /></div>
    </DashboardSection>
    <MetricsRegion>
      <ErpMetricCard label="Metric Card" value="¥406,721" detail="昨日 ¥360,000" compare={12.6} icon={<TrendingUp className="h-4 w-4" />} tone="success" />
      <Card><CardContent className="p-4"><p className="text-xs text-[var(--erp-color-text-secondary)]">Status Badge</p><div className="mt-3 flex flex-wrap gap-2"><ErpStatusBadge label="中性" tone="neutral" /><ErpStatusBadge label="信息" tone="info" /><ErpStatusBadge label="正常" tone="success" /><ErpStatusBadge label="提醒" tone="warning" /><ErpStatusBadge label="风险" tone="danger" /></div></CardContent></Card>
      <Card><CardContent className="p-4"><p className="text-xs text-[var(--erp-color-text-secondary)]">Avatar</p><div className="mt-3 flex items-center gap-3"><Avatar src={avatarSrc} alt="郭鑫" /><span className="text-sm font-semibold">郭鑫 · 老板账号</span></div></CardContent></Card>
      <Card><CardContent className="p-4"><p className="text-xs text-[var(--erp-color-text-secondary)]">Loading</p><div className="mt-3 space-y-2"><Skeleton className="h-4 w-28" /><Skeleton className="h-8 w-full" /></div></CardContent></Card>
    </MetricsRegion>
    <DashboardSection title="桌面收口压力验收" description="仅本地合成样例：长金额、负余额、默认全部、完整日期与未修改编辑反馈。">
      <MetricsRegion data-testid="desktop-stress-metrics">
        {Array.from({length: 6}, (_, index) => <ErpMetricCard key={index} label={index === 0 ? "长金额（本地样例）" : index === 1 ? "负余额（本地样例）" : `样例指标 ${index + 1}`} value={index === 0 ? "¥1,234,567,890.12" : index === 1 ? "-¥123,456,789.01" : "¥12,345.67"} valueTone={index === 1 ? "danger" : "info"} icon={<Boxes className="h-4 w-4" />} detail="完整数值，不依赖悬停" />)}
      </MetricsRegion>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Select value={stressFilter} options={[{value: "", label: "全部渠道"}, {value: "store", label: "到店"}]} onValueChange={setStressFilter} aria-label="压力样例渠道" className="w-36" />
        <ErpDateRangePicker value={stressDate} onChange={setStressDate} triggerClassName="w-36" density="compact" ariaLabel="压力样例日期范围" />
      </div>
      <div className="mt-4"><ErpSubmitBar embedded dirty={false} canSubmit={false} blockedReason="尚未修改采购单" submitting={false} onCancel={() => undefined} showCancel={false} submitLabel="本地禁用提交样例" /></div>
    </DashboardSection>
    <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(280px,3fr)]">
      <div className="min-w-0 space-y-5">
      <ErpFormSection title="表单控件" description="统一输入、金额、日期、选择和多行文本的高度、焦点和错误承载。"><div className="grid gap-4 md:grid-cols-2"><label className="text-sm font-semibold">关键字<ErpSearchInput className="mt-2" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索商品、SN 或单号" aria-label="搜索关键字" /></label><label className="text-sm font-semibold">业务模块<Select className="mt-2" value={selectValue} options={[{value: "inventory", label: "库存管理"}, {value: "sales", label: "销售管理"}, {value: "finance", label: "财务管理"}]} onValueChange={setSelectValue} aria-label="业务模块" /></label><label className="text-sm font-semibold">实体搜索选择<Select searchable searchPlaceholder="搜索商品名称或型号" emptyText="没有找到匹配商品" className="mt-2" value={entityValue} options={[{value: "gpu-4090", label: "华硕 RTX 4090 ROG 24G"}, {value: "gpu-4080", label: "微星 RTX 4080 Super 16G"}, {value: "gpu-3090", label: "磐镭 RTX 3090 涡轮 24G"}]} onValueChange={setEntityValue} quickCreateAction={{label: "新建商品", onClick: () => undefined}} aria-label="选择商品模板" /></label><label className="text-sm font-semibold">金额<ErpAmountInput className="mt-2" value={amount} onValueChange={(detail) => setAmount(detail.floatValue || 0)} aria-label="金额" /></label><label className="text-sm font-semibold">日期<ErpDatePicker className="mt-2" value={date} onChange={setDate} aria-label="日期" /></label><label className="text-sm font-semibold md:col-span-2">备注<Textarea className="mt-2" placeholder="补充说明（可选）" /></label></div></ErpFormSection>
        <ErpPageToolbar><ErpFilterBar actions={<Button variant="ghost" size="sm" onClick={() => setKeyword("")}>清除筛选</Button>}><span className="text-xs text-[var(--erp-color-text-secondary)]">当前筛选：{keyword || "全部"}</span></ErpFilterBar></ErpPageToolbar>
      <Card><CardHeader><div><h2 className="text-sm font-semibold">DataTable</h2><p className="mt-1 text-xs text-[var(--erp-color-text-secondary)]">排序、空态、加载态和状态展示由统一表格组件承载。</p></div><Badge tone="info">TanStack Table</Badge></CardHeader><ErpDataTable ariaLabel="设计系统示例数据表" columns={demoColumns} data={demoRows} getRowId={(row) => row.id} stickyHeader density="compact" /></Card>
      </div>
      <aside className="min-w-0 space-y-5"><DashboardSection title="状态反馈"><div className="space-y-3"><ErpLoadingState /><Separator /><ErpEmptyState title="空数据状态" description="没有需要处理的记录。" /></div></DashboardSection><Card><CardContent className="p-4"><h2 className="text-sm font-semibold">当前输入</h2><p className="mt-2 text-xs text-[var(--erp-color-text-secondary)]">金额：{formatCurrency(amount)}</p><p className="mt-1 text-xs text-[var(--erp-color-text-secondary)]">日期：{date || "未选择"}</p><p className="mt-1 text-xs text-[var(--erp-color-text-secondary)]">模块：{selectValue}</p></CardContent></Card></aside>
    </div>
    </ErpPageContent>
  </ErpDashboardPageFrame>;
}

function TokenSwatch({name, value, className, dark = false}: {name: string; value: string; className: string; dark?: boolean}) {
  return <div className="overflow-hidden rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)]"><div className={`h-12 ${className}`} /><div className="p-3"><p className="text-sm font-semibold">{name}</p><p className={`mt-1 erp-data-number text-xs ${dark ? "text-[var(--erp-color-text-secondary)]" : "text-[var(--erp-color-text-muted)]"}`}>{value}</p></div></div>;
}

function Metric({label, token}: {label: string; token: string}) {
  const [value, setValue] = useState("—");
  useEffect(() => {setValue(getComputedStyle(document.documentElement).getPropertyValue(token).trim());}, [token]);
  return <div className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-3"><p className="text-xs text-[var(--erp-color-text-muted)]">{label}</p><p className="mt-1 erp-data-number text-sm font-semibold">{value}</p></div>;
}
