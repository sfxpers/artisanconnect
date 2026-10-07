import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { notFound } from "@tanstack/react-router";
import type { SignUpDetails } from "@/domain/accounts/inputs";
import { visitor } from "@/domain/actor";
import { localMail } from "@/worker/ports";
import {
  requestActor,
  requestCookie,
  requestDomain,
  requestIp,
  sendCookies,
  turnstileRefusal,
} from "./session";

type Guarded<T> = T & { turnstileToken?: string };
type Acceptance = { rulesVersion: number; consentsToDataUse: boolean };

/** Who is signed in (an Account or an Admin), as they see themselves, and the Turnstile site key. */
export const getSession = createServerFn({ method: "GET" }).handler(async () => {
  const domain = requestDomain();
  const actor = await requestActor(domain);
  return {
    me: await domain.accounts.me(actor),
    admin: await domain.admins.me(actor),
    turnstileSiteKey: env.TURNSTILE_SITE_KEY,
  };
});

export const getCurrentRules = createServerFn({ method: "GET" }).handler(async () =>
  requestDomain().marketplaceRules.current(visitor),
);

export const signUp = createServerFn({ method: "POST" })
  .validator((input: Guarded<SignUpDetails>) => input)
  .handler(async ({ data: { turnstileToken, ...details } }) => {
    const refused = await turnstileRefusal(turnstileToken);
    if (refused) return refused;
    return requestDomain().accounts.signUp(visitor, { ...details, ip: requestIp() });
  });

export const resendCode = createServerFn({ method: "POST" })
  .validator((input: Guarded<{ email: string }>) => input)
  .handler(async ({ data }) => {
    const refused = await turnstileRefusal(data.turnstileToken);
    if (refused) return refused;
    return requestDomain().accounts.resendCode(visitor, { email: data.email, ip: requestIp() });
  });

export const confirmEmail = createServerFn({ method: "POST" })
  .validator((input: { email: string; code: string }) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    const confirmed = await domain.accounts.confirmEmail(visitor, { ...data, ip: requestIp() });
    if (!confirmed.ok) return confirmed;
    sendCookies(confirmed.value.cookies);
    return { ok: true as const, value: { me: await domain.accounts.me(confirmed.value.actor) } };
  });

export const signIn = createServerFn({ method: "POST" })
  .validator(
    (input: Guarded<{ email: string; password: string; acceptsRules?: Acceptance }>) => input,
  )
  .handler(async ({ data: { turnstileToken, ...credentials } }) => {
    const refused = await turnstileRefusal(turnstileToken);
    if (refused) return refused;
    const domain = requestDomain();
    const signedIn = await domain.accounts.signIn(visitor, { ...credentials, ip: requestIp() });
    if (!signedIn.ok) return signedIn;
    sendCookies(signedIn.value.cookies);
    return { ok: true as const, value: { me: await domain.accounts.me(signedIn.value.actor) } };
  });

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  const domain = requestDomain();
  const signedOut = await domain.accounts.signOut(await requestActor(domain), {
    cookie: requestCookie(),
  });
  if (signedOut.ok) sendCookies(signedOut.value.cookies);
  return signedOut;
});

export const requestRecovery = createServerFn({ method: "POST" })
  .validator((input: Guarded<{ email: string }>) => input)
  .handler(async ({ data }) => {
    const refused = await turnstileRefusal(data.turnstileToken);
    if (refused) return refused;
    return requestDomain().accounts.requestRecovery(visitor, {
      email: data.email,
      ip: requestIp(),
    });
  });

export const recover = createServerFn({ method: "POST" })
  .validator((input: { email: string; code: string; password: string }) => input)
  .handler(async ({ data }) =>
    requestDomain().accounts.recover(visitor, { ...data, ip: requestIp() }),
  );

/** Gives the signed-in Account new names, which go through the Content check. */
export const changeNames = createServerFn({ method: "POST" })
  .validator((input: { name: string; tradingName?: string }) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.accounts.changeNames(await requestActor(domain), data);
  });

/** States the signed-in Artisan's VAT number, or clears it. */
export const setVatNumber = createServerFn({ method: "POST" })
  .validator((input: { vatNumber: string }) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.accounts.setVatNumber(await requestActor(domain), data);
  });

/** Withdraws the signed-in Account's names that are being checked. */
export const withdrawNames = createServerFn({ method: "POST" }).handler(async () => {
  const domain = requestDomain();
  return domain.accounts.withdrawNames(await requestActor(domain));
});

/** The signed-in Account's Notices stream. */
export const getNotices = createServerFn({ method: "GET" }).handler(async () => {
  const domain = requestDomain();
  return domain.notices.list(await requestActor(domain));
});

/** Locally only: the emails the app would have sent, newest first. */
export const getLocalMail = createServerFn({ method: "GET" }).handler(async () => {
  if (env.ENVIRONMENT !== "local") throw notFound();
  return localMail.map(({ to, subject, text }) => ({ to, subject, text }));
});
