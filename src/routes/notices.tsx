import { createFileRoute } from "@tanstack/react-router";
import { NoticeList } from "@/components/notice-list";
import { Page } from "@/components/page";
import { getNotices } from "@/web/accounts";
import { copy } from "@/web/copy";
import { onlyFor } from "@/web/guards";

export const Route = createFileRoute("/notices")({
  beforeLoad: ({ context }) => {
    onlyFor("account", context.me);
  },
  loader: () => getNotices(),
  component: Notices,
});

function Notices() {
  return (
    <Page title={copy.notices.title}>
      <NoticeList notices={Route.useLoaderData()} />
    </Page>
  );
}
