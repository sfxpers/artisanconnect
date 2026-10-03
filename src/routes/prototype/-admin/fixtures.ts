// PROTOTYPE, throwaway. Fixtures for /prototype/admin.
// Facts follow the closed tickets on the ArtisanConnect launch map and CONTEXT.md:
// the four grants (#71), what reaches an Admin and by which grant (#86), Region edges (#88).
// Names, dates, and amounts are invented. No persistence, no server.
// Where the map has NOT decided something, the fixture marks it PROPOSAL and the screen shows the tag.

import { pctOf, rand } from "../-launch/fixtures";

export { pctOf, rand };

export const NOW = "19 Oct 2026, 09:00";

// ---------- grants and Admins ----------

export type Grant = "verification" | "operations" | "safety" | "finance";

export const GRANTS: { key: Grant; label: string; short: string; blurb: string }[] = [
  {
    key: "verification",
    label: "Verification",
    short: "Verification",
    blurb: "Checks, changed Profile names and photos, shared payout accounts, identity challenges, Identity Numbers.",
  },
  {
    key: "safety",
    label: "Trust and safety",
    short: "Trust & safety",
    blurb: "Every report, the refused-send flag, Leaving and conduct findings and their challenges.",
  },
  {
    key: "finance",
    label: "Finance and disputes",
    short: "Finance & disputes",
    blurb: "Cancellation, Dispute and identity-finding allocations, and chargebacks.",
  },
  {
    key: "operations",
    label: "Marketplace operations",
    short: "Operations",
    blurb: "Region edges. Nothing waits here: it holds powers, not a queue.",
  },
];

export const grantLabel = (g: Grant) => GRANTS.find((x) => x.key === g)!.label;

export type AdminId = "nomsa" | "kabelo" | "lerato";

export type Admin = { id: AdminId; name: string; email: string; grants: Grant[]; since: string; givenBy: string };

export const ADMINS: Admin[] = [
  {
    id: "nomsa",
    name: "Nomsa Dlamini",
    email: "nomsa@artisanconnect.example",
    grants: ["verification", "safety", "finance", "operations"],
    since: "1 Oct 2026",
    givenBy: "first Admin setup",
  },
  {
    id: "kabelo",
    name: "Kabelo Mahlangu",
    email: "kabelo@artisanconnect.example",
    grants: ["verification", "operations"],
    since: "2 Oct 2026",
    givenBy: "Nomsa Dlamini",
  },
  {
    id: "lerato",
    name: "Lerato Fourie",
    email: "lerato@artisanconnect.example",
    grants: ["safety"],
    since: "5 Oct 2026",
    givenBy: "Nomsa Dlamini",
  },
];

// ---------- screens ----------

export const PAGE_SCREENS = [
  { key: "queues", label: "Queues, by grant" },
  { key: "reports", label: "Reports" },
  { key: "audit", label: "Audit" },
  { key: "regions", label: "Region edges" },
  { key: "staff", label: "Staff and grants" },
  { key: "first", label: "First Admin" },
] as const;

export type PageKey = (typeof PAGE_SCREENS)[number]["key"];

// ---------- queue items ----------

export type ReadKind = "job" | "conversation" | "identity" | "figures" | "reliability";

export const READ_LABEL: Record<ReadKind, { label: string; audited: string }> = {
  job: { label: "The Job's record", audited: "" },
  conversation: { label: "The Conversation", audited: "Reading a Conversation is audited." },
  identity: { label: "The Identity Number", audited: "Reading an Identity Number is audited." },
  figures: { label: "Prior Quote figures", audited: "Reading prior Quote figures is audited." },
  reliability: { label: "The Reliability Record", audited: "Reading a Reliability Record is audited." },
};

export type Decision = {
  key: string;
  label: string;
  tone: "primary" | "danger" | "neutral";
  /** what happens, in the words of the closed tickets */
  effect: string;
  /** who is told, or null when nobody is */
  tell: string | null;
  /** a fixed reason the decision needs, if any */
  reasons?: string[];
};

export type Item = {
  id: string;
  grant: Grant;
  kind: string;
  object: string;
  title: string;
  /** the Account the decision falls on, as the Admin sees it */
  subject: string;
  at: string;
  count?: number;
  facts: [string, string][];
  /** the record of this item, oldest first */
  record: { at: string; text: string }[];
  /** the other things an Admin may open from this item, each audited when audited */
  reads: ReadKind[];
  decisions: Decision[];
  special?: "check" | "allocation" | "challenge" | "review" | "payout";
  /** what the Admin must not do here, said once */
  notes?: string[];
};

export const ITEMS: Item[] = [
  // ---- verification
  {
    id: "v1",
    grant: "verification",
    kind: "Check",
    object: "Registered person (Electrical)",
    title: "Registered person · Lindiwe Mokoena",
    subject: "Lindiwe Mokoena",
    at: "2 Oct, 09:14",
    special: "check",
    facts: [
      ["Artisan", "Lindiwe Mokoena (Artisan Account)"],
      ["Service Category", "Electrical"],
      ["Check", "Registered person: Department of Employment and Labour registration"],
      ["Submitted", "2 Oct, 09:14 · second submission"],
      ["Earlier", "Rejected 1 Oct: registration number not readable"],
      ["Signal", "None"],
    ],
    record: [
      { at: "29 Sep, 14:02", text: "Lindiwe opened an Artisan Account · Electrical" },
      { at: "30 Sep, 10:40", text: "Identity document accepted (Kabelo Mahlangu)" },
      { at: "1 Oct, 11:15", text: "Registered person submitted" },
      { at: "1 Oct, 15:30", text: "Rejected (Kabelo Mahlangu): not readable. She was told." },
      { at: "2 Oct, 09:14", text: "Registered person submitted again" },
    ],
    reads: ["identity"],
    decisions: [
      { key: "accept", label: "Accept the check", tone: "primary", effect: "The badge appears. If this completes the category she is verified for Electrical and may Quote.", tell: null },
      {
        key: "reject",
        label: "Reject the check",
        tone: "danger",
        effect: "The check is not current. She may submit again. A rejection is not a Suspension.",
        tell: "Lindiwe Mokoena is told the check was rejected.",
        reasons: ["Not readable", "Not in her name", "Expired or withdrawn", "Not this kind of document"],
      },
    ],
    notes: ["A third kind of evidence cannot be invented here.", "A certificate pulled from a Conversation is not evidence."],
  },
  {
    id: "v2",
    grant: "verification",
    kind: "Check",
    object: "Identity document",
    title: "Identity document · Zanele Sithole",
    subject: "Zanele Sithole",
    at: "2 Oct, 11:02",
    special: "check",
    facts: [
      ["Artisan", "Zanele Sithole (Artisan Account)"],
      ["Check", "Identity document"],
      ["Submitted", "2 Oct, 11:02 · first submission"],
      ["Identity Number type", "Passport, Zimbabwe"],
      ["Also needed", "Permission to work (a separate check)"],
    ],
    record: [{ at: "2 Oct, 11:02", text: "Identity document submitted" }],
    reads: ["identity"],
    decisions: [
      { key: "accept", label: "Accept the check", tone: "primary", effect: "The badge appears.", tell: null },
      {
        key: "reject",
        label: "Reject the check",
        tone: "danger",
        effect: "The check is not current. She may submit again.",
        tell: "Zanele Sithole is told the check was rejected.",
        reasons: ["Not readable", "Not her document", "Expired", "Not this kind of document"],
      },
    ],
  },
  {
    id: "v3",
    grant: "verification",
    kind: "Changed Profile",
    object: "Artisan Profile photo",
    title: "New Profile photo · Sipho Ndlovu",
    subject: "Sipho Ndlovu",
    at: "3 Oct, 08:30",
    special: "check",
    facts: [
      ["Artisan", "Sipho Ndlovu (Artisan Account)"],
      ["Changed", "Profile photo (the old photo stays live until this is decided)"],
      ["Signal", "This picture is also on the Artisan Profile of Ayanda Khumalo"],
    ],
    record: [
      { at: "3 Oct, 08:30", text: "Sipho changed his Profile photo. The old photo stays live." },
      { at: "3 Oct, 08:30", text: "Signal: the picture is also on another Artisan's Profile" },
    ],
    reads: [],
    decisions: [
      { key: "accept", label: "Accept the new photo", tone: "primary", effect: "The new photo replaces the old.", tell: null },
      {
        key: "reject",
        label: "Reject the new photo",
        tone: "danger",
        effect: "The old photo stays live. He may change it again.",
        tell: "Sipho Ndlovu is told the new photo was rejected.",
        reasons: ["Not him", "Not a picture of a person", "Same picture as another Artisan"],
      },
    ],
  },
  {
    id: "v4",
    grant: "verification",
    kind: "Flag",
    object: "Payout account on two Artisan Accounts",
    title: "One payout account on two Artisan Accounts",
    subject: "Sipho Ndlovu and Themba Ndlovu",
    at: "3 Oct, 16:42",
    special: "payout",
    facts: [
      ["Raised by", "The platform. No reporter."],
      ["Payout account", "FNB ····4417 · account holder N. Ndlovu"],
      ["Accounts", "Sipho Ndlovu · Plumbing · Southern\nThemba Ndlovu · Plumbing · Southern"],
      ["Both accepted", "Sipho 20 Sep · Themba 2 Oct"],
    ],
    record: [
      { at: "20 Sep, 10:11", text: "Sipho's payout account accepted" },
      { at: "2 Oct, 15:50", text: "Themba's payout account accepted" },
      { at: "3 Oct, 16:42", text: "Flag raised: one payout account on two Artisan Accounts" },
    ],
    reads: ["identity"],
    decisions: [
      {
        key: "keep",
        label: "Keep both current",
        tone: "neutral",
        effect: "The flag closes and nothing else happens.",
        tell: null,
      },
      {
        key: "not-current",
        label: "Make a payout account not current",
        tone: "danger",
        effect: "That Account's Payouts wait until it has a current payout account. Money already Released is not touched.",
        tell: "The Artisan whose payout account is made not current is told.",
        reasons: ["Not in that Artisan's name", "Account is another Artisan's"],
      },
    ],
    notes: [
      "PROPOSAL: the map says only that this flag goes to verification. What verification may decide on it is not decided.",
    ],
  },
  {
    id: "v5",
    grant: "verification",
    kind: "Suspension challenge",
    object: "Identity cause",
    title: "Challenge to an identity Suspension · Pieter van Wyk",
    subject: "Pieter van Wyk",
    at: "5 Oct, 12:05",
    special: "challenge",
    facts: [
      ["Account", "Pieter van Wyk (Artisan Account)"],
      ["Suspension recorded", "3 Oct, 14:20 by Nomsa Dlamini"],
      ["Cause", "Identity Number found not to be the named person's"],
      ["Other cause", "None"],
      ["Challenge", "Made 5 Oct, 12:05 (one challenge only; within 7 × 24 hours of being told)"],
      ["Money held", "1 paid Engagement, 1 Artisan Chosen Job"],
    ],
    record: [
      { at: "3 Oct, 14:20", text: "Identity finding and Suspension recorded (Nomsa Dlamini)" },
      { at: "3 Oct, 14:21", text: "Profile out of view. Sent Quote on one Job made Void. Held: paid Engagement, Artisan Chosen Job." },
      { at: "3 Oct, 14:21", text: "Pieter van Wyk told. The other parties told that the Account is suspended, not why." },
      { at: "5 Oct, 12:05", text: "Challenge made" },
    ],
    reads: ["identity", "reliability"],
    decisions: [
      {
        key: "cleared",
        label: "The number is theirs: end the identity cause",
        tone: "primary",
        effect:
          "The Suspension ends if no other cause remains. The hold lifts: an unreleased portion after Completion gets a fresh 3 × 24 hours of silence, an Artisan Chosen Job a fresh 7 × 24 hours to be paid. The Profile comes back. Void Quotes do not return.",
        tell: "Pieter van Wyk is told the Suspension ended. The other parties are told the Account is no longer suspended.",
      },
      {
        key: "stands",
        label: "The finding stands",
        tone: "danger",
        effect:
          "The Suspension stays. It was his one challenge. Finance and disputes then allocates each held Engagement, and the Account is closed afterwards.",
        tell: null,
      },
    ],
    notes: ["The Admin who recorded the Suspension cannot hear its challenge."],
  },
  // ---- trust and safety
  {
    id: "s1",
    grant: "safety",
    kind: "Report",
    object: "Review",
    title: "Review · Personal data · 3 reports",
    subject: "Ruan B. (author)",
    at: "6 Oct, 07:45",
    count: 3,
    special: "review",
    facts: [
      ["Object", "Review by Ruan B. about Ayanda Khumalo · Plumbing · 1 of 5 overall"],
      ["Reason", "Personal data"],
      ["Reports", "3, folded into this one item. One decision closes all three."],
      ["Version reported", "The Review as published 28 Sep"],
      ["Author's Account", "No warnings"],
    ],
    record: [
      { at: "28 Sep, 18:20", text: "Review published (both Reviews were in)" },
      { at: "4 Oct, 20:11", text: "Report 1 · Personal data" },
      { at: "5 Oct, 08:40", text: "Report 2 · Personal data" },
      { at: "6 Oct, 07:45", text: "Report 3 · Personal data" },
    ],
    reads: ["job"],
    decisions: [
      {
        key: "remove",
        label: "Remove the whole Review",
        tone: "danger",
        effect: "The Review leaves the Profile and the average. No partial edit and no appeal. Removal is not a Suspension.",
        tell: "Ruan B. is told the Review was removed, with the reason category.",
        reasons: ["Fraud", "Abuse", "Personal data", "Policy"],
      },
      { key: "leave", label: "Leave it", tone: "neutral", effect: "The item closes and nothing else happens.", tell: null },
    ],
    notes: ["A low score is not a reason to remove a Review.", "A dismissed report tells no one. The reporter is told only that it was received."],
  },
  {
    id: "s2",
    grant: "safety",
    kind: "Report",
    object: "Message in a Conversation",
    title: "Message · Asking to leave the platform",
    subject: "Kyle J. (sender)",
    at: "9 Oct, 15:12",
    facts: [
      ["Object", "A message by Kyle J. in his Conversation with Ayanda Khumalo"],
      ["Reason", "Asking to leave the platform"],
      ["Reported by", "Ayanda Khumalo"],
      ["Before Payment", "Yes. The send was not refused, so no pattern matched."],
      ["Account's ladder", "No warnings"],
    ],
    record: [
      { at: "9 Oct, 15:02", text: "Message sent" },
      { at: "9 Oct, 15:12", text: "Reported: asking to leave the platform" },
    ],
    reads: ["conversation"],
    decisions: [
      {
        key: "leaving",
        label: "This is Leaving",
        tone: "danger",
        effect: "The ladder binds: warning 1 of 3. Admin does not pick another sanction.",
        tell: "Kyle J. is told of the warning.",
      },
      { key: "not", label: "This is not Leaving", tone: "neutral", effect: "The item closes and nothing else happens.", tell: null },
    ],
    notes: ["A Conversation opens only from a report, a Leaving item, or a false-evidence report."],
  },
  {
    id: "s3",
    grant: "safety",
    kind: "Flag",
    object: "Third refused send",
    title: "Third refused send · one Account, one Job",
    subject: "Fatima A.",
    at: "12 Oct, 10:20",
    facts: [
      ["Raised by", "The platform. No reporter."],
      ["Account", "Fatima A. (Client Account)"],
      ["Job", "Re-tile shower floor, 1.2 m²"],
      ["Surface", "Conversation"],
      ["Pattern kind", "Phone number, phone number, link"],
      ["Refusal times", "12 Oct 10:04 · 10:11 · 10:19"],
      ["Refused text", "Not kept"],
    ],
    record: [
      { at: "12 Oct, 10:04", text: "Send refused (phone number)" },
      { at: "12 Oct, 10:11", text: "Send refused (phone number)" },
      { at: "12 Oct, 10:19", text: "Send refused (link)" },
      { at: "12 Oct, 10:20", text: "Flag raised. It counts as a Leaving item." },
    ],
    reads: ["conversation"],
    decisions: [
      {
        key: "leaving",
        label: "This is Leaving",
        tone: "danger",
        effect: "The ladder binds: warning 1 of 3.",
        tell: "Fatima A. is told of the warning.",
      },
      { key: "not", label: "This is not Leaving", tone: "neutral", effect: "The item closes. Nothing else happens.", tell: null },
    ],
  },
  {
    id: "s4",
    grant: "safety",
    kind: "Report",
    object: "Paid Engagement",
    title: "Paid Engagement · Threat or abuse",
    subject: "Jaco S.",
    at: "14 Oct, 19:30",
    facts: [
      ["Object", "Geyser element and thermostat · Engagement · Paid"],
      ["Reason", "Threat or abuse"],
      ["Reported by", "Sipho Ndlovu"],
      ["Note", "Client shouted at me on site and said he would withhold the Release."],
    ],
    record: [
      { at: "29 Sep, 11:00", text: "Engagement paid" },
      { at: "14 Oct, 19:30", text: "Reported by Sipho Ndlovu: threat or abuse" },
    ],
    reads: ["conversation", "job"],
    decisions: [
      {
        key: "conduct",
        label: "Record a conduct finding",
        tone: "danger",
        effect:
          "A Suspension, decided in one step, with no ladder. It never touches money. A different person hears its challenge.",
        tell: "Jaco S. is told he is suspended and the reason category. His open Jobs and Quotes are affected.",
      },
      { key: "none", label: "No finding", tone: "neutral", effect: "The item closes. Nothing else happens.", tell: null },
    ],
  },
  // ---- finance and disputes
  {
    id: "f1",
    grant: "finance",
    kind: "Dispute allocation",
    object: "Engagement · what is still held",
    title: "Dispute allocation · R1,300 held",
    subject: "Sipho Ndlovu / Thandi M.",
    at: "18 Oct, 10:00",
    special: "allocation",
    facts: [
      ["Engagement", "Replace burst geyser and fit a gas hob · Plumbing"],
      ["Accepted Quote", "R12,000 · Protection Fee R300 (never Released)"],
      ["Completed", "14 Oct, 16:20 · Released so far R6,000 + R3,500 by silence"],
      ["Disputed", "R2,500 on 16 Oct · reason: hob not through the isolator, cold-feed joint weeps"],
      ["Artisan Returned", "R1,200 on 17 Oct"],
      ["Still held", "R1,300 after the 2 × 24 hours to settle ended 18 Oct 10:00"],
      ["Artisan Fee rate", "10% (no earlier Completed Engagement in this Client Relationship)"],
    ],
    record: [
      { at: "6 Oct, 14:03", text: "Payment R12,300" },
      { at: "14 Oct, 16:20", text: "Completion: note, 3 photos, certificate of conformity" },
      { at: "15 Oct, 08:45", text: "Client Released R6,000" },
      { at: "16 Oct, 10:00", text: "Dispute opened on R2,500" },
      { at: "17 Oct, 09:10", text: "Artisan Returned R1,200" },
      { at: "17 Oct, 16:20", text: "R3,500 Released by silence" },
      { at: "18 Oct, 10:00", text: "Settle window ended. R1,300 still held. Allocation item raised." },
    ],
    reads: ["job", "conversation", "figures"],
    decisions: [
      {
        key: "allocate",
        label: "Record the allocation",
        tone: "primary",
        effect: "The amounts are Released and Returned as set. No clock and no appeal.",
        tell: "Both parties are told what was Released and what was Returned.",
      },
    ],
    notes: ["They may not Cancel, order rework, or Release except as this allocation."],
  },
  {
    id: "f2",
    grant: "finance",
    kind: "Cancellation allocation",
    object: "Engagement · No-show finding",
    title: "Cancellation allocation · no-show to decide",
    subject: "Ayanda Khumalo / Lerato K.",
    at: "15 Oct, 12:31",
    facts: [
      ["Engagement", "Shower mixer and screen · Plumbing"],
      ["Requested by", "The Client (Lerato K.) on 15 Oct, before Completion"],
      ["Agreed start", "8 Oct"],
      ["Unreleased", "R4,200 accepted Quote portion (Protection Fee R105)"],
      ["No-show", "Client says the Artisan had not attended by the agreed start date"],
    ],
    record: [
      { at: "1 Oct, 09:00", text: "Payment R4,305" },
      { at: "15 Oct, 12:30", text: "Client requested Cancellation" },
      { at: "15 Oct, 12:31", text: "Allocation item raised" },
    ],
    reads: ["job", "conversation", "figures"],
    decisions: [
      {
        key: "noshow",
        label: "Allocate · find a no-show",
        tone: "danger",
        effect: "The unreleased Quote is allocated. The no-show goes on the Artisan's Reliability Record.",
        tell: "Both parties are told the allocation. The Artisan is told of the no-show.",
      },
      {
        key: "plain",
        label: "Allocate · no no-show",
        tone: "neutral",
        effect: "The unreleased Quote is allocated. A Client's Cancellation is not on any record.",
        tell: "Both parties are told the allocation.",
      },
    ],
  },
  {
    id: "f3",
    grant: "finance",
    kind: "Flag",
    object: "Chargeback",
    title: "Chargeback · after Completion",
    subject: "Jaco S.",
    at: "17 Oct, 07:12",
    facts: [
      ["Raised by", "The platform. No reporter."],
      ["Engagement", "Geyser element and thermostat"],
      ["Amount", "R2,730"],
      ["When", "After Completion"],
    ],
    record: [{ at: "17 Oct, 07:12", text: "Chargeback received. Flag raised." }],
    reads: ["job"],
    decisions: [
      {
        key: "reviewed",
        label: "Record it as reviewed",
        tone: "neutral",
        effect: "PROPOSAL: the map decides the money rule for a chargeback, but not what finance and disputes records on the flag.",
        tell: null,
      },
    ],
  },
];

export const itemById = (id: string) => ITEMS.find((i) => i.id === id);
export const ITEM_IDS = ITEMS.map((i) => i.id);

// ---------- Job record, for a read from an allocation ----------

export const JOB_RECORD_FOR_F1 = [
  { at: "2 Oct, 18:20", text: "Job posted · Plumbing · gas work yes · Southern · Home" },
  { at: "4 Oct, 12:15", text: "Quote Accepted · R12,000 · dates 12 Oct, 2 days" },
  { at: "6 Oct, 14:03", text: "Payment R12,300" },
  { at: "12 Oct, 13:00", text: "Updated Quote (+R850) rejected by the Client" },
  { at: "14 Oct, 16:20", text: "Completion · certificate of conformity attached" },
  { at: "16 Oct, 10:00", text: "Dispute opened on R2,500" },
];

export const CONVERSATION_FOR_F1: { who: string; text: string; at: string }[] = [
  { who: "Thandi M.", text: "Joint under the sink is weeping again.", at: "16 Oct, 09:41" },
  { who: "Sipho Ndlovu", text: "I tightened that on the day. Send a photo please.", at: "16 Oct, 09:58" },
  { who: "Thandi M.", text: "Hob also isn't through the isolator like the Quote says.", at: "16 Oct, 10:03" },
  { who: "Sipho Ndlovu", text: "The isolator is outside, on the bottle line. I'll Return part of it.", at: "17 Oct, 09:05" },
];

export const QUOTE_FIGURES_FOR_F1 = [
  { who: "Sipho Ndlovu", quote: 1200000, status: "Accepted" },
  { who: "Ayanda Khumalo", quote: 1045000, status: "Not chosen" },
  { who: "Pieter van Wyk", quote: 1390000, status: "Not chosen" },
];

export const IDENTITY_NUMBERS: Record<string, string> = {
  v1: "810203 5010 08 6",
  v2: "Passport ZW 0481 2237 (Zimbabwe)",
  v4: "Both accounts: N. Ndlovu",
  v5: "800101 5800 08 5",
};

export const BLOCK_GLOSS: Record<ReadKind, string> = {
  job: "Read the record of the Job. No Conversation and no Identity Number.",
  conversation: "Open the Conversation to read. An Admin may read it and may not speak in it.",
  identity: "Read the Identity Number.",
  figures: "Read the other Quote figures on the Job.",
  reliability: "Read the Artisan's Reliability Record.",
};

// ---------- audit ----------

export type AuditRow = {
  at: string;
  who: string;
  grant: Grant;
  what: string;
  object: string;
  kind: "decision" | "read" | "power";
};

export const AUDIT_SEED: AuditRow[] = [
  { at: "3 Oct, 14:20", who: "Nomsa Dlamini", grant: "verification", kind: "decision", what: "Recorded an identity finding and a Suspension", object: "Pieter van Wyk" },
  { at: "3 Oct, 14:19", who: "Nomsa Dlamini", grant: "verification", kind: "read", what: "Read an Identity Number", object: "Pieter van Wyk" },
  { at: "2 Oct, 15:12", who: "Kabelo Mahlangu", grant: "verification", kind: "decision", what: "Accepted a check", object: "Payout account · Themba Ndlovu" },
  { at: "1 Oct, 15:30", who: "Kabelo Mahlangu", grant: "verification", kind: "decision", what: "Rejected a check · Not readable", object: "Registered person · Lindiwe Mokoena" },
  { at: "30 Sep, 10:40", who: "Kabelo Mahlangu", grant: "verification", kind: "decision", what: "Accepted a check", object: "Identity document · Lindiwe Mokoena" },
  { at: "29 Sep, 17:02", who: "Lerato Fourie", grant: "safety", kind: "read", what: "Opened a Conversation, from a report", object: "Engagement · Cistern replacement" },
  { at: "29 Sep, 17:20", who: "Lerato Fourie", grant: "safety", kind: "decision", what: "Report closed, no finding", object: "Message · Threat or abuse" },
  { at: "26 Sep, 09:12", who: "Nomsa Dlamini", grant: "finance", kind: "decision", what: "Allocated a Cancellation · no no-show", object: "Engagement · Outside tap and garden line" },
  { at: "25 Sep, 16:40", who: "Nomsa Dlamini", grant: "operations", kind: "power", what: "Added a suburb to a district", object: "Pinehurst · Tygerberg" },
  { at: "1 Oct, 08:00", who: "Nomsa Dlamini", grant: "operations", kind: "power", what: "Created first Admin (setup)", object: "Nomsa Dlamini · all four grants" },
];

// ---------- reports ----------

export const REPORT_PERIODS = [
  { key: "30", label: "Last 30 days", factor: 1 },
  { key: "90", label: "Last 90 days", factor: 2.7 },
  { key: "all", label: "Since launch", factor: 4.1 },
] as const;

export const REPORT_ROWS: { label: string; base: number; kind: "count" | "money" | "rate" }[] = [
  { label: "Jobs posted", base: 142, kind: "count" },
  { label: "Jobs receiving Quotes", base: 117, kind: "count" },
  { label: "Paid Engagements", base: 63, kind: "count" },
  { label: "Payment value", base: 78_450_000, kind: "money" },
  { label: "Protection Fee", base: 1_961_250, kind: "money" },
  { label: "Artisan Fee", base: 7_212_000, kind: "money" },
  { label: "Repeat Engagement rate", base: 18, kind: "rate" },
  { label: "Completion rate", base: 91, kind: "rate" },
  { label: "Dispute rate", base: 6, kind: "rate" },
  { label: "Leaving count (found Leavings)", base: 2, kind: "count" },
  { label: "Refused-send count", base: 31, kind: "count" },
];

// ---------- Regions ----------

export const DISTRICTS: { name: string; suburbs: number; jobsEver: number; artisans: number }[] = [
  { name: "Blaauwberg", suburbs: 78, jobsEver: 9, artisans: 6 },
  { name: "Cape Flats", suburbs: 96, jobsEver: 17, artisans: 14 },
  { name: "Helderberg", suburbs: 74, jobsEver: 6, artisans: 5 },
  { name: "Mitchells Plain/Khayelitsha", suburbs: 80, jobsEver: 7, artisans: 8 },
  { name: "Northern", suburbs: 118, jobsEver: 12, artisans: 9 },
  { name: "Southern", suburbs: 118, jobsEver: 34, artisans: 21 },
  { name: "Table Bay", suburbs: 110, jobsEver: 41, artisans: 24 },
  { name: "Tygerberg", suburbs: 104, jobsEver: 16, artisans: 12 },
];

export const SOME_SUBURBS: Record<string, string[]> = {
  Southern: ["Kenilworth", "Claremont", "Wynberg", "Plumstead", "Constantia"],
  "Table Bay": ["Gardens", "Woodstock", "Sea Point", "Observatory"],
  Tygerberg: ["Bellville", "Durbanville", "Parow", "Pinehurst"],
};

// ---------- staff (the grant mechanics are all PROPOSAL) ----------

export type Staff = Admin & { invited?: boolean };
