import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { QueueBadge, QueueCounts } from "@/components/admin";
import { Page } from "@/components/page";
import { QUEUE_NAMES, type QueueName } from "@/domain/queue-names";
import { getAdminHome } from "@/web/admin";
import { copy, formatDate } from "@/web/copy";
import { onlyForAdmins } from "@/web/guards";

export const Route = createFileRoute("/admin/")({
  validateSearch: (search: Record<string, unknown>): { queue?: QueueName } =>
    QUEUE_NAMES.includes(search.queue as QueueName) ? { queue: search.queue as QueueName } : {},
  beforeLoad: ({ context }) => {
    onlyForAdmins(context);
  },
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getAdminHome({ data: deps }),
  component: AdminHome,
});

const t = copy.admin.home;

/** The Admin home: one stream of the eight queues, oldest first, with counts. */
function AdminHome() {
  const { counts, items } = Route.useLoaderData();
  const { queue } = Route.useSearch();
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return (
    <Page>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
        <p className="text-sm text-muted-foreground">{t.lead}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to="/admin"
          className={
            queue
              ? "rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground"
              : "rounded-full border border-primary bg-background px-3 py-1 text-xs"
          }
        >
          {t.all} <b className="tabular-nums">{total}</b>
        </Link>
        <QueueCounts counts={counts} current={queue} />
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{queue ? t.emptyQueue : t.empty}</p>
      ) : (
        <Card className="py-0">
          <ul className="divide-y">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  to="/admin/items/$itemId"
                  params={{ itemId: item.id }}
                  className="flex items-center gap-4 p-4 hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <QueueBadge queue={item.queue} />
                      <span className="truncate font-medium">{item.title}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t.raised(formatDate(item.raisedAt))}
                    </div>
                  </div>
                  <span className="inline-flex shrink-0 items-center text-sm text-muted-foreground">
                    {t.open}
                    <ChevronRight className="size-4" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Page>
  );
}
