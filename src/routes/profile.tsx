import { useState } from "react";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { ArtisanProfileView, PhotoGrid } from "@/components/artisan-profile";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Page, Refusal } from "@/components/page";
import { ABOUT_MAX, PROFILE_PHOTOS_MAX } from "@/domain/profiles/inputs";
import { cn } from "@/lib/utils";
import { copy } from "@/web/copy";
import { onlyFor } from "@/web/guards";
import { editProfile, getMyProfile, withdrawProfileEdit } from "@/web/profiles";

export const Route = createFileRoute("/profile")({
  beforeLoad: ({ context }) => ({ me: onlyFor("artisan", context) }),
  loader: () => getMyProfile(),
  component: MyProfile,
});

const t = copy.myProfile;

type Mine = NonNullable<Awaited<ReturnType<typeof getMyProfile>>>;

/**
 * The Artisan's Profile, edited in place: every edit waits for the Admin,
 * and the version shown until now stays shown meanwhile.
 */
function MyProfile() {
  const mine = Route.useLoaderData();
  const { me } = Route.useRouteContext();
  const [done, setDone] = useState<string | null>(null);
  if (!mine) return null;
  return (
    <Page title={t.title}>
      <p className="max-w-2xl text-sm text-muted-foreground">{t.lead}</p>
      {mine.profile ? (
        <Link
          to="/artisans/$artisanId"
          params={{ artisanId: me.accountId }}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          {t.open}
        </Link>
      ) : (
        <p className="text-sm">{t.notPublic}</p>
      )}

      {mine.refused && (
        <p role="alert" className="text-sm text-destructive">
          {t.refused(mine.refused.reason)}
        </p>
      )}
      {done && <p className="text-sm text-muted-foreground">{done}</p>}
      {mine.beingChecked ? (
        <BeingChecked edit={mine.beingChecked} onWithdrawn={() => setDone(null)} />
      ) : (
        <Editor mine={mine} onSent={() => setDone(t.sent)} />
      )}

      <section className="space-y-3">
        <h2 className="font-medium">{t.preview}</h2>
        {mine.profile ? (
          <ArtisanProfileView profile={mine.profile} />
        ) : (
          <Card>
            <CardContent className="space-y-4">
              <p className="text-sm whitespace-pre-line">
                {mine.shown.about || copy.profile.noAbout}
              </p>
              <PhotoGrid photos={mine.shown.photos} empty={copy.profile.noPhotos} />
            </CardContent>
          </Card>
        )}
      </section>
    </Page>
  );
}

/** The edit waiting for the Admin, which only the Artisan and the Admin see. */
function BeingChecked({
  edit,
  onWithdrawn,
}: {
  edit: NonNullable<Mine["beingChecked"]>;
  onWithdrawn: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  async function withdraw() {
    setBusy(true);
    setRefusal(null);
    const result = await withdrawProfileEdit();
    setBusy(false);
    if (!result.ok) return setRefusal(result.refusal.message);
    onWithdrawn();
    await router.invalidate();
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{t.beingChecked}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{t.beingCheckedLead}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm whitespace-pre-line">{edit.about || copy.profile.noAbout}</p>
        <PhotoGrid photos={edit.photos} empty={copy.profile.noPhotos} />
        <Refusal message={refusal} />
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void withdraw()}>
          {t.withdraw}
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * The whole new version: the About text, which shown photos to keep, and
 * photos to add. A refusal keeps the draft, so it can be fixed at once.
 */
function Editor({ mine, onSent }: { mine: Mine; onSent: () => void }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [about, setAbout] = useState(mine.shown.about);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const kept = mine.shown.photos.filter((photo) => !removed.has(photo.id));
  const count = kept.length + added.length;

  function toggle(id: string) {
    setRemoved((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  async function send() {
    setBusy(true);
    setRefusal(null);
    const form = new FormData();
    form.set("about", about);
    for (const photo of kept) form.append("keep", photo.id);
    for (const file of added) form.append("add", file);
    const result = await editProfile({ data: form });
    setBusy(false);
    if (!result.ok) return setRefusal(result.refusal.message);
    setEditing(false);
    setRemoved(new Set());
    setAdded([]);
    onSent();
    await router.invalidate();
  }

  if (!editing) {
    return (
      <Button size="sm" onClick={() => setEditing(true)}>
        {t.edit}
      </Button>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.edit}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="about">{t.about}</Label>
            <Textarea
              id="about"
              rows={6}
              maxLength={ABOUT_MAX}
              value={about}
              onChange={(event) => setAbout(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t.aboutHint(ABOUT_MAX)} {about.length}/{ABOUT_MAX}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="add">{t.photos}</Label>
            <p className="text-xs text-muted-foreground">
              {t.photosHint(PROFILE_PHOTOS_MAX)} {count}/{PROFILE_PHOTOS_MAX}
            </p>
            {mine.shown.photos.length > 0 && (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {mine.shown.photos.map((photo, index) => {
                  const gone = removed.has(photo.id);
                  return (
                    <li key={photo.id} className="space-y-1">
                      <img
                        src={photo.thumbnailHref}
                        alt={copy.profile.photo(index + 1)}
                        className={cn(
                          "aspect-[4/3] w-full rounded-lg border object-cover",
                          gone && "opacity-30",
                        )}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => toggle(photo.id)}
                      >
                        {gone ? t.restore : t.remove}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
            <Input
              id="add"
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => setAdded(Array.from(event.target.files ?? []))}
            />
          </div>

          <Refusal message={refusal} />
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {t.send}
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
              {t.cancel}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
