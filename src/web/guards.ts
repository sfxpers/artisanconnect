import { redirect } from "@tanstack/react-router";
import type { Me } from "./me";
import { landingFor } from "./me";

/** Lets only a signed-in Account of this kind in; anyone else goes where they belong. */
export function onlyFor(kind: Me["kind"] | "account", me: Me | null): Me {
  if (!me) throw redirect({ to: "/sign-in" });
  if (kind !== "account" && me.kind !== kind) throw redirect({ to: landingFor(me) });
  return me;
}

/** Lets only a Visitor in; a signed-in Account goes to its landing page. */
export function onlyForVisitors(me: Me | null) {
  if (me) throw redirect({ to: landingFor(me) });
}
