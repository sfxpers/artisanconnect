import type { ReactNode } from "react";
import { BadgeCheck, MapPin, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Domain } from "@/domain";
import { formatDay } from "@/domain/sa-days";
import { copy } from "@/web/copy";
import { getArtisanReviews } from "@/web/reviews";
import { ReviewList } from "@/components/reviews";

export type ArtisanProfile = NonNullable<Awaited<ReturnType<Domain["profiles"]["view"]>>>;

export type ProfilePhotoView = ArtisanProfile["photos"][number];

const t = copy.profile;

/**
 * An Artisan Profile as anyone sees it: the categories verified, badges, work
 * photos, Regions, Completed count, rating, and Reviews, and no contact. The
 * aside holds what the viewer may do, if anything.
 */
export function ArtisanProfileView({
  profile,
  aside,
  canReport = false,
}: {
  profile: ArtisanProfile;
  aside?: ReactNode;
  /** Whether the viewer is signed in, so may Report a Review. */
  canReport?: boolean;
}) {
  const { reviews } = profile;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="min-w-0 space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">{profile.publicName}</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Star className="size-4" />
              {reviews.average === null ? t.noRating : t.rating(reviews.average, reviews.count)}
            </span>
            <span>{t.completed(profile.completed)}</span>
            <Badge variant={profile.availableForJobs ? "default" : "outline"}>
              {profile.availableForJobs ? t.available : t.notAvailable}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {profile.categories.length === 0 && (
              <span className="text-sm text-muted-foreground">{t.notVerifiedNow}</span>
            )}
            {profile.categories.map(({ category, name, gasWork }) => (
              <Badge key={category} variant="secondary">
                {gasWork ? `${name}, ${t.gasWork}` : name}
              </Badge>
            ))}
          </div>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>{t.about}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-line">{profile.about || t.noAbout}</p>
          </CardContent>
        </Card>

        <section className="space-y-3">
          <h2 className="font-medium">{t.photos}</h2>
          <PhotoGrid photos={profile.photos} empty={t.noPhotos} />
        </section>

        <section className="space-y-3">
          <h2 className="font-medium">{t.reviews}</h2>
          <ReviewList
            first={reviews}
            load={(page) => getArtisanReviews({ data: { artisanId: profile.artisanId, page } })}
            canReport={canReport}
            empty={t.noReviews}
          />
        </section>
      </div>

      <aside className="space-y-6">
        {aside}
        <Card size="sm">
          <CardHeader>
            <CardTitle>{t.badges}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-1.5 text-sm">
              {profile.badges.map((badge) => (
                <li key={`${badge.kind}:${badge.category}`} className="flex gap-2">
                  <BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary" />
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
                    <MapPin className="size-4 text-muted-foreground" />
                    {region.name}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">{t.noContact}</p>
      </aside>
    </div>
  );
}

/** Work photos as thumbnails, each opening its full copy. */
export function PhotoGrid({ photos, empty }: { photos: ProfilePhotoView[]; empty: string }) {
  if (photos.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {photos.map((photo, index) => (
        <li key={photo.id}>
          <a href={photo.href} target="_blank" rel="noreferrer">
            <img
              src={photo.thumbnailHref}
              alt={t.photo(index + 1)}
              width={photo.width}
              height={photo.height}
              loading="lazy"
              className="aspect-[4/3] w-full rounded-lg border object-cover"
            />
          </a>
        </li>
      ))}
    </ul>
  );
}
