import { useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { BadgeCheck, HandCoins, Receipt, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Choose } from "@/components/choose";
import { SuburbPicker, type Suburb } from "@/components/job-form";
import { HowAJobGoes } from "@/components/how-a-job-goes";
import { TradeTiles } from "@/components/trade-tiles";
import {
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_NAMES,
  type ServiceCategory,
} from "@/domain/shared/service-categories";
import { copy, pageTitle } from "@/web/copy";
import { onlyForVisitors } from "@/web/guards";

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => onlyForVisitors(context),
  head: ({ match }) => ({
    meta: [
      { title: pageTitle(t.title) },
      { name: "description", content: t.lead },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: copy.appName },
      { property: "og:title", content: t.title },
      { property: "og:description", content: t.lead },
      { property: "og:url", content: `${match.context.origin}/` },
      { property: "og:image", content: `${match.context.origin}/trades/carpentry.jpg` },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: `${match.context.origin}/` }],
  }),
  component: Landing,
});

const t = copy.landing;

const TRUST_ICONS = [BadgeCheck, Receipt, HandCoins];

/** One popular job from most trades, as Checkatrade lists them under its search. */
const POPULAR = [0, 4, 7, 9, 11, 15, 17].map((index) => copy.popularJobs[index]!);

/**
 * The Visitor's landing page: search by trade and suburb first, then the
 * eight trades, how a Job goes, and what a Visitor can count on: a badge is
 * a check, fees show before paying, and money is released after the work.
 */
function Landing() {
  return (
    <main>
      <section className="border-b bg-card">
        <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-8 sm:px-6 lg:grid-cols-2 lg:py-12">
          <div className="space-y-6">
            <div className="space-y-3">
              <h1 className="text-2xl font-semibold">{t.title}</h1>
              <p className="max-w-xl text-muted-foreground">{t.lead}</p>
            </div>
            <TradeSearch />
            <ul aria-label={t.checksLabel} className="grid gap-2 text-sm">
              {t.checks.map((check) => (
                <li key={check} className="flex items-center gap-2">
                  <BadgeCheck className="size-4 shrink-0 text-primary" aria-hidden />
                  {check}
                </li>
              ))}
            </ul>
            <nav aria-labelledby="popular" className="space-y-2">
              <h2 id="popular" className="text-sm font-medium">
                {t.popular}
              </h2>
              <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                {POPULAR.map((job) => (
                  <li key={job.label}>
                    <Link
                      to="/artisans"
                      search={{ category: job.category }}
                      className="text-sm text-primary hover:underline"
                    >
                      {job.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <Link
              to="/sign-up"
              className="inline-block text-sm font-medium text-primary hover:underline"
            >
              {t.postJob}
            </Link>
          </div>
          <img
            src="/trades/carpentry.jpg"
            srcSet="/trades/carpentry-480.jpg 480w, /trades/carpentry.jpg 960w"
            sizes="(min-width: 1024px) 50vw, 100vw"
            // The largest thing on the page, so it is fetched first.
            fetchPriority="high"
            alt={t.tradePhoto(SERVICE_CATEGORY_NAMES.carpentry)}
            width={960}
            height={640}
            className="aspect-4/3 w-full rounded-lg border object-cover"
          />
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-12 px-4 py-10 sm:px-6 lg:py-14">
        <section aria-labelledby="trades" className="space-y-4">
          <h2 id="trades" className="text-lg font-semibold">
            {t.tradesTitle}
          </h2>
          <TradeTiles />
        </section>

        <HowAJobGoes />

        <section aria-labelledby="trust" className="space-y-4">
          <h2 id="trust" className="text-lg font-semibold">
            {t.trustTitle}
          </h2>
          <ul className="divide-y rounded-lg border bg-card lg:grid lg:grid-cols-3 lg:divide-x lg:divide-y-0">
            {t.trust.map((fact, index) => {
              const Icon = TRUST_ICONS[index]!;
              return (
                <li key={fact.title} className="space-y-2 p-5">
                  <h3 className="flex items-center gap-2 font-semibold">
                    <Icon className="size-4 text-primary" aria-hidden />
                    {fact.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">{fact.text}</p>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </main>
  );
}

/** The trade and the suburb, which opens Browse on the suburb's Region. */
function TradeSearch() {
  const navigate = useNavigate();
  const [category, setCategory] = useState<ServiceCategory | null>(null);
  const [suburb, setSuburb] = useState<Suburb | null>(null);
  const [missing, setMissing] = useState(false);
  return (
    <form
      aria-label={t.searchLabel}
      className="grid gap-3 rounded-lg border bg-background p-4 sm:grid-cols-2 sm:items-start"
      onSubmit={(event) => {
        event.preventDefault();
        if (!category) return setMissing(true);
        void navigate({ to: "/artisans", search: { category, region: suburb?.region.id } });
      }}
    >
      <Field data-invalid={missing}>
        <FieldLabel htmlFor="trade">{t.trade}</FieldLabel>
        <Choose
          id="trade"
          value={category ?? ""}
          onChange={(value) => {
            setCategory(value || null);
            setMissing(false);
          }}
          placeholder={t.chooseTrade}
          options={SERVICE_CATEGORIES.map((each) => ({
            value: each,
            label: SERVICE_CATEGORY_NAMES[each],
          }))}
        />
        {missing && <FieldError>{t.searchHint}</FieldError>}
      </Field>
      <SuburbPicker value={suburb} onChange={setSuburb} label={t.suburb} hint={null} />
      <Button type="submit" size="lg" className="sm:col-span-2">
        <Search data-icon="inline-start" />
        {t.search}
      </Button>
    </form>
  );
}
