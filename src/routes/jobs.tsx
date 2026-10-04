import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { NextStepCard, Page } from "@/components/page";
import { copy } from "@/web/copy";
import { onlyFor } from "@/web/guards";

export const Route = createFileRoute("/jobs")({
  beforeLoad: ({ context }) => {
    onlyFor("client", context);
  },
  component: Jobs,
});

const t = copy.jobs;

/** Where a Client lands: ready to post a Job. My Jobs comes with posting (#121). */
function Jobs() {
  return (
    <Page title={t.title}>
      <NextStepCard label={t.nextStep} title={t.first}>
        <p className="text-sm text-muted-foreground">{t.firstLead}</p>
        <Button size="lg" disabled>
          {t.post}
        </Button>
        <p className="text-xs text-muted-foreground">{t.soon}</p>
      </NextStepCard>
    </Page>
  );
}
