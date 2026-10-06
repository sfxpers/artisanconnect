import { useState } from "react";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { MapPin, ShieldCheck } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { initials } from "@/components/app-header";
import { NoticeList } from "@/components/notice-list";
import { NextStepCard, Page, Refusal } from "@/components/page";
import { REGIONS_MAX } from "@/domain/regions/places";
import { getNotices } from "@/web/accounts";
import { copy, formatDate } from "@/web/copy";
import { onlyFor } from "@/web/guards";
import { passMatch } from "@/web/matches";
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

type Work = Awaited<ReturnType<typeof getMyWork>>;
type Match = Work["matches"][number];
type Tab = "matches" | "invitations" | "active" | "notices";

/**
 * The Artisan home (#107): a highlighted card for what is waiting, tabs for
 * Job Matches, Invitations, Active Jobs, and Notices, and a sidebar with the
 * Profile and the Available for Jobs switch, and the Regions. Invitations and
 * Active Jobs come with their tickets.
 */
function Home() {
  const { notices, work } = Route.useLoaderData();
  const [tab, setTab] = useState<Tab>("matches");
  return (
    <Page>
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-6">
          <Waiting work={work} onSeeMatches={() => setTab("matches")} />
          <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
            <TabsList variant="line" className="max-w-full justify-start overflow-x-auto">
              <TabsTrigger value="matches">{t.tabs.matches(work.matches.length)}</TabsTrigger>
              <TabsTrigger value="invitations">{t.tabs.invitations}</TabsTrigger>
              <TabsTrigger value="active">{t.tabs.active}</TabsTrigger>
              <TabsTrigger value="notices">{t.tabs.notices}</TabsTrigger>
            </TabsList>
            <TabsContent value="matches" className="pt-4">
              <Matches matches={work.matches} available={work.availableForJobs} />
            </TabsContent>
            <TabsContent value="invitations" className="pt-4">
              <Empty>{t.noInvitations}</Empty>
            </TabsContent>
            <TabsContent value="active" className="pt-4">
              <Empty>{t.noActive}</Empty>
            </TabsContent>
            <TabsContent value="notices" className="pt-4">
              <NoticeList notices={notices} />
            </TabsContent>
          </Tabs>
        </div>
        <aside className="space-y-6">
          <ProfileCard work={work} />
          <RegionsCard regions={work.regions} />
        </aside>
      </div>
    </Page>
  );
}

/** What waits on the Artisan, first things first: Verification, Regions, then Job Matches. */
function Waiting({ work, onSeeMatches }: { work: Work; onSeeMatches: () => void }) {
  if (!work.verified || work.regions.length === 0) {
    return (
      <div className="space-y-4">
        {!work.verified && (
          <NextStepCard label={t.waiting} title={t.verification}>
            <p className="text-sm text-muted-foreground">{t.verificationLead}</p>
            <Link to="/verification" className={buttonVariants({ size: "lg" })}>
              {t.open}
            </Link>
          </NextStepCard>
        )}
        {work.regions.length === 0 && (
          <NextStepCard label={t.waiting} title={t.chooseYourRegions}>
            <p className="text-sm text-muted-foreground">{t.chooseRegionsLead}</p>
            <Link to="/regions" className={buttonVariants({ size: "lg" })}>
              {t.chooseRegions}
            </Link>
          </NextStepCard>
        )}
      </div>
    );
  }
  if (work.matches.length > 0) {
    return (
      <NextStepCard label={t.waiting} title={t.matchesWaiting(work.matches.length)}>
        <p className="text-sm text-muted-foreground">{t.matchesLead}</p>
        <Button size="lg" onClick={onSeeMatches}>
          {t.seeMatches}
        </Button>
      </NextStepCard>
    );
  }
  return (
    <NextStepCard label={t.waiting} title={t.nothingWaiting}>
      <p className="text-sm text-muted-foreground">{t.nothingWaitingLead}</p>
    </NextStepCard>
  );
}

function Matches({ matches, available }: { matches: Match[]; available: boolean }) {
  if (matches.length === 0) {
    return <Empty>{available ? t.noMatches : t.noMatchesUnavailable}</Empty>;
  }
  return (
    <Card className="py-0">
      <ul className="divide-y">
        {matches.map((match) => (
          <MatchRow key={match.jobId} match={match} />
        ))}
      </ul>
    </Card>
  );
}

/** One Job Match: the Region, never the suburb, and what the Client wrote. */
function MatchRow({ match }: { match: Match }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  async function pass() {
    setBusy(true);
    setRefusal(null);
    const result = await passMatch({ data: { jobId: match.jobId } });
    if (!result.ok) setRefusal(result.refusal.message);
    await router.invalidate();
    setBusy(false);
  }

  return (
    <li className="flex gap-4 p-5">
      {match.photo && (
        <img
          src={match.photo.thumbnailHref}
          alt=""
          width={match.photo.width}
          height={match.photo.height}
          loading="lazy"
          className="hidden aspect-[4/3] w-28 shrink-0 rounded-lg border object-cover sm:block"
        />
      )}
      <div className="min-w-0 flex-1 space-y-2">
        <div className="text-xs text-muted-foreground">
          {t.offered(formatDate(match.offeredAt))}
        </div>
        <Link
          to="/jobs/$jobId"
          params={{ jobId: match.jobId }}
          className="block text-base font-medium hover:underline"
        >
          {match.title}
        </Link>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3" />
            {match.region}
          </span>
          <span>{match.category?.name}</span>
          {match.siteType && <span>{copy.job.siteTypes[match.siteType]}</span>}
        </div>
        <p className="line-clamp-2 text-sm">{match.description}</p>
        <Refusal message={refusal} />
        <div className="flex gap-2 pt-1">
          <Link
            to="/jobs/$jobId"
            params={{ jobId: match.jobId }}
            className={buttonVariants({ size: "sm" })}
          >
            {t.openMatch}
          </Link>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void pass()}>
            {t.pass}
          </Button>
        </div>
      </div>
    </li>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardContent>
        <p className="text-sm text-muted-foreground">{children}</p>
      </CardContent>
    </Card>
  );
}

/** The Profile as others see it, with the Available for Jobs switch. */
function ProfileCard({ work }: { work: Work }) {
  const { me } = Route.useRouteContext();
  const name = work.profile?.publicName ?? me?.publicName ?? "";
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{t.profile}</CardTitle>
        <CardAction>
          <Link to="/profile" className={buttonVariants({ size: "xs", variant: "ghost" })}>
            {t.openProfile}
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Avatar size="lg">
            <AvatarFallback>{initials(name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="truncate font-medium">{name}</div>
            {work.profile ? (
              <div className="text-xs text-muted-foreground">
                {copy.match.reviews(work.profile.reviews.average, work.profile.reviews.count)} ·{" "}
                {copy.match.completed(work.profile.completed)}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">{t.profileLead}</div>
            )}
          </div>
        </div>
        {work.profile && work.profile.badges.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {work.profile.badges.map((badge) => (
              <Badge key={`${badge.kind}:${badge.category ?? ""}`} variant="outline">
                <ShieldCheck />
                {badge.name}
              </Badge>
            ))}
          </div>
        )}
        <Separator />
        <Availability available={work.availableForJobs} />
      </CardContent>
    </Card>
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
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="available">{t.available}</Label>
        <Switch
          id="available"
          checked={available}
          disabled={busy}
          onCheckedChange={(next) => void change(next)}
        />
      </div>
      <p className="text-xs text-muted-foreground">{available ? t.availableOn : t.availableOff}</p>
      <Refusal message={refusal} />
    </div>
  );
}

function RegionsCard({ regions }: { regions: Work["regions"] }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{t.regions}</CardTitle>
        {regions.length > 0 && (
          <CardAction>
            <Link to="/regions" className={buttonVariants({ size: "xs", variant: "ghost" })}>
              {t.editRegions}
            </Link>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {regions.length === 0 ? (
          <>
            <p className="text-sm text-muted-foreground">{t.noRegions}</p>
            <Link to="/regions" className={buttonVariants({ size: "sm" })}>
              {t.chooseRegions}
            </Link>
          </>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {regions.map((region) => (
              <Badge key={region.id} variant="secondary">
                {region.name}
              </Badge>
            ))}
            <span className="w-full text-xs text-muted-foreground">
              {t.regionsChosen(regions.length, REGIONS_MAX)}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
