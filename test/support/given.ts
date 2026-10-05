import type { Domain } from "@/domain";
import type { FakeMailer } from "@/domain/fakes/mailer";
import type { ServiceCategory } from "@/domain/service-categories";
import {
  document,
  identity,
  payoutAccount,
  saIdNumber,
  workPhotos,
  type Submission,
} from "./verification";

/**
 * Builds test data through the module's public commands only, never by writing
 * rows, so the schema can change without tests changing. Each ticket adds the
 * builders its commands make possible: a Client, a verified Artisan, an Open
 * Job, a Hired Engagement, an Admin.
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

  /** Signs an Admin in with an Email code. */
  async function signedInAdmin(email: string) {
    count += 1;
    const ip = `198.51.100.${count}`;
    await domain.admins.requestSignInCode({ kind: "visitor" }, { email, ip });
    const signedIn = await domain.admins.signIn(
      { kind: "visitor" },
      { email, code: codeSentTo(email), ip },
    );
    if (!signedIn.ok) throw new Error(signedIn.refusal.message);
    return { ...signedIn.value, email };
  }

  let firstAdmin: Awaited<ReturnType<typeof signedInAdmin>> | undefined;

  /**
   * A signed-in Admin. The first is made by the setup command; each one after
   * is invited by the first.
   */
  async function admin(details: { email?: string } = {}) {
    if (!firstAdmin) {
      const email = details.email ?? "admin@example.com";
      const setUp = await domain.system.setUpFirstAdmin({ email });
      if (!setUp.ok) throw new Error(setUp.refusal.message);
      return (firstAdmin = await signedInAdmin(email));
    }
    const email = details.email ?? `admin${count + 1}@example.com`;
    const invited = await domain.admins.invite(firstAdmin.actor, { email });
    if (!invited.ok) throw new Error(invited.refusal.message);
    return signedInAdmin(email);
  }

  /**
   * An Artisan verified for each category, and for gas work if asked: every
   * check it needs submitted and accepted by an Admin.
   */
  async function verifiedArtisan(
    details: Parameters<typeof account>[1] & {
      categories?: ServiceCategory[];
      gasWork?: boolean;
    } = {},
  ) {
    const { categories = ["plumbing"], gasWork = false, ...names } = details;
    const artisan = await account("artisan", names);
    const staff = firstAdmin ?? (await admin());
    const submissions: Submission[] = [
      await identity({ number: saIdNumber(count) }),
      await payoutAccount({ accountNumber: `62${String(count).padStart(8, "0")}` }),
    ];
    for (const category of categories) {
      submissions.push(await workPhotos(category));
      if (category === "plumbing") {
        submissions.push(await document({ kind: "trained-plumber" }));
        if (gasWork) {
          submissions.push(
            await document({
              kind: "gas-practitioner",
              registrationNumber: "GAS-1234",
              expiresOn: "2028-12-31",
            }),
          );
        }
      }
      if (category === "electrical") {
        submissions.push(
          await document({ kind: "registered-person", registrationNumber: "IE-5678" }),
          await document({
            kind: "electrical-contractor",
            registrationNumber: "EC-9012",
            expiresOn: "2028-12-31",
          }),
        );
      }
    }
    const checkIds: string[] = [];
    for (const submission of submissions) {
      const sent = await domain.verification.submit(artisan.actor, submission);
      if (!sent.ok) throw new Error(sent.refusal.message);
      checkIds.push(sent.value.checkId);
    }
    const home = await domain.queues.home(staff.actor, { queue: "verification" });
    for (const { id: itemId } of home?.items ?? []) {
      const item = await domain.queues.item(staff.actor, { itemId });
      if (!item?.rows?.some((row) => checkIds.includes(row.id))) continue;
      for (const checkId of checkIds) {
        const accepted = await domain.queues.decideRow(staff.actor, {
          itemId,
          rowId: checkId,
          decision: "accept",
        });
        if (!accepted.ok) throw new Error(accepted.refusal.message);
      }
      return artisan;
    }
    throw new Error("The Artisan's Verification item was not raised");
  }

  return {
    codeSentTo,
    admin,
    /** An invited Admin signs in with an Email code. */
    adminSignsIn: signedInAdmin,
    /** A Client who has signed up, proved the Email, and is signed in. */
    client: (details?: Parameters<typeof account>[1]) => account("client", details),
    /** An Artisan who has signed up, proved the Email, and is signed in. Not yet verified. */
    artisan: (details?: Parameters<typeof account>[1]) => account("artisan", details),
    verifiedArtisan,
  };
}
