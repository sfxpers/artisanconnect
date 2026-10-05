import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Link as LinkIcon } from "lucide-react";
import { ArtisanProfileView } from "@/components/artisan-profile";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Page } from "@/components/page";
import { copy } from "@/web/copy";
import { getProfile } from "@/web/profiles";

// An Artisan's public Profile, at a link the Artisan can share and search
// engines can find (ADR 0016). Anyone may open it; it shows no contact.
export const Route = createFileRoute("/artisans/$artisanId")({
  loader: ({ params }) => getProfile({ data: { artisanId: params.artisanId } }),
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.publicName} · ${copy.appName}` },
          {
            name: "description",
            content: t.description(
              loaderData.publicName,
              loaderData.categories.map((each) => each.name),
            ),
          },
        ]
      : [],
  }),
  component: ArtisanProfilePage,
  notFoundComponent: () => (
    <Page title={t.notFound}>
      <p className="text-sm text-muted-foreground">{t.notFoundLead}</p>
      <Link to="/artisans" className={buttonVariants({ variant: "outline", size: "sm" })}>
        {t.back}
      </Link>
    </Page>
  ),
});

const t = copy.profile;

function ArtisanProfilePage() {
  const profile = Route.useLoaderData();
  const { me, admin } = Route.useRouteContext();
  const visitor = !me && !admin;
  return (
    <Page>
      <Link to="/artisans" className={buttonVariants({ variant: "ghost", size: "sm" })}>
        <ArrowLeft />
        {t.back}
      </Link>
      <ArtisanProfileView
        profile={profile}
        aside={
          <>
            {visitor && (
              <Card size="sm" className="ring-2 ring-primary/80">
                <CardHeader>
                  <CardTitle>{t.inviteTitle(profile.publicName)}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">{t.inviteLead}</p>
                  <div className="flex flex-wrap gap-2">
                    <Link to="/sign-up" className={buttonVariants({ size: "sm" })}>
                      {t.signUp}
                    </Link>
                    <Link
                      to="/sign-in"
                      className={buttonVariants({ size: "sm", variant: "outline" })}
                    >
                      {t.signIn}
                    </Link>
                  </div>
                </CardContent>
              </Card>
            )}
            <ShareLink />
          </>
        }
      />
    </Page>
  );
}

/** Copies the Profile's own address, the link an Artisan shares. */
function ShareLink() {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
      }}
    >
      <LinkIcon />
      {copied ? t.copied : t.share}
    </Button>
  );
}
