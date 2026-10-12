import type { ReactNode } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, BadgeCheck, MapPin, Receipt } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { TRADE_ICONS } from "@/components/trade-icon";
import { SERVICE_CATEGORIES, SERVICE_CATEGORY_NAMES } from "@/domain/service-categories";
import { copy } from "@/web/copy";
import { onlyForVisitors } from "@/web/guards";

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => onlyForVisitors(context),
  component: Landing,
});

const t = copy.landing;

/**
 * The Visitor's landing page: how a Job goes, the eight trades, that fees
 * are shown before paying, and that a badge is a check, not a guarantee.
 * Posting a Job asks the Visitor to sign up.
 */
function Landing() {
  return (
    <main>
      <section className="border-b bg-linear-to-b from-secondary/70 to-background">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-20 lg:grid-cols-2">
          <div className="space-y-6">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-sm font-medium text-accent-foreground">
              <MapPin className="size-4" aria-hidden="true" />
              {t.eyebrow}
            </p>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{t.title}</h1>
            <p className="max-w-xl text-lg text-muted-foreground">{t.lead}</p>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link to="/sign-up" className={buttonVariants({ size: "lg" })}>
                {t.postJob}
                <ArrowRight data-icon="inline-end" />
              </Link>
              <Link to="/artisans" className={buttonVariants({ size: "lg", variant: "outline" })}>
                {t.findArtisans}
              </Link>
              <Link to="/sign-in" className={buttonVariants({ size: "lg", variant: "ghost" })}>
                {t.signIn}
              </Link>
            </div>
          </div>

          <section
            aria-labelledby="how"
            className="rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border sm:p-8"
          >
            <h2 id="how" className="text-lg font-semibold tracking-tight">
              {t.howTitle}
            </h2>
            <ol className="mt-6 space-y-6">
              {t.how.map((step, index) => (
                <li key={step.title} className="flex gap-4">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary font-semibold text-primary-foreground tabular-nums">
                    {index + 1}
                  </span>
                  <div className="space-y-1">
                    <h3 className="font-semibold">{step.title}</h3>
                    <p className="text-sm text-muted-foreground">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-16 px-4 py-12 sm:px-6 sm:py-16">
        <section aria-labelledby="trades" className="space-y-6">
          <div className="space-y-2">
            <h2 id="trades" className="text-2xl font-semibold tracking-tight">
              {t.tradesTitle}
            </h2>
            <p className="text-muted-foreground">{t.tradesLead}</p>
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {SERVICE_CATEGORIES.map((category) => {
              const Icon = TRADE_ICONS[category];
              return (
                <li key={category}>
                  <Link
                    to="/artisans"
                    search={{ category }}
                    className="group flex h-full flex-col gap-3 rounded-xl bg-card p-4 shadow-xs ring-1 ring-border transition hover:-translate-y-0.5 hover:shadow-md hover:ring-primary"
                  >
                    <span className="grid size-10 place-items-center rounded-lg bg-secondary text-secondary-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <span className="text-sm font-medium">{SERVICE_CATEGORY_NAMES[category]}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <PromiseCard icon={<Receipt className="size-5" />} title={t.feesTitle} text={t.fees} />
          <PromiseCard
            icon={<BadgeCheck className="size-5" />}
            title={t.badgeTitle}
            text={t.badge}
          />
        </section>
      </div>
    </main>
  );
}

function PromiseCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="flex gap-4 rounded-2xl bg-card p-6 ring-1 ring-border">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
        {icon}
      </span>
      <div className="space-y-1.5">
        <h2 className="font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}
