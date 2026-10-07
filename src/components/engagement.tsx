import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Fact } from "@/components/job-details";
import { NextStepCard } from "@/components/page";
import { formatRands } from "@/domain/money";
import { formatDay } from "@/domain/sa-days";
import { copy, formatDate } from "@/web/copy";
import type { getJob } from "@/web/jobs";

// The Job page once a Quote is Hired (#107, #126): the next step, the
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
  const start = formatDay(engagement.startOn);
  return (
    <NextStepCard
      label={copy.jobs.nextStep}
      title={asClient ? t.nextStepClient : t.nextStepArtisan}
    >
      <p className="text-sm text-muted-foreground">
        {asClient
          ? t.nextStepClientLead(start)
          : t.nextStepArtisanLead(start, copy.quote.days(engagement.durationDays))}
      </p>
      {children}
    </NextStepCard>
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
