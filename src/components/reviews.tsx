import { useState } from "react";
import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Refusal } from "@/components/page";
import { ReportAction } from "@/components/report";
import { useAction } from "@/components/use-action";
import type { Domain } from "@/domain";
import { REVIEW_COMMENT_MAX } from "@/domain/reviews/inputs";
import { copy, formatDate } from "@/web/copy";
import { writeReview } from "@/web/reviews";

// Reviews (#138): the party's own Review and the other's on the Job page,
// the form to write one while the window is open, and a list of Reviews
// shown, 20 at a time, on a Profile or beside a Job Match.

const t = copy.review;

export type ReviewsShown = NonNullable<Awaited<ReturnType<Domain["reviews"]["ofArtisan"]>>>;

type EngagementReviewsView = NonNullable<
  NonNullable<Awaited<ReturnType<Domain["jobs"]["view"]>>>["engagement"]
>["reviews"];

/** A rating as five stars, read out as "4 out of 5". */
export function Stars({ rating }: { rating: number }) {
  return (
    <span role="img" aria-label={t.outOf(rating)} className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden
          className={`size-4 ${n <= rating ? "fill-current text-amber-500" : "text-muted-foreground/40"}`}
        />
      ))}
    </span>
  );
}

/**
 * Reviews shown, newest first, each with its rating, the reviewer's shown
 * name, the Service Category, and its comment; more 20 at a time.
 */
export function ReviewList({
  first,
  load,
  canReport,
  empty,
}: {
  first: ReviewsShown;
  load: (page: number) => Promise<ReviewsShown | null>;
  canReport: boolean;
  empty: string;
}) {
  const [pages, setPages] = useState<ReviewsShown[]>([first]);
  const [busy, setBusy] = useState(false);
  const items = pages.flatMap((page) => page.items);
  const more = pages.at(-1)?.more ?? false;
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="space-y-3">
      <ul className="divide-y">
        {items.map((review) => (
          <li key={review.reviewId} className="space-y-1.5 py-3 first:pt-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Stars rating={review.rating} />
              <span className="text-xs text-muted-foreground">
                {[review.reviewer ?? t.someone, review.category?.name, formatDate(review.writtenAt)]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
            {review.comment && <p className="text-sm whitespace-pre-line">{review.comment}</p>}
            {canReport && (
              <ReportAction about={{ kind: "review", id: review.reviewId }} label={t.report} />
            )}
          </li>
        ))}
      </ul>
      {more && (
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const next = await load(pages.length);
            setBusy(false);
            if (next) setPages((shown) => [...shown, next]);
          }}
        >
          {t.more}
        </Button>
      )}
    </div>
  );
}

/** The form for the party's one Review, while the window is open and they have not written. */
export function WriteReview({
  engagementId,
  reviews,
  asClient,
}: {
  engagementId: string;
  reviews: EngagementReviewsView;
  asClient: boolean;
}) {
  const action = useAction();
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  if (!reviews?.open || reviews.mine) return null;
  const of = asClient ? t.theArtisan : t.theClient;
  return (
    <form
      className="space-y-3 rounded-lg border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (rating === null) return;
        void action.run(() => writeReview({ data: { engagementId, rating, comment } }));
      }}
    >
      <div className="space-y-1">
        <h3 className="font-medium">{t.write(of)}</h3>
        <p className="text-xs text-muted-foreground">{t.writeLead(formatDate(reviews.closesAt))}</p>
      </div>
      <div className="space-y-1.5">
        <span id="review-rating" className="text-sm font-medium">
          {t.rating}
        </span>
        <div role="radiogroup" aria-labelledby="review-rating" className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={t.outOf(n)}
              title={t.outOf(n)}
              onClick={() => setRating(n)}
              className="rounded outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Star
                aria-hidden
                className={`size-7 ${rating !== null && n <= rating ? "fill-current text-amber-500" : "text-muted-foreground/50"}`}
              />
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="review-comment">{t.comment}</Label>
        <Textarea
          id="review-comment"
          value={comment}
          rows={3}
          maxLength={REVIEW_COMMENT_MAX}
          onChange={(event) => setComment(event.target.value)}
        />
      </div>
      <Refusal message={action.refusal} />
      <Button type="submit" disabled={action.busy || rating === null}>
        {t.send}
      </Button>
    </form>
  );
}

/**
 * The Engagement's Reviews as the party sees them: their own, with where it
 * stands, and the other's once it is shown; null before it is Completed.
 */
export function EngagementReviewsCard({
  reviews,
  asClient,
}: {
  reviews: EngagementReviewsView;
  asClient: boolean;
}) {
  if (!reviews) return null;
  const { mine, theirs } = reviews;
  const of = asClient ? t.theArtisan : t.theClient;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.title}</CardTitle>
        <CardDescription>
          {reviews.open ? t.openUntil(formatDate(reviews.closesAt)) : t.closed}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <section className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium">{t.yours}</h3>
            {mine && <Badge variant="secondary">{t.states[mine.state]}</Badge>}
          </div>
          {mine ? (
            <>
              <Stars rating={mine.rating} />
              {mine.comment && <p className="text-sm whitespace-pre-line">{mine.comment}</p>}
              {mine.state === "being-checked" && (
                <p className="text-xs text-muted-foreground">{t.beingChecked}</p>
              )}
              {mine.reason && <Refusal message={t.endedLead(mine.state, mine.reason)} />}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {reviews.open ? t.notYet : t.notWritten}
            </p>
          )}
        </section>
        <section className="space-y-1.5">
          <h3 className="text-sm font-medium">{t.theirs(of)}</h3>
          {theirs ? (
            <>
              <Stars rating={theirs.rating} />
              {theirs.comment && <p className="text-sm whitespace-pre-line">{theirs.comment}</p>}
              <p className="text-xs text-muted-foreground">{formatDate(theirs.writtenAt)}</p>
              <ReportAction about={{ kind: "review", id: theirs.reviewId }} label={t.report} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {reviews.open ? t.theirsWaiting(of, formatDate(reviews.closesAt)) : t.theirsNone(of)}
            </p>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
