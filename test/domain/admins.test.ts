import { describe, expect, test } from "vitest";
import { visitor } from "@/domain/actor";
import { createHarness, type Harness } from "../support/harness";

const IP = "203.0.113.7";

/** Signs in with the session's cookies, as the web app does on each request. */
async function whoIs({ domain }: Harness, cookies: string[]) {
  const cookie = cookies.map((set) => set.split(";")[0]).join("; ");
  return (await domain.accounts.whoIs(visitor, { cookie })).actor;
}

describe("setting up the first Admin", () => {
  test("makes a staff identity that signs in with an Email code", async () => {
    const { domain, given } = await createHarness();

    expect(await domain.system.setUpFirstAdmin({ email: "Naledi@Example.com" })).toMatchObject({
      ok: true,
      value: { email: "naledi@example.com" },
    });
    await domain.admins.requestSignInCode(visitor, { email: "naledi@example.com", ip: IP });
    const signedIn = await domain.admins.signIn(visitor, {
      email: "naledi@example.com",
      code: given.codeSentTo("naledi@example.com"),
      ip: IP,
    });

    if (!signedIn.ok) throw new Error(signedIn.refusal.message);
    expect(signedIn.value.actor).toEqual({ kind: "admin", adminId: expect.any(String) });
    expect(await domain.admins.me(signedIn.value.actor)).toEqual({
      adminId: signedIn.value.actor.adminId,
      email: "naledi@example.com",
    });
  });

  test("is refused once there is an Admin", async () => {
    const { domain, given } = await createHarness();
    await given.admin();

    expect(await domain.system.setUpFirstAdmin({ email: "second@example.com" })).toMatchObject({
      ok: false,
      refusal: { reason: "admin-exists" },
    });
  });

  test("refuses an Email an Account holds", async () => {
    const { domain, given } = await createHarness();
    const client = await given.client({ email: "thandi@example.com" });

    expect(await domain.system.setUpFirstAdmin({ email: "thandi@example.com" })).toMatchObject({
      ok: false,
      refusal: { reason: "held-by-account" },
    });
    expect(await domain.accounts.me(client.actor)).toMatchObject({ kind: "client" });
  });
});

describe("an Admin", () => {
  test("is not an Account", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const { actor, cookies } = await given.admin();

    expect(await whoIs(harness, cookies)).toEqual(actor);
    expect(await domain.accounts.me(actor)).toBeNull();
    expect(await domain.notices.list(actor)).toEqual([]);
  });

  test("signs in with an Email code only, never a password", async () => {
    const { domain, given, mailer, clock } = await createHarness();
    const { email } = await given.admin();
    const sentBefore = mailer.sentTo(email).length;
    clock.advance({ minutes: 1 });

    const recovery = await domain.accounts.requestRecovery(visitor, { email, ip: IP });
    const withPassword = await domain.accounts.signIn(visitor, {
      email,
      password: "anything at all",
      ip: IP,
    });

    // Recovery answers as for any Email, and sends nothing: there is no password.
    expect(recovery).toMatchObject({ ok: true });
    expect(mailer.sentTo(email)).toHaveLength(sentBefore);
    expect(withPassword).toMatchObject({ ok: false, refusal: { reason: "wrong-credentials" } });
  });

  test("whose Email code is wrong is not signed in", async () => {
    const { domain } = await createHarness();
    await domain.system.setUpFirstAdmin({ email: "naledi@example.com" });
    await domain.admins.requestSignInCode(visitor, { email: "naledi@example.com", ip: IP });

    expect(
      await domain.admins.signIn(visitor, { email: "naledi@example.com", code: "000000", ip: IP }),
    ).toMatchObject({ ok: false, refusal: { reason: "wrong-code" } });
  });

  test("is asked to wait 60 seconds before a new code", async () => {
    const { domain } = await createHarness();
    await domain.system.setUpFirstAdmin({ email: "naledi@example.com" });
    await domain.admins.requestSignInCode(visitor, { email: "naledi@example.com", ip: IP });

    expect(
      await domain.admins.requestSignInCode(visitor, { email: "naledi@example.com", ip: IP }),
    ).toMatchObject({ ok: false, refusal: { reason: "wait" } });
  });
});

describe("an Admin sign-in code", () => {
  test("goes only to an Admin, with the same answer for any Email", async () => {
    const { domain, given, mailer, clock } = await createHarness();
    const admin = await given.admin({ email: "naledi@example.com" });
    const client = await given.client({ email: "thandi@example.com" });
    const sentBefore = mailer.sent.length;
    clock.advance({ minutes: 1 });

    const toClient = await domain.admins.requestSignInCode(visitor, {
      email: client.email,
      ip: IP,
    });
    const toNobody = await domain.admins.requestSignInCode(visitor, {
      email: "nobody@example.com",
      ip: IP,
    });

    expect(toClient).toEqual({ ok: true, value: { email: "thandi@example.com" } });
    expect(toNobody).toEqual({ ok: true, value: { email: "nobody@example.com" } });
    expect(mailer.sent.slice(sentBefore)).toEqual([]);
    expect(admin.actor.kind).toBe("admin");
  });

  test("never signs in an Account", async () => {
    const { domain, given } = await createHarness();
    const client = await given.client({ email: "thandi@example.com" });

    // Only an Admin is sent one, so an Account has no code to enter.
    expect(
      await domain.admins.signIn(visitor, { email: client.email, code: "123456", ip: IP }),
    ).toMatchObject({ ok: false, refusal: { reason: "wrong-code" } });
  });
});

describe("inviting an Admin", () => {
  test("tells the address by email, and the invited Admin signs in there with a code", async () => {
    const { domain, given, mailer } = await createHarness();
    const { actor } = await given.admin();

    const invited = await domain.admins.invite(actor, { email: "Lerato@Example.com" });

    expect(invited).toMatchObject({ ok: true, value: { email: "lerato@example.com" } });
    const told = mailer.sentTo("lerato@example.com");
    expect(told).toHaveLength(1);
    expect(told[0]!.subject).toBe("You are invited to be an ArtisanConnect Admin");
    expect(told[0]!.text).toContain("https://artisanconnect.test/admin/sign-in");
    const lerato = await given.adminSignsIn("lerato@example.com");
    expect(await domain.admins.me(lerato.actor)).toMatchObject({ email: "lerato@example.com" });
  });

  test("whose email fails is still told, and the every-minute run sends it", async () => {
    const { domain, given, mailer, clock } = await createHarness();
    const { actor } = await given.admin();

    mailer.failNextSend();
    await domain.admins.invite(actor, { email: "lerato@example.com" });
    expect(mailer.sentTo("lerato@example.com")).toHaveLength(0);

    clock.advance({ minutes: 1 });
    await domain.system.runDueClocks();

    expect(mailer.sentTo("lerato@example.com")).toHaveLength(1);
  });

  test("refuses an Email an Account or an Admin holds", async () => {
    const { domain, given } = await createHarness();
    const { actor, email } = await given.admin();
    const client = await given.client();

    expect(await domain.admins.invite(actor, { email: client.email })).toMatchObject({
      ok: false,
      refusal: { reason: "held-by-account" },
    });
    expect(await domain.admins.invite(actor, { email })).toMatchObject({
      ok: false,
      refusal: { reason: "already-admin" },
    });
  });

  test("leaves the Email unable to sign up for an Account", async () => {
    const harness = await createHarness();
    const { domain, given, mailer } = harness;
    const { actor } = await given.admin();
    await domain.admins.invite(actor, { email: "lerato@example.com" });
    const rules = await domain.marketplaceRules.current(visitor);

    await domain.accounts.signUp(visitor, {
      kind: "client",
      name: "Lerato Khumalo",
      email: "lerato@example.com",
      password: "correct horse battery",
      rulesVersion: rules.version,
      consentsToDataUse: true,
      ip: IP,
    });

    expect(mailer.sentTo("lerato@example.com").at(-1)!.subject).toBe(
      "Someone tried to sign up with your Email",
    );
  });

  test("is done only by an Admin", async () => {
    const { domain, given } = await createHarness();
    await given.admin();
    const client = await given.client();

    expect(await domain.admins.invite(client.actor, { email: "x@example.com" })).toMatchObject({
      ok: false,
      refusal: { reason: "admin-only" },
    });
    expect(await domain.admins.invite(visitor, { email: "x@example.com" })).toMatchObject({
      ok: false,
      refusal: { reason: "admin-only" },
    });
  });
});

describe("removing an Admin", () => {
  test("ends its sign-in and every session", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const first = await given.admin();
    const second = await given.admin({ email: "lerato@example.com" });

    expect(await domain.admins.remove(first.actor, { adminId: second.actor.adminId })).toEqual({
      ok: true,
      value: { adminId: second.actor.adminId },
    });

    expect(await whoIs(harness, second.cookies)).toEqual(visitor);
    expect(await domain.admins.me(second.actor)).toBeNull();
    harness.clock.advance({ minutes: 1 });
    await domain.admins.requestSignInCode(visitor, { email: second.email, ip: IP });
    expect(
      harness.mailer.sentTo(second.email).filter((sent) => /sign-in code/.test(sent.subject)),
    ).toHaveLength(1); // only the one it signed in with before
  });

  test("is never the last Admin", async () => {
    const { domain, given } = await createHarness();
    const only = await given.admin();

    expect(await domain.admins.remove(only.actor, { adminId: only.actor.adminId })).toMatchObject({
      ok: false,
      refusal: { reason: "last-admin" },
    });
    expect(await domain.admins.list(only.actor)).toMatchObject([
      { adminId: only.actor.adminId, removable: false },
    ]);
  });

  test("leaves one Admin when the last two remove each other at once", async () => {
    const { domain, given } = await createHarness();
    const first = await given.admin();
    const second = await given.admin();

    const results = await Promise.all([
      domain.admins.remove(first.actor, { adminId: second.actor.adminId }),
      domain.admins.remove(second.actor, { adminId: first.actor.adminId }),
    ]);

    expect(results.filter((result) => !result.ok)).toMatchObject([
      { refusal: { reason: "last-admin" } },
    ]);
    const remaining = results[0]!.ok ? first : second;
    expect(await domain.admins.list(remaining.actor)).toHaveLength(1);
  });

  test("may remove itself while another Admin remains", async () => {
    const { domain, given } = await createHarness();
    const first = await given.admin();
    const second = await given.admin();

    await domain.admins.remove(second.actor, { adminId: second.actor.adminId });

    expect(await domain.admins.list(first.actor)).toMatchObject([
      { adminId: first.actor.adminId, removable: false, you: true },
    ]);
    expect(await domain.admins.remove(first.actor, { adminId: first.actor.adminId })).toMatchObject(
      { ok: false, refusal: { reason: "last-admin" } },
    );
  });

  test("frees its Email to be invited again", async () => {
    const { domain, given } = await createHarness();
    const first = await given.admin();
    const second = await given.admin({ email: "lerato@example.com" });
    await domain.admins.remove(first.actor, { adminId: second.actor.adminId });

    expect(await domain.admins.invite(first.actor, { email: "lerato@example.com" })).toMatchObject({
      ok: true,
    });
  });

  test("is done only by an Admin", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    await given.admin();
    const artisan = await given.artisan();

    expect(
      await domain.admins.remove(artisan.actor, { adminId: admin.actor.adminId }),
    ).toMatchObject({ ok: false, refusal: { reason: "admin-only" } });
  });
});

describe("the Admins list", () => {
  test("shows every Admin oldest first, with who invited it", async () => {
    const { domain, given, clock } = await createHarness();
    const first = await given.admin({ email: "naledi@example.com" });
    clock.advance({ minutes: 1 });
    await given.admin({ email: "lerato@example.com" });

    expect(await domain.admins.list(first.actor)).toEqual([
      {
        adminId: first.actor.adminId,
        email: "naledi@example.com",
        invitedAt: expect.any(Date),
        invitedBy: null,
        you: true,
        removable: true,
      },
      {
        adminId: expect.any(String),
        email: "lerato@example.com",
        invitedAt: expect.any(Date),
        invitedBy: "naledi@example.com",
        you: false,
        removable: true,
      },
    ]);
  });

  test("is shown to no one but an Admin", async () => {
    const { domain, given } = await createHarness();
    await given.admin();
    const client = await given.client();

    expect(await domain.admins.list(client.actor)).toBeNull();
    expect(await domain.admins.list(visitor)).toBeNull();
  });
});

describe("the audit log", () => {
  test("holds who invited and removed an Admin, and when", async () => {
    const { domain, given, clock } = await createHarness();
    const naledi = await given.admin({ email: "naledi@example.com" });
    await domain.admins.invite(naledi.actor, { email: "lerato@example.com" });
    const invitedAt = clock.now();
    const lerato = (await domain.admins.list(naledi.actor))!.find(
      (admin) => admin.email === "lerato@example.com",
    );
    clock.advance({ minutes: 5 });

    await domain.admins.remove(naledi.actor, { adminId: lerato!.adminId });

    expect((await domain.admins.auditLog(naledi.actor))!.rows).toEqual([
      {
        id: expect.any(String),
        at: clock.now(),
        adminId: naledi.actor.adminId,
        admin: "naledi@example.com",
        action: "admin.removed",
        summary: "Removed lerato@example.com as an Admin",
        subjectId: lerato!.adminId,
      },
      {
        id: expect.any(String),
        at: invitedAt,
        adminId: naledi.actor.adminId,
        admin: "naledi@example.com",
        action: "admin.invited",
        summary: "Invited lerato@example.com as an Admin",
        subjectId: lerato!.adminId,
      },
    ]);
  });

  test("holds who published a Marketplace rules version", async () => {
    const { domain, given } = await createHarness();
    const { actor } = await given.admin();

    await domain.marketplaceRules.publish(actor, { summary: "Fees are now shown in bold." });

    expect((await domain.admins.auditLog(actor))!.rows).toMatchObject([
      { action: "marketplace-rules.published", summary: "Published Marketplace rules version 2" },
    ]);
  });

  test("still names a removed Admin", async () => {
    const { domain, given, clock } = await createHarness();
    const first = await given.admin();
    const second = await given.admin({ email: "lerato@example.com" });
    clock.advance({ minutes: 1 });
    await domain.marketplaceRules.publish(second.actor, { summary: "Version 2." });
    clock.advance({ minutes: 1 });

    await domain.admins.remove(first.actor, { adminId: second.actor.adminId });

    expect((await domain.admins.auditLog(first.actor))!.rows).toMatchObject([
      { action: "admin.removed" },
      { action: "marketplace-rules.published", admin: "lerato@example.com" },
      { action: "admin.invited" },
    ]);
  });

  test("is read a page at a time, newest first", async () => {
    const { domain, given, clock } = await createHarness();
    const { actor } = await given.admin();
    for (let version = 2; version <= 102; version += 1) {
      clock.advance({ minutes: 1 });
      await domain.marketplaceRules.publish(actor, { summary: `Version ${version}.` });
    }

    const first = (await domain.admins.auditLog(actor))!;
    const second = (await domain.admins.auditLog(actor, { before: first.next! }))!;

    expect(first.rows).toHaveLength(100);
    expect(first.rows[0]!.summary).toBe("Published Marketplace rules version 102");
    expect(second).toMatchObject({
      rows: [{ summary: "Published Marketplace rules version 2" }],
      next: null,
    });
  });

  test("given a page that is not one, reads from the newest", async () => {
    const { domain, given } = await createHarness();
    const { actor } = await given.admin();
    await domain.marketplaceRules.publish(actor, { summary: "Version 2." });

    expect(await domain.admins.auditLog(actor, { before: "not-a-page" })).toMatchObject({
      rows: [{ action: "marketplace-rules.published" }],
      next: null,
    });
  });

  test("is read by no one but an Admin", async () => {
    const { domain, given } = await createHarness();
    await given.admin();
    const artisan = await given.artisan();

    expect(await domain.admins.auditLog(artisan.actor)).toBeNull();
  });
});

describe("no Tell reaches an Admin", () => {
  test("when the Marketplace rules change", async () => {
    const { domain, given, mailer } = await createHarness();
    const { actor, email } = await given.admin();
    const sentBefore = mailer.sentTo(email).length;

    await domain.marketplaceRules.publish(actor, { summary: "Version 2." });
    await domain.system.runDueClocks();

    expect(mailer.sentTo(email)).toHaveLength(sentBefore);
  });
});
