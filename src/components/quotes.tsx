import { useRef, useState, type ReactNode } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { useConfirm } from "@/components/confirm";
import { FileText, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Fact } from "@/components/job-details";
import { Deadline, EmptyState, MoneyLines, Refusal } from "@/components/page";
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
 * The Quotes on the Client's Job (#124), side by side: those Sent, in the
 * order sent or by total, each with the Artisan's record, their badges for
 * the category, and the Payment as lines with the Protection Fee; then those
 * no longer open. Nothing is labelled best or cheapest. Hiring one opens its
 * checkout under the table (#126).
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
  const [order, setOrder] = useState<"sent" | "total">("sent");
  const [hiring, setHiring] = useState<string | null>(null);
  const checkout = useRef<HTMLDivElement>(null);
  const open = quotes.filter((quote) => quote.state === "sent");
  const ended = quotes.filter((quote) => quote.state !== "sent");
  const shown = order === "total" ? [...open].sort((a, b) => a.totalCents - b.totalCents) : open;
  const chosen = open.find((quote) => quote.quoteId === hiring && !quote.startPassed);
  if (quotes.length === 0) return <EmptyState icon={<FileText />}>{q.none}</EmptyState>;

  function hire(quoteId: string) {
    setHiring(quoteId);
    // On a phone the checkout is below the fold.
    requestAnimationFrame(() => checkout.current?.scrollIntoView({ block: "nearest" }));
  }

  return (
    <div className="space-y-4">
      {open.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">{q.lead}</p>
            {open.length > 1 && (
              <ToggleGroup
                aria-label={q.sortLabel}
                variant="outline"
                size="sm"
                value={[order]}
                onValueChange={(value) => value[0] && setOrder(value[0] as "sent" | "total")}
              >
                <ToggleGroupItem value="sent">{q.sortSent}</ToggleGroupItem>
                <ToggleGroupItem value="total">{q.sortTotal}</ToggleGroupItem>
              </ToggleGroup>
            )}
          </div>
          <div className="rounded-lg border bg-card">
            <Table aria-label={q.compare}>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36 bg-muted">{q.artisan}</TableHead>
                  {shown.map((quote) => (
                    <TableHead key={quote.quoteId} scope="col" className="min-w-52 py-3 align-top">
                      <ArtisanName artisan={quote.artisan} />
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                <Row label={q.record}>
                  {shown.map((quote) => (
                    <TableCell key={quote.quoteId} className="text-muted-foreground">
                      {copy.match.reviews(
                        quote.artisan.reviews.average,
                        quote.artisan.reviews.count,
                      )}
                      <br />
                      {copy.match.completed(quote.artisan.completed)}
                    </TableCell>
                  ))}
                </Row>
                <Row label={q.badges}>
                  {shown.map((quote) => (
                    <TableCell key={quote.quoteId}>
                      <Badges badges={quote.artisan.badges} />
                    </TableCell>
                  ))}
                </Row>
                <Row label={t.labourShort}>
                  {shown.map((quote) => (
                    <Money key={quote.quoteId} cents={quote.labourCents} />
                  ))}
                </Row>
                <Row label={t.materialsShort}>
                  {shown.map((quote) => (
                    <Money key={quote.quoteId} cents={quote.materialsCents} />
                  ))}
                </Row>
                <Row label={q.protectionFee(PROTECTION_FEE_PERCENT)}>
                  {shown.map((quote) => (
                    <Money key={quote.quoteId} cents={quote.protectionFeeCents} />
                  ))}
                </Row>
                <Row label={q.youPay} strong>
                  {shown.map((quote) => (
                    <Money key={quote.quoteId} cents={quote.paymentCents} strong />
                  ))}
                </Row>
                <Row label={t.start}>
                  {shown.map((quote) => (
                    <TableCell key={quote.quoteId}>
                      {formatDay(quote.startOn)}
                      {quote.startPassed && (
                        <Badge variant="warning" className="ml-2">
                          {q.startPassed}
                        </Badge>
                      )}
                    </TableCell>
                  ))}
                </Row>
                <Row label={t.duration}>
                  {shown.map((quote) => (
                    <TableCell key={quote.quoteId}>{t.days(quote.durationDays)}</TableCell>
                  ))}
                </Row>
                <Row label={t.materialsByShort}>
                  {shown.map((quote) => (
                    <TableCell key={quote.quoteId}>
                      {t.materialsByShown[quote.materialsBy]}
                    </TableCell>
                  ))}
                </Row>
                <Row label={t.warrantyShort}>
                  {shown.map((quote) => (
                    <TableCell key={quote.quoteId} className="whitespace-normal">
                      {quote.warranty ?? t.noWarranty}
                    </TableCell>
                  ))}
                </Row>
                <Row label={q.scope}>
                  {shown.map((quote) => (
                    <TableCell key={quote.quoteId} className="text-sm whitespace-pre-line">
                      {quote.scope}
                      {quote.vatNumber && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t.includesVat(quote.vatNumber)}
                        </p>
                      )}
                    </TableCell>
                  ))}
                </Row>
                <Row label={q.expiresRow}>
                  {shown.map((quote) => (
                    <TableCell key={quote.quoteId} className="whitespace-normal">
                      {quote.expiresAt ? <Deadline at={quote.expiresAt} /> : null}
                      <p className="text-xs text-muted-foreground">
                        {quote.sentAt && q.sent(formatDate(quote.sentAt))}
                        {quote.revisedAt && ` · ${t.revisedOn(formatDate(quote.revisedAt))}`}
                      </p>
                    </TableCell>
                  ))}
                </Row>
                <Row label={q.actions}>
                  {shown.map((quote) => (
                    <TableCell key={quote.quoteId} className="align-top">
                      <QuoteActions
                        jobId={jobId}
                        quote={quote}
                        hiring={quote.quoteId === chosen?.quoteId}
                        onHire={() => hire(quote.quoteId)}
                        conversationId={conversationOf(quote.artisan.artisanId)}
                      />
                    </TableCell>
                  ))}
                </Row>
              </TableBody>
            </Table>
          </div>
          {shown.some((quote) => quote.startPassed) && (
            <p className="text-sm text-muted-foreground">{q.startPassedLead}</p>
          )}
          <div ref={checkout}>{chosen && <Checkout key={chosen.quoteId} quote={chosen} />}</div>
        </>
      )}
      {ended.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">{q.ended}</p>
          <ul className="divide-y rounded-lg border bg-card">
            {ended.map((quote) => (
              <li key={quote.quoteId} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                <span className="font-medium">{quote.artisan.publicName ?? q.noName}</span>
                <span className="text-muted-foreground tabular-nums">
                  {formatRands(quote.totalCents)}
                </span>
                <Badge variant="secondary">{t.states[quote.state]}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** One line of the comparison: its label, held in place as the table scrolls on a phone. */
function Row({
  label,
  strong,
  children,
}: {
  label: string;
  strong?: boolean;
  children: ReactNode;
}) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableHead
        scope="row"
        className={cn(
          "sticky left-0 z-10 w-36 bg-muted align-top whitespace-normal",
          strong && "text-foreground",
        )}
      >
        {label}
      </TableHead>
      {children}
    </TableRow>
  );
}

function Money({ cents, strong }: { cents: number; strong?: boolean }) {
  return (
    <TableCell className={cn("tabular-nums", strong && "font-semibold")}>
      {formatRands(cents)}
    </TableCell>
  );
}

function ArtisanName({ artisan }: { artisan: ClientQuote["artisan"] }) {
  return artisan.publicName ? (
    <Link
      to="/artisans/$artisanId"
      params={{ artisanId: artisan.artisanId }}
      target="_blank"
      className="font-semibold text-foreground hover:underline"
    >
      {artisan.publicName}
    </Link>
  ) : (
    <span className="font-semibold text-foreground">{q.noName}</span>
  );
}

function Badges({ badges }: { badges: ClientQuote["artisan"]["badges"] }) {
  if (badges.length === 0) return <span className="text-muted-foreground">{q.noBadges}</span>;
  return (
    <div className="flex flex-col items-start gap-1">
      {badges.map((badge) => (
        <Badge key={`${badge.kind}:${badge.category ?? ""}`} variant="outline">
          <ShieldCheck />
          {badge.name}
        </Badge>
      ))}
    </div>
  );
}

/** Hire (the one primary action), then Message, and Decline and Report in a menu. */
function QuoteActions({
  jobId,
  quote,
  hiring,
  onHire,
  conversationId,
}: {
  jobId: string;
  quote: ClientQuote;
  hiring: boolean;
  onHire: () => void;
  conversationId: string | undefined;
}) {
  const confirm = useConfirm();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  async function decline() {
    if (!(await confirm(q.declineConfirm))) return;
    setBusy(true);
    setRefusal(null);
    const result = await declineQuote({ data: { quoteId: quote.quoteId } });
    if (!result.ok) setRefusal(result.refusal.message);
    await router.invalidate();
    setBusy(false);
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        variant={hiring ? "secondary" : "default"}
        disabled={quote.startPassed}
        onClick={onHire}
      >
        {q.hire}
      </Button>
      <div className="flex flex-wrap items-center gap-1">
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
      </div>
      <Refusal message={refusal} />
    </div>
  );
}

/**
 * Hiring a Quote: the Payment as lines, the Protection Fee to tick, and one
 * Pay button, which opens the checkout; the Hire happens when the money arrives.
 */
function Checkout({ quote }: { quote: ClientQuote }) {
  const router = useRouter();
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

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

  return (
    <Card className="max-w-lg ring-primary">
      <CardHeader>
        <CardDescription className="text-xs font-medium text-primary">{q.checkout}</CardDescription>
        <CardTitle className="text-lg font-semibold">{q.hireTitle}</CardTitle>
        <CardDescription>{quote.artisan.publicName ?? q.noName}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <MoneyLines
          lines={[
            { label: t.labourShort, cents: quote.labourCents },
            { label: t.materialsShort, cents: quote.materialsCents },
            { label: q.quoteTotal, cents: quote.totalCents },
            { label: q.hireFee(PROTECTION_FEE_PERCENT), cents: quote.protectionFeeCents },
            { label: q.hirePayment, cents: quote.paymentCents, total: true },
          ]}
        />
        <Label className="items-start gap-2 leading-snug font-normal">
          <Checkbox
            checked={acknowledged}
            onCheckedChange={(checked) => setAcknowledged(checked)}
          />
          {q.hireAcknowledge(formatRands(quote.protectionFeeCents))}
        </Label>
        <Refusal message={refusal} />
        <Button
          size="lg"
          className="w-full"
          disabled={busy || !acknowledged}
          onClick={() => void pay()}
        >
          {q.hirePay(formatRands(quote.paymentCents))}
        </Button>
        <p className="text-xs text-muted-foreground">{q.hireLead}</p>
      </CardContent>
    </Card>
  );
}
