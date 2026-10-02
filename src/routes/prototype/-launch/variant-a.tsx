// PROTOTYPE, throwaway. Variant A, "Pages": a conventional marketplace site.
// A top nav, one page per task, a main column and a right-hand summary.
// Records (Quote, Payment, Completion) live on pages, never inside the Conversation.
import { useState, type ReactNode } from "react";
import {
  Bell,
  Camera,
  Check,
  CircleAlert,
  Clock,
  FileText,
  Flag,
  MapPin,
  Search,
  ShieldCheck,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import * as F from "./fixtures";
import * as H from "./hooks";

export function VariantA({ screen, go }: H.VariantProps) {
  const who = F.screenOf(screen).who;
  return (
    <div className="min-h-svh bg-zinc-50 pb-24 text-zinc-900">
      <TopNav who={who} go={go} />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {screen === "profile" && <Profile />}
        {screen === "post" && <PostJob />}
        {screen === "quotes" && <Quotes go={go} />}
        {screen === "conversation" && <Conversation />}
        {screen === "engagement" && <Engagement />}
        {screen === "completion" && <Completion />}
        {screen === "release" && <Release go={go} />}
        {screen === "dispute" && <Dispute />}
        {screen === "review" && <Review />}
        {screen === "verification" && <Verification />}
        {screen === "home" && <ArtisanHome />}
        {screen === "notices" && <Notices />}
      </main>
    </div>
  );
}

// ---------- chrome ----------

function TopNav({ who, go }: { who: F.Who; go: (s: F.ScreenKey) => void }) {
  const links: [string, F.ScreenKey][] =
    who === "Artisan"
      ? [
          ["Home", "home"],
          ["Verification", "verification"],
          ["Completion", "completion"],
        ]
      : who === "Client"
        ? [
            ["Find Artisans", "profile"],
            ["Post a Job", "post"],
            ["My Jobs", "quotes"],
          ]
        : [
            ["Find Artisans", "profile"],
            ["How it works", "profile"],
          ];
  return (
    <header className="sticky top-0 z-10 border-b bg-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <span className="font-semibold tracking-tight">ArtisanConnect</span>
        <nav className="hidden gap-4 text-sm text-zinc-600 md:flex">
          {links.map(([label, key]) => (
            <button key={label} type="button" onClick={() => go(key)} className="hover:text-zinc-900">
              {label}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          {who === "Visitor" ? (
            <>
              <Button variant="ghost" size="sm">
                Sign in
              </Button>
              <Button size="sm">Join</Button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => go("notices")} className="relative rounded-full p-2 hover:bg-zinc-100">
                <Bell className="size-4" />
                <span className="absolute top-1 right-1 size-2 rounded-full bg-red-500" />
              </button>
              <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs">
                {who === "Client" ? "Thandi M. · Client" : "Sipho Ndlovu · Artisan"}
              </span>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function PageHead({ title, sub, status, crumbs }: { title: string; sub?: ReactNode; status?: string; crumbs?: string }) {
  return (
    <div className="mb-6">
      {crumbs && <p className="mb-1 text-xs text-zinc-500">{crumbs}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {status && <StatusPill s={status} />}
      </div>
      {sub && <p className="mt-1 text-sm text-zinc-600">{sub}</p>}
    </div>
  );
}

function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border bg-white p-5 ${className}`}>
      {title && <h2 className="mb-3 text-sm font-semibold">{title}</h2>}
      {children}
    </section>
  );
}

const PILL: Record<string, string> = {
  Open: "bg-sky-100 text-sky-800",
  Sent: "bg-sky-100 text-sky-800",
  "Artisan Chosen": "bg-violet-100 text-violet-800",
  Accepted: "bg-emerald-100 text-emerald-800",
  Paid: "bg-emerald-100 text-emerald-800",
  "Awaiting release": "bg-amber-100 text-amber-800",
  Disputed: "bg-red-100 text-red-800",
  Completed: "bg-zinc-200 text-zinc-800",
  "Not chosen": "bg-zinc-100 text-zinc-500",
  Declined: "bg-zinc-100 text-zinc-500",
  Expired: "bg-zinc-100 text-zinc-500",
  Withdrawn: "bg-zinc-100 text-zinc-500",
  Void: "bg-zinc-100 text-zinc-500",
};

function StatusPill({ s }: { s: string }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${PILL[s] ?? "bg-zinc-100"}`}>{s}</span>;
}

function BadgeChip({ b }: { b: F.Badge }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-900">
      <ShieldCheck className="size-3" />
      {b.name}
      {b.validTo && <span className="text-emerald-700/70">· valid to {b.validTo}</span>}
    </span>
  );
}

function Rating({ avg, n }: { avg?: number; n: number }) {
  if (!n || avg === undefined) return <span className="text-xs text-zinc-500">No Reviews yet</span>;
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <Star className="size-3.5 fill-amber-400 text-amber-400" />
      <b>{avg.toFixed(1)}</b>
      <span className="text-zinc-500">({n} Reviews)</span>
    </span>
  );
}

function Photo({ label, className = "" }: { label: string; className?: string }) {
  return (
    <div className={`flex aspect-[4/3] items-end rounded-lg bg-gradient-to-br from-zinc-200 to-zinc-300 p-2 text-[11px] text-zinc-600 ${className}`}>
      {label}
    </div>
  );
}

function Row({ k, v, strong }: { k: ReactNode; v: ReactNode; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 py-1 text-sm ${strong ? "font-semibold" : ""}`}>
      <span className={strong ? "" : "text-zinc-600"}>{k}</span>
      <span className="text-right tabular-nums">{v}</span>
    </div>
  );
}

function Note({ children, tone = "zinc" }: { children: ReactNode; tone?: "zinc" | "amber" | "red" | "sky" }) {
  const c = {
    zinc: "bg-zinc-100 text-zinc-700",
    amber: "bg-amber-50 text-amber-900 ring-1 ring-amber-200",
    red: "bg-red-50 text-red-900 ring-1 ring-red-200",
    sky: "bg-sky-50 text-sky-900 ring-1 ring-sky-200",
  }[tone];
  return <div className={`rounded-lg px-3 py-2 text-xs leading-relaxed ${c}`}>{children}</div>;
}

const input = "w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-300";

// ---------- screens ----------

function Profile() {
  const a = F.artisan;
  const [cat, setCat] = useState(0);
  const c = a.categories[cat];
  return (
    <>
      <div className="mb-4 flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm text-zinc-500">
        <Search className="size-4" /> Plumbing · any Region
        <span className="ml-auto text-xs">Browse is always inside one Service Category</span>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <div className="flex flex-wrap items-start gap-4">
              <div className="grid size-20 place-items-center rounded-full bg-zinc-800 text-2xl font-semibold text-white">
                {a.initials}
              </div>
              <div className="flex-1">
                <h1 className="text-2xl font-semibold">{a.publicName}</h1>
                <p className="mt-1 text-sm text-zinc-600">{a.about}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">Available for Jobs</span>
                  {a.regions.map((r) => (
                    <span key={r} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5">
                      <MapPin className="size-3" />
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <div>
            <div className="mb-3 flex gap-1 border-b">
              {a.categories.map((x, i) => (
                <button
                  key={x.name}
                  type="button"
                  onClick={() => setCat(i)}
                  className={`-mb-px border-b-2 px-3 py-2 text-sm ${i === cat ? "border-zinc-900 font-medium" : "border-transparent text-zinc-500"}`}
                >
                  {x.name}
                </button>
              ))}
            </div>
            <Card>
              <div className="flex flex-wrap items-center gap-4">
                <Rating avg={c.average} n={c.reviews} />
                <span className="text-sm text-zinc-600">{c.completed} Completed Engagements in {c.name}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {c.badges.map((b) => (
                  <BadgeChip key={b.name} b={b} />
                ))}
              </div>
              <p className="mt-2 text-[11px] text-zinc-500">
                A badge is a check ArtisanConnect completed. It is not a promise that the work will be good.
              </p>
              <h3 className="mt-5 mb-2 text-sm font-semibold">Work evidence</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {c.workPhotos.map((p) => (
                  <Photo key={p} label={p} />
                ))}
              </div>
              <p className="mt-4 text-xs text-zinc-500">
                Signed-in Accounts can read each published Review. Visitors see the average and the count.
              </p>
            </Card>
          </div>

          <Card title="Services Sipho describes">
            <ul className="flex flex-wrap gap-2 text-sm">
              {a.services.map((s) => (
                <li key={s} className="rounded-md bg-zinc-100 px-2 py-1">
                  {s}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-zinc-500">
              These are Sipho's words. They do not decide which Jobs Sipho may Quote.
            </p>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card title="Invite Sipho to a Job">
            <p className="text-sm text-zinc-600">
              Sign in as a Client with an Open Job in Plumbing or Tiling, in one of Sipho's Regions.
            </p>
            <Button className="mt-3 w-full">Sign in to invite</Button>
          </Card>
          <Card title="Other checks">
            {a.optionalBadges.map((b) => (
              <BadgeChip key={b.name} b={b} />
            ))}
          </Card>
          <Note>
            No phone, email, or address is shown before Payment. Speak through a Quote's Conversation.
          </Note>
        </aside>
      </div>
    </>
  );
}

function PostJob() {
  const p = H.usePostJob();
  if (p.posted)
    return (
      <div className="mx-auto max-w-xl">
        <Card>
          <StatusPill s="Open" />
          <h1 className="mt-3 text-xl font-semibold">{p.title}</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Artisans verified for {p.category} in {p.region} are being offered your Job. You will see each one who
            Quotes, never the others.
          </p>
          <ul className="mt-4 space-y-1 text-sm text-zinc-600">
            <li>Up to five Quotes. Matching stops when you accept one.</li>
            <li>Open until 17 Oct if no Quote is accepted. You can renew.</li>
            <li>Category, gas answer, and site are now locked.</li>
            <li>Title, description, and photos lock when the first Quote is Sent.</li>
          </ul>
          <Button variant="outline" className="mt-4">
            End this Job
          </Button>
        </Card>
      </div>
    );
  return (
    <>
      <PageHead title="Post a Job" sub="Private. Only Artisans offered or invited see it." />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <div className="space-y-5">
            <Field label="Service Category">
              <select className={input} value={p.category} onChange={(e) => p.setCategory(e.target.value as F.Category)}>
                <option value="">Choose…</option>
                {F.CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            {p.category === "Plumbing" && (
              <Field label="Does this work include installing or removing a gas appliance, gas system, or gas reticulation?">
                <div className="flex gap-2">
                  {[true, false].map((v) => (
                    <Choice key={String(v)} on={p.gas === v} onClick={() => p.setGas(v)}>
                      {v ? "Yes" : "No"}
                    </Choice>
                  ))}
                </div>
                {p.gas && (
                  <p className="mt-1 text-xs text-zinc-500">
                    Only plumbers with a current gas check can Quote. Completion will need a certificate of conformity.
                  </p>
                )}
              </Field>
            )}
            {p.category === "Electrical" && (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={p.ack} onChange={(e) => p.setAck(e.target.checked)} className="mt-1" />
                This is electrical installation work. Completion will need a certificate of compliance.
              </label>
            )}
            <Field label="Site type">
              <div className="flex gap-2">
                {(["Home", "Business"] as const).map((v) => (
                  <Choice key={v} on={p.siteType === v} onClick={() => p.setSiteType(v)}>
                    {v}
                  </Choice>
                ))}
              </div>
            </Field>
            <Field label="Site address" hint="Artisans see only the Region until you pay.">
              <input className={input} value={p.address} onChange={(e) => p.setAddress(e.target.value)} placeholder="Street and suburb" />
              {p.region === "unplaceable" && (
                <p className="mt-1 text-xs text-red-700">This site is outside every open Region. It cannot be posted.</p>
              )}
              {p.region && p.region !== "unplaceable" && (
                <p className="mt-1 inline-flex items-center gap-1 text-xs text-zinc-600">
                  <MapPin className="size-3" /> Region: <b>{p.region}</b>
                </p>
              )}
            </Field>
            <Field label="Title">
              <input className={input} value={p.title} onChange={(e) => p.setTitle(e.target.value)} />
            </Field>
            <Field label="Describe the work">
              <textarea rows={4} className={input} value={p.description} onChange={(e) => p.setDescription(e.target.value)} />
              {p.leak && (
                <p className="mt-1 text-xs text-red-700">Remove this before posting: {p.leak}. Contact stays on ArtisanConnect until you pay.</p>
              )}
            </Field>
            <Field label="Photos of the work" hint="At least one. Video is optional and does not replace the photo.">
              <div className="flex flex-wrap gap-2">
                {p.photos.map((ph, i) => (
                  <button key={ph} type="button" onClick={() => p.removePhoto(i)} className="w-24">
                    <Photo label={ph} />
                  </button>
                ))}
                <button type="button" onClick={p.addPhoto} className="grid aspect-[4/3] w-24 place-items-center rounded-lg border-2 border-dashed text-zinc-400">
                  <Camera className="size-5" />
                </button>
              </div>
            </Field>
            <Field label="Preferred start (optional)">
              <input type="date" className={input} value={p.preferredStart} onChange={(e) => p.setPreferredStart(e.target.value)} />
            </Field>
          </div>
        </Card>
        <aside className="space-y-4">
          <Card title="Before it can be matched">
            {p.missing.length ? (
              <ul className="space-y-1 text-sm text-zinc-600">
                {p.missing.map((m) => (
                  <li key={m}>· {m}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-emerald-700">Ready.</p>
            )}
            <Button className="mt-4 w-full" disabled={!p.canPost} onClick={p.post}>
              Post Job
            </Button>
            <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={p.fillExample}>
              Fill example
            </Button>
          </Card>
          <Note>Saving without posting keeps a draft. Nobody sees a draft.</Note>
        </aside>
      </div>
    </>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium">{label}</p>
      {children}
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

function Choice({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-4 py-2 text-sm ${on ? "border-zinc-900 bg-zinc-900 text-white" : "bg-white hover:bg-zinc-50"}`}
    >
      {children}
    </button>
  );
}

function Quotes({ go }: { go: (s: F.ScreenKey) => void }) {
  const q = H.useQuotes();
  const status = q.accepted ? "Artisan Chosen" : "Open";
  return (
    <>
      <PageHead
        crumbs="My Jobs"
        title={F.job.title}
        status={status}
        sub={`${F.job.category} · gas work: yes · ${F.job.region} · ${F.job.siteType}`}
      />
      {q.accepted ? (
        <div className="mb-4">
          <Note tone="sky">
            {q.accepted.artisan} confirmed 12 Oct, 2 days. Pay by 11 Oct, 12:15 or this Job is Ended. The other Quotes
            are Not chosen and do not come back.
          </Note>
        </div>
      ) : (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-zinc-600">3 of 5 Quotes · open until 17 Oct</span>
          <span className="ml-auto text-zinc-500">Rearrange:</span>
          {(
            [
              ["sent", "Order sent"],
              ["total", "Total"],
              ["duration", "Duration estimate"],
            ] as const
          ).map(([k, l]) => (
            <Choice key={k} on={q.order === k} onClick={() => q.setOrder(k)}>
              {l}
            </Choice>
          ))}
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="w-44 p-4" />
              {q.quotes.map((x) => (
                <th key={x.id} className="p-4 align-top font-normal">
                  <div className="font-semibold">{x.artisan}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <StatusPill s={x.status} />
                    {x.revised && <span className="text-xs text-amber-700">Revised</span>}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="[&_td]:border-b [&_td]:p-4 [&_td]:align-top [&_th]:border-b [&_th]:p-4 [&_th]:text-left [&_th]:align-top [&_th]:font-normal [&_th]:text-zinc-500">
            <tr>
              <th>Plumbing Reviews</th>
              {q.quotes.map((x) => (
                <td key={x.id}>
                  <Rating avg={x.average} n={x.reviews} />
                </td>
              ))}
            </tr>
            <tr>
              <th>Completed in Plumbing</th>
              {q.quotes.map((x) => (
                <td key={x.id}>{x.completedInCategory}</td>
              ))}
            </tr>
            <tr>
              <th>Badges</th>
              {q.quotes.map((x) => (
                <td key={x.id}>
                  <div className="flex flex-col items-start gap-1">
                    {x.badges.map((b) => (
                      <BadgeChip key={b.name} b={b} />
                    ))}
                  </div>
                </td>
              ))}
            </tr>
            <tr>
              <th>Scope</th>
              {q.quotes.map((x) => (
                <td key={x.id} className="text-xs leading-relaxed text-zinc-700">
                  {x.scope}
                </td>
              ))}
            </tr>
            <tr>
              <th>Labour</th>
              {q.quotes.map((x) => (
                <td key={x.id} className="tabular-nums">
                  {F.rand(x.labour)}
                </td>
              ))}
            </tr>
            <tr>
              <th>Materials</th>
              {q.quotes.map((x) => (
                <td key={x.id} className="tabular-nums">
                  {F.rand(x.materials)} <span className="text-xs text-zinc-500">· {x.supplies === "Both" ? "both supply" : `${x.supplies} supplies`}</span>
                </td>
              ))}
            </tr>
            <tr>
              <th className="!text-zinc-900">Quote total</th>
              {q.quotes.map((x) => (
                <td key={x.id} className="text-base font-semibold tabular-nums">
                  {F.rand(F.quoteTotal(x))}
                </td>
              ))}
            </tr>
            <tr>
              <th>You would pay</th>
              {q.quotes.map((x) => (
                <td key={x.id} className="text-xs text-zinc-600 tabular-nums">
                  {F.rand(F.quoteTotal(x) + F.pctOf(F.quoteTotal(x), F.PROTECTION_FEE_PCT))}
                  <br />
                  incl. {F.PROTECTION_FEE_PCT}% Protection Fee
                </td>
              ))}
            </tr>
            <tr>
              <th>Warranty</th>
              {q.quotes.map((x) => (
                <td key={x.id}>{x.warranty ?? <span className="text-zinc-400">None offered</span>}</td>
              ))}
            </tr>
            <tr>
              <th>Duration estimate</th>
              {q.quotes.map((x) => (
                <td key={x.id}>{x.durationDays ? `${x.durationDays} day${x.durationDays > 1 ? "s" : ""}` : <span className="text-zinc-400">—</span>}</td>
              ))}
            </tr>
            <tr>
              <th>Sent</th>
              {q.quotes.map((x) => (
                <td key={x.id} className="text-xs text-zinc-600">
                  {x.sentAt}
                  <br />
                  open until {x.expiresAt}
                </td>
              ))}
            </tr>
            <tr>
              <th />
              {q.quotes.map((x) => (
                <td key={x.id}>
                  {x.status === "Sent" && q.pending?.quoteId === x.id && (
                    <div className="space-y-2">
                      <Note tone="amber">
                        <Clock className="mr-1 inline size-3" />
                        You sent {q.pending.start}, {q.pending.durationDays} days. Waiting for {x.artisan.split(" ")[0]} to
                        confirm.
                      </Note>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline">
                          Change dates
                        </Button>
                        <Button size="sm" variant="ghost" onClick={q.cancelDates}>
                          Cancel dates
                        </Button>
                      </div>
                      <button type="button" onClick={q.artisanConfirms} className="text-[11px] text-violet-700 underline">
                        (simulate: Artisan confirms)
                      </button>
                    </div>
                  )}
                  {x.status === "Sent" && q.pending?.quoteId !== x.id && (
                    <div className="flex flex-col gap-2">
                      <Button size="sm" onClick={() => q.sendDates(x.id)} disabled={!!q.pending}>
                        Choose · enter dates
                      </Button>
                      <Button size="sm" variant="outline">
                        Message
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => q.decline(x.id)}>
                        Decline
                      </Button>
                    </div>
                  )}
                  {x.status === "Accepted" && (
                    <Button size="sm" onClick={() => go("engagement")}>
                      Pay {F.rand(F.quoteTotal(x) + F.pctOf(F.quoteTotal(x), F.PROTECTION_FEE_PCT))}
                    </Button>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-zinc-500">
        A Quote is accepted only when the Artisan confirms the dates you enter. One set of dates can wait at a time.
        {q.accepted && (
          <button type="button" onClick={q.reset} className="ml-2 underline">
            reset
          </button>
        )}
      </p>
    </>
  );
}

function Conversation() {
  const c = H.useComposer();
  const [active, setActive] = useState(0);
  return (
    <>
      <PageHead crumbs={`My Jobs › ${F.job.title}`} title="Conversations" status="Open" />
      <div className="grid overflow-hidden rounded-xl border bg-white lg:grid-cols-[240px_1fr_280px]">
        <ul className="border-b lg:border-r lg:border-b-0">
          {F.quotes.map((q, i) => (
            <li key={q.id}>
              <button
                type="button"
                onClick={() => setActive(i)}
                className={`w-full px-4 py-3 text-left text-sm ${i === active ? "bg-zinc-100" : "hover:bg-zinc-50"}`}
              >
                <div className="font-medium">{q.artisan}</div>
                <div className="text-xs text-zinc-500">Quote {F.rand(F.quoteTotal(q))} · Sent</div>
              </button>
            </li>
          ))}
        </ul>
        <div className="flex min-h-[520px] flex-col">
          <div className="border-b px-4 py-2 text-xs text-zinc-500">
            ArtisanConnect can read this Conversation for support, a report, or a Dispute.
          </div>
          <div className="flex-1 space-y-3 overflow-auto p-4">
            {active === 0 ? (
              c.messages.map((m, i) => (
                <div key={i} className={`group flex ${m.from === "Client" ? "justify-end" : ""}`}>
                  <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${m.from === "Client" ? "bg-zinc-900 text-white" : "bg-zinc-100"}`}>
                    {m.text}
                    <div className="mt-1 flex items-center gap-2 text-[10px] opacity-60">
                      {m.at}
                      <Flag className="hidden size-3 group-hover:inline" />
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-zinc-500">No messages yet.</p>
            )}
          </div>
          <div className="border-t p-3">
            {c.refused && (
              <div className="mb-2 flex items-start gap-2 rounded-lg bg-zinc-100 px-3 py-2 text-xs text-zinc-700">
                <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  Not sent: {c.refused}. Before Payment, phone numbers, emails, links, and addresses stay off the
                  Conversation. Edit and send again.
                </span>
              </div>
            )}
            <div className="flex gap-2">
              <input className={input} value={c.draft} onChange={(e) => c.setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && c.send()} />
              <Button onClick={c.send}>Send</Button>
            </div>
          </div>
        </div>
        <aside className="hidden border-l p-4 lg:block">
          <p className="text-xs text-zinc-500">Quote</p>
          <p className="text-lg font-semibold">{F.rand(F.quoteTotal(F.quotes[active]))}</p>
          <StatusPill s="Sent" />
          <p className="mt-3 text-xs leading-relaxed text-zinc-600">{F.quotes[active].scope}</p>
          <Button size="sm" variant="outline" className="mt-4 w-full">
            Back to the Quotes
          </Button>
        </aside>
      </div>
    </>
  );
}

function Engagement() {
  const e = F.engagement;
  const [uq, setUq] = useState<"pending" | "accepted" | "rejected">("pending");
  const [cancelling, setCancelling] = useState(false);
  const newTotal = e.updatedQuote.labour + e.updatedQuote.materials;
  const extra = newTotal - e.quoteTotal;
  return (
    <>
      <PageHead crumbs="My Jobs" title={F.job.title} status="Paid" sub="Engagement with Sipho Ndlovu" />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {uq === "pending" && (
            <Card title="Sipho proposes an Updated Quote" className="ring-2 ring-amber-300">
              <p className="mb-3 text-sm text-zinc-700">{e.updatedQuote.scope}</p>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <span />
                <span className="text-xs text-zinc-500">Agreed</span>
                <span className="text-xs text-zinc-500">Proposed</span>
                <span className="text-zinc-600">Labour</span>
                <span>{F.rand(e.labour)}</span>
                <span className="font-medium">{F.rand(e.updatedQuote.labour)}</span>
                <span className="text-zinc-600">Materials</span>
                <span>{F.rand(e.materials)}</span>
                <span className="font-medium">{F.rand(e.updatedQuote.materials)}</span>
                <span className="text-zinc-600">Total</span>
                <span>{F.rand(e.quoteTotal)}</span>
                <span className="font-semibold">{F.rand(newTotal)}</span>
              </div>
              <Note tone="amber">
                Accepting means paying {F.rand(extra + F.pctOf(extra, F.PROTECTION_FEE_PCT))} more now ({F.rand(extra)} plus
                the Protection Fee). The added work waits until you accept. Rejecting keeps the agreed Quote.
              </Note>
              <div className="mt-3 flex gap-2">
                <Button onClick={() => setUq("accepted")}>Accept and pay {F.rand(extra + F.pctOf(extra, F.PROTECTION_FEE_PCT))}</Button>
                <Button variant="outline" onClick={() => setUq("rejected")}>
                  Reject
                </Button>
              </div>
            </Card>
          )}
          {uq !== "pending" && <Note>Updated Quote {uq}. (prototype)</Note>}
          <Card title="Agreed dates">
            <Row k="Start" v={e.agreedStart} />
            <Row k="Duration" v={`${e.agreedDays} days`} />
            <Button size="sm" variant="outline" className="mt-2">
              Propose new dates
            </Button>
            <p className="mt-2 text-xs text-zinc-500">New dates apply only when Sipho confirms them. They don't change the price.</p>
          </Card>
          <Card title="Contact, now that you've paid">
            <Row k="Sipho" v={`${e.contact.artisanPhone} · ${e.contact.artisanEmail}`} />
            <Row k="Site" v={e.contact.site} />
            <p className="mt-2 text-xs text-zinc-500">
              Until {e.protectedUntil}, further work with Sipho belongs on ArtisanConnect. Use Hire Again.
            </p>
          </Card>
          <Card title="What happens next">
            <ol className="space-y-2 text-sm text-zinc-700">
              <li>1. Sipho states Completion, with a note, after-work photos, and the certificate of conformity.</li>
              <li>2. You Release the Quote, in one part or more. Anything you leave Releases 3 × 24 hours after Completion.</li>
              <li>3. If something is wrong, open a Dispute on part of what's unreleased.</li>
            </ol>
          </Card>
          {!cancelling ? (
            <button type="button" onClick={() => setCancelling(true)} className="text-sm text-red-700 underline">
              Cancel this Engagement
            </button>
          ) : (
            <Card title="Cancel this Engagement" className="ring-2 ring-red-200">
              <p className="text-sm text-zinc-700">
                Cancelling ends the Engagement and cannot be withdrawn. An Admin decides how the unreleased {F.rand(e.quoteTotal)} is
                split between you and Sipho.
              </p>
              <textarea rows={2} placeholder="Reason (optional)" className={`${input} mt-3`} />
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input type="checkbox" /> Sipho had not attended by {e.agreedStart}
              </label>
              <div className="mt-3 flex gap-2">
                <Button variant="destructive">Cancel Engagement</Button>
                <Button variant="ghost" onClick={() => setCancelling(false)}>
                  Keep it
                </Button>
              </div>
            </Card>
          )}
        </div>
        <aside className="space-y-4">
          <Card title="Payment">
            <Row k="Labour" v={F.rand(e.labour)} />
            <Row k="Materials" v={F.rand(e.materials)} />
            <Row k="Quote" v={F.rand(e.quoteTotal)} />
            <Row k={`Protection Fee (${F.PROTECTION_FEE_PCT}%)`} v={F.rand(e.protectionFee)} />
            <div className="my-2 border-t" />
            <Row strong k="Paid" v={F.rand(e.quoteTotal + e.protectionFee)} />
            <p className="mt-1 text-xs text-zinc-500">{e.paidAt}</p>
          </Card>
          <Note>Nothing is Released to Sipho before Completion.</Note>
        </aside>
      </div>
    </>
  );
}

function Completion() {
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const need = F.completionRequires.evidence;
  const ready = note.trim() && photos.length > 0 && (!need || files.length > 0);
  if (done)
    return (
      <div className="mx-auto max-w-xl">
        <Card>
          <StatusPill s="Paid" />
          <h1 className="mt-3 text-xl font-semibold">Completion stated</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Thandi M. can now Release. Whatever is unreleased Releases on 17 Oct, 16:20 unless Thandi Releases it or opens a
            Dispute. Your pending Updated Quote has lapsed.
          </p>
        </Card>
      </div>
    );
  return (
    <>
      <PageHead crumbs="Engagements" title={`State Completion · ${F.job.title}`} status="Paid" sub="Client: Thandi M. · 14 Rosmead Avenue, Kenilworth" />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <div className="space-y-5">
            <Field label="Note to Thandi">
              <textarea rows={4} className={input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What you did, and anything Thandi should know" />
            </Field>
            <Field label="After-work photos" hint="At least one.">
              <div className="flex flex-wrap gap-2">
                {photos.map((p) => (
                  <Photo key={p} label={p} className="w-24" />
                ))}
                <button type="button" onClick={() => setPhotos((p) => [...p, `After ${p.length + 1}`])} className="grid aspect-[4/3] w-24 place-items-center rounded-lg border-2 border-dashed text-zinc-400">
                  <Camera className="size-5" />
                </button>
              </div>
            </Field>
            {need && (
              <Field label={`${need} (required)`} hint="This Job includes gas work. A picture or a document; one or more files.">
                <div className="flex flex-wrap items-center gap-2">
                  {files.map((f) => (
                    <span key={f} className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-1 text-xs">
                      <FileText className="size-3" />
                      {f}
                    </span>
                  ))}
                  <Button size="sm" variant="outline" onClick={() => setFiles((f) => [...f, `CoC-gas-${f.length + 1}.pdf`])}>
                    Attach file
                  </Button>
                </div>
              </Field>
            )}
          </div>
        </Card>
        <aside className="space-y-4">
          <Card title="Checklist">
            <Check1 ok={!!note.trim()}>Note</Check1>
            <Check1 ok={photos.length > 0}>After-work photo</Check1>
            {need && <Check1 ok={files.length > 0}>{need}</Check1>}
            <Button className="mt-4 w-full" disabled={!ready} onClick={() => setDone(true)}>
              State Completion
            </Button>
          </Card>
          <Note tone="amber">
            Completion can't be edited or withdrawn. It fixes the price, the scope, and the Warranty, and starts Thandi's 3 × 24
            hours.
          </Note>
        </aside>
      </div>
    </>
  );
}

function Check1({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <div className={`flex items-center gap-2 py-1 text-sm ${ok ? "text-emerald-700" : "text-zinc-500"}`}>
      <Check className={`size-4 ${ok ? "" : "opacity-20"}`} />
      {children}
    </div>
  );
}

function Release({ go }: { go: (s: F.ScreenKey) => void }) {
  const r = H.useRelease();
  const rel = F.release;
  return (
    <>
      <PageHead crumbs="My Jobs" title={F.job.title} status={r.unreleased ? "Awaiting release" : "Completed"} sub={`Sipho stated Completion on ${rel.completedAt}`} />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {r.unreleased > 0 && (
            <Card title="Release to Sipho">
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <p className="mb-1 text-xs text-zinc-500">Amount</p>
                  <input className={`${input} w-40 text-lg tabular-nums`} value={r.amount.text} onChange={(e) => r.amount.setText(e.target.value)} />
                </div>
                {[0.25, 0.5, 1].map((f) => (
                  <Button key={f} variant="outline" size="sm" onClick={() => r.amount.setCents(Math.round(r.unreleased * f))}>
                    {f === 1 ? "All" : `${f * 100}%`}
                  </Button>
                ))}
                <Button disabled={!r.amount.valid} onClick={r.doRelease}>
                  Release {r.amount.valid ? F.rand(r.amount.cents) : ""}
                </Button>
              </div>
              <p className="mt-2 text-xs text-zinc-500">Up to {F.rand(r.unreleased)}. A Release can't be taken back.</p>
            </Card>
          )}
          <Card className="ring-2 ring-amber-200">
            <div className="flex items-start gap-3">
              <Clock className="mt-0.5 size-5 text-amber-600" />
              <div>
                <p className="font-medium">{rel.silenceAt}</p>
                <p className="text-sm text-zinc-600">
                  Whatever is still unreleased then Releases to Sipho, unless it is in a Dispute. Releasing part now doesn't
                  move this time.
                </p>
              </div>
            </div>
          </Card>
          <Card title="Completion">
            <p className="text-sm">{rel.completion.note}</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {rel.completion.photos.map((p) => (
                <Photo key={p} label={p} />
              ))}
            </div>
            {rel.completion.evidence.map((f) => (
              <span key={f} className="mt-3 inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-1 text-xs">
                <FileText className="size-3" /> Certificate of conformity · {f}
              </span>
            ))}
          </Card>
          {r.unreleased > 0 && (
            <button type="button" onClick={() => go("dispute")} className="text-sm text-red-700 underline">
              Something wrong? Open a Dispute on part of the unreleased amount
            </button>
          )}
        </div>
        <aside className="space-y-4">
          <Card title="Accepted Quote">
            <Row k="Quote" v={F.rand(rel.quoteTotal)} />
            {r.releases.map((x, i) => (
              <Row key={i} k={`Released ${x.at}`} v={`−${F.rand(x.amount)}`} />
            ))}
            <div className="my-2 border-t" />
            <Row strong k="Unreleased" v={F.rand(r.unreleased)} />
          </Card>
          <Note>Your Review opens once nothing is left unreleased or in a Dispute.</Note>
        </aside>
      </div>
    </>
  );
}

function Dispute() {
  const d = F.dispute;
  const [tab, setTab] = useState<"open" | "settle" | "admin">("settle");
  const amt = H.useAmount(d.held, d.unreleasedBefore);
  const [reason, setReason] = useState("");
  const [held, setHeld] = useState(d.held);
  const [offer, setOffer] = useState<"open" | "accepted">("open");
  return (
    <>
      <PageHead crumbs="My Jobs" title={F.job.title} status={tab === "open" ? "Awaiting release" : "Disputed"} />
      <div className="mb-4 flex gap-1 rounded-lg bg-zinc-200/60 p-1 text-sm">
        {(
          [
            ["open", "1 · Open"],
            ["settle", "2 · Settle, 2 × 24 hours"],
            ["admin", "3 · With an Admin"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`flex-1 rounded-md px-3 py-1.5 ${tab === k ? "bg-white shadow-sm" : "text-zinc-600"}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === "open" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <Card title="Open a Dispute">
            <Field label="Amount to hold" hint={`More than R0 and no more than the unreleased ${F.rand(d.unreleasedBefore)}. The Protection Fee and sent Payouts can't be held.`}>
              <input className={`${input} w-40`} value={amt.text} onChange={(e) => amt.setText(e.target.value)} />
            </Field>
            <div className="mt-4">
              <Field label="What's wrong (required)">
                <textarea rows={3} className={input} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={d.reason} />
              </Field>
            </div>
            <Button variant="outline" size="sm" className="mt-3">
              Attach photos or documents
            </Button>
            <div className="mt-4">
              <Button variant="destructive" disabled={!amt.valid || !reason.trim()} onClick={() => setTab("settle")}>
                Open Dispute on {amt.valid ? F.rand(amt.cents) : "…"}
              </Button>
            </div>
          </Card>
          <aside>
            <Note>
              You can open one Dispute on this Engagement. It holds money; it doesn't end the Engagement or undo the
              Completion. The rest still Releases on {F.release.silenceAt}.
            </Note>
          </aside>
        </div>
      )}

      {tab === "settle" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <Card>
              <p className="text-sm text-zinc-600">Your reason</p>
              <p className="mt-1 text-sm">{d.reason}</p>
              <span className="mt-2 inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-1 text-xs">
                <Camera className="size-3" />
                {d.attachments[0]}
              </span>
            </Card>
            {offer === "open" ? (
              <Card title="Sipho proposes a Return" className="ring-2 ring-sky-200">
                <p className="text-sm">
                  {F.rand(d.artisanReturnOffer)} of the held {F.rand(held)} comes back to you, with its Protection Fee (
                  {F.rand(F.pctOf(d.artisanReturnOffer, F.PROTECTION_FEE_PCT))}).
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    onClick={() => {
                      setOffer("accepted");
                      setHeld((h) => h - d.artisanReturnOffer);
                    }}
                  >
                    Agree
                  </Button>
                  <Button variant="ghost">Not yet</Button>
                </div>
              </Card>
            ) : (
              <Note tone="sky">Return of {F.rand(d.artisanReturnOffer)} agreed. No Admin needed.</Note>
            )}
            <Card title="Or settle it yourself">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setHeld(0)}>
                  Release the held {F.rand(held)}
                </Button>
                <Button variant="outline">Release part of it</Button>
                <Button variant="ghost">Withdraw the Dispute</Button>
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                Withdrawing gives the held amount a fresh 3 × 24 hours before it Releases. You can't open another Dispute.
              </p>
            </Card>
          </div>
          <aside className="space-y-4">
            <Card title="Money">
              <Row k="Held by the Dispute" v={F.rand(held)} />
              <Row k="Not held, Releases 17 Oct, 16:20" v={F.rand(d.unreleasedBefore - d.held)} />
            </Card>
            <Card className="ring-2 ring-red-200">
              <p className="text-sm font-medium">Until {d.settleUntil}</p>
              <p className="text-xs text-zinc-600">to settle between you. Whatever is still held then goes to an Admin.</p>
            </Card>
          </aside>
        </div>
      )}

      {tab === "admin" && (
        <div className="max-w-2xl space-y-4">
          <Card title="An Admin will allocate the held amount">
            <p className="text-sm text-zinc-700">
              {F.rand(held)} is still held. An Admin from finance and disputes reads the Completion, your reason, and the
              Conversation, then Releases some to Sipho and Returns the rest to you. That decision is final.
            </p>
            <p className="mt-3 text-sm text-zinc-700">Until then you can still Release, or agree a Return with Sipho.</p>
          </Card>
          <Note>No clock on the Admin. Rework is not an outcome.</Note>
        </div>
      )}
    </>
  );
}

function Review() {
  const r = H.useReview();
  return (
    <>
      <PageHead crumbs="My Jobs" title={F.job.title} status="Completed" sub="Review Sipho Ndlovu for Plumbing" />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          {r.submitted ? (
            <p className="text-sm">Submitted. It publishes when Sipho submits, or on {F.reviewWindow.closesAt}.</p>
          ) : (
            <div className="space-y-5">
              {F.REVIEW_DIMENSIONS.map((d) => (
                <div key={d.key}>
                  <p className="text-sm font-medium">{d.label}</p>
                  <p className="mb-2 text-xs text-zinc-500">{d.hint}</p>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => r.setScore(d.key, n)}
                        className={`size-9 rounded-lg border text-sm ${r.scores[d.key] === n ? "border-zinc-900 bg-zinc-900 text-white" : "hover:bg-zinc-50"}`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <Field label="Comment (optional)">
                <textarea rows={3} className={input} value={r.comment} onChange={(e) => r.setComment(e.target.value)} />
                {r.refused && <p className="mt-1 text-xs text-red-700">Remove this before submitting: {r.refused}.</p>}
              </Field>
              <Button disabled={!r.canSubmit} onClick={r.submit}>
                Submit Review
              </Button>
            </div>
          )}
        </Card>
        <aside className="space-y-4">
          <Card title="Who sees it, when">
            <p className="text-sm text-zinc-600">
              Sipho can't read yours until you both submit or {F.reviewWindow.closesAt}. You won't see whether Sipho has
              written one. You can't edit it after.
            </p>
          </Card>
          <Card title="Hire Sipho again">
            <p className="text-sm text-zinc-600">Start a new Plumbing Job offered only to Sipho. The site and scope are copied.</p>
            <Button variant="outline" className="mt-3 w-full">
              Hire Again
            </Button>
          </Card>
        </aside>
      </div>
    </>
  );
}

function Verification() {
  const v = F.verification;
  const tone: Record<F.CheckState, string> = {
    Accepted: "text-emerald-700",
    Waiting: "text-amber-700",
    Rejected: "text-red-700",
    "Not submitted": "text-zinc-500",
    "Not needed": "text-zinc-400",
  };
  const rows = (items: { name: string; state: F.CheckState; note?: string }[]) =>
    items.map((c) => (
      <div key={c.name} className="flex flex-wrap items-center gap-3 border-b py-3 last:border-0">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{c.name}</p>
          {c.note && <p className="text-xs text-zinc-500">{c.note}</p>}
        </div>
        <span className={`text-xs font-medium ${tone[c.state]}`}>{c.state}</span>
        {(c.state === "Rejected" || c.state === "Not submitted") && (
          <Button size="sm" variant="outline">
            {c.state === "Rejected" ? "Submit again" : "Submit"}
          </Button>
        )}
      </div>
    ));
  return (
    <>
      <PageHead title="Verification" sub={`${v.artisan} · Electrical`} status={undefined} />
      <div className="mb-4">
        <Note tone="amber">
          Not yet verified for Electrical. You can't Quote Electrical Jobs, and nothing about Electrical shows on your profile,
          until every check below is current.
        </Note>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Once, for every category">{rows(v.once)}</Card>
        <Card title="For Electrical">{rows(v.perCategory)}</Card>
        <Card title="Optional, never needed to Quote">
          {rows(v.optional)}
          <p className="mt-2 text-xs text-zinc-500">Shown on your profile once accepted. A missing one is never shown as a failure.</p>
        </Card>
      </div>
    </>
  );
}

function ArtisanHome() {
  const h = F.home;
  const [available, setAvailable] = useState(true);
  const [datesState, setDatesState] = useState<"pending" | "confirmed" | "asked">("pending");
  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <nav className="hidden space-y-1 text-sm lg:block">
        {["Home", "Job Matches", "Quotes", "Engagements", "Payouts", "Profile", "Verification"].map((x, i) => (
          <div key={x} className={`rounded-lg px-3 py-2 ${i === 0 ? "bg-white font-medium shadow-sm" : "text-zinc-600"}`}>
            {x}
          </div>
        ))}
      </nav>
      <div className="space-y-6">
        <Card>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={available} onChange={(e) => setAvailable(e.target.checked)} className="size-4" />
              Available for Jobs
            </label>
            <span className="text-xs text-zinc-500">{available ? "Receiving Job Matches and invitations" : "Paused. Your profile stays visible."}</span>
            <div className="ml-auto flex flex-wrap gap-1 text-xs">
              {F.artisan.regions.map((r) => (
                <span key={r} className="rounded-full bg-zinc-100 px-2 py-0.5">
                  {r}
                </span>
              ))}
              <span className="px-1 text-zinc-500">3 of 3 Regions</span>
            </div>
          </div>
        </Card>

        {datesState === "pending" && (
          <Card title="Thandi M. sent dates" className="ring-2 ring-violet-200">
            <p className="text-sm">
              {h.quotes[0].title} · {F.rand(h.quotes[0].total)} · start <b>12 Oct</b>, <b>2 days</b>
            </p>
            <p className="mt-1 text-xs text-zinc-500">Confirming accepts your Quote. Thandi then has 7 × 24 hours to pay.</p>
            <div className="mt-3 flex gap-2">
              <Button onClick={() => setDatesState("confirmed")}>Confirm dates</Button>
              <Button variant="outline" onClick={() => setDatesState("asked")}>
                Ask to change
              </Button>
              <Button variant="ghost">Withdraw Quote</Button>
            </div>
          </Card>
        )}
        {datesState !== "pending" && <Note>{datesState === "confirmed" ? "Accepted. Waiting for Payment." : "Asked Thandi to change the dates. You can still confirm these."}</Note>}

        <Card title="New for you">
          <div className="divide-y">
            {h.jobMatches.map((m) => (
              <div key={m.title} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{m.title}</p>
                  <p className="text-xs text-zinc-500">
                    {m.kind} · {m.category} · {m.region} · {m.siteType} · {m.at}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {m.client.shownName} · {m.client.paid} paid · {m.client.completed} Completed ·{" "}
                    {"average" in m.client && m.client.average ? `★ ${m.client.average} (${m.client.reviews})` : "no Reviews"}
                  </p>
                </div>
                <Button size="sm">Quote</Button>
                <Button size="sm" variant="ghost">
                  Not interested
                </Button>
              </div>
            ))}
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Engagements">
            {h.engagements.map((e) => (
              <div key={e.title} className="border-b py-2 last:border-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{e.title}</p>
                  <StatusPill s={e.status} />
                </div>
                <p className="text-xs text-zinc-500">
                  {e.client} · {e.next}
                </p>
              </div>
            ))}
          </Card>
          <Card title="Quotes">
            {h.quotes.map((q) => (
              <div key={q.title} className="flex items-center justify-between gap-2 border-b py-2 last:border-0">
                <div>
                  <p className="text-sm">{q.title}</p>
                  <p className="text-xs text-zinc-500">
                    {q.client} · {F.rand(q.total)}
                  </p>
                </div>
                <StatusPill s={q.status} />
              </div>
            ))}
          </Card>
          <Card title="Payouts">
            {h.payouts.map((p) => (
              <div key={p.at} className="border-b py-2 text-sm last:border-0">
                <Row k={`${p.at} · ${p.engagement}`} v={F.rand(p.release - p.fee)} />
                <p className="text-xs text-zinc-500">
                  Release {F.rand(p.release)} − Artisan Fee {F.rand(p.fee)}
                </p>
              </div>
            ))}
          </Card>
          <Card title="Your Reliability Record">
            <p className="text-sm text-zinc-600">No entries. Only you and ArtisanConnect can read this.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Notices() {
  const [side, setSide] = useState<"Client" | "Artisan">("Client");
  return (
    <div className="mx-auto max-w-3xl">
      <PageHead title="Notices" sub="Each is also emailed, without Conversation text. Wording here is placeholder." />
      <div className="mb-3 flex gap-2">
        {(["Client", "Artisan"] as const).map((s) => (
          <Choice key={s} on={side === s} onClick={() => setSide(s)}>
            As {s}
          </Choice>
        ))}
      </div>
      <div className="divide-y rounded-xl border bg-white">
        {F.notices[side].map((n) => (
          <div key={n.at + n.event} className="flex items-start gap-3 px-4 py-3">
            <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.unread ? "bg-sky-500" : "bg-transparent"}`} />
            <div className="min-w-0 flex-1">
              <p className={`text-sm ${n.unread ? "font-medium" : ""}`}>{n.event}</p>
              <p className="truncate text-xs text-zinc-500">{n.job}</p>
            </div>
            <span className="shrink-0 text-xs text-zinc-400">{n.at}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
