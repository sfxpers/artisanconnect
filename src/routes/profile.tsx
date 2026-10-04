import { createFileRoute } from "@tanstack/react-router";
import { Page } from "@/components/page";
import { copy } from "@/web/copy";
import { onlyFor } from "@/web/guards";

export const Route = createFileRoute("/profile")({
  beforeLoad: ({ context }) => {
    onlyFor("artisan", context.me);
  },
  component: () => (
    <Page title={copy.header.artisan.profile}>
      <p className="text-sm text-muted-foreground">{copy.notBuilt}</p>
    </Page>
  ),
});
