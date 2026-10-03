// PROTOTYPE: three structurally different Artisan homes over the same HOME fixture.
// A: one stream: switch and Regions, Waiting on you, activity by Job, Payouts; notices inline.
// B: a board: one column per stage of a Job, left to right, money in the last column.
// C: an inbox: one filtered list of everything on the left, a preview on the right, money totals on top.
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { HOME, rand, type HomeItem } from "./data";
import { Pill, Section } from "./bits";

function Header() {
  return (
    <header className="flex items-center gap-4 border-b px-4 py-2 text-sm">
      <span className="font-semibold">ArtisanConnect</span>
      <nav className="flex gap-3 text-muted-foreground">
        <span className="text-foreground">Home</span>
        <span>Profile</span>
        <span>Payouts</span>
        <span>Account</span>
      </nav>
    </header>
  );
}

function Availability() {
  const [on, setOn] = useState(HOME.available);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={() => setOn(!on)}
        className={cn(
          "flex items-center gap-2 rounded-full border px-3 py-1 text-sm",
          on && "border-foreground bg-foreground text-background",
        )}
      >
        <span className={cn("size-2 rounded-full", on ? "bg-background" : "bg-muted-foreground")} />
        Available for Jobs: {on ? "on" : "off"}
      </button>
      <span className="text-xs text-muted-foreground">Regions:</span>
      {HOME.regions.map((r) => (
        <Pill key={r}>{r}</Pill>
      ))}
      <button className="text-xs underline">change</button>
    </div>
  );
}

const itemAction: Record<HomeItem["kind"], string> = {
  "Job Match": "Quote or pass",
  Invitation: "Quote",
  "To start": "I've started",
  "To complete": "Mark complete",
  "Fix requested": "Fix or Dispute",
};

// ---------------- A ----------------

export function HomeA() {
  return (
    <div className="pb-28">
      <Header />
      <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-6">
        <Availability />

        <Section title={`Waiting on you (${HOME.waiting.length})`}>
          <div className="divide-y rounded-lg border">
            {HOME.waiting.map((w) => (
              <div key={w.job} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Pill tone={w.kind === "Fix requested" ? "warn" : "muted"}>{w.kind}</Pill>
                    <span className="truncate text-sm font-medium">{w.job}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {w.suburb} · {w.detail}
                  </div>
                </div>
                <Button size="sm" variant="outline">
                  {itemAction[w.kind]}
                </Button>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Activity by Job">
          <div className="space-y-2">
            {HOME.activity.map((a) => (
              <div key={a.job} className="rounded-lg border p-3 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium">{a.job}</span>
                  <Pill>{a.status}</Pill>
                </div>
                <div className="text-xs text-muted-foreground">
                  {a.suburb} · {a.last} · {a.money}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Notices">
          <ul className="space-y-1 text-sm">
            {HOME.notices.map((n) => (
              <li key={n.text} className="flex gap-3">
                <span className="w-16 shrink-0 text-xs text-muted-foreground">{n.at}</span>
                {n.text}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Payouts">
          <PayoutTable />
        </Section>
      </div>
    </div>
  );
}

function PayoutTable() {
  return (
    <table className="w-full text-sm">
      <thead className="text-xs text-muted-foreground">
        <tr>
          <th className="text-left font-normal">Release</th>
          <th className="text-right font-normal">Amount</th>
          <th className="text-right font-normal">Artisan Fee</th>
          <th className="text-right font-normal">Paid</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {HOME.payouts.map((p) => (
          <tr key={p.what}>
            <td className="py-1.5">
              <div>{p.what}</div>
              <div
                className={cn(
                  "text-xs",
                  p.state.startsWith("Rejected") ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {p.at} · {p.state}
              </div>
            </td>
            <td className="text-right tabular-nums">{rand(p.release)}</td>
            <td className="text-right tabular-nums">
              {"−"}
              {rand(p.fee)}
            </td>
            <td className="text-right font-medium tabular-nums">{rand(p.paid)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------------- B ----------------

const columns = [
  { title: "New for you", kinds: ["Job Match", "Invitation"] },
  { title: "Quoted", activity: ["Quote Sent"] },
  { title: "To start", kinds: ["To start"] },
  { title: "In progress", kinds: ["To complete", "Fix requested"] },
  { title: "Finished", activity: ["Completed"] },
] as const;

export function HomeB() {
  return (
    <div className="pb-28">
      <Header />
      <div className="space-y-4 p-4 md:p-6">
        <Availability />
        <div className="flex gap-3 overflow-x-auto pb-2">
          {columns.map((c) => {
            const items =
              "kinds" in c
                ? HOME.waiting
                    .filter((w) => (c.kinds as readonly string[]).includes(w.kind))
                    .map((w) => ({
                      title: w.job,
                      sub: `${w.suburb} · ${w.detail}`,
                      tag: w.kind,
                      act: itemAction[w.kind],
                    }))
                : HOME.activity
                    .filter((a) => (c.activity as readonly string[]).includes(a.status))
                    .map((a) => ({
                      title: a.job,
                      sub: `${a.suburb} · ${a.money}`,
                      tag: a.status,
                      act: null,
                    }));
            return (
              <div key={c.title} className="w-64 shrink-0 rounded-xl bg-muted/60 p-2">
                <div className="mb-2 flex justify-between px-1 text-xs font-semibold">
                  <span>{c.title}</span>
                  <span className="text-muted-foreground">{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.map((it) => (
                    <div
                      key={it.title}
                      className="space-y-1 rounded-lg bg-background p-2.5 text-sm shadow-xs"
                    >
                      <Pill tone={it.tag === "Fix requested" ? "warn" : "muted"}>{it.tag}</Pill>
                      <div className="font-medium">{it.title}</div>
                      <div className="text-xs text-muted-foreground">{it.sub}</div>
                      {it.act && (
                        <Button size="xs" variant="outline">
                          {it.act}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          <div className="w-64 shrink-0 rounded-xl border p-2">
            <div className="mb-2 px-1 text-xs font-semibold">Payouts</div>
            <div className="space-y-2 text-sm">
              {HOME.payouts.map((p) => (
                <div key={p.what} className="rounded-lg border p-2">
                  <div className="flex justify-between">
                    <span className="font-medium tabular-nums">{rand(p.paid)}</span>
                    <span className="text-xs text-muted-foreground">{p.at}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{p.what}</div>
                  <div
                    className={cn("text-xs", p.state.startsWith("Rejected") && "text-destructive")}
                  >
                    {p.state}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Notices live behind a bell in this variant: {HOME.notices.length} unread.
        </p>
      </div>
    </div>
  );
}

// ---------------- C ----------------

type Entry = {
  id: string;
  tag: string;
  title: string;
  sub: string;
  when: string;
  needsYou: boolean;
  money: boolean;
};

const entries: Entry[] = [
  ...HOME.waiting.map((w, i) => ({
    id: `w${i}`,
    tag: w.kind,
    title: w.job,
    sub: `${w.suburb} · ${w.detail}`,
    when: w.due ?? "",
    needsYou: true,
    money: false,
  })),
  ...HOME.notices.map((n, i) => ({
    id: `n${i}`,
    tag: "Notice",
    title: n.text,
    sub: "",
    when: n.at,
    needsYou: false,
    money: n.text.startsWith("Payout"),
  })),
  ...HOME.payouts.map((p, i) => ({
    id: `p${i}`,
    tag: "Payout",
    title: `${rand(p.paid)}: ${p.what}`,
    sub: p.state,
    when: p.at,
    needsYou: p.state.startsWith("Rejected"),
    money: true,
  })),
];

export function HomeC() {
  const [filter, setFilter] = useState<"All" | "Needs you" | "Money" | "Notices">("Needs you");
  const shown = entries.filter(
    (e) =>
      filter === "All" ||
      (filter === "Needs you" && e.needsYou) ||
      (filter === "Money" && e.money) ||
      (filter === "Notices" && e.tag === "Notice"),
  );
  const [sel, setSel] = useState<string>(shown[0]?.id ?? "");
  const current = entries.find((e) => e.id === sel) ?? shown[0];

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col">
      <Header />
      <div className="grid grid-cols-3 border-b text-center text-sm">
        <div className="p-3">
          <div className="text-xs text-muted-foreground">Unreleased on your Jobs</div>
          <div className="text-lg font-semibold tabular-nums">{rand(7600)}</div>
        </div>
        <div className="border-x p-3">
          <div className="text-xs text-muted-foreground">Next Payout run</div>
          <div className="text-lg font-semibold tabular-nums">{rand(810)}</div>
        </div>
        <div className="p-3">
          <div className="text-xs text-muted-foreground">Paid out this month</div>
          <div className="text-lg font-semibold tabular-nums">{rand(7740)}</div>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex w-full flex-col border-r md:w-[28rem]">
          <div className="border-b p-2">
            <Availability />
          </div>
          <div className="flex items-center gap-1 border-b p-2">
            {(["Needs you", "All", "Money", "Notices"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-md px-2 py-1 text-xs",
                  filter === f ? "bg-foreground text-background" : "text-muted-foreground",
                )}
              >
                {f}
              </button>
            ))}
          </div>
          <ul className="min-h-0 flex-1 divide-y overflow-y-auto pb-24">
            {shown.map((e) => (
              <li key={e.id}>
                <button
                  onClick={() => setSel(e.id)}
                  className={cn("w-full p-3 text-left", current?.id === e.id && "bg-muted")}
                >
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{e.tag}</span>
                    <span>{e.when}</span>
                  </div>
                  <div className="truncate text-sm font-medium">{e.title}</div>
                  {e.sub && <div className="truncate text-xs text-muted-foreground">{e.sub}</div>}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="hidden min-w-0 flex-1 overflow-y-auto p-6 md:block">
          {current && (
            <div className="max-w-lg space-y-3">
              <Pill>{current.tag}</Pill>
              <h2 className="text-xl font-semibold">{current.title}</h2>
              <p className="text-sm text-muted-foreground">{current.sub}</p>
              <div className="h-40 rounded-lg bg-muted" />
              <p className="text-xs text-muted-foreground">
                A preview of the Job or Payout. Its full page opens on click.
              </p>
              {current.needsYou && (
                <Button>{(itemAction as Record<string, string>)[current.tag] ?? "Open"}</Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
