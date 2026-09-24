export type FinanceReconciliationSeverity = "error" | "warning";
export type FinanceReconciliationDomain = "accounts" | "payments" | "invoices" | "returns" | "classification";
export type FinanceReconciliationRecommendedAction = "review" | "resolve" | "reverse";

export interface FinanceReconciliationActionSummary {
  action: "reviewed" | "resolved" | "reversal_requested";
  notes?: string;
  actor: string;
  createdAt: string;
}

export interface FinanceReconciliationIssue {
  fingerprint: string;
  code: string;
  severity: FinanceReconciliationSeverity;
  domain: FinanceReconciliationDomain;
  entityId?: string;
  relatedIds?: string[];
  sourcePath?: string;
  reversePath?: string;
  recommendedAction: FinanceReconciliationRecommendedAction;
  lastAction?: FinanceReconciliationActionSummary;
  message: string;
}

export interface FinanceReconciliationReport {
  generatedAt: string;
  healthy: boolean;
  truncated: boolean;
  summary: {
    errorCount: number;
    warningCount: number;
    accountCount: number;
    paymentCount: number;
    invoiceCount: number;
    returnCount: number;
  };
  checks: {
    accountBalanceChains: number;
    paymentLedgerLinks: number;
    invoiceSettlements: number;
    returnFinanceInvariants: number;
  };
  issues: FinanceReconciliationIssue[];
}
