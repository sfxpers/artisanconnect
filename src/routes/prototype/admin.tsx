// PROTOTYPE, throwaway. Answers "What does the Admin work in, and how is a grant given?"
// (sfxpers/artisanconnect#92). Three structurally different variants on one route:
// /prototype/admin?variant=B&screen=f1&as=nomsa
// A: a desk (rail, list, detail). B: the Job record shell, an item is one page with reads docked.
// C: one card at a time. Use "Acting as" to see how the grants gate the queues.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PrototypeSwitcher } from "@/components/prototype-switcher";
import * as F from "./-admin/fixtures";
import { AdminProvider } from "./-admin/store";
import { VariantA } from "./-admin/variant-a";
import { VariantB } from "./-admin/variant-b";
import { VariantC } from "./-admin/variant-c";

const VARIANTS = [
  { key: "A", name: "Desk" },
  { key: "B", name: "Item record" },
  { key: "C", name: "Next item" },
];

type Search = { variant: string; screen: string; as: F.AdminId };

const SCREEN_KEYS: string[] = [...F.PAGE_SCREENS.map((p) => p.key), ...F.ITEM_IDS];

export const Route = createFileRoute("/prototype/admin")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    variant: VARIANTS.some((v) => v.key === s.variant) ? (s.variant as string) : "A",
    screen: SCREEN_KEYS.includes(s.screen as string) || String(s.screen).startsWith("raised-") ? (s.screen as string) : "queues",
    as: F.ADMINS.some((a) => a.id === s.as) ? (s.as as F.AdminId) : "nomsa",
  }),
  head: () => ({ meta: [{ title: "PROTOTYPE · ArtisanConnect Admin" }] }),
  component: AdminPrototype,
});

function AdminPrototype() {
  const { variant, screen, as } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const go = (next: Partial<Search>) => void navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });
  const props = { screen, go: (s: string) => go({ screen: s }) };

  return (
    <AdminProvider as={as}>
      {variant === "A" && <VariantA {...props} />}
      {variant === "B" && <VariantB {...props} />}
      {variant === "C" && <VariantC {...props} />}

      <PrototypeSwitcher variants={VARIANTS} current={variant} onChange={(k) => go({ variant: k })}>
        <span className="mx-1 h-4 w-px bg-white/20" />
        <select
          aria-label="Acting as"
          value={as}
          onChange={(e) => go({ as: e.target.value as F.AdminId })}
          className="rounded-full bg-white/10 px-2 py-1 text-zinc-100 outline-none"
        >
          {F.ADMINS.map((a) => (
            <option key={a.id} value={a.id} className="text-black">
              as {a.name.split(" ")[0]} · {a.grants.map((g) => F.GRANTS.find((x) => x.key === g)!.short.split(" ")[0]).join(", ")}
            </option>
          ))}
        </select>
        <select
          aria-label="Screen"
          value={SCREEN_KEYS.includes(screen) ? screen : ""}
          onChange={(e) => go({ screen: e.target.value })}
          className="rounded-full bg-white/10 px-2 py-1 text-zinc-100 outline-none"
        >
          <optgroup label="Pages">
            {F.PAGE_SCREENS.map((p) => (
              <option key={p.key} value={p.key} className="text-black">
                {p.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Queue items">
            {F.ITEMS.map((i) => (
              <option key={i.id} value={i.id} className="text-black">
                {F.GRANTS.find((g) => g.key === i.grant)!.short.split(" ")[0]} · {i.kind}: {i.object}
              </option>
            ))}
          </optgroup>
        </select>
      </PrototypeSwitcher>
    </AdminProvider>
  );
}
