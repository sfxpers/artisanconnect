import type { Domain } from "@/domain";
import type { FakeMailer } from "@/domain/fakes/mailer";

/**
 * Builds test data through the module's public commands only, never by writing
 * rows, so the schema can change without tests changing. Each ticket adds the
 * builders its commands make possible: a Client, a verified Artisan, an Open
 * Job, a Hired Engagement.
 */
export function given({ domain, mailer }: { domain: Domain; mailer: FakeMailer }) {
  let count = 0;

  /** The newest Email code sent to an address. */
  function codeSentTo(email: string): string {
    const sent = mailer.sentTo(email).at(-1);
    const code = sent?.text.match(/\b\d{6}\b/)?.[0];
    if (!code) throw new Error(`No Email code was sent to ${email}`);
    return code;
  }

  async function account(
    kind: "client" | "artisan",
    details: { name?: string; tradingName?: string; email?: string; password?: string } = {},
  ) {
    count += 1;
    const email = details.email ?? `${kind}${count}@example.com`;
    const password = details.password ?? "correct horse battery";
    const rules = await domain.marketplaceRules.current({ kind: "visitor" });
    const signedUp = await domain.accounts.signUp(
      { kind: "visitor" },
      {
        kind,
        name: details.name ?? (kind === "client" ? "Thandi Mokoena" : "Sipho Dlamini"),
        tradingName: details.tradingName,
        email,
        password,
        rulesVersion: rules.version,
        consentsToDataUse: true,
        ip: `198.51.100.${count}`,
      },
    );
    if (!signedUp.ok) throw new Error(signedUp.refusal.message);
    const confirmed = await domain.accounts.confirmEmail(
      { kind: "visitor" },
      { email, code: codeSentTo(email), ip: `198.51.100.${count}` },
    );
    if (!confirmed.ok) throw new Error(confirmed.refusal.message);
    return { ...confirmed.value, email, password };
  }

  return {
    codeSentTo,
    /** A Client who has signed up, proved the Email, and is signed in. */
    client: (details?: Parameters<typeof account>[1]) => account("client", details),
    /** An Artisan who has signed up, proved the Email, and is signed in. Not yet verified. */
    artisan: (details?: Parameters<typeof account>[1]) => account("artisan", details),
  };
}
