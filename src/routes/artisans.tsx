import { createFileRoute } from "@tanstack/react-router";
import { Page } from "@/components/page";
import { copy } from "@/web/copy";

export const Route = createFileRoute("/artisans")({
  component: () => (
    <Page title={copy.header.visitor.findArtisans}>
      <p className="text-sm text-muted-foreground">{copy.notBuilt}</p>
    </Page>
  ),
});
