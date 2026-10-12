import { cn } from "@/lib/utils";
import { copy } from "@/web/copy";

/**
 * The ArtisanConnect mark: a roof over two linked rings, one in Clay, on a
 * Fynbos tile, then the name with "Connect" in Fynbos.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true" fill="none">
          <path
            d="M3.5 11 12 4l8.5 7"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="9" cy="15.5" r="3" stroke="currentColor" strokeWidth="2" />
          <circle cx="15" cy="15.5" r="3" className="stroke-accent" strokeWidth="2" />
        </svg>
      </span>
      <span className="text-lg">
        {copy.wordmark[0]}
        <span className="text-primary">{copy.wordmark[1]}</span>
      </span>
    </span>
  );
}
