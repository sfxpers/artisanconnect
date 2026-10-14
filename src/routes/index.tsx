import { useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { BadgeCheck, HandCoins, Receipt, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Choose } from "@/components/choose";
import { SuburbPicker, type Suburb } from "@/components/job-form";
import {
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_NAMES,
  type ServiceCategory,
} from "@/domain/service-categories";
import { copy } from "@/web/copy";
import { onlyForVisitors } from "@/web/guards";

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => onlyForVisitors(context),
  component: Landing,
});

const t = copy.landing;

const TRUST_ICONS = [BadgeCheck, Receipt, HandCoins];

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
              <h1 className="text-3xl font-semibold sm:text-4xl">{t.title}</h1>
              <p className="max-w-xl text-muted-foreground">{t.lead}</p>
            </div>
            <TradeSearch />
            <Link
              to="/sign-up"
              className="inline-block text-sm font-medium text-primary hover:underline"
            >
              {t.postJob}
            </Link>
          </div>
          <img
            src="/trades/carpentry.jpg"
            alt={t.tradePhoto(SERVICE_CATEGORY_NAMES.carpentry)}
            width={960}
            height={640}
            className="hidden aspect-4/3 w-full rounded-lg border object-cover lg:block"
          />
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-12 px-4 py-10 sm:px-6 lg:py-14">
        <section aria-labelledby="trades" className="space-y-4">
          <h2 id="trades" className="text-xl font-semibold">
            {t.tradesTitle}
          </h2>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {SERVICE_CATEGORIES.map((category) => (
              <li key={category}>
                <Link
                  to="/artisans"
                  search={{ category }}
                  className="group block space-y-2 rounded-lg"
                >
                  <img
                    src={`/trades/${category}.jpg`}
                    alt={t.tradePhoto(SERVICE_CATEGORY_NAMES[category])}
                    loading="lazy"
                    width={960}
                    height={640}
                    className="aspect-4/3 w-full rounded-lg border bg-muted object-cover"
                  />
                  <span className="block text-sm font-medium group-hover:underline">
                    {SERVICE_CATEGORY_NAMES[category]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="how" className="space-y-4">
          <h2 id="how" className="text-xl font-semibold">
            {t.howTitle}
          </h2>
          <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {t.how.map((step, index) => (
              <li key={step.title} className="space-y-1.5 border-t pt-4">
                <p className="text-sm font-medium text-primary">{t.step(index + 1)}</p>
                <h3 className="font-semibold">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="trust" className="space-y-4">
          <h2 id="trust" className="text-xl font-semibold">
            {t.trustTitle}
          </h2>
          <ul className="divide-y rounded-lg border bg-card lg:grid lg:grid-cols-3 lg:divide-x lg:divide-y-0">
            {t.trust.map((fact, index) => {
              const Icon = TRUST_ICONS[index]!;
              return (
                <li key={fact.title} className="space-y-1.5 p-5">
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
  return (
    <form
      aria-label={t.searchLabel}
      className="grid gap-3 rounded-lg border bg-background p-4 sm:grid-cols-2 sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        if (!category) return;
        void navigate({ to: "/artisans", search: { category, region: suburb?.region.id } });
      }}
    >
      <Field>
        <FieldLabel htmlFor="trade">{t.trade}</FieldLabel>
        <Choose
          id="trade"
          value={category ?? ""}
          onChange={(value) => setCategory(value || null)}
          placeholder={t.chooseTrade}
          options={SERVICE_CATEGORIES.map((each) => ({
            value: each,
            label: SERVICE_CATEGORY_NAMES[each],
          }))}
        />
      </Field>
      <SuburbPicker value={suburb} onChange={setSuburb} label={t.suburb} hint={null} />
      <Button type="submit" size="lg" className="sm:col-span-2" disabled={!category}>
        <Search data-icon="inline-start" />
        {t.search}
      </Button>
    </form>
  );
}
