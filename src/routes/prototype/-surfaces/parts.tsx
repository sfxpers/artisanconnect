// PROTOTYPE, throwaway. Shared pieces and behaviour for /prototype/surfaces. No layout decisions here.
import { useEffect, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import * as F from "./fixtures";

export type Variant = "A" | "B";
export type ScreenProps = { variant: Variant; go: (s: F.ScreenKey) => void };

export const ink = "text-stone-900";
export const field =
  "w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-900 disabled:bg-stone-100 disabled:text-stone-500";
export const btn =
  "inline-flex items-center justify-center gap-1.5 rounded-md bg-stone-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-300";
export const btnLight =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-stone-300 bg-white px-3.5 py-2 text-sm hover:border-stone-900 disabled:cursor-not-allowed disabled:text-stone-400";

/** A fact the map has not decided, drawn so it can be reacted to. */
export function Proposal({ children }: { children?: ReactNode }) {
  return (
    <span className="ml-1 inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 align-middle text-[10px] font-medium tracking-wide text-amber-900 uppercase">
      Proposal
      {children ? (
        <span className="font-normal tracking-normal normal-case">: {children}</span>
      ) : null}
    </span>
  );
}

/** Marks a control that only exists to move the prototype between states. */
export function Demo({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-stone-400 px-2 py-1.5 text-[11px] text-stone-500">
      <span className="font-mono uppercase">prototype</span>
      {children}
    </div>
  );
}

export function Chips<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
}) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={`rounded-full px-2 py-0.5 text-[11px] ${value === o ? "bg-stone-900 text-white" : "bg-stone-200 text-stone-700 hover:bg-stone-300"}`}
        >
          {o}
        </button>
      ))}
    </span>
  );
}

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-1">
      <span className="text-xs font-medium">{children}</span>
      {hint && <span className="ml-2 text-[11px] text-stone-500">{hint}</span>}
    </div>
  );
}

export function Pill({
  children,
  tone = "plain",
}: {
  children: ReactNode;
  tone?: "plain" | "dark" | "good" | "warn" | "bad";
}) {
  const t = {
    plain: "bg-stone-200 text-stone-700",
    dark: "bg-stone-900 text-white",
    good: "bg-emerald-100 text-emerald-900",
    warn: "bg-amber-100 text-amber-900",
    bad: "bg-red-100 text-red-900",
  }[tone];
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] ${t}`}>{children}</span>
  );
}

export function Badge({ name, validTo }: { name: string; validTo?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-stone-300 bg-white px-2 py-0.5 text-[11px]">
      <Check className="size-3" /> {name}
      {validTo && <span className="text-stone-500">· to {validTo}</span>}
    </span>
  );
}

export function Note({
  children,
  tone = "plain",
}: {
  children: ReactNode;
  tone?: "plain" | "warn" | "bad" | "good";
}) {
  const t = {
    plain: "border-stone-200 bg-stone-50 text-stone-700",
    warn: "border-amber-300 bg-amber-50 text-amber-950",
    bad: "border-red-300 bg-red-50 text-red-950",
    good: "border-emerald-300 bg-emerald-50 text-emerald-950",
  }[tone];
  return <p className={`rounded-md border px-3 py-2 text-xs leading-relaxed ${t}`}>{children}</p>;
}

/** A record row on a timeline, oldest first, as on a Job. */
export function RecordList({ children }: { children: ReactNode }) {
  return <ol className="relative border-l border-stone-300 pl-6">{children}</ol>;
}
export function RecordItem({
  icon,
  at,
  title,
  body,
  onClick,
}: {
  icon: ReactNode;
  at?: string;
  title: ReactNode;
  body?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <li className="relative mb-6">
      <span className="absolute top-0.5 -left-[35px] grid size-5 place-items-center rounded-full bg-stone-100 text-stone-500 ring-4 ring-stone-100 [&_svg]:size-4">
        {icon}
      </span>
      {at && <p className="text-[11px] text-stone-500">{at}</p>}
      <p className="text-sm font-medium">
        {title}
        {onClick && (
          <button
            type="button"
            onClick={onClick}
            className="ml-2 text-xs font-normal text-stone-500 underline"
          >
            change
          </button>
        )}
      </p>
      {body && <div className="text-xs text-stone-600">{body}</div>}
    </li>
  );
}
export function NowItem({ children, label = "Now" }: { children: ReactNode; label?: string }) {
  return (
    <li className="relative">
      <span className="absolute top-1 -left-[33px] size-3 rounded-full bg-stone-900 ring-4 ring-stone-100" />
      <p className="mb-2 text-[11px] font-medium tracking-wide text-stone-500 uppercase">{label}</p>
      <div className="rounded-xl border border-stone-300 bg-white p-5 shadow-sm">{children}</div>
    </li>
  );
}

/** A row that opens in place. */
export function OpenRow({
  title,
  value,
  open,
  onToggle,
  children,
  tag,
}: {
  title: string;
  value?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  tag?: ReactNode;
}) {
  return (
    <div className="border-b border-stone-200 last:border-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 py-3 text-left"
      >
        <span className="w-40 shrink-0 text-xs text-stone-500">{title}</span>
        <span className="min-w-0 flex-1 truncate text-sm">{value}</span>
        {tag}
        <ChevronDown
          className={`size-4 shrink-0 text-stone-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="pb-5 pl-0 sm:pl-[10.75rem]">{children}</div>}
    </div>
  );
}

// ---------- behaviour ----------

const CODE = "482915";

/**
 * An Email code: valid 10 minutes, works once, dead after 5 wrong tries.
 * A new one can be asked for after 60 seconds and cancels the earlier one.
 */
export function useEmailCode() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState(CODE);
  const [left, setLeft] = useState(0);
  const [wait, setWait] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [used, setUsed] = useState(false);
  const [proven, setProven] = useState(false);
  const [entered, setEntered] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!sentTo) return;
    const t = setInterval(() => {
      setLeft((n) => Math.max(0, n - 1));
      setWait((n) => Math.max(0, n - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [sentTo]);

  const dead = wrong >= 5;
  const expired = !!sentTo && left === 0;
  const send = (to: string) => {
    // A new code cancels the earlier one.
    setCode(String(100000 + Math.floor(Math.random() * 899999)));
    setSentTo(to);
    setLeft(600);
    setWait(60);
    setWrong(0);
    setUsed(false);
    setEntered("");
    setMsg(null);
  };
  const verify = () => {
    if (used) return setMsg("That code has already been used. Ask for a new one.");
    if (dead) return setMsg("Too many wrong tries. This code no longer works. Ask for a new one.");
    if (expired) return setMsg("That code has expired. Ask for a new one.");
    if (entered.trim() !== code) {
      const w = wrong + 1;
      setWrong(w);
      return setMsg(
        w >= 5
          ? "Too many wrong tries. This code no longer works. Ask for a new one."
          : `Not the code. ${5 - w} tries left.`,
      );
    }
    setUsed(true);
    setProven(true);
    setMsg(null);
  };
  return {
    sentTo,
    code,
    left,
    wait,
    wrong,
    dead,
    expired,
    proven,
    entered,
    setEntered: (v: string) => {
      setEntered(v.replace(/\D/g, "").slice(0, 6));
      setMsg(null);
    },
    msg,
    send,
    verify,
    skipWait: () => setWait(0),
    expire: () => setLeft(0),
    reset: () => {
      setSentTo(null);
      setProven(false);
      setEntered("");
      setMsg(null);
      setWrong(0);
      setUsed(false);
    },
  };
}
export type EmailCode = ReturnType<typeof useEmailCode>;

export const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
export const mmss = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;

/** The Email code box, used at sign-up and when changing an Email. */
export function EmailCodeBox({ ec, address }: { ec: EmailCode; address: string }) {
  if (!ec.sentTo) return null;
  if (ec.proven)
    return (
      <Note tone="good">
        <Check className="mr-1 inline size-3" />
        {ec.sentTo} is proven.
      </Note>
    );
  return (
    <div className="space-y-2">
      <p className="text-xs text-stone-600">
        We sent a code to <b>{ec.sentTo}</b>. It is valid for 10 minutes and works once.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          inputMode="numeric"
          value={ec.entered}
          onChange={(e) => ec.setEntered(e.target.value)}
          placeholder="6-digit code"
          className={`${field} w-36 font-mono tracking-widest`}
          disabled={ec.dead || ec.expired}
        />
        <button type="button" className={btn} onClick={ec.verify} disabled={ec.entered.length < 6}>
          Prove it
        </button>
        <span className="text-[11px] text-stone-500">
          {ec.expired ? "Expired" : `Expires in ${mmss(ec.left)}`}
        </span>
      </div>
      {ec.msg && <p className="text-xs text-red-700">{ec.msg}</p>}
      <button
        type="button"
        disabled={ec.wait > 0}
        onClick={() => ec.send(address)}
        className="text-xs underline disabled:text-stone-400 disabled:no-underline"
      >
        {ec.wait > 0 ? `Ask for a new code in ${ec.wait}s` : "Ask for a new code"}
      </button>
      <Demo>
        <span>
          mailbox shows <b className="font-mono text-stone-900">{ec.code}</b>
        </span>
        <button type="button" className="underline" onClick={ec.skipWait}>
          skip the 60 s wait
        </button>
        <button type="button" className="underline" onClick={ec.expire}>
          expire it
        </button>
      </Demo>
    </div>
  );
}

export type IdKind = "sa" | "refugee" | "passport";

/** Identity Number entry: the number, the checksum and age rule, the birth date when the number carries none. */
export function useIdentity() {
  const [kind, setKind] = useState<IdKind>("sa");
  const [number, setNumber] = useState("");
  const [country, setCountry] = useState("");
  const [birth, setBirth] = useState("");
  const sa = F.checkSaId(number);
  const manualAge = birth ? F.ageOn(new Date(birth)) : null;
  const held = number.replace(/\s/g, "") === F.HELD_ID;
  let problem: string | null = null;
  let ok = false;
  if (kind === "sa") {
    if (sa.state === "bad") problem = sa.why;
    ok = sa.state === "ok" && !held;
  } else {
    if (birth && manualAge !== null && manualAge < 18)
      problem = "The named person must be at least 18.";
    ok =
      number.trim().length >= 5 &&
      !!birth &&
      (manualAge ?? 0) >= 18 &&
      (kind === "refugee" || !!country);
  }
  if (held && kind === "sa" && sa.state === "ok")
    problem = "This number cannot be used for a new Account of this kind.";
  return {
    kind,
    setKind: (k: IdKind) => {
      setKind(k);
      setNumber("");
    },
    number,
    setNumber,
    country,
    setCountry,
    birth,
    setBirth,
    sa,
    problem,
    ok,
    fill: () => {
      setKind("sa");
      setNumber(F.EXAMPLE_ID);
    },
  };
}
export type Identity = ReturnType<typeof useIdentity>;

export function IdentityFields({
  id,
  kindOfAccount,
}: {
  id: Identity;
  kindOfAccount: "Client" | "Artisan";
}) {
  return (
    <div className="space-y-4">
      <div>
        <Label>Which number do you have?</Label>
        <div className="space-y-1.5 text-sm">
          {(
            [
              ["sa", "South African ID number"],
              ["refugee", "Recognised refugee identity document number"],
              ["passport", "Passport number, only if you have neither of the above"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="flex items-center gap-2">
              <input type="radio" checked={id.kind === k} onChange={() => id.setKind(k)} /> {label}
            </label>
          ))}
        </div>
        {id.kind === "passport" && (
          <p className="mt-1.5 text-[11px] text-stone-500">
            If you have an ID number, use it: a passport is not a second key. An asylum-seeker
            permit is not an identity document here.
          </p>
        )}
      </div>

      <div>
        <Label hint={id.kind === "sa" ? "13 digits" : undefined}>Identity Number</Label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={id.number}
            onChange={(e) => id.setNumber(e.target.value)}
            inputMode={id.kind === "sa" ? "numeric" : "text"}
            className={`${field} max-w-xs font-mono tracking-wide`}
          />
          {id.kind === "sa" && (
            <button
              type="button"
              className="text-[11px] text-stone-500 underline"
              onClick={id.fill}
            >
              fill a test number
            </button>
          )}
        </div>
        {id.kind === "sa" && (
          <div className="mt-1.5 text-xs">
            {id.sa.state === "partial" && (
              <span className="text-stone-500">{id.sa.have} of 13 digits</span>
            )}
            {id.sa.state === "bad" && <span className="text-red-700">{id.sa.why}</span>}
            {id.sa.state === "ok" && !id.problem && (
              <span className="text-emerald-800">
                Checksum matches. Born{" "}
                {id.sa.birth.toLocaleDateString("en-ZA", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
                , so at least 18.
              </span>
            )}
            {id.problem && id.sa.state === "ok" && (
              <span className="text-red-700">{id.problem}</span>
            )}
          </div>
        )}
      </div>

      {id.kind === "passport" && (
        <div>
          <Label>Issuing country</Label>
          <select
            value={id.country}
            onChange={(e) => id.setCountry(e.target.value)}
            className={`${field} max-w-xs`}
          >
            <option value="">Choose</option>
            {F.COUNTRIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
      )}

      {id.kind !== "sa" && (
        <div>
          <Label hint="this number carries no birth date">Birth date</Label>
          <input
            type="date"
            value={id.birth}
            onChange={(e) => id.setBirth(e.target.value)}
            className={`${field} max-w-xs`}
          />
          {id.problem && <p className="mt-1.5 text-xs text-red-700">{id.problem}</p>}
        </div>
      )}

      <Note>
        {kindOfAccount === "Client"
          ? "On a Client Account the birth date is your statement. "
          : "On an Artisan Account a person will read your identity document later, in Verification, and it must confirm this number, your name, and this birth date. "}
        One number holds one Client Account and one Artisan Account. Closing an Account does not
        free it.
      </Note>
    </div>
  );
}

/** Up to three Regions, never select-all. */
export function useRegions(initial: string[]) {
  const [picked, setPicked] = useState<string[]>(initial);
  const [open, setOpen] = useState<string | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  return {
    picked,
    open,
    refused,
    toggleOpen: (r: string) => setOpen((o) => (o === r ? null : r)),
    toggle: (r: string) => {
      setRefused(null);
      setPicked((p) => {
        if (p.includes(r)) return p.filter((x) => x !== r);
        if (p.length >= F.MAX_REGIONS) {
          setRefused(r);
          return p;
        }
        return [...p, r];
      });
    },
  };
}
