// PROTOTYPE, throwaway. Fixtures for /prototype/launch.
// Facts follow the closed tickets on the ArtisanConnect launch map and CONTEXT.md.
// Names, dates, and amounts are invented. No persistence, no server.

export const SCREENS = [
  { key: "profile", label: "Artisan Profile", who: "Visitor" },
  { key: "post", label: "Post a Job", who: "Client" },
  { key: "quotes", label: "Compare Quotes", who: "Client" },
  { key: "conversation", label: "Conversation before Payment", who: "Client" },
  { key: "engagement", label: "Paid Engagement", who: "Client" },
  { key: "completion", label: "Completion", who: "Artisan" },
  { key: "release", label: "Release and silence", who: "Client" },
  { key: "dispute", label: "Dispute", who: "Client" },
  { key: "review", label: "Review", who: "Client" },
  { key: "verification", label: "Verification", who: "Artisan" },
  { key: "home", label: "Artisan home", who: "Artisan" },
  { key: "notices", label: "Notices", who: "Client" },
] as const;

export type ScreenKey = (typeof SCREENS)[number]["key"];
export type Who = (typeof SCREENS)[number]["who"];

export const SCREEN_KEYS = SCREENS.map((s) => s.key) as ScreenKey[];

export function screenOf(key: ScreenKey) {
  return SCREENS.find((s) => s.key === key) ?? SCREENS[0];
}

// ---------- money (whole cents) ----------

export const PROTECTION_FEE_PCT = 2.5;

/** Half up to the cent. */
export function pctOf(cents: number, pct: number) {
  return Math.floor((cents * pct) / 100 + 0.5);
}

export function rand(cents: number) {
  const whole = Math.trunc(cents / 100);
  const part = Math.abs(cents % 100);
  const w = Math.abs(whole).toLocaleString("en-US");
  return `${cents < 0 ? "-" : ""}R${w}${part ? `.${String(part).padStart(2, "0")}` : ""}`;
}

/** Artisan Fee rate by earlier Completed Engagements in this Client Relationship. */
export function artisanFeePct(earlierCompleted: number) {
  if (earlierCompleted >= 2) return 4;
  if (earlierCompleted === 1) return 7;
  return 10;
}

// ---------- the text check ----------
// The detector's patterns are fog on the map ("how it tells a phone number from a
// price or a measurement is not decided"). This crude stand-in only exists so a
// refused send can be seen.

export function refusedBecause(text: string): string | null {
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(text)) return "it contains an email address";
  if (/(https?:\/\/|www\.|\b[\w-]+\.(co\.za|com|net|org|link|me)\b)/i.test(text))
    return "it contains a link";
  if (/(\+27|\b0)[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/.test(text)) return "it contains a phone number";
  if (/\b(acc(ount)?\s*(no|number)?[:\s]*)\d{8,11}\b/i.test(text))
    return "it contains a bank account number";
  return null;
}

// ---------- parties ----------

export const CATEGORIES = [
  "Plumbing",
  "Electrical",
  "Carpentry and cabinetry",
  "Painting",
  "Tiling",
  "Brickwork and plastering",
  "Roofing",
  "Welding and metalwork",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const REGIONS = [
  "Cape Flats",
  "Mitchells Plain/Khayelitsha",
  "Helderberg",
  "Table Bay",
  "Southern",
  "Tygerberg",
  "Blaauwberg",
  "Northern",
] as const;

export type Badge = { name: string; validTo?: string };

export const artisan = {
  publicName: "Sipho Ndlovu",
  initials: "SN",
  available: true,
  regions: ["Southern", "Table Bay", "Cape Flats"],
  about:
    "Geysers, leaks, and bathroom refits. Fifteen years on the job. I quote from your photos and description.",
  services: ["Geyser replacement", "Leak detection", "Bathroom refits", "Gas hob fitting"],
  categories: [
    {
      name: "Plumbing" as Category,
      average: 4.8,
      reviews: 23,
      completed: 31,
      badges: [
        { name: "Trained plumber" },
        { name: "Authorised gas practitioner", validTo: "14 Mar 2027" },
        { name: "References" },
      ] as Badge[],
      workPhotos: ["Geyser bay", "Copper manifold", "Shower refit", "Gas hob install"],
    },
    {
      name: "Tiling" as Category,
      average: 4.6,
      reviews: 5,
      completed: 6,
      badges: [{ name: "References" }] as Badge[],
      workPhotos: ["Bathroom floor", "Kitchen splashback"],
    },
  ],
  optionalBadges: [{ name: "Criminal record check" }] as Badge[],
};

export const client = { shownName: "Thandi M.", paid: 4, completed: 3, average: 4.9, reviews: 3 };

export const job = {
  title: "Replace burst geyser and fit a gas hob",
  category: "Plumbing" as Category,
  gas: true,
  siteType: "Home" as "Home" | "Business",
  region: "Southern",
  description:
    "150 L geyser in the roof burst this morning, water is off at the mains. Also want the new 4-burner gas hob fitted to the existing bottle outside the kitchen wall. Roof hatch is in the passage.",
  photos: ["Burst geyser", "Roof hatch", "Hob and bottle"],
  preferredStart: "12 Oct 2026",
};

// ---------- Quotes ----------

export type QuoteStatus =
  | "Sent"
  | "Accepted"
  | "Declined"
  | "Withdrawn"
  | "Expired"
  | "Not chosen"
  | "Void";

export type Quote = {
  id: string;
  artisan: string;
  sentAt: string;
  expiresAt: string;
  labour: number;
  materials: number;
  supplies: "Artisan" | "Client" | "Both";
  scope: string;
  warranty?: string;
  durationDays?: number;
  revised: boolean;
  average?: number;
  reviews: number;
  completedInCategory: number;
  badges: Badge[];
  status: QuoteStatus;
};

export const quotes: Quote[] = [
  {
    id: "q1",
    artisan: "Sipho Ndlovu",
    sentAt: "3 Oct, 09:12",
    expiresAt: "10 Oct, 09:12",
    labour: 680000,
    materials: 520000,
    supplies: "Artisan",
    scope:
      "Remove burst 150 L geyser, supply and fit new 150 L geyser with drip tray, valves and vacuum breakers. Fit the Client's chosen gas hob to the existing bottle, new hose and regulator, leak test, certificate of conformity.",
    warranty: "12 months on workmanship",
    durationDays: 2,
    revised: false,
    average: 4.8,
    reviews: 23,
    completedInCategory: 31,
    badges: [
      { name: "Trained plumber" },
      { name: "Authorised gas practitioner", validTo: "14 Mar 2027" },
      { name: "References" },
    ],
    status: "Sent",
  },
  {
    id: "q2",
    artisan: "Ayanda Khumalo",
    sentAt: "3 Oct, 11:40",
    expiresAt: "10 Oct, 11:40",
    labour: 610000,
    materials: 435000,
    supplies: "Both",
    scope:
      "Replace geyser like for like, new valves. Client supplies the gas hob and the bottle; I supply hose, regulator and fittings, fit and test, certificate of conformity.",
    revised: false,
    average: 4.5,
    reviews: 9,
    completedInCategory: 11,
    badges: [
      { name: "Trained plumber" },
      { name: "Authorised gas practitioner", validTo: "2 Aug 2027" },
      { name: "References" },
    ],
    status: "Sent",
  },
  {
    id: "q3",
    artisan: "Pieter van Wyk",
    sentAt: "4 Oct, 08:05",
    expiresAt: "11 Oct, 08:05",
    labour: 790000,
    materials: 600000,
    supplies: "Artisan",
    scope:
      "New 150 L high-efficiency geyser, drip tray to the outside, all valves. Hob fitted and tested, certificate of conformity.",
    warranty: "6 months on workmanship",
    durationDays: 1,
    revised: true,
    reviews: 0,
    completedInCategory: 2,
    badges: [
      { name: "Trained plumber" },
      { name: "Authorised gas practitioner", validTo: "30 Nov 2026" },
      { name: "References" },
    ],
    status: "Sent",
  },
];

export const quoteTotal = (q: Pick<Quote, "labour" | "materials">) => q.labour + q.materials;

/** A pending date confirmation: the Client entered dates, the Artisan has not confirmed. */
export const pendingDates = { quoteId: "q1", start: "12 Oct 2026", durationDays: 2, sentAt: "4 Oct, 10:30" };

// ---------- Conversation ----------

export type Message = { from: "Client" | "Artisan"; text: string; at: string };

export const conversation: Message[] = [
  { from: "Client", text: "Is the hob itself in the R12,000, or only the fitting?", at: "3 Oct, 10:02" },
  {
    from: "Artisan",
    text: "Fitting only, plus hose and regulator. Your hob goes in as is. The R5,200 Materials is the geyser, tray, valves and gas fittings.",
    at: "3 Oct, 10:15",
  },
  { from: "Client", text: "Great. Can you do the 12th?", at: "4 Oct, 10:28" },
  { from: "Artisan", text: "Send the dates on the Quote and I will confirm them.", at: "4 Oct, 10:29" },
];

export const conversationDraft = "Easier to sort out by phone, call me on 082 555 0142";

// ---------- the paid Engagement ----------

export const engagement = {
  status: "Paid" as const,
  quoteTotal: 1200000,
  labour: 680000,
  materials: 520000,
  protectionFee: pctOf(1200000, PROTECTION_FEE_PCT),
  paidAt: "6 Oct 2026, 14:03",
  agreedStart: "12 Oct 2026",
  agreedDays: 2,
  earlierCompleted: 0,
  protectedUntil: "6 Oct 2027, 14:03",
  contact: {
    artisanPhone: "082 555 0199",
    artisanEmail: "sipho.n@example.co.za",
    site: "14 Rosmead Avenue, Kenilworth",
    clientFullName: "Thandi Mokoena",
  },
  updatedQuote: {
    labour: 740000,
    materials: 545000,
    scope: "As agreed, plus replace the corroded isolating valve on the cold feed found on site.",
    proposedAt: "12 Oct, 11:20",
  },
  scheduleChange: null as null | { start: string; days: number },
};

// ---------- Completion ----------

export const completionRequires = {
  note: true,
  afterPhoto: true,
  evidence: job.gas ? "Certificate of conformity" : null,
};

// ---------- Release ----------

export const release = {
  status: "Awaiting release" as const,
  quoteTotal: 1200000,
  completedAt: "14 Oct, 16:20",
  silenceAt: "17 Oct, 16:20",
  feePct: 10,
  releases: [{ at: "15 Oct, 08:45", amount: 600000 }],
  completion: {
    note: "Geyser replaced and filled, no leaks at 24 h. Hob fitted and leak tested, flame good on all four.",
    photos: ["New geyser", "Drip tray", "Hob lit"],
    evidence: ["CoC-gas-14Oct.pdf"],
  },
};

// ---------- Dispute ----------

export const dispute = {
  status: "Disputed" as const,
  openedAt: "16 Oct, 10:00",
  settleUntil: "18 Oct, 10:00",
  held: 250000,
  unreleasedBefore: 600000,
  reason: "Hob not connected through the isolator as quoted, and the cold-feed joint still weeps.",
  attachments: ["joint-weeping.jpg"],
  artisanReturnOffer: 120000,
};

// ---------- Review ----------

export const REVIEW_DIMENSIONS = [
  { key: "workmanship", label: "Workmanship", hint: "The finished work, and the state the site was left in." },
  { key: "agreed", label: "Agreed work", hint: "Was the work in the accepted Quote done?" },
  { key: "punctuality", label: "Punctuality", hint: "The agreed start date and duration." },
  { key: "communication", label: "Communication", hint: "Replies and updates, from Payment to Completion." },
] as const;

export const reviewWindow = { completedAt: "17 Oct, 16:20", closesAt: "31 Oct, 16:20" };

// ---------- verification (a different Artisan, mid-way) ----------

export type CheckState = "Accepted" | "Waiting" | "Rejected" | "Not submitted" | "Not needed";

export const verification = {
  artisan: "Lindiwe Mokoena",
  category: "Electrical" as Category,
  once: [
    { name: "Identity document", state: "Accepted" as CheckState, note: "South African ID. A person read it. Never shown." },
    { name: "Physical address", state: "Accepted" as CheckState, note: "Never shown." },
    { name: "Payout account in your name", state: "Accepted" as CheckState, note: "Never shown." },
    { name: "Marketplace rules", state: "Accepted" as CheckState, note: "Current version accepted 2 Oct." },
    {
      name: "Permission to work",
      state: "Not needed" as CheckState,
      note: "Only asked when the Identity Number is a passport.",
    },
  ],
  perCategory: [
    {
      name: "Two references",
      state: "Waiting" as CheckState,
      note: "A badge once you are verified. Referee names and contacts are not shown.",
    },
    {
      name: "Work evidence",
      state: "Accepted" as CheckState,
      note: "At least one picture of your own finished electrical work.",
    },
    {
      name: "Registered person",
      state: "Rejected" as CheckState,
      note: "Rejected 1 Oct: the registration number is not readable. Submit again.",
    },
    {
      name: "Electrical contractor registration",
      state: "Not submitted" as CheckState,
      note: "In your own name, not a company. Shows its validity date.",
    },
  ],
  optional: [
    { name: "Criminal record check", state: "Not submitted" as CheckState },
    { name: "Business insurance", state: "Not submitted" as CheckState },
  ],
};

// ---------- Artisan home ----------

export const home = {
  jobMatches: [
    {
      title: "Kitchen mixer leaking under the sink",
      category: "Plumbing" as Category,
      region: "Table Bay",
      siteType: "Home",
      client: { shownName: "Ruan B.", paid: 0, completed: 0, reviews: 0 },
      at: "Today, 08:10",
      kind: "Job Match" as const,
    },
    {
      title: "Re-tile shower floor, 1.2 m²",
      category: "Tiling" as Category,
      region: "Southern",
      siteType: "Home",
      client: { shownName: "Fatima A.", paid: 2, completed: 2, average: 4.5, reviews: 2 },
      at: "Yesterday, 17:44",
      kind: "Artisan Invitation" as const,
    },
    {
      title: "Burst pipe in the yard of a café",
      category: "Plumbing" as Category,
      region: "Cape Flats",
      siteType: "Business",
      client: { shownName: "Kyle J.", paid: 7, completed: 6, average: 4.7, reviews: 5 },
      at: "Yesterday, 12:03",
      kind: "Job Match" as const,
    },
  ],
  quotes: [
    { title: "Replace burst geyser and fit a gas hob", client: "Thandi M.", total: 1200000, status: "Sent" as QuoteStatus, dates: pendingDates },
    { title: "Outside tap and garden line", client: "Mark P.", total: 185000, status: "Not chosen" as QuoteStatus },
    { title: "Toilet cistern replacement", client: "Nomsa D.", total: 240000, status: "Expired" as QuoteStatus },
  ],
  engagements: [
    { title: "Shower mixer and screen", client: "Lerato K.", status: "Paid", start: "8 Oct", next: "Complete when the work is done" },
    { title: "Geyser element and thermostat", client: "Jaco S.", status: "Awaiting release", start: "29 Sep", next: "Releases 5 Oct, 11:00 unless the Client acts" },
  ],
  payouts: [
    { at: "2 Oct", engagement: "Bathroom basin and trap", release: 320000, fee: 32000, state: "Sent" },
    { at: "28 Sep", engagement: "Hot water cylinder valves", release: 145000, fee: 10150, state: "Sent" },
  ],
  reliability: [] as string[],
};

// ---------- notices (copy is fog: "Notification copy" is not yet specified) ----------

export type Notice = { at: string; job: string; event: string; unread?: boolean };

export const notices: Record<"Client" | "Artisan", Notice[]> = {
  Client: [
    { at: "16 Oct, 10:01", job: "Replace burst geyser and fit a gas hob", event: "Dispute opened on R2,500", unread: true },
    { at: "15 Oct, 16:20", job: "Replace burst geyser and fit a gas hob", event: "Remaining R6,000 Releases on 17 Oct, 16:20 unless you act", unread: true },
    { at: "14 Oct, 16:20", job: "Replace burst geyser and fit a gas hob", event: "Sipho Ndlovu stated Completion" },
    { at: "12 Oct, 11:20", job: "Replace burst geyser and fit a gas hob", event: "Updated Quote proposed: +R850" },
    { at: "6 Oct, 14:03", job: "Replace burst geyser and fit a gas hob", event: "Payment received, Engagement begun" },
    { at: "4 Oct, 12:15", job: "Replace burst geyser and fit a gas hob", event: "Sipho Ndlovu confirmed your dates" },
    { at: "4 Oct, 08:05", job: "Replace burst geyser and fit a gas hob", event: "Pieter van Wyk revised a Quote" },
    { at: "3 Oct, 11:40", job: "Replace burst geyser and fit a gas hob", event: "New Quote from Ayanda Khumalo" },
  ],
  Artisan: [
    { at: "Today, 08:10", job: "Kitchen mixer leaking under the sink", event: "New Job Match in Table Bay", unread: true },
    { at: "Yesterday, 17:44", job: "Re-tile shower floor, 1.2 m²", event: "Artisan Invitation from Fatima A.", unread: true },
    { at: "4 Oct, 10:30", job: "Replace burst geyser and fit a gas hob", event: "Thandi M. sent dates: 12 Oct, 2 days" },
    { at: "3 Oct, 18:00", job: "Outside tap and garden line", event: "Your Quote was not chosen" },
    { at: "2 Oct, 09:00", job: "Bathroom basin and trap", event: "Payout of R2,880 sent" },
  ],
};
