import assert from "node:assert/strict";
import test from "node:test";
import {createSubmissionIdentity} from "./submissionIdentity";
import {returnsApi} from "./endpoints/returns";
import type {PurchaseReturnFormValues, SalesReturnFormValues} from "@/src/types/returns";
import {purchaseApi} from "./endpoints/purchase";
import {salesApi} from "./endpoints/sales";
import {createPurchaseDefaults} from "@/src/features/purchase/purchase.defaults";
import {createSalesDefaults} from "@/src/features/sales/sales.defaults";
import {resolveSubmissionKey} from "./submissionIdentity";

test("one payload keeps its key on network loss, edited payload and confirmed success rotate it", () => {
  const identity = createSubmissionIdentity("return");
  const payload = {amount: 100, inventory: ["KC-1"]};
  const first = identity.keyFor(payload);
  assert.equal(identity.keyFor({...payload}), first);
  assert.notEqual(identity.keyFor({...payload, amount: 200}), first);
  const second = identity.keyFor(payload);
  identity.reset(); assert.notEqual(identity.keyFor(payload), second);
});

test("explicit submission keys remain compatible with existing API callers", () => {
  assert.equal(resolveSubmissionKey("existing-key", {amount: 1}), "existing-key");
  assert.equal(resolveSubmissionKey(undefined, {amount: 1}), undefined);
});

for (const kind of ["purchase", "sales"] as const) {
  test(`${kind} keys track normalized HTTP payloads rather than editor-only changes`, async () => {
    const originalFetch = globalThis.fetch;
    const identity = createSubmissionIdentity(`${kind}-create`);
    const account = {id: "SA-A", name: "本地账户A", type: "微信", enabled: true, balance: 10000, availableBalance: 10000};
    const purchase = createPurchaseDefaults("本地测试员");
    purchase.sourcePartnerId = "C-A"; purchase.supplierName = "本地客户A";
    purchase.settlementAccountId = account.id; purchase.paidAmount = 100; purchase.remarks = "原始备注";
    purchase.items[0] = {...purchase.items[0]!, productId: "P-A", productName: "RTX5090", buyPrice: 100};
    const sales = createSalesDefaults("本地测试员");
    sales.customerId = "C-A"; sales.customerName = "本地客户A";
    sales.settlementAccountId = account.id; sales.paidAmount = 150; sales.remarks = "原始备注";
    sales.items[0] = {...sales.items[0]!, productId: "P-A", productName: "RTX5090", sellPrice: 150};
    const writes: Array<{key: string | null; body: string}> = [];
    globalThis.fetch = async (_url, init) => {
      writes.push({key: new Headers(init?.headers).get("Idempotency-Key"), body: String(init?.body)});
      throw new TypeError("local simulated lost response");
    };
    const values = kind === "purchase" ? purchase : sales;
    const send = () => kind === "purchase" ? purchaseApi.create(purchase, account, undefined, identity) : salesApi.create(sales, account, undefined, identity);
    try {
      await assert.rejects(send());
      await assert.rejects(send());
      values.remarks += " ";
      values.items[1]!.quantity = 0; // Empty spare editor is not part of the DTO.
      await assert.rejects(send());
      assert.ok(writes[0]!.key);
      for (const write of writes.slice(1)) assert.deepEqual(write, writes[0]);
      values.remarks = "修改后的备注";
      await assert.rejects(send());
      assert.notEqual(writes[3]!.key, writes[0]!.key);
      const changedKey = writes[3]!.key;
      values.settlementAccountId = "SA-B";
      account.id = "SA-B"; account.name = "本地账户B";
      await assert.rejects(send());
      assert.notEqual(writes[4]!.key, changedKey);
      const body = JSON.parse(writes[4]!.body);
      assert.equal(body.settlementAccountId, "SA-B"); assert.equal(body.settlementAccountName, "本地账户B");
      identity.reset();
      await assert.rejects(send());
      assert.notEqual(writes[5]!.key, writes[4]!.key);
    } finally {globalThis.fetch = originalFetch;}
  });
}

test("return creation retry transmits the same identity after a lost response", async () => {
  const originalFetch = globalThis.fetch;
  const identity = createSubmissionIdentity("return");
  const values: SalesReturnFormValues = {date: "2026-09-01", relatedDocNo: "XS-1", sourceInventoryId: "KC-1", sourceSalesItemIndex: 0, productId: "P-1", productName: "RTX4090", sn: "SN-1", partyName: "测试客户", partyId: "KH-1", contact: "", amount: 100, inventoryAction: "退回待检测", reason: "退货", responsibility: "客户", handler: "测试经办人", remarks: "", returnScope: "single", returnItems: []};
  const keys: string[] = [];
  globalThis.fetch = async (_url, init) => {
    keys.push(new Headers(init?.headers).get("Idempotency-Key") || "");
    if (keys.length === 1) throw new TypeError("network disconnected after server commit");
    return new Response(JSON.stringify({data: {id: "RET-1"}}), {status: 201});
  };
  try {
    await assert.rejects(returnsApi.createSales(values, undefined, identity.keyFor(values)));
    await returnsApi.createSales(values, undefined, identity.keyFor(values));
    assert.equal(keys[0], keys[1]); assert.ok(keys[0]);
  } finally {globalThis.fetch = originalFetch;}
});

for (const kind of ["purchase", "sales"] as const) {
  test(`${kind} return identity follows the final HTTP DTO, with explicit keys still supported`, async () => {
    const originalFetch = globalThis.fetch;
    const identity = createSubmissionIdentity(`${kind}-return`);
    const purchase: PurchaseReturnFormValues = {date: "2026-10-01", relatedDocNo: "JH-1", sourceInventoryId: "KC-1", amount: 100, settlementMode: "抵扣账款", settlementAccountId: "", handler: "测试员", reason: "退货", inventoryAction: "退回供应商", remarks: "备注", returnScope: "single"};
    const sales: SalesReturnFormValues = {date: "2026-10-01", relatedDocNo: "XS-1", sourceInventoryId: "KC-1", sourceSalesItemIndex: 0, productId: "P-1", productName: "RTX4090", sn: "SN-1", partyName: "客户", partyId: "C-1", contact: "", amount: 150, inventoryAction: "退回待检测", reason: "退货", responsibility: "客户", handler: "测试员", remarks: "备注", returnScope: "single"};
    const values = kind === "purchase" ? purchase : sales;
    const writes: Array<{key: string | null; body: string}> = [];
    globalThis.fetch = async (_url, init) => {
      writes.push({key: new Headers(init?.headers).get("Idempotency-Key"), body: String(init?.body)});
      throw new TypeError("local simulated lost return response");
    };
    const send = (key = identity as import("./submissionIdentity").SubmissionKey) => kind === "purchase" ? returnsApi.createPurchase(purchase, undefined, key) : returnsApi.createSales(sales, undefined, key);
    try {
      await assert.rejects(send());
      await assert.rejects(send());
      values.returnItems = [{sourceInventoryId: "KC-IGNORED", sourceSalesItemIndex: 1}];
      if (kind === "purchase") {purchase.reason += " "; purchase.remarks += " ";}
      await assert.rejects(send());
      assert.ok(writes[0]!.key);
      assert.deepEqual(writes[1], writes[0]);
      assert.deepEqual(writes[2], writes[0]);
      values.amount += 100;
      await assert.rejects(send());
      assert.notEqual(writes[3]!.key, writes[0]!.key);
      values.returnScope = "document";
      await assert.rejects(send());
      assert.notEqual(writes[4]!.key, writes[3]!.key);
      assert.equal(JSON.parse(writes[4]!.body).batchMode, "整单退货");
      assert.deepEqual(JSON.parse(writes[4]!.body).items, values.returnItems);
      identity.reset();
      await assert.rejects(send());
      assert.notEqual(writes[5]!.key, writes[4]!.key);
      await assert.rejects(send("existing-return-key"));
      assert.equal(writes[6]!.key, "existing-return-key");
    } finally {globalThis.fetch = originalFetch;}
  });
}
