// PROTOTYPE, throwaway. Floating bar for flipping between UI prototype variants.
import { useEffect, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Variant = { key: string; name: string };

export function PrototypeSwitcher({
  variants,
  current,
  onChange,
  children,
}: {
  variants: Variant[];
  current: string;
  onChange: (key: string) => void;
  children?: ReactNode;
}) {
  const index = Math.max(
    0,
    variants.findIndex((v) => v.key === current),
  );
  const step = (by: number) => onChange(variants[(index + by + variants.length) % variants.length].key);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, select, [contenteditable]") || t.isContentEditable)) return;
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!import.meta.env.DEV) return null;

  const v = variants[index];
  return (
    <div className="fixed inset-x-0 bottom-4 z-[100] flex justify-center px-4 pointer-events-none">
      <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-1 rounded-full bg-zinc-950 px-2 py-1.5 font-mono text-xs text-zinc-100 shadow-2xl ring-1 ring-white/20">
        <button
          type="button"
          aria-label="Previous variant"
          onClick={() => step(-1)}
          className="rounded-full p-1.5 hover:bg-white/15"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="min-w-36 text-center">
          {v.key} <span className="text-zinc-400">({v.name})</span>
        </span>
        <button
          type="button"
          aria-label="Next variant"
          onClick={() => step(1)}
          className="rounded-full p-1.5 hover:bg-white/15"
        >
          <ChevronRight className="size-4" />
        </button>
        {children}
      </div>
    </div>
  );
}
