import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Fact } from "@/components/job-details";
import { Button } from "@/components/ui/button";
import { NextStepCard, Refusal } from "@/components/page";
import { useAction } from "@/components/use-action";
import { formatRands } from "@/domain/money";
import { formatDay } from "@/domain/sa-days";
import { copy, formatDate } from "@/web/copy";
import { answerNotStarted, claimStarted, markWorkStarted } from "@/web/engagements";
import type { getJob } from "@/web/jobs";

// The Job page once a Quote is Hired (#107, #126): the next step, with what
// each party may do toward Work started (#127), the
// Payments card with Materials and Labour as two numbered payments, the
// Activity, and in the sidebar the Money and the Hired Quote's dates. The
// Client never sees the Artisan Fee; the Artisan never sees the Protection Fee.

type JobView = Awaited<ReturnType<typeof getJob>>;
type ClientEngagement = NonNullable<Extract<JobView, { as: "client" }>["engagement"]>;
type ArtisanEngagement = NonNullable<Extract<JobView, { as: "artisan" }>["engagement"]>;
type Engagement = ClientEngagement | ArtisanEngagement;

const t = copy.engagement;

/** The highlighted card for what comes next, as the viewer sees it. */
export function EngagementNextStep({
  engagement,
  asClient,
  children,
}: {
  engagement: Engagement;
  asClient: boolean;
  children?: ReactNode;
}) {
  const [title, lead] = nextStep(engagement, asClient);
  return (
    <NextStepCard label={copy.jobs.nextStep} title={title}>
      <p className="text-sm text-muted-foreground">{lead}</p>
      {children}
    </NextStepCard>
  );
}

/** The Next step's title and lead, by the Engagement's state. */
function nextStep(engagement: Engagement, asClient: boolean): [string, string] {
  if (engagement.state === "work-started") {
    return [t.workStarted, asClient ? t.workStartedClientLead : t.workStartedArtisanLead];
  }
  if (engagement.startClaim) {
    const answerBy = formatDate(engagement.startClaim.answerBy);
    return asClient
      ? [t.claimedClient, t.claimedClientLead(answerBy)]
      : [t.claimedArtisan, t.claimedArtisanLead(answerBy)];
  }
  const start = formatDay(engagement.startOn);
  return asClient
    ? [t.nextStepClient, t.nextStepClientLead(start)]
    : [t.nextStepArtisan, t.nextStepArtisanLead(start, copy.quote.days(engagement.durationDays))];
}

/**
 * What the viewer may do toward Work started while the Engagement is Paid:
 * the Client marks it, or answers the Artisan's claim Not started; the
 * Artisan says they've started.
 */
export function StartActions({
  engagement,
  asClient,
}: {
  engagement: Engagement;
  asClient: boolean;
}) {
  const action = useAction();
  if (engagement.state !== "paid") return null;
  const { engagementId } = engagement;
  const materials = engagement.money.payments.find((each) => each.part === "materials");
  return (
    <>
      <Refusal message={action.refusal} />
      <div className="flex flex-wrap gap-2">
        {asClient ? (
          <>
            <Button
              disabled={action.busy}
              onClick={() => {
                const shown = materials?.amountCents ? formatRands(materials.amountCents) : null;
                if (!window.confirm(t.markWorkStartedConfirm(shown))) return;
                void action.run(() => markWorkStarted({ data: { engagementId } }));
              }}
            >
              {t.markWorkStarted}
            </Button>
            {engagement.startClaim && (
              <Button
                variant="outline"
                disabled={action.busy}
                onClick={() => {
                  if (!window.confirm(t.notStartedConfirm)) return;
                  void action.run(() => answerNotStarted({ data: { engagementId } }));
                }}
              >
                {t.notStarted}
              </Button>
            )}
          </>
        ) : (
          "canClaimStart" in engagement &&
          (engagement.canClaimStart ? (
            <Button
              disabled={action.busy}
              onClick={() => {
                if (!window.confirm(t.claimStartedConfirm)) return;
                void action.run(() => claimStarted({ data: { engagementId } }));
              }}
            >
              {t.claimStarted}
            </Button>
          ) : (
            // Before the start date; once said, the Next step says what follows.
            !engagement.startClaim && (
              <p className="text-sm text-muted-foreground">
                {t.claimFrom(formatDay(engagement.startOn))}
              </p>
            )
          ))
        )}
      </div>
    </>
  );
}

/** Materials and Labour, as two numbered payments, each with its state. */
export function PaymentsCard({ engagement }: { engagement: Engagement }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.payments}</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="divide-y rounded-lg border">
          {engagement.money.payments.map((payment, index) => (
            <li key={payment.part} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-medium">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{t.parts[payment.part].title}</div>
                <div className="text-xs text-muted-foreground">
                  {t.parts[payment.part].released}
                </div>
              </div>
              <span className="font-medium">{formatRands(payment.amountCents)}</span>
              <Badge variant="secondary">{t.partStates[payment.state]}</Badge>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

/** What happened on the Engagement, oldest first. */
export function ActivityCard({ engagement }: { engagement: Engagement }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.activity}</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-2 text-sm">
          {engagement.activity.map((entry) => (
            <li key={entry.event} className="flex justify-between gap-3">
              <span>{t.events[entry.event]}</span>
              <span className="text-muted-foreground">{formatDate(entry.at)}</span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

/** The money of the Hired Quote, with the viewer's own charge only. */
export function MoneyCard({ engagement }: { engagement: Engagement }) {
  const { money } = engagement;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{t.money}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="space-y-2 text-sm">
          <Row label={t.paidIn}>{formatRands(money.paidInCents)}</Row>
          <Row label={t.released}>{formatRands(money.releasedCents)}</Row>
          <Row label={t.unreleased}>{formatRands(money.unreleasedCents)}</Row>
          <Row label={t.refunded}>{formatRands(money.refundedCents)}</Row>
          {"protectionFeeCents" in money && (
            <Row label={t.protectionFee}>{formatRands(money.protectionFeeCents)}</Row>
          )}
          {"artisanFeePercent" in money && (
            <Row label={t.artisanFee}>{t.artisanFeeShown(money.artisanFeePercent)}</Row>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}

/** The Hired Quote's start, duration, and Warranty. */
export function HiredQuoteCard({ engagement }: { engagement: Engagement }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{t.hiredQuote}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="space-y-3 text-sm">
          <Fact label={copy.quote.start}>{formatDay(engagement.startOn)}</Fact>
          <Fact label={copy.quote.duration}>{copy.quote.days(engagement.durationDays)}</Fact>
          <Fact label={copy.quote.warrantyShort}>
            {engagement.warranty ?? copy.quote.noWarranty}
          </Fact>
        </dl>
      </CardContent>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}
