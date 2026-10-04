import { Link, createFileRoute } from "@tanstack/react-router";
import { buttonVariants } from "@/components/ui/button";
import { NoticeList } from "@/components/notice-list";
import { NextStepCard, Page } from "@/components/page";
import { getNotices } from "@/web/accounts";
import { copy } from "@/web/copy";
import { onlyFor } from "@/web/guards";

export const Route = createFileRoute("/home")({
  beforeLoad: ({ context }) => {
    onlyFor("artisan", context);
  },
  loader: () => getNotices(),
  component: Home,
});

/** The Artisan home. Job Matches, Invitations, and Active Jobs come with their tickets. */
function Home() {
  return (
    <Page>
      <NextStepCard label={copy.home.waiting} title={copy.home.verification}>
        <Link to="/verification" className={buttonVariants({ size: "lg" })}>
          {copy.home.open}
        </Link>
      </NextStepCard>
      <section className="space-y-3">
        <h2 className="font-medium">{copy.notices.title}</h2>
        <NoticeList notices={Route.useLoaderData()} />
      </section>
    </Page>
  );
}
