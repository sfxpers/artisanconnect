// PROTOTYPE: pieces both Job page variants share. The variants differ in where these sit.
import { useState } from "react";
import { CircleCheck, Clock, MapPin, Paperclip, Send, ShieldCheck, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  ARTISAN,
  CLIENT,
  JOB,
  QUOTES,
  rand,
  type JobView,
  type Message,
  type MoneyLine,
  type QuoteCard,
  type RecordRow,
} from "./data";

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export function Stars({ rating }: { rating: number | null }) {
  if (rating === null) return <span className="text-xs text-muted-foreground">No reviews yet</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <Star className="size-3.5 fill-current" />
      {rating.toFixed(1)}
    </span>
  );
}

export function JobMeta() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
      <span>{JOB.category}</span>
      <span className="inline-flex items-center gap-1">
        <MapPin className="size-3.5" />
        {JOB.suburb}, {JOB.region}
      </span>
      <span>{JOB.siteType}</span>
    </div>
  );
}

export function StatusBadge({ v }: { v: JobView }) {
  const label = v.engagement ?? `Job ${v.jobStatus}`;
  const tone =
    label === "Disputed" ? "destructive" : label === "Completed" ? "secondary" : "default";
  return <Badge variant={tone}>{label}</Badge>;
}

// ---------- Now ----------

export function NowCard({ v, className }: { v: JobView; className?: string }) {
  const n = v.now;
  return (
    <Card className={cn("ring-2 ring-primary/80", className)}>
      <CardHeader>
        <CardDescription>Next step</CardDescription>
        <CardTitle className="text-lg">{n.heading}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {v.clock && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" />
                {v.clock.label}
              </span>
              <span>{v.clock.remaining}</span>
            </div>
            <Progress value={v.clock.elapsed * 100} />
          </div>
        )}
        <div className="space-y-1 text-sm text-muted-foreground">
          {n.lines.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
        <NowForm v={v} />
      </CardContent>
      {n.actions.length > 0 && (
        <CardFooter className="flex flex-wrap gap-2">
          {n.actions.map((a) => (
            <Button
              key={a.label}
              size="lg"
              variant={
                a.tone === "primary" ? "default" : a.tone === "danger" ? "destructive" : "outline"
              }
            >
              {a.label}
            </Button>
          ))}
        </CardFooter>
      )}
    </Card>
  );
}

function NowForm({ v }: { v: JobView }) {
  switch (v.now.panel) {
    case "quotes":
      return <QuoteCards quotes={v.quotes} />;
    case "own-quote":
      return <QuoteBreakdown q={v.quotes[0]} />;
    case "pay":
      return (
        <div className="space-y-3 rounded-lg border p-4">
          <Row label="Labour" value={rand(4200)} />
          <Row label="Materials" value={rand(6800)} />
          <Row label="Protection Fee (5%)" value={rand(550)} muted />
          <Separator />
          <Row label="Total due now" value={rand(11550)} strong />
          <div className="flex items-start gap-2 pt-1">
            <Checkbox id="fee" />
            <Label htmlFor="fee" className="text-xs leading-snug font-normal text-muted-foreground">
              I understand the Protection Fee is non-refundable.
            </Label>
          </div>
        </div>
      );
    case "completion":
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>What was done</Label>
            <Textarea placeholder="New geyser fitted, valves and drip tray installed…" />
          </div>
          <div className="space-y-1.5">
            <Label>After-work photos (1 to 10)</Label>
            <div className="flex gap-2">
              <div className="grid size-16 place-items-center rounded-md border border-dashed text-muted-foreground">
                +
              </div>
            </div>
          </div>
        </div>
      );
    case "approve":
      return (
        <div className="space-y-3 rounded-lg border p-4">
          <p className="text-sm">
            “New 150L geyser fitted, valve set and drip tray installed, overflow rerouted outside.”
          </p>
          <div className="flex gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="size-16 rounded-md bg-muted" />
            ))}
          </div>
        </div>
      );
    case "dispute-status":
      return (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
            <div className="text-xs text-muted-foreground">Held for the Admin</div>
            <div className="text-lg font-semibold tabular-nums">{rand(2000)}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">Releases at Approval</div>
            <div className="text-lg font-semibold tabular-nums">{rand(2200)}</div>
          </div>
        </div>
      );
    case "review":
      return (
        <div className="space-y-3">
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star
                key={n}
                className={cn("size-7", n <= 4 ? "fill-current" : "text-muted-foreground")}
              />
            ))}
          </div>
          <Textarea placeholder="Add a comment (optional)" />
        </div>
      );
    default:
      return null;
  }
}

function Row({
  label,
  value,
  muted,
  strong,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex justify-between text-sm",
        muted && "text-muted-foreground",
        strong && "font-semibold",
      )}
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

// ---------- Quotes ----------

function QuoteBreakdown({ q }: { q: QuoteCard }) {
  return (
    <div className="space-y-2 rounded-lg border p-4 text-sm">
      <Row label="Labour" value={rand(q.labour)} />
      <Row label="Materials" value={q.materials ? rand(q.materials) : "Client supplies"} />
      <Separator />
      <Row label="Total" value={rand(q.labour + q.materials)} strong />
      <p className="pt-1 text-muted-foreground">{q.scope}</p>
    </div>
  );
}

export function QuoteCards({ quotes }: { quotes: QuoteCard[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="divide-y rounded-lg border">
      {quotes.map((q) => (
        <div key={q.id} className="space-y-3 p-4">
          <div className="flex items-start gap-3">
            <Avatar size="lg">
              <AvatarFallback>{initials(q.trading)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="font-medium">{q.trading}</div>
              <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                <Stars rating={q.rating} />
                <span>{q.completed} Jobs completed</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-semibold tabular-nums">
                {rand(q.labour + q.materials)}
              </div>
              <div className="text-xs text-muted-foreground">
                Starts {q.start} · {q.days}d
              </div>
            </div>
          </div>
          <p className={cn("text-sm text-muted-foreground", open !== q.id && "line-clamp-1")}>
            {q.scope}
          </p>
          {open === q.id && (
            <div className="flex flex-wrap gap-1.5">
              {q.badges.map((b) => (
                <Badge key={b} variant="outline">
                  <ShieldCheck />
                  {b}
                </Badge>
              ))}
              <Badge variant="secondary">Warranty: {q.warranty ?? "none"}</Badge>
            </div>
          )}
          <div className="flex gap-2">
            <Button size="sm">Hire</Button>
            <Button size="sm" variant="outline">
              Message
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(open === q.id ? null : q.id)}>
              {open === q.id ? "Less" : "Details"}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- People ----------

export function CounterpartCard({ v }: { v: JobView }) {
  const isClient = v.viewer === "client";
  const name = isClient ? ARTISAN.trading : CLIENT.short;
  const q = QUOTES[0];
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{isClient ? "Your Artisan" : "Your Client"}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          <Avatar size="lg">
            <AvatarFallback>{initials(name)}</AvatarFallback>
          </Avatar>
          <div>
            <div className="font-medium">{name}</div>
            {isClient ? (
              <div className="flex gap-3 text-xs text-muted-foreground">
                <Stars rating={q.rating} />
                <span>{q.completed} completed</span>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">Client since Sep 2026</div>
            )}
          </div>
        </div>
        {isClient && (
          <div className="flex flex-wrap gap-1.5">
            {q.badges.map((b) => (
              <Badge key={b} variant="outline">
                <ShieldCheck />
                {b}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Money ----------

function moneyTone(l: MoneyLine) {
  if (l.state === "Released") return "secondary" as const;
  if (l.state.startsWith("Held")) return "destructive" as const;
  return "outline" as const;
}

/** Materials and Labour as two numbered payments, like milestones. */
export function PaymentSteps({ v }: { v: JobView }) {
  if (!v.money) return null;
  const parts = v.money.filter((l) => l.label !== "Protection Fee");
  return (
    <div className="space-y-3">
      {parts.map((l, i) => (
        <div key={l.label} className="flex items-start gap-3">
          <div
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-full border text-xs",
              l.state === "Released" && "border-primary bg-primary text-primary-foreground",
            )}
          >
            {l.state === "Released" ? <CircleCheck className="size-4" /> : i + 1}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{l.label}</span>
              <span className="font-medium tabular-nums">{rand(l.amount)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {l.note ??
                  (l.label === "Materials" ? "Released at Work started" : "Released at Approval")}
                {l.net !== undefined && ` · you receive ${rand(l.net)}`}
              </span>
              <Badge variant={moneyTone(l)}>{l.state}</Badge>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function MoneySummary({ v }: { v: JobView }) {
  if (!v.money)
    return <p className="text-sm text-muted-foreground">Nothing is paid until you Hire.</p>;
  const sum = (pred: (l: MoneyLine) => boolean) =>
    v
      .money!.filter((l) => l.label !== "Protection Fee" && pred(l))
      .reduce((a, l) => a + l.amount, 0);
  const total = sum(() => true);
  const released = sum((l) => l.state === "Released");
  const refunded = sum((l) => l.state === "Refunded");
  return (
    <div className="space-y-2 text-sm">
      <Row label={v.viewer === "client" ? "Paid in" : "Job value"} value={rand(total)} />
      <Row label="Released" value={rand(released)} />
      <Row label="Not yet released" value={rand(total - released - refunded)} />
      {refunded > 0 && <Row label="Refunded" value={rand(refunded)} />}
      {v.viewer === "client" && (
        <Row label="Protection Fee (non-refundable)" value={rand(550)} muted />
      )}
      <Progress value={(released / total) * 100} className="pt-1" />
    </div>
  );
}

// ---------- Activity and messages ----------

export function EventLine({ row }: { row: RecordRow }) {
  return (
    <div className="flex gap-3 text-sm">
      <div className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
      <div className="min-w-0">
        <span className="font-medium">{row.title}</span>
        {row.detail && <span className="text-muted-foreground"> · {row.detail}</span>}
        <div className="text-xs text-muted-foreground">{row.at}</div>
      </div>
    </div>
  );
}

export function MessageLine({ m, viewer }: { m: Message; viewer: "client" | "artisan" }) {
  const name = m.from === "client" ? CLIENT.short : ARTISAN.trading;
  const mine = m.from === viewer;
  return (
    <div className="flex gap-3">
      <Avatar size="sm">
        <AvatarFallback>{initials(name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 text-sm">
          <span className="font-medium">{mine ? "You" : name}</span>
          <span className="text-xs text-muted-foreground">{m.at}</span>
        </div>
        {m.text && <p className="text-sm">{m.text}</p>}
        {m.attachment && (
          <span className="mt-1 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
            <Paperclip className="size-3" />
            {m.attachment}
          </span>
        )}
      </div>
    </div>
  );
}

/** Messages and the non-speech rows, in time order. */
export function stream(v: JobView) {
  const key = (at: string) => {
    const m = at.match(/(\d+) (Sep|Oct) (\d+):(\d+)/);
    return m
      ? (Number(m[1]) + (m[2] === "Oct" ? 30 : 0)) * 1440 + Number(m[3]) * 60 + Number(m[4])
      : 0;
  };
  return [
    ...v.record
      .filter((r) => r.inConversation)
      .map((row) => ({ kind: "event" as const, row, t: key(row.at) })),
    ...v.messages.map((m) => ({ kind: "msg" as const, m, t: key(m.at) })),
  ].sort((a, b) => a.t - b.t);
}

export function Composer({ v }: { v: JobView }) {
  if (v.composer.disabled)
    return <p className="text-center text-xs text-muted-foreground">{v.composer.disabled}</p>;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon">
          <Paperclip />
        </Button>
        <Input placeholder="Write a message…" defaultValue={v.composer.refused?.draft} />
        <Button size="icon">
          <Send />
        </Button>
      </div>
      {v.composer.refused && (
        <p className="text-xs text-destructive">{v.composer.refused.reason}</p>
      )}
    </div>
  );
}
