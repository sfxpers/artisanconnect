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
import { copy } from "@/web/copy";
import type { getJob } from "@/web/jobs";
import { passMatch } from "@/web/matches";

/** A Job as an Artisan offered it sees it. */
export type OfferedJobView = Extract<Awaited<ReturnType<typeof getJob>>, { as: "artisan" }>;

const t = copy.match;

/**
 * The Job page as an Artisan holding a Job Match sees it (#107): the Region,
 * never the suburb or street, the details and photos, and the Client by shown
 * name and record. Writing a Quote comes with Quotes (#124).
 */
export function OfferedJob({ job }: { job: OfferedJobView }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  async function pass() {
    setBusy(true);
    setRefusal(null);
    const result = await passMatch({ data: { jobId: job.jobId } });
    if (!result.ok) {
      setRefusal(result.refusal.message);
      setBusy(false);
      return;
    }
    await navigate({ to: "/home" });
  }

  const clientName = job.client.shownName ?? t.noName;
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
          <Badge>{t.badge}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {[job.category?.name, job.region?.name, job.siteType && copy.job.siteTypes[job.siteType]]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-6">
          <NextStepCard label={copy.jobs.nextStep} title={t.nextStep}>
            <p className="text-sm text-muted-foreground">{t.lead}</p>
            <Refusal message={refusal} />
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" disabled={busy} onClick={() => void pass()}>
                {t.pass}
              </Button>
              <span className="text-xs text-muted-foreground">{t.passLead}</span>
            </div>
          </NextStepCard>
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
              </dl>
            </CardContent>
          </Card>
        </aside>
      </div>
    </Page>
  );
}
