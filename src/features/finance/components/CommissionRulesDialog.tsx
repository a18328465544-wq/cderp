import {useEffect, useMemo, useState, type ReactNode} from "react";
import {Check, Info, Plus, Settings2, Trash2} from "lucide-react";
import {ErpDatePicker} from "@/src/components/common/ErpDatePicker";
import {ErpCheckboxField, ErpDialogShell, ErpField, ErpRadioField} from "@/src/components/common";
import {Button, Input, Select} from "@/src/components/ui";
import type {CommissionMode} from "@/src/types/commission";
import type {CommissionRule, CommissionRuleBase, CommissionRuleCalculation, CommissionRuleTier, CommissionRules} from "@/src/types/legacy";
import {commissionRuleLabel, normalizeCommissionRules} from "@/src/utils/commissionRules";

export interface CommissionRulesDialogProps {
  open: boolean;
  initialMode: CommissionMode;
  rules: CommissionRules | null;
  loading?: boolean;
  pending?: boolean;
  error?: string;
  onOpenChange: (open: boolean) => void;
  onRetry?: () => void;
  onSave: (rules: CommissionRules) => Promise<void> | void;
}

function cloneRules(rules: CommissionRules | null) {
  return normalizeCommissionRules(rules ? structuredClone(rules) : undefined);
}

function modeLabel(mode: CommissionMode) {
  return mode === "purchase" ? "进货提成规则" : "销售提成规则";
}

function SectionCard({title, children, className = ""}: {title: string; children: ReactNode; className?: string}) {
  return <section className={`rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-4 ${className}`}>
    <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--erp-color-text)]"><span className="h-5 w-1 rounded-full bg-[var(--erp-color-primary)]" />{title}</h3>
    <div className="mt-4">{children}</div>
  </section>;
}

function RadioChoice({name, checked, label, description, onChange, children}: {name: string; checked: boolean; label: string; description: string; onChange: () => void; children?: ReactNode}) {
  return <ErpRadioField name={name} value={label} checked={checked} onChange={onChange} label={label} description={description} variant="inline" className="gap-3 px-1 py-2" >{children}</ErpRadioField>;
}

function CheckChoice({checked, label, description, onChange}: {checked: boolean; label: string; description?: string; onChange: (checked: boolean) => void}) {
  return <ErpCheckboxField variant="inline" checked={checked} onChange={(event) => onChange(event.target.checked)} label={<span className="block text-xs font-semibold text-[var(--erp-color-text)]">{label}{description ? <span className="mt-0.5 block text-xs leading-4 text-[var(--erp-color-text-secondary)]">{description}</span> : null}</span>} className="px-1 py-1.5" />;
}

function PercentageInput({value, onChange, placeholder = "0.00", disabled = false}: {value: number; onChange: (value: number) => void; placeholder?: string; disabled?: boolean}) {
  return <div className="flex h-10 items-center overflow-hidden rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] focus-within:border-[var(--erp-color-primary)]">
    <Input type="number" min="0" max="100" step="0.01" value={Number.isFinite(value) ? (value * 100).toFixed(2) : ""} onChange={(event) => onChange(Math.min(1, Math.max(0, Number(event.target.value || 0) / 100)))} placeholder={placeholder} disabled={disabled} className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-3 erp-data-number text-sm shadow-none" aria-label="比例百分比" />
    <span className="border-l border-[var(--erp-color-border)] px-3 text-xs font-semibold text-[var(--erp-color-text-secondary)]">%</span>
  </div>;
}

function defaultTier(rule: CommissionRule): CommissionRuleTier {
  return {minAmount: 0, rate: rule.fixedRate, amount: 0};
}

function RuleForm({mode, rule, onChange}: {mode: CommissionMode; rule: CommissionRule; onChange: (changes: Partial<CommissionRule>) => void}) {
  const isPurchase = mode === "purchase";
  const baseOptions: Array<{value: CommissionRuleBase; label: string; description: string}> = isPurchase
    ? [
      {value: "purchase_amount_incl_tax", label: "进货金额（含税）", description: "按进货单含税金额计算提成"},
      {value: "purchase_amount_excl_tax", label: "进货金额（不含税）", description: "按进货单不含税金额计算提成"},
      {value: "profit", label: "利润金额", description: "按卖货金额减进货金额计算提成"},
    ]
    : [
      {value: "sales_amount_incl_tax", label: "销售金额（含税）", description: "按销售单含税金额计算提成"},
      {value: "sales_amount_excl_tax", label: "销售金额（不含税）", description: "按销售单不含税金额计算提成"},
      {value: "profit", label: "利润金额", description: "按卖货金额减进货金额计算提成"},
    ];

  const updateTargets = (key: "purchaseHandler" | "salesHandler" | "warehouseManager", value: boolean) => onChange({targets: {...rule.targets, [key]: value}});
  const tiers = rule.tiers.length ? rule.tiers : [defaultTier(rule)];
  const setCalculation = (calculation: CommissionRuleCalculation) => onChange({calculation, ...(calculation !== "fixed" && rule.tiers.length === 0 ? {tiers: [defaultTier(rule)]} : {})});
  const setTier = (index: number, changes: Partial<CommissionRuleTier>) => onChange({tiers: tiers.map((tier, tierIndex) => tierIndex === index ? {...tier, ...changes} : tier)});
  const addTier = () => {
    const previous = tiers.at(-1);
    onChange({tiers: [...tiers, {minAmount: previous?.maxAmount ?? previous?.minAmount ?? 0, rate: rule.fixedRate, amount: 0}]});
  };
  const removeTier = (index: number) => {
    if (tiers.length <= 1) return;
    onChange({tiers: tiers.filter((_, tierIndex) => tierIndex !== index)});
  };

  return <div className="grid gap-3 xl:grid-cols-2">
    <SectionCard title="提成计算方式">
      <div className="space-y-1">
        <RadioChoice name={`commission-${mode}-calculation`} checked={rule.calculation === "fixed"} label="按固定比例" description={`所有${isPurchase ? "进货" : "销售"}单统一按比例计算提成`} onChange={() => setCalculation("fixed")}>
          <span className="w-36"><PercentageInput value={rule.fixedRate} onChange={(value) => onChange({fixedRate: value})} /></span>
        </RadioChoice>
        <RadioChoice name={`commission-${mode}-calculation`} checked={rule.calculation === "tiered"} label="按阶梯比例" description={`按${isPurchase ? "进货" : "销售"}金额区间设置不同提成比例`} onChange={() => setCalculation("tiered")}>
          <Button type="button" size="sm" variant="secondary" onClick={() => setCalculation("tiered")}>设置阶梯</Button>
        </RadioChoice>
        <RadioChoice name={`commission-${mode}-calculation`} checked={rule.calculation === "amount_range"} label="按金额区间" description="按金额区间设置固定提成金额" onChange={() => setCalculation("amount_range")}>
          <Button type="button" size="sm" variant="secondary" onClick={() => setCalculation("amount_range")}>设置区间</Button>
        </RadioChoice>
      </div>
      {rule.calculation !== "fixed" ? <div className="mt-3 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-info-soft)] p-3">
        <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold text-[var(--erp-color-primary)]"><span>{rule.calculation === "tiered" ? "阶梯规则" : "金额区间"}</span><Button type="button" size="xs" variant="ghost" onClick={addTier}><Plus className="h-3.5 w-3.5" />添加</Button></div>
        <div className="space-y-2">
          {tiers.map((tier, index) => <div key={`tier-${index}`} className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_2rem]">
            <Input type="number" min="0" value={tier.minAmount} onChange={(event) => setTier(index, {minAmount: Math.max(0, Number(event.target.value || 0))})} placeholder="起始金额" aria-label={`第${index + 1}档起始金额`} />
            <Input type="number" min="0" value={tier.maxAmount ?? ""} onChange={(event) => setTier(index, {maxAmount: event.target.value === "" ? undefined : Math.max(0, Number(event.target.value))})} placeholder="结束金额（可选）" aria-label={`第${index + 1}档结束金额`} />
            {rule.calculation === "tiered" ? <PercentageInput value={tier.rate ?? rule.fixedRate} onChange={(value) => setTier(index, {rate: value})} /> : <div className="flex h-10 items-center overflow-hidden rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)]"><span className="pl-3 text-xs text-[var(--erp-color-text-secondary)]">¥</span><Input type="number" min="0" value={tier.amount ?? 0} onChange={(event) => setTier(index, {amount: Math.max(0, Number(event.target.value || 0))})} placeholder="固定金额" className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-2 erp-data-number shadow-none" aria-label={`第${index + 1}档固定金额`} /></div>}
            <Button type="button" size="icon" variant="ghost" onClick={() => removeTier(index)} disabled={tiers.length <= 1} aria-label={`删除第${index + 1}档`}><Trash2 className="h-4 w-4" /></Button>
          </div>)}
        </div>
      </div> : null}
    </SectionCard>

    <SectionCard title="提成基数">
      <div className="space-y-1">{baseOptions.map((option) => <RadioChoice key={option.value} name={`commission-${mode}-base`} checked={rule.base === option.value} label={option.label} description={option.description} onChange={() => onChange({base: option.value})} />)}</div>
    </SectionCard>

    <SectionCard title="提成对象" className="xl:col-span-2">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <CheckChoice checked={isPurchase ? rule.targets.purchaseHandler : rule.targets.salesHandler} label={isPurchase ? "采购经办人" : "销售经办人"} description={isPurchase ? "采购单的经办人" : "销售单的经办人"} onChange={(checked) => updateTargets(isPurchase ? "purchaseHandler" : "salesHandler", checked)} />
        <CheckChoice checked={rule.targets.warehouseManager} label="仓库管理员" description="负责验收入库或出库的员工" onChange={(checked) => updateTargets("warehouseManager", checked)} />
        <div className="rounded-[var(--erp-radius-md)] px-1 py-1.5"><p className="text-xs font-semibold text-[var(--erp-color-text)]">自定义成员</p><p className="mt-0.5 text-xs leading-4 text-[var(--erp-color-text-secondary)]">{rule.targets.customMemberIds.length ? `已保留 ${rule.targets.customMemberIds.length} 名成员配置` : "当前未配置自定义成员"}</p></div>
      </div>
      {rule.targets.customMemberIds.length ? <p className="mt-3 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] px-3 py-2 text-xs text-[var(--erp-color-text-secondary)]">已有自定义成员会继续参与计算；本次设置不会清除已有成员配置。</p> : null}
    </SectionCard>

    <SectionCard title="其他规则">
      <div className="space-y-1">
        <CheckChoice checked={rule.onlyCompleted} label={isPurchase ? "只对已入库的进货单计算提成" : "只对已出库的销售单计算提成"} onChange={(checked) => onChange({onlyCompleted: checked})} />
        <CheckChoice checked={rule.adjustOnReturn} label="退货或红冲单据自动扣减提成" onChange={(checked) => onChange({adjustOnReturn: checked})} />
        <CheckChoice checked={rule.linkSupplier} label={`${isPurchase ? "提成与供应商" : "提成与客户"}挂钩`} description="保留业务对象维度，便于后续按合作方查看" onChange={(checked) => onChange({linkSupplier: checked})} />
        <div className="flex flex-wrap items-center gap-2 pt-2"><ErpCheckboxField variant="inline" checked={rule.capEnabled} onChange={(event) => onChange({capEnabled: event.target.checked})} label="设置提成上限" className="px-1 py-1.5" /><span className="w-36"><PercentageInput value={rule.capRate} onChange={(value) => onChange({capRate: value})} placeholder="上限比例" disabled={!rule.capEnabled} /></span></div>
      </div>
    </SectionCard>

    <SectionCard title="提成发放">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><div className="mb-2 text-xs font-semibold text-[var(--erp-color-text-secondary)]">发放方式</div><div className="flex flex-wrap gap-2 text-xs font-semibold text-[var(--erp-color-text)]"><ErpRadioField name={`commission-${mode}-payout`} value="instant" checked={rule.payoutMethod === "instant"} onChange={() => onChange({payoutMethod: "instant"})} label="随工资发放" variant="inline" className="px-0 py-0 text-xs" /><ErpRadioField name={`commission-${mode}-payout`} value="single" checked={rule.payoutMethod === "single"} onChange={() => onChange({payoutMethod: "single"})} label="单独发放" variant="inline" className="px-0 py-0 text-xs" /></div></div>
        <ErpField label="发放周期"><Select value={rule.payoutCycle} options={[{value: "monthly", label: "按月发放"}, {value: "per_order", label: "按单发放"}]} onValueChange={(value) => onChange({payoutCycle: value as CommissionRule["payoutCycle"]})} aria-label="提成发放周期" /></ErpField>
        <ErpField className="sm:col-span-2" label="生效时间"><ErpDatePicker value={rule.effectiveDate} onChange={(value) => onChange({effectiveDate: value})} aria-label="提成规则生效时间" /></ErpField>
      </div>
      <p className="mt-3 text-xs leading-5 text-[var(--erp-color-text-secondary)]">规则保存后只影响新生成的提成记录，历史记录不会被重新计算。</p>
    </SectionCard>
  </div>;
}

export function CommissionRulesDialog({open, initialMode, rules, loading = false, pending = false, error, onOpenChange, onRetry, onSave}: CommissionRulesDialogProps) {
  const [activeMode, setActiveMode] = useState<CommissionMode>(initialMode);
  const [draft, setDraft] = useState<CommissionRules>(() => cloneRules(rules));
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (!open) return;
    setActiveMode(initialMode);
    setDraft(cloneRules(rules));
    setSaveError("");
  }, [initialMode, open, rules]);

  const activeRule = draft[activeMode];
  const updateActiveRule = (changes: Partial<CommissionRule>) => setDraft((current) => normalizeCommissionRules({...current, [activeMode]: {...current[activeMode], ...changes}}));
  const preview = useMemo(() => {
    const baseLabel = activeRule.base === "profit" ? "利润金额" : activeRule.base.includes("purchase") ? `进货金额${activeRule.base.endsWith("incl_tax") ? "（含税）" : "（不含税）"}` : `销售金额${activeRule.base.endsWith("incl_tax") ? "（含税）" : "（不含税）"}`;
    const targetLabel = [activeMode === "purchase" ? activeRule.targets.purchaseHandler ? "采购经办人" : "" : activeRule.targets.salesHandler ? "销售经办人" : "", activeRule.targets.warehouseManager ? "仓库管理员" : "", activeRule.targets.customMemberIds.length ? "自定义成员" : ""].filter(Boolean).join("、") || "未启用提成对象";
    return {baseLabel, targetLabel, methodLabel: commissionRuleLabel(activeRule)};
  }, [activeMode, activeRule]);

  const save = async () => {
    setSaveError("");
    try {
      await onSave(draft);
      onOpenChange(false);
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "保存提成规则失败，请稍后重试。");
    }
  };

  const displayError = saveError || error;
  const title = <span className="flex items-center gap-2"><Settings2 className="h-4 w-4 text-[var(--erp-color-primary)]" />进货/销售提成规则设置</span>;
  const footer = loading && !rules
    ? <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>关闭</Button>
    : !rules
      ? <div className="flex w-full justify-end gap-2"><Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>关闭</Button>{onRetry ? <Button type="button" variant="primary" onClick={onRetry} disabled={loading}>重试</Button> : null}</div>
      : <div className="flex w-full flex-wrap items-center justify-between gap-3"><p className="flex items-center gap-1.5 text-xs text-[var(--erp-color-text-secondary)]"><Info className="h-3.5 w-3.5" />历史提成记录不受影响，仅对新生成单据生效。</p><div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>取消</Button><Button type="button" variant="primary" onClick={() => void save()} disabled={pending}><Check className="h-4 w-4" />{pending ? "保存中…" : "保存规则"}</Button></div></div>;

  return <ErpDialogShell
    open={open}
    onOpenChange={(nextOpen) => {if (!pending) onOpenChange(nextOpen);}}
    pending={pending}
    size="wide"
    title={title}
    description="统一配置计算方式、提成对象和发放规则；历史提成记录不会被重新计算。"
    footer={footer}
  >
    {loading && !rules ? <div className="flex min-h-56 items-center justify-center text-sm text-[var(--erp-color-text-secondary)]">正在加载提成规则…</div> : !rules ? <div className="space-y-4"><p className="text-sm text-[var(--erp-color-text-secondary)]">无法读取提成规则。</p>{displayError ? <p role="alert" className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] px-3 py-2 text-xs text-[var(--erp-color-danger)]">{displayError}</p> : null}</div> : <div className="space-y-4">
      <div className="flex items-center gap-5 border-b border-[var(--erp-color-border)] px-1"><div className="flex items-center gap-5">{(["purchase", "sales"] as CommissionMode[]).map((mode) => <Button key={mode} type="button" variant="ghost" onClick={() => setActiveMode(mode)} className={`relative rounded-none px-1 pb-3 pt-1 text-sm ${activeMode === mode ? "text-[var(--erp-color-primary)]" : "text-[var(--erp-color-text-secondary)]"}`}>{modeLabel(mode)}{activeMode === mode ? <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[var(--erp-color-primary)]" /> : null}</Button>)}</div></div>
      <div className="flex items-start gap-2 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-info-soft)] px-3 py-2.5 text-xs leading-5 text-[var(--erp-color-primary)]"><Info className="mt-0.5 h-4 w-4 shrink-0" /><span>当前编辑：{modeLabel(activeMode)}。系统只会按已生效规则生成新提成记录，保存不会改变历史金额。</span></div>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px]"><RuleForm mode={activeMode} rule={activeRule} onChange={updateActiveRule} /><aside className="h-fit rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-info-soft)] p-4"><h3 className="text-sm font-semibold text-[var(--erp-color-text)]">规则预览</h3><div className="mt-4 space-y-3 text-xs"><PreviewFact label="计算方式" value={preview.methodLabel} /><PreviewFact label="提成基数" value={preview.baseLabel} /><PreviewFact label="提成对象" value={preview.targetLabel} /><PreviewFact label="发放周期" value={activeRule.payoutCycle === "monthly" ? "按月发放" : "按单发放"} /><PreviewFact label="生效时间" value={activeRule.effectiveDate} /></div></aside></div>
      {displayError ? <p role="alert" className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] px-3 py-2 text-xs text-[var(--erp-color-danger)]">{displayError}</p> : null}
    </div>}
  </ErpDialogShell>;
}

function PreviewFact({label, value}: {label: string; value: string}) {
  return <div className="border-t border-[var(--erp-color-border)] pt-3 first:border-t-0 first:pt-0"><div className="font-semibold text-[var(--erp-color-text)]">{label}</div><div className="mt-1 text-[var(--erp-color-text-secondary)]">{value}</div></div>;
}
