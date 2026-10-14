import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ImageOff, MapPin, Search, ShieldCheck, SlidersHorizontal, UserSearch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Choose } from "@/components/choose";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { EmptyState, Page } from "@/components/page";
import { Pager } from "@/components/pager";
import { RatingSummary } from "@/components/rating";
import {
  isServiceCategory,
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_NAMES,
  type ServiceCategory,
} from "@/domain/service-categories";
import { copy } from "@/web/copy";
import { getBrowse, getProfiles, getRegionNames } from "@/web/profiles";

const SORTS = ["recommended", "rating", "reviews"] as const;
type Sort = (typeof SORTS)[number];

type Search = {
  category?: ServiceCategory;
  region?: string;
  sort?: Sort;
  available?: boolean;
  page?: number;
};

/** Artisans on one page of Browse. */
const PER_PAGE = 12;

// Browse (ADR 0016): anyone, signed in or not, lists the Artisans verified
// for one trade, optionally in one Region, in the module's order unless the
// viewer sorts by rating or Reviews; 12 to a page.
export const Route = createFileRoute("/artisans/")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    category: isServiceCategory(search.category) ? search.category : undefined,
    region: typeof search.region === "string" && search.region ? search.region : undefined,
    sort: SORTS.find((each) => each !== "recommended" && each === search.sort),
    available: search.available === true ? true : undefined,
    page: typeof search.page === "number" && search.page > 1 ? Math.floor(search.page) : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [regions, listed] = await Promise.all([
      getRegionNames(),
      deps.category
        ? getBrowse({ data: { category: deps.category, regionId: deps.region } })
        : null,
    ]);
    if (!listed) return { regions, listed: null, count: 0, page: 1, pageCount: 1, cards: [] };
    const shown = sorted(
      deps.available ? listed.filter((each) => each.availableForJobs) : listed,
      deps.sort ?? "recommended",
    );
    const pageCount = Math.max(1, Math.ceil(shown.length / PER_PAGE));
    const page = Math.min(deps.page ?? 1, pageCount);
    const onPage = shown.slice((page - 1) * PER_PAGE, page * PER_PAGE);
    const profiles = await getProfiles({ data: { artisanIds: onPage.map((a) => a.artisanId) } });
    const cards = onPage.map((artisan, index) => ({
      ...artisan,
      profile: profiles[index] ?? null,
    }));
    return { regions, listed, count: shown.length, page, pageCount, cards };
  },
  head: ({ match }) => ({
    meta: [
      {
        title: `${match.search.category ? t.titleFor(SERVICE_CATEGORY_NAMES[match.search.category]) : t.title} · ${copy.appName}`,
      },
    ],
  }),
  component: Browse,
});

const t = copy.browse;

type Listed = NonNullable<Awaited<ReturnType<typeof getBrowse>>>;

/** The module's order, or by rating or Reviews, each falling back to it. */
function sorted(listed: Listed, sort: Sort): Listed {
  if (sort === "recommended") return listed;
  const key = (each: Listed[number]) =>
    sort === "rating" ? (each.reviews.average ?? 0) : each.reviews.count;
  return listed
    .map((each, index) => ({ each, index }))
    .sort((a, b) => key(b.each) - key(a.each) || a.index - b.index)
    .map(({ each }) => each);
}

function Browse() {
  const { regions, listed, count, page, pageCount, cards } = Route.useLoaderData();
  const search = Route.useSearch();
  const { me, admin } = Route.useRouteContext();
  const navigate = useNavigate({ from: Route.fullPath });
  const go = (change: Partial<Search>) =>
    void navigate({ search: (prev) => ({ ...prev, page: undefined, ...change }) });
  const filters = <Filters regions={regions} search={search} go={go} />;
  return (
    <Page
      crumbs={[{ to: "/", label: copy.appName }]}
      title={search.category ? t.titleFor(SERVICE_CATEGORY_NAMES[search.category]) : t.title}
      lead={t.lead}
    >
      {!me && !admin && (
        <p className="text-sm">
          {t.signUpPrompt}{" "}
          <Link to="/sign-up" className="font-medium text-primary underline underline-offset-4">
            {t.signUp}
          </Link>
        </p>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-4">
        <aside className="hidden space-y-4 rounded-lg border bg-card p-4 lg:block">
          <h2 className="text-sm font-semibold">{t.filters}</h2>
          {filters}
        </aside>
        <div className="min-w-0 space-y-4 lg:col-span-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Sheet>
              <SheetTrigger render={<Button variant="outline" className="lg:hidden" />}>
                <SlidersHorizontal data-icon="inline-start" />
                {t.filters}
              </SheetTrigger>
              <SheetContent side="left" className="w-80">
                <SheetHeader>
                  <SheetTitle>{t.filters}</SheetTitle>
                </SheetHeader>
                <div className="px-4">{filters}</div>
              </SheetContent>
            </Sheet>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {listed &&
                (count === 0
                  ? t.count(0)
                  : t.showing((page - 1) * PER_PAGE + 1, Math.min(page * PER_PAGE, count), count))}
            </p>
            <div className="flex items-center gap-2">
              <FieldLabel htmlFor="sort" className="shrink-0">
                {t.sort}
              </FieldLabel>
              <Choose
                id="sort"
                className="w-auto"
                value={search.sort ?? "recommended"}
                onChange={(value) =>
                  go({ sort: value === "recommended" || !value ? undefined : value })
                }
                options={SORTS.map((each) => ({ value: each, label: t.sorts[each] }))}
              />
            </div>
          </div>
          {!search.category || !listed ? (
            <EmptyState icon={<Search />}>{t.chooseTrade}</EmptyState>
          ) : count === 0 ? (
            <EmptyState
              icon={<UserSearch />}
              action={
                (search.region || search.available) && (
                  <Button
                    variant="outline"
                    onClick={() => go({ region: undefined, available: undefined })}
                  >
                    {t.clear}
                  </Button>
                )
              }
            >
              {search.region || search.available ? t.emptyFiltered : t.empty}
            </EmptyState>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {cards.map((card) => (
                <li key={card.artisanId}>
                  <ArtisanCard card={card} />
                </li>
              ))}
            </ul>
          )}
          {!search.sort && listed && count > 0 && (
            <p className="text-xs text-muted-foreground">{t.recommendedLead}</p>
          )}
          <Pager
            page={page}
            pageCount={pageCount}
            label={t.pages}
            go={(next) =>
              void navigate({ search: (prev) => ({ ...prev, page: next > 1 ? next : undefined }) })
            }
          />
        </div>
      </div>
    </Page>
  );
}

/** The trade, the Region, and Available for Jobs; beside the list, or in a sheet on a phone. */
function Filters({
  regions,
  search,
  go,
}: {
  regions: { id: string; name: string }[];
  search: Search;
  go: (change: Partial<Search>) => void;
}) {
  return (
    <FieldGroup className="gap-4">
      <Field>
        <FieldLabel htmlFor="trade">{t.trade}</FieldLabel>
        <Choose
          id="trade"
          value={search.category ?? ""}
          onChange={(value) => go({ category: value || undefined })}
          placeholder={t.anyTrade}
          options={SERVICE_CATEGORIES.map((each) => ({
            value: each,
            label: SERVICE_CATEGORY_NAMES[each],
          }))}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="region">{t.region}</FieldLabel>
        <Choose
          id="region"
          value={search.region ?? ""}
          onChange={(value) => go({ region: value || undefined })}
          options={[
            { value: "", label: t.allRegions },
            ...regions.map((each) => ({ value: each.id, label: each.name })),
          ]}
        />
      </Field>
      <Field orientation="horizontal">
        <Checkbox
          id="available"
          checked={search.available ?? false}
          onCheckedChange={(checked) => go({ available: checked ? true : undefined })}
        />
        <FieldLabel htmlFor="available" className="font-normal">
          {t.availableOnly}
        </FieldLabel>
      </Field>
    </FieldGroup>
  );
}

type BrowseCard = Listed[number] & {
  profile: Awaited<ReturnType<typeof getProfiles>>[number];
};

/** An Artisan as a listing: a work photo, the name, rating, Completed count, badges, and Regions. */
function ArtisanCard({ card }: { card: BrowseCard }) {
  const photo = card.profile?.photos[0];
  const badges = card.profile?.badges ?? [];
  return (
    <Card className="h-full gap-0 py-0">
      <Link
        to="/artisans/$artisanId"
        params={{ artisanId: card.artisanId }}
        className="block rounded-t-lg"
        tabIndex={-1}
        aria-hidden
      >
        {photo ? (
          <img
            src={photo.thumbnailHref}
            alt=""
            loading="lazy"
            width={photo.width}
            height={photo.height}
            className="aspect-4/3 w-full border-b bg-muted object-cover"
          />
        ) : (
          <div className="grid aspect-4/3 w-full place-items-center border-b bg-muted text-muted-foreground">
            <span className="flex items-center gap-2 text-sm">
              <ImageOff className="size-4" aria-hidden />
              {t.noPhoto}
            </span>
          </div>
        )}
      </Link>
      <CardContent className="space-y-2 py-4">
        <div className="flex items-start justify-between gap-2">
          <Link
            to="/artisans/$artisanId"
            params={{ artisanId: card.artisanId }}
            className="min-w-0 truncate font-semibold hover:underline"
          >
            {card.publicName}
          </Link>
          {card.availableForJobs ? (
            <Badge variant="success">{t.available}</Badge>
          ) : (
            <Badge variant="outline">{t.notAvailable}</Badge>
          )}
        </div>
        <RatingSummary average={card.reviews.average} count={card.reviews.count} />
        {card.profile && (
          <p className="text-sm text-muted-foreground">
            {copy.profile.completed(card.profile.completed ?? 0)}
          </p>
        )}
        {badges.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {badges.slice(0, 2).map((badge) => (
              <Badge key={`${badge.kind}:${badge.category ?? ""}`} variant="outline">
                <ShieldCheck />
                {badge.name}
              </Badge>
            ))}
            {badges.length > 2 && (
              <Badge variant="outline">{t.morebadges(badges.length - 2)}</Badge>
            )}
          </div>
        )}
        {card.gasWork && <p className="text-xs text-muted-foreground">{t.gasWork}</p>}
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="size-4 shrink-0" aria-hidden />
          <span className="truncate">
            {card.regions.map((each) => each.name).join(", ") || t.noRegions}
          </span>
        </p>
      </CardContent>
    </Card>
  );
}
