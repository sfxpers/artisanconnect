// PROTOTYPE, throwaway: /prototype/launch on branch prototype/launch only. Never merge to main.
// Three structurally different variants of each surface (the Job page, the Artisan home, an Admin item),
// switchable with ?variant=A|B|C, and stepped through every state with ?surface=, ?state=, ?viewer=, ?item=.
// Fixtures are in memory; nothing is saved. Copy, colour, and type are placeholders.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PrototypeSwitcher } from "@/components/prototype-switcher";
import {
  ADMIN_ITEMS,
  JOB_STATES,
  jobView,
  type AdminItemKey,
  type JobState,
  type Viewer,
} from "./-launch/data";
import { JobA, JobB, JobC } from "./-launch/job-variants";
import { HomeA, HomeB, HomeC } from "./-launch/home-variants";
import { AdminA, AdminB, AdminC } from "./-launch/admin-variants";

type Surface = "job" | "home" | "admin";
type VariantKey = "A" | "B" | "C";

interface Search {
  surface: Surface;
  variant: VariantKey;
  state: JobState;
  viewer: Viewer;
  item: AdminItemKey;
}

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

export const Route = createFileRoute("/prototype/launch")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    surface: pick(s.surface, ["job", "home", "admin"], "job"),
    variant: pick(s.variant, ["A", "B", "C"], "A"),
    state: pick(
      s.state,
      JOB_STATES.map((x) => x.key),
      "quotes",
    ),
    viewer: pick(s.viewer, ["client", "artisan"], "client"),
    item: pick(
      s.item,
      ADMIN_ITEMS.map((x) => x.key),
      "dispute",
    ),
  }),
  component: LaunchPrototype,
});

const NAMES: Record<Surface, Record<VariantKey, string>> = {
  job: {
    A: "Record + Now, docked Conversation",
    B: "Stage stepper with tabs",
    C: "Conversation-first with ledger",
  },
  home: { A: "One stream", B: "Board by stage", C: "Inbox with preview" },
  admin: { A: "Item page ending in Now", B: "Three-pane console", C: "Side-by-side comparison" },
};

const select = "rounded-md bg-white/10 px-1.5 py-1 text-white [&>option]:text-black";

function LaunchPrototype() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const set = (patch: Partial<Search>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });
  const [showState, setShowState] = useState(false);

  const view = jobView(search.state, search.viewer);
  const stateIdx = JOB_STATES.findIndex((s) => s.key === search.state);

  // [ and ] step through the Job states.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      if (search.surface !== "job") return;
      if (e.key === "]") set({ state: JOB_STATES[(stateIdx + 1) % JOB_STATES.length].key });
      if (e.key === "[")
        set({ state: JOB_STATES[(stateIdx - 1 + JOB_STATES.length) % JOB_STATES.length].key });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const v = search.variant;
  let page;
  if (search.surface === "job")
    page = v === "A" ? <JobA v={view} /> : v === "B" ? <JobB v={view} /> : <JobC v={view} />;
  else if (search.surface === "home")
    page = v === "A" ? <HomeA /> : v === "B" ? <HomeB /> : <HomeC />;
  else
    page =
      v === "A" ? (
        <AdminA item={search.item} />
      ) : v === "B" ? (
        <AdminB item={search.item} />
      ) : (
        <AdminC item={search.item} />
      );

  const stateDump =
    search.surface === "job"
      ? {
          ...search,
          now: view.now,
          money: view.money,
          clock: view.clock,
          record: view.record.length,
          messages: view.messages.length,
        }
      : search;

  return (
    <div className="min-h-svh bg-background text-foreground">
      {/* key: reset local UI state (open tabs, overlays) when the screen changes */}
      <div key={`${search.surface}-${v}-${search.state}-${search.viewer}-${search.item}`}>
        {page}
      </div>

      {showState && (
        <pre className="fixed right-3 bottom-20 z-50 max-h-[50svh] w-96 max-w-[calc(100vw-1.5rem)] overflow-auto rounded-lg bg-zinc-900 p-3 text-[10px] text-white shadow-xl">
          {JSON.stringify(stateDump, null, 2)}
        </pre>
      )}

      <PrototypeSwitcher
        variants={(["A", "B", "C"] as const).map((key) => ({
          key,
          name: NAMES[search.surface][key],
        }))}
        current={v}
        onChange={(key) => set({ variant: key as VariantKey })}
      >
        <select
          className={select}
          value={search.surface}
          onChange={(e) => set({ surface: e.target.value as Surface })}
        >
          <option value="job">Job page</option>
          <option value="home">Artisan home</option>
          <option value="admin">Admin item</option>
        </select>
        {search.surface === "job" && (
          <>
            <select
              className={select}
              value={search.state}
              onChange={(e) => set({ state: e.target.value as JobState })}
            >
              {JOB_STATES.map((s, i) => (
                <option key={s.key} value={s.key}>
                  {i + 1}. {s.label}
                </option>
              ))}
            </select>
            <select
              className={select}
              value={search.viewer}
              onChange={(e) => set({ viewer: e.target.value as Viewer })}
            >
              <option value="client">as Client</option>
              <option value="artisan">as Artisan</option>
            </select>
          </>
        )}
        {search.surface === "admin" && (
          <select
            className={select}
            value={search.item}
            onChange={(e) => set({ item: e.target.value as AdminItemKey })}
          >
            {ADMIN_ITEMS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        )}
        <button
          className="rounded-md px-2 py-1 hover:bg-white/15"
          onClick={() => setShowState((s) => !s)}
        >
          {showState ? "hide" : "state"}
        </button>
      </PrototypeSwitcher>
    </div>
  );
}
