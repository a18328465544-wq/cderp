import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {Card, CardContent, CardHeader} from "./card";

test("Card exposes shrink-safe header and content regions", () => {
  const markup = renderToStaticMarkup(
    <Card>
      <CardHeader><div>标题</div><button type="button">操作</button></CardHeader>
      <CardContent>内容</CardContent>
    </Card>,
  );
  assert.match(markup, /data-erp-component="card"/);
  assert.match(markup, /data-erp-region="card-header"/);
  assert.match(markup, /data-erp-region="card-content"/);
  assert.match(markup, /flex-wrap/);
  assert.match(markup, /\[&amp;&gt;\*\]:min-w-0/);
  assert.match(markup, /min-w-0 p-\[var\(--erp-card-padding\)\]/);
});
