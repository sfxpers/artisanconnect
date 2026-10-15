import { useState } from "react";
import { Radio } from "@base-ui/react/radio";
import { Star } from "lucide-react";
import { RadioGroup } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppForm } from "@/components/form";
import { Refusal } from "@/components/page";
import { Stars } from "@/components/rating";
import { cn } from "@/lib/utils";
import { ReportAction } from "@/components/report";
import { useAction } from "@/components/use-action";
import type { Domain } from "@/domain";
import { REVIEW_COMMENT_MAX } from "@/domain/reviews/inputs";
import { formatDay, saDay } from "@/domain/shared/sa-days";
import { copy, formatDeadline } from "@/web/copy";
import { writeReview } from "@/web/reviews";

// Reviews (#138): the party's own Review and the other's on the Job page,
// the form to write one while the window is open, and a list of Reviews
// shown, 20 at a time, on a Profile or beside a Job Match.

const t = copy.review;

type ReviewsShown = NonNullable<Awaited<ReturnType<Domain["reviews"]["ofArtisan"]>>>;

type EngagementReviewsView = NonNullable<
  NonNullable<Awaited<ReturnType<Domain["jobs"]["view"]>>>["engagement"]
>["reviews"];

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
          <li key={review.reviewId} className="space-y-2 py-3 first:pt-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Stars rating={review.rating} />
              <span className="text-xs text-muted-foreground">
                {[
                  review.reviewer ?? t.someone,
                  review.category?.name,
                  formatDay(saDay(new Date(review.writtenAt))),
                ]
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
  const { refusal, run } = useAction();
  const form = useAppForm({
    defaultValues: { rating: null as number | null, comment: "" },
    onSubmit: ({ value: { rating, comment } }) =>
      rating === null || run(() => writeReview({ data: { engagementId, rating, comment } })),
  });
  if (!reviews?.open || reviews.mine) return null;
  const of = asClient ? t.theArtisan : t.theClient;
  return (
    <form.AppForm>
      <form.Form className="space-y-4 rounded-lg border p-4">
        <div className="space-y-1">
          <h3 className="font-semibold">{t.write(of)}</h3>
          <p className="text-xs text-muted-foreground">
            {t.writeLead(formatDeadline(reviews.closesAt))}
          </p>
        </div>
        <form.Field name="rating">
          {(field) => (
            <div className="space-y-2">
              <span id="review-rating" className="text-sm font-medium">
                {t.rating}
              </span>
              {/* Base UI's own Radio, as shadcn's item always draws a dot, not a star. */}
              <RadioGroup
                aria-labelledby="review-rating"
                value={field.state.value}
                onValueChange={(n) => field.handleChange(n as number)}
                className="flex w-auto gap-1"
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <Radio.Root
                    key={n}
                    value={n}
                    aria-label={t.outOf(n)}
                    title={t.outOf(n)}
                    className="rounded outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Star
                      aria-hidden
                      className={cn(
                        "size-7",
                        field.state.value !== null && n <= field.state.value
                          ? "fill-rating text-rating"
                          : "text-muted-foreground",
                      )}
                    />
                  </Radio.Root>
                ))}
              </RadioGroup>
            </div>
          )}
        </form.Field>
        <form.AppField name="comment">
          {(field) => (
            <field.TextareaField label={t.comment} rows={3} maxLength={REVIEW_COMMENT_MAX} />
          )}
        </form.AppField>
        <Refusal message={refusal} />
        <form.Subscribe selector={(state) => state.values.rating !== null}>
          {(rated) => <form.Submit disabled={!rated}>{t.send}</form.Submit>}
        </form.Subscribe>
      </form.Form>
    </form.AppForm>
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
          {reviews.open ? t.openUntil(formatDeadline(reviews.closesAt)) : t.closed}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <section className="space-y-2">
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
        <section className="space-y-2">
          <h3 className="text-sm font-medium">{t.theirs(of)}</h3>
          {theirs ? (
            <>
              <Stars rating={theirs.rating} />
              {theirs.comment && <p className="text-sm whitespace-pre-line">{theirs.comment}</p>}
              <p className="text-xs text-muted-foreground">
                {formatDay(saDay(new Date(theirs.writtenAt)))}
              </p>
              <ReportAction about={{ kind: "review", id: theirs.reviewId }} label={t.report} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {reviews.open
                ? t.theirsWaiting(of, formatDeadline(reviews.closesAt))
                : t.theirsNone(of)}
            </p>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
