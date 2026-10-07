import { useState, type ReactNode } from "react";
import { Link, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DraftForm, EditForm, type JobView } from "@/components/job-form";
import { NextStepCard, Page, Refusal } from "@/components/page";
import { useAction } from "@/components/use-action";
import { Details, Fact } from "@/components/job-details";
import { InviteList, type InviteListView } from "@/components/invite-list";
import { OfferedJob } from "@/components/offered-job";
import { ClientQuotes } from "@/components/quotes";
import {
  ActivityCard,
  CompletionActions,
  CompletionCard,
  EngagementNextStep,
  HiredQuoteCard,
  MoneyCard,
  PaymentsCard,
  StartActions,
} from "@/components/engagement";
import { formatRands } from "@/domain/money";
import {
  Messages,
  type ConversationSummary,
  type ConversationView,
} from "@/components/conversation";
import { JobTabs, type JobTab } from "@/components/job-tabs";
import { copy, formatDate } from "@/web/copy";
import { onlyFor } from "@/web/guards";
import { getConversation, getConversations } from "@/web/conversations";
import { getInviteList } from "@/web/invitations";
import { getJobQuotes } from "@/web/quotes";
import { getRegionNames } from "@/web/profiles";
import {
  closeJob,
  discardJob,
  editJob,
  getJob,
  postJob,
  renewJob,
  saveJobDraft,
  withdrawJob,
} from "@/web/jobs";

export const Route = createFileRoute("/jobs/$jobId")({
  // The one Region the invite list shows, if one is chosen, as on Browse; the
  // tab shown; and the Conversation open in Messages, if one is chosen.
  validateSearch: (
    search: Record<string, unknown>,
  ): { region?: string; tab?: JobTab; conversation?: string } => ({
    region: typeof search.region === "string" && search.region ? search.region : undefined,
    tab: search.tab === "overview" || search.tab === "messages" ? search.tab : undefined,
    conversation:
      typeof search.conversation === "string" && search.conversation
        ? search.conversation
        : undefined,
  }),
  beforeLoad: ({ context }) => ({ me: onlyFor("account", context) }),
  loaderDeps: ({ search }) => ({ region: search.region, conversation: search.conversation }),
  loader: async ({ params, deps }) => {
    const job = await getJob({ data: { jobId: params.jobId } });
    if (job.as !== "client") {
      return {
        job,
        invite: null,
        quotes: [],
        ...(await conversationsOf(job.jobId, deps.conversation)),
      };
    }
    if (job.state === "draft") {
      return { job, invite: null, quotes: [], conversations: [], open: null };
    }
    const [invite, quotes, conversations] = await Promise.all([
      inviteListFor(job, deps.region),
      getJobQuotes({ data: { jobId: job.jobId } }),
      conversationsOf(job.jobId, deps.conversation),
    ]);
    return { job, invite, quotes: quotes ?? [], ...conversations };
  },
  component: JobPage,
});

/** The Conversations on the Job the viewer sees, and the one chosen, else the first, open. */
async function conversationsOf(
  jobId: string,
  chosen: string | undefined,
): Promise<{ conversations: ConversationSummary[]; open: ConversationView | null }> {
  const conversations = (await getConversations({ data: { jobId } })) ?? [];
  const conversationId =
    conversations.find((each) => each.conversationId === chosen)?.conversationId ??
    conversations[0]?.conversationId;
  const open = conversationId ? await getConversation({ data: { conversationId } }) : null;
  return { conversations, open };
}

/** Whom the Client may invite while the Job takes Quotes, in the Region chosen if any. */
async function inviteListFor(job: JobView, region: string | undefined) {
  if (!job.takesQuotes) return null;
  const [artisans, regions] = await Promise.all([
    getInviteList({ data: { jobId: job.jobId, regionId: region } }),
    getRegionNames(),
  ]);
  return artisans && { artisans, regions, region };
}

const t = copy.job;

type ClientQuote = NonNullable<Awaited<ReturnType<typeof getJobQuotes>>>[number];

/**
 * A Job's one page for its whole life (#107): breadcrumb, the title with one
 * status badge, the next step, and the details, as its Client or an Artisan
 * offered it sees it.
 */
function JobPage() {
  const { job, invite, quotes, conversations, open } = Route.useLoaderData();
  const { me } = Route.useRouteContext();
  const search = Route.useSearch();
  const tab = search.tab ?? (search.conversation ? "messages" : "overview");
  return job.as === "artisan" ? (
    <OfferedJob
      job={job}
      vatNumber={me.vatNumber}
      tab={tab}
      conversations={conversations}
      open={open}
    />
  ) : (
    <ClientJob
      job={job}
      invite={invite}
      quotes={quotes}
      tab={tab}
      conversations={conversations}
      open={open}
    />
  );
}

/** The Job as its Client sees it. A Draft is its form. */
function ClientJob({
  job,
  invite,
  quotes,
  tab,
  conversations,
  open,
}: {
  job: JobView;
  invite: InviteListView | null;
  quotes: ClientQuote[];
  tab: JobTab;
  conversations: ConversationSummary[];
  open: ConversationView | null;
}) {
  return (
    <Page>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Link to="/jobs" className="hover:text-foreground">
          {t.breadcrumb}
        </Link>
        <ChevronRight className="size-3" />
      </div>
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {job.title || copy.jobs.untitled}
          </h1>
          <Badge variant={job.state === "open" ? "default" : "secondary"}>
            {copy.jobs.states[job.state]}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {[job.category?.name, job.suburb?.name, job.siteType && t.siteTypes[job.siteType]]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      {job.state === "draft" ? (
        <Draft job={job} />
      ) : (
        <JobTabs
          jobId={job.jobId}
          tab={tab}
          conversations={conversations}
          overview={
            job.engagement ? (
              <Hired
                job={job}
                engagement={job.engagement}
                quotes={quotes}
                conversations={conversations}
              />
            ) : (
              <Posted job={job} invite={invite} quotes={quotes} conversations={conversations} />
            )
          }
          messages={
            <Messages jobId={job.jobId} conversations={conversations} open={open} asClient />
          }
        />
      )}
    </Page>
  );
}

/** The Draft's form, to continue, post, or discard. */
function Draft({ job }: { job: JobView }) {
  const navigate = useNavigate();
  const postRefusal = useRouterState({ select: (state) => state.location.state.postRefusal });
  const action = useAction();
  const [notice, setNotice] = useState<string | null>(null);
  // A new form after each save, so photos added are not sent twice.
  const [saves, setSaves] = useState(0);

  async function save(form: FormData, post: boolean) {
    setNotice(null);
    const saved = await action.run(() => saveJobDraft({ data: form }));
    if (!saved) return;
    setSaves((count) => count + 1);
    if (post) await action.run(() => postJob({ data: { jobId: job.jobId } }));
    else setNotice(t.saved);
  }

  return (
    <Card className="max-w-2xl">
      <CardContent className="space-y-4">
        {job.refused && <Refusal message={t.refused(job.refused.reason)} />}
        <DraftForm
          key={saves}
          job={job}
          busy={action.busy}
          refusal={action.refusal ?? (saves === 0 ? (postRefusal ?? null) : null)}
          notice={notice}
          onSave={(form) => void save(form, false)}
          onPost={(form) => void save(form, true)}
          extra={
            <Button
              type="button"
              variant="ghost"
              disabled={action.busy}
              onClick={() =>
                void action.run(
                  () => discardJob({ data: { jobId: job.jobId } }),
                  () => navigate({ to: "/jobs" }),
                )
              }
            >
              {t.discard}
            </Button>
          }
        />
      </CardContent>
    </Card>
  );
}

/**
 * A posted Job: its next step with its Quotes, and while it takes Quotes
 * whom to invite, beside its details.
 */
function Posted({
  job,
  invite,
  quotes,
  conversations,
}: {
  job: JobView;
  invite: InviteListView | null;
  quotes: ClientQuote[];
  conversations: ConversationSummary[];
}) {
  const action = useAction();
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const { editable } = job;
  const { beingChecked, refused } = job.edit;
  const sent = quotes.filter((quote) => quote.state === "sent").length;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="min-w-0 space-y-6">
        <NextStepCard
          label={copy.jobs.nextStep}
          title={sent > 0 ? copy.quotes.title(sent) : copy.jobs.states[job.state]}
        >
          {job.state === "held" && <p className="text-sm text-muted-foreground">{t.heldLead}</p>}
          {job.state === "open" && job.expiresAt && (
            <p className="text-sm text-muted-foreground">{t.openLead(formatDate(job.expiresAt))}</p>
          )}
          {job.state === "expired" && (
            <p className="text-sm text-muted-foreground">{t.expiredLead}</p>
          )}
          {job.state === "closed" && (
            <p className="text-sm text-muted-foreground">{t.closedLead}</p>
          )}
          {job.state === "open" && !job.takesQuotes && (
            <p className="text-sm text-muted-foreground">{t.fullLead}</p>
          )}
          <NotHired job={job} />
          {job.state !== "held" && (
            <ClientQuotes jobId={job.jobId} quotes={quotes} conversations={conversations} />
          )}
          {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
          {refused && !beingChecked && <Refusal message={t.editRefused(refused.reason)} />}
          {!editing && <Refusal message={action.refusal} />}
          <div className="flex flex-wrap gap-2">
            {job.state === "held" && (
              <Button
                variant="outline"
                disabled={action.busy}
                onClick={() => void action.run(() => withdrawJob({ data: { jobId: job.jobId } }))}
              >
                {t.withdraw}
              </Button>
            )}
            {job.state === "expired" && (
              <Button
                disabled={action.busy}
                onClick={() => void action.run(() => renewJob({ data: { jobId: job.jobId } }))}
              >
                {t.renew}
              </Button>
            )}
            {editable && !beingChecked && !editing && (
              <Button
                variant="outline"
                disabled={action.busy}
                onClick={() => {
                  setNotice(null);
                  action.setRefusal(null);
                  setEditing(true);
                }}
              >
                {t.edit}
              </Button>
            )}
            {job.state === "open" && (
              <Button
                variant="ghost"
                disabled={action.busy}
                onClick={() => {
                  if (!window.confirm(t.closeConfirm)) return;
                  void action.run(() => closeJob({ data: { jobId: job.jobId } }));
                }}
              >
                {t.close}
              </Button>
            )}
          </div>
        </NextStepCard>

        {invite && (
          <InviteList jobId={job.jobId} inviteOnly={job.matching === "invite-only"} list={invite} />
        )}

        {beingChecked && (
          <Card>
            <CardHeader>
              <Badge variant="secondary">{t.beingChecked}</Badge>
              <p className="text-sm text-muted-foreground">{t.editBeingChecked}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <Details job={{ ...job, ...beingChecked }} />
              <Button
                variant="outline"
                size="sm"
                disabled={action.busy}
                onClick={() => void action.run(() => withdrawJob({ data: { jobId: job.jobId } }))}
              >
                {t.withdraw}
              </Button>
            </CardContent>
          </Card>
        )}

        {editing ? (
          <Card>
            <CardHeader>
              <CardTitle>{t.editTitle}</CardTitle>
              <p className="text-sm text-muted-foreground">{t.editLead}</p>
            </CardHeader>
            <CardContent>
              <EditForm
                job={job}
                busy={action.busy}
                refusal={action.refusal}
                onCancel={() => setEditing(false)}
                onSend={(form) =>
                  void action.run(
                    async () => {
                      const edited = await editJob({ data: form });
                      // One being checked shows in its own card.
                      if (edited.ok && edited.value.edit === "applied") setNotice(t.editApplied);
                      return edited;
                    },
                    () => setEditing(false),
                  )
                }
              />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>{t.details}</CardTitle>
            </CardHeader>
            <CardContent>
              <Details job={job} />
            </CardContent>
          </Card>
        )}
      </div>

      <aside className="space-y-6">
        <SiteCard job={job}>
          <p className="mt-3 text-xs text-muted-foreground">{t.locked}</p>
          {!editable && quotes.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">{t.editLocked}</p>
          )}
        </SiteCard>
      </aside>
    </div>
  );
}

/** Where the Job is, and how it was posted, as its Client sees it. */
function SiteCard({ job, children }: { job: JobView; children?: ReactNode }) {
  return (
    <Card size="sm">
      <CardContent>
        <dl className="space-y-3 text-sm">
          <Fact label={t.category}>
            {job.category?.name}
            {job.gasWork && ` · ${t.gasWork} ${t.yes}`}
          </Fact>
          <Fact label={t.suburb}>{job.suburb?.name}</Fact>
          <Fact label={t.region}>{job.region?.name}</Fact>
          <Fact label={t.street}>{job.street}</Fact>
          <Fact label={t.matching}>{job.matching && t.matchings[job.matching]}</Fact>
        </dl>
        {children}
      </CardContent>
    </Card>
  );
}

/** Payments that arrived but Hired nobody, each refunded whole. */
function NotHired({ job }: { job: JobView }) {
  return job.notHired.map((payment) => (
    <p key={payment.paymentId} role="status" className="text-sm text-destructive">
      {copy.quotes.notHired(formatRands(payment.amountCents), payment.reason!, payment.refund)}
    </p>
  ));
}

/**
 * A Hired Job, as its Client sees it (#107): what comes next, the Payments,
 * the Activity, and the details, beside the Artisan, the Money with the
 * Protection Fee, and the Hired Quote's dates.
 */
function Hired({
  job,
  engagement,
  quotes,
  conversations,
}: {
  job: JobView;
  engagement: NonNullable<JobView["engagement"]>;
  quotes: ClientQuote[];
  conversations: ConversationSummary[];
}) {
  const { artisan } = engagement;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="min-w-0 space-y-6">
        <EngagementNextStep engagement={engagement} asClient>
          <NotHired job={job} />
          <StartActions engagement={engagement} asClient />
          <CompletionActions engagement={engagement} asClient />
        </EngagementNextStep>
        <CompletionCard engagement={engagement} />
        <PaymentsCard engagement={engagement} />
        <ActivityCard engagement={engagement} />
        <Card>
          <CardHeader>
            <CardTitle>{t.details}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Details job={job} />
            <ClientQuotes jobId={job.jobId} quotes={quotes} conversations={conversations} />
          </CardContent>
        </Card>
      </div>
      <aside className="space-y-6">
        <Card size="sm">
          <CardHeader>
            <CardTitle>{copy.engagement.artisan}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {artisan.publicName ? (
              <Link
                to="/artisans/$artisanId"
                params={{ artisanId: artisan.artisanId }}
                className="font-medium hover:underline"
              >
                {artisan.publicName}
              </Link>
            ) : (
              <span className="font-medium">{copy.quotes.noName}</span>
            )}
            {artisan.badges.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {artisan.badges.map((badge) => (
                  <Badge key={`${badge.kind}:${badge.category ?? ""}`} variant="outline">
                    <ShieldCheck />
                    {badge.name}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <MoneyCard engagement={engagement} />
        <HiredQuoteCard engagement={engagement} />
        <SiteCard job={job} />
      </aside>
    </div>
  );
}
