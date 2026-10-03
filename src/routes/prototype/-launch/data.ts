// PROTOTYPE: throwaway fixtures for /prototype/launch. In memory, no persistence.
// One Job (a Plumbing Job in Rondebosch) walked through every state, seen by the Client or the Artisan.
// Rules come from CONTEXT.md and the closed map tickets; only the layout is being tried.

export type Viewer = "client" | "artisan";

export const JOB_STATES = [
  { key: "posting", label: "Posting a Job" },
  { key: "quotes", label: "Comparing Quotes" },
  { key: "hire", label: "Hire (paying)" },
  { key: "paid", label: "Paid" },
  { key: "started-claimed", label: "“I've started” (24h to answer)" },
  { key: "work-started", label: "Work started" },
  { key: "updated-quote", label: "Updated Quote pending" },
  { key: "refund", label: "Artisan's Refund" },
  { key: "awaiting-approval", label: "Awaiting approval" },
  { key: "fix-requested", label: "Fix requested" },
  { key: "disputed", label: "Disputed" },
  { key: "completed", label: "Completed" },
  { key: "cancelled-before", label: "Cancelled before Work started" },
  { key: "cancelled-after", label: "Cancelled after Work started" },
] as const;

export type JobState = (typeof JOB_STATES)[number]["key"];

export const ADMIN_ITEMS = [
  { key: "dispute", label: "Dispute" },
  { key: "verification", label: "Verification" },
] as const;

export type AdminItemKey = (typeof ADMIN_ITEMS)[number]["key"];

export const rand = (n: number) =>
  `R${n.toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

// ---------- the Job ----------

export const CLIENT = { name: "Thandi Mokoena", short: "Thandi M." };
export const ARTISAN = { name: "Sipho Dlamini", trading: "Sipho's Plumbing" };

export const JOB = {
  title: "Replace burst geyser and reroute the overflow pipe",
  category: "Plumbing",
  suburb: "Rondebosch",
  region: "Southern",
  siteType: "Home",
  gas: false,
  description:
    "150L geyser in the roof burst on Sunday. Ceiling is wet. Need it replaced and the overflow rerouted outside.",
  photos: 4,
};

export interface QuoteCard {
  id: string;
  artisan: string;
  trading: string;
  rating: number | null;
  completed: number;
  badges: string[];
  labour: number;
  materials: number;
  suppliedBy: "Artisan" | "Client";
  start: string;
  days: number;
  warranty: string | null;
  scope: string;
  status: "Sent" | "Hired" | "Declined" | "Held";
}

export const QUOTES: QuoteCard[] = [
  {
    id: "q1",
    artisan: ARTISAN.name,
    trading: ARTISAN.trading,
    rating: 4.8,
    completed: 37,
    badges: ["ID", "Plumbing", "Trained plumber", "Police clearance"],
    labour: 4200,
    materials: 6800,
    suppliedBy: "Artisan",
    start: "Mon 29 Sep",
    days: 2,
    warranty: "12 months on workmanship",
    scope:
      "Remove old geyser, fit 150L Kwikot, new valve set and drip tray, reroute overflow to outside wall.",
    status: "Sent",
  },
  {
    id: "q2",
    artisan: "Ayesha Khan",
    trading: "Cape Pipe Co.",
    rating: 4.5,
    completed: 12,
    badges: ["ID", "Plumbing", "Trained plumber"],
    labour: 3800,
    materials: 7900,
    suppliedBy: "Artisan",
    start: "Thu 2 Oct",
    days: 1,
    warranty: "6 months",
    scope: "Replace geyser and valves. Overflow rerouted. Ceiling not included.",
    status: "Sent",
  },
  {
    id: "q3",
    artisan: "Marius van Wyk",
    trading: "Marius van Wyk",
    rating: null,
    completed: 0,
    badges: ["ID", "Plumbing", "Trained plumber"],
    labour: 5200,
    materials: 0,
    suppliedBy: "Client",
    start: "Tue 30 Sep",
    days: 2,
    warranty: null,
    scope: "Labour only. Client buys geyser and fittings from my list.",
    status: "Sent",
  },
];

const HIRED = QUOTES[0];
const ARTISAN_FEE_RATE = 0.1; // first Engagement in this Client Relationship

export const UPDATED = {
  labour: 4800,
  materials: 7400,
  reason: "Roof truss under the geyser is rotten; needs a new platform.",
};

// ---------- view model ----------

export type Actor = "client" | "artisan" | "platform";

export interface RecordRow {
  at: string;
  actor: Actor;
  title: string;
  detail?: string;
  /** Shown in the Conversation as a row that is not speech. */
  inConversation?: boolean;
  only?: Viewer;
}

export interface Message {
  at: string;
  from: Actor;
  text: string;
  attachment?: string;
  held?: boolean;
}

export type MoneyState =
  | "Not paid"
  | "Held"
  | "Released"
  | "Refunded"
  | "Releases at Approval"
  | "Releases at Work started"
  | "Refunds in 72h"
  | "Held in Dispute"
  | "Kept";

export interface MoneyLine {
  label: string;
  amount: number;
  state: MoneyState;
  /** Artisan only: after the Artisan Fee. */
  net?: number;
  note?: string;
}

export interface LedgerRow {
  at: string;
  what: string;
  amount: number;
  direction: "in" | "out" | "fee";
}

export interface Clock {
  label: string;
  elapsed: number; // 0..1
  remaining: string;
}

export type Tone = "primary" | "secondary" | "danger";
export interface Action {
  label: string;
  tone: Tone;
}

export type NowPanel =
  | "post"
  | "quotes"
  | "pay"
  | "write-quote"
  | "own-quote"
  | "completion"
  | "refund"
  | "updated-quote-review"
  | "updated-quote-pending"
  | "approve"
  | "dispute-status"
  | "review"
  | "none";

export interface Now {
  heading: string;
  lines: string[];
  actions: Action[];
  panel: NowPanel;
  /** Who is told if the viewer acts. */
  tells?: string;
}

export type StageKey = "post" | "quotes" | "hire" | "start" | "complete" | "approve" | "review";
export const STAGES: { key: StageKey; label: string }[] = [
  { key: "post", label: "Post" },
  { key: "quotes", label: "Quotes" },
  { key: "hire", label: "Hire" },
  { key: "start", label: "Work started" },
  { key: "complete", label: "Completion" },
  { key: "approve", label: "Approval" },
  { key: "review", label: "Reviews" },
];

export interface JobView {
  state: JobState;
  viewer: Viewer;
  jobStatus: "Draft" | "Open" | "Hired";
  engagement: string | null;
  with: string | null;
  currentStage: StageKey;
  /** Stages crossed out, e.g. after a Cancellation. */
  stoppedAt?: StageKey;
  record: RecordRow[];
  messages: Message[];
  money: MoneyLine[] | null;
  ledger: LedgerRow[];
  clock: Clock | null;
  now: Now;
  quotes: QuoteCard[];
  composer: { disabled?: string; refused?: { draft: string; reason: string } };
}

// ---------- record segments ----------

const seg = {
  posted: [
    {
      at: "Sun 21 Sep 18:02",
      actor: "client",
      title: "Job posted",
      detail: "Open for 14 days, offered in Batches",
    },
    {
      at: "Sun 21 Sep 18:03",
      actor: "platform",
      title: "Batch 1 offered to 10 Artisans",
      only: "client",
    },
    {
      at: "Mon 22 Sep 18:03",
      actor: "platform",
      title: "Batch 2 offered to 10 Artisans",
      only: "client",
    },
    {
      at: "Sun 21 Sep 19:40",
      actor: "platform",
      title: "Job Match: offered to you",
      only: "artisan",
    },
  ],
  quotes: [
    {
      at: "Mon 22 Sep 08:15",
      actor: "artisan",
      title: "Quote sent by Sipho's Plumbing",
      detail: rand(11000),
      inConversation: true,
    },
    {
      at: "Mon 22 Sep 14:30",
      actor: "platform",
      title: "Quote sent by Cape Pipe Co.",
      detail: rand(11700),
      only: "client",
    },
    {
      at: "Tue 23 Sep 09:10",
      actor: "platform",
      title: "Quote sent by Marius van Wyk",
      detail: rand(5200),
      only: "client",
    },
  ],
  hire: [
    {
      at: "Wed 24 Sep 20:11",
      actor: "client",
      title: "Hired Sipho's Plumbing",
      detail: "Other Quotes Declined",
      inConversation: true,
    },
    {
      at: "Wed 24 Sep 20:11",
      actor: "client",
      title: "Payment",
      detail: `${rand(11550)} incl. Protection Fee ${rand(550)}`,
      only: "client",
    },
    {
      at: "Wed 24 Sep 20:11",
      actor: "client",
      title: "Payment received",
      detail: `${rand(11000)} held until Release`,
      only: "artisan",
    },
  ],
  claimed: [
    {
      at: "Mon 29 Sep 07:42",
      actor: "artisan",
      title: "“I've started”",
      detail: "Client has 24 hours to answer “Not started”",
      inConversation: true,
    },
  ],
  started: [
    {
      at: "Mon 29 Sep 08:05",
      actor: "client",
      title: "Work started",
      detail: `Materials ${rand(6800)} released`,
      inConversation: true,
    },
  ],
  uq: [
    {
      at: "Mon 29 Sep 13:20",
      actor: "artisan",
      title: "Updated Quote proposed",
      detail: `Labour ${rand(4200)} → ${rand(4800)}, Materials ${rand(6800)} → ${rand(7400)}`,
      inConversation: true,
    },
  ],
  refund: [
    {
      at: "Tue 30 Sep 10:00",
      actor: "artisan",
      title: "Refund",
      detail: `${rand(500)} of the Labour refunded`,
      inConversation: true,
    },
  ],
  completion: [
    {
      at: "Tue 30 Sep 16:45",
      actor: "artisan",
      title: "Completion",
      detail: "Note, 4 after-work photos",
      inConversation: true,
    },
  ],
  fix: [
    {
      at: "Wed 1 Oct 09:30",
      actor: "client",
      title: "Fix request",
      detail: "“Pressure valve still drips into the tray.”",
      inConversation: true,
    },
  ],
  dispute: [
    {
      at: "Wed 1 Oct 09:30",
      actor: "client",
      title: "Dispute opened",
      detail: `${rand(2000)} of the Labour held, with 3 photos`,
      inConversation: true,
    },
  ],
  approved: [
    {
      at: "Wed 1 Oct 11:02",
      actor: "client",
      title: "Approval",
      detail: `Labour ${rand(4200)} released`,
      inConversation: true,
    },
    {
      at: "Wed 1 Oct 11:02",
      actor: "platform",
      title: "Completed",
      detail: "Review window open for 7 days",
    },
  ],
  cancelBefore: [
    {
      at: "Fri 26 Sep 12:00",
      actor: "client",
      title: "Cancelled",
      detail: `${rand(11000)} refunded at once. Protection Fee kept.`,
      inConversation: true,
    },
  ],
  cancelAfter: [
    {
      at: "Tue 30 Sep 09:00",
      actor: "client",
      title: "Cancelled",
      detail: `Materials stay with the Artisan. Labour ${rand(4200)} refunds in 72 hours unless the Artisan opens a Dispute.`,
      inConversation: true,
    },
  ],
} satisfies Record<string, RecordRow[]>;

const segmentsFor: Record<JobState, (keyof typeof seg)[]> = {
  posting: [],
  quotes: ["posted", "quotes"],
  hire: ["posted", "quotes"],
  paid: ["posted", "quotes", "hire"],
  "started-claimed": ["posted", "quotes", "hire", "claimed"],
  "work-started": ["posted", "quotes", "hire", "claimed", "started"],
  "updated-quote": ["posted", "quotes", "hire", "claimed", "started", "uq"],
  refund: ["posted", "quotes", "hire", "claimed", "started", "refund"],
  "awaiting-approval": ["posted", "quotes", "hire", "claimed", "started", "completion"],
  "fix-requested": ["posted", "quotes", "hire", "claimed", "started", "completion", "fix"],
  disputed: ["posted", "quotes", "hire", "claimed", "started", "completion", "dispute"],
  completed: ["posted", "quotes", "hire", "claimed", "started", "completion", "approved"],
  "cancelled-before": ["posted", "quotes", "hire", "cancelBefore"],
  "cancelled-after": ["posted", "quotes", "hire", "claimed", "started", "cancelAfter"],
};

// ---------- money ----------

const net = (n: number) => Math.round(n * (1 - ARTISAN_FEE_RATE) * 100) / 100;

function moneyFor(state: JobState, viewer: Viewer): MoneyLine[] | null {
  if (state === "posting" || state === "quotes" || state === "hire") return null;
  const started = !["paid", "started-claimed", "cancelled-before"].includes(state);
  const materials: MoneyLine = {
    label: "Materials",
    amount: HIRED.materials,
    state:
      state === "cancelled-before" ? "Refunded" : started ? "Released" : "Releases at Work started",
  };
  let labour: MoneyLine[] = [
    { label: "Labour", amount: HIRED.labour, state: "Releases at Approval" },
  ];
  if (state === "refund") {
    labour = [
      { label: "Labour", amount: 3700, state: "Releases at Approval" },
      { label: "Labour refunded", amount: 500, state: "Refunded" },
    ];
  }
  if (state === "awaiting-approval") labour[0].note = "Releases by silence on Tue 7 Oct 16:45";
  if (state === "fix-requested") labour[0].note = "Clock stopped until the next Completion";
  if (state === "disputed")
    labour = [
      {
        label: "Labour",
        amount: 2200,
        state: "Releases at Approval",
        note: "Or by silence on Tue 7 Oct 16:45",
      },
      {
        label: "Labour in Dispute",
        amount: 2000,
        state: "Held in Dispute",
        note: "The Admin decides",
      },
    ];
  if (state === "completed") labour[0].state = "Released";
  if (state === "cancelled-before") labour[0].state = "Refunded";
  if (state === "cancelled-after")
    labour[0] = {
      ...labour[0],
      state: "Refunds in 72h",
      note: "Fri 3 Oct 09:00, unless the Artisan opens a Dispute",
    };

  const lines = [materials, ...labour];
  if (viewer === "artisan")
    return lines.map((l) => (l.state === "Refunded" ? l : { ...l, net: net(l.amount) }));
  return [
    ...lines,
    { label: "Protection Fee", amount: 550, state: "Kept", note: "5%, non-refundable" },
  ];
}

function ledgerFor(state: JobState, viewer: Viewer): LedgerRow[] {
  const rows: LedgerRow[] = [];
  const segs = segmentsFor[state];
  if (segs.includes("hire")) {
    if (viewer === "client") {
      rows.push({ at: "24 Sep", what: "Payment: Hired Quote", amount: 11000, direction: "in" });
      rows.push({ at: "24 Sep", what: "Protection Fee (5%)", amount: 550, direction: "fee" });
    } else
      rows.push({ at: "24 Sep", what: "Payment received, held", amount: 11000, direction: "in" });
  }
  if (segs.includes("started")) {
    rows.push({ at: "29 Sep", what: "Release: Materials", amount: 6800, direction: "out" });
    if (viewer === "artisan")
      rows.push({
        at: "29 Sep",
        what: "Artisan Fee (10%) on Materials",
        amount: 680,
        direction: "fee",
      });
  }
  if (segs.includes("refund"))
    rows.push({ at: "30 Sep", what: "Refund to Client", amount: 500, direction: "out" });
  if (segs.includes("approved")) {
    rows.push({ at: "1 Oct", what: "Release: Labour", amount: 4200, direction: "out" });
    if (viewer === "artisan")
      rows.push({
        at: "1 Oct",
        what: "Artisan Fee (10%) on Labour",
        amount: 420,
        direction: "fee",
      });
  }
  if (segs.includes("cancelBefore"))
    rows.push({
      at: "26 Sep",
      what: "Refund to Client (Cancellation)",
      amount: 11000,
      direction: "out",
    });
  return rows;
}

// ---------- the Now block ----------

function nowFor(state: JobState, viewer: Viewer): Now {
  const c = viewer === "client";
  switch (state) {
    case "posting":
      return c
        ? {
            heading: "Post your Job",
            lines: ["It is checked before it is offered.", "Up to 10 photos."],
            actions: [
              { label: "Post Job", tone: "primary" },
              { label: "Save draft", tone: "secondary" },
            ],
            panel: "post",
          }
        : {
            heading: "Job Match",
            lines: [
              "Offered to you in Batch 1 of this Job.",
              "Quote, or pass. Passing tells nobody.",
            ],
            actions: [
              { label: "Write a Quote", tone: "primary" },
              { label: "Pass", tone: "secondary" },
            ],
            panel: "write-quote",
          };
    case "quotes":
      return c
        ? {
            heading: "3 Quotes to compare",
            lines: [
              "Batches continue every 24 hours until 5 Quotes.",
              "Each Quote is valid 14 days.",
            ],
            actions: [],
            panel: "quotes",
            tells: "The Artisan you Hire; the others are Declined.",
          }
        : {
            heading: "Your Quote is Sent",
            lines: ["Valid until Mon 6 Oct.", "You may revise it until the Client Hires."],
            actions: [
              { label: "Revise", tone: "secondary" },
              { label: "Withdraw", tone: "danger" },
            ],
            panel: "own-quote",
            tells: "The Client.",
          };
    case "hire":
      return c
        ? {
            heading: "Hire Sipho's Plumbing",
            lines: ["Paying is Hiring. The money is held until each Release."],
            actions: [
              { label: `Pay ${rand(11550)}`, tone: "primary" },
              { label: "Back to Quotes", tone: "secondary" },
            ],
            panel: "pay",
            tells: "Sipho's Plumbing; other Quotes are Declined.",
          }
        : {
            heading: "Your Quote is Sent",
            lines: ["Valid until Mon 6 Oct."],
            actions: [
              { label: "Revise", tone: "secondary" },
              { label: "Withdraw", tone: "danger" },
            ],
            panel: "own-quote",
          };
    case "paid":
      return c
        ? {
            heading: "Tap Work started when Sipho is on site",
            lines: [
              "Start date Mon 29 Sep.",
              `It releases the Materials (${rand(6800)}).`,
              `Cancelling now refunds ${rand(11000)} at once. The Protection Fee is kept.`,
            ],
            actions: [
              { label: "Work started", tone: "primary" },
              { label: "Cancel", tone: "danger" },
            ],
            panel: "none",
            tells: "Sipho's Plumbing.",
          }
        : {
            heading: "Tap “I've started” when you're on site",
            lines: ["Start date Mon 29 Sep.", "The Client has 24 hours to answer “Not started”."],
            actions: [
              { label: "I've started", tone: "primary" },
              { label: "Refund", tone: "secondary" },
              { label: "Cancel", tone: "danger" },
            ],
            panel: "none",
            tells: "The Client, with the 24-hour deadline.",
          };
    case "started-claimed":
      return c
        ? {
            heading: "Sipho says they've started",
            lines: [
              "If they haven't, answer “Not started”.",
              "With no answer, it is Work started at Tue 30 Sep 07:42.",
            ],
            actions: [
              { label: "Work started", tone: "primary" },
              { label: "Not started", tone: "danger" },
            ],
            panel: "none",
            tells: "Sipho's Plumbing.",
          }
        : {
            heading: "Waiting for the Client",
            lines: [
              "It is Work started at Tue 30 Sep 07:42 unless the Client answers “Not started”.",
            ],
            actions: [
              { label: "Refund", tone: "secondary" },
              { label: "Cancel", tone: "danger" },
            ],
            panel: "none",
          };
    case "work-started":
      return c
        ? {
            heading: "Work in progress",
            lines: [
              "Sipho marks it complete when done.",
              `Cancelling now: the Materials stay with Sipho; the Labour (${rand(4200)}) refunds in 72 hours unless Sipho disputes.`,
            ],
            actions: [{ label: "Cancel", tone: "danger" }],
            panel: "none",
          }
        : {
            heading: "Mark the work complete",
            lines: [
              "A note, 1 to 10 after-work photos.",
              "No certificate is needed: this Job has no gas.",
            ],
            actions: [
              { label: "Mark complete", tone: "primary" },
              { label: "Propose Updated Quote", tone: "secondary" },
              { label: "Refund", tone: "secondary" },
              { label: "Cancel", tone: "danger" },
            ],
            panel: "completion",
            tells: "The Client, with the Approval time.",
          };
    case "updated-quote":
      return c
        ? {
            heading: "Sipho proposes an Updated Quote",
            lines: [
              UPDATED.reason,
              "Neither line may go down. Reject it and the Hired Quote stands.",
            ],
            actions: [
              { label: `Accept and pay ${rand(1260)}`, tone: "primary" },
              { label: "Reject", tone: "secondary" },
            ],
            panel: "updated-quote-review",
            tells: "Sipho's Plumbing.",
          }
        : {
            heading: "Updated Quote sent",
            lines: ["Waiting for the Client to pay the difference.", "One is pending at a time."],
            actions: [
              { label: "Withdraw", tone: "secondary" },
              { label: "Mark complete", tone: "primary" },
            ],
            panel: "updated-quote-pending",
          };
    case "refund":
      return c
        ? {
            heading: `Sipho refunded ${rand(500)}`,
            lines: ["The Receipt is in your email.", "Work continues."],
            actions: [{ label: "Cancel", tone: "danger" }],
            panel: "none",
          }
        : {
            heading: "Refund the Client",
            lines: [
              `Up to ${rand(3700)} of Labour is unreleased.`,
              "A Refund is immediate and cannot be undone.",
            ],
            actions: [
              { label: `Refund ${rand(500)}`, tone: "primary" },
              { label: "Mark complete", tone: "secondary" },
            ],
            panel: "refund",
            tells: "The Client.",
          };
    case "awaiting-approval":
      return c
        ? {
            heading: "Sipho says it's done",
            lines: [
              "Approve, request a fix, or dispute a part of the Labour.",
              "Saying nothing approves it on Tue 7 Oct 16:45.",
            ],
            actions: [
              { label: "Approve", tone: "primary" },
              { label: "Request a fix", tone: "secondary" },
              { label: "Dispute", tone: "danger" },
            ],
            panel: "approve",
            tells: "Sipho's Plumbing.",
          }
        : {
            heading: "Awaiting the Client's Approval",
            lines: ["Labour releases by silence on Tue 7 Oct 16:45."],
            actions: [{ label: "Refund", tone: "secondary" }],
            panel: "none",
          };
    case "fix-requested":
      return c
        ? {
            heading: "Waiting for Sipho's fix",
            lines: [
              "“Pressure valve still drips into the tray.”",
              "The next Completion starts a new seven days.",
            ],
            actions: [{ label: "Cancel", tone: "danger" }],
            panel: "none",
          }
        : {
            heading: "The Client asked for a fix",
            lines: [
              "“Pressure valve still drips into the tray.”",
              "Fix it and mark complete again, or open a Dispute for the Labour.",
            ],
            actions: [
              { label: "Mark complete", tone: "primary" },
              { label: "Open a Dispute", tone: "danger" },
              { label: "Refund", tone: "secondary" },
            ],
            panel: "completion",
            tells: "The Client.",
          };
    case "disputed":
      return {
        heading: "The Admin is deciding",
        lines: [
          `${rand(2000)} of the Labour is held. The Admin's decision is final.`,
          c ? "You may still release it." : "You may still refund it.",
          c
            ? `${rand(2200)} releases at Approval or on Tue 7 Oct.`
            : `${rand(2200)} releases at Approval or on Tue 7 Oct.`,
        ],
        actions: c
          ? [
              { label: `Release ${rand(2000)}`, tone: "secondary" },
              { label: "Approve the rest", tone: "primary" },
            ]
          : [{ label: `Refund ${rand(2000)}`, tone: "secondary" }],
        panel: "dispute-status",
        tells: "The other party.",
      };
    case "completed":
      return {
        heading: "Write your Review",
        lines: [
          "One rating, 1 to 5, and an optional comment.",
          "Neither side sees the other's until both submit or 7 days pass.",
        ],
        actions: [
          { label: "Submit Review", tone: "primary" },
          ...(c ? [{ label: "Hire Again", tone: "secondary" as Tone }] : []),
        ],
        panel: "review",
        tells: "Nobody until the Admin approves it.",
      };
    case "cancelled-before":
      return {
        heading: "Cancelled",
        lines: c
          ? [
              `${rand(11000)} refunded on Fri 26 Sep. The Protection Fee is kept.`,
              "The Conversation is read-only.",
            ]
          : ["The Client cancelled before Work started.", "The Conversation is read-only."],
        actions: c ? [{ label: "Post again", tone: "secondary" }] : [],
        panel: "none",
      };
    case "cancelled-after":
      return c
        ? {
            heading: "Cancelled",
            lines: [
              "The Materials stay with Sipho.",
              `${rand(4200)} of Labour refunds on Fri 3 Oct 09:00 unless Sipho opens a Dispute.`,
            ],
            actions: [],
            panel: "none",
          }
        : {
            heading: "The Client cancelled",
            lines: [
              `${rand(4200)} of Labour refunds to the Client on Fri 3 Oct 09:00.`,
              "Open a Dispute for work already done, or refund sooner.",
            ],
            actions: [
              { label: "Open a Dispute", tone: "danger" },
              { label: "Refund now", tone: "secondary" },
            ],
            panel: "none",
            tells: "The Client, and the Admin's Disputes queue.",
          };
  }
}

// ---------- the Conversation ----------

const chat = {
  beforePay: [
    {
      at: "Mon 22 Sep 08:20",
      from: "client",
      text: "Can you come before Friday? It's in the roof, access through the passage hatch.",
    },
    {
      at: "Mon 22 Sep 08:41",
      from: "artisan",
      text: "Monday first thing. Can you send a photo of the valves?",
    },
    { at: "Mon 22 Sep 09:02", from: "client", text: "", attachment: "valves.jpg" },
  ],
  afterPay: [
    {
      at: "Wed 24 Sep 20:30",
      from: "artisan",
      text: "Thanks Thandi. I'll be there 07:30 Monday. My number is 082 555 0142 if the gate's locked.",
    },
    { at: "Mon 29 Sep 12:58", from: "artisan", text: "", attachment: "voice note 0:42" },
  ],
} satisfies Record<string, Message[]>;

function conversationFor(state: JobState): Message[] {
  if (state === "posting") return [];
  const segs = segmentsFor[state];
  return segs.includes("hire") ? [...chat.beforePay, ...chat.afterPay] : chat.beforePay;
}

// ---------- stages ----------

const stageFor: Record<JobState, StageKey> = {
  posting: "post",
  quotes: "quotes",
  hire: "hire",
  paid: "start",
  "started-claimed": "start",
  "work-started": "complete",
  "updated-quote": "complete",
  refund: "complete",
  "awaiting-approval": "approve",
  "fix-requested": "complete",
  disputed: "approve",
  completed: "review",
  "cancelled-before": "start",
  "cancelled-after": "complete",
};

const engagementFor: Record<JobState, string | null> = {
  posting: null,
  quotes: null,
  hire: null,
  paid: "Paid",
  "started-claimed": "Paid",
  "work-started": "Work started",
  "updated-quote": "Work started",
  refund: "Work started",
  "awaiting-approval": "Awaiting approval",
  "fix-requested": "Fix requested",
  disputed: "Disputed",
  completed: "Completed",
  "cancelled-before": "Cancelled",
  "cancelled-after": "Cancelled",
};

const clockFor = (state: JobState): Clock | null => {
  switch (state) {
    case "quotes":
    case "hire":
      return { label: "Job open", elapsed: 3 / 14, remaining: "11 days left; next Batch in 9h" };
    case "started-claimed":
      return { label: "Time to answer “Not started”", elapsed: 7 / 24, remaining: "17h left" };
    case "awaiting-approval":
    case "disputed":
      return { label: "Approval by silence", elapsed: 3 / 7, remaining: "4 days left" };
    case "completed":
      return { label: "Review window", elapsed: 3 / 7, remaining: "4 days left" };
    case "cancelled-after":
      return { label: "Labour refund", elapsed: 21 / 72, remaining: "51h left" };
    default:
      return null;
  }
};

export function jobView(state: JobState, viewer: Viewer): JobView {
  const record = segmentsFor[state]
    .flatMap((k) => seg[k] as RecordRow[])
    .filter((r) => !r.only || r.only === viewer);
  const ended = state === "completed" || state.startsWith("cancelled");
  const quotes = viewer === "client" ? QUOTES : QUOTES.filter((q) => q.id === "q1");
  return {
    state,
    viewer,
    jobStatus:
      state === "posting" ? "Draft" : ["quotes", "hire"].includes(state) ? "Open" : "Hired",
    engagement: engagementFor[state],
    with: ["posting", "quotes", "hire"].includes(state)
      ? null
      : viewer === "client"
        ? ARTISAN.trading
        : CLIENT.short,
    currentStage: stageFor[state],
    stoppedAt: state.startsWith("cancelled") ? stageFor[state] : undefined,
    record,
    messages: conversationFor(state),
    money: moneyFor(state, viewer),
    ledger: ledgerFor(state, viewer),
    clock: clockFor(state),
    now: nowFor(state, viewer),
    quotes,
    composer: ended
      ? { disabled: "The Conversation is read-only." }
      : state === "quotes" && viewer === "artisan"
        ? {
            refused: {
              draft: "Easier on WhatsApp: 082 555 0142",
              reason: "Contact details can be swapped only after Payment. Your draft is kept.",
            },
          }
        : {},
  };
}

// ---------- Artisan home ----------

export interface HomeItem {
  kind: "Job Match" | "Invitation" | "To start" | "To complete" | "Fix requested";
  job: string;
  suburb: string;
  detail: string;
  due?: string;
}

export const HOME = {
  available: true,
  regions: ["Southern", "Table Bay", "Cape Flats"],
  waiting: [
    {
      kind: "Job Match",
      job: "Kitchen mixer tap and blocked drain",
      suburb: "Claremont",
      detail: "Batch 1, 3 Quotes so far",
      due: "Job open 13 days",
    },
    {
      kind: "Job Match",
      job: "Geyser valve dripping",
      suburb: "Observatory",
      detail: "Batch 2, 1 Quote so far",
      due: "Job open 12 days",
    },
    {
      kind: "Invitation",
      job: "Outside tap and garden line (Hire Again)",
      suburb: "Kenilworth",
      detail: "From Lerato N., your Client since March",
    },
    {
      kind: "To start",
      job: "Burst pipe under the bath",
      suburb: "Wynberg",
      detail: "Paid. Start date Mon 6 Oct",
    },
    {
      kind: "Fix requested",
      job: "Replace burst geyser",
      suburb: "Rondebosch",
      detail: "“Pressure valve still drips into the tray.”",
    },
  ] satisfies HomeItem[],
  activity: [
    {
      job: "Replace burst geyser",
      suburb: "Rondebosch",
      status: "Fix requested",
      last: "Fix request, Wed 09:30",
      money: `${rand(4200)} Labour unreleased`,
    },
    {
      job: "Burst pipe under the bath",
      suburb: "Wynberg",
      status: "Paid",
      last: "Hired, Thu 2 Oct",
      money: `${rand(3400)} held`,
    },
    {
      job: "Shower mixer replacement",
      suburb: "Newlands",
      status: "Quote Sent",
      last: "Quote sent, Fri 3 Oct",
      money: "valid 13 days",
    },
    {
      job: "Toilet cistern",
      suburb: "Rosebank",
      status: "Completed",
      last: "Review from client: 5",
      money: `${rand(1800)} released`,
    },
  ],
  notices: [
    { at: "09:30", text: "Thandi M. requested a fix on Replace burst geyser." },
    { at: "Yesterday", text: "Payout sent: R3,240 to FNB ****4411." },
    { at: "Yesterday", text: "New Job Match: Geyser valve dripping, Observatory." },
    { at: "Thu", text: "You were Hired on Burst pipe under the bath." },
    { at: "Wed", text: "Your Profile change was accepted." },
    { at: "Tue", text: "Your Police clearance expires in 30 days." },
  ],
  payouts: [
    {
      at: "Fri 3 Oct",
      what: "Labour, Toilet cistern",
      release: 1800,
      fee: 180,
      paid: 1620,
      state: "Sent",
    },
    {
      at: "Tue 30 Sep",
      what: "Materials, Replace burst geyser",
      release: 6800,
      fee: 680,
      paid: 6120,
      state: "Sent",
    },
    {
      at: "Mon 29 Sep",
      what: "Labour, Gutter downpipe",
      release: 1200,
      fee: 60,
      paid: 1140,
      state: "Rejected by bank: submit a new bank letter",
    },
    {
      at: "Next run",
      what: "Materials, Burst pipe under the bath",
      release: 900,
      fee: 90,
      paid: 810,
      state: "In next daily run",
    },
  ],
};

// ---------- Admin ----------

export const QUEUES = [
  { key: "Verification", count: 6 },
  { key: "Pre-checks", count: 14 },
  { key: "Signals", count: 2 },
  { key: "Reports", count: 3 },
  { key: "Disputes", count: 1 },
  { key: "Chargebacks", count: 0 },
  { key: "Support", count: 4 },
  { key: "Data requests", count: 1 },
];

export const DISPUTE = {
  opened: "Wed 1 Oct 09:30",
  job: JOB.title,
  suburb: JOB.suburb,
  client: CLIENT.name,
  artisan: `${ARTISAN.name} (${ARTISAN.trading})`,
  held: 2000,
  labour: 4200,
  materialsReleased: 6800,
  clientReason:
    "The overflow pipe still runs into the ceiling, not outside, and the drip tray has no drain. Another plumber quoted R2,000 to finish it.",
  clientPhotos: 3,
  completionNote:
    "New 150L geyser fitted, valve set and drip tray installed, overflow rerouted to the outside wall. Tested at pressure.",
  completionPhotos: 4,
  quoteScope: QUOTES[0].scope,
  artisanRecord: {
    cancellations: 1,
    cancelledByClientsBeforeStart: 0,
    disputesLost: 0,
    completed: 37,
  },
  timeline: [
    "Hired Wed 24 Sep",
    "Work started Mon 29 Sep",
    "Completion Tue 30 Sep",
    "Dispute opened Wed 1 Oct",
  ],
  tells: "Both: the Client and the Artisan.",
};

export interface VerificationCheck {
  group: "Once" | "Plumbing" | "Optional";
  name: string;
  auto: string;
  autoOk: boolean;
  document: string;
}

export const VERIFICATION = {
  artisan: "Nomvula Khumalo",
  submitted: "Fri 3 Oct 21:14",
  categories: ["Plumbing"],
  checks: [
    {
      group: "Once",
      name: "Identity document and selfie",
      auto: "SA ID checksum valid; Identity Number not held by another Account",
      autoOk: true,
      document: "ID card + selfie",
    },
    {
      group: "Once",
      name: "Payout account (bank letter)",
      auto: "Name on letter: “N Khumalo”; account not held by another Artisan",
      autoOk: true,
      document: "Capitec letter",
    },
    {
      group: "Plumbing",
      name: "Three photos of own work",
      auto: "1 photo found elsewhere online",
      autoOk: false,
      document: "3 photos",
    },
    {
      group: "Plumbing",
      name: "Trained plumber",
      auto: "Read: PIRB card, number PIRB-58211",
      autoOk: true,
      document: "PIRB card",
    },
    {
      group: "Optional",
      name: "Police clearance",
      auto: "Issued 12 Aug 2026",
      autoOk: true,
      document: "SAPS certificate",
    },
  ] satisfies VerificationCheck[],
  tells: "The Artisan, per check accepted or rejected.",
};
