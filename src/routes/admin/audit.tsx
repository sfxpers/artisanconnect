import { ScrollText } from "lucide-react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { buttonVariants } from "@/components/ui/button";
import { DataTable, type DataColumn } from "@/components/data-table";
import { EmptyState, Page } from "@/components/page";
import { getAuditLog } from "@/web/admin";
import { copy, formatDate } from "@/web/copy";
import { onlyForAdmins } from "@/web/guards";

export const Route = createFileRoute("/admin/audit")({
  validateSearch: (search: Record<string, unknown>): { before?: string } =>
    typeof search.before === "string" ? { before: search.before } : {},
  beforeLoad: ({ context }) => {
    onlyForAdmins(context);
  },
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getAuditLog({ data: deps }),
  component: AuditLog,
});

const t = copy.admin.audit;

type Entry = Awaited<ReturnType<typeof getAuditLog>>["rows"][number];

const columns: DataColumn<Entry>[] = [
  {
    id: "at",
    header: t.at,
    enableSorting: false,
    cell: ({ row }) => (
      <time className="text-muted-foreground tabular-nums">{formatDate(row.original.at)}</time>
    ),
  },
  {
    id: "who",
    header: t.who,
    enableSorting: false,
    cell: ({ row }) => row.original.admin ?? t.system,
  },
  {
    id: "what",
    header: t.what,
    enableSorting: false,
    cell: ({ row }) => <span className="whitespace-normal">{row.original.summary}</span>,
  },
];

/** Every Admin decision and every logged read: who, what, and when, newest first. */
function AuditLog() {
  const { rows, next } = Route.useLoaderData();
  return (
    <Page title={t.title} lead={t.lead}>
      <DataTable
        label={t.table}
        columns={columns}
        data={rows}
        empty={<EmptyState icon={<ScrollText />}>{t.empty}</EmptyState>}
      />
      {next && (
        <Link
          to="/admin/audit"
          search={{ before: next }}
          className={buttonVariants({ variant: "outline" })}
        >
          {t.older}
        </Link>
      )}
    </Page>
  );
}
