// PROTOTYPE, throwaway. The shell and the screens that have one design in both variants:
// landing, My Jobs, browse, invite list, Regions, Payouts and Reliability Record.
import { useState, type ReactNode } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FilePlus2,
  Hammer,
  Scale,
  UserX,
} from "lucide-react";
import * as F from "./fixtures";
import {
  Badge,
  btn,
  btnLight,
  Chips,
  Demo,
  field,
  ink,
  Label,
  Note,
  Pill,
  Proposal,
  RecordItem,
  RecordList,
  useRegions,
  type ScreenProps,
} from "./parts";

const LAUNCH = "/prototype/launch?variant=B&screen=";

// ---------- the shell ----------

export function Shell({
  screen,
  go,
  children,
}: {
  screen: F.ScreenKey;
  go: (s: F.ScreenKey) => void;
  children: ReactNode;
}) {
  const who = F.screenOf(screen).who;
  const link = (key: F.ScreenKey, label: string, current = false) => (
    <button
      key={key + label}
      type="button"
      onClick={() => go(key)}
      className={`text-xs ${current ? "font-semibold underline underline-offset-4" : "text-stone-600 hover:underline"}`}
    >
      {label}
    </button>
  );
  return (
    <div className={`min-h-svh bg-stone-100 pb-28 ${ink}`}>
      <header className="border-b border-stone-300 bg-stone-100/90 px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <button type="button" onClick={() => go("landing")} className="font-serif text-lg italic">
            ArtisanConnect
          </button>
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {who === "Visitor" && (
              <>
                {link("browse", "Browse Artisans", screen === "browse")}
                {link("signup", "Join", screen === "signup")}
              </>
            )}
            {who === "Client" && (
              <>
                {link("jobs", "Jobs", screen === "jobs")}
                {link("browse", "Browse Artisans", screen === "browse" || screen === "invite")}
                {link("settings-client", "Account", screen === "settings-client")}
              </>
            )}
            {who === "Artisan" && (
              <>
                <a href={`${LAUNCH}home`} className="text-xs text-stone-600 hover:underline">
                  Home
                </a>
                {link("profile-edit", "Profile", screen === "profile-edit")}
                {link("regions", "Regions", screen === "regions")}
                {link("payouts", "Payouts", screen === "payouts")}
                {link("settings-artisan", "Account", screen === "settings-artisan")}
              </>
            )}
          </nav>
          <span className="ml-auto text-xs text-stone-500">
            {who === "Visitor" ? "Visitor" : who === "Client" ? "Thandi M." : "Sipho Ndlovu"}
          </span>
        </div>
      </header>
      {children}
    </div>
  );
}

export function Page({
  title,
  kicker,
  children,
  wide,
}: {
  title: string;
  kicker?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <main className={`mx-auto px-4 py-8 sm:px-8 ${wide ? "max-w-6xl" : "max-w-3xl"}`}>
      {kicker && <p className="text-xs tracking-wide text-stone-500 uppercase">{kicker}</p>}
      <h1 className="mt-1 font-serif text-3xl">{title}</h1>
      <div className="mt-6">{children}</div>
    </main>
  );
}

// ---------- landing (Visitor) ----------

export function Landing({ go }: ScreenProps) {
  return (
    <main className="mx-auto max-w-5xl px-4 py-12 sm:px-8">
      <p className="text-xs tracking-wide text-stone-500 uppercase">Cape Town</p>
      <h1 className="mt-2 max-w-2xl font-serif text-4xl leading-tight sm:text-5xl">
        Hire a checked Artisan for the work on your home or premises.
      </h1>
      <p className="mt-4 max-w-xl text-stone-700">
        Post a Job with photos. Artisans checked for that trade send Quotes. You pay on
        ArtisanConnect, the work is done, and you Release the money after Completion.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" className={btn} onClick={() => go("signup")}>
          Post a Job <ArrowRight className="size-4" />
        </button>
        <button type="button" className={btnLight} onClick={() => go("signup")}>
          I am an Artisan
        </button>
        <button type="button" className={btnLight} onClick={() => go("jobs")}>
          Sign in
        </button>
      </div>

      <section className="mt-14 grid gap-10 lg:grid-cols-[1fr_340px]">
        <div>
          <h2 className="font-serif text-xl">How a Job goes</h2>
          <RecordList>
            <RecordItem
              icon={<FilePlus2 />}
              title="You post a Job"
              body="Only the Artisans we offer it to, or you invite, can see it. There is no public board."
            />
            <RecordItem
              icon={<ChevronRight />}
              title="Artisans send Quotes"
              body="Up to five. You choose, and the Artisan confirms the dates you entered."
            />
            <RecordItem
              icon={<Check />}
              title="You pay in full, before the work"
              body="The Quote plus a Protection Fee. Nothing is Released before the Artisan states Completion."
            />
            <RecordItem
              icon={<Hammer />}
              title="You Release in parts, or silence does"
              body="If something is wrong you can open a Dispute on the part not yet Released."
            />
          </RecordList>
        </div>
        <div>
          <h2 className="font-serif text-xl">Browse by trade</h2>
          <p className="mt-1 text-xs text-stone-500">A Profile shows no phone, email, or street.</p>
          <ul className="mt-3 divide-y divide-stone-200 rounded-xl border border-stone-300 bg-white">
            {F.CATEGORIES.map((c) => (
              <li key={c}>
                <button
                  type="button"
                  onClick={() => go("browse")}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-stone-50"
                >
                  {c} <ChevronRight className="size-4 text-stone-400" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <p className="mt-14 border-t border-stone-300 pt-4 text-[11px] text-stone-500">
        Headline and copy are placeholders. A badge is a completed check, not a guarantee, and the
        page says no more than that.
      </p>
    </main>
  );
}

// ---------- My Jobs and drafts (Client) ----------

const statusTone = (s: F.JobStatus) =>
  s === "Disputed" || s === "Out of view"
    ? "warn"
    : s === "Completed"
      ? "good"
      : s === "Draft" || s === "Open" || s === "Artisan Chosen"
        ? "dark"
        : "plain";

const WAITING: F.JobStatus[] = ["Paid", "Disputed", "Out of view"];

const group = (s: F.JobStatus) =>
  ["Draft", "Open", "Artisan Chosen", "Awaiting release", "Completed", "Out of view"].includes(s)
    ? "Needs you"
    : ["Paid", "Disputed"].includes(s)
      ? "In progress"
      : "Finished";

export function Jobs({ go }: ScreenProps) {
  const [rulesChanged, setRulesChanged] = useState(false);
  const [discarded, setDiscarded] = useState<string[]>([]);
  const jobs = F.clientJobs.filter((j) => !discarded.includes(j.title));
  const groups = ["Needs you", "In progress", "Finished"] as const;
  const gated = (j: (typeof jobs)[number]) =>
    rulesChanged && (j.status === "Artisan Chosen" || j.status === "Draft");

  return (
    <Page title="Your Jobs" kicker="Client">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={btn} onClick={() => go("jobs")}>
          <FilePlus2 className="size-4" /> Post a Job
        </button>
        <span className="text-xs text-stone-500">
          A Job is private. Only Artisans you invite or we offer it to can see it.
        </span>
      </div>

      {rulesChanged && (
        <div className="mt-5">
          <Note tone="warn">
            The marketplace rules changed. Accept them before a Job can be matched or paid. Nothing
            else waits on this.{" "}
            <button type="button" className="underline" onClick={() => setRulesChanged(false)}>
              Read and accept
            </button>
            <Proposal>shown as a banner above the list</Proposal>
          </Note>
        </div>
      )}

      <div className="mt-8 space-y-9">
        {groups.map((g) => {
          const rows = jobs.filter((j) => group(j.status) === g);
          if (!rows.length) return null;
          return (
            <section key={g}>
              <h2 className="mb-2 text-[11px] font-medium tracking-wide text-stone-500 uppercase">
                {g}
              </h2>
              <ul className="divide-y divide-stone-200 rounded-xl border border-stone-300 bg-white">
                {rows.map((j) => (
                  <li
                    key={j.title}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill tone={statusTone(j.status)}>{j.status}</Pill>
                        <a
                          href={`${LAUNCH}quotes`}
                          className="truncate text-sm font-medium hover:underline"
                        >
                          {j.title}
                        </a>
                      </div>
                      <p className="mt-0.5 text-xs text-stone-500">
                        {j.category}
                        {j.region ? ` · ${j.region}` : " · no site placed yet"}
                        {j.with ? ` · with ${j.with}` : ""} · {j.sub}
                      </p>
                    </div>
                    {j.status === "Draft" ? (
                      <span className="flex gap-2">
                        <button
                          type="button"
                          className={btn}
                          disabled={gated(j)}
                          onClick={() => go("jobs")}
                        >
                          {gated(j) ? "Accept the rules first" : "Continue"}
                        </button>
                        <button
                          type="button"
                          className={btnLight}
                          onClick={() => setDiscarded((d) => [...d, j.title])}
                        >
                          Discard
                        </button>
                      </span>
                    ) : j.now ? (
                      WAITING.includes(j.status) ? (
                        <a
                          href={`${LAUNCH}${j.status === "Disputed" ? "dispute" : "engagement"}`}
                          className="text-xs text-stone-500 underline"
                        >
                          {j.now}
                        </a>
                      ) : (
                        <a
                          href={`${LAUNCH}${j.status === "Open" ? "quotes" : j.status === "Awaiting release" ? "release" : j.status === "Completed" ? "review" : "engagement"}`}
                          className={gated(j) ? `${btnLight} pointer-events-none opacity-50` : btn}
                        >
                          {gated(j) ? "Accept the rules first" : j.now}
                        </a>
                      )
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {discarded.length > 0 && (
          <p className="text-xs text-stone-500">
            Discarded a draft. A draft that never became matchable leaves no trace.{" "}
            <button type="button" className="underline" onClick={() => setDiscarded([])}>
              Bring it back (prototype)
            </button>
          </p>
        )}
      </div>

      <div className="mt-8">
        <Demo>
          marketplace rules changed:
          <Chips
            value={rulesChanged ? "yes" : "no"}
            options={["no", "yes"] as const}
            onChange={(v) => setRulesChanged(v === "yes")}
          />
        </Demo>
      </div>
      <p className="mt-6 text-[11px] text-stone-500">
        Rows open the Job record from the launch interface prototype. Every status here is one of
        those decided for a Job.
      </p>
    </Page>
  );
}

// ---------- browse a Service Category ----------

function ListingRow({ l, action }: { l: F.Listing; action?: ReactNode }) {
  return (
    <li
      className={`flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-4 ${l.available ? "" : "bg-stone-50"}`}
    >
      <span
        className={`grid size-11 shrink-0 place-items-center rounded-full text-sm font-medium ${l.available ? "bg-stone-900 text-white" : "bg-stone-300 text-stone-600"}`}
      >
        {l.name
          .split(" ")
          .map((w) => w[0])
          .join("")}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <a href={`${LAUNCH}profile`} className="font-medium hover:underline">
            {l.name}
          </a>
          {l.average !== undefined ? (
            <span className="text-sm">
              {l.average.toFixed(1)}{" "}
              <span className="text-xs text-stone-500">
                · {l.reviews} Reviews in {l.category}
              </span>
            </span>
          ) : (
            <span className="text-xs text-stone-500">No Reviews in {l.category} yet</span>
          )}
          {!l.available && <Pill>Not available for Jobs now</Pill>}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {l.badges.map((b) => (
            <Badge key={b.name} {...b} />
          ))}
        </div>
        <p className="mt-1.5 text-xs text-stone-500">
          {l.services.join(" · ")} — {l.regions.join(", ")}
        </p>
      </div>
      {action}
    </li>
  );
}

export function Browse({ go }: ScreenProps) {
  const [category, setCategory] = useState<F.Category>("Plumbing");
  const [region, setRegion] = useState("");
  const rows = F.LISTINGS.filter(
    (l) => l.category === category && (!region || l.regions.includes(region)),
  ).sort(F.browseOrder);
  return (
    <Page title="Browse Artisans" kicker="Visitor or Client" wide>
      <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
        <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
          <div>
            <Label>Service Category</Label>
            <ul className="rounded-xl border border-stone-300 bg-white">
              {F.CATEGORIES.map((c) => (
                <li key={c}>
                  <button
                    type="button"
                    onClick={() => setCategory(c)}
                    className={`w-full px-3 py-2 text-left text-sm ${c === category ? "bg-stone-900 text-white" : "hover:bg-stone-50"} first:rounded-t-xl last:rounded-b-xl`}
                  >
                    {c}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <Label hint="optional">Region</Label>
            <select value={region} onChange={(e) => setRegion(e.target.value)} className={field}>
              <option value="">Any Region</option>
              {F.REGION_NAMES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <p className="mt-1.5 text-[11px] text-stone-500">
              Narrows the list. It never changes the order.
            </p>
          </div>
        </aside>

        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-serif text-xl">
              {category}
              <span className="ml-2 font-sans text-sm text-stone-500">
                {rows.length} {rows.length === 1 ? "Artisan" : "Artisans"}
                {region ? ` in ${region}` : ""}
              </span>
            </h2>
          </div>
          <p className="mt-1 mb-3 text-xs text-stone-500">
            In this order, always: Available for Jobs, then the published average in {category},
            then the number of Reviews, then name A to Z. Badges do not move anyone.
          </p>
          {rows.length > 0 ? (
            <ul className="divide-y divide-stone-200 rounded-xl border border-stone-300 bg-white">
              {rows.map((l) => (
                <ListingRow key={l.name + l.category} l={l} />
              ))}
            </ul>
          ) : (
            <div className="rounded-xl border border-dashed border-stone-400 p-8 text-center text-sm text-stone-600">
              {region
                ? `No Artisan verified for ${category} has selected ${region}.`
                : `No Artisan is verified for ${category} yet.`}
              {region && (
                <div className="mt-2">
                  <button type="button" className="text-xs underline" onClick={() => setRegion("")}>
                    Show every Region
                  </button>
                </div>
              )}
            </div>
          )}
          <p className="mt-3 text-[11px] text-stone-500">
            Someone not verified for {category} is not here. An Artisan with no Region selected
            stays on the list until you narrow it. To invite someone to a Job, start from the Job.{" "}
            <button type="button" className="underline" onClick={() => go("invite")}>
              Invite list for a Job
            </button>
          </p>
        </section>
      </div>
    </Page>
  );
}

// ---------- the invite list for a Job ----------

export function Invite({ go }: ScreenProps) {
  const [gas, setGas] = useState(F.inviteJob.gas);
  const [invited, setInvited] = useState<string[]>([]);
  const rows = F.LISTINGS.filter(
    (l) =>
      l.category === F.inviteJob.category &&
      l.available &&
      l.regions.includes(F.inviteJob.region) &&
      (!gas || l.gasCurrent),
  ).sort(F.browseOrder);
  return (
    <Page title="Invite an Artisan" kicker="Client · from a Job" wide>
      <div className="rounded-xl border border-stone-300 bg-white p-4">
        <p className="text-sm font-medium">{F.inviteJob.title}</p>
        <p className="mt-0.5 text-xs text-stone-500">
          {F.inviteJob.category} · {F.inviteJob.region} · gas work: {gas ? "yes" : "no"} ·{" "}
          {F.inviteJob.quotes} of 5 Quotes
        </p>
        <p className="mt-2 text-xs text-stone-600">
          The list is already this Job's category and Region, in the same order as Browse.
          Invitations stop at five Quotes or when a Quote is accepted.
        </p>
      </div>
      <ul className="mt-5 divide-y divide-stone-200 rounded-xl border border-stone-300 bg-white">
        {rows.map((l) => (
          <ListingRow
            key={l.name}
            l={l}
            action={
              invited.includes(l.name) ? (
                <Pill tone="good">Invited</Pill>
              ) : (
                <button
                  type="button"
                  className={btn}
                  onClick={() => setInvited((i) => [...i, l.name])}
                >
                  Invite
                </button>
              )
            }
          />
        ))}
      </ul>
      <div className="mt-3 space-y-1 text-[11px] text-stone-500">
        <p>
          Only Artisans who may Quote this Job are listed. You are not shown who else was offered
          it, or how many.
          <Proposal>
            Someone already offered this Job simply is not here, which tells you they were offered
            it.
          </Proposal>
        </p>
        <p>
          <button type="button" className="underline" onClick={() => go("browse")}>
            Browse a whole category instead
          </button>
        </p>
      </div>
      <div className="mt-6">
        <Demo>
          the Job's gas answer:
          <Chips
            value={gas ? "yes" : "no"}
            options={["yes", "no"] as const}
            onChange={(v) => setGas(v === "yes")}
          />
          <span>on yes, a plumber whose gas check is not current drops off</span>
        </Demo>
      </div>
    </Page>
  );
}

// ---------- picking up to three Regions ----------

export function Regions({ go }: ScreenProps) {
  const r = useRegions(F.me.regions);
  const [saved, setSaved] = useState(false);
  const dropped = F.me.regions.filter((x) => !r.picked.includes(x));
  const unanswered: Record<string, number> = { "Table Bay": 1, "Cape Flats": 2 };
  const withdrawn = dropped.reduce((s, x) => s + (unanswered[x] ?? 0), 0);
  const changed = dropped.length > 0 || r.picked.some((x) => !F.me.regions.includes(x));

  return (
    <Page title="Where you take Jobs" kicker="Artisan">
      <p className="text-sm text-stone-700">
        Choose one to three Regions. One choice covers every trade you are verified for. Your
        address does not have to be inside them.
      </p>
      <div className="mt-5 flex items-center gap-3 text-sm">
        <span className="font-medium">
          {r.picked.length} of {F.MAX_REGIONS}
        </span>
        <div className="flex gap-1">
          {Array.from({ length: F.MAX_REGIONS }).map((_, i) => (
            <span
              key={i}
              className={`h-2 w-10 rounded-full ${i < r.picked.length ? "bg-stone-900" : "bg-stone-300"}`}
            />
          ))}
        </div>
        {r.picked.length === 0 && <Pill tone="warn">No Region: no Job Matches or Invitations</Pill>}
      </div>

      <ul className="mt-4 divide-y divide-stone-200 rounded-xl border border-stone-300 bg-white">
        {F.DISTRICTS.map((d) => {
          const on = r.picked.includes(d.name);
          const open = r.open === d.name;
          return (
            <li key={d.name}>
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => r.toggle(d.name)}
                  className={`grid size-5 shrink-0 place-items-center rounded border ${on ? "border-stone-900 bg-stone-900 text-white" : "border-stone-400 bg-white"}`}
                >
                  {on && <Check className="size-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => r.toggle(d.name)}
                  className="flex-1 text-left text-sm font-medium"
                >
                  {d.name}
                </button>
                <button
                  type="button"
                  onClick={() => r.toggleOpen(d.name)}
                  className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-900"
                >
                  Suburbs{" "}
                  {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                </button>
              </div>
              {r.refused === d.name && (
                <div className="px-4 pb-3 pl-12">
                  <Note tone="warn">
                    You can choose three Regions. Drop one to choose {d.name}.
                  </Note>
                </div>
              )}
              {open && (
                <div className="px-4 pb-4 pl-12">
                  <p className="text-xs text-stone-600">{d.suburbs.join(" · ")} …</p>
                  <p className="mt-1 text-[11px] text-stone-500">
                    A sample. The City's names for every suburb in {d.name} are listed here.
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] text-stone-500">There is no "all of Cape Town".</p>

      {changed && (
        <div className="mt-5 space-y-2">
          {dropped.length > 0 && (
            <Note tone={withdrawn ? "warn" : "plain"}>
              Dropping {dropped.join(" and ")} withdraws{" "}
              {withdrawn
                ? `${withdrawn} unanswered Job Match or Invitation${withdrawn > 1 ? "s" : ""} there`
                : "any Job Match or Invitation you have not answered there"}
              . Quotes you already sent stay.
            </Note>
          )}
          {r.picked.length === 0 && (
            <Note>
              You can save with no Region. Your Profile stays visible, and nothing new is offered to
              you.
            </Note>
          )}
        </div>
      )}

      <div className="mt-5 flex items-center gap-3">
        <button type="button" className={btn} disabled={!changed} onClick={() => setSaved(true)}>
          Save Regions
        </button>
        <button type="button" className={btnLight} onClick={() => go("regions")}>
          Cancel
        </button>
        {saved && (
          <span className="text-xs text-emerald-800">Saved. Applies to the next Job Match.</span>
        )}
      </div>
      <p className="mt-6 text-[11px] text-stone-500">
        Available for Jobs and the Regions also sit in the strip at the top of your home.
        <Proposal>Changing Regions takes effect at once, with no check.</Proposal>
      </p>
    </Page>
  );
}

// ---------- Payouts and Reliability Record (Artisan) ----------

export function Payouts({ go }: ScreenProps) {
  const [record, setRecord] = useState<"entries" | "empty">("entries");
  const waiting = F.payouts.filter((p) => p.state !== "Sent");
  const sent = F.payouts.filter((p) => p.state === "Sent");
  const row = (p: (typeof F.payouts)[number]) => {
    const fee = F.feeOf(p.release, p.feePct);
    return (
      <li key={p.at + p.job} className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Pill tone={p.state === "Sent" ? "good" : p.state === "Rejected" ? "bad" : "warn"}>
            {p.state}
          </Pill>
          <span className="text-sm font-medium">{p.job}</span>
          <span className="text-xs text-stone-500">
            {p.client} · {p.at}
          </span>
        </div>
        <p className="mt-1 text-xs text-stone-600">
          Release {F.rand(p.release)} − Artisan Fee {F.rand(fee)} ({p.feePct}%) ={" "}
          <b className="text-stone-900">{F.rand(p.release - fee)}</b>{" "}
          {p.state === "Sent" ? "paid out" : "to pay out"}
        </p>
        {p.note && <p className="mt-0.5 text-xs text-amber-900">{p.note}</p>}
      </li>
    );
  };
  return (
    <Page title="Payouts" kicker="Artisan">
      <Note tone="warn">
        <b>No payout account is current.</b> Payouts wait until one is, and nothing is lost.{" "}
        <button type="button" className="underline" onClick={() => go("settings-artisan")}>
          Add a payout account
        </button>
        . You get one Reminder if a Payout is still waiting after 7 × 24 hours.
      </Note>

      <section className="mt-8">
        <h2 className="mb-2 text-[11px] font-medium tracking-wide text-stone-500 uppercase">
          Waiting
        </h2>
        <ul className="divide-y divide-stone-200 rounded-xl border border-stone-300 bg-white">
          {waiting.map(row)}
        </ul>
      </section>
      <section className="mt-8">
        <h2 className="mb-2 text-[11px] font-medium tracking-wide text-stone-500 uppercase">
          Sent
        </h2>
        <ul className="divide-y divide-stone-200 rounded-xl border border-stone-300 bg-white">
          {sent.map(row)}
        </ul>
        <p className="mt-2 text-[11px] text-stone-500">
          The Artisan Fee is on the whole accepted Quote, at a rate that falls with Completed
          Engagements with that Client. The Client's Protection Fee is never in a Payout and is not
          shown to you. There is no invoice or PDF.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="font-serif text-2xl">Reliability Record</h2>
        <p className="mt-1 text-sm text-stone-700">
          Read only by you and an Admin. A Client never sees it, and it is not on your Profile or in
          your Reviews.
        </p>
        {record === "entries" ? (
          <div className="mt-5">
            <RecordList>
              {F.reliability.map((e) => (
                <RecordItem
                  key={e.at + e.kind}
                  icon={e.kind === "Cancellation" ? <UserX /> : <Scale />}
                  at={e.at}
                  title={`${e.kind} · ${e.job}`}
                  body={e.effect}
                />
              ))}
            </RecordList>
            <p className="text-[11px] text-stone-500">
              It records your Cancellation, a no-show, and an Admin's allocation in a Dispute that
              Returns any amount. It does not record a Client's Cancellation, or a Return you make
              yourself.
            </p>
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-dashed border-stone-400 p-8 text-center text-sm text-stone-600">
            Nothing is recorded.
          </div>
        )}
        <div className="mt-5">
          <Demo>
            record:
            <Chips value={record} options={["entries", "empty"] as const} onChange={setRecord} />
          </Demo>
        </div>
      </section>
    </Page>
  );
}
