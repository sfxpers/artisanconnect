import { useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Fact } from "@/components/job-details";
import { Refusal } from "@/components/page";
import { formatRands, PROTECTION_FEE_PERCENT } from "@/domain/money";
import type { MaterialsBy } from "@/domain/quotes/inputs";
import { formatDay } from "@/domain/sa-days";
import { copy, formatDate } from "@/web/copy";
import { declineQuote, hireQuote, type getJobQuotes } from "@/web/quotes";
import type { ConversationSummary } from "@/components/conversation";
import { ReportAction } from "@/components/report";

const t = copy.quote;

/** What either party sees of a Quote's terms. */
export function QuoteFacts({
  quote,
}: {
  quote: {
    scope: string;
    labourCents: number;
    materialsCents: number;
    totalCents: number;
    materialsBy: MaterialsBy;
    startOn: string;
    durationDays: number;
    warranty: string | null;
    vatNumber: string | null;
  };
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm whitespace-pre-line">{quote.scope}</p>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Fact label={t.labourShort}>{formatRands(quote.labourCents)}</Fact>
        <Fact label={t.materialsShort}>{formatRands(quote.materialsCents)}</Fact>
        <Fact label={t.total}>
          <span className="font-semibold">{formatRands(quote.totalCents)}</span>
        </Fact>
        <Fact label={t.materialsByShort}>{t.materialsByShown[quote.materialsBy]}</Fact>
        <Fact label={t.start}>{formatDay(quote.startOn)}</Fact>
        <Fact label={t.duration}>{t.days(quote.durationDays)}</Fact>
        <Fact label={t.warrantyShort}>{quote.warranty ?? t.noWarranty}</Fact>
      </dl>
      {quote.vatNumber && (
        <p className="text-xs text-muted-foreground">{t.includesVat(quote.vatNumber)}</p>
      )}
    </div>
  );
}

type ClientQuote = NonNullable<Awaited<ReturnType<typeof getJobQuotes>>>[number];

const q = copy.quotes;

/**
 * The Quotes on the Client's Job (#124): those Sent, in the order sent or by
 * total, each with the Artisan's record, their badges for the category, and
 * the Payment with the Protection Fee; then those no longer open. Nothing is
 * labelled best or cheapest, and each opens its Conversation. Each Sent one
 * may be Hired by paying for it (#126).
 */
export function ClientQuotes({
  jobId,
  quotes,
  conversations,
}: {
  jobId: string;
  quotes: ClientQuote[];
  conversations: ConversationSummary[];
}) {
  const conversationOf = (artisanId: string) =>
    conversations.find((each) => "artisanId" in each.with && each.with.artisanId === artisanId)
      ?.conversationId;
  const [byTotal, setByTotal] = useState(false);
  const open = quotes.filter((quote) => quote.state === "sent");
  const ended = quotes.filter((quote) => quote.state !== "sent");
  const shown = byTotal ? [...open].sort((a, b) => a.totalCents - b.totalCents) : open;
  if (quotes.length === 0) return <p className="text-sm text-muted-foreground">{q.none}</p>;
  return (
    <div className="space-y-3">
      {open.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">{q.lead}</p>
            {open.length > 1 && (
              <div className="flex gap-1">
                <Button
                  size="xs"
                  variant={byTotal ? "ghost" : "secondary"}
                  onClick={() => setByTotal(false)}
                >
                  {q.sortSent}
                </Button>
                <Button
                  size="xs"
                  variant={byTotal ? "secondary" : "ghost"}
                  onClick={() => setByTotal(true)}
                >
                  {q.sortTotal}
                </Button>
              </div>
            )}
          </div>
          <ul className="divide-y rounded-lg border">
            {shown.map((quote) => (
              <QuoteRow
                key={quote.quoteId}
                jobId={jobId}
                quote={quote}
                conversationId={conversationOf(quote.artisan.artisanId)}
              />
            ))}
          </ul>
        </>
      )}
      {ended.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">{q.ended}</p>
          <ul className="divide-y rounded-lg border">
            {ended.map((quote) => (
              <li key={quote.quoteId} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                <span className="font-medium">{quote.artisan.publicName ?? q.noName}</span>
                <span className="text-muted-foreground">{formatRands(quote.totalCents)}</span>
                <Badge variant="secondary">{t.states[quote.state]}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function QuoteRow({
  jobId,
  quote,
  conversationId,
}: {
  jobId: string;
  quote: ClientQuote;
  conversationId: string | undefined;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [hiring, setHiring] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  /** Opens the checkout and goes there; the Hire happens when the money arrives. */
  async function pay() {
    setBusy(true);
    setRefusal(null);
    const opened = await hireQuote({
      data: { quoteId: quote.quoteId, feeAcknowledged: acknowledged },
    });
    if (opened.ok) {
      window.location.assign(opened.value.checkoutUrl);
      return;
    }
    setRefusal(opened.refusal.message);
    await router.invalidate();
    setBusy(false);
  }

  async function decline() {
    if (!window.confirm(q.declineConfirm)) return;
    setBusy(true);
    setRefusal(null);
    const result = await declineQuote({ data: { quoteId: quote.quoteId } });
    if (!result.ok) setRefusal(result.refusal.message);
    await router.invalidate();
    setBusy(false);
  }

  const { artisan } = quote;
  return (
    <li className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          {artisan.publicName ? (
            <Link
              to="/artisans/$artisanId"
              params={{ artisanId: artisan.artisanId }}
              target="_blank"
              className="font-medium hover:underline"
            >
              {artisan.publicName}
            </Link>
          ) : (
            <span className="font-medium">{q.noName}</span>
          )}
          <div className="text-xs text-muted-foreground">
            {copy.match.reviews(artisan.reviews.average, artisan.reviews.count)} ·{" "}
            {copy.match.completed(artisan.completed)}
          </div>
          {artisan.badges.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {artisan.badges.map((badge) => (
                <Badge key={`${badge.kind}:${badge.category ?? ""}`} variant="outline">
                  <ShieldCheck />
                  {badge.name}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold">{formatRands(quote.totalCents)}</div>
          <div className="text-xs text-muted-foreground">
            {formatRands(quote.labourCents)} {t.labourShort} · {formatRands(quote.materialsCents)}{" "}
            {t.materialsShort}
          </div>
        </div>
      </div>
      <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <Fact label={t.start}>{formatDay(quote.startOn)}</Fact>
        <Fact label={t.duration}>{t.days(quote.durationDays)}</Fact>
        <Fact label={t.materialsByShort}>{t.materialsByShown[quote.materialsBy]}</Fact>
        <Fact label={t.warrantyShort}>{quote.warranty ?? t.noWarranty}</Fact>
      </dl>
      <div className="rounded-lg bg-muted/60 p-3 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <span>{q.payment}</span>
          <span className="font-semibold">{formatRands(quote.paymentCents)}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {q.paymentLead(PROTECTION_FEE_PERCENT, formatRands(quote.protectionFeeCents))}
          {quote.vatNumber && ` ${t.includesVat(quote.vatNumber)}`}
        </p>
      </div>
      {open && <p className="text-sm whitespace-pre-line">{quote.scope}</p>}
      {quote.startPassed && (
        <p className="text-sm text-muted-foreground">
          <Badge variant="outline">{q.startPassed}</Badge> {q.startPassedLead}
        </p>
      )}
      {hiring && !quote.startPassed && (
        <div className="space-y-3 rounded-lg border p-3">
          <h4 className="text-sm font-medium">{q.hireTitle}</h4>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{q.hireQuote}</dt>
              <dd>{formatRands(quote.totalCents)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{q.hireFee(PROTECTION_FEE_PERCENT)}</dt>
              <dd>{formatRands(quote.protectionFeeCents)}</dd>
            </div>
            <div className="flex justify-between gap-3 font-semibold">
              <dt>{q.hirePayment}</dt>
              <dd>{formatRands(quote.paymentCents)}</dd>
            </div>
          </dl>
          <Label className="items-start gap-2 leading-snug font-normal">
            <Checkbox
              checked={acknowledged}
              onCheckedChange={(checked) => setAcknowledged(checked)}
            />
            {q.hireAcknowledge(formatRands(quote.protectionFeeCents))}
          </Label>
          <p className="text-xs text-muted-foreground">{q.hireLead}</p>
          <Button disabled={busy || !acknowledged} onClick={() => void pay()}>
            {q.hirePay(formatRands(quote.paymentCents))}
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Button
          size="sm"
          variant={hiring ? "secondary" : "default"}
          disabled={quote.startPassed}
          onClick={() => setHiring((shown) => !shown)}
        >
          {q.hire}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setOpen((shown) => !shown)}>
          {open ? q.hideDetails : q.details}
        </Button>
        {conversationId && (
          <Link
            to="/jobs/$jobId"
            params={{ jobId }}
            search={{ tab: "messages", conversation: conversationId }}
            className={buttonVariants({ size: "sm", variant: "outline" })}
          >
            {copy.conversation.message}
          </Link>
        )}
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void decline()}>
          {q.decline}
        </Button>
        <ReportAction about={{ kind: "quote", id: quote.quoteId }} />
        <span className="ml-auto">
          {quote.sentAt && q.sent(formatDate(quote.sentAt))}
          {quote.revisedAt && ` · ${t.revisedOn(formatDate(quote.revisedAt))}`}
          {quote.expiresAt && ` · ${q.expires(formatDate(quote.expiresAt))}`}
        </span>
      </div>
      <Refusal message={refusal} />
    </li>
  );
}
