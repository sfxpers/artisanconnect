// PROTOTYPE: three structurally different Admin items, each drawn for a Dispute and a Verification.
// A: an item page read top to bottom, ending in a Now block; documents open beside it on a logged click.
// B: a three-pane console: the eight queues, the item, and a fixed decision panel.
// C: a comparison: the two sides (or each check) as columns/rows, with the decision built into the grid.
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DISPUTE, QUEUES, VERIFICATION, rand, type AdminItemKey } from "./data";
import { Pill, Placeholder, Section } from "./bits";

function AdminHeader() {
  return (
    <header className="flex items-center gap-4 border-b bg-foreground px-4 py-2 text-sm text-background">
      <span className="font-semibold">Admin</span>
      <nav className="flex gap-3 opacity-70">
        <span className="opacity-100">Queues</span>
        <span>People</span>
        <span>Admins</span>
        <span>Reports</span>
        <span>Audit log</span>
        <span>Suburbs</span>
        <span>Marketplace rules</span>
      </nav>
    </header>
  );
}

function LoggedOpen({ label, onOpen }: { label: string; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="rounded-md border px-2 py-1 text-xs hover:bg-muted">
      Open {label} <span className="text-muted-foreground">(logged)</span>
    </button>
  );
}

function DisputeDecision({ compact }: { compact?: boolean }) {
  const [release, setRelease] = useState(1000);
  return (
    <div className="space-y-3">
      <div className="text-sm">
        Split the held <b>{rand(DISPUTE.held)}</b>
      </div>
      <input
        type="range"
        min={0}
        max={DISPUTE.held}
        step={50}
        value={release}
        onChange={(e) => setRelease(Number(e.target.value))}
        className="w-full"
      />
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-md border p-2">
          <div className="text-xs text-muted-foreground">Release to Artisan</div>
          <div className="font-semibold tabular-nums">{rand(release)}</div>
        </div>
        <div className="rounded-md border p-2">
          <div className="text-xs text-muted-foreground">Refund to Client</div>
          <div className="font-semibold tabular-nums">{rand(DISPUTE.held - release)}</div>
        </div>
      </div>
      {!compact && (
        <textarea
          className="w-full rounded-md border p-2 text-sm"
          rows={2}
          placeholder="Reason, sent to both"
        />
      )}
      <Button className="w-full">Decide (final)</Button>
      <p className="text-[11px] text-muted-foreground">
        Told: {DISPUTE.tells} A recorded decision cannot be reopened. A Refund goes on the Artisan
        record.
      </p>
    </div>
  );
}

function VerificationDecision() {
  return (
    <div className="space-y-2 text-sm">
      <p>Decide each check. Accepted ones show on the Profile as Verification Badges.</p>
      <Button className="w-full">Record decisions</Button>
      <p className="text-[11px] text-muted-foreground">
        Told: {VERIFICATION.tells} A recorded decision cannot be reopened.
      </p>
    </div>
  );
}

// ---------------- A ----------------

export function AdminA({ item }: { item: AdminItemKey }) {
  const [side, setSide] = useState<string | null>(null);
  return (
    <div className="pb-28">
      <AdminHeader />
      <div className="mx-auto flex max-w-6xl">
        <main className="min-w-0 flex-1 space-y-6 p-4 md:p-6">
          {item === "dispute" ? (
            <>
              <header>
                <div className="text-xs text-muted-foreground">
                  Disputes · opened {DISPUTE.opened}
                </div>
                <h1 className="text-lg font-semibold">
                  {rand(DISPUTE.held)} of Labour on “{DISPUTE.job}”
                </h1>
                <p className="text-sm text-muted-foreground">
                  {DISPUTE.client} (Client) against {DISPUTE.artisan}
                </p>
              </header>
              <Section title="Timeline">
                <ol className="list-decimal pl-5 text-sm">
                  {DISPUTE.timeline.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ol>
              </Section>
              <Section title="Hired Quote scope">
                <p className="text-sm">{DISPUTE.quoteScope}</p>
              </Section>
              <Section title="Completion">
                <p className="text-sm">{DISPUTE.completionNote}</p>
                <div className="flex gap-1">
                  {Array.from({ length: DISPUTE.completionPhotos }).map((_, i) => (
                    <div key={i} className="size-14 rounded bg-muted" />
                  ))}
                </div>
              </Section>
              <Section title="Client's reason">
                <p className="text-sm">{DISPUTE.clientReason}</p>
                <div className="flex gap-1">
                  {Array.from({ length: DISPUTE.clientPhotos }).map((_, i) => (
                    <div key={i} className="size-14 rounded bg-muted" />
                  ))}
                </div>
              </Section>
              <Section title="Money">
                <p className="text-sm">
                  Materials {rand(DISPUTE.materialsReleased)} released. Labour{" "}
                  {rand(DISPUTE.labour)}: {rand(DISPUTE.held)} held,{" "}
                  {rand(DISPUTE.labour - DISPUTE.held)} releases at Approval.
                </p>
              </Section>
              <div className="flex flex-wrap gap-2">
                <LoggedOpen label="the Conversation" onOpen={() => setSide("Conversation")} />
                <LoggedOpen label="the Artisan record" onOpen={() => setSide("Artisan record")} />
              </div>
              <section className="space-y-3 rounded-xl border-2 border-foreground p-4">
                <div className="text-xs font-semibold uppercase">Now</div>
                <DisputeDecision />
              </section>
            </>
          ) : (
            <>
              <header>
                <div className="text-xs text-muted-foreground">
                  Verification · submitted {VERIFICATION.submitted}
                </div>
                <h1 className="text-lg font-semibold">{VERIFICATION.artisan}</h1>
                <p className="text-sm text-muted-foreground">
                  New Artisan · {VERIFICATION.categories.join(", ")}
                </p>
              </header>
              {(["Once", "Plumbing", "Optional"] as const).map((g) => (
                <Section key={g} title={g === "Plumbing" ? "Per category: Plumbing" : g}>
                  {VERIFICATION.checks
                    .filter((c) => c.group === g)
                    .map((c) => (
                      <div key={c.name} className="space-y-1 rounded-lg border p-3 text-sm">
                        <div className="flex justify-between gap-2">
                          <span className="font-medium">{c.name}</span>
                          <LoggedOpen label={c.document} onOpen={() => setSide(c.document)} />
                        </div>
                        <p
                          className={cn(
                            "text-xs",
                            c.autoOk ? "text-muted-foreground" : "text-destructive",
                          )}
                        >
                          {c.autoOk ? "✓" : "!"} {c.auto}
                        </p>
                      </div>
                    ))}
                </Section>
              ))}
              <section className="space-y-3 rounded-xl border-2 border-foreground p-4">
                <div className="text-xs font-semibold uppercase">Now</div>
                {VERIFICATION.checks.map((c) => (
                  <div key={c.name} className="flex items-center justify-between gap-2 text-sm">
                    <span>{c.name}</span>
                    <span className="flex gap-1">
                      <Button size="sm" variant="outline">
                        Accept
                      </Button>
                      <Button size="sm" variant="destructive">
                        Reject…
                      </Button>
                    </span>
                  </div>
                ))}
                <VerificationDecision />
              </section>
            </>
          )}
        </main>
        {side && (
          <aside className="fixed inset-0 z-30 space-y-2 overflow-y-auto border-l bg-background p-4 md:static md:w-96">
            <div className="flex justify-between">
              <span className="text-sm font-medium">{side}</span>
              <Button size="xs" variant="ghost" onClick={() => setSide(null)}>
                Close
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Opened by you at 10:14, written to the Audit log.
            </p>
            <Placeholder label={side} className="h-96" />
          </aside>
        )}
      </div>
    </div>
  );
}

// ---------------- B ----------------

export function AdminB({ item }: { item: AdminItemKey }) {
  const activeQueue = item === "dispute" ? "Disputes" : "Verification";
  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col">
      <AdminHeader />
      <div className="flex min-h-0 flex-1">
        <nav className="hidden w-56 shrink-0 overflow-y-auto border-r p-2 md:block">
          {QUEUES.map((q) => (
            <div key={q.key}>
              <div
                className={cn(
                  "flex justify-between rounded-md px-2 py-1.5 text-sm",
                  q.key === activeQueue && "bg-muted font-medium",
                )}
              >
                <span>{q.key}</span>
                <span className="text-muted-foreground tabular-nums">{q.count}</span>
              </div>
              {q.key === activeQueue && (
                <ul className="my-1 space-y-0.5 pl-3 text-xs">
                  <li className="rounded bg-foreground px-2 py-1 text-background">
                    {item === "dispute" ? "Geyser, Rondebosch" : VERIFICATION.artisan}
                  </li>
                  {item === "verification" && (
                    <>
                      <li className="px-2 py-1 text-muted-foreground">Pieter Botha</li>
                      <li className="px-2 py-1 text-muted-foreground">Fatima Adams</li>
                    </>
                  )}
                </ul>
              )}
            </div>
          ))}
        </nav>

        <main className="min-w-0 flex-1 overflow-y-auto p-4 pb-28">
          {item === "dispute" ? (
            <div className="space-y-4">
              <h1 className="font-semibold">{DISPUTE.job}</h1>
              <div className="grid gap-3 text-sm lg:grid-cols-2">
                <Placeholder label="Conversation (opens on a logged click)" className="h-64" />
                <div className="space-y-3">
                  <Section title="Client's reason">
                    <p>{DISPUTE.clientReason}</p>
                  </Section>
                  <Section title="Completion">
                    <p>{DISPUTE.completionNote}</p>
                  </Section>
                  <Section title="Artisan record">
                    <p className="text-xs">
                      {DISPUTE.artisanRecord.completed} Completed ·{" "}
                      {DISPUTE.artisanRecord.cancellations} Cancellation ·{" "}
                      {DISPUTE.artisanRecord.disputesLost} Disputes lost
                    </p>
                  </Section>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <h1 className="font-semibold">{VERIFICATION.artisan}</h1>
              {VERIFICATION.checks.map((c) => (
                <div
                  key={c.name}
                  className="grid grid-cols-[6rem_1fr] gap-3 rounded-lg border p-2 text-sm"
                >
                  <Placeholder label={c.document} className="h-20" />
                  <div>
                    <div className="flex items-center gap-2">
                      <Pill>{c.group}</Pill>
                      <span className="font-medium">{c.name}</span>
                    </div>
                    <p className={cn("text-xs", !c.autoOk && "text-destructive")}>{c.auto}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>

        <aside className="hidden w-80 shrink-0 border-l p-4 lg:block">
          <div className="mb-3 text-xs font-semibold uppercase">Decision</div>
          {item === "dispute" ? (
            <DisputeDecision compact />
          ) : (
            <div className="space-y-2">
              {VERIFICATION.checks.map((c) => (
                <label key={c.name} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{c.name}</span>
                  <select
                    className="rounded border bg-background text-xs"
                    defaultValue={c.autoOk ? "accept" : "reject"}
                  >
                    <option value="accept">Accept</option>
                    <option value="reject">Reject</option>
                  </select>
                </label>
              ))}
              <VerificationDecision />
            </div>
          )}
          <div className="mt-6 space-y-1 border-t pt-3 text-xs text-muted-foreground">
            <div>Keys: J/K next/previous item</div>
            <div>Every open and decision is logged.</div>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ---------------- C ----------------

export function AdminC({ item }: { item: AdminItemKey }) {
  return (
    <div className="pb-28">
      <AdminHeader />
      {item === "dispute" ? (
        <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
          <div className="space-y-2 rounded-xl bg-muted/60 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h1 className="font-semibold">{DISPUTE.job}</h1>
              <span className="text-xs text-muted-foreground">Dispute opened {DISPUTE.opened}</span>
            </div>
            <div className="flex h-6 overflow-hidden rounded-md text-[11px]">
              <div
                className="grid place-items-center bg-foreground/80 text-background"
                style={{ width: `${(DISPUTE.materialsReleased / 11000) * 100}%` }}
              >
                Materials released
              </div>
              <div
                className="grid place-items-center bg-foreground/40"
                style={{ width: `${((DISPUTE.labour - DISPUTE.held) / 11000) * 100}%` }}
              >
                Labour
              </div>
              <div
                className="grid place-items-center border border-dashed border-foreground"
                style={{ width: `${(DISPUTE.held / 11000) * 100}%` }}
              >
                Held
              </div>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3 rounded-xl border p-4">
              <div className="text-xs font-semibold uppercase">Client says · {DISPUTE.client}</div>
              <p className="text-sm">{DISPUTE.clientReason}</p>
              <div className="grid grid-cols-3 gap-1">
                {Array.from({ length: DISPUTE.clientPhotos }).map((_, i) => (
                  <div key={i} className="aspect-square rounded bg-muted" />
                ))}
              </div>
            </div>
            <div className="space-y-3 rounded-xl border p-4">
              <div className="text-xs font-semibold uppercase">
                Artisan's Completion · {DISPUTE.artisan}
              </div>
              <p className="text-sm">{DISPUTE.completionNote}</p>
              <div className="grid grid-cols-4 gap-1">
                {Array.from({ length: DISPUTE.completionPhotos }).map((_, i) => (
                  <div key={i} className="aspect-square rounded bg-muted" />
                ))}
              </div>
            </div>
            <div className="rounded-xl border p-4 text-sm md:col-span-2">
              <div className="text-xs font-semibold uppercase">What was agreed (Hired Quote)</div>
              <p>{DISPUTE.quoteScope}</p>
            </div>
          </div>
          <div className="mx-auto max-w-md rounded-xl border-2 border-foreground p-4">
            <DisputeDecision />
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
          <h1 className="font-semibold">
            {VERIFICATION.artisan}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              · submitted {VERIFICATION.submitted}
            </span>
          </h1>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 font-normal">Group</th>
                  <th className="font-normal">Check</th>
                  <th className="font-normal">Document</th>
                  <th className="font-normal">Automatic reading</th>
                  <th className="font-normal">Decision</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {VERIFICATION.checks.map((c) => (
                  <tr key={c.name} className={cn(!c.autoOk && "bg-destructive/5")}>
                    <td className="py-2">
                      <Pill>{c.group}</Pill>
                    </td>
                    <td className="font-medium">{c.name}</td>
                    <td>
                      <LoggedOpen label={c.document} onOpen={() => {}} />
                    </td>
                    <td className={cn("max-w-64 text-xs", !c.autoOk && "text-destructive")}>
                      {c.auto}
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <Button size="xs" variant={c.autoOk ? "default" : "outline"}>
                          Accept
                        </Button>
                        <Button size="xs" variant={c.autoOk ? "outline" : "destructive"}>
                          Reject
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="max-w-md">
            <VerificationDecision />
          </div>
        </div>
      )}
    </div>
  );
}
