// PROTOTYPE, throwaway. Variant A, "Desk": a back-office inbox.
// Left rail: the grants you hold, with counts. Middle: that grant's items, oldest first.
// Right: the selected item, its facts and evidence, tabs for what may be read, and the decision.
// Reports, audit, Region edges, and staff are pages reached from the rail.
import { useState } from "react";
import { Check, Inbox } from "lucide-react";
import * as F from "./fixtures";
import { countsFor, useAdmin } from "./store";
import { DecisionBlock, Evidence, Facts, GrantChip, ReadGate, AuditPage, FirstAdminPage, RegionsPage, ReportsPage, StaffPage } from "./parts";

export type VariantProps = { screen: string; go: (s: string) => void };

const PAGES: { key: F.PageKey; label: string }[] = [
  { key: "reports", label: "Reports" },
  { key: "audit", label: "Audit" },
  { key: "regions", label: "Region edges" },
  { key: "staff", label: "Staff and grants" },
];

export function VariantA({ screen, go }: VariantProps) {
  const { me, visible, open, recorded, items } = useAdmin();
  const item = items.find((i) => i.id === screen);
  const isPage = !item && screen !== "queues";
  const [grantSel, setGrantSel] = useState<F.Grant>(item?.grant ?? me.grants.find((g) => g !== "operations") ?? "verification");
  const grant = item && me.grants.includes(item.grant) ? item.grant : grantSel;
  const counts = countsFor(open);
  const list = visible.filter((i) => i.grant === grant);

  return (
    <div className="flex min-h-svh flex-col bg-stone-50 pb-20 text-stone-900">
      <header className="flex items-center gap-3 bg-stone-900 px-4 py-2 text-xs text-stone-300">
        <span className="font-serif text-sm text-white italic">ArtisanConnect</span>
        <span className="rounded bg-white/10 px-1.5 py-0.5">Staff · not an Account</span>
        <span className="ml-auto">{me.name}</span>
        <span className="hidden gap-1 sm:flex">
          {me.grants.map((g) => (
            <GrantChip key={g} g={g} />
          ))}
        </span>
      </header>
      <div className="flex flex-1">
        <nav className="w-56 shrink-0 border-r border-stone-200 bg-stone-100 p-3 text-sm">
          <p className="mb-1 text-[11px] font-medium tracking-wide text-stone-500 uppercase">Queues</p>
          {F.GRANTS.map((g) => {
            const held = me.grants.includes(g.key);
            const active = !isPage && grant === g.key;
            return (
              <button
                key={g.key}
                type="button"
                disabled={!held}
                onClick={() => {
                  setGrantSel(g.key);
                  go("queues");
                }}
                className={`mb-0.5 flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left ${active ? "bg-stone-900 text-white" : held ? "hover:bg-stone-200" : "text-stone-400"}`}
              >
                <span>{g.short}</span>
                <span className={`text-xs ${active ? "text-stone-300" : "text-stone-500"}`}>
                  {!held ? "not held" : g.key === "operations" ? "no queue" : counts[g.key]}
                </span>
              </button>
            );
          })}
          <p className="mt-4 mb-1 text-[11px] font-medium tracking-wide text-stone-500 uppercase">Anyone with the grant</p>
          {PAGES.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => go(p.key)}
              className={`mb-0.5 block w-full rounded-md px-2 py-1.5 text-left ${screen === p.key ? "bg-stone-900 text-white" : "hover:bg-stone-200"}`}
            >
              {p.label}
            </button>
          ))}
        </nav>

        {isPage ? (
          <main className="flex-1 overflow-auto p-6">
            <h1 className="mb-4 font-serif text-2xl">{F.PAGE_SCREENS.find((p) => p.key === screen)?.label}</h1>
            {screen === "reports" && <ReportsPage />}
            {screen === "audit" && <AuditPage />}
            {screen === "regions" && <RegionsPage />}
            {screen === "staff" && <StaffPage />}
            {screen === "first" && <FirstAdminPage />}
          </main>
        ) : (
          <>
            <section className="w-80 shrink-0 overflow-auto border-r border-stone-200 bg-white">
              <div className="border-b border-stone-200 px-4 py-3">
                <p className="font-medium">{F.grantLabel(grant)}</p>
                <p className="text-xs text-stone-500">Oldest first. Any Admin holding the grant may decide.</p>
              </div>
              {list.length === 0 && (
                <div className="p-6 text-center text-sm text-stone-500">
                  <Inbox className="mx-auto mb-2 size-6" />
                  {grant === "operations" ? "Nothing waits in marketplace operations. It holds powers: Region edges and staff." : "Nothing here."}
                </div>
              )}
              {list.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => go(i.id)}
                  className={`block w-full border-b border-stone-100 px-4 py-3 text-left text-sm ${screen === i.id ? "bg-stone-100" : "hover:bg-stone-50"} ${recorded[i.id] ? "opacity-50" : ""}`}
                >
                  <span className="flex items-center gap-2 text-[11px] text-stone-500">
                    {recorded[i.id] && <Check className="size-3" />}
                    {i.kind} · {i.at}
                    {i.count && <span className="ml-auto rounded-full bg-stone-200 px-1.5 text-stone-700">× {i.count}</span>}
                  </span>
                  <span className="mt-0.5 block font-medium">{i.title}</span>
                </button>
              ))}
            </section>
            <main className="min-w-0 flex-1 overflow-auto p-6">
              {!item && <p className="text-sm text-stone-500">Pick an item. Looking at a queue is not audited.</p>}
              {item && !me.grants.includes(item.grant) && (
                <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
                  This item sits in {F.grantLabel(item.grant)}. You do not hold that grant, so it is not in your queues.
                </p>
              )}
              {item && me.grants.includes(item.grant) && <Detail key={item.id} item={item} />}
            </main>
          </>
        )}
      </div>
    </div>
  );
}

function Detail({ item }: { item: F.Item }) {
  const [tab, setTab] = useState<string>(item.reads[0] ?? "");
  const reads = item.reads;
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <p className="text-[11px] tracking-wide text-stone-500 uppercase">
          {item.kind} · {item.object}
        </p>
        <h1 className="font-serif text-2xl">{item.title}</h1>
      </div>
      <Facts item={item} />
      <Evidence item={item} />
      {item.notes && (
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-stone-500">
          {item.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {reads.length > 0 && (
        <div>
          <div className="mb-2 flex gap-1 border-b border-stone-200">
            {reads.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setTab(r)}
                className={`-mb-px border-b-2 px-3 py-1.5 text-sm ${tab === r ? "border-stone-900 font-medium" : "border-transparent text-stone-500"}`}
              >
                {F.READ_LABEL[r].label}
                {F.READ_LABEL[r].audited && " 🔒"}
              </button>
            ))}
          </div>
          {tab && <ReadGate item={item} kind={tab as F.ReadKind} />}
        </div>
      )}
      <div className="border-t border-stone-300 pt-4">
        <p className="mb-2 text-[11px] font-medium tracking-wide text-stone-500 uppercase">Decide</p>
        <DecisionBlock item={item} />
      </div>
    </div>
  );
}
