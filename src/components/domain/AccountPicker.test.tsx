import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {AccountPicker} from "./AccountPicker";

test("purchase account lookup says Payment while existing receipt lookup stays unchanged", () => {
  const props = {value: "", options: [], onChange: () => undefined};
  const payment = renderToStaticMarkup(<AccountPicker {...props} purpose="付款" />);
  assert.match(payment, /选择付款账户/);
  assert.match(payment, /aria-label="付款账户"/);
  assert.doesNotMatch(payment, /收款账户/);
  assert.match(renderToStaticMarkup(<AccountPicker {...props} />), /选择收款账户/);
});
