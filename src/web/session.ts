// Server only: how a request reaches the domain module. A server function is
// a thin adapter; every rule is in the module (ADR 0017).
import { env } from "cloudflare:workers";
import {
  getCookie,
  getRequestHeader,
  getRequestIP,
  setCookie,
  setResponseHeader,
} from "@tanstack/react-start/server";
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

/** The cookie that names the browser, for the device recorded at sign-in and each Payment (#140). */
const DEVICE_COOKIE = "ac_device";

/**
 * The device and IP the request came from: the browser's device id, or a new
 * one, which `keepDevice` keeps.
 */
export function requestSeen(): { ip: string; device: string } {
  const kept = getCookie(DEVICE_COOKIE);
  // The browser may send anything; only an id this app gave is taken.
  const device = kept && UUID.test(kept) ? kept : crypto.randomUUID();
  return { ip: requestIp(), device };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Keeps the browser's device id in its cookie for two years. Call it after
 * `sendCookies`, which replaces the cookies a response sets.
 */
export function keepDevice(device: string) {
  setCookie(DEVICE_COOKIE, device, {
    httpOnly: true,
    secure: env.ENVIRONMENT !== "local",
    sameSite: "lax",
    path: "/",
    maxAge: 2 * 365 * 24 * 60 * 60,
  });
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

/** Ends the request's session, its row gone already or not, clearing its cookies. */
export async function endSession(domain = requestDomain()) {
  const ended = await domain.accounts.signOut(visitor, { cookie: requestCookie() });
  if (ended.ok) sendCookies(ended.value.cookies);
}
