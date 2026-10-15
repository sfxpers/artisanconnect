import type { ReactNode } from "react";
import { HeadContent, Link, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import appCss from "@/styles.css?url";
import { SearchX } from "lucide-react";
import { ThemeProvider } from "next-themes";
import { AppFooter } from "@/components/app-footer";
import { AdminShell } from "@/components/admin-shell";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ConfirmProvider } from "@/components/confirm";
import { AppHeader } from "@/components/app-header";
import { EmptyState, Page } from "@/components/page";
import { buttonVariants } from "@/components/ui/button";
import { getSession } from "@/web/accounts";
import { getRegionNames } from "@/web/profiles";
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
      { name: "color-scheme", content: "light dark" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
    ],
  }),
  // Who is signed in decides the header and which pages they may open.
  beforeLoad: () => getSession(),
  // The Regions the footer links to, read once: they change only by a new seed.
  loader: () => getRegionNames(),
  staleTime: Infinity,
  // The document around every page, a not-found or failed one too.
  shellComponent: RootDocument,
  component: RootComponent,
  // An unknown address, or a notFound() no nearer route shows.
  notFoundComponent: NotFound,
});

function RootComponent() {
  const { me, admin, unreadNotices } = Route.useRouteContext();
  const regions = Route.useLoaderData();
  const skip = (
    <a
      href="#main"
      className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
    >
      {copy.skipToContent}
    </a>
  );
  return admin ? (
    <AdminShell admin={admin}>
      {skip}
      <div id="main" className="flex-1">
        <Outlet />
      </div>
    </AdminShell>
  ) : (
    <div className="flex min-h-svh flex-col">
      {skip}
      <AppHeader me={me} unread={unreadNotices} />
      {me?.standing.suspended && <SuspendedBanner suspended={me.standing.suspended} />}
      <div id="main" className="flex flex-1 flex-col">
        <Outlet />
      </div>
      <AppFooter signedIn={me !== null} regions={regions} />
    </div>
  );
}

/** Shown on every page while the Account is Suspended, with the reason (#136). */
function SuspendedBanner({ suspended }: { suspended: { reason: string; since: Date } }) {
  const t = copy.standing;
  return (
    <Alert variant="destructive" className="rounded-none border-x-0 border-t-0">
      <AlertTitle>{t.suspended}</AlertTitle>
      <AlertDescription>
        {t.suspendedLead(suspended.reason)}{" "}
        <Link to="/support" className="font-medium text-primary underline underline-offset-4">
          {t.contest}
        </Link>
      </AlertDescription>
    </Alert>
  );
}

function NotFound() {
  const t = copy.notFound;
  return (
    <Page narrow>
      <EmptyState
        icon={<SearchX />}
        title={t.title}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Link to="/" className={buttonVariants()}>
              {t.home}
            </Link>
            <Link to="/artisans" className={buttonVariants({ variant: "outline" })}>
              {copy.header.visitor.findArtisans}
            </Link>
          </div>
        }
      >
        {t.lead}
      </EmptyState>
    </Page>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // next-themes sets the theme's class before the first paint, so it differs from the server's.
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>
            <ConfirmProvider>{children}</ConfirmProvider>
            {/* At the top, clear of the bars a phone holds at its foot. */}
            <Toaster position="top-center" />
          </TooltipProvider>
        </ThemeProvider>
        <TanStackRouterDevtools position="bottom-right" />
        <Scripts />
      </body>
    </html>
  );
}
