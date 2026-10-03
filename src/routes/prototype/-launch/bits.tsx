// PROTOTYPE: small shared pieces for /prototype/launch. Layout lives in each variant, not here.
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  JOB,
  QUOTES,
  UPDATED,
  rand,
  type Action,
  type Clock,
  type JobView,
  type LedgerRow,
  type Message,
  type MoneyLine,
  type NowPanel,
  type QuoteCard,
  type RecordRow,
} from "./data";

export function Pill({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "strong" | "warn" | "ok";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs whitespace-nowrap",
        tone === "muted" && "bg-muted text-muted-foreground",
        tone === "strong" && "border-foreground bg-foreground text-background",
        tone === "warn" && "border-dashed border-foreground",
        tone === "ok" && "border-foreground",
      )}
    >
      {children}
    </span>
  );
}

export function ClockBar({ clock, compact }: { clock: Clock; compact?: boolean }) {
  return (
    <div className={cn("w-full", compact ? "space-y-0.5" : "space-y-1")}>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{clock.label}</span>
        <span>{clock.remaining}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-foreground/70" style={{ width: `${clock.elapsed * 100}%` }} />
      </div>
    </div>
  );
}

export function Actions({ actions, stacked }: { actions: Action[]; stacked?: boolean }) {
  if (!actions.length) return null;
  return (
    <div className={cn("flex gap-2", stacked ? "flex-col" : "flex-wrap")}>
      {actions.map((a) => (
        <Button
          key={a.label}
          variant={
            a.tone === "primary" ? "default" : a.tone === "danger" ? "destructive" : "outline"
          }
          size="lg"
        >
          {a.label}
        </Button>
      ))}
    </div>
  );
}

export function MoneyLines({ lines, dense }: { lines: MoneyLine[]; dense?: boolean }) {
  return (
    <ul className={cn("divide-y", dense ? "text-xs" : "text-sm")}>
      {lines.map((l) => (
        <li
          key={l.label}
          className={cn("flex items-start justify-between gap-3", dense ? "py-1" : "py-2")}
        >
          <div>
            <div className="font-medium">{l.label}</div>
            {l.note && <div className="text-xs text-muted-foreground">{l.note}</div>}
          </div>
          <div className="text-right">
            <div className="tabular-nums">{rand(l.amount)}</div>
            <Pill
              tone={
                l.state === "Released"
                  ? "ok"
                  : l.state.startsWith("Held") || l.state.startsWith("Refunds")
                    ? "warn"
                    : "muted"
              }
            >
              {l.state}
            </Pill>
            {l.net !== undefined && (
              <div className="mt-0.5 text-xs text-muted-foreground">you get {rand(l.net)}</div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Ledger({ rows }: { rows: LedgerRow[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">No money has moved yet.</p>;
  return (
    <table className="w-full text-sm">
      <tbody className="divide-y">
        {rows.map((r, i) => (
          <tr key={i}>
            <td className="py-1.5 pr-2 text-xs whitespace-nowrap text-muted-foreground">{r.at}</td>
            <td className="py-1.5 pr-2">{r.what}</td>
            <td className="py-1.5 text-right tabular-nums">
              {r.direction === "fee" ? "−" : ""}
              {rand(r.amount)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const actorLabel = { client: "Client", artisan: "Artisan", platform: "ArtisanConnect" } as const;

export function RecordItem({ row }: { row: RecordRow }) {
  return (
    <div className="flex gap-3">
      <div className="mt-1.5 size-2 shrink-0 rounded-full bg-foreground/60" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium">{row.title}</span>
          <span className="text-xs text-muted-foreground">
            {actorLabel[row.actor]} · {row.at}
          </span>
        </div>
        {row.detail && <div className="text-sm text-muted-foreground">{row.detail}</div>}
      </div>
    </div>
  );
}

export function Bubble({ m, viewer }: { m: Message; viewer: "client" | "artisan" }) {
  const mine = m.from === viewer;
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
          mine ? "bg-foreground text-background" : "bg-muted",
        )}
      >
        {m.text && <p>{m.text}</p>}
        {m.attachment && <p className="italic opacity-80">[{m.attachment}]</p>}
        <p className="mt-0.5 text-[10px] opacity-60">{m.at}</p>
      </div>
    </div>
  );
}

export function EventRow({ row }: { row: RecordRow }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <div className="h-px flex-1 bg-border" />
      <span className="text-center">
        <b className="font-medium text-foreground">{row.title}</b>
        {row.detail ? ` · ${row.detail}` : ""} · {row.at}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

/** Messages and non-speech event rows, merged in time order (fixture order is close enough). */
export function conversationStream(
  v: JobView,
): ({ kind: "msg"; m: Message } | { kind: "event"; row: RecordRow })[] {
  const events = v.record
    .filter((r) => r.inConversation)
    .map((row) => ({ kind: "event" as const, row, t: sortKey(row.at) }));
  const msgs = v.messages.map((m) => ({ kind: "msg" as const, m, t: sortKey(m.at) }));
  return [...events, ...msgs].sort((a, b) => a.t - b.t);
}

function sortKey(at: string) {
  const m = at.match(/(\d+) (Sep|Oct) (\d+):(\d+)/);
  if (!m) return 0;
  const day = Number(m[1]) + (m[2] === "Oct" ? 30 : 0);
  return day * 1440 + Number(m[3]) * 60 + Number(m[4]);
}

export function Composer({ v }: { v: JobView }) {
  if (v.composer.disabled)
    return <p className="text-center text-xs text-muted-foreground">{v.composer.disabled}</p>;
  const paid = v.engagement !== null;
  return (
    <div className="space-y-1">
      <div className="flex items-end gap-2">
        <textarea
          className="min-h-9 flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm"
          rows={1}
          defaultValue={v.composer.refused?.draft ?? ""}
          placeholder="Write a message"
        />
        <Button variant="outline" size="icon" title={paid ? "Photo, PDF, or voice note" : "Photo"}>
          +
        </Button>
        <Button>Send</Button>
      </div>
      {v.composer.refused && (
        <p className="text-xs text-destructive">{v.composer.refused.reason}</p>
      )}
      <p className="text-[10px] text-muted-foreground">
        {paid ? "Text, photos, PDFs, voice notes. No video." : "Text and photos until Payment."}
      </p>
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

const input = "w-full rounded-md border bg-background px-2.5 py-1.5 text-sm";

export function QuoteSummary({ q, open }: { q: QuoteCard; open?: boolean }) {
  return (
    <div className="space-y-1 text-sm">
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-4">
        <span className="text-muted-foreground">Labour</span>
        <span className="tabular-nums">{rand(q.labour)}</span>
        <span className="text-muted-foreground">Materials</span>
        <span className="tabular-nums">{q.materials ? rand(q.materials) : `Client supplies`}</span>
        <span className="text-muted-foreground">Start</span>
        <span>{q.start}</span>
        <span className="text-muted-foreground">Duration</span>
        <span>
          {q.days} day{q.days > 1 ? "s" : ""}
        </span>
      </div>
      {open && (
        <>
          <p className="text-muted-foreground">{q.scope}</p>
          <p className="text-xs">Warranty: {q.warranty ?? "none"} (the Artisan's promise)</p>
          <div className="flex flex-wrap gap-1">
            {q.badges.map((b) => (
              <Pill key={b}>{b}</Pill>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function QuoteList({ quotes }: { quotes: QuoteCard[] }) {
  const [open, setOpen] = useState<string | null>(quotes[0]?.id ?? null);
  return (
    <div className="divide-y rounded-lg border">
      {quotes.map((q) => {
        const isOpen = open === q.id;
        return (
          <div key={q.id} className="p-3">
            <button
              className="flex w-full items-center justify-between gap-2 text-left"
              onClick={() => setOpen(isOpen ? null : q.id)}
            >
              <div>
                <div className="font-medium">{q.trading}</div>
                <div className="text-xs text-muted-foreground">
                  {q.rating ? `${q.rating} ★` : "No reviews yet"} · {q.completed} Completed
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold tabular-nums">{rand(q.labour + q.materials)}</div>
                <div className="text-xs text-muted-foreground">{isOpen ? "▲" : "▼"}</div>
              </div>
            </button>
            {isOpen && (
              <div className="mt-2 space-y-2">
                <QuoteSummary q={q} open />
                <div className="flex gap-2">
                  <Button>Hire for {rand(Math.round((q.labour + q.materials) * 1.05))}</Button>
                  <Button variant="outline">Message</Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The panel body for a Now block. Each variant decides where it sits. */
export function NowBody({ panel, v }: { panel: NowPanel; v: JobView }) {
  switch (panel) {
    case "post":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Service Category">
            <select className={input} defaultValue={JOB.category}>
              <option>{JOB.category}</option>
            </select>
          </Field>
          <Field label="Suburb" hint={`Region: ${JOB.region}`}>
            <input className={input} defaultValue={JOB.suburb} />
          </Field>
          <Field label="Title">
            <input className={input} defaultValue={JOB.title} />
          </Field>
          <Field label="Site type">
            <select className={input} defaultValue={JOB.siteType}>
              <option>Home</option>
              <option>Business</option>
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="What needs doing">
              <textarea className={input} rows={3} defaultValue={JOB.description} />
            </Field>
          </div>
          <Field label="Photos" hint="Up to 10. JPEG, PNG, WebP, 10 MB each.">
            <div className="flex gap-1">
              {Array.from({ length: JOB.photos }).map((_, i) => (
                <div key={i} className="size-10 rounded bg-muted" />
              ))}
              <div className="grid size-10 place-items-center rounded border border-dashed text-muted-foreground">
                +
              </div>
            </div>
          </Field>
          <Field label="Who sees it" hint="Invite only: no Batches, only the Artisans you invite.">
            <select className={input}>
              <option>Offer it in Batches</option>
              <option>Invite only</option>
            </select>
          </Field>
        </div>
      );
    case "quotes":
      return <QuoteList quotes={v.quotes} />;
    case "pay": {
      const q = QUOTES[0];
      return (
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>
              Quote (Labour {rand(q.labour)} + Materials {rand(q.materials)})
            </span>
            <span className="tabular-nums">{rand(11000)}</span>
          </div>
          <div className="flex justify-between">
            <span>Protection Fee (5%)</span>
            <span className="tabular-nums">{rand(550)}</span>
          </div>
          <div className="flex justify-between border-t pt-2 font-semibold">
            <span>You pay now</span>
            <span className="tabular-nums">{rand(11550)}</span>
          </div>
          <div className="flex gap-2">
            <Pill tone="ok">Card</Pill>
            <Pill>Instant EFT</Pill>
          </div>
          <label className="flex items-start gap-2 text-xs">
            <input type="checkbox" className="mt-0.5" />
            <span>I understand the Protection Fee is non-refundable.</span>
          </label>
          <p className="text-xs text-muted-foreground">
            Materials are released at Work started; Labour at your Approval, or 7 days after
            Completion.
          </p>
        </div>
      );
    }
    case "write-quote":
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Labour">
            <input className={input} defaultValue="4200" />
          </Field>
          <Field label="Materials" hint="Zero if the Client supplies them">
            <input className={input} defaultValue="6800" />
          </Field>
          <Field label="Total" hint="At least R300; valid 14 days">
            <div className="py-1.5 font-semibold">{rand(11000)}</div>
          </Field>
          <Field label="Start date">
            <input className={input} defaultValue="Mon 29 Sep" />
          </Field>
          <Field label="Duration (days)">
            <input className={input} defaultValue="2" />
          </Field>
          <Field label="Warranty (optional)">
            <input className={input} defaultValue="12 months on workmanship" />
          </Field>
          <div className="sm:col-span-3">
            <Field label="Scope">
              <textarea className={input} rows={2} defaultValue={QUOTES[0].scope} />
            </Field>
          </div>
        </div>
      );
    case "own-quote":
      return <QuoteSummary q={v.quotes[0]} open />;
    case "completion":
      return (
        <div className="space-y-3">
          <Field label="Note">
            <textarea className={input} rows={2} placeholder="What was done" />
          </Field>
          <Field label="After-work photos" hint="1 to 10">
            <div className="grid size-10 place-items-center rounded border border-dashed text-muted-foreground">
              +
            </div>
          </Field>
          <Field
            label="Completion evidence"
            hint="Only an Electrical Job, or a Plumbing Job with gas, needs a certificate."
          >
            <span className="text-sm text-muted-foreground">Not needed for this Job.</span>
          </Field>
        </div>
      );
    case "refund":
      return (
        <Field label="Amount" hint={`Unreleased: up to ${rand(3700)} of Labour`}>
          <input className={input} defaultValue="500" />
        </Field>
      );
    case "updated-quote-review":
    case "updated-quote-pending":
      return (
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="text-left font-normal" />
              <th className="text-right font-normal">Hired</th>
              <th className="text-right font-normal">Updated</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Labour</td>
              <td className="text-right tabular-nums">{rand(4200)}</td>
              <td className="text-right tabular-nums">{rand(UPDATED.labour)}</td>
            </tr>
            <tr>
              <td>Materials</td>
              <td className="text-right tabular-nums">{rand(6800)}</td>
              <td className="text-right tabular-nums">{rand(UPDATED.materials)}</td>
            </tr>
            <tr className="border-t">
              <td>Difference</td>
              <td />
              <td className="text-right tabular-nums">{rand(1200)}</td>
            </tr>
            {panel === "updated-quote-review" && (
              <tr>
                <td>Protection Fee (5%)</td>
                <td />
                <td className="text-right tabular-nums">{rand(60)}</td>
              </tr>
            )}
          </tbody>
        </table>
      );
    case "approve":
      return (
        <div className="space-y-2 text-sm">
          <p className="text-muted-foreground">
            Sipho's note: “New geyser fitted, valve set and drip tray installed, overflow rerouted.”
          </p>
          <div className="flex gap-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="size-12 rounded bg-muted" />
            ))}
          </div>
          <details className="rounded-md border p-2">
            <summary className="cursor-pointer text-xs font-medium">
              Dispute a part of the Labour
            </summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Field label="Amount" hint={`Up to ${rand(4200)}. The rest is released.`}>
                <input className={input} defaultValue="2000" />
              </Field>
              <Field label="Reason">
                <input className={input} placeholder="What isn't right" />
              </Field>
            </div>
          </details>
        </div>
      );
    case "dispute-status":
      return (
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-md border border-dashed p-2">
            <div className="text-xs text-muted-foreground">Held in Dispute</div>
            <div className="font-semibold tabular-nums">{rand(2000)}</div>
          </div>
          <div className="rounded-md border p-2">
            <div className="text-xs text-muted-foreground">Releases at Approval</div>
            <div className="font-semibold tabular-nums">{rand(2200)}</div>
          </div>
        </div>
      );
    case "review":
      return (
        <div className="space-y-2">
          <div className="flex gap-1 text-2xl">
            {[1, 2, 3, 4, 5].map((n) => (
              <span key={n} className={n <= 4 ? "" : "opacity-30"}>
                {"★"}
              </span>
            ))}
          </div>
          <textarea className={input} rows={2} placeholder="Comment (optional)" />
        </div>
      );
    case "none":
      return null;
  }
}

export function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-2", className)}>
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function Placeholder({ label, className }: { label: string; className?: string }) {
  return (
    <div
      className={cn(
        "grid place-items-center rounded-md border border-dashed bg-muted/50 text-xs text-muted-foreground",
        className,
      )}
    >
      {label}
    </div>
  );
}
