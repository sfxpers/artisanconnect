// PROTOTYPE, throwaway. Answers "What do the surfaces the prototype skipped look like?"
// (sfxpers/artisanconnect#93), in the Job-record shell the launch interface chose (#85, variant B).
// One route: /prototype/surfaces?variant=B&screen=signup
//   B: the Job-record shell. A page you act on is a record ending in a Now block, edited in place,
//      with settings as rows that open. Everything off a Job is a stream.
//   A: a contrast on the three form-heavy screens only (sign-up, Profile editing, settings): ordinary
//      form pages. Every other screen is one design and looks the same in both.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PrototypeSwitcher } from "@/components/prototype-switcher";
import * as F from "./-surfaces/fixtures";
import { Browse, Invite, Jobs, Landing, Payouts, Regions, Shell } from "./-surfaces/screens";
import { ProfileEdit, Settings, Signup } from "./-surfaces/forms";
import type { Variant } from "./-surfaces/parts";

const VARIANTS = [
  { key: "A", name: "Form pages" },
  { key: "B", name: "Record and stream" },
];

type Search = { variant: Variant; screen: F.ScreenKey };

export const Route = createFileRoute("/prototype/surfaces")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    variant: s.variant === "A" ? "A" : "B",
    screen: F.SCREEN_KEYS.includes(s.screen as F.ScreenKey) ? (s.screen as F.ScreenKey) : "landing",
  }),
  head: () => ({ meta: [{ title: "PROTOTYPE · ArtisanConnect account surfaces" }] }),
  component: SurfacesPrototype,
});

const TWO_DESIGNS: F.ScreenKey[] = [
  "signup",
  "profile-edit",
  "settings-client",
  "settings-artisan",
];

function SurfacesPrototype() {
  const { variant, screen } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const go = (next: Partial<Search>) =>
    void navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });
  const props = { variant, go: (s: F.ScreenKey) => go({ screen: s }) };
  const same = !TWO_DESIGNS.includes(screen);

  return (
    <>
      <Shell screen={screen} go={props.go}>
        {screen === "landing" && <Landing {...props} />}
        {screen === "signup" && <Signup {...props} />}
        {screen === "jobs" && <Jobs {...props} />}
        {screen === "browse" && <Browse {...props} />}
        {screen === "invite" && <Invite {...props} />}
        {screen === "profile-edit" && <ProfileEdit {...props} />}
        {screen === "regions" && <Regions {...props} />}
        {screen === "settings-client" && <Settings variant={variant} kind="Client" />}
        {screen === "settings-artisan" && <Settings variant={variant} kind="Artisan" />}
        {screen === "payouts" && <Payouts {...props} />}
      </Shell>

      <PrototypeSwitcher
        variants={VARIANTS}
        current={variant}
        onChange={(k) => go({ variant: k as Variant })}
      >
        <span className="mx-1 h-4 w-px bg-white/20" />
        <select
          aria-label="Screen"
          value={screen}
          onChange={(e) => go({ screen: e.target.value as F.ScreenKey })}
          className="rounded-full bg-white/10 px-2 py-1 text-zinc-100 outline-none"
        >
          {F.SCREENS.map((s) => (
            <option key={s.key} value={s.key} className="text-black">
              {s.label} · {s.who}
            </option>
          ))}
        </select>
        {same && <span className="px-1 text-[10px] text-zinc-400">same in A and B</span>}
      </PrototypeSwitcher>
    </>
  );
}
