import { useState } from "react";
import { toast } from "sonner";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArtisanProfileView, PhotoGrid } from "@/components/artisan-profile";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppForm } from "@/components/form";
import { Page, Refusal } from "@/components/page";
import { PhotosField, usePhotos } from "@/components/photos-field";
import { useAction } from "@/components/use-action";
import { ABOUT_MAX, PROFILE_PHOTOS_MAX } from "@/domain/profiles/inputs";
import { copy, pageTitle } from "@/web/copy";
import { onlyFor } from "@/web/guards";
import { editProfile, getMyProfile, withdrawProfileEdit } from "@/web/profiles";

export const Route = createFileRoute("/profile")({
  beforeLoad: ({ context }) => ({ me: onlyFor("artisan", context) }),
  loader: () => getMyProfile(),
  head: () => ({ meta: [{ title: pageTitle(t.title) }] }),
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
  if (!mine) return null;
  return (
    <Page title={t.title} lead={t.lead}>
      {mine.profile ? (
        <Link
          to="/artisans/$artisanId"
          params={{ artisanId: me.accountId }}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          {t.open}
        </Link>
      ) : (
        !mine.outOfView && <p className="text-sm">{t.notPublic}</p>
      )}

      {mine.outOfView && <Refusal message={t.outOfView(mine.outOfView.reason)} />}
      {mine.refused && <Refusal message={t.refused(mine.refused.reason)} />}
      {mine.beingChecked ? (
        <BeingChecked edit={mine.beingChecked} onWithdrawn={() => undefined} />
      ) : (
        <Editor mine={mine} onSent={() => toast.success(t.sent)} />
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t.preview}</h2>
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
  const { busy, refusal, run } = useAction();
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Badge variant="warning">{t.beingChecked}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{t.beingCheckedLead}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm whitespace-pre-line">{edit.about || copy.profile.noAbout}</p>
        <PhotoGrid photos={edit.photos} empty={copy.profile.noPhotos} />
        <Refusal message={refusal} />
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void run(withdrawProfileEdit, onWithdrawn)}
        >
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
  const [editing, setEditing] = useState(false);
  const photos = usePhotos(mine.shown.photos);
  const { refusal, run } = useAction();
  const form = useAppForm({
    defaultValues: { about: mine.shown.about },
    onSubmit: async ({ value }) => {
      const sent = new FormData();
      sent.set("about", value.about);
      await photos.appendTo(sent);
      await run(
        () => editProfile({ data: sent }),
        () => {
          setEditing(false);
          onSent();
        },
      );
    },
  });

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
        <form.AppForm>
          <form.Form className="space-y-5">
            <form.AppField name="about">
              {(field) => (
                <field.TextareaField
                  label={t.about}
                  description={t.aboutHint(ABOUT_MAX)}
                  rows={6}
                  maxLength={ABOUT_MAX}
                />
              )}
            </form.AppField>
            <PhotosField
              photos={photos}
              label={t.photos}
              hint={t.photosHint(PROFILE_PHOTOS_MAX)}
              max={PROFILE_PHOTOS_MAX}
            />
            <Refusal message={refusal} />
            <div className="flex gap-2">
              <form.Submit>{t.send}</form.Submit>
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                {t.cancel}
              </Button>
            </div>
          </form.Form>
        </form.AppForm>
      </CardContent>
    </Card>
  );
}
