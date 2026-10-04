import type { Domain } from "@/domain";

/**
 * Builds test data through the module's public commands only, never by writing
 * rows, so the schema can change without tests changing. Each ticket adds the
 * builders its commands make possible: a Client, a verified Artisan, an Open
 * Job, a Hired Engagement.
 */
export function given(_domain: Domain) {
  return {};
}
