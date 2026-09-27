import type {
  CommissionCalculationResult,
  CommissionRule,
  CommissionRuleTier,
  CommissionRules,
} from "../types";
import {commissionPayoutCycleValues, commissionPayoutMethodValues, commissionRuleBaseValues, commissionRuleCalculationValues} from "../types/legacy-commission";

const DEFAULT_EFFECTIVE_DATE = "2025-01-01";

const defaultTargets = () => ({
  purchaseHandler: true,
  salesHandler: true,
  warehouseManager: false,
  customMemberIds: [] as string[],
});

export function createDefaultCommissionRule(overrides: Partial<CommissionRule> = {}): CommissionRule {
  return {
    calculation: "fixed",
    fixedRate: 0.1,
    base: "profit",
    onlyCompleted: true,
    adjustOnReturn: true,
    linkSupplier: true,
    capEnabled: false,
    capRate: 0,
    payoutMethod: "instant",
    payoutCycle: "monthly",
    effectiveDate: DEFAULT_EFFECTIVE_DATE,
    ...overrides,
    targets: {
      ...defaultTargets(),
      ...(overrides.targets || {}),
      customMemberIds: Array.isArray(overrides.targets?.customMemberIds) ? [...overrides.targets!.customMemberIds] : [],
    },
    tiers: Array.isArray(overrides.tiers) ? overrides.tiers.map(normalizeTier) : [],
  };
}

export const DEFAULT_COMMISSION_RULES: CommissionRules = {
  purchase: createDefaultCommissionRule({
    base: "profit",
  }),
  sales: createDefaultCommissionRule({
    base: "profit",
  }),
  updatedAt: "2025-01-01T00:00:00.000Z",
};

function finiteNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampRate(value: unknown, fallback = 0) {
  return Math.min(1, Math.max(0, finiteNumber(value, fallback)));
}

function normalizeTier(tier: CommissionRuleTier): CommissionRuleTier {
  const minAmount = Math.max(0, finiteNumber(tier?.minAmount));
  const maxValue = tier?.maxAmount === undefined || tier?.maxAmount === null ? undefined : Math.max(minAmount, finiteNumber(tier.maxAmount));
  const amount = tier?.amount === undefined || tier?.amount === null ? undefined : Math.max(0, finiteNumber(tier.amount));
  const rate = tier?.rate === undefined || tier?.rate === null ? undefined : clampRate(tier.rate);
  return { minAmount, ...(maxValue === undefined ? {} : { maxAmount: maxValue }), ...(rate === undefined ? {} : { rate }), ...(amount === undefined ? {} : { amount }) };
}

export function normalizeCommissionRule(input: CommissionRulePatch | undefined, fallback?: CommissionRule): CommissionRule {
  const base = createDefaultCommissionRule(fallback || {});
  const next = input || {};
  const allowedCalculation = new Set<string>(commissionRuleCalculationValues);
  const allowedBases = new Set<string>(commissionRuleBaseValues);
  const allowedPayoutMethods = new Set<string>(commissionPayoutMethodValues);
  const allowedPayoutCycles = new Set<string>(commissionPayoutCycleValues);
  return {
    ...base,
    ...next,
    calculation: allowedCalculation.has(String(next.calculation)) ? next.calculation! : base.calculation,
    fixedRate: clampRate(next.fixedRate, base.fixedRate),
    base: allowedBases.has(String(next.base)) ? next.base! : base.base,
    tiers: Array.isArray(next.tiers) ? next.tiers.slice(0, 30).map(normalizeTier) : base.tiers,
    targets: {
      ...base.targets,
      ...(next.targets || {}),
      customMemberIds: Array.isArray(next.targets?.customMemberIds)
        ? next.targets!.customMemberIds.map(String).filter(Boolean).slice(0, 100)
        : base.targets.customMemberIds,
    },
    onlyCompleted: next.onlyCompleted === undefined ? base.onlyCompleted : Boolean(next.onlyCompleted),
    adjustOnReturn: next.adjustOnReturn === undefined ? base.adjustOnReturn : Boolean(next.adjustOnReturn),
    linkSupplier: next.linkSupplier === undefined ? base.linkSupplier : Boolean(next.linkSupplier),
    capEnabled: next.capEnabled === undefined ? base.capEnabled : Boolean(next.capEnabled),
    capRate: clampRate(next.capRate, base.capRate),
    payoutMethod: allowedPayoutMethods.has(String(next.payoutMethod)) ? next.payoutMethod! : base.payoutMethod,
    payoutCycle: allowedPayoutCycles.has(String(next.payoutCycle)) ? next.payoutCycle! : base.payoutCycle,
    effectiveDate: /^\d{4}-\d{2}-\d{2}$/.test(String(next.effectiveDate || "")) ? String(next.effectiveDate) : base.effectiveDate,
  };
}

export type CommissionRulePatch = Partial<Omit<CommissionRule, "targets">> & {
  targets?: Partial<CommissionRule["targets"]>;
};

export type CommissionRulesPatch = Partial<Omit<CommissionRules, "purchase" | "sales">> & {
  purchase?: CommissionRulePatch;
  sales?: CommissionRulePatch;
};

export function normalizeCommissionRules(input: CommissionRulesPatch | undefined): CommissionRules {
  const next = input || {};
  return {
    purchase: normalizeCommissionRule(next.purchase, DEFAULT_COMMISSION_RULES.purchase),
    sales: normalizeCommissionRule(next.sales, DEFAULT_COMMISSION_RULES.sales),
    updatedAt: /^\d{4}-\d{2}-\d{2}T/.test(String(next.updatedAt || "")) ? String(next.updatedAt) : DEFAULT_COMMISSION_RULES.updatedAt,
  };
}

function selectTier(rule: CommissionRule, baseAmount: number) {
  const tiers = [...rule.tiers].sort((a, b) => a.minAmount - b.minAmount);
  return tiers.find((tier) => baseAmount >= tier.minAmount && (tier.maxAmount === undefined || baseAmount <= tier.maxAmount)) ||
    tiers.filter((tier) => baseAmount >= tier.minAmount).at(-1);
}

export function calculateCommission(rule: CommissionRule, context: { purchaseAmount: number; salesAmount: number; profit: number }): CommissionCalculationResult {
  const rawBase = rule.base === "profit"
    ? context.profit
    : rule.base.startsWith("purchase") ? context.purchaseAmount : context.salesAmount;
  const baseAmount = Math.max(0, finiteNumber(rawBase));
  const tier = selectTier(rule, baseAmount);
  let amount = 0;
  let rate = rule.fixedRate;
  if (rule.calculation === "fixed") {
    amount = baseAmount * rule.fixedRate;
  } else if (rule.calculation === "tiered") {
    rate = tier?.rate ?? rule.fixedRate;
    amount = baseAmount * rate;
  } else {
    rate = tier?.rate ?? 0;
    amount = tier?.amount ?? (baseAmount * rate);
  }
  const capAmount = rule.capEnabled ? baseAmount * rule.capRate : Number.POSITIVE_INFINITY;
  const finalAmount = Math.max(0, Math.min(amount, capAmount));
  return {
    amount: Number(finalAmount.toFixed(2)),
    rate: Number((baseAmount > 0 ? finalAmount / baseAmount : rate).toFixed(6)),
    baseAmount: Number(baseAmount.toFixed(2)),
    method: rule.calculation,
  };
}

export function commissionRuleLabel(rule: CommissionRule) {
  if (rule.calculation === "fixed") return `固定比例 ${(rule.fixedRate * 100).toFixed(2)}%`;
  if (rule.calculation === "tiered") return "按阶梯比例";
  return "按金额区间";
}
