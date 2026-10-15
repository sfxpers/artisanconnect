import { describe, expect, test } from "vite-plus/test";
import { visitor } from "@/domain/shared/actor";
import { createHarness, type Harness } from "../support/harness";

const IP = "203.0.113.7";

async function signUp(
  { domain }: Harness,
  details: Partial<Parameters<Harness["domain"]["accounts"]["signUp"]>[1]> = {},
) {
  const rules = await domain.marketplaceRules.current(visitor);
  return domain.accounts.signUp(visitor, {
    kind: "client",
    name: "Thandi Mokoena",
    email: "thandi@example.com",
    password: "correct horse battery",
    rulesVersion: rules.version,
    consentsToDataUse: true,
    ...details,
  });
}

describe("signing up", () => {
  test("takes a password of 15 characters or more, and refuses a shorter one saying so", async () => {
    const harness = await createHarness();

    expect(await signUp(harness, { password: "fourteen chars" })).toMatchObject({
      ok: false,
      refusal: { reason: "invalid", message: "Use at least 15 characters." },
    });
    expect(await signUp(harness, { password: "fifteen chars!!" })).toMatchObject({ ok: true });
  });

  test("a Client proves the Email with an Email code and lands ready to post a Job", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;

    expect(await signUp(harness)).toMatchObject({ ok: true });
    const confirmed = await domain.accounts.confirmEmail(visitor, {
      email: "thandi@example.com",
      code: given.codeSentTo("thandi@example.com"),
      ip: IP,
    });

    if (!confirmed.ok) throw new Error(confirmed.refusal.message);
    expect(await domain.accounts.me(confirmed.value.actor)).toMatchObject({
      kind: "client",
      name: "Thandi Mokoena",
      email: "thandi@example.com",
      nextStep: "post-first-job",
    });
  });

  test("an Artisan lands at Verification", async () => {
    const { domain, given } = await createHarness();

    const { actor } = await given.artisan();

    expect(await domain.accounts.me(actor)).toMatchObject({
      kind: "artisan",
      nextStep: "verification",
    });
  });

  test("an Email held by any Account is refused, whatever its case and kind", async () => {
    const harness = await createHarness();
    const { domain, clock } = harness;
    const held = await harness.given.artisan({ email: "sipho@example.com" });
    clock.advance({ minutes: 1 });

    await signUp(harness, {
      kind: "client",
      email: "Sipho@Example.com",
      password: "a different password",
    });

    expect(await domain.accounts.me(held.actor)).toMatchObject({ kind: "artisan" });
    expect(
      await domain.accounts.signIn(visitor, {
        email: "sipho@example.com",
        password: "a different password",
        ip: IP,
      }),
    ).toMatchObject({ ok: false, refusal: { reason: "wrong-credentials" } });
  });

  test("answers alike whether or not the Email is held, and tells a held one by email", async () => {
    const harness = await createHarness();
    const { clock, mailer } = harness;
    await harness.given.artisan({ email: "sipho@example.com" });
    clock.advance({ minutes: 1 });

    const held = await signUp(harness, { email: "sipho@example.com" });
    const free = await signUp(harness, { email: "free@example.com" });

    expect(held).toEqual({ ok: true, value: { email: "sipho@example.com" } });
    expect(free).toEqual({ ok: true, value: { email: "free@example.com" } });
    const told = mailer.sentTo("sipho@example.com").at(-1)!;
    expect(told.subject).toBe("Someone tried to sign up with your Email");
    expect(told.text).toContain("https://artisanconnect.test/sign-in");
    expect(told.text).not.toMatch(/\b\d{6}\b/);
  });

  test("a sign-up whose Email is not yet proven holds nothing, and once its code has stopped working a new sign-up replaces it", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    await signUp(harness, { kind: "artisan", name: "Someone Else" });
    harness.clock.advance({ minutes: 11 });

    await signUp(harness, { kind: "client", name: "Thandi Mokoena" });
    const confirmed = await domain.accounts.confirmEmail(visitor, {
      email: "thandi@example.com",
      code: given.codeSentTo("thandi@example.com"),
      ip: IP,
    });

    if (!confirmed.ok) throw new Error(confirmed.refusal.message);
    expect(await domain.accounts.me(confirmed.value.actor)).toMatchObject({
      kind: "client",
      name: "Thandi Mokoena",
    });
  });

  test("a sign-up whose code still works is not replaced", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    await signUp(harness, { kind: "client", name: "Thandi Mokoena" });
    const code = given.codeSentTo("thandi@example.com");
    harness.clock.advance({ minutes: 2 });

    const refused = await signUp(harness, { kind: "artisan", name: "Someone Else" });
    const confirmed = await domain.accounts.confirmEmail(visitor, {
      email: "thandi@example.com",
      code,
      ip: IP,
    });

    expect(refused).toMatchObject({ ok: false, refusal: { reason: "sign-up-waiting" } });
    if (!confirmed.ok) throw new Error(confirmed.refusal.message);
    expect(await domain.accounts.me(confirmed.value.actor)).toMatchObject({
      kind: "client",
      name: "Thandi Mokoena",
    });
  });
});

describe("an Email code", () => {
  async function sentCode() {
    const harness = await createHarness();
    await signUp(harness);
    const code = harness.given.codeSentTo("thandi@example.com");
    const confirm = (withCode: string) =>
      harness.domain.accounts.confirmEmail(visitor, {
        email: "thandi@example.com",
        code: withCode,
        ip: IP,
      });
    const resend = () =>
      harness.domain.accounts.resendCode(visitor, { email: "thandi@example.com" });
    return { ...harness, code, confirm, resend };
  }

  test("works once", async () => {
    const { code, confirm } = await sentCode();

    expect(await confirm(code)).toMatchObject({ ok: true });
    expect(await confirm(code)).toMatchObject({ ok: false, refusal: { reason: "wrong-code" } });
  });

  test.each([
    [9, { ok: true }],
    [11, { ok: false, refusal: { reason: "code-expired" } }],
  ])("works for ten minutes: after %i, it is %o", async (minutes, outcome) => {
    const { code, confirm, clock } = await sentCode();

    clock.advance({ minutes });

    expect(await confirm(code)).toMatchObject(outcome);
  });

  test.each([
    [4, { ok: true }],
    [5, { ok: false, refusal: { reason: "code-used-up" } }],
  ])("dies after five wrong tries: after %i, it is %o", async (tries, outcome) => {
    const { code, confirm } = await sentCode();
    const wrong = code === "000000" ? "111111" : "000000";

    for (let i = 0; i < tries; i++) {
      expect(await confirm(wrong)).toMatchObject({ refusal: { reason: "wrong-code" } });
    }

    expect(await confirm(code)).toMatchObject(outcome);
  });

  test("cannot be replaced within 60 seconds", async () => {
    const { resend, clock } = await sentCode();

    clock.advance({ minutes: 0.5 });

    expect(await resend()).toMatchObject({ ok: false, refusal: { reason: "wait" } });
  });

  test("is replaced by a new one after 60 seconds, and stops working", async () => {
    const { code, confirm, resend, clock, given, mailer } = await sentCode();
    clock.advance({ minutes: 1 });

    expect(await resend()).toMatchObject({ ok: true });
    const newCode = given.codeSentTo("thandi@example.com");

    expect(mailer.sentTo("thandi@example.com")).toHaveLength(2);
    if (newCode !== code) {
      // oxlint-disable-next-line vitest/no-conditional-expect -- a new code may by chance be the old one.
      expect(await confirm(code)).toMatchObject({ refusal: { reason: "wrong-code" } });
    }
    expect(await confirm(newCode)).toMatchObject({ ok: true });
  });

  test("is never sent to an Email an Account has already proven", async () => {
    const { domain, given, mailer, clock } = await createHarness();
    await given.client({ email: "held@example.com" });
    clock.advance({ minutes: 2 });

    const resent = await domain.accounts.resendCode(visitor, { email: "held@example.com" });

    expect(resent).toMatchObject({ ok: true });
    expect(mailer.sentTo("held@example.com")).toHaveLength(1);
  });
});

/** What a browser sends back after the Set-Cookie headers it was given. */
function cookieHeader(setCookies: string[]): string {
  return setCookies.map((cookie) => cookie.split(";")[0]).join("; ");
}

describe("signing in", () => {
  test("an Account signs in with its Email and password, and its session acts as it", async () => {
    const { domain, given } = await createHarness();
    const { actor, email, password } = await given.client();

    const signedIn = await domain.accounts.signIn(visitor, { email, password, ip: IP });

    if (!signedIn.ok) throw new Error(signedIn.refusal.message);
    expect(signedIn.value.actor).toEqual(actor);
    expect(
      await domain.accounts.whoIs(visitor, { cookie: cookieHeader(signedIn.value.cookies) }),
    ).toMatchObject({ actor });
  });

  test("a wrong password and an unknown Email are refused alike", async () => {
    const { domain, given } = await createHarness();
    const { email } = await given.client();

    const wrongPassword = await domain.accounts.signIn(visitor, {
      email,
      password: "not the password",
      ip: IP,
    });
    const unknownEmail = await domain.accounts.signIn(visitor, {
      email: "nobody@example.com",
      password: "not the password",
      ip: IP,
    });

    expect(wrongPassword).toMatchObject({ ok: false, refusal: { reason: "wrong-credentials" } });
    expect(unknownEmail).toEqual(wrongPassword);
  });

  test("a sign-up must prove its Email before it signs in", async () => {
    const harness = await createHarness();
    await signUp(harness);

    const refused = await harness.domain.accounts.signIn(visitor, {
      email: "thandi@example.com",
      password: "correct horse battery",
      ip: IP,
    });

    expect(refused).toMatchObject({ ok: false, refusal: { reason: "email-not-proven" } });
  });

  test("a signed-out session no longer acts as the Account", async () => {
    const { domain, given } = await createHarness();
    const { actor, cookies } = await given.client();

    await domain.accounts.signOut(actor, { cookie: cookieHeader(cookies) });

    expect(await domain.accounts.whoIs(visitor, { cookie: cookieHeader(cookies) })).toMatchObject({
      actor: visitor,
    });
  });

  test("no session is a Visitor", async () => {
    const { domain } = await createHarness();

    expect(await domain.accounts.whoIs(visitor, { cookie: null })).toEqual({
      actor: visitor,
      cookies: [],
    });
  });
});

describe("recovery", () => {
  test("answers the same whether or not the Email is held, and sends a code only to a held one", async () => {
    const { domain, given, mailer, clock } = await createHarness();
    const { email } = await given.client();
    clock.advance({ minutes: 1 });
    const sentBefore = mailer.sent.length;

    const held = await domain.accounts.requestRecovery(visitor, { email });
    const notHeld = await domain.accounts.requestRecovery(visitor, {
      email: "nobody@example.com",
    });

    expect(held).toEqual({ ok: true, value: { email } });
    expect(notHeld).toEqual({ ok: true, value: { email: "nobody@example.com" } });
    expect(mailer.sent.slice(sentBefore).map((sent) => sent.to)).toEqual([email]);
  });

  test("sets a new password with the Email code, and the old one stops working", async () => {
    const { domain, given, clock } = await createHarness();
    const { email, password } = await given.client();
    clock.advance({ minutes: 1 });
    await domain.accounts.requestRecovery(visitor, { email });

    const recovered = await domain.accounts.recover(visitor, {
      email,
      code: given.codeSentTo(email),
      password: "a brand new password",
    });

    expect(recovered).toMatchObject({ ok: true });
    expect(await domain.accounts.signIn(visitor, { email, password, ip: IP })).toMatchObject({
      refusal: { reason: "wrong-credentials" },
    });
    expect(
      await domain.accounts.signIn(visitor, { email, password: "a brand new password", ip: IP }),
    ).toMatchObject({ ok: true });
  });

  test("refuses a wrong code alike for a held and an unheld Email", async () => {
    const { domain, given, clock } = await createHarness();
    const { email } = await given.client();
    clock.advance({ minutes: 1 });
    await domain.accounts.requestRecovery(visitor, { email });
    const wrong = given.codeSentTo(email) === "000000" ? "111111" : "000000";

    const held = await domain.accounts.recover(visitor, {
      email,
      code: wrong,
      password: "a brand new password",
    });
    const notHeld = await domain.accounts.recover(visitor, {
      email: "nobody@example.com",
      code: wrong,
      password: "a brand new password",
    });

    expect(held).toMatchObject({ ok: false, refusal: { reason: "wrong-code" } });
    expect(notHeld).toEqual(held);
  });
});

describe("rate limits", () => {
  test("stop a run of sign-in tries at one Email, from any IP, for 15 minutes", async () => {
    const { domain, given, clock } = await createHarness();
    const { email, password } = await given.client();
    for (let i = 0; i < 10; i++) {
      await domain.accounts.signIn(visitor, {
        email,
        password: "a wrong guess",
        ip: `192.0.2.${i}`,
      });
    }

    expect(await domain.accounts.signIn(visitor, { email, password, ip: IP })).toMatchObject({
      ok: false,
      refusal: { reason: "slow-down" },
    });
    clock.advance({ minutes: 15 });
    expect(await domain.accounts.signIn(visitor, { email, password, ip: IP })).toMatchObject({
      ok: true,
    });
  });
});

describe("the Marketplace rules", () => {
  test("are accepted at sign-up, with the version and time recorded", async () => {
    const { domain, given, clock } = await createHarness();

    const { actor } = await given.client();

    expect(await domain.accounts.me(actor)).toMatchObject({
      rules: { version: 1, acceptedAt: clock.now() },
    });
  });

  test("need POPIA consent at sign-up", async () => {
    const harness = await createHarness();

    const refused = await signUp(harness, { consentsToDataUse: false as true });

    expect(refused).toMatchObject({ ok: false, refusal: { reason: "invalid" } });
  });

  test("must be the current version at sign-up", async () => {
    const harness = await createHarness();
    await harness.domain.marketplaceRules.publish((await harness.given.admin()).actor, {
      summary: "Version 2.",
    });

    const refused = await signUp(harness, { rulesVersion: 1 });

    expect(refused).toMatchObject({ ok: false, refusal: { reason: "rules-changed" } });
  });

  test("are published only by the Admin", async () => {
    const { domain, given } = await createHarness();
    const { actor } = await given.client();

    const refused = await domain.marketplaceRules.publish(actor, { summary: "Version 2." });

    expect(refused).toMatchObject({ ok: false, refusal: { reason: "admin-only" } });
    expect(await domain.marketplaceRules.current(actor)).toMatchObject({ version: 1 });
  });

  test("once changed, must be accepted before signing in", async () => {
    const { domain, given } = await createHarness();
    const { email, password, actor } = await given.artisan();
    await domain.marketplaceRules.publish((await given.admin()).actor, { summary: "Version 2." });

    const refused = await domain.accounts.signIn(visitor, { email, password, ip: IP });

    expect(refused).toMatchObject({ ok: false, refusal: { reason: "accept-rules" } });
    expect(await domain.accounts.me(actor)).toMatchObject({ rules: { version: 1 } });
  });

  test("changed while a sign-up proves its Email, must be accepted before signing in", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    await signUp(harness);
    await domain.marketplaceRules.publish((await given.admin()).actor, { summary: "Version 2." });

    const confirmed = await domain.accounts.confirmEmail(visitor, {
      email: "thandi@example.com",
      code: given.codeSentTo("thandi@example.com"),
      ip: IP,
    });
    const signedIn = await domain.accounts.signIn(visitor, {
      email: "thandi@example.com",
      password: "correct horse battery",
      ip: IP,
      acceptsRules: { rulesVersion: 2, consentsToDataUse: true },
    });

    expect(confirmed).toMatchObject({ ok: false, refusal: { reason: "accept-rules" } });
    expect(signedIn).toMatchObject({ ok: true });
  });

  test("once changed, are accepted at sign-in, with the version and time recorded", async () => {
    const { domain, given, clock } = await createHarness();
    const { email, password, actor } = await given.artisan();
    await domain.marketplaceRules.publish((await given.admin()).actor, { summary: "Version 2." });
    clock.advance({ days: 3 });

    const signedIn = await domain.accounts.signIn(visitor, {
      email,
      password,
      ip: IP,
      acceptsRules: { rulesVersion: 2, consentsToDataUse: true },
    });

    expect(signedIn).toMatchObject({ ok: true });
    expect(await domain.accounts.me(actor)).toMatchObject({
      rules: { version: 2, acceptedAt: clock.now() },
    });
  });

  test("are listed for the Admin newest first, with the Accounts that accepted each last", async () => {
    const { domain, given, clock } = await createHarness();
    const admin = await given.admin();
    const stays = await given.client();
    const accepts = await given.artisan();
    // A sign-up that never proved its Email is no Account yet.
    const rules = await domain.marketplaceRules.current(visitor);
    await domain.accounts.signUp(visitor, {
      kind: "client",
      name: "Lindiwe Dube",
      email: "unproven@example.com",
      password: "correct horse battery",
      rulesVersion: rules.version,
      consentsToDataUse: true,
    });
    clock.advance({ days: 1 });
    await domain.marketplaceRules.publish(admin.actor, { summary: "Fees are now shown in bold." });
    const published = clock.now();
    await domain.accounts.signIn(visitor, {
      email: accepts.email,
      password: accepts.password,
      ip: IP,
      acceptsRules: { rulesVersion: 2, consentsToDataUse: true },
    });

    expect(await domain.marketplaceRules.versions(admin.actor)).toEqual({
      accounts: 2,
      versions: [
        {
          version: 2,
          summary: "Fees are now shown in bold.",
          publishedAt: published,
          acceptedLastBy: 1,
        },
        {
          version: 1,
          summary: expect.any(String),
          publishedAt: expect.any(Date),
          acceptedLastBy: 1,
        },
      ],
    });
    expect(await domain.marketplaceRules.versions(stays.actor)).toBeNull();
  });
});

describe("one person's Client and Artisan Accounts", () => {
  test("hold different Emails and share nothing: kind, sign-in, Jobs, or Notices", async () => {
    const { domain, given } = await createHarness();
    const name = "Thandi Mokoena";
    const asClient = await given.client({ name, email: "thandi@example.com" });
    const asArtisan = await given.artisan({ name, email: "thandi.builds@example.com" });
    const jobId = await given.openJob(asClient);

    expect(await domain.accounts.me(asClient.actor)).toMatchObject({
      kind: "client",
      email: "thandi@example.com",
    });
    expect(await domain.accounts.me(asArtisan.actor)).toMatchObject({
      kind: "artisan",
      email: "thandi.builds@example.com",
    });
    expect(asArtisan.actor.accountId).not.toBe(asClient.actor.accountId);
    expect(await domain.jobs.view(asArtisan.actor, { jobId })).toBeNull();
    expect(await domain.jobs.mine(asArtisan.actor)).toBeNull();
    expect(await domain.notices.list(asArtisan.actor)).toEqual([]);
  });
});

describe("a shown name", () => {
  test.each([
    ["the first word and last initial", { name: "Thandi Nomsa Mokoena" }, "Thandi M."],
    [
      "its trading name, when it has one",
      { name: "Thandi Mokoena", tradingName: "Bayside Guesthouse" },
      "Bayside G.",
    ],
    ["a one-word name whole", { name: "Thandi" }, "Thandi"],
  ])("shows a Client to Artisans by %s", async (_, names, shown) => {
    const { domain, given } = await createHarness();
    const client = await given.client(names);
    const artisan = await given.artisan();

    expect(
      await domain.accounts.shownName(artisan.actor, { accountId: client.actor.accountId }),
    ).toBe(shown);
  });

  test("shows an Artisan to anyone by its public name", async () => {
    const { domain, given } = await createHarness();
    const named = await given.artisan({ name: "Sipho Dlamini" });
    const trading = await given.artisan({ name: "Ayesha Patel", tradingName: "Patel Plumbing" });

    expect(await domain.accounts.shownName(visitor, { accountId: named.actor.accountId })).toBe(
      "Sipho Dlamini",
    );
    expect(await domain.accounts.shownName(visitor, { accountId: trading.actor.accountId })).toBe(
      "Patel Plumbing",
    );
  });

  test("shows a Client to no Visitor and no other Client", async () => {
    const { domain, given } = await createHarness();
    const client = await given.client();
    const other = await given.client();

    expect(await domain.accounts.shownName(visitor, { accountId: client.actor.accountId })).toBe(
      null,
    );
    expect(
      await domain.accounts.shownName(other.actor, { accountId: client.actor.accountId }),
    ).toBe(null);
  });
});
