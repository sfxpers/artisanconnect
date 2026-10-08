import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { MapPin, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Page } from "@/components/page";
import {
  isServiceCategory,
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_NAMES,
  type ServiceCategory,
} from "@/domain/service-categories";
import { cn } from "@/lib/utils";
import { copy } from "@/web/copy";
import { getBrowse, getRegionNames } from "@/web/profiles";

type Search = { category?: ServiceCategory; region?: string };

// Browse (ADR 0016): anyone, signed in or not, lists the Artisans verified
// for one trade, optionally in one Region.
export const Route = createFileRoute("/artisans/")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    category: isServiceCategory(search.category) ? search.category : undefined,
    region: typeof search.region === "string" && search.region ? search.region : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [regions, artisans] = await Promise.all([
      getRegionNames(),
      deps.category
        ? getBrowse({ data: { category: deps.category, regionId: deps.region } })
        : null,
    ]);
    return { regions, artisans };
  },
  head: () => ({ meta: [{ title: `${t.title} · ${copy.appName}` }] }),
  component: Browse,
});

const t = copy.browse;

function Browse() {
  const { regions, artisans } = Route.useLoaderData();
  const { category, region } = Route.useSearch();
  const { me, admin } = Route.useRouteContext();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <Page title={t.title}>
      <p className="max-w-2xl text-sm text-muted-foreground">{t.lead}</p>
      {!me && !admin && (
        <p className="text-sm">
          {t.signUpPrompt}{" "}
          <Link to="/sign-up" className="underline">
            {t.signUp}
          </Link>
        </p>
      )}

      <nav aria-label={t.trade} className="flex flex-wrap gap-2">
        {SERVICE_CATEGORIES.map((each) => (
          <Link
            key={each}
            to="/artisans"
            search={{ category: each, region }}
            className={cn(
              buttonVariants({ size: "sm", variant: each === category ? "default" : "outline" }),
            )}
            aria-current={each === category ? "page" : undefined}
          >
            {SERVICE_CATEGORY_NAMES[each]}
          </Link>
        ))}
      </nav>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="region">{t.region}</Label>
          <select
            id="region"
            className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
            value={region ?? ""}
            onChange={(event) =>
              void navigate({
                search: { category, region: event.target.value || undefined },
              })
            }
          >
            <option value="">{t.allRegions}</option>
            {regions.map((each) => (
              <option key={each.id} value={each.id}>
                {each.name}
              </option>
            ))}
          </select>
        </div>
        {artisans && <p className="text-sm text-muted-foreground">{t.count(artisans.length)}</p>}
      </div>

      {!category || !artisans ? (
        <p className="text-sm text-muted-foreground">{t.chooseTrade}</p>
      ) : artisans.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.empty}</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {artisans.map((artisan) => (
            <li key={artisan.artisanId}>
              <Card size="sm">
                <CardContent className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      to="/artisans/$artisanId"
                      params={{ artisanId: artisan.artisanId }}
                      className="font-medium hover:underline"
                    >
                      {artisan.publicName}
                    </Link>
                    <Badge variant={artisan.availableForJobs ? "default" : "outline"}>
                      {artisan.availableForJobs ? t.available : t.notAvailable}
                    </Badge>
                  </div>
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Star className="size-4" />
                    {artisan.reviews.average === null
                      ? copy.profile.noRating
                      : copy.profile.rating(artisan.reviews.average, artisan.reviews.count)}
                  </p>
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <MapPin className="size-4" />
                    {artisan.regions.map((each) => each.name).join(", ") || t.noRegions}
                  </p>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">
                      {artisan.gasWork && t.gasWork}
                    </span>
                    <Link
                      to="/artisans/$artisanId"
                      params={{ artisanId: artisan.artisanId }}
                      className={buttonVariants({ size: "sm", variant: "outline" })}
                    >
                      {t.open}
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
