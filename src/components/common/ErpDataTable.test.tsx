import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import type {ColumnDef, SortingState} from "@tanstack/react-table";
import {ErpDataTable} from "./ErpDataTable";

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
