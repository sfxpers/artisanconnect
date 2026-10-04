/** The name an Account goes by: its trading name if it gave one, else its name. */
export function publicName(account: { name: string; tradingName: string | null }): string {
  return account.tradingName ?? account.name;
}

/** How a Client appears to Artisans: the first word and last initial ("Thandi M."). */
export function clientShownName(name: string): string {
  const words = name.trim().split(/\s+/);
  const first = words[0] ?? "";
  if (words.length < 2) return first;
  const lastInitial = Array.from(words.at(-1)!)[0]!.toLocaleUpperCase("en-ZA");
  return `${first} ${lastInitial}.`;
}
