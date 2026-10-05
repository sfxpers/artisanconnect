import type { ReactNode } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { BadgeCheck, Receipt } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Page } from "@/components/page";
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
    <Page>
      <section className="max-w-2xl space-y-4 py-10">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t.title}</h1>
        <p className="text-muted-foreground">{t.lead}</p>
        <div className="flex flex-wrap gap-3">
          <Link to="/sign-up" className={buttonVariants({ size: "lg" })}>
            {t.postJob}
          </Link>
          <Link to="/artisans" className={buttonVariants({ size: "lg", variant: "outline" })}>
            {t.findArtisans}
          </Link>
          <Link to="/sign-in" className={buttonVariants({ size: "lg", variant: "ghost" })}>
            {t.signIn}
          </Link>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">{t.howTitle}</h2>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {t.how.map((step, index) => (
            <li key={step.title}>
              <Card size="sm" className="h-full">
                <CardHeader>
                  <CardTitle>
                    <span className="mr-2 text-muted-foreground">{index + 1}</span>
                    {step.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{step.text}</p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-medium">{t.tradesTitle}</h2>
          <p className="text-sm text-muted-foreground">{t.tradesLead}</p>
        </div>
        <ul className="flex flex-wrap gap-2">
          {SERVICE_CATEGORIES.map((category) => (
            <li key={category}>
              <Link
                to="/artisans"
                search={{ category }}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                {SERVICE_CATEGORY_NAMES[category]}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <PromiseCard icon={<Receipt className="size-5" />} title={t.feesTitle} text={t.fees} />
        <PromiseCard icon={<BadgeCheck className="size-5" />} title={t.badgeTitle} text={t.badge} />
      </section>
    </Page>
  );
}

function PromiseCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{text}</p>
      </CardContent>
    </Card>
  );
}
