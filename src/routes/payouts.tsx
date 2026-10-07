import { Link, createFileRoute } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Page } from "@/components/page";
import { formatRands } from "@/domain/money";
import { copy, formatDate } from "@/web/copy";
import { onlyFor } from "@/web/guards";
import { getMyPayouts } from "@/web/payouts";

export const Route = createFileRoute("/payouts")({
  beforeLoad: ({ context }) => {
    onlyFor("artisan", context);
  },
  loader: () => getMyPayouts(),
  component: Payouts,
});

const t = copy.payouts;

type Release = Awaited<ReturnType<typeof getMyPayouts>>["releases"][number];

/**
 * The Artisan's Payouts (#128): what is still to be paid and what was paid,
 * then each Release, newest first, with its Artisan Fee, the amount paid for
 * it, and where its Payout stands.
 */
function Payouts() {
  const payouts = Route.useLoaderData();
  const noAccount = payouts.releases.some((release) => release.waitingFor === "payout-account");
  return (
    <Page title={t.title}>
      <p className="max-w-2xl text-sm text-muted-foreground">{t.lead}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Total label={t.unpaid} cents={payouts.unpaidCents} />
        <Total label={t.paid} cents={payouts.paidCents} />
      </div>
      {payouts.held && (
        <Card size="sm" className="ring-2 ring-primary/80">
          <CardContent>
            <p className="text-sm">{t.held}</p>
          </CardContent>
        </Card>
      )}
      {noAccount && !payouts.held && (
        <Card size="sm" className="ring-2 ring-primary/80">
          <CardContent className="flex flex-wrap items-center gap-3">
            <p className="flex-1 text-sm">{t.noAccount}</p>
            <Link to="/verification" className={buttonVariants({ size: "sm" })}>
              {t.openVerification}
            </Link>
          </CardContent>
        </Card>
      )}
      {payouts.releases.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">{t.empty}</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="py-0">
          <ul className="divide-y">
            {payouts.releases.map((release) => (
              <ReleaseRow key={release.releaseId} release={release} />
            ))}
          </ul>
        </Card>
      )}
    </Page>
  );
}

function Total({ label, cents }: { label: string; cents: number }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{formatRands(cents)}</CardTitle>
      </CardHeader>
    </Card>
  );
}

/** One Release: the Job, the part released, the Artisan Fee, what it pays, and its Payout. */
function ReleaseRow({ release }: { release: Release }) {
  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="text-xs text-muted-foreground">
          {t.released(t.parts[release.part], formatDate(release.releasedAt))}
        </div>
        <Link
          to="/jobs/$jobId"
          params={{ jobId: release.jobId }}
          className="block font-medium hover:underline"
        >
          {release.jobTitle}
        </Link>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant={release.state === "refused" ? "destructive" : "secondary"}>
            {t.states[release.state]}
          </Badge>
          <span>{stateLine(release)}</span>
          {release.reference && <span>{t.reference(release.reference)}</span>}
        </div>
      </div>
      <dl className="grid shrink-0 grid-cols-3 gap-4 text-sm sm:w-80">
        <Amount label={t.releasedAmount} cents={release.releasedCents} />
        <Amount label={t.artisanFee} cents={-release.artisanFeeCents} />
        <Amount label={t.amount} cents={release.amountCents} strong />
      </dl>
    </li>
  );
}

function stateLine(release: Release): string {
  if (release.waitingFor) return t.waitingFor[release.waitingFor];
  if (release.paidAt) return t.paidOn(formatDate(release.paidAt));
  return release.state === "refused" ? t.refused : t.sent;
}

function Amount({ label, cents, strong }: { label: string; cents: number; strong?: boolean }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={strong ? "font-medium tabular-nums" : "tabular-nums"}>{formatRands(cents)}</dd>
    </div>
  );
}
