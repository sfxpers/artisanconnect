import type { ReactNode } from "react";
import { HeadContent, Link, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import appCss from "@/styles.css?url";
import { AppFooter } from "@/components/app-footer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ConfirmProvider } from "@/components/confirm";
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
      { name: "color-scheme", content: "light dark" },
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
      <div className="flex min-h-svh flex-col">
        <a
          href="#main"
          className="sr-only z-50 rounded-lg bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          {copy.skipToContent}
        </a>
        <AppHeader me={me} admin={admin} />
        {me?.standing.suspended && <SuspendedBanner suspended={me.standing.suspended} />}
        <div id="main" className="flex-1">
          <Outlet />
        </div>
        {!admin && <AppFooter signedIn={me !== null} />}
      </div>
    </RootDocument>
  );
}

/** Shown on every page while the Account is Suspended, with the reason (#136). */
function SuspendedBanner({ suspended }: { suspended: { reason: string; since: Date } }) {
  const t = copy.standing;
  return (
    <Alert variant="destructive" className="mx-auto max-w-6xl rounded-none border-x-0 border-t-0">
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
    <Page title={t.title} lead={t.lead} narrow>
      <Link to="/" className={buttonVariants()}>
        {t.home}
      </Link>
    </Page>
  );
}

/** Dark when the device is, from the first paint and as it changes. */
const followColorScheme = `(() => {
  const dark = matchMedia("(prefers-color-scheme: dark)");
  const apply = () => document.documentElement.classList.toggle("dark", dark.matches);
  apply();
  dark.addEventListener("change", apply);
})();`;

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // The scheme is set before the first paint, so the class differs from the server's.
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: followColorScheme }} />
      </head>
      <body>
        <ConfirmProvider>{children}</ConfirmProvider>
        <TanStackRouterDevtools position="bottom-right" />
        <Scripts />
      </body>
    </html>
  );
}
