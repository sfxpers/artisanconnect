import { describe, expect, test } from "vitest";
import type { AccountActor, Actor, AdminActor } from "@/domain/actor";
import type { CreatePayout } from "@/domain/ports";
import type { FakePayments } from "@/domain/fakes/payments";
import { collectionOf } from "../support/given";
import { createHarness, type Harness } from "../support/harness";

// Signals (#140, ADR 0020): detection puts patterns of behaviour in the
// Admin's Signals queue, sanctioning nobody and telling nobody. The Admin
// closes a Signal, or acts on it with a warning, a Suspension, or a Payout hold.

/** The day's Payout run in the tests: 10:00 in South Africa on the fake clock's first day. */
const RUN_AT = new Date("2026-10-05T08:00:00Z");

describe("a second sent-back Payout", () => {
  test("within 90 days raises a Signal, telling nobody", async () => {
    const { domain, given, payments, clock } = await createHarness();
    const admin = await given.admin();
    const { artisan } = await releasedJob(given);
    await releasedJob(given, { artisan });
    clock.set(RUN_AT);
    await domain.system.runPayouts();
    const [first, second] = payoutsAsked(payments);
    await receive(domain, await payments.succeedPayout(first!.id));
    await receive(domain, await payments.succeedPayout(second!.id));
    clock.advance({ days: 1 });
    await receive(domain, await payments.sendBackPayout(first!.id, "account_closed"));
    expect(await signalTitles(domain, admin)).toEqual([]);
    const told = await domain.notices.list(artisan.actor);

    clock.advance({ days: 30 });
    await receive(domain, await payments.sendBackPayout(second!.id, "account_closed"));

    expect(await signalTitles(domain, admin)).toEqual([
      "A second Payout sent back within 90 days: Sipho Dlamini",
    ]);
    // Only the send-back's own Tell.
    expect((await domain.notices.list(artisan.actor)).length).toBe(told.length + 1);
  });

  test("more than 90 days after the first raises nothing", async () => {
    const { domain, given, payments, clock } = await createHarness();
    const admin = await given.admin();
    const { artisan } = await releasedJob(given);
    await releasedJob(given, { artisan });
    clock.set(RUN_AT);
    await domain.system.runPayouts();
    const [first, second] = payoutsAsked(payments);
    await receive(domain, await payments.succeedPayout(first!.id));
    await receive(domain, await payments.succeedPayout(second!.id));
    await receive(domain, await payments.sendBackPayout(first!.id));
    clock.advance({ days: 91 });
    await receive(domain, await payments.sendBackPayout(second!.id));

    expect(await signalTitles(domain, admin)).toEqual([]);
  });
});

describe("a Client and an Artisan who transact", () => {
  test("sharing a device they signed in on raises a Signal at Hire, telling nobody", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const { client, artisan, quoteId } = await quotedJob(given);
    await signIn(domain, client, { ip: "203.0.113.1", device: "device-shared-1" });
    await signIn(domain, artisan, { ip: "203.0.113.2", device: "device-shared-1" });
    // Not yet: they do not transact.
    expect(await signalTitles(domain, admin)).toEqual([]);

    await given.hired(client, quoteId);

    expect(await signalTitles(domain, admin)).toEqual([
      "Thandi Mokoena and Sipho Dlamini share a device",
    ]);
    expect(await toldOfSignals(domain, [client, artisan])).toEqual([]);
  });

  test("sharing an IP, seen at a Payment, raises a Signal", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const { client, artisan, quoteId } = await quotedJob(given);
    await signIn(domain, artisan, { ip: "203.0.113.9", device: "device-artisan" });
    const opened = await domain.engagements.hire(client.actor, {
      quoteId,
      feeAcknowledged: true,
      ip: "203.0.113.9",
      device: "device-client",
    });
    if (!opened.ok) throw new Error(opened.refusal.message);
    await given.paid(collectionOf(opened.value.checkoutUrl));

    expect(await signalTitles(domain, admin)).toEqual([
      "Thandi Mokoena and Sipho Dlamini share an IP",
    ]);
  });

  test("sharing a device after Hire raises a Signal when it is seen", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const { client, artisan, quoteId } = await quotedJob(given);
    await given.hired(client, quoteId);
    await signIn(domain, client, { ip: "203.0.113.1", device: "device-shared-2" });
    expect(await signalTitles(domain, admin)).toEqual([]);

    await signIn(domain, artisan, { ip: "203.0.113.2", device: "device-shared-2" });

    expect(await signalTitles(domain, admin)).toEqual([
      "Thandi Mokoena and Sipho Dlamini share a device",
    ]);
  });

  test("an Artisan's Payout account in the Client's name raises a Signal at Hire", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    // The builder's Payout account is held by "S Dlamini".
    const { client, quoteId } = await quotedJob(given, { clientName: "S. Dlamini" });

    await given.hired(client, quoteId);

    expect(await signalTitles(domain, admin)).toEqual([
      "S. Dlamini and Sipho Dlamini share a Payout-account name",
    ]);
  });

  test("nothing shared raises nothing", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const { client, artisan, quoteId } = await quotedJob(given);
    await signIn(domain, client, { ip: "203.0.113.1", device: "device-client" });
    await signIn(domain, artisan, { ip: "203.0.113.2", device: "device-artisan" });

    await given.hired(client, quoteId);

    expect(await signalTitles(domain, admin)).toEqual([]);
  });

  test("the same finding raises one Signal; something new, once it is closed, another", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const { client, artisan, quoteId } = await quotedJob(given);
    await given.hired(client, quoteId);
    await signIn(domain, client, { ip: "203.0.113.1", device: "device-shared-3" });
    await signIn(domain, artisan, { ip: "203.0.113.2", device: "device-shared-3" });
    await signIn(domain, artisan, { ip: "203.0.113.3", device: "device-shared-3" });
    expect(await signalTitles(domain, admin)).toHaveLength(1);
    // Open, a new finding folds into it.
    await signIn(domain, client, { ip: "203.0.113.3", device: "device-client" });
    expect(await signalTitles(domain, admin)).toHaveLength(1);

    await decide(domain, admin, await onlySignal(domain, admin), { decision: "close" });
    // The same device again, closed: nothing.
    await signIn(domain, artisan, { ip: "203.0.113.4", device: "device-shared-3" });
    expect(await signalTitles(domain, admin)).toEqual([]);
    // A new one: raised again.
    await signIn(domain, client, { ip: "203.0.113.4", device: "device-client" });
    expect(await signalTitles(domain, admin)).toEqual([
      "Thandi Mokoena and Sipho Dlamini share a device and an IP",
    ]);
  });
});

describe("a new Account sharing a device or IP with a Suspended one", () => {
  test("raises a Signal when it signs in, telling nobody", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const suspended = await given.client({ name: "Lerato Khumalo" });
    await signIn(domain, suspended, { ip: "203.0.113.20", device: "device-old" });
    await suspend(domain, admin, suspended);
    const fresh = await given.client({ name: "Thandi Mokoena" });

    await signIn(domain, fresh, { ip: "203.0.113.21", device: "device-old" });

    expect(await signalTitles(domain, admin)).toEqual([
      "New Account Thandi Mokoena shares a device with Suspended Lerato Khumalo",
    ]);
    expect(await toldOfSignals(domain, [fresh, suspended])).toEqual([]);
  });

  test("raises a Signal when the Account it shares with is Suspended later", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const older = await given.client({ name: "Lerato Khumalo" });
    await signIn(domain, older, { ip: "203.0.113.26", device: "device-old" });
    const fresh = await given.client({ name: "Thandi Mokoena" });
    await signIn(domain, fresh, { ip: "203.0.113.27", device: "device-old" });
    expect(await signalTitles(domain, admin)).toEqual([]);

    await suspend(domain, admin, older);

    expect(await signalTitles(domain, admin)).toEqual([
      "New Account Thandi Mokoena shares a device with Suspended Lerato Khumalo",
    ]);
  });

  test("on an IP, an Artisan too", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const suspended = await given.artisan({ name: "Lerato Khumalo" });
    await signIn(domain, suspended, { ip: "203.0.113.22", device: "device-old" });
    await suspend(domain, admin, suspended);
    const fresh = await given.artisan({ name: "Sipho Dlamini" });

    await signIn(domain, fresh, { ip: "203.0.113.22", device: "device-new" });

    expect(await signalTitles(domain, admin)).toEqual([
      "New Account Sipho Dlamini shares an IP with Suspended Lerato Khumalo",
    ]);
  });

  test("raises nothing for an Account no longer new, or one never Suspended", async () => {
    const { domain, given, clock } = await createHarness();
    const admin = await given.admin();
    const suspended = await given.client({ name: "Lerato Khumalo" });
    const other = await given.client({ name: "Anele Nkosi" });
    await signIn(domain, suspended, { ip: "203.0.113.23", device: "device-old" });
    await signIn(domain, other, { ip: "203.0.113.24", device: "device-other" });
    const old = await given.client({ name: "Thandi Mokoena" });
    await suspend(domain, admin, suspended);
    // 30 days on, the Account is no longer new.
    clock.advance({ days: 31 });

    await signIn(domain, old, { ip: "203.0.113.25", device: "device-old" });
    const fresh = await given.client({ name: "Zola Mthembu" });
    await signIn(domain, fresh, { ip: "203.0.113.24", device: "device-other" });

    expect(await signalTitles(domain, admin)).toEqual([]);
  });
});

describe("repeated trouble", () => {
  test("an Artisan's third Cancellation or no-show in 90 days raises a Signal, telling nobody", async () => {
    const { domain, given, clock } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.matchableArtisan({ name: "Sipho Dlamini" });
    const first = await hiredJob(given, { artisan });
    await cancel(domain, first.artisan, first.engagementId);
    // A Client's Cancellation after Work started is not a no-show.
    const started = await hiredJob(given, { artisan });
    await given.workStarted(started.client, started.engagementId);
    await cancel(domain, started.client, started.engagementId);
    clock.advance({ days: 30 });
    const noShow = await hiredJob(given, { artisan });
    await cancel(domain, noShow.client, noShow.engagementId, "He never arrived.");
    expect(await signalTitles(domain, admin)).toEqual([]);

    clock.advance({ days: 30 });
    const third = await hiredJob(given, { artisan });
    await cancel(domain, third.artisan, third.engagementId);

    expect(await signalTitles(domain, admin)).toEqual([
      "Repeated Cancellations or no-shows: Sipho Dlamini",
    ]);
    expect(await toldOfSignals(domain, [artisan, third.client])).toEqual([]);
  });

  test("Cancellations spread over more than 90 days raise nothing", async () => {
    const { domain, given, clock } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.matchableArtisan();
    for (const _ of [1, 2, 3]) {
      const job = await hiredJob(given, { artisan });
      await cancel(domain, job.artisan, job.engagementId);
      clock.advance({ days: 46 });
    }

    expect(await signalTitles(domain, admin)).toEqual([]);
  });

  test("a Client's third Dispute in 90 days raises a Signal", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const client = await given.client({ name: "Thandi Mokoena" });
    for (const count of [1, 2, 3]) {
      expect(await signalTitles(domain, admin)).toEqual([]);
      const job = await hiredJob(given, { client });
      await given.workStarted(client, job.engagementId);
      await given.markedComplete(job.artisan, job.engagementId);
      const opened = await domain.engagements.dispute(client.actor, {
        engagementId: job.engagementId,
        amount: "500",
        reason: `The paint is patchy (${count}).`,
      });
      if (!opened.ok) throw new Error(opened.refusal.message);
    }

    expect(await signalTitles(domain, admin)).toEqual(["Repeated Disputes: Thandi Mokoena"]);
  });

  test("a Client's third Fix request in 90 days raises a Signal", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const client = await given.client({ name: "Thandi Mokoena" });
    const job = await hiredJob(given, { client });
    await given.workStarted(client, job.engagementId);
    for (const count of [1, 2, 3]) {
      expect(await signalTitles(domain, admin)).toEqual([]);
      await given.markedComplete(job.artisan, job.engagementId);
      const asked = await domain.engagements.requestFix(client.actor, {
        engagementId: job.engagementId,
        note: `The corner still shows (${count}).`,
      });
      if (!asked.ok) throw new Error(asked.refusal.message);
    }

    expect(await signalTitles(domain, admin)).toEqual(["Repeated Fix requests: Thandi Mokoena"]);
  });

  test("a Client's second Chargeback in 90 days raises a Signal", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const client = await given.client({ name: "Thandi Mokoena" });
    const first = await hiredJob(given, { client });
    const second = await hiredJob(given, { client });
    await given.chargedBack(first.collectionId);
    expect(await signalTitles(domain, admin)).toEqual([]);

    await given.chargedBack(second.collectionId);

    expect(await signalTitles(domain, admin)).toEqual(["Repeated Chargebacks: Thandi Mokoena"]);
  });
});

describe("one Account refused again and again on one Job", () => {
  const PHONE = "Call me on 082 555 1234 to sort it out.";

  test("raises a Signal at the third send the Content check refuses, telling nobody", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const { client, artisan, jobId } = await quotedJob(given);
    const [conversation] = (await domain.conversations.forJob(client.actor, { jobId }))!;
    const message = { conversationId: conversation!.conversationId, text: PHONE };
    expect(await domain.conversations.send(artisan.actor, message)).toMatchObject({
      ok: false,
      refusal: { reason: "content" },
    });
    expect(
      await domain.quotes.revise(artisan.actor, { ...QUOTE, jobId, scope: PHONE }),
    ).toMatchObject({
      ok: false,
    });
    expect(await signalTitles(domain, admin)).toEqual([]);

    await domain.conversations.send(artisan.actor, message);

    expect(await signalTitles(domain, admin)).toEqual([
      "Refused again and again on Paint the lounge: Sipho Dlamini",
    ]);
    expect(await toldOfSignals(domain, [client, artisan])).toEqual([]);
  });

  test("a Draft whose posting was refused may still be discarded", async () => {
    const { domain, given } = await createHarness();
    const client = await given.client();
    const jobId = await given.jobDraft(client, { description: PHONE });
    expect(await domain.jobs.post(client.actor, { jobId })).toMatchObject({ ok: false });

    expect(await domain.jobs.discard(client.actor, { jobId })).toMatchObject({ ok: true });
  });

  test("refusals on different Jobs, or of different Accounts, raise nothing", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const { client, artisan, jobId } = await quotedJob(given);
    const otherJobId = await given.openJob(client, { title: "Paint the kitchen" });
    await given.sentQuote(artisan, otherJobId);
    const [onOne] = (await domain.conversations.forJob(client.actor, { jobId }))!;
    const [onOther] = (await domain.conversations.forJob(client.actor, { jobId: otherJobId }))!;

    for (const [party, conversation] of [
      [artisan, onOne],
      [artisan, onOther],
      [client, onOne],
      [client, onOther],
    ] as const) {
      await domain.conversations.send(party.actor, {
        conversationId: conversation!.conversationId,
        text: PHONE,
      });
    }

    expect(await signalTitles(domain, admin)).toEqual([]);
  });
});

describe("the Admin", () => {
  test("reads what was found, and whom it names, each linked to the People page", async () => {
    const { domain, given, clock } = await createHarness();
    const admin = await given.admin();
    const { client, artisan, itemId } = await sharedPair(given, domain, admin, clock);

    const item = await domain.queues.item(admin.actor, { itemId });

    expect(item).toMatchObject({
      queue: "signals",
      title: "Thandi Mokoena and Sipho Dlamini share a device",
      tabs: [
        {
          key: "signal",
          label: "What was found",
          blocks: [
            {
              kind: "text",
              text: "A Client and an Artisan who transact share a device, an IP, or a Payout-account name.",
            },
            { kind: "text", text: "Both were seen on the device …ared-9." },
          ],
        },
      ],
    });
    expect(item!.sidebar.map((section) => section.title)).toEqual([
      "Client",
      "Artisan",
      "Artisan record",
    ]);
    expect(item!.sidebar[0]!.blocks).toContainEqual({
      kind: "link",
      label: "Open on the People page",
      href: `/admin/people/${client.actor.accountId}`,
    });
    expect(item!.decisions.map((decision) => [decision.key, decision.told])).toEqual([
      ["close", "Nobody"],
      ["warn", "The Account chosen, with the reason"],
      ["suspend", "The Account chosen, with the reason"],
      ["hold", "The Artisan chosen"],
    ]);
    const options = (key: string) =>
      item!.decisions.find((decision) => decision.key === key)!.fields[0]!.options;
    expect(options("warn")).toEqual([
      { value: client.actor.accountId, label: "Thandi Mokoena (Client)" },
      { value: artisan.actor.accountId, label: "Sipho Dlamini (Artisan)" },
    ]);
    expect(options("hold")).toEqual([
      { value: artisan.actor.accountId, label: "Sipho Dlamini (Artisan)" },
    ]);
  });

  test("closes a Signal, telling nobody", async () => {
    const { domain, given, clock } = await createHarness();
    const admin = await given.admin();
    const { client, artisan, itemId } = await sharedPair(given, domain, admin, clock);
    const before = await Promise.all(
      [client, artisan].map((party) => domain.notices.list(party.actor)),
    );

    await decide(domain, admin, itemId, { decision: "close", reason: "A shared family phone." });

    expect(await signalTitles(domain, admin)).toEqual([]);
    expect(
      await Promise.all([client, artisan].map((party) => domain.notices.list(party.actor))),
    ).toEqual(before);
    expect((await domain.admins.auditLog(admin.actor))!.rows[0]).toMatchObject({
      action: "queue.decided",
      summary:
        "Close: Thandi Mokoena and Sipho Dlamini share a device. Note: A shared family phone.",
    });
  });

  test("warns the Account chosen, telling only it", async () => {
    const { domain, given, clock } = await createHarness();
    const admin = await given.admin();
    const { client, artisan, itemId } = await sharedPair(given, domain, admin, clock);

    await decide(domain, admin, itemId, {
      decision: "warn",
      reason: "Paying yourself through the platform is not allowed.",
      fields: { account: artisan.actor.accountId },
    });

    expect(
      await domain.people.view(admin.actor, { accountId: artisan.actor.accountId }),
    ).toMatchObject({
      warnings: [
        { reason: "Paying yourself through the platform is not allowed.", leaving: false },
      ],
    });
    expect((await domain.notices.list(artisan.actor))[0]).toMatchObject({
      event: "account.warned",
    });
    expect((await domain.notices.list(client.actor)).map((notice) => notice.event)).not.toContain(
      "account.warned",
    );
  });

  test("suspends the Account chosen", async () => {
    const { domain, given, clock } = await createHarness();
    const admin = await given.admin();
    const { client, itemId } = await sharedPair(given, domain, admin, clock);

    await decide(domain, admin, itemId, {
      decision: "suspend",
      reason: "Hiring yourself.",
      fields: { account: client.actor.accountId },
    });

    expect(
      await domain.people.view(admin.actor, { accountId: client.actor.accountId }),
    ).toMatchObject({
      suspended: { reason: "Hiring yourself." },
    });
    expect((await domain.notices.list(client.actor))[0]).toMatchObject({
      event: "account.suspended",
    });
  });

  test("holds an Artisan's Payouts, and only an Artisan's", async () => {
    const { domain, given, clock } = await createHarness();
    const admin = await given.admin();
    const { client, artisan, itemId } = await sharedPair(given, domain, admin, clock);

    expect(
      await domain.queues.decide(admin.actor, {
        itemId,
        decision: "hold",
        fields: { account: client.actor.accountId },
      }),
    ).toMatchObject({ ok: false, refusal: { reason: "invalid" } });
    await decide(domain, admin, itemId, {
      decision: "hold",
      fields: { account: artisan.actor.accountId },
    });

    expect((await domain.payouts.mine(artisan.actor))?.held).toBe(true);
    expect((await domain.notices.list(artisan.actor))[0]).toMatchObject({ event: "payouts.held" });
  });
});

/**
 * A Client and an Artisan who signed in on one device, and then transact:
 * the Signal's item.
 */
async function sharedPair(
  given: Harness["given"],
  domain: Harness["domain"],
  admin: { actor: AdminActor },
  clock: Harness["clock"],
) {
  const { client, artisan, quoteId } = await quotedJob(given);
  await signIn(domain, client, { ip: "203.0.113.1", device: "device-shared-9" });
  await signIn(domain, artisan, { ip: "203.0.113.2", device: "device-shared-9" });
  await given.hired(client, quoteId);
  const items = (await domain.queues.home(admin.actor, { queue: "signals" }))!.items;
  // So what the Admin's decision writes comes after, newest first.
  clock.advance({ minutes: 1 });
  return { client, artisan, itemId: items[0]!.id };
}

/** The Quote the builder sends, as fields a revision gives whole. */
const QUOTE = {
  scope: "Prepare and paint two walls with two coats of washable white.",
  labour: "1500",
  materials: "500",
  materialsBy: "artisan" as const,
  startOn: "2026-11-02",
  durationDays: 3,
  warranty: "Twelve months on peeling.",
};

/** The titles of the open Signals, oldest first. */
async function signalTitles(domain: Harness["domain"], admin: { actor: AdminActor }) {
  const home = await domain.queues.home(admin.actor, { queue: "signals" });
  return home!.items.map((item) => item.title);
}

/**
 * A Hired Job whose Client marked Work started, releasing R500 of Materials:
 * R450 owed to the Artisan. The Artisan is made verified unless one is given.
 */
async function releasedJob(
  given: Harness["given"],
  { artisan }: { artisan?: Awaited<ReturnType<Harness["given"]["matchableArtisan"]>> } = {},
) {
  const client = await given.client();
  const hiredArtisan = artisan ?? (await given.matchableArtisan({ name: "Sipho Dlamini" }));
  const jobId = await given.openJob(client);
  const quoteId = await given.sentQuote(hiredArtisan, jobId);
  await given.hired(client, quoteId);
  const engagementId = await given.engagementOf(client, jobId);
  await given.workStarted(client, engagementId);
  return { client, artisan: hiredArtisan, jobId, engagementId };
}

/** Every Payout the run asked the payment adapter for, oldest first. */
function payoutsAsked(payments: FakePayments): CreatePayout[] {
  return payments.calls
    .filter((call) => call.operation === "createPayout")
    .map((call) => call.input as CreatePayout);
}

async function receive(
  domain: Harness["domain"],
  webhook: Parameters<Harness["domain"]["system"]["receivePaymentEvent"]>[0],
) {
  const received = await domain.system.receivePaymentEvent(webhook);
  if (!received.ok) throw new Error(received.refusal.message);
}

/** A Client's Open Job, with a Sent Quote from a verified Artisan. */
async function quotedJob(given: Harness["given"], { clientName }: { clientName?: string } = {}) {
  const client = await given.client(clientName ? { name: clientName } : {});
  const artisan = await given.matchableArtisan({ name: "Sipho Dlamini" });
  const jobId = await given.openJob(client);
  const quoteId = await given.sentQuote(artisan, jobId);
  return { client, artisan, jobId, quoteId };
}

type Party = { actor: AccountActor; email: string; password: string };

/** The Account signs in again from the device and IP given. */
async function signIn(
  domain: Harness["domain"],
  party: Party,
  seen: { ip: string; device: string },
) {
  const signedIn = await domain.accounts.signIn(
    { kind: "visitor" },
    { email: party.email, password: party.password, ...seen },
  );
  if (!signedIn.ok) throw new Error(signedIn.refusal.message);
}

/** Every Tell the parties had that names a Signal. */
async function toldOfSignals(domain: Harness["domain"], parties: { actor: Actor }[]) {
  const notices = await Promise.all(parties.map((party) => domain.notices.list(party.actor)));
  return notices.flat().filter((notice) => /signal|share/i.test(`${notice.event} ${notice.title}`));
}

/** The one open Signal's item. */
async function onlySignal(domain: Harness["domain"], admin: { actor: AdminActor }) {
  const items = (await domain.queues.home(admin.actor, { queue: "signals" }))!.items;
  expect(items).toHaveLength(1);
  return items[0]!.id;
}

async function decide(
  domain: Harness["domain"],
  admin: { actor: AdminActor },
  itemId: string,
  choice: { decision: string; reason?: string; fields?: Record<string, string> },
) {
  const decided = await domain.queues.decide(admin.actor, { itemId, ...choice });
  if (!decided.ok) throw new Error(decided.refusal.message);
}

/** The Admin suspends the Account from the People page. */
async function suspend(domain: Harness["domain"], admin: { actor: AdminActor }, party: Party) {
  const suspended = await domain.people.suspend(admin.actor, {
    accountId: party.actor.accountId,
    reason: "Abuse.",
  });
  if (!suspended.ok) throw new Error(suspended.refusal.message);
}

/**
 * A Job Hired from a Sent Quote: the Client's and Artisan's given, or new
 * ones. Its Engagement and its Payment's collection.
 */
async function hiredJob(
  given: Harness["given"],
  parties: { client?: Party; artisan?: Party } = {},
) {
  const client = parties.client ?? (await given.client());
  const artisan = parties.artisan ?? (await given.matchableArtisan());
  const jobId = await given.openJob(client);
  // Starting after any day the tests move to.
  const quoteId = await given.sentQuote(artisan, jobId, { startOn: "2027-06-01" });
  const collectionId = await given.hired(client, quoteId);
  const engagementId = await given.engagementOf(client, jobId);
  return { client, artisan, jobId, engagementId, collectionId };
}

async function cancel(
  domain: Harness["domain"],
  party: { actor: Actor },
  engagementId: string,
  reason?: string,
) {
  const cancelled = await domain.engagements.cancel(party.actor, { engagementId, reason });
  if (!cancelled.ok) throw new Error(cancelled.refusal.message);
}
