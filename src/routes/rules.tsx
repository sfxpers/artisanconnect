import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Page } from "@/components/page";
import { getCurrentRules } from "@/web/accounts";
import { copy, formatDate } from "@/web/copy";

export const Route = createFileRoute("/rules")({
  loader: () => getCurrentRules(),
  component: Rules,
});

const t = copy.rules;

function Rules() {
  const rules = Route.useLoaderData();
  return (
    <Page title={t.title} narrow>
      <Card>
        <CardHeader>
          <CardDescription>
            {t.version(rules.version, formatDate(rules.publishedAt))}
          </CardDescription>
          <CardTitle>{rules.summary}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>{t.placeholder}</p>
          <p>{copy.consent}</p>
        </CardContent>
      </Card>
    </Page>
  );
}
