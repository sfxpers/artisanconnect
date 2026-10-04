// Server only: how a request reaches the domain module. A server function is
// a thin adapter; every rule is in the module (ADR 0017).
import { env } from "cloudflare:workers";
import { getRequestHeader, getRequestIP, setResponseHeader } from "@tanstack/react-start/server";
import type { Actor } from "@/domain";
import { visitor } from "@/domain/actor";
import { refuse } from "@/domain/result";
import { passesTurnstile } from "@/worker/turnstile";
import { domainFromEnv } from "@/worker/ports";

export function requestDomain() {
  return domainFromEnv(env);
}

export function requestCookie(): string | null {
  return getRequestHeader("cookie") ?? null;
}

export function requestIp(): string {
  return getRequestHeader("cf-connecting-ip") ?? getRequestIP() ?? "unknown";
}

/** The party the request's session acts for. */
export async function requestActor(domain = requestDomain()): Promise<Actor> {
  const cookie = requestCookie();
  if (!cookie) return visitor;
  const { actor, cookies } = await domain.accounts.whoIs(visitor, { cookie });
  sendCookies(cookies);
  return actor;
}

export function sendCookies(cookies: string[]) {
  if (cookies.length > 0) setResponseHeader("set-cookie", cookies);
}

/** Turnstile's answer for this request, as a refusal when it fails. */
export async function turnstileRefusal(token: string | undefined) {
  if (await passesTurnstile(env, token, requestIp())) return null;
  return refuse("not-a-person", "We could not check that you are a person. Try again.");
}
