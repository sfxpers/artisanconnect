import { Link, createFileRoute } from "@tanstack/react-router";
import { CheckCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { QueueBadge, QueueCounts } from "@/components/admin";
import { DataTable, type DataColumn } from "@/components/data-table";
import { EmptyState, Page } from "@/components/page";
import { QUEUE_NAMES, type QueueName } from "@/domain/queue-names";
import { formatRands } from "@/domain/money";
import { getAdminHome } from "@/web/admin";
import { copy, formatDate } from "@/web/copy";
import { onlyForAdmins } from "@/web/guards";
import { getFloat } from "@/web/payouts";

export const Route = createFileRoute("/admin/")({
  validateSearch: (search: Record<string, unknown>): { queue?: QueueName } =>
    QUEUE_NAMES.includes(search.queue as QueueName) ? { queue: search.queue as QueueName } : {},
  beforeLoad: ({ context }) => {
    onlyForAdmins(context);
  },
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [home, float] = await Promise.all([getAdminHome({ data: deps }), getFloat()]);
    return { ...home, float };
  },
  component: AdminHome,
});

const t = copy.admin.home;

type Item = Awaited<ReturnType<typeof getAdminHome>>["items"][number];

const columns: DataColumn<Item>[] = [
  {
    id: "queue",
    header: t.queue,
    accessorFn: (item) => copy.admin.queues[item.queue],
    cell: ({ row }) => <QueueBadge queue={row.original.queue} />,
  },
  {
    id: "title",
    header: t.itemTitle,
    accessorFn: (item) => item.title,
    cell: ({ row }) => (
      <Link
        to="/admin/items/$itemId"
        params={{ itemId: row.original.id }}
        className="font-medium text-primary hover:underline"
      >
        {row.original.title}
      </Link>
    ),
  },
  {
    id: "raised",
    header: t.raisedAt,
    accessorFn: (item) => new Date(item.raisedAt).getTime(),
    cell: ({ row }) => (
      <span className="text-muted-foreground tabular-nums">
        {formatDate(row.original.raisedAt)}
      </span>
    ),
  },
];

/**
 * The Admin home: a banner while the float cannot cover the Payouts sent,
 * then one stream of the eight queues, oldest first, with counts.
 */
function AdminHome() {
  const { counts, items, float } = Route.useLoaderData();
  const { queue } = Route.useSearch();
  return (
    <Page title={t.title} lead={t.lead}>
      {float.short && (
        <Alert variant="destructive">
          <AlertTitle>{t.floatShort}</AlertTitle>
          <AlertDescription>
            {t.floatShortLead(
              formatRands(float.floatCents),
              formatRands(float.neededCents),
              formatDate(float.checkedAt),
            )}
          </AlertDescription>
        </Alert>
      )}
      <QueueCounts counts={counts} current={queue} />
      <DataTable
        key={queue ?? "all"}
        label={t.table}
        columns={columns}
        data={items}
        empty={<EmptyState icon={<CheckCheck />}>{queue ? t.emptyQueue : t.empty}</EmptyState>}
      />
    </Page>
  );
}
