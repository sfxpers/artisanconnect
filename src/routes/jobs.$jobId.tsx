import { useState } from "react";
import {
  Link,
  createFileRoute,
  useNavigate,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DraftForm, EditForm, type JobView } from "@/components/job-form";
import { NextStepCard, Page, Refusal } from "@/components/page";
import { Details, Fact } from "@/components/job-details";
import { OfferedJob } from "@/components/offered-job";
import { copy, formatDate } from "@/web/copy";
import { onlyFor } from "@/web/guards";
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
  beforeLoad: ({ context }) => {
    onlyFor("account", context);
  },
  loader: ({ params }) => getJob({ data: { jobId: params.jobId } }),
  component: JobPage,
});

const t = copy.job;

type Result = { ok: true } | { ok: false; refusal: { message: string } };

/** Runs one action at a time, keeping its refusal to show where the Client acted. */
function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  async function run(action: () => Promise<Result>, then?: () => void | Promise<void>) {
    setBusy(true);
    setRefusal(null);
    const result = await action();
    if (!result.ok) {
      setBusy(false);
      setRefusal(result.refusal.message);
      return false;
    }
    await then?.();
    await router.invalidate();
    setBusy(false);
    return true;
  }
  return { busy, refusal, setRefusal, run };
}

/**
 * A Job's one page for its whole life (#107): breadcrumb, the title with one
 * status badge, the next step, and the details, as its Client or an Artisan
 * offered it sees it.
 */
function JobPage() {
  const job = Route.useLoaderData();
  return job.as === "artisan" ? <OfferedJob job={job} /> : <ClientJob job={job} />;
}

/** The Job as its Client sees it. A Draft is its form. */
function ClientJob({ job }: { job: JobView }) {
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
      {job.state === "draft" ? <Draft job={job} /> : <Posted job={job} />}
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

/** A posted Job: its next step beside its details. */
function Posted({ job }: { job: JobView }) {
  const action = useAction();
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const editable = job.state === "open" || job.state === "expired";
  const { beingChecked, refused } = job.edit;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="min-w-0 space-y-6">
        <NextStepCard label={copy.jobs.nextStep} title={copy.jobs.states[job.state]}>
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
            <p className="mt-3 text-xs text-muted-foreground">{t.locked}</p>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
