// PROTOTYPE, throwaway. Content blocks shared by the three Admin variants.
// Layout, navigation, and where the decision sits are NOT here: each variant owns those.
import { useState, type ReactNode } from "react";
import { BadgeCheck, EyeOff, FileText, Flag, Image as ImageIcon, Lock, ShieldAlert } from "lucide-react";
import * as F from "./fixtures";
import { useAdmin } from "./store";

export const field = "w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-900";
export const btn = "rounded-md px-3 py-2 text-sm font-medium disabled:opacity-40";
export const btnPrimary = `${btn} bg-stone-900 text-white hover:bg-stone-700`;
export const btnDanger = `${btn} bg-red-800 text-white hover:bg-red-700`;
export const btnGhost = `${btn} border border-stone-300 bg-white hover:bg-stone-50`;

export function Proposal({ children }: { children?: ReactNode }) {
  return (
    <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-amber-900 uppercase">
      {children ?? "Proposal, not decided"}
    </span>
  );
}

export function GrantChip({ g, on = true }: { g: F.Grant; on?: boolean }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] ${on ? "bg-stone-900 text-white" : "bg-stone-200 text-stone-500"}`}>
      {F.GRANTS.find((x) => x.key === g)!.short}
    </span>
  );
}

// ---------- an item's facts and evidence ----------

export function Facts({ item }: { item: F.Item }) {
  return (
    <dl className="grid grid-cols-[9rem_1fr] gap-x-4 gap-y-1.5 text-sm">
      {item.facts.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-stone-500">{k}</dt>
          <dd className="whitespace-pre-line">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Tile({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="grid h-24 w-32 place-items-center rounded-md border border-dashed border-stone-400 bg-stone-50 text-center text-[11px] text-stone-500">
      <div className="[&_svg]:mx-auto [&_svg]:mb-1 [&_svg]:size-5">
        {icon}
        {label}
      </div>
    </div>
  );
}

export function Evidence({ item }: { item: F.Item }) {
  if (item.special === "check")
    return (
      <div className="flex flex-wrap gap-3">
        <Tile icon={<FileText />} label={item.id === "v3" ? "New photo" : "Submitted document"} />
        {item.id === "v3" && <Tile icon={<ImageIcon />} label="Same picture on Ayanda's Profile" />}
        {item.id === "v1" && <Tile icon={<FileText />} label="First submission (rejected)" />}
      </div>
    );
  if (item.special === "review")
    return (
      <div className="space-y-3 text-sm">
        <div className="rounded-md border border-stone-300 bg-white p-3">
          <p className="text-[11px] text-stone-500">Review as published 28 Sep · Ruan B. about Ayanda Khumalo · Plumbing</p>
          <p className="mt-1">
            Workmanship 1 · Agreed work 2 · Punctuality 1 · Communication 2
          </p>
          <p className="mt-2 italic">
            "Late and rude. Ask for Mr Abrahams, his foreman, on 082 555 0173 and he will tell you the same. Never again."
          </p>
        </div>
        <div className="rounded-md bg-stone-100 p-3 text-xs text-stone-600">
          <p className="mb-1 font-medium text-stone-800">Reports, folded · Personal data × 3</p>
          <ul className="list-disc pl-4">
            <li>Ayanda Khumalo · "Names my foreman and prints his number."</li>
            <li>Thandi M. · no note</li>
            <li>Mark P. · "Personal number of someone not in this."</li>
          </ul>
          <p className="mt-2">
            Reporters are shown to the Admin and never to the reported Account. <Proposal>Does an Admin see who reported?</Proposal>
          </p>
          <p>Notes are not run through the detector. Each is tied to the version reported.</p>
        </div>
      </div>
    );
  if (item.special === "payout")
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {["Sipho Ndlovu", "Themba Ndlovu"].map((n, i) => (
          <div key={n} className="rounded-md border border-stone-300 bg-white p-3 text-sm">
            <p className="font-medium">{n}</p>
            <p className="text-xs text-stone-500">Artisan Account · Plumbing</p>
            <p className="mt-2 text-xs">Payout account FNB ····4417</p>
            <p className="text-xs">Proof of account: {i === 0 ? "statement, 12 Sep" : "letter, 30 Sep"}</p>
            <p className="text-xs">Name on proof: N. Ndlovu</p>
          </div>
        ))}
      </div>
    );
  if (item.special === "challenge")
    return (
      <div className="space-y-2 text-sm">
        <div className="rounded-md bg-stone-100 p-3 text-xs text-stone-700">
          <p className="mb-1 font-medium text-stone-900">What the Suspension is holding</p>
          <ul className="list-disc pl-4">
            <li>Engagement · Bathroom refit · Paid · R18,400 Quote, nothing Released. No Payout is sent.</li>
            <li>Job · Pantry shelving · Artisan Chosen. Cannot be paid.</li>
            <li>Profile out of view. Unanswered Job Matches withdrawn. One Sent Quote Void.</li>
          </ul>
        </div>
        <p className="text-xs text-stone-600">
          Seven times 24 hours without a challenge, or a failed one, and finance and disputes allocates each of these.
        </p>
      </div>
    );
  return null;
}

// ---------- audited reads ----------

export function ReadView({ item, kind }: { item: F.Item; kind: F.ReadKind }) {
  const money = (c: number) => F.rand(c);
  if (kind === "job")
    return (
      <ol className="space-y-1.5 border-l border-stone-300 pl-4 text-sm">
        {(item.id === "f1" ? F.JOB_RECORD_FOR_F1 : item.record).map((r) => (
          <li key={r.at + r.text}>
            <span className="text-[11px] text-stone-500">{r.at} · </span>
            {r.text}
          </li>
        ))}
      </ol>
    );
  if (kind === "conversation")
    return (
      <div className="space-y-2">
        <p className="text-[11px] text-stone-500">Read only. An Admin may not speak in it. The audit keeps no copy of it.</p>
        {F.CONVERSATION_FOR_F1.map((m) => (
          <div key={m.at} className="rounded-md bg-stone-100 px-3 py-2 text-sm">
            <p className="text-[11px] text-stone-500">
              {m.who} · {m.at}
            </p>
            {m.text}
          </div>
        ))}
      </div>
    );
  if (kind === "figures")
    return (
      <table className="w-full text-sm">
        <tbody>
          {F.QUOTE_FIGURES_FOR_F1.map((q) => (
            <tr key={q.who} className="border-b border-stone-200">
              <td className="py-1">{q.who}</td>
              <td className="py-1 text-right">{money(q.quote)}</td>
              <td className="py-1 pl-3 text-stone-500">{q.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  if (kind === "identity")
    return (
      <p className="font-mono text-sm">
        {F.IDENTITY_NUMBERS[item.id] ?? "810203 5010 08 6"}{" "}
        <span className="font-sans text-[11px] text-stone-500">A correction is not a swap for a different person.</span>
      </p>
    );
  return <p className="text-sm text-stone-600">Reliability Record: no Cancellations, no no-shows, no allocations that Returned money.</p>;
}

/** One gated read. `where` decides how a variant lays the opened content out. */
export function ReadGate({ item, kind, inline = true }: { item: F.Item; kind: F.ReadKind; inline?: boolean }) {
  const { opened, read } = useAdmin();
  const isOpen = opened[item.id]?.includes(kind) ?? false;
  const meta = F.READ_LABEL[kind];
  if (isOpen)
    return (
      <div className="rounded-md border border-stone-300 bg-white p-3">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-stone-500 uppercase">
          {meta.audited && <Lock className="size-3" />} {meta.label}
          {meta.audited && <span className="font-normal normal-case"> · this read is in the audit</span>}
        </p>
        <ReadView item={item} kind={kind} />
      </div>
    );
  return (
    <div className={`rounded-md border border-dashed border-stone-300 bg-stone-50 p-3 ${inline ? "" : "text-center"}`}>
      <p className="text-sm font-medium">{meta.label}</p>
      <p className="mb-2 text-xs text-stone-500">{F.BLOCK_GLOSS[kind]}</p>
      <button type="button" className={btnGhost} onClick={() => read(item, kind)}>
        {meta.audited ? <><EyeOff className="mr-1 inline size-3.5" /> Open · audited</> : "Open"}
      </button>
      {meta.audited && <p className="mt-1.5 text-[11px] text-stone-500">{meta.audited}</p>}
    </div>
  );
}

// ---------- the decision ----------

export function DecisionBlock({ item, tight = false }: { item: F.Item; tight?: boolean }) {
  const { me, recorded, decide, raiseFlag } = useAdmin();
  const done = recorded[item.id];
  const [key, setKey] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [release, setRelease] = useState(85000);
  const [alsoLeaving, setAlsoLeaving] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagGrant, setFlagGrant] = useState<F.Grant>("safety");

  const recorderBlocked = item.id === "v5" && me.name === "Nomsa Dlamini";
  const d = item.decisions.find((x) => x.key === key);

  if (done)
    return (
      <div className="rounded-md bg-stone-100 p-3 text-sm">
        <p className="flex items-center gap-1.5 font-medium">
          <BadgeCheck className="size-4" /> {done.decision.label}
          {done.reason && <span className="font-normal text-stone-600"> · {done.reason}</span>}
        </p>
        <p className="mt-1 text-xs text-stone-600">
          Recorded by {done.by}, {done.at}. The first recorded decision stands: a second Admin cannot override it and the same Admin cannot reopen it.
        </p>
        <p className="mt-1 text-xs text-stone-600">{done.decision.effect}</p>
        <p className="mt-1 text-xs text-stone-600">{done.decision.tell ?? "Nobody is told."}</p>
        {done.note && <p className="mt-1 text-xs text-stone-600">{done.note}</p>}
      </div>
    );

  if (recorderBlocked)
    return (
      <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
        <p className="flex items-center gap-1.5 font-medium">
          <ShieldAlert className="size-4" /> You recorded this Suspension, so you cannot hear its challenge.
        </p>
        <p className="mt-1 text-xs">A different person who holds verification hears it. Switch "Acting as" to Kabelo Mahlangu to see the hearing.</p>
      </div>
    );

  const heldPart = 130000;
  const ret = heldPart - release;
  const fee = F.pctOf(release, 10);
  const protection = F.pctOf(ret, 2.5);

  const raiseTargets = F.GRANTS.filter((g) => g.key !== "operations" && g.key !== item.grant);

  return (
    <div className="space-y-3">
      {item.special === "allocation" && (
        <div className="rounded-md border border-stone-300 bg-white p-3 text-sm">
          <p className="mb-2 font-medium">Split the R1,300 that is still held</p>
          <input
            type="range"
            min={0}
            max={heldPart}
            step={5000}
            value={release}
            onChange={(e) => setRelease(Number(e.target.value))}
            className="w-full"
          />
          <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="font-medium">Release to Sipho · {F.rand(release)}</p>
              <p className="text-stone-500">Artisan Fee 10% · {F.rand(fee)} · Payout {F.rand(release - fee)}</p>
            </div>
            <div>
              <p className="font-medium">Return to Thandi M. · {F.rand(ret)}</p>
              <p className="text-stone-500">plus Protection Fee on that part · {F.rand(protection)} · back {F.rand(ret + protection)}</p>
            </div>
          </div>
          {ret > 0 && (
            <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">
              Returning any amount is recorded on Sipho's Reliability Record by rule.
            </p>
          )}
        </div>
      )}

      <div className={`grid gap-2 ${tight ? "" : "sm:grid-cols-2"}`}>
        {item.decisions.map((x) => (
          <button
            key={x.key}
            type="button"
            onClick={() => {
              setKey(x.key);
              setConfirm(false);
              setReason("");
            }}
            className={`rounded-lg border p-3 text-left text-sm transition ${
              key === x.key ? "border-stone-900 bg-white ring-1 ring-stone-900" : "border-stone-300 bg-white hover:border-stone-500"
            }`}
          >
            <span className="font-medium">{x.label}</span>
            <span className="mt-1 block text-xs text-stone-500">{x.effect}</span>
          </button>
        ))}
      </div>

      {d && (
        <div className="rounded-md bg-stone-100 p-3 text-sm">
          {d.reasons && (
            <div className="mb-2">
              <label className="mb-1 block text-xs font-medium">Fixed reason</label>
              <select className={field} value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="">Choose a reason</option>
                {d.reasons.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </div>
          )}
          {item.special === "review" && d.key === "remove" && (
            <label className="mb-2 flex items-center gap-2 text-xs">
              <input type="checkbox" checked={alsoLeaving} onChange={(e) => setAlsoLeaving(e.target.checked)} />
              The comment was also Leaving (the ladder still binds: warning 1 of 3)
            </label>
          )}
          <p className="text-xs text-stone-600">{d.tell ?? "Nobody is told."}</p>
          {!confirm ? (
            <button
              type="button"
              disabled={!!d.reasons && !reason}
              onClick={() => setConfirm(true)}
              className={`${d.tone === "danger" ? btnDanger : btnPrimary} mt-2`}
            >
              {d.label}
            </button>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs">This cannot be reopened or overridden. Record it?</span>
              <button
                type="button"
                className={d.tone === "danger" ? btnDanger : btnPrimary}
                onClick={() =>
                  decide(
                    item,
                    d,
                    reason || undefined,
                    item.special === "allocation"
                      ? `Released ${F.rand(release)} (fee ${F.rand(fee)}), Returned ${F.rand(ret)} (+ ${F.rand(protection)} Protection Fee).`
                      : alsoLeaving
                        ? "Also recorded as Leaving: warning 1 of 3."
                        : undefined,
                  )
                }
              >
                Record
              </button>
              <button type="button" className={btnGhost} onClick={() => setConfirm(false)}>
                Not yet
              </button>
            </div>
          )}
        </div>
      )}

      <div className="text-xs text-stone-500">
        <button type="button" onClick={() => setFlagOpen((v) => !v)} className="inline-flex items-center gap-1 underline">
          <Flag className="size-3" /> Raise a flag from this item
        </button>
        {flagOpen && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-stone-300 bg-white p-2">
            <span>Names only this object and the grant that decides:</span>
            <select className="rounded border border-stone-300 px-2 py-1" value={flagGrant} onChange={(e) => setFlagGrant(e.target.value as F.Grant)}>
              {raiseTargets.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={btnGhost}
              onClick={() => {
                raiseFlag(item, flagGrant);
                setFlagOpen(false);
              }}
            >
              Raise · audited
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- pages that are not a queue ----------

export function ReportsPage() {
  const [p, setP] = useState<(typeof F.REPORT_PERIODS)[number]["key"]>("30");
  const factor = F.REPORT_PERIODS.find((x) => x.key === p)!.factor;
  const show = (r: (typeof F.REPORT_ROWS)[number]) =>
    r.kind === "money" ? F.rand(Math.round(r.base * factor)) : r.kind === "rate" ? `${r.base}%` : Math.round(r.base * factor).toLocaleString("en-US");
  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-sm">
        <span className="text-stone-500">Period</span>
        <select className="rounded border border-stone-300 bg-white px-2 py-1" value={p} onChange={(e) => setP(e.target.value as typeof p)}>
          {F.REPORT_PERIODS.map((x) => (
            <option key={x.key} value={x.key}>
              {x.label}
            </option>
          ))}
        </select>
        <Proposal>Period not decided</Proposal>
      </div>
      <table className="w-full max-w-xl text-sm">
        <tbody>
          {F.REPORT_ROWS.map((r) => (
            <tr key={r.label} className="border-b border-stone-200">
              <td className="py-2">{r.label}</td>
              <td className="py-2 text-right font-medium tabular-nums">{show(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 max-w-xl text-xs text-stone-500">
        No targets. Any Admin may read these. Protection Fee and Artisan Fee are separate. The Leaving count is found Leavings only; refused sends are counted apart.
      </p>
    </div>
  );
}

export function AuditPage() {
  const { audit, me } = useAdmin();
  const [g, setG] = useState<F.Grant | "all">("all");
  const rows = audit.filter((r) => me.grants.includes(r.grant) && (g === "all" || r.grant === g));
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-stone-500">Grant</span>
        {(["all", ...me.grants] as const).map((x) => (
          <button
            key={x}
            type="button"
            onClick={() => setG(x)}
            className={`rounded-full px-2.5 py-0.5 text-xs ${g === x ? "bg-stone-900 text-white" : "bg-stone-200"}`}
          >
            {x === "all" ? "All mine" : F.grantLabel(x)}
          </button>
        ))}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-300 text-left text-[11px] text-stone-500 uppercase">
            <th className="py-1.5 font-medium">When</th>
            <th className="font-medium">Who</th>
            <th className="font-medium">What</th>
            <th className="font-medium">Object</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.at + r.what + r.object} className="border-b border-stone-200 align-top">
              <td className="py-1.5 whitespace-nowrap text-stone-500">{r.at}</td>
              <td className="pr-3">{r.who}</td>
              <td className="pr-3">
                {r.kind === "read" && <Lock className="mr-1 inline size-3 text-stone-500" />}
                {r.what}
              </td>
              <td className="text-stone-600">{r.object}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-stone-500">
        You read the audit of the grants you hold. Every decision is here (who, what, when), and every read of a Conversation, Reliability Record, prior Quote figures, or Identity Number. A glance at a queue is not here. Reading this is not audited.
      </p>
    </div>
  );
}

export function RegionsPage() {
  const { me, suburbs, addSuburb } = useAdmin();
  const [name, setName] = useState("");
  const [district, setDistrict] = useState<string>(F.DISTRICTS[0].name);
  const [err, setErr] = useState<string | null>(null);
  const can = me.grants.includes("operations");
  return (
    <div className="space-y-5">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-300 text-left text-[11px] text-stone-500 uppercase">
            <th className="py-1.5 font-medium">Region (City district)</th>
            <th className="text-right font-medium">Suburbs</th>
            <th className="text-right font-medium">Jobs ever</th>
            <th className="text-right font-medium">Artisans selected</th>
            <th className="pl-4 font-medium">Close</th>
          </tr>
        </thead>
        <tbody>
          {F.DISTRICTS.map((d) => {
            const added = suburbs.filter((s) => s.district === d.name).length;
            const closable = d.jobsEver === 0 && d.artisans === 0;
            return (
              <tr key={d.name} className="border-b border-stone-200">
                <td className="py-2">{d.name}</td>
                <td className="text-right tabular-nums">{d.suburbs + added}</td>
                <td className="text-right tabular-nums">{d.jobsEver}</td>
                <td className="text-right tabular-nums">{d.artisans}</td>
                <td className="pl-4 text-xs text-stone-500">{closable ? "Can close" : "In use, cannot close"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="max-w-xl rounded-md border border-stone-300 bg-white p-4">
        <p className="text-sm font-medium">Add a suburb the City has newly created</p>
        <p className="mb-3 text-xs text-stone-500">
          Name it as the City names it and choose its district. A site already placed does not move. No one is told.
        </p>
        <div className="flex flex-wrap gap-2">
          <input className={`${field} max-w-56`} placeholder="Suburb" value={name} onChange={(e) => setName(e.target.value)} disabled={!can} />
          <select className={`${field} max-w-56`} value={district} onChange={(e) => setDistrict(e.target.value)} disabled={!can}>
            {F.DISTRICTS.map((d) => (
              <option key={d.name}>{d.name}</option>
            ))}
          </select>
          <button
            type="button"
            className={btnPrimary}
            disabled={!can}
            onClick={() => {
              const e = addSuburb(name, district);
              setErr(e);
              if (!e) setName("");
            }}
          >
            Add · audited
          </button>
        </div>
        {!can && <p className="mt-2 text-xs text-red-800">You do not hold marketplace operations.</p>}
        {err && <p className="mt-2 text-xs text-red-800">{err}</p>}
        {suburbs.length > 0 && (
          <ul className="mt-3 text-xs text-stone-600">
            {suburbs.map((s) => (
              <li key={s.name}>
                {s.name} added to {s.district}, {s.at}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="max-w-xl text-xs text-stone-500">
        An Admin cannot move, rename, or remove a suburb, redraw a district, or open another Region at this launch. There is no category editor.
      </p>
    </div>
  );
}

export function StaffPage() {
  const { me, staff, giveGrant, takeGrant, invite } = useAdmin();
  const [email, setEmail] = useState("");
  const [picked, setPicked] = useState<F.Grant[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const can = me.grants.includes("operations");
  const holders = (g: F.Grant) => staff.filter((s) => s.grants.includes(g)).length;
  return (
    <div className="space-y-5">
      <p className="text-xs text-stone-600">
        <Proposal>Everything on this page is a proposal</Proposal> The map decides that a grant exists only because it was given in this product, and that the product must allow two Admins. It does not decide who gives a grant or how.
      </p>
      <div className="space-y-3">
        {staff.map((s) => (
          <div key={s.id} className="rounded-md border border-stone-300 bg-white p-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <p className="font-medium">{s.name}</p>
              <p className="text-xs text-stone-500">{s.email}</p>
              <p className="ml-auto text-xs text-stone-500">
                {s.invited ? s.since : `since ${s.since}`} · given by {s.givenBy}
              </p>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {F.GRANTS.map((g) => {
                const has = s.grants.includes(g.key);
                return (
                  <button
                    key={g.key}
                    type="button"
                    disabled={!can}
                    onClick={() => setMsg((has ? takeGrant : giveGrant)(s.id, g.key))}
                    title={has ? "Take this grant" : "Give this grant"}
                    className={`rounded-full border px-2.5 py-0.5 text-xs ${has ? "border-stone-900 bg-stone-900 text-white" : "border-dashed border-stone-400 text-stone-500"} disabled:opacity-50`}
                  >
                    {has ? "" : "+ "}
                    {g.short}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {msg && <p className="text-xs text-red-800">{msg}</p>}
      <div className="max-w-xl rounded-md border border-stone-300 bg-white p-4">
        <p className="text-sm font-medium">Invite staff</p>
        <p className="mb-2 text-xs text-stone-500">
          The invited person proves the address with an Email code and signs in as staff. An address that already holds an Account cannot be staff. Marketplace operations gives and takes grants; nobody changes their own; a grant is never taken from its last holder.
        </p>
        <input className={field} placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!can} />
        <div className="my-2 flex flex-wrap gap-3 text-xs">
          {F.GRANTS.map((g) => (
            <label key={g.key} className="flex items-center gap-1">
              <input
                type="checkbox"
                disabled={!can}
                checked={picked.includes(g.key)}
                onChange={(e) => setPicked((p) => (e.target.checked ? [...p, g.key] : p.filter((x) => x !== g.key)))}
              />
              {g.short}
            </label>
          ))}
        </div>
        <button
          type="button"
          className={btnPrimary}
          disabled={!can}
          onClick={() => {
            const e = invite(email, picked);
            setMsg(e);
            if (!e) {
              setEmail("");
              setPicked([]);
            }
          }}
        >
          Send invitation · audited
        </button>
        {!can && <p className="mt-2 text-xs text-red-800">You do not hold marketplace operations.</p>}
      </div>
      <p className="text-xs text-stone-500">
        Holders: {F.GRANTS.map((g) => `${g.short} ${holders(g.key)}`).join(" · ")}.{" "}
        {staff.length < 2 && "Only one Admin: a challenge cannot be heard."}
      </p>
    </div>
  );
}

export function FirstAdminPage() {
  const [step, setStep] = useState(0);
  const [code, setCode] = useState("");
  return (
    <div className="max-w-xl space-y-4 text-sm">
      <p className="text-xs text-stone-600">
        <Proposal>Proposal</Proposal> Staff cannot be created through the auth plugin's user management (it is off), and no Admin exists to give the first grant. This page exists only while no Admin exists, then it is gone.
      </p>
      <ol className="space-y-3">
        <li className={`rounded-md border p-3 ${step === 0 ? "border-stone-900 bg-white" : "border-stone-200 bg-stone-100 text-stone-500"}`}>
          <p className="font-medium">1 · The setup code</p>
          <p className="text-xs">A one-time code set as a Worker secret when the product is deployed. Whoever deployed it has it.</p>
          {step === 0 && (
            <div className="mt-2 flex gap-2">
              <input className={field} placeholder="Setup code" value={code} onChange={(e) => setCode(e.target.value)} />
              <button type="button" className={btnPrimary} disabled={!code} onClick={() => setStep(1)}>
                Continue
              </button>
            </div>
          )}
        </li>
        <li className={`rounded-md border p-3 ${step === 1 ? "border-stone-900 bg-white" : "border-stone-200 bg-stone-100 text-stone-500"}`}>
          <p className="font-medium">2 · Prove an address</p>
          <p className="text-xs">An Email code, valid 10 minutes, works once. The address cannot already hold an Account.</p>
          {step === 1 && (
            <div className="mt-2 flex gap-2">
              <input className={field} placeholder="you@example.com" />
              <button type="button" className={btnPrimary} onClick={() => setStep(2)}>
                Send code
              </button>
            </div>
          )}
        </li>
        <li className={`rounded-md border p-3 ${step === 2 ? "border-stone-900 bg-white" : "border-stone-200 bg-stone-100 text-stone-500"}`}>
          <p className="font-medium">3 · All four grants, once</p>
          <p className="text-xs">
            The first Admin holds verification, trust and safety, finance and disputes, and marketplace operations, audited as "created by setup". The code stops working. This page is gone for good.
          </p>
          {step === 2 && (
            <button type="button" className={`${btnPrimary} mt-2`} onClick={() => setStep(3)}>
              Create the first Admin
            </button>
          )}
        </li>
      </ol>
      {step === 3 && (
        <p className="rounded-md bg-stone-100 p-3 text-xs">
          Done. One Admin exists, and a challenge cannot be heard until a second one does, so marketplace operations is asked to invite one.
        </p>
      )}
    </div>
  );
}
