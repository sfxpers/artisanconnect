import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Page, Refusal } from "@/components/page";
import { useAction } from "@/components/use-action";
import { getRulesVersions, publishRules } from "@/web/admin";
import { copy, formatDate } from "@/web/copy";
import { onlyForAdmins } from "@/web/guards";

export const Route = createFileRoute("/admin/rules")({
  beforeLoad: ({ context }) => {
    onlyForAdmins(context);
  },
  loader: () => getRulesVersions(),
  component: Rules,
});

const t = copy.admin.rules;

/**
 * Every Marketplace rules version, newest first, and publishing the next,
 * which every Account accepts at its next sign-in (#142).
 */
function Rules() {
  const { accounts, versions } = Route.useLoaderData();
  const next = (versions[0]?.version ?? 0) + 1;
  return (
    <Page title={t.title}>
      <p className="max-w-2xl text-sm text-muted-foreground">{t.lead}</p>
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">{t.versions}</h2>
            <Link to="/rules" className="text-sm underline-offset-4 hover:underline">
              {t.read}
            </Link>
          </div>
          <Card className="py-0">
            <ul className="divide-y">
              {versions.map((rules, index) => (
                <li key={rules.version} className="space-y-1 p-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{t.version(rules.version, formatDate(rules.publishedAt))}</span>
                    {index === 0 && <Badge variant="secondary">{t.current}</Badge>}
                  </div>
                  <p className="text-sm font-medium">{rules.summary}</p>
                  <p className="text-xs text-muted-foreground">
                    {index === 0
                      ? t.acceptedCurrent(rules.acceptedLastBy, accounts)
                      : t.acceptedOlder(rules.acceptedLastBy)}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        </section>
        <PublishCard next={next} />
      </div>
    </Page>
  );
}

function PublishCard({ next }: { next: number }) {
  const action = useAction();
  const [summary, setSummary] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [published, setPublished] = useState<number | null>(null);

  async function publish() {
    setPublished(null);
    await action.run(async () => {
      const result = await publishRules({ data: { summary } });
      // Another Admin may have published meanwhile: say the version made.
      if (result.ok) {
        setPublished(result.value.version);
        setSummary("");
      }
      return result;
    });
    setConfirming(false);
  }

  return (
    <Card size="sm" className="self-start">
      <CardHeader>
        <CardTitle>{t.publish(next)}</CardTitle>
        <CardDescription>{t.publishLead}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="rules-summary">{t.summary}</Label>
          <Textarea
            id="rules-summary"
            rows={4}
            value={summary}
            disabled={confirming}
            onChange={(event) => setSummary(event.target.value)}
          />
        </div>
        {confirming && <p className="text-sm">{t.confirmLead(next)}</p>}
        <Refusal message={action.refusal} />
        {published && <p className="text-sm text-muted-foreground">{t.published(published)}</p>}
      </CardContent>
      <CardFooter className="gap-2 pt-4">
        {confirming ? (
          <>
            <Button disabled={action.busy} onClick={() => void publish()}>
              {t.confirm}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              {t.cancel}
            </Button>
          </>
        ) : (
          <Button
            disabled={!summary.trim()}
            onClick={() => {
              setPublished(null);
              setConfirming(true);
            }}
          >
            {t.publish(next)}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
