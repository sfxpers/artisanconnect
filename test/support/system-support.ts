import { assembleDomain, sections, type Actor } from "@/domain";
import { defineSection } from "@/domain/section";
import { ok } from "@/domain/result";
import { raiseSupportRequest, type SystemSupportRequest } from "@/domain/support";
import { createHarness, TEST_CONFIG } from "./harness";

// A probe section that raises a system Support request the way a failed
// Refund or long-paused money will, in its own event's batch.

const systemSupportProbe = defineSection({
  name: "systemSupportProbe",
  api: (ctx) => ({
    async raise(_actor: Actor, input: SystemSupportRequest) {
      await ctx.commit(raiseSupportRequest(ctx, input));
      return ok({});
    },
  }),
});

/** The harness with the system Support probe added. */
export async function createSystemSupportHarness() {
  const harness = await createHarness();
  return {
    ...harness,
    domain: assembleDomain(harness.ports, TEST_CONFIG, [...sections, systemSupportProbe]),
  };
}
