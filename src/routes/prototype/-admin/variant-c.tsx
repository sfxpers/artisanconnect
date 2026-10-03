// PROTOTYPE, throwaway. Variant C, "Next item": no list.
// One big card for the oldest item waiting across the grants you switch on.
// Facts you need are on the card, the rest folds away. Decide, then the next one arrives.
// Reports, audit, Region edges, and staff sit behind one menu.
import { useState } from "react";
import { ChevronDown, Menu, PartyPopper, SkipForward, X } from "lucide-react";
import * as F from "./fixtures";
import { useAdmin } from "./store";
import { AuditPage, DecisionBlock, Evidence, FirstAdminPage, ReadGate, RegionsPage, ReportsPage, StaffPage, btnGhost } from "./parts";
import type { VariantProps } from "./variant-a";

export function VariantC({ screen, go }: VariantProps) {
  const { me, open, items } = useAdmin();
  const [off, setOff] = useState<F.Grant[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [menu, setMenu] = useState(false);

  const pinned = items.find((i) => i.id === screen);
  const isPage = !pinned && screen !== "queues";

  // oldest first within the grants switched on; a skipped item goes to the back of this view only
  const pool = open.filter((i) => !off.includes(i.grant));
  const ordered = [...pool.filter((i) => !skipped.includes(i.id)), ...pool.filter((i) => skipped.includes(i.id))];
  const card = pinned ?? ordered[0];
  const position = card ? ordered.findIndex((i) => i.id === card.id) + 1 : 0;

  return (
    <div className="min-h-svh bg-stone-900 pb-24 text-stone-900">
      <header className="mx-auto flex max-w-2xl items-center gap-3 px-4 pt-4 text-xs text-stone-300">
        <span className="font-serif text-base text-white italic">ArtisanConnect</span>
        <span className="rounded bg-white/10 px-1.5 py-0.5">Staff · not an Account</span>
        <span className="ml-auto">{me.name}</span>
        <button type="button" onClick={() => setMenu(true)} className="rounded-full bg-white/10 p-1.5 hover:bg-white/20" aria-label="More">
          <Menu className="size-4" />
        </button>
      </header>

      <div className="mx-auto mt-3 flex max-w-2xl flex-wrap items-center gap-1.5 px-4 text-xs">
        {me.grants
          .filter((g) => g !== "operations")
          .map((g) => {
            const n = open.filter((i) => i.grant === g).length;
            const on = !off.includes(g);
            return (
              <button
                key={g}
                type="button"
                onClick={() => {
                  setOff((o) => (on ? [...o, g] : o.filter((x) => x !== g)));
                  go("queues");
                }}
                className={`rounded-full px-2.5 py-1 ${on ? "bg-white text-stone-900" : "bg-white/10 text-stone-400"}`}
              >
                {F.GRANTS.find((x) => x.key === g)!.short} · {n}
              </button>
            );
          })}
        {me.grants.includes("operations") && (
          <button type="button" onClick={() => go("regions")} className="rounded-full bg-white/10 px-2.5 py-1 text-stone-300">
            Operations · powers only
          </button>
        )}
      </div>

      <main className="mx-auto mt-4 max-w-2xl px-4">
        {isPage && <PageSheet screen={screen} go={go} />}
        {!isPage && !card && (
          <div className="rounded-2xl bg-white p-10 text-center">
            <PartyPopper className="mx-auto mb-3 size-8" />
            <p className="font-serif text-2xl">Nothing waiting</p>
            <p className="mt-1 text-sm text-stone-500">Nothing is waiting for the grants switched on.</p>
          </div>
        )}
        {!isPage && card && !me.grants.includes(card.grant) && (
          <p className="rounded-2xl bg-white p-6 text-sm text-red-900">
            This item sits in {F.grantLabel(card.grant)}. You do not hold that grant, so it is not in your queues.
          </p>
        )}
        {!isPage && card && me.grants.includes(card.grant) && (
          <Card
            key={card.id}
            item={card}
            position={pinned ? 0 : position}
            of={ordered.length}
            onSkip={() => {
              setSkipped((s) => [...s, card.id]);
              go("queues");
            }}
            onNext={() => go("queues")}
          />
        )}
      </main>

      {menu && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={() => setMenu(false)}>
          <div className="w-72 bg-stone-100 p-4 text-sm" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="mb-3 ml-auto block" onClick={() => setMenu(false)}>
              <X className="size-4" />
            </button>
            <p className="mb-1 text-[11px] font-medium tracking-wide text-stone-500 uppercase">Anyone with the grant</p>
            {(["reports", "audit", "regions", "staff", "first"] as const).map((p) => (
              <button
                key={p}
                type="button"
                className="block w-full rounded-md px-2 py-2 text-left hover:bg-stone-200"
                onClick={() => {
                  go(p);
                  setMenu(false);
                }}
              >
                {F.PAGE_SCREENS.find((x) => x.key === p)!.label}
              </button>
            ))}
            <button type="button" className="mt-3 block w-full rounded-md px-2 py-2 text-left hover:bg-stone-200" onClick={() => { go("queues"); setMenu(false); }}>
              Back to the next item
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PageSheet({ screen, go }: { screen: string; go: (s: string) => void }) {
  return (
    <div className="rounded-2xl bg-stone-50 p-6">
      <button type="button" onClick={() => go("queues")} className="mb-3 text-xs text-stone-500 underline">
        ← Next item
      </button>
      <h1 className="mb-4 font-serif text-2xl">{F.PAGE_SCREENS.find((p) => p.key === screen)?.label}</h1>
      {screen === "reports" && <ReportsPage />}
      {screen === "audit" && <AuditPage />}
      {screen === "regions" && <RegionsPage />}
      {screen === "staff" && <StaffPage />}
      {screen === "first" && <FirstAdminPage />}
    </div>
  );
}

function Card({ item, position, of, onSkip, onNext }: { item: F.Item; position: number; of: number; onSkip: () => void; onNext: () => void }) {
  const { recorded } = useAdmin();
  const [more, setMore] = useState(false);
  const [reads, setReads] = useState(false);
  const lead = item.facts.slice(0, 3);
  const rest = item.facts.slice(3);
  const done = recorded[item.id];
  return (
    <article className="rounded-2xl bg-stone-50 p-6 shadow-2xl">
      <div className="flex items-center text-[11px] tracking-wide text-stone-500 uppercase">
        <span>
          {F.grantLabel(item.grant)} · {item.kind}
        </span>
        <span className="ml-auto">{position ? `${position} of ${of} waiting` : "Opened directly"}</span>
      </div>
      <h1 className="mt-2 font-serif text-3xl leading-tight">{item.title}</h1>
      <p className="mt-1 text-xs text-stone-500">
        Raised {item.at}
        {item.count ? ` · ${item.count} reports folded into one` : ""}
      </p>

      <dl className="mt-4 grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5 text-sm">
        {lead.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-stone-500">{k}</dt>
            <dd className="whitespace-pre-line">{v}</dd>
          </div>
        ))}
        {more &&
          rest.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-stone-500">{k}</dt>
              <dd className="whitespace-pre-line">{v}</dd>
            </div>
          ))}
      </dl>
      {rest.length > 0 && (
        <button type="button" onClick={() => setMore((v) => !v)} className="mt-2 flex items-center gap-1 text-xs text-stone-500 underline">
          <ChevronDown className={`size-3 ${more ? "rotate-180" : ""}`} /> {more ? "Fewer facts" : `${rest.length} more facts`}
        </button>
      )}

      {item.special && (
        <div className="mt-4">
          <Evidence item={item} />
        </div>
      )}

      {item.reads.length > 0 && (
        <div className="mt-4">
          <button type="button" onClick={() => setReads((v) => !v)} className="flex items-center gap-1 text-sm underline">
            <ChevronDown className={`size-4 ${reads ? "rotate-180" : ""}`} /> Read more ({item.reads.map((r) => F.READ_LABEL[r].label).join(", ")})
          </button>
          {reads && (
            <div className="mt-2 space-y-2">
              {item.reads.map((r) => (
                <ReadGate key={r} item={item} kind={r} />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-6 border-t border-stone-300 pt-5">
        <DecisionBlock item={item} tight />
        {item.notes && (
          <ul className="mt-3 list-disc space-y-0.5 pl-5 text-xs text-stone-500">
            {item.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </div>

      {done && (
        <button type="button" onClick={onNext} className="mt-4 rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white">
          Next item →
        </button>
      )}
      {!done && position > 0 && of > 1 && (
        <button type="button" onClick={onSkip} className={`${btnGhost} mt-4 flex items-center gap-1 text-xs`}>
          <SkipForward className="size-3.5" /> Leave it for now. It stays waiting, and nothing is recorded.
        </button>
      )}
    </article>
  );
}
