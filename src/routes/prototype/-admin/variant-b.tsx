// PROTOTYPE, throwaway. Variant B, "Item record": the Job record shell, for Admin.
// Off an item, the queues are one stream grouped by grant (like the Artisan home).
// Each item is one page: its record oldest first, ending in a "Now" block with the decision.
// What may be read (the Job's record, the Conversation, an Identity Number) is docked beside it,
// the way the Conversation is docked beside a Job. A read that is audited says so before it opens.
import { useState } from "react";
import { ArrowLeft, BookOpen, Check, ChevronRight, Flag, ScrollText } from "lucide-react";
import * as F from "./fixtures";
import { countsFor, useAdmin } from "./store";
import { AuditPage, DecisionBlock, Evidence, FirstAdminPage, GrantChip, ReadGate, RegionsPage, ReportsPage, StaffPage } from "./parts";
import type { VariantProps } from "./variant-a";

export function VariantB({ screen, go }: VariantProps) {
  const { me, items } = useAdmin();
  const item = items.find((i) => i.id === screen);
  const isPage = !item && screen !== "queues";

  return (
    <div className="min-h-svh bg-stone-100 pb-24 text-stone-900">
      <header className="border-b border-stone-300 bg-stone-100/90 px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <button type="button" onClick={() => go("queues")} className="font-serif text-lg italic">
            ArtisanConnect
          </button>
          <span className="rounded bg-stone-900 px-1.5 py-0.5 text-[11px] text-white">Staff · not an Account</span>
          <span className="text-xs text-stone-500">{me.name}</span>
          <nav className="ml-auto flex gap-3 text-xs">
            {(["reports", "audit", "regions", "staff"] as const).map((p) => (
              <button key={p} type="button" onClick={() => go(p)} className={`underline-offset-2 hover:underline ${screen === p ? "font-semibold underline" : ""}`}>
                {F.PAGE_SCREENS.find((x) => x.key === p)!.label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      {screen === "queues" && <Stream go={go} />}
      {isPage && (
        <main className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
          <button type="button" onClick={() => go("queues")} className="mb-3 flex items-center gap-1 text-xs text-stone-500 underline">
            <ArrowLeft className="size-3" /> Queues
          </button>
          <h1 className="mb-4 font-serif text-3xl">{F.PAGE_SCREENS.find((p) => p.key === screen)?.label}</h1>
          {screen === "reports" && <ReportsPage />}
          {screen === "audit" && <AuditPage />}
          {screen === "regions" && <RegionsPage />}
          {screen === "staff" && <StaffPage />}
          {screen === "first" && <FirstAdminPage />}
        </main>
      )}
      {item && <ItemRecord key={item.id} item={item} go={go} />}
    </div>
  );
}

// ---------- off an item: one stream, grouped by grant ----------

function Stream({ go }: { go: (s: string) => void }) {
  const { me, open, visible, recorded } = useAdmin();
  const counts = countsFor(open);
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm">
        <span className="text-stone-500">You hold</span>
        {me.grants.map((g) => (
          <GrantChip key={g} g={g} />
        ))}
        <span className="ml-auto text-xs text-stone-500">{open.length} waiting</span>
      </div>
      {F.GRANTS.map((g) => {
        const held = me.grants.includes(g.key);
        const rows = visible.filter((i) => i.grant === g.key);
        return (
          <section key={g.key} className="mt-8">
            <h2 className={`flex items-baseline gap-2 font-serif text-xl ${held ? "" : "text-stone-400"}`}>
              {g.label}
              <span className="font-sans text-xs text-stone-500">{!held ? "you do not hold this" : g.key === "operations" ? "no queue" : `${counts[g.key]} waiting`}</span>
            </h2>
            <p className="text-xs text-stone-500">{g.blurb}</p>
            {held && g.key === "operations" && (
              <div className="mt-2 flex gap-3 text-sm">
                <button type="button" onClick={() => go("regions")} className="underline">
                  Region edges
                </button>
                <button type="button" onClick={() => go("staff")} className="underline">
                  Staff and grants
                </button>
              </div>
            )}
            <ol className="mt-3 space-y-2">
              {rows.map((i) => (
                <li key={i.id}>
                  <button
                    type="button"
                    onClick={() => go(i.id)}
                    className={`flex w-full items-center gap-3 rounded-xl border border-stone-300 bg-white px-4 py-3 text-left text-sm shadow-sm hover:border-stone-500 ${recorded[i.id] ? "opacity-50" : ""}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] text-stone-500">
                        {i.kind} · {i.at}
                        {i.count ? ` · ${i.count} reports folded` : ""}
                      </span>
                      <span className="block font-medium">{i.title}</span>
                    </span>
                    {recorded[i.id] ? <Check className="size-4" /> : <ChevronRight className="size-4 text-stone-400" />}
                  </button>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </main>
  );
}

// ---------- an item is one page ----------

const STAGES = ["Raised", "Waiting", "Decided"];

function ItemRecord({ item, go }: { item: F.Item; go: (s: string) => void }) {
  const { me, recorded } = useAdmin();
  const [readsOpen, setReadsOpen] = useState(false);
  const [showOld, setShowOld] = useState(false);
  const held = me.grants.includes(item.grant);
  const done = recorded[item.id];
  const stage = done ? 2 : 1;
  const keep = 3;
  const hidden = showOld ? 0 : Math.max(0, item.record.length - keep);

  if (!held)
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <p className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          This item sits in {F.grantLabel(item.grant)}. You do not hold that grant, so it is not in your queues.
        </p>
      </main>
    );

  return (
    <div className="mx-auto grid max-w-7xl lg:grid-cols-[1fr_380px]">
      <main className="px-4 py-6 sm:px-8">
        <button type="button" onClick={() => go("queues")} className="mb-3 flex items-center gap-1 text-xs text-stone-500 underline">
          <ArrowLeft className="size-3" /> Queues
        </button>
        <p className="text-xs tracking-wide text-stone-500 uppercase">
          {item.kind} · {F.grantLabel(item.grant)}
        </p>
        <h1 className="mt-1 font-serif text-3xl">{item.title}</h1>
        <div className="mt-3 flex items-center gap-1 text-xs">
          {STAGES.map((s, i) => (
            <span key={s} className="flex items-center gap-1">
              <span className={`rounded-full px-2 py-0.5 ${i === stage ? "bg-stone-900 text-white" : i < stage ? "bg-stone-300 text-stone-700" : "text-stone-400"}`}>{s}</span>
              {i < STAGES.length - 1 && <span className="text-stone-300">—</span>}
            </span>
          ))}
        </div>

        <ol className="relative mt-8 border-l border-stone-300 pl-6">
          {hidden > 0 && (
            <li className="mb-6">
              <button type="button" onClick={() => setShowOld(true)} className="text-xs text-stone-500 underline">
                {hidden} earlier records
              </button>
            </li>
          )}
          {item.record.slice(hidden).map((r) => (
            <li key={r.at + r.text} className="relative mb-6">
              <span className="absolute top-1 -left-[29px] size-2.5 rounded-full bg-stone-400 ring-4 ring-stone-100" />
              <p className="text-[11px] text-stone-500">{r.at}</p>
              <p className="text-sm">{r.text}</p>
            </li>
          ))}
          <li className="relative mb-6">
            <span className="absolute top-1 -left-[29px] size-2.5 rounded-full bg-stone-400 ring-4 ring-stone-100" />
            <p className="mb-2 text-[11px] text-stone-500">What it carries</p>
            <div className="rounded-xl border border-stone-200 bg-white p-4">
              <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-sm">
                {item.facts.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-stone-500">{k}</dt>
                    <dd className="whitespace-pre-line">{v}</dd>
                  </div>
                ))}
              </dl>
              {item.special && (
                <div className="mt-4">
                  <Evidence item={item} />
                </div>
              )}
            </div>
          </li>
          <li className="relative">
            <span className="absolute top-1 -left-[31px] size-3 rounded-full bg-stone-900 ring-4 ring-stone-100" />
            <p className="mb-2 text-[11px] font-medium tracking-wide text-stone-500 uppercase">Now</p>
            <div className="rounded-xl border border-stone-300 bg-white p-5 shadow-sm">
              <DecisionBlock item={item} tight />
              {item.notes && (
                <ul className="mt-3 list-disc space-y-0.5 pl-5 text-xs text-stone-500">
                  {item.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        </ol>
      </main>

      {item.reads.length > 0 && (
        <button
          type="button"
          onClick={() => setReadsOpen((v) => !v)}
          className="fixed right-4 bottom-20 z-20 flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2 text-sm text-white shadow-lg lg:hidden"
        >
          <BookOpen className="size-4" /> Read
        </button>
      )}
      <aside
        className={`${readsOpen ? "fixed inset-0 z-30 flex" : "hidden"} flex-col overflow-auto border-stone-300 bg-white lg:sticky lg:top-0 lg:flex lg:h-svh lg:border-l`}
      >
        <div className="flex items-center gap-2 border-b border-stone-200 px-4 py-3">
          <ScrollText className="size-4" />
          <span className="text-sm font-medium">What you may read from here</span>
          <button type="button" className="ml-auto text-xs underline lg:hidden" onClick={() => setReadsOpen(false)}>
            Close
          </button>
        </div>
        <p className="bg-stone-50 px-4 py-2 text-[11px] text-stone-500">
          Every decision is in the audit. So is every read marked with a lock. Opening only what the item allows.
        </p>
        <div className="flex-1 space-y-3 p-4">
          {item.reads.length === 0 && <p className="text-sm text-stone-500">Nothing to open from this item. The facts and the record are all there is.</p>}
          {item.reads.map((r) => (
            <ReadGate key={r} item={item} kind={r} inline={false} />
          ))}
          <p className="flex items-center gap-1 pt-2 text-[11px] text-stone-500">
            <Flag className="size-3" /> To start work for another grant, raise a flag in the Now block.
          </p>
        </div>
      </aside>
    </div>
  );
}
