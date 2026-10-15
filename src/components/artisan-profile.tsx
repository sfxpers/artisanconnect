import type { ReactNode } from "react";
import { BadgeCheck, ImageOff, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { Domain } from "@/domain";
import { formatDay } from "@/domain/shared/sa-days";
import { copy } from "@/web/copy";
import { getArtisanReviews } from "@/web/reviews";
import { ReviewList } from "@/components/reviews";
import { EmptyState } from "@/components/page";
import { RatingSummary } from "@/components/rating";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/components/app-header";

type ArtisanProfile = NonNullable<Awaited<ReturnType<Domain["profiles"]["view"]>>>;

type ProfilePhotoView = ArtisanProfile["photos"][number];

const t = copy.profile;

/**
 * An Artisan Profile as anyone sees it, laid out as a product page: who it
 * is, the rating, and what the viewer may do first; then the work photos,
 * About, and Reviews; then the badges and Regions. No contact.
 */
export function ArtisanProfileView({
  profile,
  actions,
  canReport = false,
}: {
  profile: ArtisanProfile;
  /** What the viewer may do, if anything: the first is the one primary action. */
  actions?: ReactNode;
  /** Whether the viewer is signed in, so may Report a Review. */
  canReport?: boolean;
}) {
  const { reviews } = profile;
  return (
    // On a phone: who it is, then the work, then the badges. On a wide screen
    // the work is the main column, and the rest one column beside it.
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-3 lg:items-start">
      <div className="order-2 min-w-0 space-y-8 lg:col-span-2">
        <section aria-label={t.gallery}>
          <PhotoGrid photos={profile.photos} empty={t.noPhotos} />
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">{t.about}</h2>
          <p className="text-sm whitespace-pre-line">{profile.about || t.noAbout}</p>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">{t.reviews}</h2>
            <RatingSummary average={reviews.average} count={reviews.count} />
          </div>
          {reviews.count > 0 && (
            // How many gave each rating, as Etsy and Airbnb show it beside the average.
            <dl className="max-w-sm space-y-1 text-sm">
              {([5, 4, 3, 2, 1] as const).map((rating) => {
                const count = reviews.ratings[rating];
                return (
                  <div key={rating} className="flex items-center gap-3">
                    <dt className="w-14 shrink-0 text-muted-foreground">{t.stars(rating)}</dt>
                    <dd className="flex flex-1 items-center gap-3">
                      <Progress
                        value={(count / reviews.count) * 100}
                        aria-label={t.ratingShare(rating, count, reviews.count)}
                        className="flex-1"
                      />
                      <span className="w-6 text-right tabular-nums">{count}</span>
                    </dd>
                  </div>
                );
              })}
            </dl>
          )}
          <ReviewList
            first={reviews}
            load={(page) => getArtisanReviews({ data: { artisanId: profile.artisanId, page } })}
            canReport={canReport}
            empty={t.noReviews}
          />
        </section>
      </div>

      <div className="contents lg:order-3 lg:flex lg:flex-col lg:gap-4">
        <Card className="order-1">
          <CardHeader className="flex items-center gap-3">
            <Avatar size="lg">
              <AvatarFallback>{initials(profile.publicName)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 space-y-1">
              <h1 className="truncate text-2xl font-semibold">{profile.publicName}</h1>
              {profile.availableForJobs ? (
                <Badge variant="success">{t.available}</Badge>
              ) : (
                <Badge variant="outline">{t.notAvailable}</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <RatingSummary average={reviews.average} count={reviews.count} />
              <p className="text-sm text-muted-foreground">{t.completed(profile.completed ?? 0)}</p>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">{t.verifiedFor}</p>
              {profile.categories.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t.notVerifiedNow}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {profile.categories.map(({ category, name, gasWork }) => (
                    <Badge key={category} variant="secondary">
                      {gasWork ? `${name}, ${t.gasWork}` : name}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            {actions && <div className="flex flex-col gap-2">{actions}</div>}
          </CardContent>
        </Card>
        <div className="order-3 space-y-4">
          <Card size="sm">
            <CardHeader>
              <CardTitle>{t.badges}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="space-y-2 text-sm">
                {profile.badges.map((badge) => (
                  <li key={`${badge.kind}:${badge.category}`} className="flex gap-2">
                    <BadgeCheck className="mt-1 size-4 shrink-0 text-primary" aria-hidden />
                    <span>
                      {badge.name}
                      {badge.expiresOn && (
                        <span className="text-muted-foreground">
                          , {t.expires(formatDay(badge.expiresOn))}
                        </span>
                      )}
                      {badge.issuedOn && (
                        <span className="text-muted-foreground">
                          , {t.issued(formatDay(badge.issuedOn))}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">{t.badgesNote}</p>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>{t.regions}</CardTitle>
            </CardHeader>
            <CardContent>
              {profile.regions.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t.noRegions}</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {profile.regions.map((region) => (
                    <li key={region.id} className="flex items-center gap-2">
                      <MapPin className="size-4 text-muted-foreground" aria-hidden />
                      {region.name}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">{t.noContact}</p>
        </div>
      </div>
    </div>
  );
}

/** Work photos as a grid of thumbnails, each opening its full copy. A carousel would hide all but one. */
export function PhotoGrid({ photos, empty }: { photos: ProfilePhotoView[]; empty: string }) {
  if (photos.length === 0) return <EmptyState icon={<ImageOff />}>{empty}</EmptyState>;
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {photos.map((photo, index) => (
        <li key={photo.id}>
          <a href={photo.href} target="_blank" rel="noreferrer" className="block rounded-lg">
            <img
              src={photo.thumbnailHref}
              alt={t.photo(index + 1)}
              width={photo.width}
              height={photo.height}
              loading="lazy"
              className="aspect-4/3 w-full rounded-lg border object-cover"
            />
          </a>
        </li>
      ))}
    </ul>
  );
}
