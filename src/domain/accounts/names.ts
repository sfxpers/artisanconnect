/** The name an Account goes by: its trading name if it gave one, else its name. */
export function publicName(account: { name: string; tradingName: string | null }): string {
  return account.tradingName ?? account.name;
}

/**
 * How an Account appears to other Accounts: an Artisan by its public name, a
 * Client by the first word and last initial of its own.
 */
export function shownName(
  kind: "client" | "artisan",
  names: { name: string; tradingName: string | null },
): string {
  return kind === "client" ? clientShownName(publicName(names)) : publicName(names);
}

/** How a Client appears to Artisans: the first word and last initial ("Thandi M."). */
function clientShownName(name: string): string {
  const words = name.trim().split(/\s+/);
  const first = words[0] ?? "";
  if (words.length < 2) return first;
  const lastInitial = Array.from(words.at(-1)!)[0]!.toLocaleUpperCase("en-ZA");
  return `${first} ${lastInitial}.`;
}
