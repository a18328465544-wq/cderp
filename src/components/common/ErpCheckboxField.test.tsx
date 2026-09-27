import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {ErpCheckboxField, ErpRadioGroup} from "./ErpCheckboxField";

test("ErpCheckboxField keeps native checkbox semantics with shared geometry", () => {
  const markup = renderToStaticMarkup(<ErpCheckboxField id="include-sold" label="包含已售库存" description="仅用于历史查询" checked onChange={() => undefined} />);
  assert.match(markup, /for="include-sold"/);
  assert.match(markup, /type="checkbox"/);
  assert.match(markup, /包含已售库存/);
  assert.match(markup, /仅用于历史查询/);
});

test("ErpRadioGroup exposes an accessible group and descriptions", () => {
  const markup = renderToStaticMarkup(<ErpRadioGroup name="结算方式" value="cash" options={[{value: "cash", label: "现金", description: "线下收款"}, {value: "account", label: "账户", disabled: true}]} onChange={() => undefined} />);
  assert.match(markup, /role="radiogroup"/);
  assert.match(markup, /aria-label="结算方式"/);
  assert.match(markup, /type="radio"/);
  assert.match(markup, /线下收款/);
});
