// PROTOTYPE, throwaway: /prototype/launch on branch prototype/launch only. Never merge to main.
// The picked "Contract" look (like Upwork) across the three surfaces: the Job page in six key states
// as Client or Artisan, the Artisan home, and an Admin item (a Dispute or a Verification).
// The bar cycles ?screen=; fixtures are in memory and nothing is saved.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PrototypeSwitcher } from "@/components/prototype-switcher";
import {
  ADMIN_ITEMS,
  jobView,
  type AdminItemKey,
  type JobState,
  type Viewer,
} from "./-launch/data";
import { JobContract } from "./-launch/job-contract";
import { ArtisanHome } from "./-launch/artisan-home";
import { AdminItem } from "./-launch/admin-item";

const STATES = [
  { key: "quotes", label: "Comparing Quotes" },
  { key: "hire", label: "Hire and pay" },
  { key: "work-started", label: "Work started" },
  { key: "awaiting-approval", label: "Awaiting approval" },
  { key: "disputed", label: "Disputed" },
  { key: "completed", label: "Completed" },
] as const satisfies readonly { key: JobState; label: string }[];

const SCREENS = [
  { key: "job", name: "Job page" },
  { key: "home", name: "Artisan home" },
  { key: "admin", name: "Admin item" },
] as const;

type ShownState = (typeof STATES)[number]["key"];
type Screen = (typeof SCREENS)[number]["key"];

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

export const Route = createFileRoute("/prototype/launch")({
  validateSearch: (s: Record<string, unknown>) => ({
    screen: pick<Screen>(
      s.screen,
      SCREENS.map((x) => x.key),
      "job",
    ),
    state: pick<ShownState>(
      s.state,
      STATES.map((x) => x.key),
      "awaiting-approval",
    ),
    viewer: pick<Viewer>(s.viewer, ["client", "artisan"], "client"),
    item: pick<AdminItemKey>(
      s.item,
      ADMIN_ITEMS.map((x) => x.key),
      "dispute",
    ),
  }),
  component: LaunchPrototype,
});

const select = "rounded-md bg-white/10 px-1.5 py-1 text-white [&>option]:text-black";

function LaunchPrototype() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const set = (patch: Partial<typeof search>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  return (
    <>
      <div key={`${search.screen}-${search.state}-${search.viewer}-${search.item}`}>
        {search.screen === "job" && <JobContract v={jobView(search.state, search.viewer)} />}
        {search.screen === "home" && <ArtisanHome />}
        {search.screen === "admin" && <AdminItem item={search.item} />}
      </div>
      <PrototypeSwitcher
        variants={[...SCREENS]}
        current={search.screen}
        onChange={(key) => set({ screen: key as Screen })}
      >
        {search.screen === "job" && (
          <>
            <select
              className={select}
              value={search.state}
              onChange={(e) => set({ state: e.target.value as ShownState })}
            >
              {STATES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
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
        {search.screen === "admin" && (
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
      </PrototypeSwitcher>
    </>
  );
}
