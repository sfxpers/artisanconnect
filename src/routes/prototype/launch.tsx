// PROTOTYPE, throwaway: /prototype/launch on branch prototype/launch only. Never merge to main.
// Two Job page variants (?variant=A|B) built from shadcn components, across six key states
// (?state=) seen as the Client or the Artisan (?viewer=). Fixtures are in memory; nothing is saved.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PrototypeSwitcher } from "@/components/prototype-switcher";
import { jobView, type JobState, type Viewer } from "./-launch/data";
import { JobContract, JobSplit } from "./-launch/job-variants";

const STATES = [
  { key: "quotes", label: "Comparing Quotes" },
  { key: "hire", label: "Hire and pay" },
  { key: "work-started", label: "Work started" },
  { key: "awaiting-approval", label: "Awaiting approval" },
  { key: "disputed", label: "Disputed" },
  { key: "completed", label: "Completed" },
] as const satisfies readonly { key: JobState; label: string }[];

type ShownState = (typeof STATES)[number]["key"];
type VariantKey = "A" | "B";

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

export const Route = createFileRoute("/prototype/launch")({
  validateSearch: (s: Record<string, unknown>) => ({
    variant: pick<VariantKey>(s.variant, ["A", "B"], "A"),
    state: pick<ShownState>(
      s.state,
      STATES.map((x) => x.key),
      "awaiting-approval",
    ),
    viewer: pick<Viewer>(s.viewer, ["client", "artisan"], "client"),
  }),
  component: LaunchPrototype,
});

const select = "rounded-md bg-white/10 px-1.5 py-1 text-white [&>option]:text-black";

function LaunchPrototype() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const set = (patch: Partial<typeof search>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });
  const view = jobView(search.state, search.viewer);

  return (
    <>
      <div key={`${search.variant}-${search.state}-${search.viewer}`}>
        {search.variant === "A" ? <JobContract v={view} /> : <JobSplit v={view} />}
      </div>
      <PrototypeSwitcher
        variants={[
          { key: "A", name: "Contract" },
          { key: "B", name: "Split" },
        ]}
        current={search.variant}
        onChange={(key) => set({ variant: key as VariantKey })}
      >
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
      </PrototypeSwitcher>
    </>
  );
}
