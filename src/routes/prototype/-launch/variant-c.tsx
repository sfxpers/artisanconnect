// PROTOTYPE, throwaway. Variant C, "Next step": phone-first, even on a desktop.
// Every screen leads with the one decision in front of you, as a big card with a
// single primary action. Detail folds away underneath. Quotes are one at a time.
// Posting a Job is one question per step. Bottom tabs, not a top nav.
import { useState, type ReactNode } from "react";
import {
  Bell,
  BadgeCheck,
  Briefcase,
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Home,
  MapPin,
  Search,
  User,
} from "lucide-react";
import * as F from "./fixtures";
import * as H from "./hooks";

const box = "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base outline-none focus:border-teal-600";

export function VariantC({ screen, go }: H.VariantProps) {
  const who = F.screenOf(screen).who;
  return (
    <div className="min-h-svh bg-slate-200 pb-24 sm:py-6">
      <div className="relative mx-auto flex min-h-svh max-w-[420px] flex-col overflow-hidden bg-slate-50 text-slate-900 shadow-xl sm:min-h-[820px] sm:rounded-[2rem]">
        <div className="flex-1 overflow-auto pb-20">
          {screen === "profile" && <Profile />}
          {screen === "post" && <PostWizard />}
          {screen === "quotes" && <Quotes go={go} />}
          {screen === "conversation" && <Conversation go={go} />}
          {screen === "engagement" && <Engagement />}
          {screen === "completion" && <Completion />}
          {screen === "release" && <Release go={go} />}
          {screen === "dispute" && <Dispute />}
          {screen === "review" && <Review />}
          {screen === "verification" && <Verification />}
          {screen === "home" && <ArtisanHome go={go} />}
          {screen === "notices" && <Notices />}
        </div>
        <Tabs who={who} screen={screen} go={go} />
      </div>
    </div>
  );
}

function Tabs({ who, screen, go }: { who: F.Who; screen: F.ScreenKey; go: (s: F.ScreenKey) => void }) {
  const tabs: [string, ReactNode, F.ScreenKey][] =
    who === "Artisan"
      ? [
          ["Today", <Home key="h" />, "home"],
          ["Work", <Briefcase key="b" />, "completion"],
          ["Checks", <BadgeCheck key="c" />, "verification"],
          ["Notices", <Bell key="n" />, "notices"],
        ]
      : who === "Client"
        ? [
            ["Find", <Search key="s" />, "profile"],
            ["Jobs", <Briefcase key="b" />, "quotes"],
            ["Notices", <Bell key="n" />, "notices"],
            ["Me", <User key="u" />, "post"],
          ]
        : [
            ["Find", <Search key="s" />, "profile"],
            ["Sign in", <User key="u" />, "profile"],
          ];
  return (
    <nav className="absolute inset-x-0 bottom-0 flex border-t border-slate-200 bg-white/95 backdrop-blur">
      {tabs.map(([label, icon, key]) => (
        <button
          key={label}
          type="button"
          onClick={() => go(key)}
          className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] [&_svg]:size-5 ${screen === key ? "text-teal-700" : "text-slate-500"}`}
        >
          {icon}
          {label}
        </button>
      ))}
    </nav>
  );
}

function Top({ title, sub, back }: { title: string; sub?: string; back?: () => void }) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 bg-slate-50/95 px-4 pt-4 pb-2 backdrop-blur">
      {back && (
        <button type="button" onClick={back} className="-ml-1 rounded-full p-1">
          <ChevronLeft className="size-5" />
        </button>
      )}
      <div className="min-w-0">
        <p className="truncate text-base font-semibold">{title}</p>
        {sub && <p className="truncate text-xs text-slate-500">{sub}</p>}
      </div>
    </div>
  );
}

/** The card every screen leads with: what is in front of you now, and one action. */
function NextStep({
  eyebrow,
  title,
  children,
  action,
  onAction,
  disabled,
  tone = "teal",
}: {
  eyebrow: string;
  title: ReactNode;
  children?: ReactNode;
  action?: string;
  onAction?: () => void;
  disabled?: boolean;
  tone?: "teal" | "amber" | "rose";
}) {
  const bg = { teal: "bg-teal-700", amber: "bg-amber-600", rose: "bg-rose-700" }[tone];
  return (
    <section className={`mx-4 mt-2 rounded-3xl ${bg} p-5 text-white shadow-lg`}>
      <p className="text-[11px] font-medium tracking-wider uppercase opacity-80">{eyebrow}</p>
      <h2 className="mt-1 text-2xl leading-tight font-semibold">{title}</h2>
      {children && <div className="mt-3 text-sm opacity-90">{children}</div>}
      {action && (
        <button
          type="button"
          disabled={disabled}
          onClick={onAction}
          className="mt-4 w-full rounded-2xl bg-white py-3 text-base font-semibold text-slate-900 disabled:opacity-40"
        >
          {action}
        </button>
      )}
    </section>
  );
}

function Fold({ title, children, open: initial = false }: { title: string; children: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(initial);
  return (
    <section className="mx-4 mt-3 rounded-2xl bg-white">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium">
        {title}
        <ChevronDown className={`size-4 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="border-t border-slate-100 px-4 py-3 text-sm text-slate-700">{children}</div>}
    </section>
  );
}

function Line({ k, v, bold }: { k: ReactNode; v: ReactNode; bold?: boolean }) {
  return (
    <div className={`flex justify-between py-1 ${bold ? "font-semibold text-slate-900" : ""}`}>
      <span>{k}</span>
      <span className="tabular-nums">{v}</span>
    </div>
  );
}

function Chip({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "teal" }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${tone === "teal" ? "bg-teal-50 text-teal-800" : "bg-slate-100 text-slate-700"}`}>
      {children}
    </span>
  );
}

function BadgeList({ list }: { list: F.Badge[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {list.map((b) => (
        <Chip key={b.name} tone="teal">
          <BadgeCheck className="size-3" /> {b.name}
          {b.validTo && <span className="opacity-60">· to {b.validTo}</span>}
        </Chip>
      ))}
    </div>
  );
}

// ---------- screens ----------

function Profile() {
  const a = F.artisan;
  const [cat, setCat] = useState(0);
  const c = a.categories[cat];
  return (
    <>
      <div className="h-36 bg-gradient-to-br from-teal-700 to-slate-800" />
      <div className="-mt-12 px-4">
        <div className="grid size-24 place-items-center rounded-full border-4 border-slate-50 bg-slate-800 text-3xl font-semibold text-white">{a.initials}</div>
        <h1 className="mt-2 text-2xl font-semibold">{a.publicName}</h1>
        <p className="text-sm text-slate-600">{a.about}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Chip tone="teal">Available for Jobs</Chip>
          {a.regions.map((r) => (
            <Chip key={r}>
              <MapPin className="size-3" />
              {r}
            </Chip>
          ))}
        </div>
      </div>
      <div className="mt-4 flex gap-2 overflow-x-auto px-4">
        {a.categories.map((x, i) => (
          <button key={x.name} type="button" onClick={() => setCat(i)} className={`shrink-0 rounded-full px-4 py-2 text-sm ${i === cat ? "bg-slate-900 text-white" : "bg-white"}`}>
            {x.name} · ★ {x.average}
          </button>
        ))}
      </div>
      <div className="mx-4 mt-3 rounded-2xl bg-white p-4">
        <p className="text-3xl font-semibold">
          ★ {c.average}
          <span className="ml-2 text-sm font-normal text-slate-500">
            {c.reviews} Reviews · {c.completed} Completed
          </span>
        </p>
        <div className="mt-3">
          <BadgeList list={c.badges} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {c.workPhotos.map((p) => (
            <div key={p} className="flex aspect-square items-end rounded-xl bg-slate-200 p-2 text-[10px] text-slate-600">
              {p}
            </div>
          ))}
        </div>
      </div>
      <Fold title="Services, in Sipho's words">{a.services.join(" · ")}</Fold>
      <Fold title="What a badge means">A check ArtisanConnect completed. Not a promise the work will be good. A missing badge is not a failed one.</Fold>
      <div className="sticky bottom-20 mx-4 mt-4">
        <button type="button" className="w-full rounded-2xl bg-teal-700 py-3 font-semibold text-white shadow-lg">
          Sign in to invite Sipho to a Job
        </button>
      </div>
    </>
  );
}

function PostWizard() {
  const p = H.usePostJob();
  const [step, setStep] = useState(0);
  const steps: { q: string; ok: boolean; body: ReactNode }[] = [
    {
      q: "What kind of work?",
      ok: !!p.category && (p.category !== "Plumbing" || p.gas !== null) && (p.category !== "Electrical" || p.ack),
      body: (
        <>
          <div className="grid grid-cols-2 gap-2">
            {F.CATEGORIES.map((c) => (
              <button key={c} type="button" onClick={() => p.setCategory(c)} className={`rounded-2xl px-3 py-4 text-left text-sm ${p.category === c ? "bg-teal-700 text-white" : "bg-white"}`}>
                {c}
              </button>
            ))}
          </div>
          {p.category === "Plumbing" && (
            <div className="mt-4 rounded-2xl bg-white p-4">
              <p className="text-sm font-medium">Does it include installing or removing a gas appliance, gas system, or gas reticulation?</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[true, false].map((v) => (
                  <button key={String(v)} type="button" onClick={() => p.setGas(v)} className={`rounded-xl py-3 ${p.gas === v ? "bg-slate-900 text-white" : "bg-slate-100"}`}>
                    {v ? "Yes" : "No"}
                  </button>
                ))}
              </div>
            </div>
          )}
          {p.category === "Electrical" && (
            <label className="mt-4 flex gap-3 rounded-2xl bg-white p-4 text-sm">
              <input type="checkbox" checked={p.ack} onChange={(e) => p.setAck(e.target.checked)} className="size-5" />
              It is electrical installation work.
            </label>
          )}
        </>
      ),
    },
    {
      q: "Where is the site?",
      ok: !!p.siteType && !!p.region && p.region !== "unplaceable",
      body: (
        <>
          <div className="grid grid-cols-2 gap-2">
            {(["Home", "Business"] as const).map((v) => (
              <button key={v} type="button" onClick={() => p.setSiteType(v)} className={`rounded-2xl py-4 ${p.siteType === v ? "bg-teal-700 text-white" : "bg-white"}`}>
                {v}
              </button>
            ))}
          </div>
          <input className={`${box} mt-3`} placeholder="Street and suburb" value={p.address} onChange={(e) => p.setAddress(e.target.value)} />
          {p.region && p.region !== "unplaceable" && <p className="mt-2 text-sm">Region: <b>{p.region}</b>. Artisans see only this until you pay.</p>}
          {p.region === "unplaceable" && <p className="mt-2 text-sm text-rose-700">That's outside every open Region.</p>}
        </>
      ),
    },
    {
      q: "Describe it",
      ok: !!p.title.trim() && !!p.description.trim() && !p.leak,
      body: (
        <>
          <input className={box} placeholder="Title" value={p.title} onChange={(e) => p.setTitle(e.target.value)} />
          <textarea rows={6} className={`${box} mt-2`} placeholder="What's wrong, what you want done" value={p.description} onChange={(e) => p.setDescription(e.target.value)} />
          {p.leak && (
            <p className="mt-2 flex gap-1 text-sm text-rose-700">
              <CircleAlert className="size-4 shrink-0" /> Take out {p.leak.replace("it contains ", "the ")}. Contact stays here until you pay.
            </p>
          )}
        </>
      ),
    },
    {
      q: "Show the work",
      ok: p.photos.length > 0,
      body: (
        <div className="grid grid-cols-3 gap-2">
          {p.photos.map((ph) => (
            <div key={ph} className="flex aspect-square items-end rounded-xl bg-slate-200 p-1 text-[10px]">
              {ph}
            </div>
          ))}
          <button type="button" onClick={p.addPhoto} className="grid aspect-square place-items-center rounded-xl border-2 border-dashed border-slate-300 text-slate-400">
            <Camera />
          </button>
        </div>
      ),
    },
    {
      q: "When would you like it to start?",
      ok: true,
      body: (
        <>
          <input type="date" className={box} value={p.preferredStart} onChange={(e) => p.setPreferredStart(e.target.value)} />
          <p className="mt-2 text-sm text-slate-500">Optional. You agree the real dates with the Artisan you choose.</p>
        </>
      ),
    },
  ];
  if (p.posted)
    return (
      <>
        <Top title="Job posted" />
        <NextStep eyebrow="Open" title="Artisans who can Quote are being offered it">
          Quotes appear here as they arrive, up to five. You only see those who Quote.
        </NextStep>
        <Fold title="What's locked now" open>
          Category, gas answer, and site are locked. Title, description, and photos lock at the first Quote.
        </Fold>
      </>
    );
  const s = steps[step];
  const last = step === steps.length - 1;
  return (
    <>
      <Top title="Post a Job" sub={`Step ${step + 1} of ${steps.length}`} back={step ? () => setStep(step - 1) : undefined} />
      <div className="mx-4 mb-4 flex gap-1">
        {steps.map((_, i) => (
          <span key={i} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-teal-700" : "bg-slate-300"}`} />
        ))}
      </div>
      <div className="px-4">
        <h1 className="mb-4 text-2xl font-semibold">{s.q}</h1>
        {s.body}
        <button
          type="button"
          disabled={!s.ok || (last && !p.canPost)}
          onClick={() => (last ? p.post() : setStep(step + 1))}
          className="mt-6 w-full rounded-2xl bg-teal-700 py-3 font-semibold text-white disabled:opacity-40"
        >
          {last ? "Post Job" : "Next"}
        </button>
        {last && !p.canPost && <p className="mt-2 text-center text-xs text-slate-500">Still needs {p.missing.join(", ")}.</p>}
        <button type="button" onClick={p.fillExample} className="mt-3 w-full text-center text-xs text-slate-500 underline">
          fill example
        </button>
      </div>
    </>
  );
}

function Quotes({ go }: { go: (s: F.ScreenKey) => void }) {
  const q = H.useQuotes();
  const [i, setI] = useState(0);
  const x = q.quotes[i];
  const total = F.quoteTotal(x);
  const pay = (t: number) => t + F.pctOf(t, F.PROTECTION_FEE_PCT);
  return (
    <>
      <Top title={F.job.title} sub={`${q.accepted ? "Artisan Chosen" : "Open"} · ${F.job.region} · 3 of 5 Quotes`} />
      {q.accepted ? (
        <NextStep eyebrow="Artisan Chosen" title={`Pay ${F.rand(pay(F.quoteTotal(q.accepted)))}`} action="Pay by card or Instant EFT" onAction={() => go("engagement")}>
          {q.accepted.artisan} confirmed 12 Oct, 2 days. Pay by 11 Oct, 12:15 or the Job is Ended.
        </NextStep>
      ) : q.pending ? (
        <NextStep eyebrow="Waiting on the Artisan" title={`Your dates are with ${q.quotes.find((y) => y.id === q.pending?.quoteId)?.artisan.split(" ")[0]}`} tone="amber">
          {q.pending.start}, {q.pending.durationDays} days. The Quote is accepted when they confirm.
          <div className="mt-2 flex gap-4 text-xs underline">
            <button type="button" onClick={q.cancelDates}>
              cancel dates
            </button>
            <button type="button" onClick={q.artisanConfirms}>
              (simulate confirm)
            </button>
          </div>
        </NextStep>
      ) : (
        <NextStep eyebrow="Your move" title="Pick a Quote and enter your dates" />
      )}

      <div className="mx-4 mt-4 flex items-center gap-2 text-xs text-slate-500">
        <span>Arrange</span>
        {(["sent", "total", "duration"] as const).map((k) => (
          <button key={k} type="button" onClick={() => (q.setOrder(k), setI(0))} className={`rounded-full px-3 py-1 ${q.order === k ? "bg-slate-900 text-white" : "bg-white"}`}>
            {k === "sent" ? "Sent" : k === "total" ? "Total" : "Duration"}
          </button>
        ))}
      </div>

      <div className="mx-4 mt-3 rounded-3xl bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <button type="button" onClick={() => setI((i - 1 + q.quotes.length) % q.quotes.length)} className="rounded-full bg-slate-100 p-1.5">
            <ChevronLeft className="size-4" />
          </button>
          Quote {i + 1} of {q.quotes.length} · {x.status}
          {x.revised ? " · revised" : ""}
          <button type="button" onClick={() => setI((i + 1) % q.quotes.length)} className="rounded-full bg-slate-100 p-1.5">
            <ChevronRight className="size-4" />
          </button>
        </div>
        <p className="mt-4 text-lg font-semibold">{x.artisan}</p>
        <p className="text-sm text-slate-500">
          {x.average ? `★ ${x.average} · ${x.reviews} Plumbing Reviews` : "No Reviews yet"} · {x.completedInCategory} Completed
        </p>
        <p className="mt-4 text-4xl font-semibold tabular-nums">{F.rand(total)}</p>
        <p className="text-xs text-slate-500">You'd pay {F.rand(pay(total))} with the {F.PROTECTION_FEE_PCT}% Protection Fee</p>
        <div className="mt-4 space-y-0.5 text-sm text-slate-700">
          <Line k="Labour" v={F.rand(x.labour)} />
          <Line k={`Materials · ${x.supplies === "Both" ? "both supply" : `${x.supplies} supplies`}`} v={F.rand(x.materials)} />
          <Line k="Warranty" v={x.warranty ?? "—"} />
          <Line k="Duration estimate" v={x.durationDays ? `${x.durationDays} days` : "—"} />
        </div>
        <div className="mt-4">
          <BadgeList list={x.badges} />
        </div>
        <p className="mt-4 text-sm text-slate-700">{x.scope}</p>
        {x.status === "Sent" && !q.pending && (
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => q.sendDates(x.id)} className="col-span-2 rounded-2xl bg-teal-700 py-3 font-semibold text-white">
              Choose · enter dates
            </button>
            <button type="button" onClick={() => go("conversation")} className="rounded-2xl bg-slate-100 py-2.5 text-sm">
              Message
            </button>
            <button type="button" onClick={() => q.decline(x.id)} className="rounded-2xl bg-slate-100 py-2.5 text-sm">
              Decline
            </button>
          </div>
        )}
      </div>
      <div className="mx-4 mt-3 flex gap-2">
        {q.quotes.map((y, j) => (
          <button key={y.id} type="button" onClick={() => setI(j)} className={`flex-1 rounded-xl px-2 py-2 text-left text-xs ${j === i ? "bg-slate-900 text-white" : "bg-white"}`}>
            {y.artisan.split(" ")[0]}
            <br />
            <b className="tabular-nums">{F.rand(F.quoteTotal(y))}</b>
          </button>
        ))}
      </div>
    </>
  );
}

function Conversation({ go }: { go: (s: F.ScreenKey) => void }) {
  const c = H.useComposer();
  return (
    <div className="flex min-h-[calc(100svh-5rem)] flex-col sm:min-h-[740px]">
      <Top title="Sipho Ndlovu" sub="Quote R12,000 · Sent" back={() => go("quotes")} />
      <p className="mx-4 rounded-xl bg-slate-100 px-3 py-2 text-[11px] text-slate-600">
        ArtisanConnect can read this Conversation for support, a report, or a Dispute.
      </p>
      <div className="flex-1 space-y-2 px-4 py-3">
        {c.messages.map((m, i) => (
          <div key={i} className={`flex ${m.from === "Client" ? "justify-end" : ""}`}>
            <div className={`max-w-[80%] rounded-3xl px-4 py-2 text-sm ${m.from === "Client" ? "bg-teal-700 text-white" : "bg-white"}`}>{m.text}</div>
          </div>
        ))}
      </div>
      <div className="sticky bottom-16 bg-slate-50 px-3 pt-2 pb-3">
        {c.refused && (
          <div className="mb-2 rounded-2xl bg-white px-4 py-3 text-sm shadow">
            <p className="font-medium">Not sent</p>
            <p className="text-slate-600">
              {c.refused[0].toUpperCase() + c.refused.slice(1)}. Contact details can go here once you've paid.
            </p>
          </div>
        )}
        <div className="flex gap-2">
          <input className={box} value={c.draft} onChange={(e) => c.setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && c.send()} />
          <button type="button" onClick={c.send} className="rounded-2xl bg-teal-700 px-4 font-semibold text-white">
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function Engagement() {
  const e = F.engagement;
  const total = e.updatedQuote.labour + e.updatedQuote.materials;
  const extra = total - e.quoteTotal;
  const [decided, setDecided] = useState<string | null>(null);
  return (
    <>
      <Top title={F.job.title} sub="Paid · Sipho Ndlovu" />
      {!decided ? (
        <NextStep eyebrow="Sipho proposes an Updated Quote" title={`${F.rand(total)}, up ${F.rand(extra)}`} tone="amber" action={`Accept and pay ${F.rand(extra + F.pctOf(extra, F.PROTECTION_FEE_PCT))}`} onAction={() => setDecided("Accepted")}>
          {e.updatedQuote.scope}
          <button type="button" onClick={() => setDecided("Rejected")} className="mt-3 block w-full text-center text-sm underline">
            Reject and keep {F.rand(e.quoteTotal)}
          </button>
        </NextStep>
      ) : (
        <NextStep eyebrow="Paid" title="Sipho is doing the work">
          Updated Quote {decided.toLowerCase()}. Next: Sipho states Completion.
        </NextStep>
      )}
      <Fold title="Dates · 12 Oct, 2 days">
        <button type="button" className="text-teal-700 underline">
          Propose new dates
        </button>
        <p className="mt-1 text-xs text-slate-500">Apply only when Sipho confirms.</p>
      </Fold>
      <Fold title="Contact and site" open>
        <Line k="Sipho" v={e.contact.artisanPhone} />
        <Line k="Site" v={e.contact.site} />
        <p className="mt-1 text-xs text-slate-500">Further work with Sipho stays on ArtisanConnect until {e.protectedUntil}.</p>
      </Fold>
      <Fold title={`Payment · ${F.rand(e.quoteTotal + e.protectionFee)}`}>
        <Line k="Quote" v={F.rand(e.quoteTotal)} />
        <Line k="Protection Fee" v={F.rand(e.protectionFee)} />
        <p className="mt-1 text-xs text-slate-500">Nothing goes to Sipho before Completion.</p>
      </Fold>
      <button type="button" className="mx-4 mt-4 text-sm text-rose-700 underline">
        Cancel Engagement
      </button>
    </>
  );
}

function Completion() {
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState(0);
  const [files, setFiles] = useState(0);
  const [done, setDone] = useState(false);
  const missing = [!note.trim() && "a note", !photos && "an after-work photo", !files && "the certificate of conformity"].filter(Boolean);
  if (done)
    return (
      <>
        <Top title={F.job.title} />
        <NextStep eyebrow="Completion stated" title="Thandi has until 17 Oct, 16:20">
          After that, whatever Thandi hasn't Released or Disputed comes to you.
        </NextStep>
      </>
    );
  return (
    <>
      <Top title={F.job.title} sub="Paid · Thandi M." />
      <NextStep
        eyebrow="When the work is done"
        title="State Completion"
        action={missing.length ? `Needs ${missing.join(", ")}` : "State Completion"}
        disabled={missing.length > 0}
        onAction={() => setDone(true)}
      >
        This can't be edited or withdrawn. It fixes the price, scope, and Warranty.
      </NextStep>
      <div className="mx-4 mt-3 space-y-2">
        <textarea rows={3} className={box} placeholder="Note to Thandi" value={note} onChange={(e) => setNote(e.target.value)} />
        <button type="button" onClick={() => setPhotos((n) => n + 1)} className="flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm">
          <Camera className="size-5" /> After-work photos <span className="ml-auto text-slate-500">{photos || "none yet"}</span>
        </button>
        <button type="button" onClick={() => setFiles((n) => n + 1)} className="flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm">
          <BadgeCheck className="size-5" /> Certificate of conformity <span className="ml-auto text-slate-500">{files || "required"}</span>
        </button>
      </div>
    </>
  );
}

function Release({ go }: { go: (s: F.ScreenKey) => void }) {
  const r = H.useRelease();
  const pct = Math.round((r.released / F.release.quoteTotal) * 100);
  return (
    <>
      <Top title={F.job.title} sub={`${r.unreleased ? "Awaiting release" : "Completed"} · Sipho Ndlovu`} />
      <NextStep eyebrow="Sipho stated Completion" title={r.unreleased ? `${F.rand(r.unreleased)} still to Release` : "All Released"}>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/25">
          <div className="h-full bg-white" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-xs">
          {F.rand(r.released)} of {F.rand(F.release.quoteTotal)} Released
        </p>
      </NextStep>
      {r.unreleased > 0 && (
        <div className="mx-4 mt-3 rounded-3xl bg-white p-5">
          <p className="text-center text-4xl font-semibold tabular-nums">{F.rand(r.amount.cents)}</p>
          <input type="range" min={0} max={r.unreleased} step={10000} value={r.amount.cents} onChange={(e) => r.amount.setCents(Number(e.target.value))} className="mt-4 w-full accent-teal-700" />
          <button type="button" disabled={!r.amount.valid} onClick={r.doRelease} className="mt-4 w-full rounded-2xl bg-teal-700 py-3 font-semibold text-white disabled:opacity-40">
            Release to Sipho
          </button>
        </div>
      )}
      <div className="mx-4 mt-3 flex items-center gap-4 rounded-2xl bg-amber-50 p-4">
        <div className="grid size-14 shrink-0 place-items-center rounded-full border-4 border-amber-500 text-center text-[11px] leading-tight font-semibold text-amber-900">
          2d
          <br />
          7h
        </div>
        <p className="text-sm text-amber-900">
          On {F.release.silenceAt} the rest Releases by itself. Releasing part now doesn't move that.
        </p>
      </div>
      <Fold title="Sipho's Completion">
        <p>{F.release.completion.note}</p>
        <p className="mt-2 text-xs text-slate-500">
          {F.release.completion.photos.length} photos · Certificate of conformity ({F.release.completion.evidence[0]})
        </p>
      </Fold>
      {r.unreleased > 0 && (
        <button type="button" onClick={() => go("dispute")} className="mx-4 mt-4 text-sm text-rose-700 underline">
          Something wrong? Dispute part of it
        </button>
      )}
    </>
  );
}

function Dispute() {
  const d = F.dispute;
  const [phase, setPhase] = useState<"open" | "settle">("settle");
  const amt = H.useAmount(d.held, d.unreleasedBefore);
  const [reason, setReason] = useState("");
  if (phase === "open")
    return (
      <>
        <Top title="Open a Dispute" sub="One per Engagement" back={() => setPhase("settle")} />
        <div className="px-4">
          <p className="mb-2 text-sm text-slate-600">How much should be held? Up to {F.rand(d.unreleasedBefore)}.</p>
          <input className={`${box} text-3xl font-semibold`} value={amt.text} onChange={(e) => amt.setText(e.target.value)} />
          <textarea rows={4} className={`${box} mt-3`} placeholder="What's wrong (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button type="button" disabled={!amt.valid || !reason.trim()} onClick={() => setPhase("settle")} className="mt-4 w-full rounded-2xl bg-rose-700 py-3 font-semibold text-white disabled:opacity-40">
            Hold {amt.valid ? F.rand(amt.cents) : ""}
          </button>
          <p className="mt-3 text-xs text-slate-500">The rest still Releases on {F.release.silenceAt}. A Dispute doesn't end the Engagement.</p>
        </div>
      </>
    );
  return (
    <>
      <Top title={F.job.title} sub="Disputed · Sipho Ndlovu" />
      <NextStep eyebrow={`Settle by ${d.settleUntil}`} title={`Sipho offers to Return ${F.rand(d.artisanReturnOffer)}`} tone="rose" action="Agree to the Return">
        Of the {F.rand(d.held)} held. Its Protection Fee comes back too. After {d.settleUntil}, an Admin splits what's still held, and that's final.
      </NextStep>
      <div className="mx-4 mt-3 grid grid-cols-2 gap-2 text-sm">
        <button type="button" className="rounded-2xl bg-white py-3">
          Release some
        </button>
        <button type="button" className="rounded-2xl bg-white py-3">
          Withdraw Dispute
        </button>
      </div>
      <Fold title={`Held ${F.rand(d.held)} · not held ${F.rand(d.unreleasedBefore - d.held)}`}>
        The {F.rand(d.unreleasedBefore - d.held)} not held still Releases on {F.release.silenceAt}.
      </Fold>
      <Fold title="Your reason">{d.reason}</Fold>
      <button type="button" onClick={() => setPhase("open")} className="mx-4 mt-4 text-xs text-slate-500 underline">
        (see the opening step)
      </button>
    </>
  );
}

function Review() {
  const r = H.useReview();
  const [i, setI] = useState(0);
  if (r.submitted)
    return (
      <>
        <Top title="Review sent" />
        <NextStep eyebrow="Sealed" title={`Publishes when Sipho submits, or on ${F.reviewWindow.closesAt}`} action="Hire Sipho again" />
      </>
    );
  const d = F.REVIEW_DIMENSIONS[i];
  const last = i === F.REVIEW_DIMENSIONS.length;
  return (
    <>
      <Top title="Review Sipho · Plumbing" sub={`Sealed until you both submit or ${F.reviewWindow.closesAt}`} back={i ? () => setI(i - 1) : undefined} />
      <div className="mx-4 mb-4 flex gap-1">
        {[...F.REVIEW_DIMENSIONS, null].map((_, j) => (
          <span key={j} className={`h-1 flex-1 rounded-full ${j <= i ? "bg-teal-700" : "bg-slate-300"}`} />
        ))}
      </div>
      {!last ? (
        <div className="px-4">
          <h1 className="text-2xl font-semibold">{d.label}</h1>
          <p className="mt-1 text-sm text-slate-600">{d.hint}</p>
          <div className="mt-6 grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  r.setScore(d.key, n);
                  setI(i + 1);
                }}
                className={`aspect-square rounded-2xl text-xl font-semibold ${r.scores[d.key] === n ? "bg-teal-700 text-white" : "bg-white"}`}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-xs text-slate-500">
            <span>Poor</span>
            <span>Excellent</span>
          </div>
        </div>
      ) : (
        <div className="px-4">
          <h1 className="text-2xl font-semibold">Anything to add?</h1>
          <textarea rows={5} className={`${box} mt-4`} placeholder="Optional" value={r.comment} onChange={(e) => r.setComment(e.target.value)} />
          {r.refused && <p className="mt-2 text-sm text-rose-700">Take out {r.refused.replace("it contains ", "the ")}.</p>}
          <button type="button" disabled={!r.canSubmit} onClick={r.submit} className="mt-4 w-full rounded-2xl bg-teal-700 py-3 font-semibold text-white disabled:opacity-40">
            Submit Review
          </button>
          <p className="mt-2 text-center text-xs text-slate-500">You can't edit it after. You won't see whether Sipho has written one.</p>
        </div>
      )}
    </>
  );
}

function Verification() {
  const v = F.verification;
  const all = [...v.once, ...v.perCategory].filter((c) => c.state !== "Not needed");
  const done = all.filter((c) => c.state === "Accepted").length;
  const todo = all.filter((c) => c.state === "Rejected" || c.state === "Not submitted");
  return (
    <>
      <Top title="Checks" sub={v.artisan} />
      <NextStep eyebrow="Electrical" title={`${done} of ${all.length} checks done`} action={`Fix: ${todo[0].name}`}>
        {todo.length} to submit, 1 waiting. You can Quote Electrical once all are current.
      </NextStep>
      {todo.map((c) => (
        <div key={c.name} className="mx-4 mt-3 rounded-2xl bg-white p-4">
          <p className="font-medium">{c.name}</p>
          <p className="text-sm text-slate-600">{c.note}</p>
        </div>
      ))}
      <Fold title="Done and waiting">
        {all
          .filter((c) => c.state === "Accepted" || c.state === "Waiting")
          .map((c) => (
            <Line key={c.name} k={c.name} v={c.state} />
          ))}
      </Fold>
      <Fold title="Optional checks">
        {v.optional.map((c) => (
          <Line key={c.name} k={c.name} v="Add" />
        ))}
        <p className="mt-1 text-xs text-slate-500">Never needed to Quote.</p>
      </Fold>
    </>
  );
}

function ArtisanHome({ go }: { go: (s: F.ScreenKey) => void }) {
  const h = F.home;
  const [available, setAvailable] = useState(true);
  const [i, setI] = useState(0);
  const m = h.jobMatches[i];
  return (
    <>
      <div className="flex items-center gap-3 px-4 pt-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-500">Today</p>
          <p className="text-xl font-semibold">Sipho</p>
        </div>
        <button type="button" onClick={() => setAvailable((v) => !v)} className={`rounded-full px-3 py-1.5 text-xs font-medium ${available ? "bg-teal-700 text-white" : "bg-slate-300"}`}>
          {available ? "Available" : "Paused"}
        </button>
      </div>
      <NextStep eyebrow="Thandi M. sent dates" title="12 Oct, for 2 days" action="Confirm dates">
        {h.quotes[0].title} · {F.rand(h.quotes[0].total)}. Confirming accepts your Quote.
        <div className="mt-2 flex gap-4 text-xs underline">
          <button type="button">Ask to change</button>
          <button type="button">Withdraw</button>
        </div>
      </NextStep>
      <div className="mx-4 mt-4 flex items-center justify-between text-sm font-medium">
        New for you · {h.jobMatches.length}
        <span className="text-xs font-normal text-slate-500">{F.artisan.regions.length} of 3 Regions</span>
      </div>
      <div className="mx-4 mt-2 rounded-3xl bg-white p-5">
        <p className="text-xs text-slate-500">
          {m.kind} · {m.at}
        </p>
        <p className="mt-1 text-lg font-semibold">{m.title}</p>
        <p className="text-sm text-slate-600">
          {m.category} · {m.region} · {m.siteType}
        </p>
        <p className="mt-2 text-xs text-slate-500">
          {m.client.shownName} · {m.client.paid} paid · {m.client.completed} Completed ·{" "}
          {"average" in m.client && m.client.average ? `★ ${m.client.average} (${m.client.reviews})` : "no Reviews"}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setI((i + 1) % h.jobMatches.length)} className="rounded-2xl bg-slate-100 py-3 text-sm">
            Not interested
          </button>
          <button type="button" className="rounded-2xl bg-teal-700 py-3 text-sm font-semibold text-white">
            Quote
          </button>
        </div>
      </div>
      <Fold title={`Engagements · ${h.engagements.length}`}>
        {h.engagements.map((e) => (
          <button key={e.title} type="button" onClick={() => go("completion")} className="block w-full py-1 text-left">
            <b>{e.title}</b> · {e.status}
            <br />
            <span className="text-xs text-slate-500">{e.next}</span>
          </button>
        ))}
      </Fold>
      <Fold title={`Quotes · ${h.quotes.length}`}>
        {h.quotes.map((q) => (
          <Line key={q.title} k={q.title} v={q.status} />
        ))}
      </Fold>
      <Fold title="Payouts">
        {h.payouts.map((p) => (
          <Line key={p.at} k={`${p.at} · ${p.engagement}`} v={F.rand(p.release - p.fee)} />
        ))}
        <p className="mt-1 text-xs text-slate-500">After the Artisan Fee on each Release.</p>
      </Fold>
      <Fold title="Reliability Record">No entries. Only you and ArtisanConnect see this.</Fold>
    </>
  );
}

function Notices() {
  const [side, setSide] = useState<"Client" | "Artisan">("Client");
  return (
    <>
      <Top title="Notices" sub="Also emailed, without Conversation text. Placeholder wording." />
      <div className="mx-4 mb-3 grid grid-cols-2 rounded-full bg-white p-1 text-sm">
        {(["Client", "Artisan"] as const).map((s) => (
          <button key={s} type="button" onClick={() => setSide(s)} className={`rounded-full py-1.5 ${side === s ? "bg-slate-900 text-white" : ""}`}>
            {s}
          </button>
        ))}
      </div>
      {F.notices[side].map((n) => (
        <div key={n.at + n.event} className={`mx-4 mb-2 rounded-2xl p-4 ${n.unread ? "bg-white shadow-sm" : "bg-slate-100"}`}>
          <p className={`text-sm ${n.unread ? "font-semibold" : ""}`}>{n.event}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {n.job} · {n.at}
          </p>
        </div>
      ))}
    </>
  );
}
