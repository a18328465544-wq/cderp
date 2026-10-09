import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {useForm} from "react-hook-form";
import {PurchasePaymentSection} from "../features/purchase/components/PurchasePaymentSection";
import {SalesPaymentSection} from "../features/sales/components/SalesPaymentSection";
import {createPurchaseDefaults} from "../features/purchase/purchase.defaults";
import {createSalesDefaults} from "../features/sales/sales.defaults";
import type {PurchaseFormValues} from "../types/purchase";
import type {SalesFormValues} from "../types/sales";

const accounts = [{id: "A-SETTLEMENT", name: "测试结算账户", type: "微信", enabled: true}];
const noop = () => undefined;

function PurchaseHarness({compact = true, paidAmount = 100, disabled = false, accountDisabled = false, vendor = false}) {
  const {control, setValue} = useForm<PurchaseFormValues>({defaultValues: {...createPurchaseDefaults("测试经办人"), paidAmount, settlementAccountId: accounts[0].id}});
  return <PurchasePaymentSection embedded compact={compact} control={control} setValue={setValue} totalCost={100} sourcePartnerType={vendor ? "vendor" : "customer"} vendorCreditAvailable={50} accounts={accounts} accountsLoading={false} onRetryAccounts={noop} canEnterCost disabled={disabled} accountDisabled={accountDisabled} />;
}

function SalesHarness({compact = true, paidAmount = 100, disabled = false, accountDisabled = false}) {
  const {control, setValue} = useForm<SalesFormValues>({defaultValues: {...createSalesDefaults("测试经办人"), paidAmount, settlementAccountId: accounts[0].id}});
  return <SalesPaymentSection embedded compact={compact} control={control} setValue={setValue} totalAmount={100} paidAmount={paidAmount} salesperson="测试经办人" accounts={accounts} accountsLoading={false} onRetryAccounts={noop} disabled={disabled} accountDisabled={accountDisabled} />;
}

function settlementGroup(markup: string) {
  const start = markup.indexOf('<div data-erp-region="order-settlement-fields"');
  assert.ok(start >= 0, "account and operator need an explicit layout group");
  const tail = markup.slice(start);
  let depth = 0;
  for (const tag of tail.matchAll(/<\/?div\b[^>]*>/g)) {
    depth += tag[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return tail.slice(0, tag.index + tag[0].length);
  }
  throw new Error("Settlement group did not close");
}

for (const compact of [true, false]) {
  test(`purchase account and read-only operator share one responsive row (compact=${compact})`, () => {
    const markup = renderToStaticMarkup(<PurchaseHarness compact={compact} vendor />);
    const group = settlementGroup(markup);
    assert.match(group, /grid min-w-0 gap-3 md:grid-cols-2/);
    assert.equal([...group.matchAll(/<label class="block min-w-0 text-sm font-medium"><span class="block">/g)].length, 2, "both field labels must share identical line geometry");
    assert.equal(group.includes("md:col-span-2"), !compact);
    assert.match(group, /aria-label="付款账户"/);
    assert.match(group, /aria-label="采购付款经办人（开单人）"/);
    assert.match(group, /readOnly="" disabled=""/);
    assert.match(group, /value="测试经办人"/);
    assert.doesNotMatch(group, /本次付款<\/dt>|剩余欠款|供应商余额抵扣/);
    assert.match(markup, /供应商余额抵扣/);
    assert.match(markup, /本次付款<\/dt>/);
  });

  test(`sales account and operator stay together without removing salesperson (compact=${compact})`, () => {
    const markup = renderToStaticMarkup(<SalesHarness compact={compact} />);
    const group = settlementGroup(markup);
    assert.match(group, /grid min-w-0 gap-3 md:grid-cols-2/);
    assert.equal([...group.matchAll(/<label class="block min-w-0 text-sm font-medium"><span class="block">/g)].length, 2, "both field labels must share identical line geometry");
    assert.equal(group.includes("md:col-span-2"), !compact);
    assert.match(group, /aria-label="收款账户"/);
    assert.match(group, /aria-label="收款经办人（开单人）"/);
    assert.match(group, /readOnly="" disabled=""/);
    assert.doesNotMatch(group, /剩余欠款|aria-label="开单销售"/);
    assert.match(markup, /aria-label="开单销售"/);
  });
}

for (const [purpose, Harness] of [["付款", PurchaseHarness], ["收款", SalesHarness]] as const) {
  test(`${purpose} account still obeys payment, permission and submission locks`, () => {
    for (const props of [{paidAmount: 0}, {disabled: true}, {accountDisabled: true}]) {
      const markup = renderToStaticMarkup(<Harness {...props} />);
      const account = [...markup.matchAll(/<button\b[^>]*>/g)].find(([tag]) => tag.includes(`aria-label="${purpose}账户"`))?.[0];
      assert.ok(account);
      assert.match(account, /\bdisabled=""/);
    }
    const enabled = renderToStaticMarkup(<Harness />);
    const account = [...enabled.matchAll(/<button\b[^>]*>/g)].find(([tag]) => tag.includes(`aria-label="${purpose}账户"`))?.[0];
    assert.ok(account);
    assert.doesNotMatch(account, /\bdisabled=""/);
  });
}
