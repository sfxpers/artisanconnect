import type { ReactNode } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Page } from "@/components/page";
import { DEFAULT_FIGURE_PERIOD, FIGURE_PERIODS, type FigurePeriod } from "@/domain/figures/periods";
import { formatRands } from "@/domain/money";
import { cn } from "@/lib/utils";
import { getFigures } from "@/web/admin";
import { copy, formatDate } from "@/web/copy";
import { onlyForAdmins } from "@/web/guards";

export const Route = createFileRoute("/admin/figures")({
  validateSearch: (search: Record<string, unknown>): { period?: FigurePeriod } =>
    FIGURE_PERIODS.includes(search.period as FigurePeriod)
      ? { period: search.period as FigurePeriod }
      : {},
  beforeLoad: ({ context }) => {
    onlyForAdmins(context);
  },
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getFigures({ data: deps }),
  component: Figures,
});

const t = copy.admin.figures;

/** A count of a whole as a whole percent, or a dash when there is no whole. */
function percent({ count, of }: { count: number; of: number }) {
  return of === 0 ? "–" : `${Math.round((count / of) * 100)}%`;
}

/** How the marketplace is doing over a period, with no targets (#142). */
function Figures() {
  const figures = Route.useLoaderData();
  const period = Route.useSearch().period ?? DEFAULT_FIGURE_PERIOD;
  return (
    <Page title={t.title}>
      <p className="max-w-2xl text-sm text-muted-foreground">{t.lead}</p>
      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label={t.title} className="flex flex-wrap gap-2">
          {FIGURE_PERIODS.map((each) => (
            <Link
              key={each}
              to="/admin/figures"
              search={each === DEFAULT_FIGURE_PERIOD ? {} : { period: each }}
              aria-current={each === period ? "page" : undefined}
              className={cn(
                "rounded-full border bg-background px-3 py-1 text-xs",
                each === period ? "border-primary text-foreground" : "text-muted-foreground",
              )}
            >
              {t.periods[each]}
            </Link>
          ))}
        </nav>
        <span className="text-xs text-muted-foreground">
          {figures.since ? t.since(formatDate(figures.since)) : t.allTime}
        </span>
      </div>

      <Group title={t.jobs}>
        <Figure label={t.jobsPosted} value={figures.jobsPosted} note={t.jobsPostedNote} />
        <Figure
          label={t.jobsWithQuote}
          value={percent(figures.jobsWithQuote)}
          note={t.jobsWithQuoteNote(figures.jobsWithQuote.count, figures.jobsWithQuote.of)}
        />
      </Group>

      <Group title={t.hires}>
        <Figure label={t.hiresCount} value={figures.hires} note={t.hiresNote(figures.inProgress)} />
        <Figure
          label={t.repeat}
          value={percent(figures.repeatHireRate)}
          note={t.repeatNote(figures.repeatHireRate.count, figures.repeatHireRate.of)}
        />
        <Figure
          label={t.completed}
          value={percent(figures.completedRate)}
          note={t.completedNote(figures.completedRate.count, figures.completedRate.of)}
        />
        <Figure
          label={t.cancellation}
          value={percent(figures.cancellationRate)}
          note={t.cancellationNote(
            figures.cancellationRate.byClient,
            figures.cancellationRate.byArtisan,
            figures.cancellationRate.of,
          )}
        />
        <Figure
          label={t.dispute}
          value={percent(figures.disputeRate)}
          note={t.disputeNote(figures.disputeRate.count, figures.disputeRate.of)}
        />
      </Group>

      <Group title={t.money}>
        <Figure
          label={t.paymentValue}
          value={formatRands(figures.paymentValueCents)}
          note={t.paymentValueNote(
            formatRands(figures.refundedCents),
            formatRands(figures.chargedBackCents),
          )}
        />
        <Figure
          label={t.protectionFees}
          value={formatRands(figures.protectionFeesCents)}
          note={t.protectionFeesNote}
        />
        <Figure
          label={t.artisanFees}
          value={formatRands(figures.artisanFeesCents)}
          note={t.artisanFeesNote}
        />
      </Group>

      <Group title={t.trust}>
        <Figure
          label={t.leavingWarnings}
          value={figures.leavingWarnings}
          note={t.leavingWarningsNote(figures.leavingSuspensions)}
        />
        <Figure label={t.refusedSends} value={figures.refusedSends} note={t.refusedSendsNote} />
      </Group>
    </Page>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

/** One figure: what it is, its value, and what it counts. */
function Figure({ label, value, note }: { label: string; value: ReactNode; note: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{note}</p>
      </CardContent>
    </Card>
  );
}
