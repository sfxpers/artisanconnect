import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Page } from "@/components/page";
import { formatRands } from "@/domain/money";
import { copy, formatDate } from "@/web/copy";
import { onlyForAdmins } from "@/web/guards";
import { getPayoutHistory, isStopped } from "@/web/payouts";

export const Route = createFileRoute("/admin/payouts/$artisanId")({
  beforeLoad: ({ context }) => {
    onlyForAdmins(context);
  },
  loader: ({ params }) => getPayoutHistory({ data: { artisanId: params.artisanId } }),
  component: MoneyHistory,
});

const t = copy.admin.history;
const states = copy.payouts.states;

type Release = Awaited<ReturnType<typeof getPayoutHistory>>["releases"][number];
type Payout = Release["payouts"][number];

/**
 * An Artisan's money history (#129): what is unpaid and paid, and each
 * Release with every Payout of it, a refused or sent-back one in red.
 */
function MoneyHistory() {
  const history = Route.useLoaderData();
  return (
    <Page>
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link to="/admin/payouts" className="hover:text-foreground">
          {copy.admin.payouts.title}
        </Link>
        <ChevronRight className="size-4" />
        <span className="text-foreground">{copy.admin.payouts.history}</span>
      </nav>
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{history.name}</h1>
          {history.held && <Badge variant="destructive">{copy.admin.payouts.held}</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">{history.email}</p>
      </div>
      <p className="max-w-2xl text-sm text-muted-foreground">{t.lead}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Total label={copy.admin.payouts.unpaid} cents={history.unpaidCents} />
        <Total label={t.paid} cents={history.paidCents} />
      </div>
      {history.releases.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.empty}</p>
      ) : (
        <Card className="py-0">
          <ul className="divide-y">
            {history.releases.map((release) => (
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

function ReleaseRow({ release }: { release: Release }) {
  return (
    <li className="space-y-2 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="text-xs text-muted-foreground">
            {copy.payouts.released(
              copy.payouts.parts[release.part],
              formatDate(release.releasedAt),
            )}
          </div>
          <div className="font-medium">{release.jobTitle}</div>
        </div>
        <Badge variant={isStopped(release.state) ? "destructive" : "secondary"}>
          {states[release.state]}
        </Badge>
        <div className="text-right text-sm">
          <div className="font-medium tabular-nums">{formatRands(release.amountCents)}</div>
          <div className="text-xs text-muted-foreground tabular-nums">
            {copy.payouts.artisanFee} {formatRands(release.artisanFeeCents)}
          </div>
        </div>
      </div>
      {release.payouts.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t.noPayout}</p>
      ) : (
        <ol className="space-y-1">
          {release.payouts.map((payout) => (
            <PayoutLine key={payout.reference} payout={payout} />
          ))}
        </ol>
      )}
    </li>
  );
}

function PayoutLine({ payout }: { payout: Payout }) {
  const stopped = isStopped(payout.state);
  const parts = [t.payout(payout.reference), t.sentOn(formatDate(payout.sentAt))];
  if (payout.paidAt) parts.push(t.paidOn(formatDate(payout.paidAt)));
  if (stopped && payout.stoppedAt) {
    parts.push(t.stoppedOn(states[payout.state], formatDate(payout.stoppedAt)));
  }
  return (
    <li className={stopped ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
      {parts.join(", ")}
      {stopped && payout.reason && <span>. {t.reason(payout.reason)}</span>}
    </li>
  );
}
