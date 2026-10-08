import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import type {ColumnDef, SortingState} from "@tanstack/react-table";
import {ErpDataTable, resolveMobileCardDetails} from "./ErpDataTable";

type Row = {id: string; amount: number};

const columns: ColumnDef<Row, unknown>[] = [
  {accessorKey: "amount", header: "金额"},
];

test("client-side sorting reorders data rows", () => {
  const sorting: SortingState = [{id: "amount", desc: true}];
  const markup = renderToStaticMarkup(
    <ErpDataTable
      columns={columns}
      data={[{id: "low", amount: 10}, {id: "high", amount: 30}]}
      getRowId={(row) => row.id}
      sorting={sorting}
      mobileMode="table"
    />,
  );

  assert.ok(markup.indexOf(">30<") < markup.indexOf(">10<"));
});

test("expanded cards retain their disclosure even after every hidden field is shown", () => {
  assert.deepEqual(resolveMobileCardDetails(12, 4, false), {hiddenCount: 8, visibleCount: 4});
  assert.deepEqual(resolveMobileCardDetails(12, 4, true), {hiddenCount: 8, visibleCount: 12});
  assert.deepEqual(resolveMobileCardDetails(12, 4, false), {hiddenCount: 8, visibleCount: 4});
  assert.deepEqual(resolveMobileCardDetails(2, 4, false), {hiddenCount: 0, visibleCount: 2});
});

test("manual sorting preserves server row order rather than sorting just the loaded page", () => {
  const markup = renderToStaticMarkup(<ErpDataTable columns={columns} data={[{id: "low", amount: 10}, {id: "high", amount: 30}]} sorting={[{id: "amount", desc: true}]} manualSorting />);
  assert.ok(markup.indexOf(">10<") < markup.indexOf(">30<"));
});
