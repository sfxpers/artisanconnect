import { useState } from "react";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Refusal } from "@/components/page";
import type { About } from "@/domain/reports/subjects";
import { REPORT_NOTE_MAX, REPORT_REASON_NAMES, REPORT_REASONS } from "@/domain/reports/reasons";
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
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  async function start() {
    setOpen(true);
    setRefusal(null);
    if (await getReportMade({ data: { about } })) setMade(true);
  }

  async function send() {
    if (!reason) return;
    setBusy(true);
    setRefusal(null);
    const result = await sendReport({ data: { about, reason, note } });
    setBusy(false);
    if (!result.ok) return setRefusal(result.refusal.message);
    setMade(true);
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
    <div className="w-full max-w-md space-y-3 rounded-lg border bg-background p-3 text-left text-foreground">
      <fieldset className="space-y-1.5">
        <legend className="mb-1 text-sm font-medium">{t.why}</legend>
        {REPORT_REASONS.map((each) => (
          <label key={each} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={`report-${about.kind}-${about.id}`}
              value={each}
              checked={reason === each}
              onChange={() => setReason(each)}
            />
            {REPORT_REASON_NAMES[each]}
          </label>
        ))}
      </fieldset>
      <div className="space-y-1.5">
        <Label htmlFor={`report-note-${about.id}`}>{t.note}</Label>
        <Textarea
          id={`report-note-${about.id}`}
          value={note}
          maxLength={REPORT_NOTE_MAX}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
      <p className="text-xs text-muted-foreground">{t.lead}</p>
      <Refusal message={refusal} />
      <div className="flex gap-2">
        <Button size="sm" disabled={busy || !reason} onClick={() => void send()}>
          {t.send}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {t.cancel}
        </Button>
      </div>
    </div>
  );
}
