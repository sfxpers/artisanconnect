import { useState } from "react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { MapPin, UserSearch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Choose } from "@/components/choose";
import { Pager } from "@/components/pager";
import { EmptyState, Refusal } from "@/components/page";
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

/** Artisans on one page of the invite list. */
const PER_PAGE = 10;

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
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(list.artisans.length / PER_PAGE));
  const shownPage = Math.min(page, pageCount);
  const onPage = list.artisans.slice((shownPage - 1) * PER_PAGE, shownPage * PER_PAGE);

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
          <Field className="max-w-xs">
            <FieldLabel htmlFor="invite-region">{t.region}</FieldLabel>
            <Choose
              id="invite-region"
              value={list.region ?? ""}
              onChange={(value) =>
                void navigate({
                  to: "/jobs/$jobId",
                  params: { jobId },
                  search: { region: value || undefined },
                  replace: true,
                })
              }
              options={[
                { value: "", label: t.allRegions },
                ...list.regions.map((each) => ({ value: each.id, label: each.name })),
              ]}
            />
          </Field>
        )}
        <Refusal message={refusal} />
        {list.artisans.length === 0 ? (
          <EmptyState icon={<UserSearch />}>
            {hireAgain ? t.emptyHireAgain(hireAgain) : t.empty}
          </EmptyState>
        ) : (
          <ul className="divide-y rounded-lg border">
            {onPage.map((artisan) => (
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
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <MapPin className="size-3" aria-hidden />
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
        <Pager page={shownPage} pageCount={pageCount} label={copy.browse.pages} go={setPage} />
      </CardContent>
    </Card>
  );
}
