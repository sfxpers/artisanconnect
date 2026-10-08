import type { ReactNode } from "react";
import { HeadContent, Link, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import appCss from "@/styles.css?url";
import { AppHeader } from "@/components/app-header";
import { Page } from "@/components/page";
import { buttonVariants } from "@/components/ui/button";
import { getSession } from "@/web/accounts";
import { copy } from "@/web/copy";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      { title: copy.appName },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  // Who is signed in decides the header and which pages they may open.
  beforeLoad: () => getSession(),
  component: RootComponent,
  // An unknown address, or a notFound() no nearer route shows.
  notFoundComponent: NotFound,
});

function RootComponent() {
  const { me, admin } = Route.useRouteContext();
  return (
    <RootDocument>
      <div className="min-h-svh bg-muted/40 pb-16">
        <AppHeader me={me} admin={admin} />
        {me?.standing.suspended && <SuspendedBanner suspended={me.standing.suspended} />}
        <Outlet />
      </div>
    </RootDocument>
  );
}

/** Shown on every page while the Account is Suspended, with the reason (#136). */
function SuspendedBanner({ suspended }: { suspended: { reason: string; since: Date } }) {
  const t = copy.standing;
  return (
    <div role="alert" className="border-b border-destructive/40 bg-destructive/10">
      <div className="mx-auto max-w-6xl space-y-1 px-4 py-3 text-sm">
        <p className="font-medium text-destructive">{t.suspended}</p>
        <p>{t.suspendedLead(suspended.reason)}</p>
        <Link to="/support" className="underline">
          {t.contest}
        </Link>
      </div>
    </div>
  );
}

function NotFound() {
  const t = copy.notFound;
  return (
    <Page title={t.title}>
      <p className="text-sm text-muted-foreground">{t.lead}</p>
      <Link to="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
        {t.home}
      </Link>
    </Page>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <TanStackRouterDevtools position="bottom-right" />
        <Scripts />
      </body>
    </html>
  );
}
