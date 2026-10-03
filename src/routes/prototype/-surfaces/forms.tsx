// PROTOTYPE, throwaway. The three screens that have two designs:
// B (record / stream, in the Job-record shell) and A (conventional form pages).
//   sign-up, Artisan Profile editing, Account settings.
import { useState, type ReactNode } from "react";
import { Camera, Check, FilePlus2, Mail, Plus, ShieldCheck, UserRound, X } from "lucide-react";
import * as F from "./fixtures";
import {
  Badge,
  btn,
  btnLight,
  Chips,
  Demo,
  EmailCodeBox,
  field,
  IdentityFields,
  Label,
  looksLikeEmail,
  Note,
  NowItem,
  OpenRow,
  Pill,
  Proposal,
  RecordItem,
  RecordList,
  useEmailCode,
  useIdentity,
  type ScreenProps,
} from "./parts";
import { Page } from "./screens";

const LAUNCH = "/prototype/launch?variant=B&screen=";

// =====================================================================================
// sign-up
// =====================================================================================

type Kind = "Client" | "Artisan";

function useSignup() {
  const [kind, setKind] = useState<Kind>("Client");
  const [email, setEmail] = useState("");
  const ec = useEmailCode();
  const [fullName, setFullName] = useState("");
  const [publicName, setPublicName] = useState("");
  const id = useIdentity();
  const [rules, setRules] = useState(false);
  const [done, setDone] = useState(false);
  const personOk = fullName.trim().split(/\s+/).length >= 2 && publicName.trim().length > 0;
  const needsRules = kind === "Client";
  const missing = [
    !looksLikeEmail(email) && "an email address",
    !ec.proven && "the code sent to it",
    fullName.trim().split(/\s+/).length < 2 && "the named person's full name",
    !publicName.trim() && "a public name",
    !id.ok && "a valid Identity Number",
    needsRules && !rules && "acceptance of the marketplace rules",
  ].filter(Boolean) as string[];
  return {
    kind,
    setKind,
    email,
    setEmail: (v: string) => {
      setEmail(v);
      if (ec.sentTo && ec.sentTo !== v.trim()) ec.reset();
    },
    ec,
    fullName,
    setFullName,
    publicName,
    setPublicName,
    id,
    rules,
    setRules,
    done,
    finish: () => setDone(true),
    personOk,
    needsRules,
    missing,
  };
}
type Signup = ReturnType<typeof useSignup>;

const KIND_TEXT: Record<Kind, string> = {
  Client: "I want to hire Artisans for work on my home or premises.",
  Artisan: "I do the work and want to send Quotes.",
};

function KindPicker({ s }: { s: Signup }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {(["Client", "Artisan"] as const).map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => s.setKind(k)}
          className={`rounded-lg border p-3 text-left ${s.kind === k ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white hover:border-stone-900"}`}
        >
          <span className="block text-sm font-medium">A {k} Account</span>
          <span className={`block text-xs ${s.kind === k ? "text-stone-300" : "text-stone-500"}`}>
            {KIND_TEXT[k]}
          </span>
        </button>
      ))}
      <p className="text-[11px] text-stone-500 sm:col-span-2">
        The kind never changes. You may hold one of each, with the same Identity Number, and they
        share nothing: no session, no Profile, no Reviews, no Conversation.
      </p>
    </div>
  );
}

function EmailPart({ s }: { s: Signup }) {
  const ok = looksLikeEmail(s.email);
  return (
    <div className="space-y-3">
      <div>
        <Label>Email</Label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="email"
            value={s.email}
            onChange={(e) => s.setEmail(e.target.value)}
            className={`${field} max-w-sm`}
            placeholder="you@example.co.za"
          />
          {!s.ec.sentTo && (
            <button
              type="button"
              className={btn}
              disabled={!ok}
              onClick={() => s.ec.send(s.email.trim())}
            >
              Send a code
            </button>
          )}
        </div>
        <p className="mt-1.5 text-[11px] text-stone-500">
          You sign in with this address. One email is one Account.
          <Proposal>
            An address that already holds an Account gets the same answer here. The holder is mailed
            a sign-in link instead of a code.
          </Proposal>
        </p>
      </div>
      <EmailCodeBox ec={s.ec} address={s.email.trim()} />
    </div>
  );
}

function PersonPart({ s }: { s: Signup }) {
  return (
    <div className="space-y-3">
      <div>
        <Label hint="the one person who acts, as on their identity document">
          Named person's full name
        </Label>
        <input
          value={s.fullName}
          onChange={(e) => s.setFullName(e.target.value)}
          className={`${field} max-w-sm`}
        />
      </div>
      <div>
        <Label hint="your own name or a trading name; not unique; you can change it">
          Public name
        </Label>
        <input
          value={s.publicName}
          onChange={(e) => s.setPublicName(e.target.value)}
          className={`${field} max-w-sm`}
        />
      </div>
      <p className="text-[11px] text-stone-500">
        Nobody else can act for this Account, and the person cannot be replaced. There is no crew,
        company, or second login.
      </p>
    </div>
  );
}

function RulesPart({ s }: { s: Signup }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        className="mt-1"
        checked={s.rules}
        onChange={(e) => s.setRules(e.target.checked)}
      />
      <span>
        I accept the marketplace rules, version of 1 Sep 2026.
        <span className="block text-[11px] text-stone-500">
          Rules wording is out of scope here. You accept again after a change, before a Job can be
          matched or paid.
        </span>
      </span>
    </label>
  );
}

function Done({ s, go }: { s: Signup; go: ScreenProps["go"] }) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">
        <ShieldCheck className="mr-1 inline size-4" /> Your {s.kind} Account is held.
      </p>
      {s.kind === "Client" ? (
        <>
          <p className="text-xs text-stone-600">
            You can post a Job now. A Job needs a title, a description, a suburb, and one photo of
            the work.
          </p>
          <button type="button" className={btn} onClick={() => go("jobs")}>
            Go to your Jobs
          </button>
        </>
      ) : (
        <>
          <p className="text-xs text-stone-600">
            You cannot Quote yet. Verification comes first: your identity document, address, a
            payout account in your name, two references, work evidence, and any trade credential,
            for each trade.
          </p>
          <div className="flex flex-wrap gap-2">
            <a href={`${LAUNCH}verification`} className={btn}>
              Start Verification
            </a>
            <button type="button" className={btnLight} onClick={() => go("regions")}>
              Choose Regions
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const IDKIND = {
  sa: "South African ID",
  refugee: "Refugee identity document",
  passport: "Passport",
} as const;

/** B: the sign-up is a record that grows. Answered steps fold into rows, the next one is the Now block. */
function SignupRecord({ go }: ScreenProps) {
  const s = useSignup();
  const [step, setStep] = useState(0);
  const last = s.needsRules ? 4 : 3; // index of the final step; one past it is Done
  const next = () => setStep((n) => n + 1);
  const back = (n: number) => {
    if (n <= 1) s.ec.reset();
    setStep(n);
  };
  return (
    <Page title="Join ArtisanConnect" kicker="Visitor">
      <RecordList>
        {step > 0 && (
          <RecordItem icon={<UserRound />} title={`A ${s.kind} Account`} onClick={() => back(0)} />
        )}
        {step > 1 && (
          <RecordItem
            icon={<Mail />}
            title={s.email}
            body="Email proven by a code"
            onClick={() => back(1)}
          />
        )}
        {step > 2 && (
          <RecordItem
            icon={<UserRound />}
            title={`${s.fullName}, public name ${s.publicName}`}
            onClick={() => back(2)}
          />
        )}
        {step > 3 && (
          <RecordItem
            icon={<ShieldCheck />}
            title={`Identity Number: ${IDKIND[s.id.kind]} ${F.mask(s.id.number.replace(/\s/g, ""))}`}
            body={
              s.id.kind === "sa" && s.id.sa.state === "ok"
                ? `Born ${s.id.sa.birth.getFullYear()}, at least 18`
                : "Birth date given, at least 18"
            }
            onClick={() => back(3)}
          />
        )}
        {step > 4 && s.needsRules && (
          <RecordItem icon={<Check />} title="Marketplace rules accepted" onClick={() => back(4)} />
        )}

        <NowItem label={step > last ? "Done" : `Step ${step + 1} of ${last + 1}`}>
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="font-serif text-xl">Which kind of Account?</h2>
              <KindPicker s={s} />
              <button type="button" className={btn} onClick={next}>
                Continue
              </button>
            </div>
          )}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="font-serif text-xl">Your email, then a code</h2>
              <EmailPart s={s} />
              <button type="button" className={btn} disabled={!s.ec.proven} onClick={next}>
                Continue
              </button>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="font-serif text-xl">Who acts for this Account?</h2>
              <PersonPart s={s} />
              <button type="button" className={btn} disabled={!s.personOk} onClick={next}>
                Continue
              </button>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="font-serif text-xl">Identity Number</h2>
              <IdentityFields id={s.id} kindOfAccount={s.kind} />
              <button
                type="button"
                className={btn}
                disabled={!s.id.ok}
                onClick={() => (s.needsRules ? next() : (s.finish(), setStep(last + 1)))}
              >
                {s.needsRules ? "Continue" : "Create my Artisan Account"}
              </button>
            </div>
          )}
          {step === 4 && s.needsRules && (
            <div className="space-y-4">
              <h2 className="font-serif text-xl">Marketplace rules</h2>
              <RulesPart s={s} />
              <button
                type="button"
                className={btn}
                disabled={!s.rules}
                onClick={() => (s.finish(), setStep(last + 1))}
              >
                Create my Client Account
              </button>
            </div>
          )}
          {step > last && <Done s={s} go={go} />}
        </NowItem>
      </RecordList>
      <p className="text-[11px] text-stone-500">
        An Artisan accepts the marketplace rules in Verification, as a gate to Quote, not here.
        <Proposal>Where the Artisan accepts them is not drawn in a closed ticket.</Proposal>
      </p>
    </Page>
  );
}

/** A: one ordinary form page. */
function SignupForm({ go }: ScreenProps) {
  const s = useSignup();
  const section = (n: number, title: string, body: ReactNode) => (
    <section className="rounded-xl border border-stone-300 bg-white p-5">
      <h2 className="mb-3 flex items-baseline gap-2 font-serif text-lg">
        <span className="font-sans text-xs text-stone-400">{n}</span>
        {title}
      </h2>
      {body}
    </section>
  );
  return (
    <Page title="Create your Account" kicker="Visitor">
      {s.done ? (
        <div className="rounded-xl border border-stone-300 bg-white p-5">
          <Done s={s} go={go} />
        </div>
      ) : (
        <div className="space-y-4">
          {section(1, "Kind of Account", <KindPicker s={s} />)}
          {section(2, "Email", <EmailPart s={s} />)}
          {section(3, "The named person", <PersonPart s={s} />)}
          {section(4, "Identity Number", <IdentityFields id={s.id} kindOfAccount={s.kind} />)}
          {s.needsRules && section(5, "Marketplace rules", <RulesPart s={s} />)}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={btn}
              disabled={s.missing.length > 0}
              onClick={s.finish}
            >
              Create my {s.kind} Account
            </button>
            {s.missing.length > 0 && (
              <span className="text-xs text-stone-500">Still needed: {s.missing.join(", ")}</span>
            )}
          </div>
        </div>
      )}
    </Page>
  );
}

export function Signup(p: ScreenProps) {
  return p.variant === "A" ? <SignupForm {...p} /> : <SignupRecord {...p} />;
}

// =====================================================================================
// editing an Artisan Profile
// =====================================================================================

type Pic = { label: string; state: "Accepted" | "Checking" };

function useProfileEdit() {
  const [name, setName] = useState(F.me.publicName);
  const [about, setAbout] = useState(F.me.about);
  const [newPhoto, setNewPhoto] = useState(false);
  const [services, setServices] = useState(F.me.services);
  const [draftService, setDraftService] = useState("");
  const [pics, setPics] = useState<Record<string, Pic[]>>(
    Object.fromEntries(
      F.me.categories.map((c) => [
        c.name,
        c.evidence.map((e) => ({ label: e, state: "Accepted" as const })),
      ]),
    ),
  );
  const [refused, setRefused] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const touch = () => {
    setDirty(true);
    setSaved(false);
  };
  return {
    name,
    setName: (v: string) => (setName(v), touch()),
    about,
    setAbout: (v: string) => (setAbout(v), touch()),
    newPhoto,
    changePhoto: () => (setNewPhoto(true), touch()),
    services,
    draftService,
    setDraftService,
    addService: () => {
      const t = draftService.trim();
      if (!t || services.includes(t)) return;
      setServices([...services, t]);
      setDraftService("");
      touch();
    },
    removeService: (s: string) => (setServices(services.filter((x) => x !== s)), touch()),
    pics,
    refused,
    addPic: (cat: string) => {
      setPics((p) => ({
        ...p,
        [cat]: [...p[cat], { label: `New picture ${p[cat].length + 1}`, state: "Checking" }],
      }));
      setRefused(null);
      touch();
    },
    removePic: (cat: string, i: number) => {
      const rest = pics[cat].filter((_, j) => j !== i);
      if (!rest.some((p) => p.state === "Accepted")) {
        setRefused(cat);
        return;
      }
      setPics({ ...pics, [cat]: rest });
      setRefused(null);
      touch();
    },
    nameChanged: name.trim() !== F.me.publicName,
    saved,
    dirty,
    save: () => (setSaved(true), setDirty(false)),
  };
}
type PE = ReturnType<typeof useProfileEdit>;

const EVIDENCE_HELP =
  "A picture of your own finished work in this trade. A document, video, or voice note does not count. At least one must stay accepted.";

function EvidenceGrid({ e, cat }: { e: PE; cat: string }) {
  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {e.pics[cat].map((p, i) => (
          <div
            key={p.label + i}
            className="group relative aspect-square rounded-lg bg-stone-200 p-2 text-[11px] text-stone-600"
          >
            {p.label}
            <span className="absolute right-1 bottom-1">
              <Pill tone={p.state === "Accepted" ? "good" : "warn"}>{p.state}</Pill>
            </span>
            <button
              type="button"
              aria-label={`Remove ${p.label}`}
              onClick={() => e.removePic(cat, i)}
              className="absolute top-1 right-1 hidden rounded-full bg-white/90 p-0.5 group-hover:block"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => e.addPic(cat)}
          className="grid aspect-square place-items-center rounded-lg border border-dashed border-stone-400 text-xs text-stone-500 hover:border-stone-900"
        >
          <span className="flex flex-col items-center gap-1">
            <Plus className="size-4" /> Add a picture
          </span>
        </button>
      </div>
      {e.refused === cat && (
        <div className="mt-2">
          <Note tone="warn">
            Keep at least one accepted picture. Add another, and remove this one once it is
            accepted.
            <Proposal>A removal that would leave none is refused.</Proposal>
          </Note>
        </div>
      )}
      <p className="mt-1.5 text-[11px] text-stone-500">
        {EVIDENCE_HELP}
        <Proposal>
          A further picture goes live after the automatic check. Only your first needs a person.
        </Proposal>
      </p>
    </div>
  );
}

function ServicesEditor({ e }: { e: PE }) {
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {e.services.map((s) => (
          <span
            key={s}
            className="inline-flex items-center gap-1 rounded-full bg-stone-200 py-1 pr-1.5 pl-3 text-xs"
          >
            {s}
            <button
              type="button"
              aria-label={`Remove ${s}`}
              onClick={() => e.removeService(s)}
              className="rounded-full p-0.5 hover:bg-stone-300"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="mt-2 flex max-w-sm gap-2">
        <input
          value={e.draftService}
          onChange={(ev) => e.setDraftService(ev.target.value)}
          onKeyDown={(ev) => ev.key === "Enter" && e.addService()}
          placeholder="A line of work you do"
          className={field}
        />
        <button type="button" className={btnLight} onClick={e.addService}>
          Add
        </button>
      </div>
      <p className="mt-1.5 text-[11px] text-stone-500">
        Services are what you say you do. They are not Service Categories, and no Job selects one.
        Only a trade you are verified for lets you Quote.
      </p>
    </div>
  );
}

function SaveBar({ e }: { e: PE }) {
  if (!e.dirty && !e.saved) return null;
  return (
    <div className="sticky bottom-20 z-10 mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-stone-300 bg-white/95 p-3 shadow-lg backdrop-blur">
      {e.dirty ? (
        <>
          <span className="text-xs text-stone-600">Unsaved changes</span>
          <button type="button" className={btn} onClick={e.save}>
            Save
          </button>
        </>
      ) : (
        <span className="text-xs text-emerald-800">
          Saved.
          {(e.nameChanged || e.newPhoto) &&
            " A person checks a changed name or photo before it shows. Until then your Profile shows the old one."}
        </span>
      )}
    </div>
  );
}

/** B: the Profile itself, edited in place. Same long page a Visitor reads, with each part editable. */
function ProfileInPlace({ go }: ScreenProps) {
  const e = useProfileEdit();
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
      <Note>
        This is your public page, as a Visitor reads it. Edit any part in place. It shows no phone,
        email, street, or link.
      </Note>
      <div className="mt-6 flex items-center gap-5">
        <button
          type="button"
          onClick={e.changePhoto}
          className="group relative grid size-20 shrink-0 place-items-center rounded-full bg-stone-900 font-serif text-2xl text-white"
        >
          {F.me.initials}
          <span className="absolute inset-0 grid place-items-center rounded-full bg-stone-900/70 opacity-0 group-hover:opacity-100">
            <Camera className="size-5" />
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <input
            value={e.name}
            onChange={(ev) => e.setName(ev.target.value)}
            aria-label="Public name"
            className="w-full border-b border-dashed border-stone-400 bg-transparent font-serif text-3xl outline-none focus:border-stone-900"
          />
          <p className="mt-1 text-[11px] text-stone-500">
            Your own name or a trading name.
            {e.newPhoto && <Pill tone="warn">New photo waits for a check</Pill>}
            {e.nameChanged && <Pill tone="warn">New name waits for a check</Pill>}
          </p>
        </div>
      </div>
      <textarea
        value={e.about}
        onChange={(ev) => e.setAbout(ev.target.value)}
        rows={3}
        aria-label="About"
        className="mt-5 w-full rounded-md border border-dashed border-stone-400 bg-transparent p-2 text-sm outline-none focus:border-stone-900"
      />
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-600">
        Regions: {F.me.regions.join(", ")}
        <button type="button" className="underline" onClick={() => go("regions")}>
          change
        </button>
        <span className="text-stone-400">·</span> Available for Jobs is on your home.
      </div>

      <h2 className="mt-8 mb-2 text-[11px] font-medium tracking-wide text-stone-500 uppercase">
        Services you describe
      </h2>
      <ServicesEditor e={e} />

      {F.me.categories.map((c) => (
        <section key={c.name} className="mt-8 rounded-xl border border-stone-300 bg-white p-5">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h2 className="font-serif text-xl">{c.name}</h2>
            <span className="text-sm">
              {c.average.toFixed(1)}{" "}
              <span className="text-xs text-stone-500">
                · {c.reviews} Reviews · {c.completed} Completed
              </span>
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {c.badges.map((b) => (
              <Badge key={b.name} {...b} />
            ))}
          </div>
          <p className="mt-1 text-[11px] text-stone-500">
            Badges come from Verification. They are not edited here.
          </p>
          <h3 className="mt-5 mb-2 text-xs font-medium">Work evidence</h3>
          <EvidenceGrid e={e} cat={c.name} />
        </section>
      ))}

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <a href={`${LAUNCH}verification`} className="inline-flex items-center gap-1 underline">
          <FilePlus2 className="size-3.5" /> Add a trade: Verification
        </a>
      </div>
      <div className="mt-6 flex flex-wrap gap-1.5">
        {F.me.optionalBadges.map((b) => (
          <Badge key={b.name} {...b} />
        ))}
        <span className="text-[11px] text-stone-500">
          Optional badges show as soon as they are completed.
        </span>
      </div>
      <SaveBar e={e} />
    </main>
  );
}

/** A: a form with sections, and the Visitor's view docked beside it. */
function ProfileForm() {
  const e = useProfileEdit();
  return (
    <main className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-8 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <h1 className="font-serif text-3xl">Edit your Profile</h1>
        <section className="space-y-3 rounded-xl border border-stone-300 bg-white p-5">
          <h2 className="font-serif text-lg">Basics</h2>
          <div>
            <Label>Public name</Label>
            <input
              value={e.name}
              onChange={(ev) => e.setName(ev.target.value)}
              className={`${field} max-w-sm`}
            />
            {e.nameChanged && (
              <p className="mt-1 text-[11px] text-amber-900">
                A person checks a changed name before it shows.
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-full bg-stone-900 text-white">
              {F.me.initials}
            </span>
            <button type="button" className={btnLight} onClick={e.changePhoto}>
              <Camera className="size-4" /> Change photo
            </button>
            {e.newPhoto && <Pill tone="warn">Waits for a check</Pill>}
          </div>
          <div>
            <Label>About</Label>
            <textarea
              value={e.about}
              onChange={(ev) => e.setAbout(ev.target.value)}
              rows={3}
              className={field}
            />
          </div>
        </section>
        <section className="rounded-xl border border-stone-300 bg-white p-5">
          <h2 className="mb-3 font-serif text-lg">Services you describe</h2>
          <ServicesEditor e={e} />
        </section>
        {F.me.categories.map((c) => (
          <section key={c.name} className="rounded-xl border border-stone-300 bg-white p-5">
            <h2 className="mb-1 font-serif text-lg">{c.name}: work evidence</h2>
            <div className="mb-3 flex flex-wrap gap-1">
              {c.badges.map((b) => (
                <Badge key={b.name} {...b} />
              ))}
            </div>
            <EvidenceGrid e={e} cat={c.name} />
          </section>
        ))}
        <SaveBar e={e} />
      </div>
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <p className="mb-2 text-[11px] font-medium tracking-wide text-stone-500 uppercase">
          As a Visitor sees it
        </p>
        <div className="rounded-xl border border-stone-300 bg-white p-4">
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-full bg-stone-900 text-white">
              {F.me.initials}
            </span>
            <span className="font-serif text-xl">{F.me.publicName}</span>
          </div>
          <p className="mt-2 text-xs text-stone-600">{e.about}</p>
          <p className="mt-2 text-xs text-stone-500">{e.services.join(" · ")}</p>
          {F.me.categories.map((c) => (
            <div key={c.name} className="mt-3 border-t border-stone-200 pt-2">
              <p className="text-sm font-medium">
                {c.name}{" "}
                <span className="font-normal text-stone-500">
                  {c.average.toFixed(1)} · {c.reviews}
                </span>
              </p>
              <p className="text-[11px] text-stone-500">
                {e.pics[c.name].filter((p) => p.state === "Accepted").length} pictures shown
              </p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-stone-500">
          Only accepted pictures, and the name and photo a person has accepted, show here.
        </p>
      </aside>
    </main>
  );
}

export function ProfileEdit(p: ScreenProps) {
  return p.variant === "A" ? <ProfileForm /> : <ProfileInPlace {...p} />;
}

// =====================================================================================
// Account settings
// =====================================================================================

const shownAs = (name: string) => {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (w.length < 2) return w[0] ?? "";
  return `${w[0]} ${w[w.length - 1][0].toUpperCase()}.`;
};

function useSettings(kind: Kind) {
  const base = kind === "Client" ? F.client : F.me;
  const [publicName, setPublicName] = useState(base.publicName);
  const [nameDraft, setNameDraft] = useState(base.publicName);
  const [nameSaved, setNameSaved] = useState(false);
  const [email, setEmail] = useState(kind === "Client" ? F.client.email : F.me.email);
  const [newEmail, setNewEmail] = useState("");
  const [emailChanged, setEmailChanged] = useState(false);
  const ec = useEmailCode();
  const [vat, setVat] = useState(false);
  const [vatDraft, setVatDraft] = useState(false);
  const [vatSaved, setVatSaved] = useState(false);
  const [payout, setPayout] = useState<F.AccountState>("current");
  const [closing, setClosing] = useState<"blocked" | "free">("blocked");
  const [closeStep, setCloseStep] = useState<"idle" | "confirm" | "closed">("idle");
  const held = F.heldEmails.includes(newEmail.trim().toLowerCase());
  return {
    kind,
    publicName,
    nameDraft,
    setNameDraft: (v: string) => (setNameDraft(v), setNameSaved(false)),
    nameSaved,
    saveName: () => {
      setPublicName(nameDraft.trim());
      setNameSaved(true);
    },
    email,
    newEmail,
    setNewEmail: (v: string) => {
      setNewEmail(v);
      if (ec.sentTo && ec.sentTo !== v.trim()) ec.reset();
    },
    emailChanged,
    ec,
    held,
    commitEmail: () => {
      setEmail(newEmail.trim());
      setEmailChanged(true);
      setNewEmail("");
      ec.reset();
    },
    vat,
    vatDraft,
    setVatDraft: (v: boolean) => (setVatDraft(v), setVatSaved(false)),
    vatSaved,
    saveVat: () => (setVat(vatDraft), setVatSaved(true)),
    payout,
    setPayout,
    closing,
    setClosing,
    closeStep,
    setCloseStep,
  };
}
type ST = ReturnType<typeof useSettings>;

function NameBody({ t }: { t: ST }) {
  return (
    <div className="space-y-2">
      <div className="flex max-w-md gap-2">
        <input
          value={t.nameDraft}
          onChange={(e) => t.setNameDraft(e.target.value)}
          className={field}
        />
        <button
          type="button"
          className={btn}
          disabled={!t.nameDraft.trim() || t.nameDraft.trim() === t.publicName}
          onClick={t.saveName}
        >
          Save
        </button>
      </div>
      <p className="text-[11px] text-stone-500">
        {t.kind === "Client"
          ? `Your own name or a trading name. Artisans matched to your Job see it as ${shownAs(t.nameDraft) || "…"}.`
          : "Your own name or a trading name. It is not unique, and earlier names stay on your Account."}
        {t.kind === "Client" && (
          <Proposal>how a trading name becomes "first name and surname initial"</Proposal>
        )}
      </p>
      {t.nameSaved && (
        <Note tone={t.kind === "Artisan" ? "warn" : "good"}>
          {t.kind === "Artisan"
            ? "Saved. A person checks a changed Profile name before it shows. Until then Visitors see the old one."
            : "Saved."}
        </Note>
      )}
    </div>
  );
}

function EmailBody({ t }: { t: ST }) {
  const ok = looksLikeEmail(t.newEmail);
  return (
    <div className="space-y-3">
      <p className="text-xs text-stone-600">
        You sign in with <b>{t.email}</b>. To change it, enter the new address and prove it with a
        code. Until you do, the old address still signs in.
      </p>
      {!t.ec.proven ? (
        <>
          <div className="flex max-w-md flex-wrap gap-2">
            <input
              value={t.newEmail}
              onChange={(e) => t.setNewEmail(e.target.value)}
              placeholder="New email"
              className={field}
            />
            {!t.ec.sentTo && (
              <button
                type="button"
                className={btn}
                disabled={!ok || t.held}
                onClick={() => t.ec.send(t.newEmail.trim())}
              >
                Send a code
              </button>
            )}
          </div>
          {t.held && ok && <p className="text-xs text-red-700">That address cannot be used.</p>}
          <EmailCodeBox ec={t.ec} address={t.newEmail.trim()} />
          <p className="text-[11px] text-stone-500">
            An address held by any Account, closed ones included, is refused. At most five codes an
            hour.
          </p>
        </>
      ) : (
        <div className="space-y-2">
          <Note tone="good">The new address is proven.</Note>
          <button type="button" className={btn} onClick={t.commitEmail}>
            Change my Email to {t.ec.sentTo}
          </button>
        </div>
      )}
      {t.emailChanged && (
        <Note tone="good">
          Email changed. The old address got one email saying so, with no link back and no way to
          undo it.
        </Note>
      )}
      <p className="text-[11px] text-stone-500 sm:hidden" />
    </div>
  );
}

function VatBody({ t }: { t: ST }) {
  return (
    <div className="space-y-3">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={t.vatDraft}
          onChange={(e) => t.setVatDraft(e.target.checked)}
        />
        <span>I am VAT-registered.</span>
      </label>
      <Note>
        {t.vatDraft
          ? "Your Quote price is then the price including VAT, and the Client's Payment adds no VAT on top."
          : "Your Quote shows no VAT line."}{" "}
        This is your statement. ArtisanConnect does not check it and does not issue a tax invoice.
      </Note>
      <div className="flex items-center gap-3">
        <button type="button" className={btn} disabled={t.vatDraft === t.vat} onClick={t.saveVat}>
          Save
        </button>
        {t.vatSaved && (
          <span className="text-xs text-emerald-800">
            Saved. Applies to Quotes you send from now.
          </span>
        )}
        <Proposal>An open Quote keeps the statement it was sent with.</Proposal>
      </div>
    </div>
  );
}

function PayoutBody({ t }: { t: ST }) {
  const [hasDoc, setHasDoc] = useState(false);
  const [bank, setBank] = useState("");
  const [acc, setAcc] = useState("");
  const form = (
    <div className="max-w-md space-y-3 rounded-lg border border-stone-200 bg-stone-50 p-3">
      <p className="text-xs font-medium">
        {t.payout === "current" || t.payout === "pending" ? "Replace it" : "Add one"}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <select value={bank} onChange={(e) => setBank(e.target.value)} className={field}>
          <option value="">Bank</option>
          {["FNB", "Absa", "Standard Bank", "Nedbank", "Capitec"].map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
        <input
          value={acc}
          onChange={(e) => setAcc(e.target.value.replace(/\D/g, ""))}
          placeholder="Account number"
          inputMode="numeric"
          className={field}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btnLight} onClick={() => setHasDoc(true)}>
          <Plus className="size-4" /> Add a bank letter or statement
        </button>
        {hasDoc && <Pill tone="good">bank-letter.pdf</Pill>}
      </div>
      <p className="text-[11px] text-stone-500">
        The account must bear <b>{F.me.publicName}</b>, the named person. A trading name is not
        enough. A person reads the document. Nothing is looked up at the bank.
      </p>
      <button
        type="button"
        className={btn}
        disabled={!bank || acc.length < 6 || !hasDoc}
        onClick={() => t.setPayout("pending")}
      >
        Send for a check
      </button>
    </div>
  );
  return (
    <div className="space-y-3">
      {t.payout !== "none" && (
        <div className="max-w-md rounded-lg border border-stone-200 p-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-medium">FNB · ••••4821</span>
            {t.payout === "rejected" ? (
              <Pill tone="bad">Not current</Pill>
            ) : (
              <Pill tone="good">Current</Pill>
            )}
          </div>
          <p className="mt-0.5 text-xs text-stone-500">
            In the name of {F.me.publicName}. Accepted 14 Sep.
          </p>
          {t.payout === "rejected" && (
            <p className="mt-1.5 text-xs text-red-800">
              The bank rejected a Payout on 2 Oct. This account is no longer current, and Payouts
              wait.
            </p>
          )}
        </div>
      )}
      {t.payout === "none" && (
        <Note tone="warn">No payout account. Payouts wait, and you cannot Quote.</Note>
      )}
      {t.payout === "pending" && (
        <Note>
          A replacement (Capitec ••••9033) is waiting for a check. Payouts keep going to the current
          account, and it still lets you Quote, until the replacement is accepted. If it is
          rejected, the current one stays.
        </Note>
      )}
      {t.payout !== "pending" && form}
      <Demo>
        state:
        <Chips
          value={t.payout}
          options={["current", "pending", "rejected", "none"] as const}
          onChange={t.setPayout}
        />
      </Demo>
    </div>
  );
}

function RulesBody({ t }: { t: ST }) {
  return (
    <p className="text-xs text-stone-600">
      {t.kind === "Client" ? F.client.rulesAccepted : F.me.rulesAccepted}. If the rules change you
      are asked again{" "}
      {t.kind === "Client"
        ? "before a Job can be matched or paid"
        : "before a new Quote, and an open Quote cannot be accepted until you do"}
      .
    </p>
  );
}

function IdentityBody({ t }: { t: ST }) {
  const id = t.kind === "Client" ? F.client.identity : F.me.identity;
  return (
    <div className="space-y-2">
      <p className="font-mono text-sm">{F.mask(id)}</p>
      <p className="text-xs text-stone-600">
        This cannot be changed here. It holds this Account, and closing the Account does not free
        it. A mistaken number is corrected after a check, and it can never be swapped for a
        different person.
        <Proposal>No closed ticket says where an Account asks for a correction.</Proposal>
      </p>
    </div>
  );
}

function CloseBody({ t }: { t: ST }) {
  const c = t.kind === "Client" ? F.clientClosing : F.artisanClosing;
  if (t.closeStep === "closed")
    return (
      <Note tone="good">
        Closed. You are signed out. You can reopen this Account by signing in with <b>{t.email}</b>{" "}
        and an email code. Nothing that ended comes back.
      </Note>
    );
  return (
    <div className="space-y-3">
      {t.closing === "blocked" ? (
        <>
          <Note tone="warn">You can close this Account once none of these remain:</Note>
          <ul className="list-disc space-y-1 pl-5 text-xs text-stone-700">
            {c.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <button type="button" className={btnLight} disabled>
            Close my Account
          </button>
        </>
      ) : (
        <>
          <p className="text-xs text-stone-700">Closing:</p>
          <ul className="list-disc space-y-1 pl-5 text-xs text-stone-700">
            {c.effects.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          {t.closeStep === "idle" ? (
            <button type="button" className={btnLight} onClick={() => t.setCloseStep("confirm")}>
              Close my Account
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button type="button" className={btn} onClick={() => t.setCloseStep("closed")}>
                Yes, close it
              </button>
              <button type="button" className={btnLight} onClick={() => t.setCloseStep("idle")}>
                Keep it
              </button>
            </div>
          )}
        </>
      )}
      <Demo>
        what the Account holds:
        <Chips
          value={t.closing}
          options={["blocked", "free"] as const}
          onChange={(v) => (t.setClosing(v), t.setCloseStep("idle"))}
        />
      </Demo>
    </div>
  );
}

function sectionsOf(t: ST) {
  const payoutLabel = {
    current: "FNB ••••4821, current",
    pending: "FNB ••••4821, replacement waiting",
    rejected: "Not current",
    none: "None",
  }[t.payout];
  const rows: { key: string; title: string; value: ReactNode; body: ReactNode; tag?: ReactNode }[] =
    [
      { key: "name", title: "Public name", value: t.publicName, body: <NameBody t={t} /> },
      { key: "email", title: "Email", value: t.email, body: <EmailBody t={t} /> },
    ];
  if (t.kind === "Artisan") {
    rows.push(
      {
        key: "vat",
        title: "VAT statement",
        value: t.vat ? "VAT-registered" : "Not VAT-registered",
        body: <VatBody t={t} />,
      },
      {
        key: "payout",
        title: "Payout account",
        value: payoutLabel,
        body: <PayoutBody t={t} />,
        tag:
          t.payout === "rejected" || t.payout === "none" ? (
            <Pill tone="warn">Needs you</Pill>
          ) : undefined,
      },
    );
  }
  rows.push(
    {
      key: "rules",
      title: "Marketplace rules",
      value: t.kind === "Client" ? F.client.rulesAccepted : F.me.rulesAccepted,
      body: <RulesBody t={t} />,
    },
    {
      key: "id",
      title: "Identity Number",
      value: F.mask(t.kind === "Client" ? F.client.identity : F.me.identity),
      body: <IdentityBody t={t} />,
    },
    {
      key: "close",
      title: "Close this Account",
      value: t.closeStep === "closed" ? "Closed" : "",
      body: <CloseBody t={t} />,
    },
  );
  return rows;
}

/** B: a stream of rows, each opening in place. */
function SettingsStream({ kind }: { kind: Kind }) {
  const t = useSettings(kind);
  const rows = sectionsOf(t);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Page title="Your Account" kicker={`${kind} Account`}>
      <div className="rounded-xl border border-stone-300 bg-white px-5">
        {rows.map((r) => (
          <OpenRow
            key={r.key}
            title={r.title}
            value={r.value}
            tag={r.tag}
            open={open === r.key}
            onToggle={() => setOpen(open === r.key ? null : r.key)}
          >
            {r.body}
          </OpenRow>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-stone-500">
        {kind === "Artisan" ? "Available for Jobs and your Regions are on your home. " : ""}A closed
        Account keeps its Reviews{kind === "Artisan" ? ", its Reliability Record," : ""} and its
        Client Relationships.
      </p>
    </Page>
  );
}

/** A: a rail of sections and one pane. */
function SettingsRail({ kind }: { kind: Kind }) {
  const t = useSettings(kind);
  const rows = sectionsOf(t);
  const [cur, setCur] = useState("name");
  const r = rows.find((x) => x.key === cur) ?? rows[0];
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      <h1 className="font-serif text-3xl">Account settings</h1>
      <div className="mt-6 grid gap-8 md:grid-cols-[200px_1fr]">
        <nav className="flex gap-1 overflow-x-auto md:flex-col">
          {rows.map((x) => (
            <button
              key={x.key}
              type="button"
              onClick={() => setCur(x.key)}
              className={`flex items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm whitespace-nowrap ${x.key === r.key ? "bg-stone-900 text-white" : "hover:bg-stone-200"}`}
            >
              {x.title}
              {x.tag}
            </button>
          ))}
        </nav>
        <section className="rounded-xl border border-stone-300 bg-white p-5">
          <h2 className="mb-1 font-serif text-xl">{r.title}</h2>
          <p className="mb-4 text-xs text-stone-500">{r.value}</p>
          {r.body}
        </section>
      </div>
    </main>
  );
}

export function Settings({ variant, kind }: { variant: ScreenProps["variant"]; kind: Kind }) {
  return variant === "A" ? <SettingsRail kind={kind} /> : <SettingsStream kind={kind} />;
}
