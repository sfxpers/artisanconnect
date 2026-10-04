import { describe, expect, test } from "vitest";
import { visitor } from "@/domain/actor";
import { createHarness } from "../support/harness";
import { createProbeHarness } from "../support/probe";

// A Tell is an in-app notice plus one email naming the event and linking back,
// with no message text, never to the actor. "Told" means the notice was written.

describe("a Tell", () => {
  test("puts a notice in the Account's Notices stream", async () => {
    const { domain, given, clock } = await createHarness();
    const { actor } = await given.client();

    await domain.marketplaceRules.publish((await given.admin()).actor, {
      summary: "Fees are now shown in bold.",
    });

    expect(await domain.notices.list(actor)).toEqual([
      {
        id: expect.any(String),
        event: "marketplace-rules-changed",
        title: "The Marketplace rules have changed",
        link: "/rules",
        toldAt: clock.now(),
      },
    ]);
  });

  test("sends one email naming the event and linking back, with no message text", async () => {
    const { domain, given, mailer } = await createHarness();
    const { email } = await given.client();
    const sentBefore = mailer.sentTo(email).length;

    await domain.marketplaceRules.publish((await given.admin()).actor, {
      summary: "Fees are now shown in bold.",
    });

    const sent = mailer.sentTo(email).slice(sentBefore);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toBe("The Marketplace rules have changed");
    expect(sent[0]!.text).toContain("https://artisanconnect.test/rules");
    expect(sent[0]!.text).not.toContain("Fees are now shown in bold.");
  });

  test("goes to every Account, and not to a sign-up whose Email is not proven", async () => {
    const { domain, given, mailer } = await createHarness();
    const client = await given.client();
    const artisan = await given.artisan();
    const rules = await domain.marketplaceRules.current(visitor);
    await domain.accounts.signUp(visitor, {
      kind: "client",
      name: "Not Yet",
      email: "pending@example.com",
      password: "correct horse battery",
      rulesVersion: rules.version,
      consentsToDataUse: true,
      ip: "203.0.113.9",
    });

    await domain.marketplaceRules.publish((await given.admin()).actor, { summary: "Version 2." });

    expect(await domain.notices.list(client.actor)).toHaveLength(1);
    expect(await domain.notices.list(artisan.actor)).toHaveLength(1);
    expect(mailer.sentTo("pending@example.com")).toHaveLength(1); // only its Email code
  });

  test("is never sent to the actor", async () => {
    const { domain, given } = await createProbeHarness();
    const { actor } = await given.client();

    await domain.probe.poke(actor, { accountId: actor.accountId });

    expect(await domain.notices.list(actor)).toEqual([]);
  });

  test("whose email fails is still told, and the every-minute run sends the email", async () => {
    const { domain, given, mailer, clock } = await createProbeHarness();
    const poker = await given.artisan();
    const poked = await given.client();
    const sentBefore = mailer.sentTo(poked.email).length;

    mailer.failNextSend();
    await domain.probe.poke(poker.actor, { accountId: poked.actor.accountId });

    expect(await domain.notices.list(poked.actor)).toHaveLength(1);
    expect(mailer.sentTo(poked.email)).toHaveLength(sentBefore);

    clock.advance({ minutes: 1 });
    await domain.system.runDueClocks();
    await domain.system.runDueClocks();

    expect(mailer.sentTo(poked.email).slice(sentBefore)).toMatchObject([
      { subject: "You were poked" },
    ]);
  });
});

describe("the Notices stream", () => {
  test("shows an Account its own notices, newest first", async () => {
    const { domain, given, clock } = await createProbeHarness();
    const poker = await given.artisan();
    const poked = await given.client();
    const bystander = await given.client();

    await domain.probe.poke(poker.actor, { accountId: poked.actor.accountId });
    clock.advance({ minutes: 5 });
    await domain.marketplaceRules.publish((await given.admin()).actor, { summary: "Version 2." });

    expect((await domain.notices.list(poked.actor)).map((notice) => notice.event)).toEqual([
      "marketplace-rules-changed",
      "probe.poked",
    ]);
    expect((await domain.notices.list(bystander.actor)).map((notice) => notice.event)).toEqual([
      "marketplace-rules-changed",
    ]);
  });

  test("is empty for a Visitor", async () => {
    const { domain } = await createHarness();

    expect(await domain.notices.list(visitor)).toEqual([]);
  });
});
