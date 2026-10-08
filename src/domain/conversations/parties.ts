import { eq } from "drizzle-orm";
import { publicName, shownName } from "../accounts/names";
import type { Withheld } from "../content/patterns";
import type { Context } from "../context";
import { accounts } from "../schema";
import { holdsNow, seenByArtisan, type ConversationRow, type Party } from "./rows";

// Who is in a Conversation, and what each may see and say of the other.

/** Which party of the Conversation the Account is, if it sees it; null if neither. */
export async function viewerOf(
  ctx: Context,
  conversation: ConversationRow,
  accountId: string | null,
): Promise<Party | null> {
  if (accountId === conversation.job.clientId) return "client";
  if (
    accountId === conversation.artisanId &&
    (await holdsNow(ctx, seenByArtisan(ctx, conversation.id)))
  ) {
    return "artisan";
  }
  return null;
}

/** The names each party goes by in the Conversation: those the Content check has passed, or none. */
export async function namesOf(ctx: Context, conversation: ConversationRow) {
  const [client, artisan] = await Promise.all([
    namesRow(ctx, conversation.job.clientId),
    namesRow(ctx, conversation.artisanId),
  ]);
  return {
    client: client?.namesShown ? shownName("client", client) : null,
    artisan: artisan?.namesShown ? publicName(artisan) : null,
    rows: { client, artisan },
  };
}

/**
 * What neither party may say before Payment: the Job's street and suburb,
 * and either party's surname where the platform does not show it.
 */
export async function withheldOf(ctx: Context, conversation: ConversationRow): Promise<Withheld> {
  const { rows } = await namesOf(ctx, conversation);
  const surnames = [
    rows.client && unshownSurname(rows.client.name, shownName("client", rows.client)),
    rows.artisan && unshownSurname(rows.artisan.name, publicName(rows.artisan)),
  ].filter((surname): surname is string => !!surname);
  return {
    street: conversation.job.street,
    suburb: conversation.job.suburbName ?? undefined,
    surnames,
  };
}

/** The last word of a full name, unless the name shown says it. */
function unshownSurname(name: string, shown: string): string | null {
  const words = name.trim().split(/\s+/);
  if (words.length < 2) return null;
  const surname = words.at(-1)!;
  const shownWords = shown.toLocaleLowerCase("en-ZA").split(/[^\p{L}\p{N}'-]+/u);
  return shownWords.includes(surname.toLocaleLowerCase("en-ZA")) ? null : surname;
}

async function namesRow(ctx: Context, accountId: string) {
  const [row] = await ctx.db
    .select({
      name: accounts.name,
      tradingName: accounts.tradingName,
      namesShown: accounts.namesShown,
    })
    .from(accounts)
    .where(eq(accounts.id, accountId));
  return row ?? null;
}

/** The web app's path to a file in a message, or a photo's thumbnail. */
export function messageFilePath(
  messageId: string,
  file: { id: string },
  thumbnail = false,
): string {
  return `/message-files/${messageId}/${file.id}${thumbnail ? "?size=thumbnail" : ""}`;
}
