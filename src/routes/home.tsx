import { useState } from "react";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { NoticeList } from "@/components/notice-list";
import { NextStepCard, Page, Refusal } from "@/components/page";
import { REGIONS_MAX } from "@/domain/regions/places";
import { getNotices } from "@/web/accounts";
import { copy } from "@/web/copy";
import { onlyFor } from "@/web/guards";
import { getMyWork, setAvailableForJobs } from "@/web/regions";

export const Route = createFileRoute("/home")({
  beforeLoad: ({ context }) => {
    onlyFor("artisan", context);
  },
  loader: async () => {
    const [notices, work] = await Promise.all([getNotices(), getMyWork()]);
    return { notices, work };
  },
  component: Home,
});

const t = copy.home;

/** The Artisan home. Job Matches, Invitations, and Active Jobs come with their tickets. */
function Home() {
  const { notices, work } = Route.useLoaderData();
  return (
    <Page>
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-6">
          <NextStepCard label={t.waiting} title={t.verification}>
            <Link to="/verification" className={buttonVariants({ size: "lg" })}>
              {t.open}
            </Link>
          </NextStepCard>
          <section className="space-y-3">
            <h2 className="font-medium">{copy.notices.title}</h2>
            <NoticeList notices={notices} />
          </section>
        </div>
        <aside className="space-y-6">
          <Card size="sm">
            <CardHeader>
              <CardTitle>{t.profile}</CardTitle>
              <CardAction>
                <Link to="/profile" className={buttonVariants({ size: "xs", variant: "ghost" })}>
                  {t.openProfile}
                </Link>
              </CardAction>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{t.profileLead}</p>
            </CardContent>
          </Card>
          <Availability available={work.availableForJobs} />
          <Card size="sm">
            <CardHeader>
              <CardTitle>{t.regions}</CardTitle>
              {work.regions.length > 0 && (
                <CardAction>
                  <Link to="/regions" className={buttonVariants({ size: "xs", variant: "ghost" })}>
                    {t.editRegions}
                  </Link>
                </CardAction>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {work.regions.length === 0 ? (
                <>
                  <p className="text-sm text-muted-foreground">{t.noRegions}</p>
                  <Link to="/regions" className={buttonVariants({ size: "sm" })}>
                    {t.chooseRegions}
                  </Link>
                </>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {work.regions.map((region) => (
                    <Badge key={region.id} variant="secondary">
                      {region.name}
                    </Badge>
                  ))}
                  <span className="w-full text-xs text-muted-foreground">
                    {t.regionsChosen(work.regions.length, REGIONS_MAX)}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </Page>
  );
}

/** The Available for Jobs switch. Off stops Job Matches and hides nothing. */
function Availability({ available }: { available: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  async function change(next: boolean) {
    setBusy(true);
    setRefusal(null);
    const result = await setAvailableForJobs({ data: { available: next } });
    if (!result.ok) setRefusal(result.refusal.message);
    await router.invalidate();
    setBusy(false);
  }

  return (
    <Card size="sm">
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="available">{t.available}</Label>
          <Switch
            id="available"
            checked={available}
            disabled={busy}
            onCheckedChange={(next) => void change(next)}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {available ? t.availableOn : t.availableOff}
        </p>
        <Refusal message={refusal} />
      </CardContent>
    </Card>
  );
}
