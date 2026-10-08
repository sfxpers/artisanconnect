import { describe, expect, test } from "vitest";
import { createHarness } from "../support/harness";

// The People page (#136): the Admin finds an Account and acts on it directly.

describe("finding people", () => {
  test("by name or Email, Clients and Artisans alike, with where each stands", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const client = await given.client({ name: "Thandi Mokoena", email: "thandi@example.com" });
    await given.artisan({ name: "Sipho Dlamini" });
    await domain.people.suspend(admin.actor, {
      accountId: client.actor.accountId,
      reason: "Fraud.",
    });

    expect(await domain.people.find(admin.actor, { query: "thandi@" })).toEqual([
      {
        accountId: client.actor.accountId,
        kind: "client",
        name: "Thandi Mokoena",
        email: "thandi@example.com",
        suspended: true,
      },
    ]);
    expect(
      (await domain.people.find(admin.actor, { query: "dlamini" }))?.map((p) => p.name),
    ).toEqual(["Sipho Dlamini"]);
  });

  test("is the Admin's only", async () => {
    const { domain, given } = await createHarness();
    const client = await given.client();

    expect(await domain.people.find(client.actor, { query: "a" })).toBeNull();
    expect(
      await domain.people.view(client.actor, { accountId: client.actor.accountId }),
    ).toBeNull();
  });
});

describe("one person's page", () => {
  test("shows an Artisan's warnings, Suspensions, Payout hold, and Artisan record", async () => {
    const { domain, given, clock } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.artisan({ name: "Sipho Dlamini" });
    const accountId = artisan.actor.accountId;
    await domain.people.warn(admin.actor, { accountId, reason: "Rude." });
    clock.advance({ minutes: 1 });
    await domain.people.suspend(admin.actor, { accountId, reason: "Abuse." });
    clock.advance({ minutes: 1 });
    await domain.people.lift(admin.actor, { accountId });
    await domain.payouts.hold(admin.actor, { artisanId: accountId });

    expect(await domain.people.view(admin.actor, { accountId })).toEqual({
      accountId,
      kind: "artisan",
      name: "Sipho Dlamini",
      email: artisan.email,
      signedUpAt: expect.any(Date),
      suspended: null,
      warnings: [{ reason: "Rude.", leaving: false, at: expect.any(Date) }],
      suspensions: [
        {
          reason: "Abuse.",
          leaving: false,
          bySystem: false,
          since: expect.any(Date),
          liftedAt: expect.any(Date),
        },
      ],
      payoutsHeld: true,
      artisanRecord: expect.objectContaining({ cancelledByArtisan: 0, cancellations: [] }),
    });
  });

  test("shows a Client's Suspension while it stands, and no Artisan record", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const client = await given.client();
    await domain.people.suspend(admin.actor, {
      accountId: client.actor.accountId,
      reason: "Fraud.",
    });

    expect(
      await domain.people.view(admin.actor, { accountId: client.actor.accountId }),
    ).toMatchObject({
      kind: "client",
      suspended: { reason: "Fraud.", since: expect.any(Date) },
      payoutsHeld: false,
      artisanRecord: null,
    });
  });
});
