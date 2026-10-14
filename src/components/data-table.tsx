import type { ReactNode } from "react";
import {
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSortingFeature,
  sortFns,
  tableFeatures,
  useTable,
  type ColumnDef,
  type RowData,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pager } from "@/components/pager";
import { copy } from "@/web/copy";

const features = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns,
});

/** For the one link of a row: it covers the whole row, so the row is one target. */
export const rowLink = "font-medium text-primary hover:underline after:absolute after:inset-0";

/** A column of a Data Table: a header, and an accessor or a cell. */
export type DataColumn<Row extends RowData> = ColumnDef<typeof features, Row>;

/**
 * shadcn's Data Table: TanStack Table over shadcn's Table, sortable by any
 * column that allows it, 20 rows to a page. An empty list shows `empty`.
 */
export function DataTable<Row extends RowData>({
  label,
  columns,
  data,
  empty,
}: {
  label: string;
  columns: DataColumn<Row>[];
  data: Row[];
  empty: ReactNode;
}) {
  const table = useTable({
    features,
    columns,
    data,
    initialState: { pagination: { pageIndex: 0, pageSize: 20 } },
  });
  if (data.length === 0) return empty;
  const { pageIndex } = table.state.pagination;
  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card">
        <Table aria-label={label}>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  return (
                    <TableHead
                      key={header.id}
                      aria-sort={
                        sorted ? (sorted === "asc" ? "ascending" : "descending") : undefined
                      }
                    >
                      {header.column.getCanSort() ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="-ml-2"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          <table.FlexRender header={header} />
                          {sorted === "asc" && <ArrowUp data-icon="inline-end" />}
                          {sorted === "desc" && <ArrowDown data-icon="inline-end" />}
                        </Button>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              // Relative, so a cell's link may cover the whole row (`rowLink`).
              <TableRow key={row.id} className="relative">
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Pager
        page={pageIndex + 1}
        pageCount={table.getPageCount()}
        label={copy.browse.pages}
        go={(page) => table.setPageIndex(page - 1)}
      />
    </div>
  );
}
