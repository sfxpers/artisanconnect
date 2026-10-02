// PROTOTYPE, throwaway. Answers "What should the launch interface look like?"
// (sfxpers/artisanconnect#85). Three structurally different variants of the whole
// launch journey on one route: /prototype/launch?variant=A&screen=quotes
// A: separate pages under a top nav. B: one Job record, with the Conversation docked.
// C: phone-first, one next step at a time.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PrototypeSwitcher } from "@/components/prototype-switcher";
import * as F from "./-launch/fixtures";
import { VariantA } from "./-launch/variant-a";
import { VariantB } from "./-launch/variant-b";
import { VariantC } from "./-launch/variant-c";

const VARIANTS = [
  { key: "A", name: "Pages" },
  { key: "B", name: "Job record" },
  { key: "C", name: "Next step" },
];

type Search = { variant: string; screen: F.ScreenKey };

export const Route = createFileRoute("/prototype/launch")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    variant: VARIANTS.some((v) => v.key === s.variant) ? (s.variant as string) : "A",
    screen: F.SCREEN_KEYS.includes(s.screen as F.ScreenKey) ? (s.screen as F.ScreenKey) : "profile",
  }),
  head: () => ({ meta: [{ title: "PROTOTYPE · ArtisanConnect launch interface" }] }),
  component: LaunchPrototype,
});

const STATE_OF: Record<F.ScreenKey, unknown> = {
  profile: F.artisan,
  post: F.job,
  quotes: { quotes: F.quotes, pendingDates: F.pendingDates },
  conversation: { messages: F.conversation, draft: F.conversationDraft },
  engagement: F.engagement,
  completion: F.completionRequires,
  release: F.release,
  dispute: F.dispute,
  review: F.reviewWindow,
  verification: F.verification,
  home: F.home,
  notices: F.notices,
};

function LaunchPrototype() {
  const { variant, screen } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [showState, setShowState] = useState(false);
  const go = (next: Partial<Search>) =>
    void navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });

  const props = { screen, go: (s: F.ScreenKey) => go({ screen: s }) };

  return (
    <>
      {variant === "A" && <VariantA {...props} />}
      {variant === "B" && <VariantB {...props} />}
      {variant === "C" && <VariantC {...props} />}

      {showState && (
        <pre className="fixed right-4 bottom-20 z-[100] max-h-[60vh] w-[min(28rem,calc(100vw-2rem))] overflow-auto rounded-xl bg-zinc-950 p-3 font-mono text-[11px] leading-snug text-zinc-200 shadow-2xl">
          {JSON.stringify({ variant, screen, viewer: F.screenOf(screen).who, state: STATE_OF[screen] }, null, 2)}
        </pre>
      )}

      <PrototypeSwitcher variants={VARIANTS} current={variant} onChange={(k) => go({ variant: k })}>
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
        <button
          type="button"
          onClick={() => setShowState((v) => !v)}
          className={`rounded-full px-2 py-1 ${showState ? "bg-white text-black" : "hover:bg-white/15"}`}
        >
          state
        </button>
      </PrototypeSwitcher>
    </>
  );
}
