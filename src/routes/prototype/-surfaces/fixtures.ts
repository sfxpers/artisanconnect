// PROTOTYPE, throwaway. Fixtures for /prototype/surfaces.
// Facts follow the closed tickets on the ArtisanConnect launch map and CONTEXT.md.
// Names, dates, amounts, and the suburb-to-district sample are invented. No server.

export const SCREENS = [
  { key: "landing", label: "Landing", who: "Visitor" },
  { key: "signup", label: "Sign up", who: "Visitor" },
  { key: "jobs", label: "My Jobs and drafts", who: "Client" },
  { key: "browse", label: "Browse a Service Category", who: "Client" },
  { key: "invite", label: "Invite list for a Job", who: "Client" },
  { key: "profile-edit", label: "Edit Artisan Profile", who: "Artisan" },
  { key: "regions", label: "Pick Regions", who: "Artisan" },
  { key: "settings-client", label: "Account settings", who: "Client" },
  { key: "settings-artisan", label: "Account settings", who: "Artisan" },
  { key: "payouts", label: "Payouts and Reliability Record", who: "Artisan" },
] as const;

export type ScreenKey = (typeof SCREENS)[number]["key"];
export type Who = (typeof SCREENS)[number]["who"];
export const SCREEN_KEYS = SCREENS.map((s) => s.key) as ScreenKey[];
export const screenOf = (key: ScreenKey) => SCREENS.find((s) => s.key === key) ?? SCREENS[0];

export function rand(cents: number) {
  const whole = Math.trunc(cents / 100);
  const part = Math.abs(cents % 100);
  return `R${Math.abs(whole).toLocaleString("en-US")}${part ? `.${String(part).padStart(2, "0")}` : ""}`;
}

export const TODAY = new Date("2026-10-03T12:00:00+02:00");

// ---------- Identity Number ----------
// South African ID: 13 digits, YYMMDD birth date, checksum on digit 13 (Luhn).
// The birth date it carries must show the named person is at least 18.

function luhnCheckDigit(first12: string) {
  const d = first12.split("").map(Number);
  const odd = [0, 2, 4, 6, 8, 10].reduce((s, i) => s + d[i], 0);
  const evenNum = String([1, 3, 5, 7, 9, 11].map((i) => d[i]).join(""));
  const evenSum = String(Number(evenNum) * 2)
    .split("")
    .reduce((s, c) => s + Number(c), 0);
  return (10 - ((odd + evenSum) % 10)) % 10;
}

/** A well-formed test ID number for a birth date (YYYY-MM-DD). Not a real person's. */
export function makeSaId(birth: string, seq = "5083", citizen = "0") {
  const [y, m, d] = birth.split("-");
  const first12 = `${y.slice(2)}${m}${d}${seq}${citizen}8`;
  return `${first12}${luhnCheckDigit(first12)}`;
}

export function ageOn(birth: Date, on = TODAY) {
  let age = on.getFullYear() - birth.getFullYear();
  const had =
    on.getMonth() > birth.getMonth() ||
    (on.getMonth() === birth.getMonth() && on.getDate() >= birth.getDate());
  if (!had) age -= 1;
  return age;
}

export type IdCheck =
  | { state: "empty" }
  | { state: "partial"; have: number }
  | { state: "bad"; why: string }
  | { state: "ok"; birth: Date; age: number };

export function checkSaId(raw: string): IdCheck {
  const s = raw.replace(/\s/g, "");
  if (!s) return { state: "empty" };
  if (!/^\d+$/.test(s)) return { state: "bad", why: "An ID number is digits only." };
  if (s.length < 13) return { state: "partial", have: s.length };
  if (s.length > 13) return { state: "bad", why: "An ID number is 13 digits." };
  const yy = Number(s.slice(0, 2));
  const mm = Number(s.slice(2, 4));
  const dd = Number(s.slice(4, 6));
  const year = yy <= TODAY.getFullYear() % 100 ? 2000 + yy : 1900 + yy;
  const birth = new Date(year, mm - 1, dd);
  if (birth.getMonth() !== mm - 1 || birth.getDate() !== dd)
    return { state: "bad", why: "The first six digits are not a real birth date." };
  if (luhnCheckDigit(s.slice(0, 12)) !== Number(s[12]))
    return { state: "bad", why: "The last digit does not match the others. Check each digit." };
  const age = ageOn(birth);
  if (age < 18) return { state: "bad", why: "The named person must be at least 18." };
  return { state: "ok", birth, age };
}

/** Test numbers the sign-up prototype can fill in. */
export const EXAMPLE_ID = makeSaId("1988-04-12");
export const UNDERAGE_ID = makeSaId("2009-02-14", "5011");
export const HELD_ID = makeSaId("1990-01-01", "5122");

export const COUNTRIES = [
  "Zimbabwe",
  "Lesotho",
  "Malawi",
  "Mozambique",
  "Democratic Republic of the Congo",
  "Nigeria",
  "Other",
];

export function mask(id: string) {
  return `${id.slice(0, 4)}•••••••${id.slice(-2)}`;
}

// ---------- Regions ----------
// A Region is one of the City's eight Development Management Districts. Its edge is its set of
// suburbs. The City has 778; this is a sample, and which suburb sits in which district is a guess,
// not the seeded table.

export const DISTRICTS: { name: string; suburbs: string[] }[] = [
  {
    name: "Cape Flats",
    suburbs: [
      "Athlone",
      "Bonteheuwel",
      "Gugulethu",
      "Hanover Park",
      "Langa",
      "Lansdowne",
      "Manenberg",
      "Nyanga",
      "Philippi",
    ],
  },
  {
    name: "Mitchells Plain/Khayelitsha",
    suburbs: ["Khayelitsha", "Lentegeur", "Mandalay", "Mitchells Plain", "Site C", "Strandfontein"],
  },
  { name: "Helderberg", suburbs: ["Gordon's Bay", "Macassar", "Somerset West", "Strand"] },
  {
    name: "Table Bay",
    suburbs: [
      "Bo-Kaap",
      "Clifton",
      "Gardens",
      "Green Point",
      "Observatory",
      "Salt River",
      "Sea Point",
      "Woodstock",
    ],
  },
  {
    name: "Southern",
    suburbs: [
      "Claremont",
      "Constantia",
      "Fish Hoek",
      "Kenilworth",
      "Muizenberg",
      "Newlands",
      "Plumstead",
      "Simon's Town",
      "Wynberg",
    ],
  },
  { name: "Tygerberg", suburbs: ["Bellville", "Delft", "Elsies River", "Goodwood", "Parow"] },
  {
    name: "Blaauwberg",
    suburbs: [
      "Atlantis",
      "Bloubergstrand",
      "Melkbosstrand",
      "Milnerton",
      "Parklands",
      "Table View",
    ],
  },
  { name: "Northern", suburbs: ["Brackenfell", "Durbanville", "Kraaifontein", "Wallacedene"] },
];
export const REGION_NAMES = DISTRICTS.map((d) => d.name);
export const MAX_REGIONS = 3;

// ---------- Service Categories ----------

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

// ---------- Artisans on a browse list ----------

export type Listing = {
  name: string;
  available: boolean;
  category: Category;
  average?: number; // published average in this category; absent when there are no Reviews
  reviews: number; // published Reviews in this category
  regions: string[];
  badges: { name: string; validTo?: string }[]; // required badges for this category only
  services: string[];
  gasCurrent?: boolean; // Plumbing only
};

const plumber = { name: "Trained plumber" };
const refs = { name: "References" };
const gas = (validTo: string) => ({ name: "Authorised gas practitioner", validTo });

export const LISTINGS: Listing[] = [
  {
    name: "Sipho Ndlovu",
    available: true,
    category: "Plumbing",
    average: 4.8,
    reviews: 23,
    regions: ["Southern", "Table Bay", "Cape Flats"],
    badges: [plumber, gas("14 Mar 2027"), refs],
    services: ["Geyser replacement", "Leak detection", "Bathroom refits"],
    gasCurrent: true,
  },
  {
    name: "Riaan Coetzee",
    available: true,
    category: "Plumbing",
    average: 4.8,
    reviews: 8,
    regions: ["Tygerberg", "Southern"],
    badges: [plumber, refs],
    services: ["Drain clearing", "Tap and mixer fitting"],
    gasCurrent: false,
  },
  {
    name: "Zanele Dube",
    available: true,
    category: "Plumbing",
    average: 4.7,
    reviews: 15,
    regions: ["Table Bay", "Blaauwberg"],
    badges: [plumber, refs],
    services: ["Bathroom refits", "Toilet repairs"],
    gasCurrent: false,
  },
  {
    name: "Aaliyah Jacobs",
    available: true,
    category: "Plumbing",
    average: 4.5,
    reviews: 9,
    regions: ["Southern", "Helderberg"],
    badges: [plumber, gas("2 Aug 2027"), refs],
    services: ["Geyser service", "Gas hob fitting"],
    gasCurrent: true,
  },
  {
    name: "Ayanda Khumalo",
    available: true,
    category: "Plumbing",
    average: 4.5,
    reviews: 9,
    regions: ["Southern", "Helderberg"],
    badges: [plumber, gas("2 Aug 2027"), refs],
    services: ["Geyser replacement", "Gas installations"],
    gasCurrent: true,
  },
  {
    name: "Mpho Sithole",
    available: true,
    category: "Plumbing",
    average: 4.5,
    reviews: 6,
    regions: ["Cape Flats", "Mitchells Plain/Khayelitsha"],
    badges: [plumber, refs],
    services: ["Burst pipes", "Outside taps"],
    gasCurrent: false,
  },
  {
    name: "Pieter van Wyk",
    available: true,
    category: "Plumbing",
    reviews: 0,
    regions: ["Southern", "Northern"],
    badges: [plumber, gas("30 Nov 2026"), refs],
    services: ["Geysers", "Gas hobs"],
    gasCurrent: true,
  },
  {
    name: "Busisiwe Nkosi",
    available: true,
    category: "Plumbing",
    reviews: 0,
    regions: ["Blaauwberg"],
    badges: [plumber, refs],
    services: ["Leak repairs"],
    gasCurrent: false,
  },
  {
    name: "Gareth Adams",
    available: false,
    category: "Plumbing",
    average: 4.9,
    reviews: 40,
    regions: ["Southern"],
    badges: [plumber, gas("11 Jan 2027"), refs],
    services: ["Bathroom refits", "Gas installations"],
    gasCurrent: true,
  },

  {
    name: "Lindiwe Mokoena",
    available: true,
    category: "Electrical",
    average: 4.9,
    reviews: 31,
    regions: ["Table Bay", "Southern"],
    badges: [
      { name: "Registered person" },
      { name: "Electrical contractor", validTo: "30 Jun 2027" },
      refs,
    ],
    services: ["DB board upgrades", "Rewiring"],
  },
  {
    name: "Johan Pretorius",
    available: true,
    category: "Electrical",
    average: 4.4,
    reviews: 12,
    regions: ["Northern", "Tygerberg"],
    badges: [
      { name: "Registered person" },
      { name: "Electrical contractor", validTo: "18 Feb 2027" },
      refs,
    ],
    services: ["Plugs and lights", "Solar geyser wiring"],
  },
  {
    name: "Thabo Mahlangu",
    available: true,
    category: "Electrical",
    reviews: 0,
    regions: ["Cape Flats"],
    badges: [
      { name: "Registered person" },
      { name: "Electrical contractor", validTo: "4 Dec 2026" },
      refs,
    ],
    services: ["Fault finding"],
  },

  {
    name: "Fatima Davids",
    available: true,
    category: "Tiling",
    average: 4.7,
    reviews: 18,
    regions: ["Southern", "Cape Flats"],
    badges: [refs],
    services: ["Bathroom floors", "Splashbacks"],
  },
  {
    name: "Sipho Ndlovu",
    available: true,
    category: "Tiling",
    average: 4.6,
    reviews: 5,
    regions: ["Southern", "Table Bay", "Cape Flats"],
    badges: [refs],
    services: ["Bathroom floors"],
  },
  {
    name: "Kobus Marais",
    available: false,
    category: "Tiling",
    average: 4.2,
    reviews: 7,
    regions: ["Helderberg"],
    badges: [refs],
    services: ["Large-format floors"],
  },

  {
    name: "Nomsa Dlamini",
    available: true,
    category: "Painting",
    average: 4.6,
    reviews: 21,
    regions: ["Table Bay", "Southern"],
    badges: [refs],
    services: ["Interior repaints", "Damp-proofing"],
  },
  {
    name: "Yusuf Ebrahim",
    available: true,
    category: "Painting",
    reviews: 0,
    regions: ["Tygerberg"],
    badges: [refs],
    services: ["Exterior walls"],
  },
];

/** The browse order: Available for Jobs on, then published average, then Review count, then name. */
export function browseOrder(a: Listing, b: Listing) {
  if (a.available !== b.available) return a.available ? -1 : 1;
  const aHas = a.average !== undefined;
  const bHas = b.average !== undefined;
  if (aHas !== bHas) return aHas ? -1 : 1;
  if (aHas && bHas && a.average !== b.average) return (b.average as number) - (a.average as number);
  if (a.reviews !== b.reviews) return b.reviews - a.reviews;
  return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
}

export const inviteJob = {
  title: "Replace burst geyser and fit a gas hob",
  category: "Plumbing" as Category,
  region: "Southern",
  gas: true,
  quotes: 2,
};

// ---------- the Client's Jobs ----------

export type JobStatus =
  | "Draft"
  | "Open"
  | "Expired"
  | "Ended"
  | "Artisan Chosen"
  | "Paid"
  | "Awaiting release"
  | "Disputed"
  | "Completed"
  | "Cancelled"
  | "Returned"
  | "Out of view";

export const clientJobs: {
  title: string;
  category: Category;
  region?: string;
  status: JobStatus;
  with?: string;
  now?: string;
  sub: string;
}[] = [
  {
    title: "Replace burst geyser and fit a gas hob",
    category: "Plumbing",
    region: "Southern",
    status: "Artisan Chosen",
    with: "Sipho Ndlovu",
    now: "Pay R12,300",
    sub: "Unpaid it is Ended on 11 Oct, 12:15",
  },
  {
    title: "Re-tile shower floor, 1.2 m²",
    category: "Tiling",
    region: "Southern",
    status: "Open",
    now: "Choose a Quote",
    sub: "3 Quotes · matching ends 7 Oct",
  },
  {
    title: "Repaint lounge and passage",
    category: "Painting",
    status: "Draft",
    now: "Finish the draft",
    sub: "Needs a suburb and a photo of the work",
  },
  {
    title: "Outside tap and garden line",
    category: "Plumbing",
    region: "Southern",
    status: "Awaiting release",
    with: "Mpho Sithole",
    now: "Release",
    sub: "R1,850 left · silence Releases it 5 Oct, 11:00",
  },
  {
    title: "Bathroom basin and trap",
    category: "Plumbing",
    region: "Southern",
    status: "Disputed",
    with: "Zanele Dube",
    now: "Waiting on the Artisan",
    sub: "Dispute on R600 · settle by 6 Oct",
  },
  {
    title: "Rewire the back room",
    category: "Electrical",
    region: "Southern",
    status: "Paid",
    with: "Lindiwe Mokoena",
    now: "Waiting on the Artisan",
    sub: "Agreed start 12 Oct · 3 days",
  },
  {
    title: "Kitchen splashback",
    category: "Tiling",
    region: "Southern",
    status: "Completed",
    with: "Fatima Davids",
    now: "Write a Review",
    sub: "Review unread until both submit, or 14 Oct",
  },
  {
    title: "Garage door frame",
    category: "Welding and metalwork",
    region: "Southern",
    status: "Out of view",
    now: "Taken out of view",
    sub: "Waiting on a check. You cannot change it meanwhile",
  },
  {
    title: "Fix leaking roof valley",
    category: "Roofing",
    region: "Southern",
    status: "Expired",
    now: "Renew",
    sub: "No Quote was accepted in the open period",
  },
  {
    title: "Replace bathroom tap",
    category: "Plumbing",
    region: "Southern",
    status: "Ended",
    sub: "You ended it before paying",
  },
  {
    title: "Fit extractor fan",
    category: "Electrical",
    region: "Southern",
    status: "Cancelled",
    with: "Johan Pretorius",
    sub: "Cancelled 21 Sep, before Completion",
  },
  {
    title: "Build in the study shelves",
    category: "Carpentry and cabinetry",
    region: "Southern",
    status: "Returned",
    with: "Kobus Marais",
    sub: "The whole Payment was Returned",
  },
];

// ---------- the Artisan's own account ----------

export const me = {
  publicName: "Sipho Ndlovu",
  initials: "SN",
  about:
    "Geysers, leaks, and bathroom refits. Fifteen years on the job. I quote from your photos and description.",
  available: true,
  regions: ["Southern", "Table Bay", "Cape Flats"],
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
      ],
      evidence: ["Geyser bay", "Copper manifold", "Shower refit", "Gas hob install"],
    },
    {
      name: "Tiling" as Category,
      average: 4.6,
      reviews: 5,
      completed: 6,
      badges: [{ name: "References" }],
      evidence: ["Bathroom floor", "Kitchen splashback"],
    },
  ],
  optionalBadges: [
    { name: "Criminal record check" },
    { name: "Business insurance", validTo: "9 Jan 2027" },
  ],
  clientEmail: "thandi@example.co.za",
  email: "sipho.n@example.co.za",
  identity: makeSaId("1976-08-30", "5207"),
  rulesAccepted: "Version of 1 Sep 2026, accepted 14 Sep",
  rulesCurrent: true,
};

export const heldEmails = [
  "nomsa@example.co.za",
  "sipho.n@example.co.za",
  "staff@artisanconnect.example",
];

export const client = {
  publicName: "Thandi M.",
  email: "thandi@example.co.za",
  identity: makeSaId("1984-11-02", "5298"),
  rulesAccepted: "Version of 1 Sep 2026, accepted 2 Sep",
};

export const clientClosing = {
  blockers: [
    "An Artisan Chosen Job: Replace burst geyser and fit a gas hob",
    "Money still unreleased: Outside tap and garden line, R1,850",
    "An open Dispute: Bathroom basin and trap",
  ],
  effects: [
    "Your Open Jobs and drafts are Ended.",
    "Your published Reviews and your Client Relationships stay.",
    "Your Identity Number is not freed.",
  ],
};
export const artisanClosing = {
  blockers: [
    "An Artisan Chosen Job: Replace burst geyser and fit a gas hob",
    "An Engagement with money still unreleased: Geyser element and thermostat",
  ],
  effects: [
    "Your Sent Quotes are Withdrawn.",
    "Unanswered Job Matches and Artisan Invitations are withdrawn.",
    "Your Artisan Profile is taken out of view. Your published Reviews and Reliability Record stay.",
    "Your Identity Number is not freed.",
  ],
};

// ---------- Payouts and Reliability Record ----------

export type PayoutState = "Sent" | "Rejected" | "Waiting";
export const payouts: {
  at: string;
  job: string;
  client: string;
  release: number;
  feePct: number;
  state: PayoutState;
  note?: string;
}[] = [
  {
    at: "3 Oct, 09:00",
    job: "Geyser element and thermostat",
    client: "Jaco S.",
    release: 180000,
    feePct: 10,
    state: "Waiting",
    note: "Waiting: no current payout account",
  },
  {
    at: "2 Oct, 09:00",
    job: "Bathroom basin and trap",
    client: "Rashid K.",
    release: 320000,
    feePct: 10,
    state: "Rejected",
    note: "The bank rejected it. The account is not current",
  },
  {
    at: "28 Sep, 10:40",
    job: "Hot water cylinder valves",
    client: "Mark P.",
    release: 145000,
    feePct: 7,
    state: "Sent",
  },
  {
    at: "21 Sep, 15:12",
    job: "Outside tap and garden line",
    client: "Mark P.",
    release: 95000,
    feePct: 7,
    state: "Sent",
  },
  {
    at: "9 Sep, 11:02",
    job: "Replace kitchen mixer",
    client: "Fatima A.",
    release: 210000,
    feePct: 4,
    state: "Sent",
  },
];
export const feeOf = (release: number, pct: number) => Math.floor((release * pct) / 100 + 0.5);

export const reliability: { at: string; kind: string; job: string; effect: string }[] = [
  {
    at: "17 Aug",
    kind: "Cancellation",
    job: "Replace shower screen",
    effect: "You requested the Cancellation before Completion.",
  },
  {
    at: "2 Jul",
    kind: "Allocation in a Dispute",
    job: "Fix gate motor wiring",
    effect: "An Admin Returned R400 to the Client.",
  },
];

export type AccountState = "current" | "pending" | "rejected" | "none";
