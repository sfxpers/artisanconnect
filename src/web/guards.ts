import { redirect } from "@tanstack/react-router";
import type { AdminMe, Me, Session } from "./me";
import { landingFor } from "./me";

/** Lets only a signed-in Account of this kind in; anyone else goes where they belong. */
export function onlyFor(kind: Me["kind"] | "account", { me, admin }: Session): Me {
  if (admin) throw redirect({ to: "/admin" });
  if (!me) throw redirect({ to: "/sign-in" });
  if (kind !== "account" && me.kind !== kind) throw redirect({ to: landingFor(me) });
  return me;
}

/** Lets only a Visitor in; whoever is signed in goes to their landing page. */
export function onlyForVisitors({ me, admin }: Session) {
  if (admin) throw redirect({ to: "/admin" });
  if (me) throw redirect({ to: landingFor(me) });
}

/** Lets only a signed-in Admin in; an Account goes to its landing page. */
export function onlyForAdmins({ me, admin }: Session): AdminMe {
  if (me) throw redirect({ to: landingFor(me) });
  if (!admin) throw redirect({ to: "/admin/sign-in" });
  return admin;
}
