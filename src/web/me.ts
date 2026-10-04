import type { Domain } from "@/domain";

/** The signed-in Account as it sees itself. */
export type Me = NonNullable<Awaited<ReturnType<Domain["accounts"]["me"]>>>;

/** Where an Account lands: a Client ready to post a Job, an Artisan at Verification. */
export function landingFor(me: Me): "/jobs" | "/verification" {
  return me.nextStep === "post-first-job" ? "/jobs" : "/verification";
}
