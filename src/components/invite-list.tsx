import { useState } from "react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Refusal } from "@/components/page";
import { copy } from "@/web/copy";
import { getInviteList, inviteArtisan } from "@/web/invitations";

/** Whom the Client may invite, as the Job page loads it. */
export type InviteListView = {
  artisans: NonNullable<Awaited<ReturnType<typeof getInviteList>>>;
  regions: { id: string; name: string }[];
  /** The one Region shown, if one is chosen. */
  region: string | undefined;
};

const t = copy.invite;

/**
 * The invite list (#123): Browse narrowed to the Job's trade, and to
 * gas-registered Artisans on a gas Job, optionally in one Region, each marked
 * once invited or Quoted. Nothing on it says who holds or passed a Job Match.
 * On a Job opened by Hire Again (#139), only the Artisan hired again, by name.
 */
export function InviteList({
  jobId,
  inviteOnly,
  hireAgain,
  list,
}: {
  jobId: string;
  inviteOnly: boolean;
  hireAgain: string | null;
  list: InviteListView;
}) {
  const router = useRouter();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  async function invite(artisanId: string) {
    setBusy(artisanId);
    setRefusal(null);
    const result = await inviteArtisan({ data: { jobId, artisanId } });
    if (!result.ok) setRefusal(result.refusal.message);
    await router.invalidate();
    setBusy(null);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{hireAgain ? t.titleHireAgain : t.title}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {hireAgain ? t.leadHireAgain(hireAgain) : inviteOnly ? t.leadInviteOnly : t.lead}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* One Artisan is listed on a Job opened by Hire Again, wherever they work. */}
        {!hireAgain && (
          <div className="space-y-1.5">
            <Label htmlFor="invite-region">{t.region}</Label>
            <select
              id="invite-region"
              className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
              value={list.region ?? ""}
              onChange={(event) =>
                void navigate({
                  to: "/jobs/$jobId",
                  params: { jobId },
                  search: { region: event.target.value || undefined },
                  replace: true,
                })
              }
            >
              <option value="">{t.allRegions}</option>
              {list.regions.map((each) => (
                <option key={each.id} value={each.id}>
                  {each.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <Refusal message={refusal} />
        {list.artisans.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {hireAgain ? t.emptyHireAgain(hireAgain) : t.empty}
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {list.artisans.map((artisan) => (
              <li
                key={artisan.artisanId}
                className="flex flex-wrap items-center justify-between gap-3 p-3"
              >
                <div className="min-w-0 space-y-1">
                  <Link
                    to="/artisans/$artisanId"
                    params={{ artisanId: artisan.artisanId }}
                    target="_blank"
                    className="font-medium hover:underline"
                  >
                    {artisan.publicName}
                  </Link>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="size-3" />
                    {artisan.regions.map((each) => each.name).join(", ") || copy.browse.noRegions}
                    {!artisan.availableForJobs && ` · ${copy.browse.notAvailable}`}
                  </p>
                </div>
                {artisan.mark ? (
                  <Badge variant="secondary">{t[artisan.mark]}</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => void invite(artisan.artisanId)}
                  >
                    {t.invite}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
