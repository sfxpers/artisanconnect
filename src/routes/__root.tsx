import type { ReactNode } from "react";
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import appCss from "@/styles.css?url";
import { AppHeader } from "@/components/app-header";
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
});

function RootComponent() {
  const { me, admin } = Route.useRouteContext();
  return (
    <RootDocument>
      <div className="min-h-svh bg-muted/40 pb-16">
        <AppHeader me={me} admin={admin} />
        <Outlet />
      </div>
    </RootDocument>
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
