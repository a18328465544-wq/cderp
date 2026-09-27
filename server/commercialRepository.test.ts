import assert from "node:assert/strict";
import test from "node:test";
import { CommercialValidationError, assertOwnerAccountEligible, hashIdempotencyPayload, recordCommercialUsage, subscriptionAllowsFeature, updateCommercialSubscription, upsertCommercialMembership } from "./commercialRepository.ts";
import type { CommercialSubscription, CommercialTenant } from "./commercialRepository.ts";

test("commercial control-plane rejects malformed memberships before opening the database", async () => {
  await assert.rejects(
    () => upsertCommercialMembership({ userId: "", role: "店员" }),
    (error: unknown) => error instanceof CommercialValidationError && error.code === "INVALID_MEMBERSHIP",
  );
});

test("commercial control-plane validates plan, quota and usage inputs", async () => {
  await assert.rejects(
    () => updateCommercialSubscription("tenant_default", { planCode: "unknown" as never }),
    (error: unknown) => error instanceof CommercialValidationError && error.code === "INVALID_PLAN",
  );
  await assert.rejects(
    () => recordCommercialUsage({ metric: "unknown", quantity: 1 }),
    (error: unknown) => error instanceof CommercialValidationError && error.code === "INVALID_USAGE_METRIC",
  );
  await assert.rejects(
    () => recordCommercialUsage({ metric: "media_bytes", quantity: 0 }),
    (error: unknown) => error instanceof CommercialValidationError && error.code === "INVALID_USAGE_QUANTITY",
  );
  await assert.rejects(
    () => recordCommercialUsage({ metric: "active_seats", quantity: 1 }),
    (error: unknown) => error instanceof CommercialValidationError && error.code === "USAGE_METRIC_READ_ONLY",
  );
});

test("tenant provisioning requires an explicitly enabled owner account", () => {
  assert.doesNotThrow(() => assertOwnerAccountEligible({id: "owner", data: {enabled: true}}));
  assert.throws(
    () => assertOwnerAccountEligible({id: "owner", data: {enabled: false}}),
    (error: unknown) => error instanceof CommercialValidationError && error.code === "OWNER_DISABLED",
  );
  assert.throws(
    () => assertOwnerAccountEligible({id: "owner", data: {}}),
    (error: unknown) => error instanceof CommercialValidationError && error.code === "OWNER_DISABLED",
  );
  assert.throws(
    () => assertOwnerAccountEligible(null),
    (error: unknown) => error instanceof CommercialValidationError && error.code === "OWNER_NOT_FOUND",
  );
});

test("idempotency payload hashes are stable and body-sensitive", () => {
  assert.equal(hashIdempotencyPayload({invoice: "A", amount: 10}), hashIdempotencyPayload({invoice: "A", amount: 10}));
  assert.notEqual(hashIdempotencyPayload({invoice: "A", amount: 10}), hashIdempotencyPayload({invoice: "A", amount: 11}));
});

test("commercial feature gates deny inactive, expired and unknown entitlements", () => {
  const tenant: CommercialTenant = {id: "tenant_a", slug: "a", name: "A", status: "active", planCode: "standard", settings: {}};
  const subscription: CommercialSubscription = {tenantId: tenant.id, planCode: "standard", status: "active", seatLimit: 10, mediaBytesLimit: 10, aiTokensLimit: 10, currentPeriodEnd: "2026-08-31"};
  const now = new Date("2026-08-29T12:00:00Z");
  assert.equal(subscriptionAllowsFeature({tenant, subscription, feature: "exports", now}), true);
  assert.equal(subscriptionAllowsFeature({tenant, subscription, feature: "not-a-feature", now}), false);
  assert.equal(subscriptionAllowsFeature({tenant: {...tenant, status: "suspended"}, subscription, feature: "exports", now}), false);
  assert.equal(subscriptionAllowsFeature({tenant, subscription: {...subscription, currentPeriodEnd: "2026-08-28"}, feature: "exports", now}), false);
  assert.equal(subscriptionAllowsFeature({tenant, subscription: {...subscription, status: "past_due"}, feature: "exports", now}), false);
  assert.equal(subscriptionAllowsFeature({tenant, subscription: {...subscription, status: "past_due"}, feature: "core", now}), true);
});

test("trial feature access ends at the tenant trial boundary", () => {
  const tenant: CommercialTenant = {id: "tenant_trial", slug: "trial", name: "Trial", status: "active", planCode: "pilot", trialEndsAt: "2026-08-28T23:59:59.000Z", settings: {}};
  const subscription: CommercialSubscription = {tenantId: tenant.id, planCode: "pilot", status: "trialing", seatLimit: 3, mediaBytesLimit: 10, aiTokensLimit: 10};
  assert.equal(subscriptionAllowsFeature({tenant, subscription, feature: "ai_assist", now: new Date("2026-08-29T00:00:00Z")}), false);
  assert.equal(subscriptionAllowsFeature({tenant: {...tenant, trialEndsAt: "2026-08-30T23:59:59.000Z"}, subscription, feature: "ai_assist", now: new Date("2026-08-29T00:00:00Z")}), true);
});
