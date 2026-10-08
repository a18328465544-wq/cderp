import type {ColumnDef} from "@tanstack/react-table";

/** Reorder existing, permission-filtered columns; never add or copy data. */
export function prioritizeTableColumns<T>(columns: ColumnDef<T, unknown>[], priority: readonly string[]) {
  const rank = new Map(priority.map((id, index) => [id, index]));
  return columns.map((column, index) => {
    const id = column.id || ("accessorKey" in column ? String(column.accessorKey) : "");
    return {column, rank: rank.get(id) ?? priority.length + index};
  }).sort((left, right) => left.rank - right.rank).map(({column}) => column);
}
