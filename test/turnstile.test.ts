import { afterEach, describe, expect, test, vi } from "vitest";
import { passesTurnstile } from "@/worker/turnstile";

// Cloudflare Turnstile guards sign-up, sign-in, and code requests before they
// reach the domain module (ADR 0017), so it is checked here, at the Worker's
// edge: each token is asked of Cloudflare's siteverify once, with the secret
// and the person's IP, and only Cloudflare's "success" lets the request on.

const env = { TURNSTILE_SECRET_KEY: "the-secret" } as Env;

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Cloudflare's answer to every siteverify request, and the requests asked. */
function siteverify(answer: Response) {
  const asked = vi.fn(async (_url: string, _init: RequestInit) => answer.clone());
  vi.stubGlobal("fetch", asked);
  return asked;
}

describe("Turnstile", () => {
  test("lets a request on only when Cloudflare says the token passed", async () => {
    const cases = [
      [new Response(JSON.stringify({ success: true })), true],
      [
        new Response(JSON.stringify({ success: false, "error-codes": ["timeout-or-duplicate"] })),
        false,
      ],
      [new Response("Bad gateway", { status: 502 }), false],
    ] as const;
    for (const [answer, passes] of cases) {
      siteverify(answer);
      expect(await passesTurnstile(env, "a-token", "198.51.100.7")).toBe(passes);
    }
  });

  test("asks Cloudflare with the secret, the token, and the person's IP", async () => {
    const asked = siteverify(new Response(JSON.stringify({ success: true })));

    await passesTurnstile(env, "a-token", "198.51.100.7");

    const [url, init] = asked.mock.calls[0]!;
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(Object.fromEntries(new URLSearchParams(init.body as URLSearchParams))).toEqual({
      secret: "the-secret",
      response: "a-token",
      remoteip: "198.51.100.7",
    });
  });

  test("refuses a request with no token without asking Cloudflare", async () => {
    const asked = siteverify(new Response(JSON.stringify({ success: true })));

    expect(await passesTurnstile(env, undefined, "198.51.100.7")).toBe(false);
    expect(asked).not.toHaveBeenCalled();
  });
});
