import { createFileRoute } from "@tanstack/react-router";
import { NoticeList } from "@/components/notice-list";
import { Page } from "@/components/page";
import { getNotices } from "@/web/accounts";
import { copy, pageTitle } from "@/web/copy";
import { onlyFor } from "@/web/guards";

export const Route = createFileRoute("/notices")({
  beforeLoad: ({ context }) => {
    onlyFor("account", context);
  },
  loader: () => getNotices(),
  head: () => ({ meta: [{ title: pageTitle(copy.notices.title) }] }),
  component: Notices,
});

function Notices() {
  return (
    <Page title={copy.notices.title}>
      <NoticeList notices={Route.useLoaderData()} />
    </Page>
  );
}
