import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { initials } from "@/components/app-header";
import { Details, Fact } from "@/components/job-details";
import { NextStepCard, Page, Refusal } from "@/components/page";
import { useAction } from "@/components/use-action";
import { QuoteForm } from "@/components/quote-form";
import { QuoteFacts } from "@/components/quotes";
import {
  ActivityCard,
  EngagementNextStep,
  HiredQuoteCard,
  MoneyCard,
  PaymentsCard,
  StartActions,
} from "@/components/engagement";
import {
  Messages,
  type ConversationSummary,
  type ConversationView,
} from "@/components/conversation";
import { JobTabs, type JobTab } from "@/components/job-tabs";
import type { QuoteFields } from "@/domain/quotes/inputs";
import { copy, formatDate } from "@/web/copy";
import type { getJob } from "@/web/jobs";
import { passInvitation } from "@/web/invitations";
import { passMatch } from "@/web/matches";
import { reviseQuote, sendQuote, withdrawQuoteBeingChecked, withdrawQuote } from "@/web/quotes";

/** A Job as an Artisan offered it sees it. */
export type OfferedJobView = Extract<Awaited<ReturnType<typeof getJob>>, { as: "artisan" }>;
type OwnQuote = NonNullable<OfferedJobView["quote"]>;
const t = copy.match;
const tq = copy.quote;

/**
 * The Job page as an Artisan sees it (#107): the Region, never the suburb or
 * street, the details and photos, and the Client by shown name and record.
 * The Next step card holds the Quote form while the Artisan holds a Job Match
 * or an Invitation, and their Quote once they have sent one. Either may be
 * passed before a Quote, telling nobody. Messages holds their Conversation
 * with the Client, once an Invitation or their Quote opened it. Once Hired,
 * it is the Engagement, with the address (#126).
 */
export function OfferedJob({
  job,
  vatNumber,
  tab,
  conversations,
  open,
}: {
  job: OfferedJobView;
  vatNumber: string | null;
  tab: JobTab;
  conversations: ConversationSummary[];
  open: ConversationView | null;
}) {
  const clientName = job.client.shownName ?? t.noName;
  const invited = job.invitedAt !== null;
  const holding = job.offeredAt !== null || invited;
  const { quote, engagement } = job;
  return (
    <Page>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Link to="/home" className="hover:text-foreground">
          {t.breadcrumb}
        </Link>
        <ChevronRight className="size-3" />
      </div>
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{job.title}</h1>
          <Badge>
            {quote && quote.state !== "refused"
              ? tq.states[quote.state]
              : job.state !== "open"
                ? copy.jobs.states[job.state]
                : invited
                  ? t.invitationBadge
                  : t.badge}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {[job.category?.name, job.region?.name, job.siteType && copy.job.siteTypes[job.siteType]]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <JobTabs
        jobId={job.jobId}
        tab={tab}
        conversations={conversations}
        overview={
          <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
            <div className="min-w-0 space-y-6">
              {engagement ? (
                <>
                  <EngagementNextStep engagement={engagement} asClient={false}>
                    <StartActions engagement={engagement} asClient={false} />
                  </EngagementNextStep>
                  <PaymentsCard engagement={engagement} />
                  <ActivityCard engagement={engagement} />
                </>
              ) : quote && quote.state !== "refused" ? (
                <QuoteStep job={job} quote={quote} vatNumber={vatNumber} />
              ) : (
                holding && <QuoteOrPass job={job} invited={invited} vatNumber={vatNumber} />
              )}
              <Card>
                <CardHeader>
                  <CardTitle>{copy.job.details}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Details job={job} />
                </CardContent>
              </Card>
            </div>
            <aside className="space-y-6">
              <Card size="sm">
                <CardHeader>
                  <CardTitle>{t.client}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <Avatar size="lg">
                      <AvatarFallback>{initials(clientName)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="truncate font-medium">{clientName}</div>
                      <div className="text-xs text-muted-foreground">
                        {t.reviews(job.client.reviews.average, job.client.reviews.count)} ·{" "}
                        {t.completed(job.client.completed)}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card size="sm">
                <CardContent>
                  <dl className="space-y-3 text-sm">
                    <Fact label={copy.job.category}>
                      {job.category?.name}
                      {job.gasWork && ` · ${t.gasWork}`}
                    </Fact>
                    <Fact label={t.region}>{job.region?.name}</Fact>
                    {job.address && (
                      <Fact label={copy.engagement.address}>
                        {job.address.street}, {job.address.suburb}
                      </Fact>
                    )}
                  </dl>
                </CardContent>
              </Card>
              {engagement && (
                <>
                  <MoneyCard engagement={engagement} />
                  <HiredQuoteCard engagement={engagement} />
                </>
              )}
            </aside>
          </div>
        }
        messages={
          <Messages jobId={job.jobId} conversations={conversations} open={open} asClient={false} />
        }
      />
    </Page>
  );
}

/** Before a Quote: write one, or pass, telling nobody. A refused one shows why. */
function QuoteOrPass({
  job,
  invited,
  vatNumber,
}: {
  job: OfferedJobView;
  invited: boolean;
  vatNumber: string | null;
}) {
  const navigate = useNavigate();
  const action = useAction();
  const refused = job.quote?.state === "refused" ? job.quote : null;
  const pass = () =>
    action.run(
      () => (invited ? passInvitation : passMatch)({ data: { jobId: job.jobId } }),
      () => navigate({ to: "/home" }),
    );
  const send = (fields: QuoteFields) =>
    action.run(() => sendQuote({ data: { jobId: job.jobId, ...fields } }));

  return (
    <NextStepCard label={copy.jobs.nextStep} title={t.nextStep}>
      {invited && <p className="text-sm">{t.invitationLead}</p>}
      <p className="text-sm text-muted-foreground">{t.lead}</p>
      {refused?.refused && <Refusal message={tq.refusedLead(refused.refused.reason)} />}
      {job.takesQuotes ? (
        <div className="space-y-3 rounded-lg border p-4">
          <div className="space-y-1">
            <h3 className="font-medium">{tq.write}</h3>
            <p className="text-xs text-muted-foreground">{tq.writeLead}</p>
          </div>
          <QuoteForm
            start={refused ?? undefined}
            vatNumber={vatNumber}
            busy={action.busy}
            refusal={action.refusal}
            submit={tq.send}
            onSend={(fields) => void send(fields)}
          />
        </div>
      ) : (
        <p className="text-sm">{tq.full}</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" disabled={action.busy} onClick={() => void pass()}>
          {t.pass}
        </Button>
        <span className="text-xs text-muted-foreground">{t.passLead}</span>
      </div>
    </NextStepCard>
  );
}

/** The Artisan's Quote: being checked, Sent and revisable, or ended. */
function QuoteStep({
  job,
  quote,
  vatNumber,
}: {
  job: OfferedJobView;
  quote: OwnQuote;
  vatNumber: string | null;
}) {
  const action = useAction();
  const [revising, setRevising] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const { beingChecked, refused } = quote.revision;
  const jobId = job.jobId;

  return (
    <NextStepCard label={copy.jobs.nextStep} title={tq.yourQuote}>
      {quote.state === "held" && <p className="text-sm text-muted-foreground">{tq.heldLead}</p>}
      {quote.state === "sent" && quote.expiresAt && (
        <p className="text-sm text-muted-foreground">{tq.sentLead(formatDate(quote.expiresAt))}</p>
      )}
      {quote.state !== "held" && quote.state !== "sent" && quote.state !== "refused" && (
        <p className="text-sm text-muted-foreground">{tq.endedLead[quote.state]}</p>
      )}
      {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
      {beingChecked && (
        <div className="space-y-3 rounded-lg border p-4">
          <Badge variant="secondary">{copy.job.beingChecked}</Badge>
          <p className="text-sm text-muted-foreground">{tq.revisionHeld}</p>
          <QuoteFacts quote={beingChecked} />
        </div>
      )}
      {refused && !beingChecked && <Refusal message={tq.revisionRefused(refused.reason)} />}
      {revising ? (
        <QuoteForm
          start={quote}
          vatNumber={vatNumber}
          busy={action.busy}
          refusal={action.refusal}
          submit={tq.sendRevision}
          onCancel={() => setRevising(false)}
          onSend={(fields) =>
            void action.run(
              async () => {
                const revised = await reviseQuote({ data: { jobId, ...fields } });
                if (revised.ok && revised.value.revision === "applied") setNotice(tq.revised);
                return revised;
              },
              () => setRevising(false),
            )
          }
        />
      ) : (
        <>
          <QuoteFacts quote={quote} />
          {quote.revisedAt && (
            <p className="text-xs text-muted-foreground">
              {tq.revisedOn(formatDate(quote.revisedAt))}
            </p>
          )}
          <Refusal message={action.refusal} />
          <div className="flex flex-wrap gap-2">
            {(quote.state === "held" || beingChecked) && (
              <Button
                variant="outline"
                disabled={action.busy}
                onClick={() =>
                  void action.run(() => withdrawQuoteBeingChecked({ data: { jobId } }))
                }
              >
                {tq.withdrawCheck}
              </Button>
            )}
            {quote.state === "sent" && !beingChecked && (
              <Button
                variant="outline"
                disabled={action.busy}
                onClick={() => {
                  setNotice(null);
                  action.setRefusal(null);
                  setRevising(true);
                }}
              >
                {tq.revise}
              </Button>
            )}
            {quote.state === "sent" && (
              <Button
                variant="ghost"
                disabled={action.busy}
                onClick={() => {
                  if (!window.confirm(tq.withdrawConfirm)) return;
                  void action.run(() => withdrawQuote({ data: { jobId } }));
                }}
              >
                {tq.withdraw}
              </Button>
            )}
          </div>
        </>
      )}
    </NextStepCard>
  );
}
