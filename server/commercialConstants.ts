/**
 * Commercial tenancy defaults used while the legacy single-store dataset is
 * upgraded.  Existing rows are assigned to this tenant by the additive
 * migration; new deployments can create additional tenants through the
 * provisioning repository without changing the legacy business identifiers.
 */
export const DEFAULT_TENANT_ID = "tenant_default";
export const DEFAULT_STORE_ID = "store_default";
export const DEFAULT_TENANT_SLUG = "default";
export const DEFAULT_TENANT_NAME = "默认企业";
export const DEFAULT_STORE_NAME = "主门店";
export const DEFAULT_STORE_TIMEZONE = "Asia/Shanghai";
export const DEFAULT_CURRENCY = "CNY";

export const commercialTenantStatusValues = ["active", "suspended", "archived"] as const;
export const commercialMembershipStatusValues = ["active", "invited", "deactivated"] as const;
export const commercialSubscriptionStatusValues = ["trialing", "active", "past_due", "canceled"] as const;
export const commercialPlanCodeValues = ["pilot", "standard", "pro", "enterprise"] as const;
export const commercialStoreStatusValues = ["active", "archived"] as const;
export const commercialExportFormatValues = ["json", "csv"] as const;
export const commercialUsageMetricValues = ["media_bytes", "ai_tokens", "active_seats"] as const;

export type TenantStatus = (typeof commercialTenantStatusValues)[number];
export type MembershipStatus = (typeof commercialMembershipStatusValues)[number];
export type SubscriptionStatus = (typeof commercialSubscriptionStatusValues)[number];
export type CommercialPlanCode = (typeof commercialPlanCodeValues)[number];
export type CommercialStoreStatus = (typeof commercialStoreStatusValues)[number];
export type CommercialExportFormat = (typeof commercialExportFormatValues)[number];
export type CommercialUsageMetric = (typeof commercialUsageMetricValues)[number];

export const COMMERCIAL_PLAN_DEFAULTS: Record<CommercialPlanCode, {
  seatLimit: number;
  mediaBytesLimit: number;
  aiTokensLimit: number;
  featureFlags: string[];
}> = {
  pilot: {
    seatLimit: 3,
    mediaBytesLimit: 1_000_000_000,
    aiTokensLimit: 100_000,
    featureFlags: ["core", "reports", "ai_assist"],
  },
  standard: {
    seatLimit: 10,
    mediaBytesLimit: 10_000_000_000,
    aiTokensLimit: 1_000_000,
    featureFlags: ["core", "reports", "ai_assist", "exports", "crm"],
  },
  pro: {
    seatLimit: 50,
    mediaBytesLimit: 100_000_000_000,
    aiTokensLimit: 10_000_000,
    featureFlags: ["core", "reports", "ai_assist", "exports", "crm", "integrations"],
  },
  enterprise: {
    seatLimit: 500,
    mediaBytesLimit: 1_000_000_000_000,
    aiTokensLimit: 100_000_000,
    featureFlags: ["core", "reports", "ai_assist", "exports", "crm", "integrations", "sso"],
  },
};
