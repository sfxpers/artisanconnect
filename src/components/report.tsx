import { useState } from "react";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppForm } from "@/components/form";
import { Refusal } from "@/components/page";
import type { About } from "@/domain/reports/subjects";
import {
  REPORT_NOTE_MAX,
  REPORT_REASON_NAMES,
  REPORT_REASONS,
  type ReportReason,
} from "@/domain/reports/reasons";
import { copy } from "@/web/copy";
import { getReportMade, sendReport } from "@/web/reports";

const t = copy.report;

/**
 * The one Report action on a Job, Quote, message, Profile (#136), or Review
 * (#138): one fixed reason and an optional note, to the Admin. Nobody
 * reported is told who reported, and the reporter is never told the outcome.
 */
export function ReportAction({ about, label = t.action }: { about: About; label?: string }) {
  const [open, setOpen] = useState(false);
  const [made, setMade] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const form = useAppForm({
    defaultValues: { reason: "" as ReportReason | "", note: "" },
    onSubmit: async ({ value }) => {
      setRefusal(null);
      const result = await sendReport({ data: { about, ...value } });
      if (!result.ok) return setRefusal(result.refusal.message);
      setMade(true);
    },
  });

  async function start() {
    setOpen(true);
    setRefusal(null);
    if (await getReportMade({ data: { about } })) setMade(true);
  }

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        onClick={() => void start()}
      >
        <Flag className="size-3.5" />
        {label}
      </Button>
    );
  }
  if (made) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t.made}
      </p>
    );
  }
  return (
    <form.AppForm>
      <form.Form className="w-full max-w-md space-y-3 rounded-lg border bg-background p-3 text-left text-foreground">
        <form.AppField name="reason">
          {(field) => (
            <field.ChoiceField
              label={t.why}
              options={REPORT_REASONS.map((value) => ({
                value,
                label: REPORT_REASON_NAMES[value],
              }))}
            />
          )}
        </form.AppField>
        <form.AppField name="note">
          {(field) => (
            <field.TextareaField label={t.note} description={t.lead} maxLength={REPORT_NOTE_MAX} />
          )}
        </form.AppField>
        <Refusal message={refusal} />
        <div className="flex gap-2">
          <form.Subscribe selector={(state) => !!state.values.reason}>
            {(chosen) => (
              <form.Submit size="sm" disabled={!chosen}>
                {t.send}
              </form.Submit>
            )}
          </form.Subscribe>
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
            {t.cancel}
          </Button>
        </div>
      </form.Form>
    </form.AppForm>
  );
}
