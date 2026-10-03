// PROTOTYPE: three structurally different Job pages over the same JobView.
// A: one page, record oldest first, ending in a Now block; Conversation docked beside it.
// B: a stage stepper; only the current stage is open, past ones fold; Conversation and Money are tabs.
// C: the Conversation is the page; events are action cards in the stream; a money ledger rail.
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { JOB, QUOTES, STAGES, rand, type JobView } from "./data";
import {
  Actions,
  Bubble,
  ClockBar,
  Composer,
  EventRow,
  Ledger,
  MoneyLines,
  NowBody,
  Pill,
  RecordItem,
  Section,
  conversationStream,
} from "./bits";

function JobTitle({ v }: { v: JobView }) {
  return (
    <div className="min-w-0">
      <h1 className="text-lg font-semibold leading-tight">{JOB.title}</h1>
      <p className="text-sm text-muted-foreground">
        {JOB.category} · {JOB.suburb} ({JOB.region}) · {JOB.siteType}
        {v.with && <> · with {v.with}</>}
      </p>
    </div>
  );
}

/** Before Hire a Client has one Conversation per Artisan who Quoted; only the first has fixture messages. */
function ThreadTabs({ v }: { v: JobView }) {
  const [sel, setSel] = useState(0);
  if (v.viewer !== "client" || v.with || v.state === "posting") return null;
  return (
    <div className="flex gap-1 overflow-x-auto border-b px-2 py-1.5">
      {QUOTES.map((q, i) => (
        <button
          key={q.id}
          onClick={() => setSel(i)}
          className={cn(
            "shrink-0 rounded-md px-2 py-0.5 text-xs",
            sel === i ? "bg-foreground text-background" : "text-muted-foreground",
          )}
        >
          {q.trading}
        </button>
      ))}
    </div>
  );
}

function ConversationPane({ v, className }: { v: JobView; className?: string }) {
  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="border-b px-3 py-2 text-sm font-medium">
        Conversation{" "}
        {v.with ? `with ${v.with}` : v.viewer === "client" ? "(one per Artisan)" : "with Thandi M."}
      </div>
      <ThreadTabs v={v} />
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {v.state === "posting" ? (
          <p className="text-sm text-muted-foreground">
            A Conversation opens with a Quote or an Invitation.
          </p>
        ) : (
          conversationStream(v).map((x, i) =>
            x.kind === "msg" ? (
              <Bubble key={i} m={x.m} viewer={v.viewer} />
            ) : (
              <EventRow key={i} row={x.row} />
            ),
          )
        )}
      </div>
      <div className="border-t p-3">
        <Composer v={v} />
      </div>
    </div>
  );
}

// ---------------- A ----------------

export function JobA({ v }: { v: JobView }) {
  const [chatOpen, setChatOpen] = useState(false);
  return (
    <div className="mx-auto flex h-[calc(100svh-3.5rem)] max-w-6xl">
      <main className="min-w-0 flex-1 overflow-y-auto p-4 pb-28 md:p-6">
        <header className="space-y-2 border-b pb-3">
          <JobTitle v={v} />
          <div className="flex flex-wrap gap-1">
            <Pill tone="strong">Job: {v.jobStatus}</Pill>
            {v.engagement && <Pill tone="strong">{v.engagement}</Pill>}
            {v.money?.map((l) => (
              <Pill key={l.label} tone={l.state === "Released" ? "ok" : "muted"}>
                {l.label}: {l.state}
              </Pill>
            ))}
          </div>
        </header>

        <Section title="Record" className="mt-4">
          {v.record.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing yet. The record starts when the Job is posted.
            </p>
          ) : (
            <div className="space-y-3">
              {v.record.map((r, i) => (
                <RecordItem key={i} row={r} />
              ))}
            </div>
          )}
        </Section>

        {v.money && (
          <Section title="Money" className="mt-6 rounded-lg border p-3">
            <MoneyLines lines={v.money} />
          </Section>
        )}

        <section className="mt-6 space-y-3 rounded-xl border-2 border-foreground p-4">
          <div className="text-xs font-semibold tracking-wide uppercase">Now</div>
          <h2 className="text-lg font-semibold">{v.now.heading}</h2>
          {v.clock && <ClockBar clock={v.clock} />}
          {v.now.lines.map((l) => (
            <p key={l} className="text-sm text-muted-foreground">
              {l}
            </p>
          ))}
          <NowBody panel={v.now.panel} v={v} />
          <Actions actions={v.now.actions} />
          {v.now.tells && <p className="text-[11px] text-muted-foreground">Told: {v.now.tells}</p>}
        </section>
      </main>

      <aside className="hidden w-96 shrink-0 border-l md:flex">
        <ConversationPane v={v} className="w-full" />
      </aside>

      <Button className="fixed right-4 bottom-20 md:hidden" onClick={() => setChatOpen(true)}>
        Conversation
      </Button>
      {chatOpen && (
        <div className="fixed inset-0 z-40 flex flex-col bg-background md:hidden">
          <Button variant="ghost" className="self-end" onClick={() => setChatOpen(false)}>
            Close
          </Button>
          <ConversationPane v={v} className="flex-1" />
        </div>
      )}
    </div>
  );
}

// ---------------- B ----------------

export function JobB({ v }: { v: JobView }) {
  const [tab, setTab] = useState<"stage" | "conversation" | "money" | "details">("stage");
  const currentIdx = STAGES.findIndex((s) => s.key === v.currentStage);
  const stopped = v.stoppedAt !== undefined;

  return (
    <div className="mx-auto max-w-3xl p-4 pb-28 md:p-6">
      <JobTitle v={v} />

      <ol className="mt-4 flex items-center gap-1 overflow-x-auto">
        {STAGES.map((s, i) => {
          const done = i < currentIdx;
          const current = i === currentIdx;
          return (
            <li key={s.key} className="flex shrink-0 items-center gap-1">
              <div
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
                  done && "bg-muted",
                  current && !stopped && "border-foreground bg-foreground text-background",
                  current && stopped && "border-destructive text-destructive line-through",
                  i > currentIdx && stopped && "opacity-30 line-through",
                  i > currentIdx && !stopped && "text-muted-foreground",
                )}
              >
                <span className="tabular-nums">{done ? "✓" : i + 1}</span>
                {s.label}
              </div>
              {i < STAGES.length - 1 && <div className="h-px w-3 bg-border" />}
            </li>
          );
        })}
      </ol>
      {stopped && (
        <p className="mt-2 text-sm font-medium text-destructive">Cancelled at this stage.</p>
      )}

      <nav className="mt-4 flex gap-4 border-b text-sm">
        {(["stage", "conversation", "money", "details"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "-mb-px border-b-2 px-1 pb-2 capitalize",
              tab === t
                ? "border-foreground font-medium"
                : "border-transparent text-muted-foreground",
            )}
          >
            {t === "stage" ? "This step" : t}
            {t === "conversation" && v.messages.length > 0 && (
              <span className="ml-1 text-xs">({v.messages.length})</span>
            )}
          </button>
        ))}
      </nav>

      {tab === "stage" && (
        <div className="mt-4 space-y-3">
          {STAGES.slice(0, currentIdx).map((s) => (
            <details key={s.key} className="rounded-lg border px-3 py-2">
              <summary className="cursor-pointer text-sm">
                <span className="mr-2">{"✓"}</span>
                {s.label}
                <span className="ml-2 text-muted-foreground">{pastSummary(s.key, v)}</span>
              </summary>
              <div className="mt-2 space-y-2">
                {rowsForStage(s.key, v).map((r, i) => (
                  <RecordItem key={i} row={r} />
                ))}
              </div>
            </details>
          ))}

          <div className="space-y-4 rounded-2xl bg-muted/60 p-5">
            <div className="text-xs text-muted-foreground">
              Step {currentIdx + 1} of {STAGES.length} · {STAGES[currentIdx].label}
            </div>
            <h2 className="text-2xl font-semibold">{v.now.heading}</h2>
            {v.clock && <ClockBar clock={v.clock} />}
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {v.now.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <div className="rounded-xl bg-background p-4">
              <NowBody panel={v.now.panel} v={v} />
              {v.now.panel === "none" && (
                <p className="text-sm text-muted-foreground">Nothing to fill in.</p>
              )}
            </div>
            <Actions actions={v.now.actions} />
            {v.now.tells && (
              <p className="text-[11px] text-muted-foreground">Told: {v.now.tells}</p>
            )}
          </div>

          {STAGES.slice(currentIdx + 1).length > 0 && !stopped && (
            <p className="text-xs text-muted-foreground">
              Next:{" "}
              {STAGES.slice(currentIdx + 1)
                .map((s) => s.label)
                .join(" → ")}
            </p>
          )}
        </div>
      )}

      {tab === "conversation" && (
        <div className="mt-4 h-[60svh] rounded-lg border">
          <ConversationPane v={v} className="h-full" />
        </div>
      )}

      {tab === "money" && (
        <div className="mt-4 space-y-4">
          {v.money ? (
            <MoneyLines lines={v.money} />
          ) : (
            <p className="text-sm text-muted-foreground">Nothing is paid before Hire.</p>
          )}
          <Section title="Every Payment, Release, Refund, and fee">
            <Ledger rows={v.ledger} />
          </Section>
        </div>
      )}

      {tab === "details" && (
        <div className="mt-4 space-y-2 text-sm">
          <p>{JOB.description}</p>
          <div className="flex gap-1">
            {Array.from({ length: JOB.photos }).map((_, i) => (
              <div key={i} className="size-14 rounded bg-muted" />
            ))}
          </div>
          <p className="text-muted-foreground">
            {JOB.category} · {JOB.suburb} · {JOB.siteType} · Job {v.jobStatus}
          </p>
        </div>
      )}
    </div>
  );
}

const stageTitles: Record<string, string[]> = {
  post: ["Job posted", "Batch", "Job Match"],
  quotes: ["Quote sent"],
  hire: ["Hired", "Payment"],
  start: ["I've started", "Work started"],
  complete: ["Updated Quote", "Refund", "Completion", "Fix request"],
  approve: ["Approval", "Dispute"],
  review: ["Completed"],
};

function rowsForStage(stage: string, v: JobView) {
  return v.record.filter((r) =>
    stageTitles[stage]?.some((t) => r.title.replace(/[“”]/g, "").startsWith(t)),
  );
}

function pastSummary(stage: string, v: JobView) {
  switch (stage) {
    case "post":
      return "Posted Sun 21 Sep";
    case "quotes":
      return v.viewer === "client" ? "3 Quotes" : "Your Quote sent";
    case "hire":
      return v.viewer === "client" ? `Paid ${rand(11550)}` : `${rand(11000)} held`;
    case "start":
      return "Mon 29 Sep";
    case "complete":
      return "Tue 30 Sep";
    case "approve":
      return "Wed 1 Oct";
    default:
      return "";
  }
}

// ---------------- C ----------------

export function JobC({ v }: { v: JobView }) {
  const stream = conversationStream(v);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  return (
    <div className="mx-auto flex h-[calc(100svh-3.5rem)] max-w-6xl">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b px-4 py-2">
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-xs">
            {v.with ? v.with.slice(0, 2) : "?"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">
              {v.with ?? (v.viewer === "client" ? "Your Job" : "Thandi M.")}
            </div>
            <div className="truncate text-xs text-muted-foreground">{JOB.title}</div>
          </div>
          <div className="hidden gap-1 sm:flex">
            <Pill tone="strong">{v.engagement ?? `Job ${v.jobStatus}`}</Pill>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="lg:hidden"
            onClick={() => setLedgerOpen((o) => !o)}
          >
            Money
          </Button>
        </header>
        <ThreadTabs v={v} />
        {v.clock && (
          <div className="border-b px-4 py-1.5">
            <ClockBar clock={v.clock} compact />
          </div>
        )}

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 pb-32">
          <div className="mx-auto max-w-md rounded-lg border p-3 text-sm">
            <div className="text-xs text-muted-foreground">The Job</div>
            <div className="font-medium">{JOB.title}</div>
            <p className="text-muted-foreground">{JOB.description}</p>
          </div>

          {stream.map((x, i) =>
            x.kind === "msg" ? (
              <Bubble key={i} m={x.m} viewer={v.viewer} />
            ) : (
              <div key={i} className="mx-auto max-w-md rounded-lg border bg-muted/40 p-3 text-sm">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{x.row.title}</span>
                  <span>{x.row.at}</span>
                </div>
                {x.row.detail && <div>{x.row.detail}</div>}
              </div>
            ),
          )}

          <div className="mx-auto max-w-md space-y-3 rounded-xl border-2 border-foreground bg-background p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase">For you</div>
            <div className="font-semibold">{v.now.heading}</div>
            {v.now.lines.map((l) => (
              <p key={l} className="text-sm text-muted-foreground">
                {l}
              </p>
            ))}
            <NowBody panel={v.now.panel} v={v} />
            <Actions actions={v.now.actions} stacked />
            {v.now.tells && (
              <p className="text-[11px] text-muted-foreground">Told: {v.now.tells}</p>
            )}
          </div>
        </div>

        <div className="border-t p-3">
          <Composer v={v} />
        </div>
      </div>

      <aside
        className={cn(
          "w-80 shrink-0 space-y-4 overflow-y-auto border-l p-4",
          ledgerOpen ? "fixed inset-y-0 right-0 z-40 bg-background" : "hidden lg:block",
        )}
      >
        <Button
          variant="ghost"
          size="sm"
          className="lg:hidden"
          onClick={() => setLedgerOpen(false)}
        >
          Close
        </Button>
        <Section title="Money">
          {v.money ? (
            <MoneyLines lines={v.money} dense />
          ) : (
            <p className="text-sm text-muted-foreground">Nothing is paid before Hire.</p>
          )}
        </Section>
        <Section title="Ledger">
          <Ledger rows={v.ledger} />
        </Section>
        <Section title="Job">
          <p className="text-xs text-muted-foreground">
            {JOB.category} · {JOB.suburb} ({JOB.region}) · {JOB.siteType}
          </p>
        </Section>
      </aside>
    </div>
  );
}
