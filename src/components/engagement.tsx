import { useState, type ReactNode } from "react";
import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Fact } from "@/components/job-details";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NextStepCard, Refusal } from "@/components/page";
import { useAction } from "@/components/use-action";
import {
  CANCELLATION_REASON_MAX,
  CERTIFICATES,
  COMPLETION_DOCUMENTS_MAX,
  COMPLETION_PHOTOS_MAX,
  DISPUTE_PHOTOS_MAX,
  DISPUTE_REASON_MAX,
  labourAmount,
  NOTE_MAX,
  refundFields,
  updatedQuoteFields,
} from "@/domain/engagements/inputs";
import { formatRands, PROTECTION_FEE_PERCENT } from "@/domain/money";
import { formatDay } from "@/domain/sa-days";
import { copy, formatDate } from "@/web/copy";
import {
  acceptUpdatedQuote,
  answerNotStarted,
  approveCompletion,
  cancelEngagement,
  claimStarted,
  markComplete,
  markWorkStarted,
  openDispute,
  proposeUpdatedQuote,
  refund,
  rejectUpdatedQuote,
  releaseHeld,
  requestFix,
  withdrawCompletion,
  withdrawUpdatedQuote,
} from "@/web/engagements";
import type { getJob } from "@/web/jobs";
import { shrinkPhoto } from "@/web/shrink-photo";

// The Job page once a Quote is Hired (#107, #126): the next step, with what
// each party may do toward Work started (#127) and then Completion, Approval,
// and Fix requests (#130), and either party's Cancellation (#133), the
// Completion itself, the Payments card with Materials and Labour as two
// numbered payments and the bar to Approval by silence, the Refunds and the
// Artisan's Refund form (#132), the Updated Quote (#134), the Dispute and
// what each party may do about it (#135), the Activity, and in the sidebar
// the Money and the Hired Quote's dates. The Client never
// sees the Artisan Fee; the Artisan never sees the Protection Fee.

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
    case "disputed": {
      const { dispute } = engagement;
      if (!dispute) break;
      return [
        t.dispute.title,
        t.dispute.lead({
          own: (dispute.by === "client") === asClient,
          asClient,
          held: formatRands(dispute.heldCents),
        }),
      ];
    }
    case "completed":
      return [t.completedTitle, asClient ? t.completedClientLead : t.completedArtisanLead];
    case "cancelled": {
      const { cancellation } = engagement;
      if (!cancellation) break;
      const own = (cancellation.by === "client") === asClient;
      const { labourRefund } = cancellation;
      return [
        t.cancelledTitle,
        t.cancelledLead({
          who: own ? t.you : asClient ? t.theArtisan : t.theClient,
          afterWorkStarted: cancellation.afterWorkStarted,
          asClient,
          labourRefund: labourRefund && {
            amount: formatRands(labourRefund.amountCents),
            on: formatDate(labourRefund.dueAt),
          },
        }),
      ];
    }
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
                const shown = materials?.unreleasedCents
                  ? formatRands(materials.unreleasedCents)
                  : null;
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

/**
 * Either party cancels before Approval, with an optional reason only the
 * Admin reads, once told what happens to the money (ADR 0007).
 */
export function CancelAction({
  engagement,
  asClient,
}: {
  engagement: Engagement;
  asClient: boolean;
}) {
  const action = useAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!engagement.canCancel) return null;
  if (!open) {
    return (
      <div>
        <Button variant="outline" onClick={() => setOpen(true)}>
          {t.cancelJob}
        </Button>
      </div>
    );
  }
  const afterWorkStarted = engagement.state !== "paid";
  const labour = engagement.money.payments.find((each) => each.part === "labour");
  const lead = t.cancelLead({
    afterWorkStarted,
    asClient,
    amount: formatRands(
      afterWorkStarted ? (labour?.unreleasedCents ?? 0) : engagement.money.unreleasedCents,
    ),
  });
  const { engagementId } = engagement;
  return (
    <form
      className="space-y-3 rounded-lg border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!window.confirm(t.cancelConfirm(lead))) return;
        void action.run(() => cancelEngagement({ data: { engagementId, reason } }));
      }}
    >
      <p className="text-sm text-muted-foreground">{lead}</p>
      <div className="space-y-1.5">
        <Label htmlFor="cancel-reason">{t.cancelReason}</Label>
        <Textarea
          id="cancel-reason"
          value={reason}
          rows={2}
          maxLength={CANCELLATION_REASON_MAX}
          onChange={(event) => setReason(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">{t.cancelReasonHint(asClient)}</p>
      </div>
      <Refusal message={action.refusal} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="destructive" disabled={action.busy}>
          {t.cancelJob}
        </Button>
        <Button type="button" variant="ghost" disabled={action.busy} onClick={() => setOpen(false)}>
          {t.keepJob}
        </Button>
      </div>
    </form>
  );
}

const d = t.dispute;

/**
 * What the viewer may do about a Dispute (#135): the Client disputes part of
 * the Labour while a Completion awaits them, then may release what is held
 * or approve the rest; the Artisan disputes all the Labour not yet released
 * against a Fix request or within a Cancellation's 72 hours.
 */
export function DisputeActions({
  engagement,
  asClient,
}: {
  engagement: Engagement;
  asClient: boolean;
}) {
  return (
    <>
      {engagement.disputable && (
        <DisputeForm
          engagementId={engagement.engagementId}
          asClient={asClient}
          labourCents={engagement.disputable.labourCents}
          until={"until" in engagement.disputable ? engagement.disputable.until : null}
        />
      )}
      {"releasable" in engagement && engagement.releasable && (
        <ReleaseHeld engagement={engagement} heldCents={engagement.releasable.heldCents} />
      )}
    </>
  );
}

/** The form that opens a Dispute: the Client's names an amount; both give a reason and photos. */
function DisputeForm({
  engagementId,
  asClient,
  labourCents,
  until,
}: {
  engagementId: string;
  asClient: boolean;
  labourCents: number;
  until: Date | null;
}) {
  const action = useAction();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  if (!open) {
    return (
      <div>
        <Button variant="outline" onClick={() => setOpen(true)}>
          {d.open(asClient)}
        </Button>
      </div>
    );
  }
  const labour = formatRands(labourCents);

  async function send() {
    if (!window.confirm(d.confirm)) return;
    const form = new FormData();
    form.append("engagementId", engagementId);
    form.append("reason", reason);
    if (asClient) form.append("amount", amount);
    for (const file of await Promise.all(photos.map(shrinkPhoto))) form.append("photos", file);
    await action.run(() => openDispute({ data: form }));
  }

  return (
    <form
      className="space-y-3 rounded-lg border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <p className="text-sm text-muted-foreground">
        {asClient ? d.clientLead(labour) : d.artisanLead(labour, until && formatDate(until))}
      </p>
      {asClient && (
        <div className="space-y-1.5">
          <Label htmlFor="dispute-amount">{d.amount}</Label>
          <Input
            id="dispute-amount"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="dispute-reason">{d.why}</Label>
        <Textarea
          id="dispute-reason"
          value={reason}
          rows={3}
          maxLength={DISPUTE_REASON_MAX}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="dispute-photos">{d.photos}</Label>
        <Input
          id="dispute-photos"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          multiple
          onChange={(event) => setPhotos([...(event.target.files ?? [])])}
        />
        <p className="text-xs text-muted-foreground">{d.photosHint(DISPUTE_PHOTOS_MAX)}</p>
      </div>
      <Refusal message={action.refusal} />
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          variant="destructive"
          disabled={action.busy || !reason.trim() || (asClient && !amount.trim())}
        >
          {d.send}
        </Button>
        <Button type="button" variant="ghost" disabled={action.busy} onClick={() => setOpen(false)}>
          {d.cancel}
        </Button>
      </div>
    </form>
  );
}

/** The Client releases some or all of what their Dispute holds, or approves the Labour not held. */
function ReleaseHeld({ engagement, heldCents }: { engagement: Engagement; heldCents: number }) {
  const action = useAction();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const { engagementId } = engagement;
  const labour = engagement.money.payments.find((each) => each.part === "labour");
  const restCents = (labour?.unreleasedCents ?? 0) - heldCents;
  const typed = labourAmount.safeParse(amount);
  return (
    <div className="space-y-3">
      {!open && (
        <div className="flex flex-wrap gap-2">
          {engagement.approval && (
            <Button
              disabled={action.busy}
              onClick={() => {
                if (!window.confirm(d.approveRestConfirm(formatRands(restCents)))) return;
                void action.run(() => approveCompletion({ data: { engagementId } }));
              }}
            >
              {d.approveRest}
            </Button>
          )}
          <Button variant="outline" onClick={() => setOpen(true)}>
            {d.release}
          </Button>
        </div>
      )}
      {open && (
        <form
          className="space-y-3 rounded-lg border p-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!typed.success) return;
            if (!window.confirm(d.releaseConfirm(formatRands(typed.data)))) return;
            void action.run(
              () => releaseHeld({ data: { engagementId, amount } }),
              () => {
                setOpen(false);
                setAmount("");
              },
            );
          }}
        >
          <p className="text-sm text-muted-foreground">{d.releaseLead(formatRands(heldCents))}</p>
          <div className="space-y-1.5">
            <Label htmlFor="release-amount">{d.releaseAmount}</Label>
            <Input
              id="release-amount"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={action.busy || !typed.success}>
              {d.releaseSend}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={action.busy}
              onClick={() => setOpen(false)}
            >
              {d.cancel}
            </Button>
          </div>
        </form>
      )}
      <Refusal message={action.refusal} />
    </div>
  );
}

/**
 * The Engagement's Dispute: who opened it and against what, what it named
 * and holds now, its reason and photos, and how it closed, with the Admin's
 * split and reason once decided.
 */
export function DisputeCard({
  engagement,
  asClient,
}: {
  engagement: Engagement;
  asClient: boolean;
}) {
  const { dispute } = engagement;
  if (!dispute) return null;
  const own = (dispute.by === "client") === asClient;
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{d.card}</CardTitle>
          <Badge variant={dispute.state === "open" ? "destructive" : "secondary"}>
            {d.states[dispute.state]}
          </Badge>
        </div>
        <CardDescription>
          {d.against[dispute.against]} ·{" "}
          {d.openedBy(
            own ? d.you : asClient ? d.theArtisan : d.theClient,
            formatDate(dispute.openedAt),
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <dl className="space-y-2">
          <Row label={d.named}>{formatRands(dispute.namedCents)}</Row>
          {dispute.state === "open" && (
            <Row label={d.heldNow}>{formatRands(dispute.heldCents)}</Row>
          )}
        </dl>
        {dispute.reason ? (
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">{d.reason}</div>
            <p className="whitespace-pre-wrap">{dispute.reason}</p>
          </div>
        ) : (
          <p className="text-muted-foreground">{d.noReason}</p>
        )}
        {dispute.reasonHeld && <p className="text-xs text-muted-foreground">{d.reasonHeld}</p>}
        {dispute.photos.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {dispute.photos.map((photo, index) => (
              <a key={photo.id} href={photo.href} target="_blank" rel="noreferrer">
                <img
                  src={photo.thumbnailHref}
                  alt={d.photo(index + 1)}
                  className="aspect-[4/3] w-full rounded-lg object-cover"
                />
              </a>
            ))}
          </div>
        )}
        {dispute.state === "settled" && dispute.closedAt && (
          <p className="text-muted-foreground">{d.settled(formatDate(dispute.closedAt))}</p>
        )}
        {dispute.decision && dispute.closedAt && (
          <div className="space-y-2 rounded-lg bg-muted/60 p-3">
            <dl className="space-y-2">
              <Row label={d.releasedTo(asClient)}>
                {formatRands(dispute.decision.releasedCents)}
              </Row>
              <Row label={d.refundedTo(asClient)}>
                {formatRands(dispute.decision.refundedCents)}
              </Row>
            </dl>
            <div className="text-xs text-muted-foreground">{d.decisionReason}</div>
            <p className="whitespace-pre-wrap">{dispute.decision.reason}</p>
            <p className="text-xs text-muted-foreground">
              {d.decided(formatDate(dispute.closedAt))}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const u = t.updatedQuote;

/**
 * The Updated Quote: the Client pays its difference or rejects it; the
 * Artisan sees theirs waiting, which they may withdraw, or proposes one
 * before Completion (ADR 0019).
 */
export function UpdatedQuoteCard({
  engagement,
  asClient,
}: {
  engagement: Engagement;
  asClient: boolean;
}) {
  const proposed = engagement.updatedQuote;
  const canPropose = "proposeFrom" in engagement && engagement.proposeFrom;
  if (!proposed && !canPropose) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{u.title}</CardTitle>
        {proposed && (
          <CardDescription>
            {asClient
              ? u.proposedClient(formatDate(proposed.proposedAt))
              : u.proposedArtisan(formatDate(proposed.proposedAt))}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {proposed ? (
          <>
            <ProposedLines proposed={proposed} />
            {"payCents" in proposed ? (
              <PayOrReject proposed={proposed} />
            ) : (
              <Withdraw updatedQuoteId={proposed.updatedQuoteId} />
            )}
          </>
        ) : (
          "proposeFrom" in engagement &&
          engagement.proposeFrom && (
            <ProposeForm engagementId={engagement.engagementId} now={engagement.proposeFrom} />
          )
        )}
      </CardContent>
    </Card>
  );
}

type Proposed = NonNullable<Engagement["updatedQuote"]>;

/** Each line now and as updated, and the difference. */
function ProposedLines({ proposed }: { proposed: Proposed }) {
  const lines = [
    { label: u.labour, from: proposed.fromLabourCents, to: proposed.labourCents },
    { label: u.materials, from: proposed.fromMaterialsCents, to: proposed.materialsCents },
    {
      label: u.total,
      from: proposed.fromLabourCents + proposed.fromMaterialsCents,
      to: proposed.labourCents + proposed.materialsCents,
    },
  ];
  return (
    <table className="w-full text-sm">
      <thead className="text-xs text-muted-foreground">
        <tr>
          <th />
          <th className="text-right font-normal">{u.from}</th>
          <th className="text-right font-normal">{u.to}</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((line) => (
          <tr key={line.label}>
            <td className="py-1 text-muted-foreground">{line.label}</td>
            <td className="py-1 text-right">{formatRands(line.from)}</td>
            <td className="py-1 text-right font-medium">{formatRands(line.to)}</td>
          </tr>
        ))}
        <tr className="border-t">
          <td className="pt-2 font-medium">{u.difference}</td>
          <td />
          <td className="pt-2 text-right font-medium">{formatRands(proposed.addsCents)}</td>
        </tr>
      </tbody>
    </table>
  );
}

/** The Client pays the difference plus its Protection Fee through checkout, or rejects it. */
function PayOrReject({ proposed }: { proposed: Extract<Proposed, { payCents: number }> }) {
  const action = useAction();
  const [acknowledged, setAcknowledged] = useState(false);
  const { updatedQuoteId } = proposed;
  const fee = formatRands(proposed.protectionFeeCents);

  function pay() {
    let checkoutUrl: string | null = null;
    void action.run(
      async () => {
        const opened = await acceptUpdatedQuote({
          data: { updatedQuoteId, feeAcknowledged: acknowledged },
        });
        if (opened.ok) checkoutUrl = opened.value.checkoutUrl;
        return opened;
      },
      () => {
        // The new price applies when the money arrives, never on the way back.
        if (checkoutUrl) window.location.assign(checkoutUrl);
      },
    );
  }

  return (
    <div className="space-y-3">
      <dl className="space-y-1 rounded-lg bg-muted/60 p-3 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{u.fee(PROTECTION_FEE_PERCENT)}</dt>
          <dd>{fee}</dd>
        </div>
        <div className="flex justify-between gap-3 font-semibold">
          <dt>{u.youPay}</dt>
          <dd>{formatRands(proposed.payCents)}</dd>
        </div>
      </dl>
      <Label className="items-start gap-2 leading-snug font-normal">
        <Checkbox checked={acknowledged} onCheckedChange={(checked) => setAcknowledged(checked)} />
        {u.acknowledge(fee)}
      </Label>
      <p className="text-xs text-muted-foreground">{u.payLead}</p>
      <Refusal message={action.refusal} />
      <div className="flex flex-wrap gap-2">
        <Button disabled={action.busy || !acknowledged} onClick={pay}>
          {u.pay(formatRands(proposed.payCents))}
        </Button>
        <Button
          variant="outline"
          disabled={action.busy}
          onClick={() => {
            if (!window.confirm(u.rejectConfirm)) return;
            void action.run(() => rejectUpdatedQuote({ data: { updatedQuoteId } }));
          }}
        >
          {u.reject}
        </Button>
      </div>
    </div>
  );
}

/** The Artisan's Updated Quote waiting for the Client, which they may withdraw. */
function Withdraw({ updatedQuoteId }: { updatedQuoteId: string }) {
  const action = useAction();
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{u.waiting}</p>
      <Refusal message={action.refusal} />
      <Button
        variant="outline"
        disabled={action.busy}
        onClick={() => {
          if (!window.confirm(u.withdrawConfirm)) return;
          void action.run(() => withdrawUpdatedQuote({ data: { updatedQuoteId } }));
        }}
      >
        {u.withdraw}
      </Button>
    </div>
  );
}

/** The Artisan names the new Labour and Materials, starting from the price now. */
function ProposeForm({
  engagementId,
  now,
}: {
  engagementId: string;
  now: NonNullable<ArtisanEngagement["proposeFrom"]>;
}) {
  const action = useAction();
  const [open, setOpen] = useState(false);
  const typedNow = {
    labour: (now.labourCents / 100).toFixed(2),
    materials: (now.materialsCents / 100).toFixed(2),
  };
  const [amounts, setAmounts] = useState(typedNow);
  if (!open) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">{u.proposeLead}</p>
        <Button variant="outline" onClick={() => setOpen(true)}>
          {u.propose}
        </Button>
      </div>
    );
  }
  // Read as the server reads it, so the button and the confirm agree with it.
  const typed = updatedQuoteFields.safeParse(amounts);
  const addsCents = typed.success
    ? typed.data.labour + typed.data.materials - now.labourCents - now.materialsCents
    : 0;
  const clientSupplies = now.materialsBy === "client";
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!window.confirm(u.sendConfirm(formatRands(addsCents)))) return;
        void action.run(
          () => proposeUpdatedQuote({ data: { engagementId, ...amounts } }),
          () => setOpen(false),
        );
      }}
    >
      <p className="text-sm text-muted-foreground">{u.proposeLead}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {(["labour", "materials"] as const).map((part) => (
          <div key={part} className="space-y-1.5">
            <Label htmlFor={`updated-${part}`}>{u[part]}</Label>
            <Input
              id={`updated-${part}`}
              inputMode="decimal"
              value={amounts[part]}
              disabled={part === "materials" && clientSupplies}
              onChange={(event) => setAmounts({ ...amounts, [part]: event.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              {part === "materials" && clientSupplies
                ? u.clientSupplies
                : u.atLeast(formatRands(now[`${part}Cents`]))}
            </p>
          </div>
        ))}
      </div>
      <Refusal message={action.refusal} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={action.busy || addsCents <= 0}>
          {u.send}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={action.busy}
          onClick={() => {
            setOpen(false);
            setAmounts(typedNow);
          }}
        >
          {u.cancel}
        </Button>
      </div>
    </form>
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
            const shown = labour?.unreleasedCents ? formatRands(labour.unreleasedCents) : null;
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

/**
 * Materials and Labour, as two numbered payments, each with its state; the
 * bar to Approval by silence; the Refunds; and the Artisan's Refund form.
 */
export function PaymentsCard({ engagement }: { engagement: Engagement }) {
  const { approval } = engagement;
  const barLabel = approval
    ? (engagement.state === "disputed" ? t.restBar : t.approvalBar)(formatDate(approval.dueAt))
    : "";
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
              aria-label={barLabel}
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
            <p className="text-xs text-muted-foreground">{barLabel}</p>
          </div>
        )}
        <RefundsList engagement={engagement} />
        {"refundable" in engagement && <RefundForm engagement={engagement} />}
      </CardContent>
    </Card>
  );
}

/** The Engagement's Refunds, oldest first, each with where it stands. */
function RefundsList({ engagement }: { engagement: Engagement }) {
  if (engagement.refunds.length === 0) return null;
  const owed = engagement.refunds.some((each) => each.state === "owed");
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">{t.refunds}</h3>
      <ul className="divide-y rounded-lg border">
        {engagement.refunds.map((each) => (
          <li key={each.refundId} className="flex flex-wrap items-center gap-3 p-3 text-sm">
            <div className="min-w-0 flex-1">
              <div className="font-medium">{formatRands(each.amountCents)}</div>
              <div className="text-xs text-muted-foreground">
                {t.refundLine(
                  each.materialsCents ? formatRands(each.materialsCents) : null,
                  each.labourCents ? formatRands(each.labourCents) : null,
                )}{" "}
                · {formatDate(each.madeAt)}
              </div>
            </div>
            <Badge variant={each.state === "owed" ? "destructive" : "secondary"}>
              {t.refundStates[each.state]}
            </Badge>
          </li>
        ))}
      </ul>
      {owed && <p className="text-xs text-muted-foreground">{t.refundOwedLead}</p>}
    </div>
  );
}

/** The Artisan names an amount of each unreleased line to refund, while any is unreleased. */
function RefundForm({ engagement }: { engagement: ArtisanEngagement }) {
  const action = useAction();
  const [open, setOpen] = useState(false);
  const [amounts, setAmounts] = useState({ materials: "", labour: "" });
  const { refundable } = engagement;
  const lines = (["materials", "labour"] as const).filter((part) => refundable[`${part}Cents`] > 0);
  if (lines.length === 0) return null;
  if (!open) {
    return (
      <div className="space-y-1">
        <Button variant="outline" onClick={() => setOpen(true)}>
          {t.refund}
        </Button>
      </div>
    );
  }
  // Read as the server reads it, so the button and the confirm agree with it.
  const typed = refundFields.safeParse(
    Object.fromEntries(lines.map((part) => [part, amounts[part]])),
  );
  const typedCents = typed.success ? typed.data.materials + typed.data.labour : 0;
  return (
    <form
      className="space-y-3 rounded-lg border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!window.confirm(t.refundConfirm(formatRands(typedCents)))) return;
        void action.run(
          () =>
            refund({
              data: {
                engagementId: engagement.engagementId,
                ...Object.fromEntries(lines.map((part) => [part, amounts[part]])),
              },
            }),
          () => {
            setOpen(false);
            setAmounts({ materials: "", labour: "" });
          },
        );
      }}
    >
      <p className="text-sm text-muted-foreground">{t.refundLead}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {lines.map((part) => (
          <div key={part} className="space-y-1.5">
            <Label htmlFor={`refund-${part}`}>
              {t.refundUpTo(t.parts[part].title, formatRands(refundable[`${part}Cents`]))}
            </Label>
            <Input
              id={`refund-${part}`}
              inputMode="decimal"
              placeholder="0.00"
              value={amounts[part]}
              onChange={(event) => setAmounts({ ...amounts, [part]: event.target.value })}
            />
          </div>
        ))}
      </div>
      <Refusal message={action.refusal} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={action.busy || typedCents === 0}>
          {t.refundSend}
        </Button>
        <Button type="button" variant="ghost" disabled={action.busy} onClick={() => setOpen(false)}>
          {t.cancelRefund}
        </Button>
      </div>
    </form>
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
          {money.heldCents > 0 && <Row label={t.held}>{formatRands(money.heldCents)}</Row>}
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
