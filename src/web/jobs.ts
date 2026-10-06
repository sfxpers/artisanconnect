import { createServerFn } from "@tanstack/react-start";
import { notFound } from "@tanstack/react-router";
import { requestActor, requestDomain } from "./session";

// Posting and managing a Job: thin adapters onto the domain module, which
// decides who sees what (ADR 0017).

/** The signed-in Client's Jobs: Needs you, In progress, and Finished. */
export const getMyJobs = createServerFn({ method: "GET" }).handler(async () => {
  const domain = requestDomain();
  return domain.jobs.mine(await requestActor(domain));
});

/**
 * A Job as its Client sees it, or as an Artisan offered it does; one the
 * viewer may not see is a page that does not exist.
 */
export const getJob = createServerFn({ method: "GET" })
  .inputValidator((input: { jobId: string }) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    const actor = await requestActor(domain);
    if (actor.kind === "artisan") {
      const offered = await domain.jobs.viewAsArtisan(actor, data);
      if (!offered) throw notFound();
      return { as: "artisan" as const, ...offered };
    }
    const job = await domain.jobs.view(actor, data);
    if (!job) throw notFound();
    return { as: "client" as const, ...job };
  });

/** A form's text, or undefined when it was left out. */
function field(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === "string" ? value : undefined;
}

/** The photos kept, by id, under "keep", and those added under "add". */
function photos(form: FormData) {
  return {
    keep: form.getAll("keep").map(String),
    add: form.getAll("add").filter((value): value is File => value instanceof File),
  };
}

function asForm(input: unknown): FormData {
  if (!(input instanceof FormData)) throw new Error("Expected a form");
  return input;
}

/** Saves a Draft whole, a new one or the one named under "jobId". */
export const saveJobDraft = createServerFn({ method: "POST" })
  .inputValidator((input: FormData) => {
    const form = asForm(input);
    const gasWork = field(form, "gasWork");
    return {
      jobId: field(form, "jobId") || undefined,
      category: field(form, "category") || null,
      siteType: field(form, "siteType") || null,
      suburbId: field(form, "suburbId") || null,
      street: field(form, "street"),
      title: field(form, "title"),
      description: field(form, "description"),
      gasWork: gasWork === "yes" ? true : gasWork === "no" ? false : null,
      preferredStart: field(form, "preferredStart") || null,
      matching: field(form, "matching") || null,
      ...photos(form),
    };
  })
  .handler(async ({ data }) => {
    const domain = requestDomain();
    // The domain module refuses a choice that is not one of its own, as text.
    return domain.jobs.saveDraft(
      await requestActor(domain),
      data as Parameters<typeof domain.jobs.saveDraft>[1],
    );
  });

/** Changes a posted Job's title, description, photos, Site type, and Preferred start. */
export const editJob = createServerFn({ method: "POST" })
  .inputValidator((input: FormData) => {
    const form = asForm(input);
    return {
      jobId: field(form, "jobId") ?? "",
      title: field(form, "title") ?? "",
      description: field(form, "description") ?? "",
      siteType: field(form, "siteType") ?? "",
      preferredStart: field(form, "preferredStart") || null,
      ...photos(form),
    };
  })
  .handler(async ({ data }) => {
    const domain = requestDomain();
    // As for a Draft, the domain module refuses a Site type it does not know.
    return domain.jobs.edit(
      await requestActor(domain),
      data as Parameters<typeof domain.jobs.edit>[1],
    );
  });

const byJob = (input: { jobId: string }) => input;

/** Posts the Client's saved Draft. */
export const postJob = createServerFn({ method: "POST" })
  .inputValidator(byJob)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.jobs.post(await requestActor(domain), data);
  });

/** Withdraws what of the Job is being checked. */
export const withdrawJob = createServerFn({ method: "POST" })
  .inputValidator(byJob)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.jobs.withdraw(await requestActor(domain), data);
  });

/** Discards the Client's Draft. */
export const discardJob = createServerFn({ method: "POST" })
  .inputValidator(byJob)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.jobs.discard(await requestActor(domain), data);
  });

/** Closes the Client's Open Job. */
export const closeJob = createServerFn({ method: "POST" })
  .inputValidator(byJob)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.jobs.close(await requestActor(domain), data);
  });

/** Renews the Client's Expired Job for 14 days. */
export const renewJob = createServerFn({ method: "POST" })
  .inputValidator(byJob)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.jobs.renew(await requestActor(domain), data);
  });
