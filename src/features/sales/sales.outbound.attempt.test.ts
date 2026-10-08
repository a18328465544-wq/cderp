import assert from "node:assert/strict";
import test from "node:test";
import type {SalesOutboundPreflightResult, SalesOutboundRequest, SalesOutboundResult} from "@/src/types/sales";
import {createSubmissionIdentity} from "@/src/services/api/submissionIdentity";
import {createOutboundAttempt, createOutboundDraft, isCurrentOutboundAttempt, runOutboundAttempt, updateOutboundDraft} from "./sales.outbound.attempt";

const scope = {invoiceId: "XS-A"};
const draft = updateOutboundDraft(createOutboundDraft(scope), scope, {scanCodes: "SN-A\nsn-a", remarks: " A 的备注 "});
const preview: SalesOutboundPreflightResult = {invoiceId: "XS-A", invoiceNo: "XS-001", expectedCount: 1, matchedCount: 1, ready: true, unknownCodes: [], duplicateCodes: [], rows: []};
const result: SalesOutboundResult = {id: "XS-A", invoiceNo: "XS-001", outboundStatus: "已出库", outboundTime: "2026-10-04", outboundHandler: "仓库员"};

test("an outbound attempt owns its invoice, real payload and retry key before any await", async () => {
  const identity = createSubmissionIdentity("sales-outbound");
  const attempt = createOutboundAttempt(draft, " 仓库员 ", false, identity.keyFor);
  let release!: (value: SalesOutboundPreflightResult) => void;
  const pendingPreview = new Promise<SalesOutboundPreflightResult>((resolve) => {release = resolve;});
  const calls: Array<{id: string; values: SalesOutboundRequest; key?: string}> = [];
  const pending = runOutboundAttempt(attempt, {
    preflightOutbound: async (id, values) => {calls.push({id, values}); return pendingPreview;},
    confirmOutbound: async (id, values, _signal, key) => {calls.push({id, values, key}); return result;},
  }, () => {});
  const otherScope = {invoiceId: "XS-B"};
  const otherDraft = updateOutboundDraft(draft, otherScope, {remarks: "B 的备注"});
  identity.keyFor({invoiceId: "XS-B", values: {remarks: otherDraft.remarks}});
  release(preview);
  await pending;
  assert.equal(calls.length, 2);
  assert.equal(calls[1]?.id, "XS-A");
  assert.equal(calls[1]?.key, attempt.idempotencyKey);
  assert.deepEqual(calls[1]?.values, {handler: "仓库员", codes: ["SN-A", "sn-a"], manual: false, remarks: "A 的备注"});
  assert.equal(isCurrentOutboundAttempt(attempt, otherDraft), false);
  assert.equal(otherDraft.remarks, "B 的备注");
});

test("feedback is scoped to the current draft, not a matching invoice id alone", () => {
  const attempt = createOutboundAttempt(draft, "仓库员", false, () => "key");
  assert.equal(isCurrentOutboundAttempt(attempt, draft), true);
  assert.equal(isCurrentOutboundAttempt(attempt, updateOutboundDraft(draft, scope, {remarks: "已修正"})), false);
  assert.equal(isCurrentOutboundAttempt(attempt, createOutboundDraft(scope)), false);
  assert.equal(isCurrentOutboundAttempt(attempt, {...draft, scope: {invoiceId: "XS-A"}}), false, "returning to A creates a new editor, not ownership of the old attempt");
  assert.equal(isCurrentOutboundAttempt(undefined, draft), false);
});

test("same outbound payload keeps its retry identity while edits or invoice changes rotate it", () => {
  const identity = createSubmissionIdentity("sales-outbound");
  const first = createOutboundAttempt(draft, "仓库员", false, identity.keyFor);
  assert.equal(createOutboundAttempt(draft, "仓库员", false, identity.keyFor).idempotencyKey, first.idempotencyKey);
  const edited = updateOutboundDraft(draft, scope, {remarks: "新原因"});
  assert.notEqual(createOutboundAttempt(edited, "仓库员", false, identity.keyFor).idempotencyKey, first.idempotencyKey);
  const manual = createOutboundAttempt(edited, "仓库员", true, identity.keyFor);
  assert.deepEqual(manual.values.codes, []);
  assert.equal(manual.values.remarks, "新原因");
  assert.throws(() => createOutboundAttempt(createOutboundDraft({invoiceId: null}), "仓库员", false, identity.keyFor), /请选择/);
});

test("mismatched or refused previews cannot dispatch an outbound command", async () => {
  for (const response of [{...preview, invoiceId: "XS-B"}, {...preview, ready: false, unknownCodes: ["BAD"]}, {...preview, ready: false, duplicateCodes: ["SN-A"]}]) {
    let confirmations = 0;
    let feedback = 0;
    const attempt = createOutboundAttempt(draft, "仓库员", false, () => "key");
    await assert.rejects(runOutboundAttempt(attempt, {
      preflightOutbound: async () => response,
      confirmOutbound: async () => {confirmations++; return result;},
    }, () => {feedback++;}));
    assert.equal(confirmations, 0);
    assert.equal(feedback, response.invoiceId === attempt.invoiceId ? 1 : 0);
  }
});

test("unexpected confirmation responses cannot be announced as completed outbound", async () => {
  for (const response of [{...result, id: "XS-B"}, {...result, outboundStatus: "待出库"}]) {
    const attempt = createOutboundAttempt(draft, "仓库员", false, () => "key");
    await assert.rejects(runOutboundAttempt(attempt, {preflightOutbound: async () => preview, confirmOutbound: async () => response}, () => {}), /出库结果尚未确认/);
  }
});
