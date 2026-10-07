import { useState, type ReactNode } from "react";
import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Fact } from "@/components/job-details";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NextStepCard, Refusal } from "@/components/page";
import { useAction } from "@/components/use-action";
import {
  CERTIFICATES,
  COMPLETION_DOCUMENTS_MAX,
  COMPLETION_PHOTOS_MAX,
  NOTE_MAX,
} from "@/domain/engagements/inputs";
import { formatRands } from "@/domain/money";
import { formatDay } from "@/domain/sa-days";
import { copy, formatDate } from "@/web/copy";
import {
  answerNotStarted,
  approveCompletion,
  claimStarted,
  markComplete,
  markWorkStarted,
  requestFix,
  withdrawCompletion,
} from "@/web/engagements";
import type { getJob } from "@/web/jobs";
import { shrinkPhoto } from "@/web/shrink-photo";

// The Job page once a Quote is Hired (#107, #126): the next step, with what
// each party may do toward Work started (#127) and then Completion, Approval,
// and Fix requests (#130), the Completion itself, the Payments card with
// Materials and Labour as two numbered payments and the bar to Approval by
// silence, the Activity, and in the sidebar the Money and the Hired Quote's
// dates. The Client never sees the Artisan Fee; the Artisan never sees the
// Protection Fee.

type JobView = Awaited<ReturnType<typeof getJob>>;
type ClientEngagement = NonNullable<Extract<JobView, { as: "client" }>["engagement"]>;
type ArtisanEngagement = NonNullable<Extract<JobView, { as: "artisan" }>["engagement"]>;
type Engagement = ClientEngagement | ArtisanEngagement;

const t = copy.engagement;

/** The highlighted card for what comes next, as the viewer sees it. */
export function EngagementNextStep({
  engagement,
  asClient,
  children,
}: {
  engagement: Engagement;
  asClient: boolean;
  children?: ReactNode;
}) {
  const [title, lead] = nextStep(engagement, asClient);
  return (
    <NextStepCard label={copy.jobs.nextStep} title={title}>
      <p className="text-sm text-muted-foreground">{lead}</p>
      {children}
    </NextStepCard>
  );
}

/** The Next step's title and lead, by the Engagement's state. */
function nextStep(engagement: Engagement, asClient: boolean): [string, string] {
  switch (engagement.state) {
    case "work-started":
      return [t.workStarted, asClient ? t.workStartedClientLead : t.workStartedArtisanLead];
    case "awaiting-approval": {
      const by = engagement.approval ? formatDate(engagement.approval.dueAt) : "";
      return asClient
        ? [t.awaitingClient, t.awaitingClientLead(by)]
        : [t.awaitingArtisan, t.awaitingArtisanLead(by)];
    }
    case "fix-requested":
      return asClient ? [t.fixClient, t.fixClientLead] : [t.fixArtisan, t.fixArtisanLead];
    case "completed":
      return [t.completedTitle, asClient ? t.completedClientLead : t.completedArtisanLead];
  }
  if (engagement.startClaim) {
    const answerBy = formatDate(engagement.startClaim.answerBy);
    return asClient
      ? [t.claimedClient, t.claimedClientLead(answerBy)]
      : [t.claimedArtisan, t.claimedArtisanLead(answerBy)];
  }
  const start = formatDay(engagement.startOn);
  return asClient
    ? [t.nextStepClient, t.nextStepClientLead(start)]
    : [t.nextStepArtisan, t.nextStepArtisanLead(start, copy.quote.days(engagement.durationDays))];
}

/**
 * What the viewer may do toward Work started while the Engagement is Paid:
 * the Client marks it, or answers the Artisan's claim Not started; the
 * Artisan says they've started.
 */
export function StartActions({
  engagement,
  asClient,
}: {
  engagement: Engagement;
  asClient: boolean;
}) {
  const action = useAction();
  if (engagement.state !== "paid") return null;
  const { engagementId } = engagement;
  const materials = engagement.money.payments.find((each) => each.part === "materials");
  return (
    <>
      <Refusal message={action.refusal} />
      <div className="flex flex-wrap gap-2">
        {asClient ? (
          <>
            <Button
              disabled={action.busy}
              onClick={() => {
                const shown = materials?.amountCents ? formatRands(materials.amountCents) : null;
                if (!window.confirm(t.markWorkStartedConfirm(shown))) return;
                void action.run(() => markWorkStarted({ data: { engagementId } }));
              }}
            >
              {t.markWorkStarted}
            </Button>
            {engagement.startClaim && (
              <Button
                variant="outline"
                disabled={action.busy}
                onClick={() => {
                  if (!window.confirm(t.notStartedConfirm)) return;
                  void action.run(() => answerNotStarted({ data: { engagementId } }));
                }}
              >
                {t.notStarted}
              </Button>
            )}
          </>
        ) : (
          "canClaimStart" in engagement &&
          (engagement.canClaimStart ? (
            <Button
              disabled={action.busy}
              onClick={() => {
                if (!window.confirm(t.claimStartedConfirm)) return;
                void action.run(() => claimStarted({ data: { engagementId } }));
              }}
            >
              {t.claimStarted}
            </Button>
          ) : (
            // Before the start date; once said, the Next step says what follows.
            !engagement.startClaim && (
              <p className="text-sm text-muted-foreground">
                {t.claimFrom(formatDay(engagement.startOn))}
              </p>
            )
          ))
        )}
      </div>
    </>
  );
}

/**
 * What the viewer may do about the Completion: the Artisan marks the work
 * complete, or sees theirs being checked or refused; the Client approves it
 * or asks for a fix; and both see the Fix request's note.
 */
export function CompletionActions({
  engagement,
  asClient,
}: {
  engagement: Engagement;
  asClient: boolean;
}) {
  return (
    <>
      {engagement.fixRequest && (
        <FixRequestNote fixRequest={engagement.fixRequest} asClient={asClient} />
      )}
      {asClient
        ? engagement.state === "awaiting-approval" && <ApproveOrFix engagement={engagement} />
        : "canComplete" in engagement && (
            <>
              {engagement.completionCheck && (
                <CompletionCheck
                  engagementId={engagement.engagementId}
                  check={engagement.completionCheck}
                />
              )}
              {engagement.canComplete && <CompletionForm engagement={engagement} />}
            </>
          )}
    </>
  );
}

/** The Client's note on their Fix request, as the viewer may see it. */
function FixRequestNote({
  fixRequest,
  asClient,
}: {
  fixRequest: NonNullable<Engagement["fixRequest"]>;
  asClient: boolean;
}) {
  return (
    <div className="space-y-1 rounded-lg bg-muted/60 p-3 text-sm">
      <div className="text-xs text-muted-foreground">
        {t.fixRequestNote} · {formatDate(fixRequest.requestedAt)}
      </div>
      {fixRequest.note && <p className="whitespace-pre-wrap">{fixRequest.note}</p>}
      {fixRequest.noteState === "held" && (
        <p className="text-xs text-muted-foreground">
          {asClient ? t.fixNoteBeingChecked : t.fixNoteHiddenArtisan}
        </p>
      )}
      {fixRequest.noteState === "refused" && (
        <p className="text-xs text-destructive">
          {asClient ? t.fixNoteRefusedClient(fixRequest.refusedFor ?? "") : t.fixNoteRefusedArtisan}
        </p>
      )}
    </div>
  );
}

/** The Artisan's Completion being checked, which they may withdraw, or the Admin's refusal of it. */
function CompletionCheck({
  engagementId,
  check,
}: {
  engagementId: string;
  check: NonNullable<ArtisanEngagement["completionCheck"]>;
}) {
  const action = useAction();
  if (check.state === "refused") {
    return <p className="text-sm text-destructive">{t.completionRefused(check.reason)}</p>;
  }
  return (
    <div className="space-y-2 rounded-lg bg-muted/60 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{t.completionBeingChecked}</Badge>
        <Button
          size="xs"
          variant="ghost"
          disabled={action.busy}
          onClick={() => void action.run(() => withdrawCompletion({ data: { engagementId } }))}
        >
          {t.withdrawCompletion}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t.completionBeingCheckedLead}</p>
      <Refusal message={action.refusal} />
    </div>
  );
}

/**
 * The Artisan's Completion: a note, the after-work photos, the certificate a
 * Job that needs one requires, and any other documents. Photos are shrunk
 * before they are sent, as a message's are.
 */
function CompletionForm({ engagement }: { engagement: ArtisanEngagement }) {
  const action = useAction();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [documents, setDocuments] = useState<File[]>([]);
  const [certificate, setCertificate] = useState<File | null>(null);
  const needed = engagement.certificateNeeded ? CERTIFICATES[engagement.certificateNeeded] : null;
  if (!open) {
    return (
      <div>
        <Button onClick={() => setOpen(true)}>{t.markComplete}</Button>
      </div>
    );
  }

  async function send() {
    if (!window.confirm(t.markCompleteConfirm)) return;
    const form = new FormData();
    form.append("engagementId", engagement.engagementId);
    form.append("note", note);
    for (const file of await Promise.all(photos.map(shrinkPhoto))) form.append("photos", file);
    for (const file of await Promise.all(documents.map(shrinkIfPhoto))) {
      form.append("documents", file);
    }
    if (certificate) form.append("certificate", await shrinkIfPhoto(certificate));
    await action.run(() => markComplete({ data: form }));
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="completion-note">{t.completionNote}</Label>
        <Textarea
          id="completion-note"
          value={note}
          rows={4}
          maxLength={NOTE_MAX}
          onChange={(event) => setNote(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">{t.completionNoteHint}</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="completion-photos">{t.afterPhotos}</Label>
        <Input
          id="completion-photos"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          multiple
          onChange={(event) => setPhotos([...(event.target.files ?? [])])}
        />
        <p className="text-xs text-muted-foreground">{t.afterPhotosHint(COMPLETION_PHOTOS_MAX)}</p>
      </div>
      {needed && (
        <div className="space-y-1.5">
          <Label htmlFor="completion-certificate">{t.certificate(needed.name)}</Label>
          <Input
            id="completion-certificate"
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
            onChange={(event) => setCertificate(event.target.files?.[0] ?? null)}
          />
          <p className="text-xs text-muted-foreground">
            {t.certificateHint(needed.name, needed.neededOn)}
          </p>
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="completion-documents">{t.documents}</Label>
        <Input
          id="completion-documents"
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
          multiple
          onChange={(event) => setDocuments([...(event.target.files ?? [])])}
        />
        <p className="text-xs text-muted-foreground">{t.documentsHint(COMPLETION_DOCUMENTS_MAX)}</p>
      </div>
      <Refusal message={action.refusal} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={action.busy || !note.trim() || photos.length === 0}>
          {t.markComplete}
        </Button>
        <Button type="button" variant="ghost" disabled={action.busy} onClick={() => setOpen(false)}>
          {t.cancel}
        </Button>
      </div>
    </form>
  );
}

/** A document as it is chosen: a photo is shrunk as any photo is, and a PDF sent as it is. */
function shrinkIfPhoto(file: File): Promise<File> {
  return file.type.startsWith("image/") ? shrinkPhoto(file) : Promise.resolve(file);
}

/** The Client approves the Completion, or asks for a fix with a note. */
function ApproveOrFix({ engagement }: { engagement: Engagement }) {
  const action = useAction();
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const { engagementId } = engagement;
  const labour = engagement.money.payments.find((each) => each.part === "labour");
  if (asking) {
    return (
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          void action.run(
            () => requestFix({ data: { engagementId, note } }),
            () => setAsking(false),
          );
        }}
      >
        <Label htmlFor="fix-note">{t.fixNote}</Label>
        <Textarea
          id="fix-note"
          value={note}
          rows={3}
          maxLength={NOTE_MAX}
          onChange={(event) => setNote(event.target.value)}
        />
        <Refusal message={action.refusal} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={action.busy || !note.trim()}>
            {t.sendFix}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={action.busy}
            onClick={() => setAsking(false)}
          >
            {t.cancel}
          </Button>
        </div>
      </form>
    );
  }
  return (
    <>
      <Refusal message={action.refusal} />
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={action.busy}
          onClick={() => {
            const shown = labour?.amountCents ? formatRands(labour.amountCents) : null;
            if (!window.confirm(t.approveConfirm(shown))) return;
            void action.run(() => approveCompletion({ data: { engagementId } }));
          }}
        >
          {t.approve}
        </Button>
        <Button variant="outline" disabled={action.busy} onClick={() => setAsking(true)}>
          {t.askFix}
        </Button>
      </div>
    </>
  );
}

/** The newest Completion the Client could see: its note, photos, and documents. */
export function CompletionCard({ engagement }: { engagement: Engagement }) {
  const { completion } = engagement;
  if (!completion) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.completion}</CardTitle>
        <CardDescription>{t.completionMade(formatDate(completion.madeAt))}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm whitespace-pre-wrap">{completion.note}</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {completion.photos.map((photo, index) => (
            <a key={photo.id} href={photo.href} target="_blank" rel="noreferrer">
              <img
                src={photo.thumbnailHref}
                alt={t.photo(index + 1)}
                className="aspect-[4/3] w-full rounded-lg object-cover"
              />
            </a>
          ))}
        </div>
        {completion.documents.length > 0 && (
          <ul className="space-y-1 text-sm">
            {completion.documents.map((document, index) => (
              <li key={document.id}>
                <a
                  href={document.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 hover:underline"
                >
                  <FileText className="size-4" />
                  {document.certificate ? t.certificateDocument : t.document(index + 1)}
                </a>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Materials and Labour, as two numbered payments, each with its state, and the bar to Approval by silence. */
export function PaymentsCard({ engagement }: { engagement: Engagement }) {
  const { approval } = engagement;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.payments}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="divide-y rounded-lg border">
          {engagement.money.payments.map((payment, index) => (
            <li key={payment.part} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-medium">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{t.parts[payment.part].title}</div>
                <div className="text-xs text-muted-foreground">
                  {t.parts[payment.part].released}
                </div>
              </div>
              <span className="font-medium">{formatRands(payment.amountCents)}</span>
              <Badge variant="secondary">{t.partStates[payment.state]}</Badge>
            </li>
          ))}
        </ol>
        {approval && (
          <div className="space-y-1.5">
            <div
              role="progressbar"
              aria-label={t.approvalBar(formatDate(approval.dueAt))}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(approval.elapsed * 100)}
              className="h-2 overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${approval.elapsed * 100}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t.approvalBar(formatDate(approval.dueAt))}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** What happened on the Engagement, oldest first. */
export function ActivityCard({ engagement }: { engagement: Engagement }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.activity}</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-2 text-sm">
          {engagement.activity.map((entry, index) => (
            <li key={`${entry.event}:${index}`} className="flex justify-between gap-3">
              <span>{t.events[entry.event]}</span>
              <span className="text-muted-foreground">{formatDate(entry.at)}</span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

/** The money of the Hired Quote, with the viewer's own charge only. */
export function MoneyCard({ engagement }: { engagement: Engagement }) {
  const { money } = engagement;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{t.money}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="space-y-2 text-sm">
          <Row label={t.paidIn}>{formatRands(money.paidInCents)}</Row>
          <Row label={t.released}>{formatRands(money.releasedCents)}</Row>
          <Row label={t.unreleased}>{formatRands(money.unreleasedCents)}</Row>
          <Row label={t.refunded}>{formatRands(money.refundedCents)}</Row>
          {"protectionFeeCents" in money && (
            <Row label={t.protectionFee}>{formatRands(money.protectionFeeCents)}</Row>
          )}
          {"artisanFeePercent" in money && (
            <Row label={t.artisanFee}>{t.artisanFeeShown(money.artisanFeePercent)}</Row>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}

/** The Hired Quote's start, duration, and Warranty. */
export function HiredQuoteCard({ engagement }: { engagement: Engagement }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{t.hiredQuote}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="space-y-3 text-sm">
          <Fact label={copy.quote.start}>{formatDay(engagement.startOn)}</Fact>
          <Fact label={copy.quote.duration}>{copy.quote.days(engagement.durationDays)}</Fact>
          <Fact label={copy.quote.warrantyShort}>
            {engagement.warranty ?? copy.quote.noWarranty}
          </Fact>
        </dl>
      </CardContent>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}
