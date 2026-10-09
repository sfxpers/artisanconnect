import { describe, expect, test } from "vitest";
import { visitor } from "@/domain/actor";
import { createHarness, type Harness } from "../support/harness";

// An Account changes its Email by giving its password and proving the new one
// with an Email code (#141). The old one signs in until then and is told of the change, so a
// stolen session cannot silently take the Account. An Email held by any
// Account or an Admin is refused.

const IP = "203.0.113.7";

/** The cookie header a browser sends back for the cookies a sign-in set. */
function cookieOf(cookies: string[]) {
  return cookies.map((cookie) => cookie.split(";")[0]).join("; ");
}

async function signsIn(domain: Harness["domain"], email: string, password: string) {
  return domain.accounts.signIn(visitor, { email, password, ip: IP, device: null });
}

describe("changing the Email", () => {
  test("sends an Email code to the new address; the old one signs in until it is proven", async () => {
    const { domain, given, mailer } = await createHarness();
    const client = await given.client({ email: "thandi@example.com" });

    const asked = await domain.accounts.requestEmailChange(client.actor, {
      email: "thandi.m@example.com",
      password: client.password,
      cookie: cookieOf(client.cookies),
      ip: IP,
    });

    expect(asked).toEqual({ ok: true, value: { email: "thandi.m@example.com" } });
    expect(mailer.sentTo("thandi.m@example.com")).toEqual([
      expect.objectContaining({ subject: "Your ArtisanConnect Email code" }),
    ]);
    expect((await domain.accounts.me(client.actor))?.email).toBe("thandi@example.com");
    expect(await signsIn(domain, "thandi@example.com", client.password)).toMatchObject({
      ok: true,
    });
    expect(await signsIn(domain, "thandi.m@example.com", client.password)).toMatchObject({
      ok: false,
    });
  });

  test("is done by the code: the new address signs in, the old one does not and is told", async () => {
    const { domain, given } = await createHarness();
    const client = await given.client({ email: "thandi@example.com" });
    const cookie = cookieOf(client.cookies);
    await domain.accounts.requestEmailChange(client.actor, {
      email: "thandi.m@example.com",
      password: client.password,
      cookie,
      ip: IP,
    });

    const changed = await domain.accounts.changeEmail(client.actor, {
      email: "thandi.m@example.com",
      code: given.codeSentTo("thandi.m@example.com"),
      cookie,
      ip: IP,
    });

    expect(changed).toEqual({
      ok: true,
      value: { email: "thandi.m@example.com", cookies: expect.any(Array) },
    });
    expect((await domain.accounts.me(client.actor))?.email).toBe("thandi.m@example.com");
    expect(await signsIn(domain, "thandi.m@example.com", client.password)).toMatchObject({
      ok: true,
    });
    expect(await signsIn(domain, "thandi@example.com", client.password)).toMatchObject({
      ok: false,
      refusal: { reason: "wrong-credentials" },
    });
  });

  test("tells the old address by email, naming no new address", async () => {
    const { domain, given, mailer } = await createHarness();
    const client = await given.client({ email: "thandi@example.com" });
    const cookie = cookieOf(client.cookies);
    await domain.accounts.requestEmailChange(client.actor, {
      email: "thandi.m@example.com",
      password: client.password,
      cookie,
      ip: IP,
    });
    await domain.accounts.changeEmail(client.actor, {
      email: "thandi.m@example.com",
      code: given.codeSentTo("thandi.m@example.com"),
      cookie,
      ip: IP,
    });

    const told = mailer.sentTo("thandi@example.com").at(-1);
    expect(told?.subject).toBe("Your ArtisanConnect Email was changed");
    expect(told?.text).not.toContain("thandi.m@example.com");
  });

  test("takes an address an unproven sign-up waited on once its code stopped working", async () => {
    const { domain, given, clock } = await createHarness();
    const rules = await domain.marketplaceRules.current(visitor);
    await domain.accounts.signUp(visitor, {
      kind: "artisan",
      name: "Someone Else",
      email: "taken@example.com",
      password: "another horse battery",
      rulesVersion: rules.version,
      consentsToDataUse: true,
      ip: "198.51.100.200",
    });
    clock.advance({ minutes: 11 });
    const client = await given.client();
    const cookie = cookieOf(client.cookies);

    await domain.accounts.requestEmailChange(client.actor, {
      email: "taken@example.com",
      password: client.password,
      cookie,
      ip: IP,
    });
    const changed = await domain.accounts.changeEmail(client.actor, {
      email: "taken@example.com",
      code: given.codeSentTo("taken@example.com"),
      cookie,
      ip: IP,
    });

    expect(changed).toMatchObject({ ok: true });
    expect((await domain.accounts.me(client.actor))?.email).toBe("taken@example.com");
  });
});

describe("changing the Email, refused", () => {
  test("for an address another Account holds, and nothing is sent to it", async () => {
    const { domain, given, mailer } = await createHarness();
    const other = await given.artisan({ email: "sipho@example.com" });
    const client = await given.client();
    const before = mailer.sentTo(other.email).length;

    const asked = await domain.accounts.requestEmailChange(client.actor, {
      email: "Sipho@Example.com",
      password: client.password,
      cookie: cookieOf(client.cookies),
      ip: IP,
    });

    expect(asked).toMatchObject({ ok: false, refusal: { reason: "held" } });
    expect(mailer.sentTo(other.email)).toHaveLength(before);
  });

  test("for an Admin's address", async () => {
    const { domain, given } = await createHarness();
    await given.admin({ email: "staff@example.com" });
    const client = await given.client();

    expect(
      await domain.accounts.requestEmailChange(client.actor, {
        email: "staff@example.com",
        password: client.password,
        cookie: cookieOf(client.cookies),
        ip: IP,
      }),
    ).toMatchObject({ ok: false, refusal: { reason: "held" } });
  });

  test("once another Account took the address while the code waited", async () => {
    const { domain, given, clock } = await createHarness();
    const client = await given.client();
    const cookie = cookieOf(client.cookies);
    await domain.accounts.requestEmailChange(client.actor, {
      email: "new@example.com",
      password: client.password,
      cookie,
      ip: IP,
    });
    const code = given.codeSentTo("new@example.com");
    clock.advance({ minutes: 1 });
    await given.artisan({ email: "new@example.com" });

    const changed = await domain.accounts.changeEmail(client.actor, {
      email: "new@example.com",
      code,
      cookie,
      ip: IP,
    });

    expect(changed).toMatchObject({ ok: false, refusal: { reason: "held" } });
    expect((await domain.accounts.me(client.actor))?.email).toBe(client.email);
  });

  test("without the Account's password, so a session taken from it cannot change it", async () => {
    const { domain, given, mailer } = await createHarness();
    const client = await given.client();

    const asked = await domain.accounts.requestEmailChange(client.actor, {
      email: "thief@example.com",
      password: "not the password",
      cookie: cookieOf(client.cookies),
      ip: IP,
    });

    expect(asked).toMatchObject({ ok: false, refusal: { reason: "wrong-password" } });
    expect(mailer.sentTo("thief@example.com")).toEqual([]);
  });

  test("for the address it has already", async () => {
    const { domain, given } = await createHarness();
    const client = await given.client();

    expect(
      await domain.accounts.requestEmailChange(client.actor, {
        email: client.email,
        password: client.password,
        cookie: cookieOf(client.cookies),
        ip: IP,
      }),
    ).toMatchObject({ ok: false, refusal: { reason: "same-email" } });
  });

  test("with a wrong code, leaving the Email as it was", async () => {
    const { domain, given } = await createHarness();
    const client = await given.client();
    const cookie = cookieOf(client.cookies);
    await domain.accounts.requestEmailChange(client.actor, {
      email: "new@example.com",
      password: client.password,
      cookie,
      ip: IP,
    });
    const right = given.codeSentTo("new@example.com");
    const wrong = right === "000000" ? "111111" : "000000";

    const changed = await domain.accounts.changeEmail(client.actor, {
      email: "new@example.com",
      code: wrong,
      cookie,
      ip: IP,
    });

    expect(changed).toMatchObject({ ok: false, refusal: { reason: "wrong-code" } });
    expect((await domain.accounts.me(client.actor))?.email).toBe(client.email);
  });

  test("for anyone but the signed-in Account the session is", async () => {
    const { domain, given } = await createHarness();
    const client = await given.client();
    const artisan = await given.artisan();

    expect(
      await domain.accounts.requestEmailChange(visitor, {
        email: "new@example.com",
        password: client.password,
        cookie: cookieOf(client.cookies),
        ip: IP,
      }),
    ).toMatchObject({ ok: false, refusal: { reason: "sign-in-required" } });
    expect(
      await domain.accounts.requestEmailChange(artisan.actor, {
        email: "new@example.com",
        password: artisan.password,
        cookie: cookieOf(client.cookies),
        ip: IP,
      }),
    ).toMatchObject({ ok: false, refusal: { reason: "sign-in-required" } });
  });
});
