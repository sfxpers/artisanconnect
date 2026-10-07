import { Link, createFileRoute } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NextStepCard, Page } from "@/components/page";
import { copy, formatDate } from "@/web/copy";
import { onlyFor } from "@/web/guards";
import { getMyJobs } from "@/web/jobs";

export const Route = createFileRoute("/jobs/")({
  beforeLoad: ({ context }) => {
    onlyFor("client", context);
  },
  loader: () => getMyJobs(),
  component: MyJobs,
});

const t = copy.jobs;

type Summary = NonNullable<Awaited<ReturnType<typeof getMyJobs>>>["needsYou"][number];

/** Where a Client lands: ready to post a Job, then My Jobs in three groups. */
function MyJobs() {
  const mine = Route.useLoaderData();
  if (!mine) return null;
  const none = mine.needsYou.length + mine.inProgress.length + mine.finished.length === 0;
  return (
    <Page title={t.title}>
      <NextStepCard label={t.nextStep} title={none ? t.first : t.another}>
        <p className="text-sm text-muted-foreground">{none ? t.firstLead : t.anotherLead}</p>
        <Link to="/jobs/new" className={buttonVariants({ size: "lg" })}>
          {t.post}
        </Link>
      </NextStepCard>
      {!none && (
        <>
          <Group title={t.groups.needsYou} jobs={mine.needsYou} />
          <Group title={t.groups.inProgress} jobs={mine.inProgress} />
          <Group title={t.groups.finished} jobs={mine.finished} />
        </>
      )}
    </Page>
  );
}

function Group({ title, jobs }: { title: string; jobs: Summary[] }) {
  return (
    <section className="space-y-3">
      <h2 className="font-medium">{title}</h2>
      {jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.empty}</p>
      ) : (
        <Card className="py-0">
          <ul className="divide-y">
            {jobs.map((job) => (
              <li key={job.jobId} className="flex items-center gap-4 p-4">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to="/jobs/$jobId"
                      params={{ jobId: job.jobId }}
                      className="font-medium hover:underline"
                    >
                      {job.title || t.untitled}
                    </Link>
                    <Badge variant={job.state === "open" ? "default" : "secondary"}>
                      {job.engagementState
                        ? copy.engagement.states[job.engagementState]
                        : t.states[job.state]}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {[
                      job.category,
                      job.region,
                      job.state === "open" && job.expiresAt && t.expires(formatDate(job.expiresAt)),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                <Link
                  to="/jobs/$jobId"
                  params={{ jobId: job.jobId }}
                  className={buttonVariants({ size: "sm", variant: "outline" })}
                >
                  {t.open}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}
