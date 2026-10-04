import { createFileRoute } from "@tanstack/react-router";
import { Page } from "@/components/page";
import { copy } from "@/web/copy";
import { onlyFor } from "@/web/guards";

export const Route = createFileRoute("/payouts")({
  beforeLoad: ({ context }) => {
    onlyFor("artisan", context);
  },
  component: () => (
    <Page title={copy.header.artisan.payouts}>
      <p className="text-sm text-muted-foreground">{copy.notBuilt}</p>
    </Page>
  ),
});
