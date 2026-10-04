import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NextStepCard, Page } from "@/components/page";
import { copy } from "@/web/copy";
import { onlyFor } from "@/web/guards";

export const Route = createFileRoute("/verification")({
  beforeLoad: ({ context }) => {
    onlyFor("artisan", context);
  },
  component: Verification,
});

const t = copy.verification;

/** Where an Artisan lands. Submitting each check comes with Verification (#118). */
function Verification() {
  return (
    <Page title={t.title}>
      <NextStepCard label={t.nextStep} title={copy.home.verification}>
        <p className="text-sm text-muted-foreground">{t.lead}</p>
        <p className="text-xs text-muted-foreground">{t.soon}</p>
      </NextStepCard>
      <div className="grid gap-4 md:grid-cols-3">
        {t.groups.map((group) => (
          <Card key={group.title}>
            <CardHeader>
              <CardTitle>{group.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </Page>
  );
}
