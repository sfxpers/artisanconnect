import { useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { DraftForm } from "@/components/job-form";
import { Page } from "@/components/page";
import { copy } from "@/web/copy";
import { onlyFor } from "@/web/guards";
import { postJob, saveJobDraft } from "@/web/jobs";

export const Route = createFileRoute("/jobs/new")({
  beforeLoad: ({ context }) => {
    onlyFor("client", context);
  },
  component: NewJob,
});

const t = copy.job;

/**
 * A new Job. Saving it makes a Draft, which has its own page from then on;
 * posting it saves it first, so a refusal keeps everything given.
 */
function NewJob() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  async function save(form: FormData, post: boolean) {
    setBusy(true);
    setRefusal(null);
    const saved = await saveJobDraft({ data: form });
    if (!saved.ok) {
      setBusy(false);
      return setRefusal(saved.refusal.message);
    }
    const { jobId } = saved.value;
    const posted = post ? await postJob({ data: { jobId } }) : null;
    await navigate({
      to: "/jobs/$jobId",
      params: { jobId },
      state: posted && !posted.ok ? { postRefusal: posted.refusal.message } : {},
    });
  }

  return (
    <Page narrow>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Link to="/jobs" className="hover:text-foreground">
          {t.breadcrumb}
        </Link>
        <ChevronRight className="size-3" />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">{t.newTitle}</h1>
      <p className="text-sm text-muted-foreground">{t.newLead}</p>
      <Card>
        <CardContent>
          <DraftForm
            job={null}
            busy={busy}
            refusal={refusal}
            notice={null}
            onSave={(form) => void save(form, false)}
            onPost={(form) => void save(form, true)}
          />
        </CardContent>
      </Card>
    </Page>
  );
}
