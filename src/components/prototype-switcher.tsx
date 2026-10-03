// PROTOTYPE tooling: a floating bar that cycles ?variant= on a prototype route. Dev builds only.
import { useEffect, type ReactNode } from "react";

export interface PrototypeVariant {
  key: string;
  name: string;
}

function typing(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return (
    !!el &&
    (el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.tagName === "SELECT" ||
      el.isContentEditable)
  );
}

export function PrototypeSwitcher({
  variants,
  current,
  onChange,
  children,
}: {
  variants: PrototypeVariant[];
  current: string;
  onChange: (key: string) => void;
  /** Extra controls, e.g. which screen or state the variants are drawn for. */
  children?: ReactNode;
}) {
  const idx = Math.max(
    0,
    variants.findIndex((v) => v.key === current),
  );
  const step = (d: number) => onChange(variants[(idx + d + variants.length) % variants.length].key);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!import.meta.env.DEV) return null;

  return (
    <div className="fixed bottom-3 left-1/2 z-50 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-2xl bg-zinc-900 px-3 py-2 text-xs text-white shadow-xl ring-2 ring-fuchsia-500">
      <div className="flex items-center gap-1">
        <button
          className="rounded-md px-2 py-1 hover:bg-white/15"
          onClick={() => step(-1)}
          aria-label="Previous variant"
        >
          {"←"}
        </button>
        <span className="min-w-36 text-center font-medium">
          {variants[idx].key} ({variants[idx].name})
        </span>
        <button
          className="rounded-md px-2 py-1 hover:bg-white/15"
          onClick={() => step(1)}
          aria-label="Next variant"
        >
          {"→"}
        </button>
      </div>
      {children}
    </div>
  );
}
