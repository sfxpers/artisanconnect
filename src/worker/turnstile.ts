/**
 * Cloudflare Turnstile (ADR 0017), which guards sign-up, sign-in, and code
 * requests from bots before they reach the domain module. Each token passes
 * once.
 */
export async function passesTurnstile(
  env: Env,
  token: string | undefined,
  ip: string,
): Promise<boolean> {
  if (!token) return false;
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip }),
  });
  if (!response.ok) return false;
  const outcome: { success?: boolean } = await response.json();
  return outcome.success === true;
}
