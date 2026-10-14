import { useState } from "react";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { ArtisanProfileView } from "@/components/artisan-profile";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Choose } from "@/components/choose";
import { EmptyState, Page, Refusal } from "@/components/page";
import { ReportAction } from "@/components/report";
import { copy } from "@/web/copy";
import { inviteArtisan } from "@/web/invitations";
import { getMyJobs } from "@/web/jobs";
import { getProfile } from "@/web/profiles";

// An Artisan's public Profile, at a link the Artisan can share and search
// engines can find (ADR 0016). Anyone may open it; it shows no contact.
export const Route = createFileRoute("/artisans/$artisanId")({
  loader: async ({ params, context }) => {
    const [profile, jobs] = await Promise.all([
      getProfile({ data: { artisanId: params.artisanId } }),
      // A Client may invite the Artisan to one of their Open Jobs from here.
      context.me?.kind === "client" ? getMyJobs() : null,
    ]);
    const openJobs = jobs
      ? [...jobs.needsYou, ...jobs.inProgress].filter((job) => job.state === "open")
      : [];
    return { profile, openJobs, origin: context.origin };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    const { profile, origin } = loaderData;
    const title = `${profile.publicName} · ${copy.appName}`;
    const description = t.description(
      profile.publicName,
      profile.categories.map((each) => each.name),
    );
    const url = `${origin}/artisans/${encodeURIComponent(profile.artisanId)}`;
    const image = profile.photos[0] && `${origin}${profile.photos[0].href}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:type", content: "profile" },
        { property: "og:site_name", content: copy.appName },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        ...(image ? [{ property: "og:image", content: image }] : []),
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: ArtisanProfilePage,
  notFoundComponent: () => (
    <Page title={t.notFound} lead={t.notFoundLead}>
      <Link to="/artisans" className={buttonVariants({ variant: "outline" })}>
        {t.back}
      </Link>
    </Page>
  ),
});

const t = copy.profile;

function ArtisanProfilePage() {
  const { profile, openJobs } = Route.useLoaderData();
  const { me, admin } = Route.useRouteContext();
  const visitor = !me && !admin;
  const invite = visitor ? (
    <Link to="/sign-up" className={buttonVariants({ size: "lg", className: "w-full" })}>
      {t.invite}
    </Link>
  ) : me?.kind === "client" ? (
    <InviteDialog name={profile.publicName} artisanId={profile.artisanId} jobs={openJobs} />
  ) : null;
  return (
    <Page crumbs={[{ to: "/artisans", label: t.back }]}>
      <ArtisanProfileView
        profile={profile}
        canReport={!!me}
        actions={
          <>
            {invite && <div className="hidden lg:block">{invite}</div>}
            {visitor && (
              <p className="text-center text-sm text-muted-foreground">
                {t.inviteLead}{" "}
                <Link
                  to="/sign-in"
                  className="font-medium text-primary underline underline-offset-4"
                >
                  {t.signIn}
                </Link>
              </p>
            )}
            <ShareLink />
            {me && me.accountId !== profile.artisanId && (
              <ReportAction
                about={{ kind: "profile", id: profile.artisanId }}
                label={copy.report.profile}
              />
            )}
          </>
        }
      />
      {invite && (
        // On a phone the one action stays in reach, over the page's foot.
        <>
          <div className="h-16 lg:hidden" aria-hidden />
          <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background p-3 lg:hidden">
            {invite}
          </div>
        </>
      )}
    </Page>
  );
}

/** A Client's Open Jobs to invite the Artisan to, in a dialog; the module decides who may be. */
function InviteDialog({
  name,
  artisanId,
  jobs,
}: {
  name: string;
  artisanId: string;
  jobs: { jobId: string; title: string | null }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [jobId, setJobId] = useState<string | null>(jobs.length === 1 ? jobs[0]!.jobId : null);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  async function send() {
    if (!jobId) return;
    setBusy(true);
    setRefusal(null);
    const invited = await inviteArtisan({ data: { jobId, artisanId } });
    setBusy(false);
    if (!invited.ok) return setRefusal(invited.refusal.message);
    setOpen(false);
    toast.success(t.invited(name));
    await router.invalidate();
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="lg" className="w-full" />}>{t.invite}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.inviteDialog(name)}</DialogTitle>
          <DialogDescription>{t.inviteDialogLead}</DialogDescription>
        </DialogHeader>
        {jobs.length === 0 ? (
          <EmptyState
            action={
              <Link to="/jobs/new" className={buttonVariants()}>
                {t.postJob}
              </Link>
            }
          >
            {t.noOpenJob}
          </EmptyState>
        ) : (
          <Field>
            <FieldLabel htmlFor="invite-job">{t.job}</FieldLabel>
            <Choose
              id="invite-job"
              value={jobId ?? ""}
              onChange={(value) => setJobId(value || null)}
              placeholder={t.chooseJob}
              options={jobs.map((job) => ({
                value: job.jobId,
                label: job.title ?? copy.jobs.untitled,
              }))}
            />
          </Field>
        )}
        <Refusal message={refusal} />
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{t.cancel}</DialogClose>
          {jobs.length > 0 && (
            <Button disabled={!jobId || busy} onClick={() => void send()}>
              {t.sendInvitation}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Copies the Profile's own address, the link an Artisan shares. */
function ShareLink() {
  return (
    <Button
      variant="outline"
      onClick={async () => {
        await navigator.clipboard.writeText(window.location.href);
        toast.success(t.copied);
      }}
    >
      <LinkIcon data-icon="inline-start" />
      {t.share}
    </Button>
  );
}
