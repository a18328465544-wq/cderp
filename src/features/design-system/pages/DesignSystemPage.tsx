import {Boxes, ClipboardList, PackageCheck, TrendingUp, Warehouse} from "lucide-react";
import {useEffect, useState} from "react";
import {Avatar, Badge, Button, Card, CardContent, CardHeader, Input, Select, Separator, Skeleton, Textarea} from "@/src/components/ui";
import {DashboardSection, ErpDashboardPageFrame, ErpAmountInput, ErpDataTable, ErpDatePicker, ErpDateRangePicker, ErpSubmitBar, ErpEmptyState, ErpFilterBar, ErpFormSection, ErpLoadingState, ErpMetricCard, ErpPageContent, ErpPageError, ErpPageHeader, ErpPageToolbar, ErpSearchInput, ErpStatusBadge, MetricsRegion, QuickStatusGroup, type QuickStatusItemData} from "@/src/components/common";
import {formatCurrency} from "@/src/lib/format";
import {ErpCheckboxField, ErpRadioGroup, ErpSegmentedControl, ErpQuantityStepper} from "@/src/components/common";
import {ErpField} from "@/src/components/common/ErpField";
import {CustomerPicker} from "@/src/components/domain/CustomerPicker";
import {InventoryItemPicker} from "@/src/components/domain/InventoryItemPicker";
import type {CustomerPickerOption} from "@/src/types/customer";
import type {SalesProductCandidate} from "@/src/types/sales";

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
  const [demoQuantity, setDemoQuantity] = useState(1);
  const [demoMode, setDemoMode] = useState("full");
  const [demoChecked, setDemoChecked] = useState(false);
  const [demoChoice, setDemoChoice] = useState("inventory");
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
    <DashboardSection title="移动控件尺寸验收" description="仅本地样例：44px 普通触控、48px 主操作，输入文字 16px；桌面尺寸保持原样。">
      <div data-testid="mobile-control-contract" className="grid min-w-0 gap-3 md:grid-cols-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2"><Button size="xs">小按钮</Button><Button>普通按钮</Button><Button disabled>禁用按钮</Button><Button size="icon" aria-label="样例图标操作"><Boxes className="h-4 w-4" /></Button></div>
        <ErpSearchInput aria-label="控件尺寸样例搜索" placeholder="搜索商品名称或型号" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
        <label className="text-sm md:hidden">样例数量<ErpQuantityStepper label="样例数量" value={demoQuantity} max={5} onChange={setDemoQuantity} /></label>
        <ErpSegmentedControl label="样例结算方式" value={demoMode} onValueChange={setDemoMode} options={[{value: "full", label: "全额付款"}, {value: "none", label: "暂不付款"}, {value: "partial", label: "部分付款"}]} />
        <ErpCheckboxField variant="inline" label="包含历史已售出的库存记录" checked={demoChecked} onChange={(event) => setDemoChecked(event.target.checked)} />
        <ErpRadioGroup name="样例展示方式" value={demoChoice} onChange={setDemoChoice} options={[{value: "inventory", label: "库存列表"}, {value: "model", label: "型号汇总"}]} />
        <Select aria-label="长选项尺寸样例" value={selectValue} onValueChange={setSelectValue} options={[{value: "inventory", label: "本地长名称账户 · 二手显卡及服务器配件采购结算"}, {value: "sales", label: "本地销售账户"}, {value: "finance", label: "停用样例", disabled: true}]} />
        <Textarea aria-label="控件尺寸样例备注" placeholder="补充说明（可选）" />
      </div>
    </DashboardSection>
    <ControlContractDemo />
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

const contractCustomers: CustomerPickerOption[] = [
  {id: "demo-customer-a", name: "本地客户甲", partnerType: "customer", contact: "LOCAL-A", selectable: true},
  {id: "demo-customer-b", name: "本地客户乙", partnerType: "customer", contact: "LOCAL-B", selectable: true},
  {id: "demo-customer-disabled", name: "停用客户", partnerType: "customer", contact: "LOCAL-DISABLED", selectable: false, unavailableReason: "已停用"},
];
const contractStock: SalesProductCandidate[] = ["RTX4090", "RTX4080", "RTX3090"].map((model, index) => ({
  id: `demo-stock-${index}`, productId: `demo-stock-${index}`, productName: `本地测试 ${model} 24G`, category: "显卡", brand: "本地品牌", model, version: "测试版", vram: "24G", condition: "95新", warehouse: "本地测试库位", inventoryStatus: index === 2 ? "待检测" : "已入库", inventoryQuantity: 3, reservedQuantity: 0, availableQuantity: index === 2 ? 0 : 3, availabilityKnown: true, estimatedSellPrice: 100, entryTime: "2026-10-01", inventoryDays: 1, saleable: index !== 2, unavailableReason: index === 2 ? "待检测，不可销售" : undefined,
}));
const contractRemoteOptions = [{value: "remote-a", label: "远程已选项甲"}, {value: "remote-b", label: "远程候选乙"}];

/** Synthetic interaction acceptance only. No requests or business mutations. */
function ControlContractDemo() {
  const [customer, setCustomer] = useState<CustomerPickerOption | null>(contractCustomers[0]!);
  const [customerQuery, setCustomerQuery] = useState("");
  const [stock, setStock] = useState<SalesProductCandidate | null>(contractStock[0]!);
  const [stockQuery, setStockQuery] = useState("");
  const [remoteValue, setRemoteValue] = useState("remote-a");
  const [remoteRefresh, setRemoteRefresh] = useState(false);
  const [remoteQuery, setRemoteQuery] = useState("");
  const [variant, setVariant] = useState("normal");
  const [amountDraft, setAmountDraft] = useState<number | string>(0);
  const [quantity, setQuantity] = useState(1);
  const [date, setDate] = useState("2026-10-09");
  const [choice, setChoice] = useState("first");
  const [requiredValue, setRequiredValue] = useState("");
  const [pending, setPending] = useState(false);
  const disabled = variant === "disabled";
  const loading = variant === "loading";
  const error = variant === "error" ? "本地模拟搜索失败" : undefined;
  return <DashboardSection title="控件交互验收" description="仅本地合成数据，可验证更换、取消、远程刷新、键盘、日期手输及提交反馈，不创建业务单据。">
    <div data-testid="control-contract-demo" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2"><Select className="w-44" aria-label="验收控件状态" value={variant} onValueChange={setVariant} options={[{value: "normal", label: "正常"}, {value: "disabled", label: "禁用"}, {value: "loading", label: "加载中"}, {value: "error", label: "搜索失败"}]} /><Button type="button" size="sm" onClick={() => setRemoteRefresh((current) => !current)}>刷新远程候选样例</Button><Button type="button" size="sm" onClick={() => setPending((current) => !current)}>切换提交中样例</Button></div>
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <ErpField label="客户更换样例"><CustomerPicker aria-label="验收客户" value={customer} keyword={customerQuery} onKeywordChange={setCustomerQuery} options={contractCustomers.filter((item) => !customerQuery || `${item.name} ${item.contact}`.includes(customerQuery))} disabled={disabled} loading={loading} error={error} onSelect={setCustomer} onClear={() => setCustomer(null)} onRetry={() => setVariant("normal")} /></ErpField>
        <ErpField label="商品更换样例"><InventoryItemPicker aria-label="验收商品" value={stock} keyword={stockQuery} onKeywordChange={setStockQuery} options={contractStock} disabled={disabled} loading={loading} error={error} onSelect={setStock} onClear={() => setStock(null)} onRetry={() => setVariant("normal")} /></ErpField>
        <ErpField label="远程已选项保留"><Select searchable aria-label="验收远程选择" value={remoteValue} options={remoteRefresh ? contractRemoteOptions.slice(1) : contractRemoteOptions} onValueChange={setRemoteValue} onSearchValueChange={setRemoteQuery} disabled={disabled} searchLoading={loading} /></ErpField>
        <ErpField label="金额：零值与空草稿"><ErpAmountInput aria-label="验收金额" value={amountDraft} disabled={disabled} onValueChange={(detail) => setAmountDraft(detail.floatValue ?? "")} /></ErpField>
        <ErpField label="只读状态"><Input aria-label="验收只读" value="锁定单据，保持只读" readOnly /></ErpField>
        <ErpField label="数量上限 3"><ErpQuantityStepper label="验收数量" value={quantity} max={3} disabled={disabled} onChange={setQuantity} /></ErpField>
        <ErpField label="可手输日期（2026 年 10 月）"><ErpDatePicker aria-label="验收日期" value={date} onChange={setDate} min="2026-10-01" max="2026-10-31" clearable disabled={disabled} /></ErpField>
        <ErpSegmentedControl label="验收键盘分段" value={choice} onValueChange={setChoice} disabled={disabled} options={[{value: "first", label: "选项一"}, {value: "blocked", label: "不可选", disabled: true}, {value: "last", label: "选项三"}]} />
      </div>
      <p role="status" data-testid="contract-selection" className="text-xs text-[var(--erp-color-text-secondary)]">当前客户：{customer?.name || "未选择"}；当前商品：{stock?.model || "未选择"}</p>
      <output className="sr-only" data-testid="contract-search-query">{remoteQuery}</output>
      <form onSubmit={(event) => {event.preventDefault(); setPending(true);}} className="space-y-3">
        <ErpField label="必填定位样例" required error={!requiredValue ? "请填写本地验收字段" : undefined} reserveErrorSpace><Input aria-label="验收必填字段" value={requiredValue} onChange={(event) => setRequiredValue(event.target.value)} /></ErpField>
        <ErpSubmitBar embedded dirty canSubmit={Boolean(requiredValue)} blockedReason="请填写本地验收字段" submitting={pending} onCancel={() => setPending(false)} submitLabel="本地提交样例" />
      </form>
    </div>
  </DashboardSection>;
}

function TokenSwatch({name, value, className, dark = false}: {name: string; value: string; className: string; dark?: boolean}) {
  return <div className="overflow-hidden rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)]"><div className={`h-12 ${className}`} /><div className="p-3"><p className="text-sm font-semibold">{name}</p><p className={`mt-1 erp-data-number text-xs ${dark ? "text-[var(--erp-color-text-secondary)]" : "text-[var(--erp-color-text-muted)]"}`}>{value}</p></div></div>;
}

function Metric({label, token}: {label: string; token: string}) {
  const [value, setValue] = useState("—");
  useEffect(() => {setValue(getComputedStyle(document.documentElement).getPropertyValue(token).trim());}, [token]);
  return <div className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-3"><p className="text-xs text-[var(--erp-color-text-muted)]">{label}</p><p className="mt-1 erp-data-number text-sm font-semibold">{value}</p></div>;
}
