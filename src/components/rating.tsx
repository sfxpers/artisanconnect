import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { copy } from "@/web/copy";

/** A rating as five stars, in amber, the one place amber is used; read out as "4 out of 5". */
export function Stars({ rating, className }: { rating: number; className?: string }) {
  const whole = Math.round(rating);
  return (
    <span role="img" aria-label={copy.review.outOf(whole)} className="inline-flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden
          className={cn(
            "size-4",
            n <= whole ? "fill-rating text-rating" : "text-muted-foreground",
            className,
          )}
        />
      ))}
    </span>
  );
}

/** A Review average and count, or that there are none yet. */
export function RatingSummary({ average, count }: { average: number | null; count: number }) {
  if (average === null) {
    return <span className="text-sm text-muted-foreground">{copy.profile.noRating}</span>;
  }
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <Stars rating={average} />
      <span className="font-medium tabular-nums">{average.toFixed(1)}</span>
      <span className="text-muted-foreground">{copy.profile.reviewCount(count)}</span>
    </span>
  );
}
