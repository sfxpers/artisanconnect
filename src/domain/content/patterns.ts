import type { ContentContext } from "../ports";

// The patterns the Content check runs before the content reader (ADR 0011):
// a phone number, an email address, a link, or a bank account number is
// refused at once, for free, the same way every time. What they miss (a
// number in words, a handle, an ask to pay off the platform) is the content
// reader's to find.

export type PatternHit = "phone" | "email" | "link" | "bank-account";

const MESSAGES: Record<PatternHit, string> = {
  phone: "Take out the phone number. Contact details can only be shared after Payment.",
  email: "Take out the email address. Contact details can only be shared after Payment.",
  link: "Take out the link. Links cannot be sent on ArtisanConnect.",
  "bank-account": "Take out the bank account number. Pay and be paid only through ArtisanConnect.",
};

/** After Payment, in that Engagement's Conversation, the parties may swap phone numbers and emails. */
const ALLOWED_AFTER_PAYMENT: ReadonlySet<PatternHit> = new Set(["phone", "email"]);

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/u;

const LINK = new RegExp(
  [
    String.raw`\b(?:https?://|www\.)\S`,
    // A bare address: a name, a dot, and a top-level domain people send.
    String.raw`\b[\p{L}\p{N}][\p{L}\p{N}-]*(?:\.[\p{L}\p{N}-]+)*\.(?:com|net|org|info|biz|io|me|ly|app|link|site|online|store|shop|page|za|africa|capetown)\b`,
  ].join("|"),
  "iu",
);

/** Digits that run together, with at most three spaces, dashes, dots, or brackets between them. */
const DIGIT_RUN = /\+?\d(?:[\s\-.()–]{0,3}\d)*/g;

/** An account number said to be one, however short. */
const NAMED_ACCOUNT =
  /\b(?:account|acc|a\/c|rekening)\b\s*(?:no\.?|number|nr\.?|#)?\s*[:-]?\s*\d(?:[\s-]?\d){5,}/i;

/** A South African number (0 then nine digits, or 27 then nine), or any number written with a +. */
function isPhone(run: string, digits: string): boolean {
  if (run.startsWith("+")) return digits.length >= 9 && digits.length <= 15;
  return /^0[1-8]\d{8}$/.test(digits) || /^(?:00)?27[1-8]\d{8}$/.test(digits);
}

/** What the patterns find in this text, in this context, or null. */
export function patternHit(text: string, context: ContentContext): PatternHit | null {
  const normalized = text.normalize("NFKC");
  const hits = new Set<PatternHit>();
  if (EMAIL.test(normalized)) hits.add("email");
  // An email's domain is not a link of its own.
  if (LINK.test(normalized.replace(new RegExp(EMAIL.source, "gu"), " "))) hits.add("link");
  if (NAMED_ACCOUNT.test(normalized)) hits.add("bank-account");
  for (const match of normalized.matchAll(DIGIT_RUN)) {
    const run = match[0];
    // An amount of Rand is money, not an account: "R1 250 000.50".
    if (/(?:^|[^\p{L}])R\s?$/u.test(normalized.slice(Math.max(0, match.index - 3), match.index))) {
      continue;
    }
    const digits = run.replace(/[.,]\d{2}$/, "").replace(/\D/g, "");
    if (isPhone(run, digits)) hits.add("phone");
    // A card number is a payment detail as much as an account number is.
    else if (digits.length >= 9 && digits.length <= 19) hits.add("bank-account");
  }
  const order: PatternHit[] = ["bank-account", "link", "phone", "email"];
  return (
    order.find(
      (hit) =>
        hits.has(hit) &&
        !(context.kind === "engagement-conversation" && ALLOWED_AFTER_PAYMENT.has(hit)),
    ) ?? null
  );
}

/** What the sender is told about a pattern's hit. */
export function patternMessage(hit: PatternHit): string {
  return MESSAGES[hit];
}

/**
 * What the place an item is sent to knows must not be said there before
 * Payment, which no general pattern could: in a Conversation, the Job's
 * street and suburb, and the parties' surnames that the platform does not show.
 */
export type Withheld = {
  street?: string;
  suburb?: string;
  surnames?: readonly string[];
};

export type WithheldHit = "street" | "suburb" | "surname";

const WITHHELD_MESSAGES: Record<WithheldHit, string> = {
  street: "Take out the street address. The address is shared only after Payment.",
  suburb: "Take out the suburb. The address is shared only after Payment.",
  surname: "Take out the surname. Before Payment, use only the names ArtisanConnect shows.",
};

/** The ways a road's kind is written, each as it is spelled out first. */
const ROAD_KINDS = [
  ["street", "st"],
  ["road", "rd"],
  ["avenue", "ave", "av"],
  ["drive", "dr"],
  ["lane", "ln"],
  ["crescent", "cres", "cr"],
  ["close", "cl"],
  ["place", "pl"],
  ["way"],
  ["boulevard", "blvd"],
  ["terrace", "tce"],
  ["circle", "cir"],
  ["square", "sq"],
] as const;

/** What the withheld words say in this text, or null. */
export function withheldHit(text: string, withheld: Withheld): WithheldHit | null {
  const normalized = text.normalize("NFKC");
  if (streetPatterns(withheld.street ?? "").some((pattern) => pattern.test(normalized))) {
    return "street";
  }
  const suburb = withheld.suburb?.trim();
  if (suburb && phrase(suburb.split(/[\s-]+/), "[\\s-]+").test(normalized)) return "suburb";
  for (const surname of withheld.surnames ?? []) {
    if (Array.from(surname).length >= 2 && phrase([surname]).test(normalized)) return "surname";
  }
  return null;
}

/** What the sender is told about a withheld word. */
export function withheldMessage(hit: WithheldHit): string {
  return WITHHELD_MESSAGES[hit];
}

/**
 * The street as it may be written: its name with its road's kind spelled out
 * or shortened, without the house or unit number ("Main Road", "main rd").
 */
function streetPatterns(street: string): RegExp[] {
  return street
    .normalize("NFKC")
    .split(",")
    .map((part) =>
      part
        .trim()
        .replace(/^(?:(?:unit|flat|no\.?|number)\s*)?\d+[a-z]?\b\s*/iu, "")
        .split(/\s+/)
        .filter(Boolean),
    )
    .filter((words) => words.join("").replace(/[^\p{L}]/gu, "").length >= 3)
    .map((words) => {
      const last = words.at(-1)!.toLowerCase().replace(/\.$/, "");
      const kind = ROAD_KINDS.find((spellings) => (spellings as readonly string[]).includes(last));
      if (!kind || words.length < 2) return phrase(words);
      return new RegExp(
        `${phrase(words.slice(0, -1)).source}\\s+(?:${kind.join("|")})(?![\\p{L}\\p{N}])`,
        "iu",
      );
    });
}

/** The words, whole, with spaces (or what is given) between them, in any case. */
function phrase(words: readonly string[], between = "\\s+"): RegExp {
  const escaped = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped.join(between)}(?![\\p{L}\\p{N}])`, "iu");
}
