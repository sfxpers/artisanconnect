import { env } from "cloudflare:test";
import { describe, expect, test } from "vitest";
import type { Actor, AdminActor } from "@/domain/actor";
import type { CreatePayout } from "@/domain/ports";
import type { FakePayments } from "@/domain/fakes/payments";
import { formatRands } from "@/domain/money";
import { formatDay } from "@/domain/sa-days";
import { createHarness, type Harness } from "../support/harness";
import { decideCheck, payoutAccount, submit, verificationItem } from "../support/verification";

// The daily Payout run (#128): once a day, at one South African time, every
// Release owed to an Artisan with a current Payout account and no Payout
// hold is sent as a Payout, after a check that the float can cover the run.

/** The run's time in the tests: 10:00 in South Africa on the fake clock's first day. */
const RUN_AT = new Date("2026-10-05T08:00:00Z");

describe("the daily Payout run", () => {
  test("waits for its time of day", async () => {
    const { domain, given, payments } = await createHarness();
    await releasedJob(given);

    // The fake clock starts at 08:00 in South Africa.
    expect(await domain.system.runPayouts()).toEqual({ ran: false });
    expect(payoutsAsked(payments)).toEqual([]);
  });

  test("sends each Release owed as one Payout to the current Payout account", async () => {
    const { domain, given, payments, clock } = await createHarness();
    await releasedJob(given);
    clock.set(RUN_AT);

    expect(await domain.system.runPayouts()).toEqual({ ran: true, sent: 1, floatShort: false });

    const [payout] = payoutsAsked(payments);
    expect(payout).toEqual({
      id: expect.any(String),
      // R500 of Materials, less the 10% Artisan Fee.
      amountCents: 45_000,
      bankAccount: {
        accountHolder: "S Dlamini",
        accountNumber: expect.stringMatching(/^62\d{8}$/),
        branchCode: "470010",
      },
      beneficiaryReference: `AC ${payout!.id.replaceAll("-", "").slice(0, 16).toUpperCase()}`,
    });
    expect(payout!.beneficiaryReference.length).toBeLessThanOrEqual(20);
  });

  test("runs once a day, and sends each Release once", async () => {
    const { domain, given, payments, clock } = await createHarness();
    const { artisan } = await releasedJob(given);
    clock.set(RUN_AT);
    await domain.system.runPayouts();

    clock.advance({ hours: 3 });
    expect(await domain.system.runPayouts()).toEqual({ ran: false });

    // The next day a second Release is owed; only it goes.
    clock.advance({ hours: 18 });
    await releasedJob(given, { artisan });
    clock.advance({ hours: 3 });
    expect(await domain.system.runPayouts()).toEqual({ ran: true, sent: 1, floatShort: false });
    expect(payoutsAsked(payments)).toHaveLength(2);
    expect(await domain.system.runPayouts()).toEqual({ ran: false });
  });

  test("a run missed at its time runs the first minute after it", async () => {
    const { domain, given, payments, clock } = await createHarness();
    await releasedJob(given);
    clock.set(new Date("2026-10-05T19:30:00Z"));

    expect(await domain.system.runPayouts()).toMatchObject({ ran: true, sent: 1 });
    expect(payoutsAsked(payments)).toHaveLength(1);
  });

  test("an Artisan with no current Payout account waits", async () => {
    const { domain, given, payments, clock } = await createHarness();
    const admin = await given.admin();
    const { artisan } = await releasedJob(given);
    await removePayoutAccount(domain, admin, artisan.actor.accountId);
    clock.set(RUN_AT);

    expect(await domain.system.runPayouts()).toEqual({ ran: true, sent: 0, floatShort: false });
    expect(payoutsAsked(payments)).toEqual([]);
    expect((await domain.payouts.mine(artisan.actor))?.releases).toMatchObject([
      { state: "waiting", waitingFor: "payout-account" },
    ]);
  });

  test("a run that fails part-way retries the rest later that day, checking the float once", async () => {
    const { domain, given, payments, mailer, clock } = await createHarness();
    const admin = await given.admin();
    const { artisan } = await releasedJob(given);
    await releasedJob(given, { artisan });
    payments.setFloat(10_000);
    const createPayout = payments.createPayout;
    let asked = 0;
    payments.createPayout = async (payout) => {
      asked += 1;
      if (asked === 2) throw new Error("The provider did not answer");
      return createPayout(payout);
    };
    clock.set(RUN_AT);
    await expect(domain.system.runPayouts()).rejects.toThrow(/1 Payouts did not go/);
    payments.createPayout = createPayout;

    clock.advance({ minutes: 1 });
    expect(await domain.system.runPayouts()).toEqual({ ran: true, sent: 0, floatShort: true });
    expect(
      (await domain.payouts.mine(artisan.actor))?.releases.map((release) => release.state),
    ).toEqual(["sent", "sent"]);
    expect(new Set(payoutsAsked(payments).map((payout) => payout.id)).size).toBe(2);

    // The day's run is done: a later minute does nothing, and the float email went once.
    clock.advance({ minutes: 1 });
    expect(await domain.system.runPayouts()).toEqual({ ran: false });
    expect(
      mailer.sentTo(admin.email).filter((email) => email.subject.includes("float")),
    ).toHaveLength(1);
  });

  test("a run that fails part-way sends a Release it never created a Payout for later that day", async () => {
    const { domain, given, clock } = await createHarness();
    const { artisan, engagementId } = await releasedJob(given);
    clock.set(RUN_AT);
    await env.DB.prepare(
      "CREATE TRIGGER no_payouts BEFORE INSERT ON payouts BEGIN SELECT RAISE(ABORT, 'no'); END",
    ).run();
    await expect(domain.system.runPayouts()).rejects.toThrow(/1 Payouts did not go/);
    await env.DB.prepare("DROP TRIGGER no_payouts").run();

    clock.advance({ minutes: 5 });
    expect(await domain.system.runPayouts()).toEqual({ ran: true, sent: 1, floatShort: false });
    expect((await domain.payouts.mine(artisan.actor))?.releases).toMatchObject([{ state: "sent" }]);
    expect(await ledgerRows(engagementId, "payout.created")).toHaveLength(1);
  });
});

describe("a Payout refused or sent back", () => {
  test("refused at sending leaves the Release standing and owed, and the account not current", async () => {
    const { domain, given, payments, clock } = await createHarness();
    const { artisan, engagementId } = await releasedJob(given);
    payments.refuseNextPayout("invalid_check_digit");
    clock.set(RUN_AT);
    await domain.system.runPayouts();

    expect(await domain.payouts.mine(artisan.actor)).toMatchObject({
      unpaidCents: 45_000,
      paidCents: 0,
      releases: [{ state: "refused", waitingFor: "payout-account", amountCents: 45_000 }],
    });
    expect(slotOf(await domain.verification.mine(artisan.actor), "payout-account")).toMatchObject({
      state: "stopped",
    });
    expect(
      await domain.verification.verified(artisan.actor, {
        artisanId: artisan.actor.accountId,
        category: "painting",
      }),
    ).toBe(false);
    expect(await ledgerRows(engagementId, "%")).toEqual(
      expect.arrayContaining([
        { kind: "payout.refused", amount_cents: 45_000 },
        { kind: "release.artisan-fee", amount_cents: 5_000 },
      ]),
    );

    // It is not retried to that account.
    clock.advance({ days: 1 });
    expect(await domain.system.runPayouts()).toMatchObject({ ran: true, sent: 0 });
    expect(payoutsAsked(payments)).toHaveLength(1);
  });

  test("refused by the bank after sending is the same", async () => {
    const { domain, given, payments, clock } = await createHarness();
    const { artisan } = await releasedJob(given);
    clock.set(RUN_AT);
    await domain.system.runPayouts();
    const [payout] = payoutsAsked(payments);
    clock.advance({ hours: 2 });

    await receive(domain, await payments.failPayout(payout!.id, "inactive_account"));

    expect(await domain.payouts.mine(artisan.actor)).toMatchObject({
      unpaidCents: 45_000,
      releases: [{ state: "refused", waitingFor: "payout-account" }],
    });
    expect(slotOf(await domain.verification.mine(artisan.actor), "payout-account")).toMatchObject({
      state: "stopped",
    });
  });

  test("sent back days later makes the money owed again; the Artisan Fee is kept once", async () => {
    const { domain, given, payments, clock } = await createHarness();
    const admin = await given.admin();
    const { artisan, engagementId } = await releasedJob(given);
    clock.set(RUN_AT);
    await domain.system.runPayouts();
    const [payout] = payoutsAsked(payments);
    await receive(domain, await payments.succeedPayout(payout!.id));
    clock.advance({ days: 4 });

    await receive(domain, await payments.sendBackPayout(payout!.id, "account_closed"));

    expect(await domain.payouts.mine(artisan.actor)).toMatchObject({
      unpaidCents: 45_000,
      paidCents: 0,
      releases: [{ state: "sent-back", waitingFor: "payout-account" }],
    });
    expect((await domain.payouts.unpaid(admin.actor))?.[0]).toMatchObject({
      artisanId: artisan.actor.accountId,
      unpaidCents: 45_000,
    });
    expect(slotOf(await domain.verification.mine(artisan.actor), "payout-account")).toMatchObject({
      state: "stopped",
    });
    expect(await ledgerRows(engagementId, "release.artisan-fee")).toEqual([
      { kind: "release.artisan-fee", amount_cents: 5_000 },
    ]);
    expect(await ledgerRows(engagementId, "payout.sent-back")).toEqual([
      { kind: "payout.sent-back", amount_cents: 45_000 },
    ]);
  });

  test("tells the Artisan, naming the original Receipt, which stands", async () => {
    const { domain, given, payments, mailer, clock } = await createHarness();
    const { artisan } = await releasedJob(given);
    clock.set(RUN_AT);
    await domain.system.runPayouts();
    const [payout] = payoutsAsked(payments);
    await receive(domain, await payments.succeedPayout(payout!.id));
    const receipt = mailer.sentTo(artisan.email).at(-1)!;
    clock.advance({ days: 4 });

    await receive(domain, await payments.sendBackPayout(payout!.id));

    expect((await payoutNotices(domain, artisan.actor))[0]).toMatchObject({
      event: "payout.sent-back",
      title: `Your bank sent back a Payout of ${formatRands(45_000)}: Paint the lounge`,
      link: "/payouts",
    });
    const told = mailer.sentTo(artisan.email).at(-1)!;
    expect(told.subject).toBe(
      `Your bank sent back a Payout of ${formatRands(45_000)}: Paint the lounge`,
    );
    for (const line of [
      `Receipt ${payout!.beneficiaryReference} of ${formatDay("2026-10-05")}`,
      "That Receipt stands",
      "owed to you again",
      `Capitec account ending ${payout!.bankAccount.accountNumber.slice(-4)}`,
      "Verification",
    ]) {
      expect(told.text).toContain(line);
    }
    // The Receipt is never edited or withdrawn.
    expect(mailer.sentTo(artisan.email)).toContainEqual(receipt);
  });

  test("refused, tells the Artisan with the Payout's reference and no Receipt", async () => {
    const { domain, given, payments, mailer, clock } = await createHarness();
    const { artisan } = await releasedJob(given);
    payments.refuseNextPayout();
    clock.set(RUN_AT);

    await domain.system.runPayouts();

    const [payout] = payoutsAsked(payments);
    expect((await payoutNotices(domain, artisan.actor))[0]).toMatchObject({
      event: "payout.refused",
      title: `Your bank refused a Payout of ${formatRands(45_000)}: Paint the lounge`,
    });
    const told = mailer.sentTo(artisan.email).at(-1)!;
    expect(told.text).toContain(payout!.beneficiaryReference);
    expect(told.text).toContain("no Receipt");
  });

  test("happens once, however often its event comes", async () => {
    const { domain, given, payments, clock } = await createHarness();
    const { artisan, engagementId } = await releasedJob(given);
    clock.set(RUN_AT);
    await domain.system.runPayouts();
    const [payout] = payoutsAsked(payments);
    await receive(domain, await payments.succeedPayout(payout!.id));
    clock.advance({ days: 1 });
    const sentBack = await payments.sendBackPayout(payout!.id);

    await receive(domain, sentBack);
    await receive(domain, sentBack);

    expect((await payoutNotices(domain, artisan.actor)).map((notice) => notice.event)).toEqual([
      "payout.sent-back",
      "payout.paid",
    ]);
    expect(await ledgerRows(engagementId, "payout.sent-back")).toHaveLength(1);
  });

  test("every waiting Payout goes in the first daily run after the Admin accepts a new account", async () => {
    const { domain, given, payments, mailer, clock } = await createHarness();
    const admin = await given.admin();
    const { artisan, engagementId } = await releasedJob(given);
    clock.set(RUN_AT);
    await domain.system.runPayouts();
    const [first] = payoutsAsked(payments);
    await receive(domain, await payments.succeedPayout(first!.id));
    // A second Release is owed after the day's run.
    await releasedJob(given, { artisan });
    clock.advance({ hours: 2 });
    await receive(domain, await payments.sendBackPayout(first!.id));
    clock.advance({ days: 1 });
    expect(await domain.system.runPayouts()).toMatchObject({ ran: true, sent: 0 });

    const checkId = await submit(domain, artisan, payoutAccount({ accountNumber: "9876543210" }));
    const { id: itemId } = await verificationItem(domain, admin);
    const accepted = await decideCheck(domain, admin, { itemId, checkId }, "accept");
    if (!accepted.ok) throw new Error(accepted.refusal.message);
    expect(slotOf(await domain.verification.mine(artisan.actor), "payout-account")).toMatchObject({
      state: "accepted",
    });
    clock.advance({ days: 1 });

    expect(await domain.system.runPayouts()).toMatchObject({ ran: true, sent: 2 });
    const [again, second] = payoutsAsked(payments).slice(1);
    expect(
      [again, second].map((payout) => [payout!.amountCents, payout!.bankAccount.accountNumber]),
    ).toEqual([
      [45_000, "9876543210"],
      [45_000, "9876543210"],
    ]);

    // The Payout that lands gets its own Receipt.
    await receive(domain, await payments.succeedPayout(again!.id));
    expect(mailer.sentTo(artisan.email).at(-1)!.text).toContain(
      `Reference: ${again!.beneficiaryReference}`,
    );
    expect(await ledgerRows(engagementId, "release.artisan-fee")).toHaveLength(1);
    expect((await domain.payouts.mine(artisan.actor))?.releases).toMatchObject([
      { state: "sent" },
      {
        state: "paid",
        payouts: [
          { reference: again!.beneficiaryReference, state: "paid" },
          { reference: first!.beneficiaryReference, state: "sent-back" },
        ],
      },
    ]);
  });

  test("a Payout account the bank stopped cannot be sent again", async () => {
    const { domain, given, payments, clock } = await createHarness();
    const { artisan } = await releasedJob(given);
    payments.refuseNextPayout();
    clock.set(RUN_AT);
    await domain.system.runPayouts();
    const [payout] = payoutsAsked(payments);

    const again = await domain.verification.submit(
      artisan.actor,
      await payoutAccount({ accountNumber: payout!.bankAccount.accountNumber }),
    );

    expect(again).toMatchObject({ ok: false, refusal: { reason: "stopped" } });
  });

  test("a Payout never answered on the stopped account goes to the new one", async () => {
    const { domain, given, payments, clock } = await createHarness();
    const admin = await given.admin();
    const { artisan } = await releasedJob(given);
    clock.set(RUN_AT);
    await domain.system.runPayouts();
    const [paid] = payoutsAsked(payments);
    await receive(domain, await payments.succeedPayout(paid!.id));
    // The next day the provider never answers on a second Payout...
    await releasedJob(given, { artisan });
    const createPayout = payments.createPayout;
    payments.createPayout = async () => {
      throw new Error("The provider did not answer");
    };
    clock.advance({ days: 1 });
    await expect(domain.system.runPayouts()).rejects.toThrow(/1 Payouts did not go/);
    payments.createPayout = createPayout;
    // ...and the bank sends back the first, stopping the account.
    await receive(domain, await payments.sendBackPayout(paid!.id));

    const checkId = await submit(domain, artisan, payoutAccount({ accountNumber: "9876543210" }));
    const { id: itemId } = await verificationItem(domain, admin);
    await decideCheck(domain, admin, { itemId, checkId }, "accept");
    clock.advance({ days: 1 });

    expect(await domain.system.runPayouts()).toMatchObject({ ran: true, sent: 2 });
    expect(
      payoutsAsked(payments)
        .filter((payout) => payout.bankAccount.accountNumber === "9876543210")
        .map((payout) => payout.amountCents),
    ).toEqual([45_000, 45_000]);
    expect(
      (await domain.payouts.mine(artisan.actor))?.releases.map((release) => release.state),
    ).toEqual(["sent", "sent"]);
  });

  test("a Payout the provider had, though its answer was lost, is not sent again", async () => {
    const { domain, given, payments, clock } = await createHarness();
    const admin = await given.admin();
    const { artisan } = await releasedJob(given);
    clock.set(RUN_AT);
    await domain.system.runPayouts();
    const [paid] = payoutsAsked(payments);
    await receive(domain, await payments.succeedPayout(paid!.id));
    await releasedJob(given, { artisan });
    // The provider takes the second Payout, but its answer never arrives.
    const createPayout = payments.createPayout;
    payments.createPayout = async (payout) => {
      await createPayout(payout);
      throw new Error("The answer was lost");
    };
    clock.advance({ days: 1 });
    await expect(domain.system.runPayouts()).rejects.toThrow(/1 Payouts did not go/);
    payments.createPayout = createPayout;
    const [, taken] = payoutsAsked(payments);
    await receive(domain, await payments.sendBackPayout(paid!.id));
    const checkId = await submit(domain, artisan, payoutAccount({ accountNumber: "9876543210" }));
    const { id: itemId } = await verificationItem(domain, admin);
    await decideCheck(domain, admin, { itemId, checkId }, "accept");
    clock.advance({ days: 1 });

    expect(await domain.system.runPayouts()).toMatchObject({ ran: true, sent: 1 });
    expect(
      payoutsAsked(payments)
        .filter((payout) => payout.bankAccount.accountNumber === "9876543210")
        .map((payout) => payout.amountCents),
    ).toEqual([45_000]);
    // It stands as the provider has it, and is paid as any other.
    await receive(domain, await payments.succeedPayout(taken!.id));
    expect(
      (await domain.payouts.mine(artisan.actor))?.releases.map((release) => release.state),
    ).toEqual(["paid", "sent"]);
  });

  test("a later Payout of the run is not sent to an account the bank refused earlier in it", async () => {
    const { domain, given, payments, clock } = await createHarness();
    const { artisan } = await releasedJob(given);
    await releasedJob(given, { artisan });
    payments.refuseNextPayout();
    clock.set(RUN_AT);

    expect(await domain.system.runPayouts()).toMatchObject({ ran: true, sent: 1 });

    expect(payoutsAsked(payments)).toHaveLength(1);
    expect(
      (await domain.payouts.mine(artisan.actor))?.releases.map((release) => release.state),
    ).toEqual(["waiting", "refused"]);
  });

  test("a Payout hold applies to the money sent back", async () => {
    const { domain, given, payments, clock } = await createHarness();
    const admin = await given.admin();
    const { artisan } = await releasedJob(given);
    const artisanId = artisan.actor.accountId;
    clock.set(RUN_AT);
    await domain.system.runPayouts();
    const [payout] = payoutsAsked(payments);
    await receive(domain, await payments.succeedPayout(payout!.id));
    await receive(domain, await payments.sendBackPayout(payout!.id));
    const checkId = await submit(domain, artisan, payoutAccount({ accountNumber: "9876543210" }));
    const { id: itemId } = await verificationItem(domain, admin);
    await decideCheck(domain, admin, { itemId, checkId }, "accept");
    await domain.payouts.hold(admin.actor, { artisanId });

    clock.advance({ days: 1 });
    expect(await domain.system.runPayouts()).toMatchObject({ sent: 0 });
    expect((await domain.payouts.mine(artisan.actor))?.releases).toMatchObject([
      { state: "sent-back", waitingFor: "hold" },
    ]);

    await domain.payouts.lift(admin.actor, { artisanId });
    clock.advance({ days: 1 });
    expect(await domain.system.runPayouts()).toMatchObject({ sent: 1 });
  });

  test("the Admin sees it in the Artisan's money history and the log, with no queue item", async () => {
    const { domain, given, payments, clock } = await createHarness();
    const admin = await given.admin();
    const { artisan } = await releasedJob(given);
    const artisanId = artisan.actor.accountId;
    clock.set(RUN_AT);
    await domain.system.runPayouts();
    const [payout] = payoutsAsked(payments);
    await receive(domain, await payments.succeedPayout(payout!.id));
    clock.advance({ days: 3 });
    await receive(domain, await payments.sendBackPayout(payout!.id, "account_closed"));

    expect(await domain.payouts.history(admin.actor, { artisanId })).toMatchObject({
      artisanId,
      name: "Sipho Dlamini",
      held: false,
      unpaidCents: 45_000,
      releases: [
        {
          state: "sent-back",
          payouts: [
            {
              reference: payout!.beneficiaryReference,
              state: "sent-back",
              amountCents: 45_000,
              reason: "account_closed",
              stoppedAt: clock.now(),
            },
          ],
        },
      ],
    });
    expect((await domain.admins.auditLog(admin.actor))!.rows[0]).toMatchObject({
      adminId: null,
      action: "payout.sent-back",
      summary: `The bank sent back the Payout ${payout!.beneficiaryReference} of ${formatRands(45_000)} to Sipho Dlamini; their Payout account is no longer current`,
      subjectId: artisanId,
    });
    const home = await domain.queues.home(admin.actor, {});
    expect(home?.items).toEqual([]);
  });

  test("the money history is the Admin's only to see", async () => {
    const { domain, given } = await createHarness();
    const { artisan } = await releasedJob(given);

    expect(
      await domain.payouts.history(artisan.actor, { artisanId: artisan.actor.accountId }),
    ).toBeNull();
  });
});

describe("a Payout hold", () => {
  test("is the Admin's: a held Artisan's Payouts wait, and go once it is lifted", async () => {
    const { domain, given, payments, clock } = await createHarness();
    const admin = await given.admin();
    const { artisan } = await releasedJob(given);
    const artisanId = artisan.actor.accountId;

    expect(await domain.payouts.hold(admin.actor, { artisanId })).toEqual({ ok: true, value: {} });
    clock.set(RUN_AT);
    expect(await domain.system.runPayouts()).toEqual({ ran: true, sent: 0, floatShort: false });
    expect(payoutsAsked(payments)).toEqual([]);
    expect(await domain.payouts.mine(artisan.actor)).toMatchObject({
      held: true,
      releases: [{ state: "waiting", waitingFor: "hold" }],
    });

    expect(await domain.payouts.lift(admin.actor, { artisanId })).toEqual({ ok: true, value: {} });
    clock.advance({ days: 1 });
    expect(await domain.system.runPayouts()).toMatchObject({ ran: true, sent: 1 });
    expect((await domain.payouts.mine(artisan.actor))?.held).toBe(false);
  });

  test("also stops a Payout the adapter never answered from being asked again", async () => {
    const { domain, given, payments, clock } = await createHarness();
    const admin = await given.admin();
    const { artisan } = await releasedJob(given);
    const artisanId = artisan.actor.accountId;
    const createPayout = payments.createPayout;
    payments.createPayout = async () => {
      throw new Error("The provider did not answer");
    };
    clock.set(RUN_AT);
    await expect(domain.system.runPayouts()).rejects.toThrow(/1 Payouts did not go/);
    payments.createPayout = createPayout;

    await domain.payouts.hold(admin.actor, { artisanId });
    clock.advance({ days: 1 });
    await domain.system.runPayouts();
    expect(payoutsAsked(payments)).toEqual([]);

    await domain.payouts.lift(admin.actor, { artisanId });
    clock.advance({ days: 1 });
    await domain.system.runPayouts();
    expect(payoutsAsked(payments)).toMatchObject([{ amountCents: 45_000 }]);
    expect((await domain.payouts.mine(artisan.actor))?.releases).toMatchObject([{ state: "sent" }]);
  });

  test("tells the Artisan, and is written to the audit log", async () => {
    const { domain, given, clock } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.verifiedArtisan({ name: "Sipho Dlamini" });
    const artisanId = artisan.actor.accountId;

    await domain.payouts.hold(admin.actor, { artisanId });
    clock.advance({ hours: 1 });
    await domain.payouts.lift(admin.actor, { artisanId });

    expect(
      (await domain.notices.list(artisan.actor)).filter((n) => n.link === "/payouts"),
    ).toMatchObject([
      { event: "payouts.hold-lifted", title: "Your Payouts are no longer held" },
      { event: "payouts.held", title: "Your Payouts are held by the Admin" },
    ]);
    expect(
      (await domain.admins.auditLog(admin.actor))!.rows.filter((row) =>
        row.action.startsWith("payouts."),
      ),
    ).toMatchObject([
      { action: "payouts.hold-lifted", summary: "Lifted the Payout hold on Sipho Dlamini" },
      { action: "payouts.held", summary: "Held the Payouts of Sipho Dlamini" },
    ]);
  });

  test("is placed once and lifted once", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.verifiedArtisan();
    const artisanId = artisan.actor.accountId;

    expect(await domain.payouts.lift(admin.actor, { artisanId })).toMatchObject({
      ok: false,
      refusal: { reason: "not-held" },
    });
    await domain.payouts.hold(admin.actor, { artisanId });
    expect(await domain.payouts.hold(admin.actor, { artisanId })).toMatchObject({
      ok: false,
      refusal: { reason: "already-held" },
    });
  });

  test("is only an Admin's to place, and only on an Artisan", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const client = await given.client();
    const artisan = await given.verifiedArtisan();

    expect(
      await domain.payouts.hold(artisan.actor, { artisanId: artisan.actor.accountId }),
    ).toMatchObject({ ok: false, refusal: { reason: "admin-only" } });
    expect(
      await domain.payouts.hold(admin.actor, { artisanId: client.actor.accountId }),
    ).toMatchObject({ ok: false, refusal: { reason: "not-found" } });
  });
});

describe("the float check", () => {
  test("a float that cannot cover the run emails every Admin and shows a banner until it can", async () => {
    const { domain, given, payments, mailer, clock } = await createHarness();
    const admin = await given.admin();
    const other = await given.admin({ email: "naledi@example.com" });
    await releasedJob(given);
    payments.setFloat(10_000);
    clock.set(RUN_AT);

    // The Payouts still go: the provider pauses what it cannot pay.
    expect(await domain.system.runPayouts()).toEqual({ ran: true, sent: 1, floatShort: true });
    expect(payoutsAsked(payments)).toHaveLength(1);

    for (const email of [admin.email, other.email]) {
      expect(mailer.sentTo(email).at(-1)).toMatchObject({
        subject: "The float cannot cover today's Payouts",
        text: expect.stringContaining(
          `The float holds ${formatRands(10_000)}, and today's Payouts need ${formatRands(45_000)}.`,
        ),
      });
    }
    expect(await domain.payouts.float(admin.actor)).toEqual({
      short: true,
      floatCents: 10_000,
      neededCents: 45_000,
      checkedAt: clock.now(),
    });

    payments.setFloat(1_000_000);
    expect(await domain.payouts.float(admin.actor)).toEqual({ short: false });
  });

  test("a float that covers the run emails nobody", async () => {
    const { domain, given, mailer, clock } = await createHarness();
    const admin = await given.admin();
    await releasedJob(given);
    clock.set(RUN_AT);

    await domain.system.runPayouts();

    expect(mailer.sentTo(admin.email).filter((email) => email.subject.includes("float"))).toEqual(
      [],
    );
    expect(await domain.payouts.float(admin.actor)).toEqual({ short: false });
  });

  test("counts the Payouts sent before and still unpaid", async () => {
    const { domain, given, payments, clock } = await createHarness();
    const admin = await given.admin();
    const { artisan } = await releasedJob(given);
    clock.set(RUN_AT);
    await domain.system.runPayouts();

    clock.advance({ hours: 20 });
    await releasedJob(given, { artisan });
    payments.setFloat(50_000);
    clock.advance({ hours: 4 });

    expect(await domain.system.runPayouts()).toMatchObject({ floatShort: true });
    expect(await domain.payouts.float(admin.actor)).toMatchObject({
      floatCents: 50_000,
      neededCents: 90_000,
    });
  });

  test("is the Admin's only to see", async () => {
    const { domain, given } = await createHarness();
    const artisan = await given.artisan();

    expect(await domain.payouts.float(artisan.actor)).toBeNull();
  });
});

describe("a Payout paid", () => {
  test("tells the Artisan, with a Receipt showing the Artisan Fee", async () => {
    const { domain, given, payments, mailer, clock } = await createHarness();
    const { artisan } = await releasedJob(given);
    clock.set(RUN_AT);
    await domain.system.runPayouts();
    const [payout] = payoutsAsked(payments);
    clock.advance({ hours: 2 });

    await receive(domain, await payments.succeedPayout(payout!.id));

    expect(await payoutNotices(domain, artisan.actor)).toEqual([
      expect.objectContaining({
        event: "payout.paid",
        title: `You were paid ${formatRands(45_000)}: Paint the lounge`,
      }),
    ]);
    const receipt = mailer.sentTo(artisan.email).at(-1)!;
    expect(receipt.subject).toBe(`You were paid ${formatRands(45_000)}: Paint the lounge`);
    for (const line of [
      "Receipt for your Payout on ArtisanConnect.",
      "Job: Paint the lounge",
      `Paid on: ${formatDay("2026-10-05")}`,
      `Reference: ${payout!.beneficiaryReference}`,
      `Paid to: Capitec account ending ${payout!.bankAccount.accountNumber.slice(-4)}`,
      `Materials released: ${formatRands(50_000)}`,
      `Artisan Fee (10%): ${formatRands(5_000)}`,
      `Paid to you: ${formatRands(45_000)}`,
      "This Receipt is not a tax invoice.",
    ]) {
      expect(receipt.text).toContain(line);
    }
  });

  test("is paid once, however often its event comes", async () => {
    const { domain, given, payments, clock } = await createHarness();
    const { artisan, engagementId } = await releasedJob(given);
    clock.set(RUN_AT);
    await domain.system.runPayouts();
    const [payout] = payoutsAsked(payments);
    const paid = await payments.succeedPayout(payout!.id);

    await receive(domain, paid);
    await receive(domain, paid);

    expect(await payoutNotices(domain, artisan.actor)).toHaveLength(1);
    expect(await ledgerRows(engagementId, "payout.%")).toEqual([
      { kind: "payout.created", amount_cents: 45_000 },
      { kind: "payout.owed", amount_cents: 45_000 },
      { kind: "payout.paid", amount_cents: 45_000 },
    ]);
  });
});

describe("a paused Payout", () => {
  test("stays unpaid with no Tell and no Receipt", async () => {
    const { domain, given, payments, mailer, clock } = await createHarness();
    const { artisan } = await releasedJob(given);
    clock.set(RUN_AT);
    await domain.system.runPayouts();
    const [payout] = payoutsAsked(payments);
    const emailed = mailer.sentTo(artisan.email).length;

    await receive(domain, await payments.pausePayout(payout!.id));

    expect(await payoutNotices(domain, artisan.actor)).toEqual([]);
    expect(mailer.sentTo(artisan.email)).toHaveLength(emailed);
    expect(await domain.payouts.mine(artisan.actor)).toMatchObject({
      unpaidCents: 45_000,
      paidCents: 0,
      releases: [{ state: "sent" }],
    });
  });

  test("after 3 days tells the Artisan it is delayed, not lost, and raises a Support request", async () => {
    const { domain, given, payments, clock } = await createHarness();
    const admin = await given.admin();
    const { artisan } = await releasedJob(given);
    clock.set(RUN_AT);
    await domain.system.runPayouts();
    const [payout] = payoutsAsked(payments);
    await receive(domain, await payments.pausePayout(payout!.id));

    clock.advance({ days: 3, minutes: -1 });
    await domain.system.runDueClocks();
    expect(await payoutNotices(domain, artisan.actor)).toEqual([]);

    clock.advance({ minutes: 1 });
    await domain.system.runDueClocks();
    expect(await payoutNotices(domain, artisan.actor)).toEqual([
      expect.objectContaining({
        event: "payout.delayed",
        title: `Your Payout of ${formatRands(45_000)} is delayed, not lost`,
      }),
    ]);
    expect((await domain.queues.home(admin.actor, { queue: "support" }))?.items).toMatchObject([
      { title: `Paused money: a Payout of ${formatRands(45_000)} to Sipho Dlamini` },
    ]);

    // Once the float is topped up, it is paid as any other.
    clock.advance({ hours: 1 });
    await receive(domain, await payments.succeedPayout(payout!.id));
    expect((await payoutNotices(domain, artisan.actor))[0]).toMatchObject({ event: "payout.paid" });
  });

  test("paid within 3 days raises nothing", async () => {
    const { domain, given, payments, clock } = await createHarness();
    const admin = await given.admin();
    const { artisan } = await releasedJob(given);
    clock.set(RUN_AT);
    await domain.system.runPayouts();
    const [payout] = payoutsAsked(payments);
    await receive(domain, await payments.pausePayout(payout!.id));
    clock.advance({ days: 1 });
    await receive(domain, await payments.succeedPayout(payout!.id));

    clock.advance({ days: 3 });
    await domain.system.runDueClocks();

    expect((await payoutNotices(domain, artisan.actor)).map((n) => n.event)).toEqual([
      "payout.paid",
    ]);
    expect((await domain.queues.home(admin.actor, { queue: "support" }))?.items).toEqual([]);
  });
});

describe("the Payouts view", () => {
  test("lists each Release, its Artisan Fee, the amount paid, and its state", async () => {
    const { domain, given, payments, clock } = await createHarness();
    const { artisan, jobId } = await releasedJob(given);

    expect(await domain.payouts.mine(artisan.actor)).toEqual({
      held: false,
      unpaidCents: 45_000,
      paidCents: 0,
      releases: [
        {
          releaseId: expect.any(String),
          jobId,
          jobTitle: "Paint the lounge",
          part: "materials",
          releasedAt: expect.any(Date),
          releasedCents: 50_000,
          artisanFeeCents: 5_000,
          amountCents: 45_000,
          state: "waiting",
          waitingFor: "next-run",
          reference: null,
          paidAt: null,
          payouts: [],
        },
      ],
    });

    clock.set(RUN_AT);
    await domain.system.runPayouts();
    const [payout] = payoutsAsked(payments);
    expect((await domain.payouts.mine(artisan.actor))?.releases).toMatchObject([
      { state: "sent", waitingFor: null, reference: payout!.beneficiaryReference, paidAt: null },
    ]);

    await receive(domain, await payments.succeedPayout(payout!.id));
    expect(await domain.payouts.mine(artisan.actor)).toMatchObject({
      unpaidCents: 0,
      paidCents: 45_000,
      releases: [{ state: "paid", paidAt: clock.now() }],
    });
  });

  test("is the Artisan's own", async () => {
    const { domain, given } = await createHarness();
    const { client } = await releasedJob(given);
    const other = await given.verifiedArtisan();

    expect(await domain.payouts.mine(client.actor)).toBeNull();
    expect(await domain.payouts.mine(other.actor)).toMatchObject({
      unpaidCents: 0,
      releases: [],
    });
  });
});

describe("the Admin's unpaid totals", () => {
  test("show each Artisan owed money, and each held one", async () => {
    const { domain, given, payments, clock } = await createHarness();
    const admin = await given.admin();
    const { artisan } = await releasedJob(given);
    await releasedJob(given, { artisan });
    const held = await given.verifiedArtisan({ name: "Lindiwe Khumalo" });
    await domain.payouts.hold(admin.actor, { artisanId: held.actor.accountId });

    expect(await domain.payouts.unpaid(admin.actor)).toEqual([
      {
        artisanId: artisan.actor.accountId,
        name: "Sipho Dlamini",
        email: artisan.email,
        unpaidCents: 90_000,
        held: false,
      },
      {
        artisanId: held.actor.accountId,
        name: "Lindiwe Khumalo",
        email: held.email,
        unpaidCents: 0,
        held: true,
      },
    ]);

    clock.set(RUN_AT);
    await domain.system.runPayouts();
    for (const payout of payoutsAsked(payments)) {
      await receive(domain, await payments.succeedPayout(payout.id));
    }
    expect((await domain.payouts.unpaid(admin.actor))?.map((row) => row.name)).toEqual([
      "Lindiwe Khumalo",
    ]);
  });

  test("are the Admin's only to see", async () => {
    const { domain, given } = await createHarness();
    const artisan = await given.artisan();

    expect(await domain.payouts.unpaid(artisan.actor)).toBeNull();
  });
});

/**
 * A Hired Job whose Client marked Work started, releasing R500 of Materials:
 * R450 owed to the Artisan after the 10% Artisan Fee. The Artisan is made
 * verified unless one is given.
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

/** What the Artisan was told of their Payouts, newest first. */
async function payoutNotices(domain: Harness["domain"], actor: Actor) {
  return (await domain.notices.list(actor)).filter((notice) => notice.event.startsWith("payout."));
}

/** The Admin removes the Artisan's accepted Payout account, found false. */
async function removePayoutAccount(
  domain: Harness["domain"],
  admin: { actor: AdminActor },
  artisanId: string,
) {
  const check = await env.DB.prepare(
    "SELECT id FROM verification_checks WHERE artisan_id = ? AND kind = 'payout-account'",
  )
    .bind(artisanId)
    .first<{ id: string }>();
  const item = await env.DB.prepare(
    "SELECT id FROM queue_items WHERE queue = 'verification' AND subject_id = ?",
  )
    .bind(artisanId)
    .first<{ id: string }>();
  const removed = await domain.queues.decideRow(admin.actor, {
    itemId: item!.id,
    rowId: check!.id,
    decision: "remove",
    reason: "The letter was not the Artisan's.",
  });
  if (!removed.ok) throw new Error(removed.refusal.message);
}

/** The Engagement's ledger rows of these kinds, by kind. */
async function ledgerRows(engagementId: string, kinds: string) {
  const { results } = await env.DB.prepare(
    "SELECT kind, amount_cents FROM ledger_entries WHERE engagement_id = ? AND kind LIKE ? ORDER BY kind",
  )
    .bind(engagementId, kinds)
    .all<{ kind: string; amount_cents: number }>();
  return results;
}

/** The Artisan's Verification slot of this kind. */
function slotOf(
  mine: Awaited<ReturnType<Harness["domain"]["verification"]["mine"]>>,
  kind: string,
) {
  return mine?.once.find((slot) => slot.kind === kind);
}
