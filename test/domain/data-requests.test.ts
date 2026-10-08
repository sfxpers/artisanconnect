import { describe, expect, test } from "vitest";
import { visitor, type Actor, type AdminActor } from "@/domain/actor";
import type { CreatePayout } from "@/domain/ports";
import { createHarness, type Harness } from "../support/harness";

// An Account asks for a copy of its data or for its erasure (#141). Each is a
// Data requests queue item: the Admin sends an export the Account downloads,
// or anonymises the Closed Account, keeping its money records and Reviews
// (shown without the name), once no money is still owed to it. Asking for
// erasure closes the Account. The Account is told by email.

const IP = "203.0.113.7";

/** The one Data request waiting for the Admin, as its page shows it. */
async function dataItem(domain: Harness["domain"], admin: { actor: AdminActor }) {
  const [item] = (await domain.queues.home(admin.actor, { queue: "data-requests" }))?.items ?? [];
  if (!item) throw new Error("No Data request is waiting");
  return (await domain.queues.item(admin.actor, { itemId: item.id }))!;
}

async function decided(
  domain: Harness["domain"],
  admin: { actor: AdminActor },
  decision: string,
  reason?: string,
) {
  const item = await dataItem(domain, admin);
  const made = await domain.queues.decide(admin.actor, { itemId: item.id, decision, reason });
  if (!made.ok) throw new Error(made.refusal.message);
}

/** The export the Account downloads, read as JSON. */
async function exported(domain: Harness["domain"], account: { actor: Actor }) {
  const [request] = await domain.dataRequests.mine(account.actor);
  const file = await domain.dataRequests.exportFile(account.actor, {
    requestId: request!.requestId,
  });
  if (!file) throw new Error("No export to download");
  return JSON.parse(await new Response(file.body).text()) as Record<string, unknown>;
}

describe("asking for a copy of the data", () => {
  test("puts it in the Data requests queue", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const client = await given.client({ name: "Thandi Mokoena" });

    expect(await domain.dataRequests.request(client.actor, { kind: "copy" })).toEqual({
      ok: true,
      value: { requestId: expect.any(String) },
    });

    const home = await domain.queues.home(admin.actor, { queue: "data-requests" });
    expect(home?.counts["data-requests"]).toBe(1);
    expect(home?.items).toEqual([
      expect.objectContaining({ title: "A copy of the data, for Thandi Mokoena" }),
    ]);
    expect(await domain.dataRequests.mine(client.actor)).toEqual([
      {
        requestId: expect.any(String),
        kind: "copy",
        requestedAt: expect.any(Date),
        state: "waiting",
        decidedAt: null,
        reason: null,
      },
    ]);
  });

  test("is answered with an export the Account downloads, and it is told", async () => {
    const { domain, given, mailer } = await createHarness();
    const admin = await given.admin();
    const client = await given.client({ name: "Thandi Mokoena", email: "thandi@example.com" });
    await given.openJob(client, { title: "Paint the lounge" });
    await domain.dataRequests.request(client.actor, { kind: "copy" });
    const item = await dataItem(domain, admin);
    expect(item.decisions.map((decision) => decision.key)).toEqual(["send-export", "refuse"]);

    await decided(domain, admin, "send-export");

    expect(await domain.dataRequests.mine(client.actor)).toEqual([
      expect.objectContaining({ kind: "copy", state: "sent", decidedAt: expect.any(Date) }),
    ]);
    expect(await domain.notices.list(client.actor)).toContainEqual(
      expect.objectContaining({ event: "data-request.export-sent", link: "/account" }),
    );
    expect(mailer.sentTo("thandi@example.com").at(-1)?.subject).toBe(
      "Your copy of your data is ready",
    );
    const data = await exported(domain, client);
    expect(data).toMatchObject({
      account: { kind: "client", name: "Thandi Mokoena", email: "thandi@example.com" },
      jobs: [expect.objectContaining({ title: "Paint the lounge", street: "12 Main Road" })],
      sightings: [expect.objectContaining({ at: "sign-in" })],
    });
  });

  test("exports the warnings and Suspensions with reasons and the Reports it made, never Reports of it", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const jobId = await given.openJob(client);
    const quoteId = await given.sentQuote(artisan, jobId);
    const made = await domain.reports.report(client.actor, {
      about: { kind: "quote", id: quoteId },
      reason: "threat-or-abuse",
      note: "Rude words.",
    });
    expect(made).toMatchObject({ ok: true });
    await domain.reports.report(artisan.actor, {
      about: { kind: "job", id: jobId },
      reason: "threat-or-abuse",
    });
    await domain.people.warn(admin.actor, {
      accountId: client.actor.accountId,
      reason: "Rude messages.",
    });
    await domain.dataRequests.request(client.actor, { kind: "copy" });
    await decided(domain, admin, "send-export");

    const data = await exported(domain, client);

    expect(data.warnings).toEqual([expect.objectContaining({ reason: "Rude messages." })]);
    expect(data.suspensions).toEqual([]);
    expect(data.reportsMade).toEqual([
      expect.objectContaining({ subject: "quote", note: "Rude words." }),
    ]);
    expect(JSON.stringify(data)).not.toContain(artisan.email);
  });

  test("downloads for nobody but the Account, and only once sent", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const client = await given.client();
    const other = await given.client();
    await domain.dataRequests.request(client.actor, { kind: "copy" });
    const [request] = await domain.dataRequests.mine(client.actor);
    const requestId = request!.requestId;

    expect(await domain.dataRequests.exportFile(client.actor, { requestId })).toBeNull();
    await decided(domain, admin, "send-export");
    expect(await domain.dataRequests.exportFile(other.actor, { requestId })).toBeNull();
    expect(await domain.dataRequests.exportFile(visitor, { requestId })).toBeNull();
    expect(await domain.dataRequests.exportFile(admin.actor, { requestId })).toBeNull();
    expect(await domain.dataRequests.exportFile(client.actor, { requestId })).not.toBeNull();
  });

  test("waits one at a time per kind", async () => {
    const { domain, given } = await createHarness();
    await given.admin();
    const client = await given.client();
    await domain.dataRequests.request(client.actor, { kind: "copy" });

    expect(await domain.dataRequests.request(client.actor, { kind: "copy" })).toMatchObject({
      ok: false,
      refusal: { reason: "already-waiting" },
    });
  });

  test("is refused, with the reason, by email", async () => {
    const { domain, given, mailer } = await createHarness();
    const admin = await given.admin();
    const client = await given.client({ email: "thandi@example.com" });
    await domain.dataRequests.request(client.actor, { kind: "copy" });

    await decided(domain, admin, "refuse", "We sent you one yesterday.");

    expect(await domain.dataRequests.mine(client.actor)).toEqual([
      expect.objectContaining({ state: "refused", reason: "We sent you one yesterday." }),
    ]);
    expect(mailer.sentTo("thandi@example.com").at(-1)?.text).toContain(
      "We sent you one yesterday.",
    );
  });

  test("is refused to anyone but a signed-in Account, and for an unknown kind", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const client = await given.client();

    expect(await domain.dataRequests.request(visitor, { kind: "copy" })).toMatchObject({
      ok: false,
      refusal: { reason: "sign-in-required" },
    });
    expect(await domain.dataRequests.request(admin.actor, { kind: "copy" })).toMatchObject({
      ok: false,
      refusal: { reason: "sign-in-required" },
    });
    expect(await domain.dataRequests.request(client.actor, { kind: "everything" })).toMatchObject({
      ok: false,
      refusal: { reason: "invalid" },
    });
  });
});

describe("asking for erasure", () => {
  test("closes the Account and puts it in the Data requests queue", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const client = await given.client({ name: "Thandi Mokoena" });

    expect(await domain.dataRequests.request(client.actor, { kind: "erasure" })).toMatchObject({
      ok: true,
    });

    expect(
      await domain.accounts.signIn(visitor, {
        email: client.email,
        password: client.password,
        ip: IP,
      }),
    ).toMatchObject({ ok: false, refusal: { reason: "closed" } });
    expect((await domain.queues.home(admin.actor, { queue: "data-requests" }))?.items).toEqual([
      expect.objectContaining({ title: "Erasure, for Thandi Mokoena" }),
    ]);
  });

  test("is refused while an Engagement is in progress, and nothing is asked", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const jobId = await given.openJob(client);
    await given.hired(client, await given.sentQuote(artisan, jobId));

    expect(await domain.dataRequests.request(client.actor, { kind: "erasure" })).toMatchObject({
      ok: false,
      refusal: { reason: "engagement-in-progress" },
    });
    expect((await domain.queues.home(admin.actor))?.counts["data-requests"]).toBe(0);
  });
});

describe("erasing an Account", () => {
  test("frees its Email, ends its password, and it never reopens", async () => {
    const harness = await createHarness();
    const { domain, given, mailer, clock } = harness;
    const admin = await given.admin();
    const client = await given.client({ email: "thandi@example.com" });
    await domain.dataRequests.request(client.actor, { kind: "erasure" });

    await decided(domain, admin, "erase");

    expect(mailer.sentTo("thandi@example.com").at(-1)?.subject).toBe(
      "Your ArtisanConnect data is erased",
    );
    expect(
      await domain.accounts.signIn(visitor, {
        email: "thandi@example.com",
        password: client.password,
        ip: IP,
      }),
    ).toMatchObject({ ok: false, refusal: { reason: "wrong-credentials" } });
    clock.advance({ minutes: 1 });
    const sentBefore = mailer.sentTo("thandi@example.com").length;
    await domain.accounts.requestReopenCode(visitor, { email: "thandi@example.com", ip: IP });
    expect(mailer.sentTo("thandi@example.com")).toHaveLength(sentBefore);
    // The Email may hold a new Account.
    clock.advance({ minutes: 1 });
    expect(await given.client({ email: "thandi@example.com" })).toMatchObject({
      actor: { kind: "client" },
    });
  });

  test("keeps its Reviews, shown without the name", async () => {
    const { domain, given, clock } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.matchableArtisan();
    const client = await given.client({ name: "Thandi Mokoena" });
    const jobId = await given.openJob(client);
    await given.hired(client, await given.sentQuote(artisan, jobId, { startOn: "2026-10-05" }));
    const engagementId = await given.engagementOf(client, jobId);
    await given.workStarted(client, engagementId);
    await given.markedComplete(artisan, engagementId);
    await given.approved(client, engagementId);
    await domain.reviews.write(client.actor, { engagementId, rating: 5, comment: "Lovely job." });
    const [review] = (await domain.queues.home(admin.actor, { queue: "pre-checks" }))?.items ?? [];
    await domain.queues.decide(admin.actor, { itemId: review!.id, decision: "publish" });
    // Shown once the Review window closes, as the Artisan wrote none.
    clock.advance({ days: 8 });
    const before = await domain.reviews.ofArtisan(visitor, { artisanId: artisan.actor.accountId });
    expect(before?.items).toEqual([expect.objectContaining({ reviewer: "Thandi M." })]);

    await domain.dataRequests.request(client.actor, { kind: "erasure" });
    await decided(domain, admin, "erase");

    const after = await domain.reviews.ofArtisan(visitor, { artisanId: artisan.actor.accountId });
    expect(after?.items).toEqual([
      expect.objectContaining({ rating: 5, comment: "Lovely job.", reviewer: null }),
    ]);
    expect(
      await domain.accounts.shownName(artisan.actor, { accountId: client.actor.accountId }),
    ).toBeNull();
  });

  test("keeps it without a name though names it gave are released afterwards", async () => {
    const { domain, given, contentReader } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.artisan();
    const client = await given.client({ name: "Thandi Mokoena" });
    contentReader.force({ kind: "unsure", reason: "May be a handle." });
    await domain.accounts.changeNames(client.actor, { name: "Thandi Fixes" });
    contentReader.force({ kind: "clear" });
    const [held] = (await domain.queues.home(admin.actor, { queue: "pre-checks" }))?.items ?? [];
    await domain.dataRequests.request(client.actor, { kind: "erasure" });
    await decided(domain, admin, "erase");

    await domain.queues.decide(admin.actor, { itemId: held!.id, decision: "release" });

    expect(
      await domain.accounts.shownName(artisan.actor, { accountId: client.actor.accountId }),
    ).toBeNull();
  });

  test("leaves nobody to email when a request is refused afterwards", async () => {
    const { domain, given, mailer } = await createHarness();
    const admin = await given.admin();
    const client = await given.client();
    await domain.dataRequests.request(client.actor, { kind: "copy" });
    await domain.dataRequests.request(client.actor, { kind: "erasure" });
    const erasure = (await domain.queues.home(admin.actor, { queue: "data-requests" }))!.items.find(
      (item) => item.title.startsWith("Erasure"),
    )!;
    await domain.queues.decide(admin.actor, { itemId: erasure.id, decision: "erase" });

    await decided(domain, admin, "refuse", "Nothing left to copy.");

    expect(mailer.sent.filter((email) => email.to.endsWith("@erased.invalid"))).toEqual([]);
  });

  test("leaves the People page without its names or Email", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const client = await given.client({ name: "Thandi Mokoena", email: "thandi@example.com" });
    await domain.dataRequests.request(client.actor, { kind: "erasure" });

    await decided(domain, admin, "erase");

    expect(await domain.people.find(admin.actor, { query: "Thandi" })).toEqual([]);
    expect(await domain.people.find(admin.actor, { query: "thandi@example.com" })).toEqual([]);
  });

  test("waits until money still owed to it is paid", async () => {
    const { domain, given, payments, clock } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const jobId = await given.openJob(client);
    await given.hired(client, await given.sentQuote(artisan, jobId, { startOn: "2026-10-05" }));
    const engagementId = await given.engagementOf(client, jobId);
    await given.workStarted(client, engagementId);
    await given.markedComplete(artisan, engagementId);
    await given.approved(client, engagementId);
    await domain.dataRequests.request(artisan.actor, { kind: "erasure" });

    const waiting = await dataItem(domain, admin);
    expect(waiting.decisions.map((decision) => decision.key)).toEqual(["refuse"]);
    expect(JSON.stringify(waiting.tabs)).toMatch(/Still owed to it/);

    // The day's Payout run sends what is owed, and the bank pays it.
    clock.advance({ hours: 3 });
    expect(await domain.system.runPayouts()).toMatchObject({ ran: true });
    for (const call of payments.calls.filter((each) => each.operation === "createPayout")) {
      const paid = await domain.system.receivePaymentEvent(
        await payments.succeedPayout((call.input as CreatePayout).id),
      );
      if (!paid.ok) throw new Error(paid.refusal.message);
    }

    const settled = await dataItem(domain, admin);
    expect(settled.decisions.map((decision) => decision.key)).toEqual(["erase", "refuse"]);
  });

  test("is not offered once the Account reopened; the request may be refused", async () => {
    const { domain, given, clock } = await createHarness();
    const admin = await given.admin();
    const client = await given.client();
    await domain.dataRequests.request(client.actor, { kind: "erasure" });
    clock.advance({ minutes: 1 });
    await domain.accounts.requestReopenCode(visitor, { email: client.email, ip: IP });
    await domain.accounts.reopen(visitor, {
      email: client.email,
      code: given.codeSentTo(client.email),
      ip: IP,
    });

    expect((await dataItem(domain, admin)).decisions.map((decision) => decision.key)).toEqual([
      "refuse",
    ]);
  });
});
