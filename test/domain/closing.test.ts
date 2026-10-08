import { describe, expect, test } from "vitest";
import { visitor } from "@/domain/actor";
import { createHarness, type Harness } from "../support/harness";

// An Account with no Engagement in progress closes itself (#141): its Open
// Jobs close, its Sent Quotes are Withdrawn, and its Reviews stay. A Closed
// Account does not sign in, and nobody finds, offers, or invites it, until
// it reopens with its Email and an Email code. A Closed Artisan keeps its
// Identity Number, so reopening needs no new Verification.

const IP = "203.0.113.7";

function cookieOf(cookies: string[]) {
  return cookies.map((cookie) => cookie.split(";")[0]).join("; ");
}

/** The Account reopens with an Email code sent to its Email. */
async function reopened(harness: Harness, address: string) {
  // A new Email code goes only a minute after the sign-up's.
  harness.clock.advance({ minutes: 1 });
  const asked = await harness.domain.accounts.requestReopenCode(visitor, {
    email: address,
    ip: IP,
  });
  if (!asked.ok) throw new Error(asked.refusal.message);
  return harness.domain.accounts.reopen(visitor, {
    email: address,
    code: harness.given.codeSentTo(address),
    ip: IP,
    device: null,
  });
}

describe("closing an Account", () => {
  test("ends its sessions, and it no longer signs in with its password", async () => {
    const { domain, given } = await createHarness();
    const client = await given.client();

    expect(await domain.accounts.close(client.actor)).toEqual({ ok: true, value: {} });

    expect(
      (await domain.accounts.whoIs(visitor, { cookie: cookieOf(client.cookies) })).actor,
    ).toEqual(visitor);
    expect(
      await domain.accounts.signIn(visitor, {
        email: client.email,
        password: client.password,
        ip: IP,
      }),
    ).toMatchObject({ ok: false, refusal: { reason: "closed" } });
  });

  test("closes a Client's Open Jobs, their Sent Quotes Declined and their Artisans told", async () => {
    const { domain, given } = await createHarness();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const jobId = await given.openJob(client, { title: "Paint the lounge" });
    const quoteId = await given.sentQuote(artisan, jobId);

    await domain.accounts.close(client.actor);

    expect((await domain.jobs.view(client.actor, { jobId }))?.state).toBe("closed");
    expect((await domain.quotes.forJob(client.actor, { jobId }))?.[0]).toMatchObject({
      quoteId,
      state: "declined",
    });
    expect(await domain.notices.list(artisan.actor)).toContainEqual(
      expect.objectContaining({ title: "Your Quote was declined: Paint the lounge" }),
    );
  });

  test("withdraws an Artisan's Sent Quotes, each Client told, and takes it out of Browse and offers", async () => {
    const { domain, given } = await createHarness();
    const artisan = await given.matchableArtisan({ categories: ["painting"] });
    const client = await given.client();
    const jobId = await given.openJob(client, { title: "Paint the lounge" });
    const quoteId = await given.sentQuote(artisan, jobId);

    await domain.accounts.close(artisan.actor);

    expect((await domain.quotes.forJob(client.actor, { jobId }))?.[0]).toMatchObject({
      quoteId,
      state: "withdrawn",
    });
    expect(await domain.notices.list(client.actor)).toContainEqual(
      expect.objectContaining({ title: "A Quote was withdrawn: Paint the lounge" }),
    );
    expect(await domain.profiles.browse(visitor, { category: "painting" })).toEqual([]);
    expect(await domain.profiles.view(visitor, { artisanId: artisan.actor.accountId })).toBeNull();
    const invitesOnly = await given.openJob(client, { matching: "invite-only" });
    expect(await domain.invitations.list(client.actor, { jobId: invitesOnly })).toEqual([]);
    await given.openJob(client);
    expect(await domain.matches.mine(artisan.actor)).toEqual([]);
  });

  test("is refused while an Engagement is in progress, and allowed once it is Completed", async () => {
    const { domain, given } = await createHarness();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const jobId = await given.openJob(client);
    await given.hired(client, await given.sentQuote(artisan, jobId));
    const engagementId = await given.engagementOf(client, jobId);

    for (const party of [client, artisan]) {
      expect(await domain.accounts.close(party.actor)).toMatchObject({
        ok: false,
        refusal: { reason: "engagement-in-progress" },
      });
    }
    expect((await domain.accounts.me(client.actor))?.email).toBe(client.email);

    await given.workStarted(client, engagementId);
    await given.markedComplete(artisan, engagementId);
    await given.approved(client, engagementId);

    expect(await domain.accounts.close(client.actor)).toMatchObject({ ok: true });
    expect(await domain.accounts.close(artisan.actor)).toMatchObject({ ok: true });
  });

  test("shows the Admin it is Closed on the People page", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const client = await given.client({ name: "Thandi Mokoena" });

    await domain.accounts.close(client.actor);

    expect(await domain.people.find(admin.actor, { query: "Thandi" })).toEqual([
      expect.objectContaining({ accountId: client.actor.accountId, closed: "closed" }),
    ]);
    expect(
      await domain.people.view(admin.actor, { accountId: client.actor.accountId }),
    ).toMatchObject({ closed: "closed" });
  });

  test("is allowed while Suspended, and the Suspension stands when it reopens", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const admin = await given.admin();
    const client = await given.client();
    await domain.people.suspend(admin.actor, {
      accountId: client.actor.accountId,
      reason: "Fraud.",
    });

    expect(await domain.accounts.close(client.actor)).toMatchObject({ ok: true });
    expect(await reopened(harness, client.email)).toMatchObject({ ok: true });

    expect((await domain.accounts.me(client.actor))?.standing.suspended).toMatchObject({
      reason: "Fraud.",
    });
  });

  test("is refused to anyone but a signed-in Account, and once closed", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const client = await given.client();
    await domain.accounts.close(client.actor);

    expect(await domain.accounts.close(visitor)).toMatchObject({
      ok: false,
      refusal: { reason: "sign-in-required" },
    });
    expect(await domain.accounts.close(admin.actor)).toMatchObject({
      ok: false,
      refusal: { reason: "sign-in-required" },
    });
    expect(await domain.accounts.close(client.actor)).toMatchObject({
      ok: false,
      refusal: { reason: "closed" },
    });
  });
});

describe("reopening a Closed Account", () => {
  test("with its Email and an Email code signs it in", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const client = await given.client();
    await domain.accounts.close(client.actor);

    const opened = await reopened(harness, client.email);

    expect(opened).toEqual({
      ok: true,
      value: { actor: client.actor, cookies: expect.any(Array) },
    });
    if (!opened.ok) return;
    expect(
      (await domain.accounts.whoIs(visitor, { cookie: cookieOf(opened.value.cookies) })).actor,
    ).toEqual(client.actor);
    expect(
      await domain.accounts.signIn(visitor, {
        email: client.email,
        password: client.password,
        ip: IP,
      }),
    ).toMatchObject({ ok: true });
  });

  test("keeps a Closed Artisan's Identity Number and Verification: its Profile is back in Browse", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const artisan = await given.matchableArtisan({ categories: ["painting"] });
    const before = (await domain.accounts.me(artisan.actor))?.identityNumber;
    await domain.accounts.close(artisan.actor);

    await reopened(harness, artisan.email);

    expect(before).toEqual(expect.stringMatching(/\d{13}/));
    expect((await domain.accounts.me(artisan.actor))?.identityNumber).toBe(before);
    expect(await domain.profiles.browse(visitor, { category: "painting" })).toEqual([
      expect.objectContaining({ artisanId: artisan.actor.accountId }),
    ]);
  });

  test("sends a code only to a Closed Account's Email, with the same answer for any Email", async () => {
    const { domain, given, mailer, clock } = await createHarness();
    const open = await given.client();
    clock.advance({ minutes: 1 });
    const sentBefore = mailer.sent.length;

    for (const address of [open.email, "nobody@example.com"]) {
      expect(await domain.accounts.requestReopenCode(visitor, { email: address, ip: IP })).toEqual({
        ok: true,
        value: { email: address },
      });
    }

    expect(mailer.sent).toHaveLength(sentBefore);
  });

  test("is refused with a wrong code, and the Account stays Closed", async () => {
    const { domain, given, clock } = await createHarness();
    const client = await given.client();
    await domain.accounts.close(client.actor);
    clock.advance({ minutes: 1 });
    await domain.accounts.requestReopenCode(visitor, { email: client.email, ip: IP });
    const right = given.codeSentTo(client.email);

    const opened = await domain.accounts.reopen(visitor, {
      email: client.email,
      code: right === "000000" ? "111111" : "000000",
      ip: IP,
    });

    expect(opened).toMatchObject({ ok: false, refusal: { reason: "wrong-code" } });
    expect(
      await domain.accounts.signIn(visitor, {
        email: client.email,
        password: client.password,
        ip: IP,
      }),
    ).toMatchObject({ ok: false, refusal: { reason: "closed" } });
  });

  test("accepts Marketplace rules changed while it was Closed, or is refused", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const admin = await given.admin();
    const client = await given.client();
    await domain.accounts.close(client.actor);
    await domain.marketplaceRules.publish(admin.actor, { summary: "New rules." });
    harness.clock.advance({ minutes: 1 });
    await domain.accounts.requestReopenCode(visitor, { email: client.email, ip: IP });
    const code = given.codeSentTo(client.email);

    expect(
      await domain.accounts.reopen(visitor, { email: client.email, code, ip: IP }),
    ).toMatchObject({ ok: false, refusal: { reason: "accept-rules" } });
    const rules = await domain.marketplaceRules.current(visitor);
    expect(
      await domain.accounts.reopen(visitor, {
        email: client.email,
        code,
        ip: IP,
        acceptsRules: { rulesVersion: rules.version, consentsToDataUse: true },
      }),
    ).toMatchObject({ ok: true });
    expect((await domain.accounts.me(client.actor))?.rules.version).toBe(rules.version);
  });
});
