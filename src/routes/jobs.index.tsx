import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HowAJobGoes } from "@/components/how-a-job-goes";
import { NextStepCard, Page } from "@/components/page";
import { copy, formatDeadline, pageTitle } from "@/web/copy";
import { onlyFor } from "@/web/guards";
import { getMyJobs } from "@/web/jobs";

export const Route = createFileRoute("/jobs/")({
  beforeLoad: ({ context }) => {
    onlyFor("client", context);
  },
  loader: () => getMyJobs(),
  head: () => ({ meta: [{ title: pageTitle(t.title) }] }),
  component: MyJobs,
});

const t = copy.jobs;

type Summary = NonNullable<Awaited<ReturnType<typeof getMyJobs>>>["needsYou"][number];

/** Where a Client lands: ready to post a Job, then My Jobs in three groups. */
function MyJobs() {
  const mine = Route.useLoaderData();
  if (!mine) return null;
  const none = mine.needsYou.length + mine.inProgress.length + mine.finished.length === 0;
  // A Draft first needs finishing, which its own page does; anything else needs the Client now.
  const first = mine.needsYou.find((job) => job.state !== "draft");
  return (
    <Page title={t.title}>
      {first ? (
        <NextStepCard label={t.nextStep} title={t.needYou(mine.needsYou.length)}>
          <p className="text-sm text-muted-foreground">
            {t.needYouLead(first.title || t.untitled)}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link to="/jobs/$jobId" params={{ jobId: first.jobId }} className={buttonVariants()}>
              {t.openJob}
            </Link>
            <Link to="/jobs/new" className={buttonVariants({ variant: "outline" })}>
              {t.post}
            </Link>
          </div>
        </NextStepCard>
      ) : (
        <NextStepCard label={t.nextStep} title={none ? t.first : t.another}>
          <p className="text-sm text-muted-foreground">{none ? t.firstLead : t.anotherLead}</p>
          <Link to="/jobs/new" className={buttonVariants({ className: "w-fit" })}>
            {t.post}
          </Link>
        </NextStepCard>
      )}
      {none && <HowAJobGoes />}
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
      <h2 className="text-lg font-semibold">{title}</h2>
      {jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.empty}</p>
      ) : (
        <Card className="py-0">
          <ul className="divide-y">
            {jobs.map((job) => (
              <li key={job.jobId}>
                <Item
                  className="rounded-none px-4 py-4"
                  render={<Link to="/jobs/$jobId" params={{ jobId: job.jobId }} />}
                >
                  <ItemContent>
                    <ItemTitle>
                      {job.title || t.untitled}
                      <Badge variant={job.state === "open" ? "default" : "secondary"}>
                        {job.engagementState
                          ? copy.engagement.states[job.engagementState]
                          : t.states[job.state]}
                      </Badge>
                    </ItemTitle>
                    <ItemDescription>
                      {[
                        job.category,
                        job.region,
                        job.state === "open" &&
                          job.expiresAt &&
                          t.expires(formatDeadline(job.expiresAt)),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                  </ItemActions>
                </Item>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}
