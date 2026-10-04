import { Link, createFileRoute } from "@tanstack/react-router";
import { buttonVariants } from "@/components/ui/button";
import { Page } from "@/components/page";
import { copy } from "@/web/copy";
import { onlyForVisitors } from "@/web/guards";

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => onlyForVisitors(context),
  component: Landing,
});

const t = copy.landing;

/** The Visitor's landing page. What it shows in full comes with Browse (#120). */
function Landing() {
  return (
    <Page>
      <section className="max-w-2xl space-y-4 py-10">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t.title}</h1>
        <p className="text-muted-foreground">{t.lead}</p>
        <div className="flex flex-wrap gap-3">
          <Link to="/sign-up" className={buttonVariants({ size: "lg" })}>
            {t.signUp}
          </Link>
          <Link to="/sign-in" className={buttonVariants({ size: "lg", variant: "outline" })}>
            {t.signIn}
          </Link>
        </div>
      </section>
    </Page>
  );
}
