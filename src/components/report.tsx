import { useState } from "react";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAppForm } from "@/components/form";
import { Refusal } from "@/components/page";
import type { About } from "@/domain/reports/subjects";
import {
  REPORT_NOTE_MAX,
  REPORT_REASON_NAMES,
  REPORT_REASONS,
  type ReportReason,
} from "@/domain/shared/reasons";
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
    setRefusal(null);
    if (await getReportMade({ data: { about } })) setMade(true);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void start();
      }}
    >
      <DialogTrigger
        render={<Button variant="ghost" size="sm" className="text-muted-foreground" />}
      >
        <Flag data-icon="inline-start" />
        {label}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>{t.lead}</DialogDescription>
        </DialogHeader>
        {made ? (
          <p role="status" className="text-sm">
            {t.made}
          </p>
        ) : (
          <form.AppForm>
            <form.Form className="space-y-4">
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
                {(field) => <field.TextareaField label={t.note} maxLength={REPORT_NOTE_MAX} />}
              </form.AppField>
              <Refusal message={refusal} />
              <DialogFooter>
                <DialogClose render={<Button type="button" variant="outline" />}>
                  {t.cancel}
                </DialogClose>
                <form.Subscribe selector={(state) => !!state.values.reason}>
                  {(chosen) => <form.Submit disabled={!chosen}>{t.send}</form.Submit>}
                </form.Subscribe>
              </DialogFooter>
            </form.Form>
          </form.AppForm>
        )}
      </DialogContent>
    </Dialog>
  );
}
