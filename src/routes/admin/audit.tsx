import { ScrollText } from "lucide-react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

/** Every Admin decision and every logged read: who, what, and when, newest first. */
function AuditLog() {
  const { rows, next } = Route.useLoaderData();
  return (
    <Page title={t.title} lead={t.lead}>
      {rows.length === 0 ? (
        <EmptyState icon={<ScrollText />}>{t.empty}</EmptyState>
      ) : (
        <Card className="py-0">
          <ol className="divide-y">
            {rows.map((row) => (
              <li
                key={row.id}
                className="grid gap-1 p-4 sm:grid-cols-4 sm:gap-4 sm:*:last:col-span-2"
              >
                <time className="text-xs text-muted-foreground tabular-nums sm:text-sm">
                  {formatDate(row.at)}
                </time>
                <span className="truncate text-sm font-medium">{row.admin ?? t.system}</span>
                <span className="text-sm">{row.summary}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}
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
