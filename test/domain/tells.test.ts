import { describe, expect, test } from "vitest";
import { visitor } from "@/domain/actor";
import { createHarness, type Harness } from "../support/harness";

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
    });

    await domain.marketplaceRules.publish((await given.admin()).actor, { summary: "Version 2." });

    expect(await domain.notices.list(client.actor)).toHaveLength(1);
    expect(await domain.notices.list(artisan.actor)).toHaveLength(1);
    expect(mailer.sentTo("pending@example.com")).toHaveLength(1); // only its Email code
  });

  test("is never sent to the actor", async () => {
    const { domain, given } = await createHarness();
    const { client, conversationId } = await talking(given, domain);

    await domain.conversations.send(client.actor, { conversationId, text: "Monday?" });

    expect((await domain.notices.list(client.actor)).map((notice) => notice.event)).toEqual([
      "quote.sent",
    ]);
  });

  test("whose email fails is still told, and the every-minute run sends the email", async () => {
    const { domain, given, mailer, clock } = await createHarness();
    const { artisan, client, conversationId } = await talking(given, domain);
    const sentBefore = mailer.sentTo(client.email).length;

    mailer.failNextSend();
    await domain.conversations.send(artisan.actor, { conversationId, text: "Monday suits me." });

    expect(await domain.notices.list(client.actor)).toContainEqual(
      expect.objectContaining({ event: "message.new" }),
    );
    expect(mailer.sentTo(client.email)).toHaveLength(sentBefore);

    clock.advance({ minutes: 1 });
    await domain.system.runDueClocks();
    await domain.system.runDueClocks();

    expect(mailer.sentTo(client.email).slice(sentBefore)).toMatchObject([
      { subject: expect.stringMatching(/^New message on /) },
    ]);
  });
});

describe("the Notices stream", () => {
  test("shows an Account its own notices, newest first", async () => {
    const { domain, given, clock } = await createHarness();
    const { client } = await talking(given, domain);
    const bystander = await given.client();

    clock.advance({ minutes: 5 });
    await domain.marketplaceRules.publish((await given.admin()).actor, { summary: "Version 2." });

    expect((await domain.notices.list(client.actor)).map((notice) => notice.event)).toEqual([
      "marketplace-rules-changed",
      "quote.sent",
    ]);
    expect((await domain.notices.list(bystander.actor)).map((notice) => notice.event)).toEqual([
      "marketplace-rules-changed",
    ]);
  });

  test("is empty for a Visitor", async () => {
    const { domain } = await createHarness();

    expect(await domain.notices.list(visitor)).toEqual([]);
    expect(await domain.notices.unread(visitor)).toBe(0);
  });

  test("counts as unread what was told since the Account last opened it", async () => {
    const { domain, given, clock } = await createHarness();
    const { actor } = await given.client();
    const admin = await given.admin();
    const publish = (summary: string) => domain.marketplaceRules.publish(admin.actor, { summary });

    await publish("Version 2.");
    clock.advance({ minutes: 1 });
    await publish("Version 3.");
    expect(await domain.notices.unread(actor)).toBe(2);

    await domain.notices.seen(actor);
    expect(await domain.notices.unread(actor)).toBe(0);

    clock.advance({ minutes: 1 });
    await publish("Version 4.");
    expect(await domain.notices.unread(actor)).toBe(1);
  });
});

/** A Client and an Artisan whose Sent Quote opened a Conversation. */
async function talking(given: Harness["given"], domain: Harness["domain"]) {
  const artisan = await given.matchableArtisan();
  const client = await given.client();
  const jobId = await given.openJob(client);
  await given.sentQuote(artisan, jobId);
  const [conversation] = (await domain.conversations.forJob(client.actor, { jobId }))!;
  return { artisan, client, conversationId: conversation!.conversationId };
}
