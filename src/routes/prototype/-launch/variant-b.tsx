// PROTOTYPE, throwaway. Variant B, "Job record": every Job is one page.
// The left is the Job's record, oldest first, ending in the one thing to do now.
// The Conversation is docked on the right, and the records (Quote, dates, Payment,
// Completion, Release) appear inside it as non-speech rows.
// Off a Job, everything is a stream: the Artisan's home and the notices are one feed.
import { useState, type ReactNode } from "react";
import {
  BadgeCheck,
  Banknote,
  CalendarCheck,
  ChevronDown,
  CircleAlert,
  FileCheck2,
  FilePlus2,
  Hammer,
  MessageSquare,
  Scale,
  Send,
  Star,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import * as F from "./fixtures";
import * as H from "./hooks";

const ink = "text-stone-900";
const field = "w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-900";

export function VariantB({ screen, go }: H.VariantProps) {
  return (
    <div className={`min-h-svh bg-stone-100 pb-24 ${ink}`}>
      <header className="border-b border-stone-300 bg-stone-100/90 px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex items-center gap-4">
          <span className="font-serif text-lg italic">ArtisanConnect</span>
          <span className="text-xs text-stone-500">{F.screenOf(screen).who === "Visitor" ? "Visitor" : F.screenOf(screen).who === "Artisan" ? "Sipho Ndlovu" : "Thandi M."}</span>
          <button type="button" onClick={() => go("notices")} className="ml-auto text-xs underline">
            Activity
          </button>
        </div>
      </header>
      {screen === "profile" && <Profile />}
      {screen === "post" && <PostDraft />}
      {(screen === "quotes" ||
        screen === "conversation" ||
        screen === "engagement" ||
        screen === "completion" ||
        screen === "release" ||
        screen === "dispute" ||
        screen === "review") && <JobRecord screen={screen} />}
      {screen === "verification" && <Verification />}
      {screen === "home" && <Stream side="Artisan" />}
      {screen === "notices" && <Stream side="Client" />}
    </div>
  );
}

// ---------- the record ----------

type Rec = { at: string; icon: ReactNode; title: string; body?: ReactNode; who?: "Client" | "Artisan" | "Platform" };

const RECORDS: Rec[] = [
  { at: "2 Oct, 18:20", icon: <FilePlus2 />, title: "Job posted, Open", body: "Plumbing · gas work: yes · Southern · Home", who: "Client" },
  { at: "3 Oct, 09:12", icon: <Send />, title: "Quote from Sipho Ndlovu · R12,000", who: "Artisan" },
  { at: "3 Oct, 11:40", icon: <Send />, title: "Quote from Ayanda Khumalo · R10,450", who: "Artisan" },
  { at: "4 Oct, 08:05", icon: <Send />, title: "Quote from Pieter van Wyk · R13,900, revised", who: "Artisan" },
  { at: "4 Oct, 10:30", icon: <CalendarCheck />, title: "You sent dates to Sipho: 12 Oct, 2 days", who: "Client" },
  { at: "4 Oct, 12:15", icon: <BadgeCheck />, title: "Sipho confirmed. Quote Accepted, Artisan Chosen", body: "Ayanda's and Pieter's Quotes are Not chosen.", who: "Artisan" },
  { at: "6 Oct, 14:03", icon: <Banknote />, title: "Payment R12,300. Engagement begun, Paid", body: "Quote R12,000 + Protection Fee R300", who: "Client" },
  { at: "12 Oct, 11:20", icon: <FilePlus2 />, title: "Sipho proposed an Updated Quote: R12,850", who: "Artisan" },
  { at: "12 Oct, 13:00", icon: <X />, title: "You rejected the Updated Quote. R12,000 stands", who: "Client" },
  { at: "14 Oct, 16:20", icon: <Hammer />, title: "Sipho stated Completion", body: "Note, 3 after-work photos, certificate of conformity", who: "Artisan" },
  { at: "15 Oct, 08:45", icon: <Banknote />, title: "You Released R6,000", who: "Client" },
  { at: "16 Oct, 10:00", icon: <Scale />, title: "You opened a Dispute on R2,500. Disputed", who: "Client" },
  { at: "17 Oct, 09:10", icon: <Banknote />, title: "Return of R1,200 agreed. You Released R1,300", who: "Client" },
  { at: "17 Oct, 16:20", icon: <Banknote />, title: "R3,500 Released by silence. Completed", who: "Platform" },
];

const SHOWN: Record<string, number> = { quotes: 5, conversation: 5, engagement: 7, completion: 7, release: 11, dispute: 12, review: 14 };
const STATUS: Record<string, string> = {
  quotes: "Open",
  conversation: "Open",
  engagement: "Paid",
  completion: "Paid",
  release: "Awaiting release",
  dispute: "Disputed",
  review: "Completed",
};
const STAGES = ["Open", "Artisan Chosen", "Paid", "Awaiting release", "Completed"];

function JobRecord({ screen }: { screen: F.ScreenKey }) {
  const [showOld, setShowOld] = useState(false);
  const [convoOpen, setConvoOpen] = useState(screen === "conversation");
  const recs = RECORDS.slice(0, SHOWN[screen]);
  const keep = 3;
  const hidden = showOld ? 0 : Math.max(0, recs.length - keep);
  const status = STATUS[screen];
  const viewer = screen === "completion" ? "Artisan" : "Client";
  const stageIdx = STAGES.indexOf(status === "Disputed" ? "Awaiting release" : status);

  return (
    <div className="mx-auto grid max-w-7xl gap-0 lg:grid-cols-[1fr_400px]">
      <main className="px-4 py-6 sm:px-8">
        <p className="text-xs tracking-wide text-stone-500 uppercase">Job · {viewer === "Artisan" ? "Client Thandi M." : "with Sipho Ndlovu"}</p>
        <h1 className="mt-1 font-serif text-3xl">{F.job.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-1 text-xs">
          {STAGES.map((s, i) => (
            <span key={s} className="flex items-center gap-1">
              <span
                className={`rounded-full px-2 py-0.5 ${
                  s === status || (status === "Disputed" && s === "Awaiting release")
                    ? "bg-stone-900 text-white"
                    : i < stageIdx
                      ? "bg-stone-300 text-stone-700"
                      : "text-stone-400"
                }`}
              >
                {status === "Disputed" && s === "Awaiting release" ? "Disputed" : s}
              </span>
              {i < STAGES.length - 1 && <span className="text-stone-300">—</span>}
            </span>
          ))}
        </div>

        <ol className="relative mt-8 border-l border-stone-300 pl-6">
          {hidden > 0 && (
            <li className="mb-6">
              <button type="button" onClick={() => setShowOld(true)} className="flex items-center gap-1 text-xs text-stone-500 underline">
                <ChevronDown className="size-3" /> {hidden} earlier records
              </button>
            </li>
          )}
          {recs.slice(hidden).map((r) => (
            <li key={r.at} className="relative mb-6">
              <span className="absolute top-0.5 -left-[35px] grid size-5 place-items-center rounded-full bg-stone-100 text-stone-500 ring-4 ring-stone-100 [&_svg]:size-4">
                {r.icon}
              </span>
              <p className="text-[11px] text-stone-500">{r.at}</p>
              <p className="text-sm font-medium">{r.title}</p>
              {r.body && <p className="text-xs text-stone-600">{r.body}</p>}
            </li>
          ))}
          <li className="relative">
            <span className="absolute top-1 -left-[33px] size-3 rounded-full bg-stone-900 ring-4 ring-stone-100" />
            <p className="mb-2 text-[11px] font-medium tracking-wide text-stone-500 uppercase">Now</p>
            <div className="rounded-xl border border-stone-300 bg-white p-5 shadow-sm">
              {(screen === "quotes" || screen === "conversation") && <NowQuotes onTalk={() => setConvoOpen(true)} />}
              {screen === "engagement" && <NowEngagement />}
              {screen === "completion" && <NowCompletion />}
              {screen === "release" && <NowRelease />}
              {screen === "dispute" && <NowDispute />}
              {screen === "review" && <NowReview />}
            </div>
          </li>
        </ol>
      </main>

      <button
        type="button"
        onClick={() => setConvoOpen((v) => !v)}
        className="fixed right-4 bottom-20 z-20 flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2 text-sm text-white shadow-lg lg:hidden"
      >
        <MessageSquare className="size-4" /> Conversation
      </button>
      <aside
        className={`${convoOpen ? "fixed inset-0 z-30 flex" : "hidden"} flex-col border-stone-300 bg-white lg:sticky lg:top-0 lg:flex lg:h-svh lg:border-l`}
      >
        <ConversationPanel screen={screen} viewer={viewer} onClose={() => setConvoOpen(false)} />
      </aside>
    </div>
  );
}

function ConversationPanel({ screen, viewer, onClose }: { screen: F.ScreenKey; viewer: "Client" | "Artisan"; onClose: () => void }) {
  const c = H.useComposer(screen === "conversation" ? F.conversationDraft : "");
  const paid = !["quotes", "conversation"].includes(screen);
  const recRow = (t: string) => (
    <div className="my-3 flex items-center gap-2 text-[11px] text-stone-500">
      <span className="h-px flex-1 bg-stone-200" />
      {t}
      <span className="h-px flex-1 bg-stone-200" />
    </div>
  );
  const bubble = (m: F.Message, i: number) => {
    const mine = m.from === viewer;
    return (
      <div key={i} className={`flex ${mine ? "justify-end" : ""}`}>
        <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${mine ? "bg-stone-900 text-white" : "bg-stone-100"}`}>
          {m.text}
          <div className="mt-0.5 text-[10px] opacity-50">{m.at}</div>
        </div>
      </div>
    );
  };
  return (
    <>
      <div className="flex items-center gap-2 border-b border-stone-200 px-4 py-3">
        <MessageSquare className="size-4" />
        <span className="text-sm font-medium">{viewer === "Client" ? "Sipho Ndlovu" : "Thandi M."}</span>
        <button type="button" onClick={onClose} className="ml-auto lg:hidden">
          <X className="size-4" />
        </button>
      </div>
      <p className="bg-stone-50 px-4 py-2 text-[11px] text-stone-500">
        ArtisanConnect can read this Conversation for support, a report, or a Dispute.
        {!paid && " Contact details stay off it until Payment."}
      </p>
      <div className="flex-1 space-y-2 overflow-auto px-4 py-3">
        {recRow("Quote sent · R12,000")}
        {c.messages.slice(0, 2).map(bubble)}
        {c.messages.slice(2, 4).map((m, i) => bubble(m, i + 2))}
        {recRow("Dates sent · 12 Oct, 2 days")}
        {paid && (
          <>
            {recRow("Quote Accepted · dates confirmed")}
            {recRow("Payment · R12,300")}
            {bubble({ from: "Artisan", text: `Thanks Thandi. My number is ${F.engagement.contact.artisanPhone} for the day. See you on the 12th.`, at: "6 Oct, 14:30" }, 90)}
            {bubble({ from: "Client", text: "Gate code is 4471. Dog is friendly.", at: "6 Oct, 15:02" }, 91)}
          </>
        )}
        {["release", "dispute", "review"].includes(screen) && recRow("Completion · 14 Oct, 16:20")}
        {["dispute", "review"].includes(screen) && recRow("Dispute opened · R2,500 held")}
        {c.messages.slice(4).map((m, i) => bubble(m, i + 4))}
      </div>
      <div className="border-t border-stone-200 p-3">
        {c.refused && (
          <div className="mb-2 flex gap-2 rounded-md bg-stone-100 px-3 py-2 text-xs">
            <CircleAlert className="size-3.5 shrink-0" />
            Not sent, {c.refused}. Contact details can be shared here after Payment.
          </div>
        )}
        <div className="flex gap-2">
          <input className={field} value={c.draft} onChange={(e) => c.setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && c.send()} placeholder="Message" />
          <Button onClick={c.send}>Send</Button>
        </div>
      </div>
    </>
  );
}

// ---------- "Now" blocks ----------

function NowHead({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-4">
      <h2 className="font-serif text-xl">{children}</h2>
      {sub && <p className="mt-1 text-sm text-stone-600">{sub}</p>}
    </div>
  );
}

function Badges({ list }: { list: F.Badge[] }) {
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-stone-600">
      {list.map((b) => (
        <span key={b.name} className="inline-flex items-center gap-1">
          <BadgeCheck className="size-3 text-emerald-700" />
          {b.name}
          {b.validTo && <span className="text-stone-400">to {b.validTo}</span>}
        </span>
      ))}
    </span>
  );
}

function NowQuotes({ onTalk }: { onTalk: () => void }) {
  const q = H.useQuotes();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <NowHead sub={q.accepted ? "Pay within 7 × 24 hours of Sipho's confirmation, or the Job is Ended." : "3 of 5 Quotes. Choose one by entering your dates; the Artisan confirms them."}>
        {q.accepted ? `Pay ${q.accepted.artisan}` : "Choose a Quote"}
      </NowHead>
      {!q.accepted && (
        <div className="mb-3 flex gap-3 text-xs">
          <span className="text-stone-500">Arrange by</span>
          {(["sent", "total", "duration"] as const).map((k) => (
            <button key={k} type="button" onClick={() => q.setOrder(k)} className={q.order === k ? "font-semibold underline" : "text-stone-500"}>
              {k === "sent" ? "order sent" : k === "total" ? "total" : "duration estimate"}
            </button>
          ))}
        </div>
      )}
      <div className="divide-y divide-stone-200 border-y border-stone-200">
        {q.quotes.map((x) => {
          const total = F.quoteTotal(x);
          const isOpen = open === x.id;
          return (
            <div key={x.id} className={`py-3 ${x.status === "Not chosen" || x.status === "Declined" ? "opacity-50" : ""}`}>
              <button type="button" onClick={() => setOpen(isOpen ? null : x.id)} className="flex w-full items-baseline gap-3 text-left">
                <span className="flex-1">
                  <span className="font-medium">{x.artisan}</span>{" "}
                  <span className="text-xs text-stone-500">
                    {x.average ? `★ ${x.average} (${x.reviews})` : "no Reviews"} · {x.completedInCategory} Completed in Plumbing
                    {x.durationDays ? ` · ${x.durationDays} d` : ""}
                    {x.revised ? " · revised" : ""}
                  </span>
                </span>
                <span className="font-serif text-lg tabular-nums">{F.rand(total)}</span>
                <span className="w-20 text-right text-[11px] text-stone-500">{x.status}</span>
              </button>
              {isOpen && (
                <div className="mt-3 space-y-2 text-sm">
                  <Badges list={x.badges} />
                  <p className="text-stone-700">{x.scope}</p>
                  <p className="text-xs text-stone-600">
                    Labour {F.rand(x.labour)} · Materials {F.rand(x.materials)} ({x.supplies === "Both" ? "both supply" : `${x.supplies} supplies`}) ·{" "}
                    {x.warranty ?? "no Warranty"} · You'd pay {F.rand(total + F.pctOf(total, F.PROTECTION_FEE_PCT))} with the Protection Fee
                  </p>
                  {x.status === "Sent" && (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" disabled={!!q.pending} onClick={() => q.sendDates(x.id)}>
                        Enter dates for this Quote
                      </Button>
                      <Button size="sm" variant="outline" onClick={onTalk}>
                        Message
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => q.decline(x.id)}>
                        Decline
                      </Button>
                    </div>
                  )}
                </div>
              )}
              {q.pending?.quoteId === x.id && (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Your dates, {q.pending.start} for {q.pending.durationDays} days, wait for {x.artisan.split(" ")[0]} to confirm.
                  <button type="button" className="underline" onClick={q.cancelDates}>
                    cancel dates
                  </button>
                  <button type="button" className="text-violet-700 underline" onClick={q.artisanConfirms}>
                    (simulate confirm)
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {q.accepted && (
        <Button className="mt-4">Pay {F.rand(F.quoteTotal(q.accepted) + F.pctOf(F.quoteTotal(q.accepted), F.PROTECTION_FEE_PCT))}</Button>
      )}
    </>
  );
}

function NowEngagement() {
  const e = F.engagement;
  const total = e.updatedQuote.labour + e.updatedQuote.materials;
  const extra = total - e.quoteTotal;
  return (
    <>
      <NowHead sub={e.updatedQuote.scope}>Sipho proposes R{(total / 100).toLocaleString("en-US")}, up {F.rand(extra)}</NowHead>
      <p className="text-sm text-stone-700">
        Labour {F.rand(e.labour)} → {F.rand(e.updatedQuote.labour)}, Materials {F.rand(e.materials)} → {F.rand(e.updatedQuote.materials)}.
      </p>
      <p className="mt-2 text-sm text-stone-700">
        Accepting charges {F.rand(extra + F.pctOf(extra, F.PROTECTION_FEE_PCT))} now. The added work waits until then.
      </p>
      <div className="mt-4 flex gap-2">
        <Button>Accept and pay</Button>
        <Button variant="outline">Reject, keep R12,000</Button>
      </div>
      <div className="mt-6 grid gap-4 border-t border-stone-200 pt-4 text-xs text-stone-600 sm:grid-cols-3">
        <div>
          <p className="font-medium text-stone-900">Agreed dates</p>
          12 Oct, 2 days · <button type="button" className="underline">propose new dates</button>
        </div>
        <div>
          <p className="font-medium text-stone-900">Site and contact</p>
          {e.contact.site}
          <br />
          Sipho {e.contact.artisanPhone}
        </div>
        <div>
          <p className="font-medium text-stone-900">On the platform until</p>
          {e.protectedUntil}
          <br />
          <button type="button" className="text-red-700 underline">
            Cancel Engagement
          </button>
        </div>
      </div>
    </>
  );
}

function NowCompletion() {
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState(0);
  const [files, setFiles] = useState(0);
  const ok = note.trim() && photos > 0 && files > 0;
  return (
    <>
      <NowHead sub="Once stated, it can't be edited or withdrawn. It fixes price, scope, and Warranty. Thandi's 3 × 24 hours start.">
        State Completion
      </NowHead>
      <textarea rows={3} className={field} placeholder="Note to Thandi" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <Button variant="outline" size="sm" onClick={() => setPhotos((n) => n + 1)}>
          After-work photo {photos ? `(${photos})` : ""}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setFiles((n) => n + 1)}>
          <FileCheck2 /> Certificate of conformity {files ? `(${files})` : "· required, gas work"}
        </Button>
      </div>
      <Button className="mt-4" disabled={!ok}>
        State Completion
      </Button>
    </>
  );
}

function ClockBar({ marks }: { marks: { at: number; label: string; tone?: string }[] }) {
  return (
    <div className="relative mt-6 mb-8 h-1.5 rounded-full bg-stone-200">
      {marks.map((m) => (
        <div key={m.label} className="absolute -top-1" style={{ left: `${m.at}%` }}>
          <span className={`block size-3.5 -translate-x-1/2 rounded-full ring-2 ring-white ${m.tone ?? "bg-stone-900"}`} />
          <span
            className={`absolute top-5 text-[10px] whitespace-nowrap text-stone-600 ${m.at === 0 ? "-translate-x-1.5" : m.at === 100 ? "right-0 translate-x-1.5" : "-translate-x-1/2"}`}
          >
            {m.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function NowRelease() {
  const r = H.useRelease();
  return (
    <>
      <NowHead sub={`${F.rand(r.unreleased)} of the R12,000 Quote is unreleased.`}>Release to Sipho</NowHead>
      <ClockBar
        marks={[
          { at: 0, label: "Completion 14 Oct 16:20" },
          { at: 22, label: "Released R6,000" },
          { at: 45, label: "now", tone: "bg-sky-500" },
          { at: 100, label: "17 Oct 16:20 · rest Releases" },
        ]}
      />
      <input
        type="range"
        min={0}
        max={r.unreleased}
        step={10000}
        value={r.amount.cents}
        onChange={(e) => r.amount.setCents(Number(e.target.value))}
        className="w-full accent-stone-900"
      />
      <div className="mt-2 flex items-center gap-3">
        <span className="font-serif text-2xl tabular-nums">{F.rand(r.amount.cents)}</span>
        <Button disabled={!r.amount.valid} onClick={r.doRelease}>
          Release
        </Button>
        <span className="ml-auto text-xs text-stone-500">Releasing part doesn't move 17 Oct 16:20.</span>
      </div>
      <button type="button" className="mt-4 text-sm text-red-700 underline">
        Open a Dispute instead
      </button>
    </>
  );
}

function NowDispute() {
  const d = F.dispute;
  return (
    <>
      <NowHead sub={d.reason}>R2,500 held. Settle by {d.settleUntil}</NowHead>
      <ClockBar
        marks={[
          { at: 0, label: "opened 16 Oct 10:00", tone: "bg-red-600" },
          { at: 30, label: "now", tone: "bg-sky-500" },
          { at: 65, label: "17 Oct 16:20 · R3,500 not held Releases" },
          { at: 100, label: "18 Oct 10:00 · to an Admin", tone: "bg-red-600" },
        ]}
      />
      <div className="space-y-2 text-sm">
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-sky-50 px-3 py-2">
          Sipho offers to Return {F.rand(d.artisanReturnOffer)} (+{F.rand(F.pctOf(d.artisanReturnOffer, F.PROTECTION_FEE_PCT))} Protection Fee).
          <Button size="sm" className="ml-auto">
            Agree
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline">
            Release some of the R2,500
          </Button>
          <Button size="sm" variant="ghost">
            Withdraw Dispute
          </Button>
        </div>
        <p className="text-xs text-stone-500">
          No Cancel, no undoing the Completion, no rework. Whatever is still held at 18 Oct 10:00 an Admin splits, finally.
        </p>
      </div>
    </>
  );
}

function NowReview() {
  const r = H.useReview();
  if (r.submitted) return <NowHead sub={`Publishes when Sipho submits or on ${F.reviewWindow.closesAt}.`}>Review submitted</NowHead>;
  return (
    <>
      <NowHead sub={`Sealed until you both submit or ${F.reviewWindow.closesAt}. You won't know if Sipho has.`}>Review Sipho for Plumbing</NowHead>
      <div className="space-y-3">
        {F.REVIEW_DIMENSIONS.map((d) => (
          <div key={d.key} className="flex flex-wrap items-center gap-3">
            <span className="w-36 text-sm">{d.label}</span>
            <span className="flex">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => r.setScore(d.key, n)} aria-label={`${d.label} ${n}`}>
                  <Star className={`size-6 ${(r.scores[d.key] ?? 0) >= n ? "fill-stone-900 text-stone-900" : "text-stone-300"}`} />
                </button>
              ))}
            </span>
            <span className="text-[11px] text-stone-500">{d.hint}</span>
          </div>
        ))}
      </div>
      <textarea rows={2} className={`${field} mt-4`} placeholder="Comment (optional)" value={r.comment} onChange={(e) => r.setComment(e.target.value)} />
      {r.refused && <p className="mt-1 text-xs text-red-700">Not submitted, {r.refused}.</p>}
      <div className="mt-3 flex gap-2">
        <Button disabled={!r.canSubmit} onClick={r.submit}>
          Submit
        </Button>
        <Button variant="outline">Hire Sipho again</Button>
      </div>
    </>
  );
}

// ---------- off a Job ----------

function Profile() {
  const a = F.artisan;
  return (
    <article className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-xs tracking-wide text-stone-500 uppercase">Artisan</p>
      <h1 className="font-serif text-4xl">{a.publicName}</h1>
      <p className="mt-3 text-stone-700">{a.about}</p>
      <p className="mt-3 text-sm text-stone-600">
        Available for Jobs · works in {a.regions.join(", ")}
      </p>
      {a.categories.map((c) => (
        <section key={c.name} className="mt-10 border-t border-stone-300 pt-6">
          <div className="flex items-baseline gap-3">
            <h2 className="font-serif text-2xl">{c.name}</h2>
            <span className="text-sm text-stone-600">
              ★ {c.average} from {c.reviews} Reviews · {c.completed} Completed
            </span>
          </div>
          <div className="mt-3">
            <Badges list={c.badges} />
          </div>
          <div className="mt-4 flex gap-2 overflow-x-auto">
            {c.workPhotos.map((p) => (
              <div key={p} className="flex h-28 w-40 shrink-0 items-end rounded bg-stone-300 p-2 text-[10px] text-stone-600">
                {p}
              </div>
            ))}
          </div>
        </section>
      ))}
      <section className="mt-10 border-t border-stone-300 pt-6 text-sm text-stone-600">
        <p>
          <span className="text-stone-900">Also:</span> <Badges list={a.optionalBadges} />
        </p>
        <p className="mt-2">
          <span className="text-stone-900">In Sipho's words:</span> {a.services.join(" · ")}
        </p>
        <p className="mt-6 text-xs">
          Badges are checks ArtisanConnect completed, not promises about the work. No contact details before Payment. Clients
          with an Open Job can invite Sipho from that Job.
        </p>
      </section>
    </article>
  );
}

function PostDraft() {
  const p = H.usePostJob();
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8">
      <p className="text-xs tracking-wide text-stone-500 uppercase">New Job · {p.posted ? "Open" : "Draft"}</p>
      <input
        className="mt-1 w-full bg-transparent font-serif text-3xl outline-none placeholder:text-stone-400"
        placeholder="What needs doing?"
        value={p.title}
        onChange={(e) => p.setTitle(e.target.value)}
      />
      <div className="mt-3 flex flex-wrap items-center gap-1 text-xs text-stone-400">
        {["Draft", ...STAGES].map((s, i) => (
          <span key={s} className={i === 0 && !p.posted ? "rounded-full bg-stone-900 px-2 py-0.5 text-white" : i === 1 && p.posted ? "rounded-full bg-stone-900 px-2 py-0.5 text-white" : ""}>
            {s}
            {i < STAGES.length ? " —" : ""}
          </span>
        ))}
      </div>
      <div className="mt-6 rounded-xl border border-stone-300 bg-white p-5">
        <p className="text-sm leading-loose">
          I need{" "}
          <select className="rounded border-b-2 border-stone-900 bg-transparent font-medium outline-none" value={p.category} onChange={(e) => p.setCategory(e.target.value as F.Category)}>
            <option value="">a Service Category</option>
            {F.CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>{" "}
          at a{" "}
          {(["Home", "Business"] as const).map((v) => (
            <button key={v} type="button" onClick={() => p.setSiteType(v)} className={`mx-0.5 rounded px-1.5 ${p.siteType === v ? "bg-stone-900 text-white" : "bg-stone-100"}`}>
              {v}
            </button>
          ))}{" "}
          site at{" "}
          <input className="w-64 border-b-2 border-stone-900 outline-none" value={p.address} onChange={(e) => p.setAddress(e.target.value)} placeholder="street and suburb" />
          {p.region && p.region !== "unplaceable" && <span className="text-stone-500"> (Region: {p.region})</span>}
          {p.region === "unplaceable" && <span className="text-red-700"> (outside every open Region)</span>}.
        </p>
        {p.category === "Plumbing" && (
          <p className="mt-3 text-sm">
            It{" "}
            {[true, false].map((v) => (
              <button key={String(v)} type="button" onClick={() => p.setGas(v)} className={`mx-0.5 rounded px-1.5 ${p.gas === v ? "bg-stone-900 text-white" : "bg-stone-100"}`}>
                {v ? "does" : "does not"}
              </button>
            ))}{" "}
            include installing or removing a gas appliance, gas system, or gas reticulation.
          </p>
        )}
        {p.category === "Electrical" && (
          <label className="mt-3 flex gap-2 text-sm">
            <input type="checkbox" checked={p.ack} onChange={(e) => p.setAck(e.target.checked)} /> It is electrical installation work.
          </label>
        )}
        <textarea rows={4} className={`${field} mt-4`} placeholder="Describe the work. No contact details." value={p.description} onChange={(e) => p.setDescription(e.target.value)} />
        {p.leak && <p className="mt-1 text-xs text-red-700">Can't post: {p.leak}.</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {p.photos.map((ph) => (
            <span key={ph} className="flex h-16 w-20 items-end rounded bg-stone-200 p-1 text-[10px]">
              {ph}
            </span>
          ))}
          <Button variant="outline" size="sm" onClick={p.addPhoto}>
            Add photo
          </Button>
          <label className="ml-auto text-xs text-stone-600">
            Preferred start <input type="date" value={p.preferredStart} onChange={(e) => p.setPreferredStart(e.target.value)} className="ml-1 border-b" />
          </label>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button disabled={!p.canPost || p.posted} onClick={p.post}>
          {p.posted ? "Open" : "Post"}
        </Button>
        <span className="text-xs text-stone-500">{p.posted ? "Being offered to Artisans who may Quote it." : p.missing.length ? `Still needs ${p.missing.join(", ")}.` : "Ready."}</span>
        <button type="button" onClick={p.fillExample} className="ml-auto text-xs underline">
          fill example
        </button>
      </div>
    </div>
  );
}

function Verification() {
  const v = F.verification;
  const dot: Record<F.CheckState, string> = {
    Accepted: "bg-emerald-600",
    Waiting: "bg-amber-500",
    Rejected: "bg-red-600",
    "Not submitted": "bg-white ring-1 ring-stone-400",
    "Not needed": "bg-stone-200",
  };
  const group = (title: string, items: { name: string; state: F.CheckState; note?: string }[]) => (
    <section className="mt-8">
      <h2 className="mb-3 text-xs tracking-wide text-stone-500 uppercase">{title}</h2>
      <ol className="border-l border-stone-300 pl-6">
        {items.map((c) => (
          <li key={c.name} className="relative mb-4">
            <span className={`absolute top-1 -left-[31px] size-3 rounded-full ${dot[c.state]}`} />
            <p className="text-sm font-medium">
              {c.name} <span className="font-normal text-stone-500">· {c.state}</span>
            </p>
            {c.note && <p className="text-xs text-stone-600">{c.note}</p>}
            {(c.state === "Rejected" || c.state === "Not submitted") && (
              <button type="button" className="mt-1 text-xs underline">
                {c.state === "Rejected" ? "submit again" : "submit"}
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <p className="text-xs tracking-wide text-stone-500 uppercase">{v.artisan} · Verification</p>
      <h1 className="font-serif text-3xl">Electrical: not yet verified</h1>
      <p className="mt-2 text-sm text-stone-600">
        Two checks to go. Until all are current you can't Quote Electrical, and Electrical shows nothing on your profile.
      </p>
      {group("Once, for every category", v.once)}
      {group("Electrical", v.perCategory)}
      {group("Optional", v.optional)}
    </div>
  );
}

function Stream({ side }: { side: "Client" | "Artisan" }) {
  const [available, setAvailable] = useState(true);
  const groups = F.notices[side].reduce<Record<string, F.Notice[]>>((g, n) => ((g[n.job] ??= []).push(n), g), {});
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {side === "Artisan" && (
        <div className="mb-8 flex flex-wrap items-center gap-3 border-b border-stone-300 pb-4 text-sm">
          <button type="button" onClick={() => setAvailable((v) => !v)} className={`rounded-full px-3 py-1 ${available ? "bg-emerald-700 text-white" : "bg-stone-200"}`}>
            {available ? "Available for Jobs" : "Not available"}
          </button>
          <span className="text-stone-600">{F.artisan.regions.join(" · ")}</span>
          <span className="ml-auto text-xs text-stone-500">Reliability Record: no entries</span>
        </div>
      )}
      <h1 className="font-serif text-3xl">{side === "Artisan" ? "Your Jobs" : "Activity"}</h1>
      <p className="mt-1 text-xs text-stone-500">One stream per Job. Each item is also emailed, without Conversation text. Wording is placeholder.</p>
      {side === "Artisan" && (
        <section className="mt-6 rounded-xl border border-stone-300 bg-white p-4">
          <p className="text-xs tracking-wide text-stone-500 uppercase">Waiting on you</p>
          <p className="mt-1 text-sm">
            Thandi M. sent dates for <b>Replace burst geyser and fit a gas hob</b>: 12 Oct, 2 days.
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm">Confirm</Button>
            <Button size="sm" variant="outline">
              Ask to change
            </Button>
          </div>
          {F.home.jobMatches.map((m) => (
            <div key={m.title} className="mt-3 border-t border-stone-200 pt-3 text-sm">
              <b>{m.title}</b>{" "}
              <span className="text-xs text-stone-500">
                {m.kind} · {m.region} · {m.client.shownName}, {m.client.paid} paid, {m.client.completed} Completed
              </span>
              <div className="mt-1 flex gap-3 text-xs">
                <button type="button" className="underline">
                  Quote
                </button>
                <button type="button" className="text-stone-500 underline">
                  Not interested
                </button>
              </div>
            </div>
          ))}
        </section>
      )}
      {Object.entries(groups).map(([jobTitle, list]) => (
        <section key={jobTitle} className="mt-8">
          <h2 className="font-serif text-lg">{jobTitle}</h2>
          <ol className="mt-2 border-l border-stone-300 pl-5">
            {list.map((n) => (
              <li key={n.at + n.event} className="relative mb-3">
                <span className={`absolute top-1.5 -left-[25px] size-2 rounded-full ${n.unread ? "bg-sky-600" : "bg-stone-300"}`} />
                <p className={`text-sm ${n.unread ? "font-medium" : ""}`}>{n.event}</p>
                <p className="text-[11px] text-stone-500">{n.at}</p>
              </li>
            ))}
          </ol>
        </section>
      ))}
      {side === "Artisan" && (
        <section className="mt-8 border-t border-stone-300 pt-4 text-sm">
          <h2 className="font-serif text-lg">Payouts</h2>
          {F.home.payouts.map((p) => (
            <p key={p.at} className="mt-1 text-stone-700">
              {p.at} · {p.engagement}: {F.rand(p.release - p.fee)}{" "}
              <span className="text-xs text-stone-500">
                ({F.rand(p.release)} Released, Artisan Fee {F.rand(p.fee)})
              </span>
            </p>
          ))}
        </section>
      )}
    </div>
  );
}
