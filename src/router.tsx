import { createRouter } from "@tanstack/react-router";
import { PageError, PageSkeleton } from "@/components/page";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    // Every page shows a skeleton while it loads, and a way on if it fails.
    defaultPendingComponent: PageSkeleton,
    defaultErrorComponent: PageError,
  });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
  interface HistoryState {
    /** Why posting a new Job was refused, shown on the Draft's own page. */
    postRefusal?: string;
  }
}
