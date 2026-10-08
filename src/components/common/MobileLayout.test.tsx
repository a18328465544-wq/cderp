import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {renderToStaticMarkup} from "react-dom/server";
import type {ColumnDef} from "@tanstack/react-table";
import {ErpDataTable, resolveTableProjection} from "./ErpDataTable";
import {ErpFilterBar} from "./ErpFilterBar";

type Row = {id: string; name: string; amount: string};

const columns: ColumnDef<Row, unknown>[] = [
  {accessorKey: "name", header: "名称"},
  {accessorKey: "amount", header: "金额"},
  {id: "actions", header: "操作", cell: () => <button type="button">打开</button>},
];

test("server rendering uses one desktop projection before the viewport is known", () => {
  const markup = renderToStaticMarkup(
    <ErpDataTable
      columns={columns}
      data={[{id: "1", name: "测试记录", amount: "¥100"}]}
      getRowId={(row) => row.id}
      total={1}
      page={1}
      pageSize={20}
      ariaLabel="测试列表"
    />,
  );

  assert.doesNotMatch(markup, /data-erp-region="mobile-table-cards"/);
  assert.match(markup, /erp-table-desktop-view/);
  assert.doesNotMatch(markup, /erp-table-desktop-view--deferred/);
  assert.match(markup, /测试记录/);
  assert.match(markup, /上一页/);
  assert.match(markup, /w-28 min-w-\[6\.5rem\] shrink-0/);
});

test("cards and tables are mutually exclusive after viewport resolution", () => {
  assert.equal(resolveTableProjection({mobileMode: "cards", compactViewport: true}), "cards");
  assert.equal(resolveTableProjection({mobileMode: "cards", compactViewport: false}), "table");
  assert.equal(resolveTableProjection({mobileMode: "table", compactViewport: true}), "table");
});

test("dense tables can opt out of mobile cards", () => {
  const markup = renderToStaticMarkup(
    <ErpDataTable columns={columns} data={[{id: "1", name: "测试记录", amount: "¥100"}]} mobileMode="table" />,
  );

  assert.doesNotMatch(markup, /mobile-table-cards/);
  assert.match(markup, /min-w-\[1180px\]/);
});

test("mobile detail action can be disabled when a row has its own action", () => {
  const markup = renderToStaticMarkup(
    <ErpDataTable
      columns={columns}
      data={[{id: "1", name: "测试记录", amount: "¥100"}]}
      getRowId={(row) => row.id}
      onRowClick={() => undefined}
      mobileShowDetailAction={false}
      total={1}
      page={1}
      pageSize={20}
    />,
  );

  assert.doesNotMatch(markup, /查看详情/);
  assert.match(markup, /lg:flex-row/);
  assert.match(markup, /lg:w-auto/);
});

test("filter bars expose stable mobile regions for one-column stacking", () => {
  const markup = renderToStaticMarkup(
    <ErpFilterBar actions={<button type="button">重置</button>}>
      <input aria-label="关键词" />
      <span>全部状态</span>
    </ErpFilterBar>,
  );

  assert.match(markup, /data-erp-region="filter-content"/);
  assert.match(markup, /data-erp-region="filter-actions"/);
});

test("phone card titles have their own row instead of competing with document actions", () => {
  const source = readFileSync(new URL("./ErpDataTable.tsx", import.meta.url), "utf8");
  assert.match(source, /data-erp-region="mobile-card-header"[^\n]*flex-col[^\n]*sm:flex-row/);
  assert.match(source, /data-erp-region="mobile-card-title"[^\n]*w-full min-w-0/);
  assert.match(source, /data-erp-region="mobile-card-actions"[^\n]*w-full min-w-0 sm:w-auto/);
  assert.doesNotMatch(source, /actionCell \|\| selectionCell \? "pr-8"/);
});

test("mobile card selection retains native checkbox behavior with a full touch target", () => {
  const source = readFileSync(new URL("./ErpDataTable.tsx", import.meta.url), "utf8");
  assert.match(source, /<label data-erp-region="mobile-card-selection"[^\n]*h-11 w-11/);
  assert.match(source, /selectionCell \? "pr-10"/);
  assert.match(source, /data-erp-selected=\{row.getIsSelected\(\) \? "true" : undefined\}/);
  assert.doesNotMatch(source, /mobile-card-selection[^\n]*onClick[^\n]*toggleSelected/);
});

test("mobile card content releases desktop truncation without changing action or table regions", () => {
  const source = readFileSync(new URL("./ErpDataTable.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../../styles/globals.css", import.meta.url), "utf8");
  assert.match(source, /<dd data-erp-region="mobile-card-value"/);
  const scopedRules = styles.slice(styles.indexOf("@media (max-width: 1023px) {"), styles.indexOf("/* Every modal"));
  assert.match(scopedRules, /mobile-card-title"\] \.truncate/);
  assert.match(scopedRules, /mobile-card-value"\] \.truncate/);
  assert.match(scopedRules, /overflow-wrap: anywhere/);
  assert.match(scopedRules, /white-space: normal/);
  assert.match(scopedRules, /mobile-card-title"\] \[data-erp-region="badge"\][\s\S]*flex-shrink: 0/);
  assert.match(scopedRules, /mobile-card-actions"\] button,[\s\S]*min-width: 44px;[\s\S]*min-height: 44px/);
  assert.doesNotMatch(scopedRules, /erp-table-desktop-view/);
});
