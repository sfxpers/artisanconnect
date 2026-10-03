// PROTOTYPE, throwaway. In-memory state for /prototype/admin. Wiped on reload.
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import * as F from "./fixtures";

export type Recorded = { decision: F.Decision; reason?: string; by: string; at: string; note?: string };

export type Search = { variant: string; screen: string; as: F.AdminId };

type Store = {
  me: F.Admin;
  staff: F.Staff[];
  items: F.Item[];
  recorded: Record<string, Recorded>;
  audit: F.AuditRow[];
  opened: Record<string, F.ReadKind[]>;
  suburbs: { name: string; district: string; at: string }[];
  /** items this Admin can see, oldest first within a grant */
  visible: F.Item[];
  open: F.Item[];
  decide: (item: F.Item, d: F.Decision, reason?: string, extra?: string) => void;
  read: (item: F.Item, kind: F.ReadKind) => void;
  raiseFlag: (item: F.Item, grant: F.Grant) => void;
  addSuburb: (name: string, district: string) => string | null;
  giveGrant: (id: F.AdminId, g: F.Grant) => string | null;
  takeGrant: (id: F.AdminId, g: F.Grant) => string | null;
  invite: (email: string, grants: F.Grant[]) => string | null;
};

const Ctx = createContext<Store | null>(null);
export const useAdmin = () => useContext(Ctx)!;

const CLOCK = ["09:02", "09:04", "09:06", "09:09", "09:12", "09:15", "09:18", "09:21", "09:24", "09:27", "09:30"];

export function AdminProvider({ as, children }: { as: F.AdminId; children: ReactNode }) {
  const [staff, setStaff] = useState<F.Staff[]>(F.ADMINS);
  const [items, setItems] = useState<F.Item[]>(F.ITEMS);
  const [recorded, setRecorded] = useState<Record<string, Recorded>>({});
  const [audit, setAudit] = useState<F.AuditRow[]>(F.AUDIT_SEED);
  const [opened, setOpened] = useState<Record<string, F.ReadKind[]>>({});
  const [suburbs, setSuburbs] = useState<{ name: string; district: string; at: string }[]>([]);
  const [tick, setTick] = useState(0);

  const me = staff.find((s) => s.id === as) ?? staff[0];
  const stamp = () => `19 Oct, ${CLOCK[Math.min(tick, CLOCK.length - 1)]}`;

  const push = (row: Omit<F.AuditRow, "at" | "who">) => {
    setAudit((a) => [{ ...row, at: stamp(), who: me.name }, ...a]);
    setTick((t) => t + 1);
  };

  const visible = items.filter((i) => me.grants.includes(i.grant));
  const open = visible.filter((i) => !recorded[i.id]);

  const store: Store = {
    me,
    staff,
    items,
    recorded,
    audit,
    opened,
    suburbs,
    visible,
    open,
    decide: (item, d, reason, extra) => {
      if (recorded[item.id]) return; // the first recorded decision stands
      setRecorded((r) => ({ ...r, [item.id]: { decision: d, reason, by: me.name, at: stamp(), note: extra } }));
      push({ grant: item.grant, kind: "decision", what: `${d.label}${reason ? ` · ${reason}` : ""}${extra ? ` · ${extra}` : ""}`, object: item.title });
    },
    read: (item, kind) => {
      if (opened[item.id]?.includes(kind)) return;
      setOpened((o) => ({ ...o, [item.id]: [...(o[item.id] ?? []), kind] }));
      if (F.READ_LABEL[kind].audited) push({ grant: item.grant, kind: "read", what: `Read ${F.READ_LABEL[kind].label.toLowerCase()}`, object: item.title });
    },
    raiseFlag: (item, grant) => {
      const id = `raised-${item.id}-${grant}`;
      if (items.some((i) => i.id === id)) return;
      const flag: F.Item = {
        id,
        grant,
        kind: "Flag",
        object: item.object,
        title: `Flag raised by ${me.name} · from "${item.title}"`,
        subject: item.subject,
        at: stamp(),
        facts: [
          ["Raised by", `${me.name}, from an item they already had open`],
          ["Object", item.object],
          ["Decides", F.grantLabel(grant)],
          ["Carries", "Only the object and the grant that decides. No note."],
        ],
        record: [{ at: stamp(), text: `Flag raised by ${me.name}` }],
        reads: [],
        decisions: [
          { key: "present", label: "The named fact is present", tone: "danger", effect: "The Job or Artisan Profile comes out of view until that fact is gone. Admin does not edit it.", tell: "The owner is told, with the reason category." },
          { key: "absent", label: "Not present", tone: "neutral", effect: "The item closes. Nothing else happens.", tell: null },
        ],
      };
      setItems((x) => [...x, flag]);
      push({ grant: item.grant, kind: "power", what: `Raised a flag to ${F.grantLabel(grant)}`, object: item.title });
    },
    addSuburb: (name, district) => {
      const n = name.trim();
      if (!n) return "Enter the suburb's name as the City names it.";
      const taken =
        suburbs.some((s) => s.name.toLowerCase() === n.toLowerCase()) ||
        Object.values(F.SOME_SUBURBS).some((l) => l.some((s) => s.toLowerCase() === n.toLowerCase()));
      if (taken) return `${n} is already one of the 778. A suburb cannot be moved, renamed, or added twice.`;
      setSuburbs((s) => [...s, { name: n, district, at: stamp() }]);
      push({ grant: "operations", kind: "power", what: "Added a suburb to a district", object: `${n} · ${district}` });
      return null;
    },
    giveGrant: (id, g) => {
      if (!me.grants.includes("operations")) return "Only marketplace operations gives a grant. (PROPOSAL)";
      if (id === me.id) return "An Admin does not change their own grants.";
      setStaff((s) => s.map((a) => (a.id === id && !a.grants.includes(g) ? { ...a, grants: [...a.grants, g] } : a)));
      push({ grant: "operations", kind: "power", what: `Gave ${F.grantLabel(g)}`, object: staff.find((a) => a.id === id)!.name });
      return null;
    },
    takeGrant: (id, g) => {
      if (!me.grants.includes("operations")) return "Only marketplace operations takes a grant. (PROPOSAL)";
      if (id === me.id) return "An Admin does not change their own grants.";
      if (staff.filter((a) => a.grants.includes(g)).length <= 1) return `${F.grantLabel(g)} would have no holder. Give it to someone first.`;
      setStaff((s) => s.map((a) => (a.id === id ? { ...a, grants: a.grants.filter((x) => x !== g) } : a)));
      push({ grant: "operations", kind: "power", what: `Took ${F.grantLabel(g)}`, object: staff.find((a) => a.id === id)!.name });
      return null;
    },
    invite: (email, grants) => {
      if (!me.grants.includes("operations")) return "Only marketplace operations invites staff. (PROPOSAL)";
      if (!/^\S+@\S+\.\S+$/.test(email)) return "Enter an email address.";
      if (grants.length === 0) return "Choose at least one grant.";
      if (staff.some((s) => s.email === email)) return "That address is already staff.";
      setStaff((s) => [
        ...s,
        { id: `inv${s.length}` as F.AdminId, name: email.split("@")[0], email, grants, since: "invited 19 Oct 2026", givenBy: me.name, invited: true },
      ]);
      push({ grant: "operations", kind: "power", what: `Invited staff with ${grants.map(F.grantLabel).join(", ")}`, object: email });
      return null;
    },
  };

  return <Ctx.Provider value={useMemo(() => store, [staff, items, recorded, audit, opened, suburbs, me, tick])}>{children}</Ctx.Provider>;
}

/** What each grant has waiting, for this Admin. */
export function countsFor(open: F.Item[]) {
  return Object.fromEntries(F.GRANTS.map((g) => [g.key, open.filter((i) => i.grant === g.key).length])) as Record<F.Grant, number>;
}
