import { createServerFn } from "@tanstack/react-start";
import { notFound } from "@tanstack/react-router";
import { requestActor, requestDomain } from "./session";

// Browse and the Artisan Profile: thin adapters onto the domain module, which
// decides who sees what (ADR 0017).

/** The Artisans verified for one Service Category, optionally in one Region. */
export const getBrowse = createServerFn({ method: "GET" })
  .inputValidator((input: { category: string; regionId?: string }) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.profiles.browse(await requestActor(domain), data);
  });

/** An Artisan's public Profile; one nobody may open is a page that does not exist. */
export const getProfile = createServerFn({ method: "GET" })
  .inputValidator((input: { artisanId: string }) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    const profile = await domain.profiles.view(await requestActor(domain), data);
    if (!profile) throw notFound();
    return profile;
  });

/** The signed-in Artisan's own Profile, and where its edits stand. */
export const getMyProfile = createServerFn({ method: "GET" }).handler(async () => {
  const domain = requestDomain();
  return domain.profiles.mine(await requestActor(domain));
});

/**
 * Sends the whole new version of the Profile: the About text under "about",
 * the ids of the photos kept under "keep", and photos to add under "add".
 */
export const editProfile = createServerFn({ method: "POST" })
  .inputValidator((input: FormData) => {
    if (!(input instanceof FormData)) throw new Error("Expected a form");
    return {
      about: String(input.get("about") ?? ""),
      keep: input.getAll("keep").map(String),
      add: input.getAll("add").filter((value): value is File => value instanceof File),
    };
  })
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.profiles.edit(await requestActor(domain), data);
  });

/** Withdraws the Profile edit being checked. */
export const withdrawProfileEdit = createServerFn({ method: "POST" }).handler(async () => {
  const domain = requestDomain();
  return domain.profiles.withdraw(await requestActor(domain));
});

/** Every Region's name, A to Z, to narrow Browse by. */
export const getRegionNames = createServerFn({ method: "GET" }).handler(async () => {
  const domain = requestDomain();
  const regions = await domain.regions.all(await requestActor(domain));
  return regions.map(({ id, name }) => ({ id, name }));
});
