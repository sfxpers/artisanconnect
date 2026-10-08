import { sql } from "drizzle-orm";
import { MATCHINGS, SITE_TYPES } from "./jobs/inputs";
import { MESSAGE_EVENTS } from "./conversations/inputs";
import { MATERIALS_BY } from "./quotes/inputs";
import { QUEUE_NAMES } from "./queue-names";
import { REPORT_REASONS } from "./reports/reasons";
import { SUPPORT_TOPICS } from "./support/topics";
import { SERVICE_CATEGORIES } from "./service-categories";
import { CHECK_KINDS } from "./verification/checks";
import type { CheckDetails, CheckFile, Reading } from "./verification/stored";
import type { StoredFile } from "./uploads";
import type { ChargebackOutcome } from "./ports";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";

/** Times are stored as milliseconds since the epoch. */
const instant = (name: string) => integer(name, { mode: "timestamp_ms" });

/**
 * Every clock is a row with a due time, fired by "run due clocks" (ADR 0017).
 * A fired clock is never fired again: a trigger in the migration refuses it.
 */
export const dueClocks = sqliteTable(
  "due_clocks",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    subjectId: text("subject_id").notNull(),
    dueAt: instant("due_at").notNull(),
    firedAt: instant("fired_at"),
  },
  (table) => [
    index("due_clocks_unfired")
      .on(table.dueAt)
      .where(sql`${table.firedAt} is null`),
  ],
);

/**
 * The money ledger: append-only rows, never updated or deleted (a trigger in
 * the migration refuses both). Every row of one domain event shares an
 * eventId and is written in that event's one atomic batch. What is paid in,
 * released, owed, or refunded is derived from these rows, never stored.
 */
export const ledgerEntries = sqliteTable(
  "ledger_entries",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull(),
    kind: text("kind").notNull(),
    amountCents: integer("amount_cents").notNull(),
    recordedAt: instant("recorded_at").notNull(),
    /** The Payment the money came in by, or is owed back from. */
    paymentId: text("payment_id").references((): AnySQLiteColumn => payments.id),
    /** The Engagement the money is for; null for a Payment that Hired nobody. */
    engagementId: text("engagement_id").references((): AnySQLiteColumn => engagements.id),
  },
  (table) => [
    index("ledger_entries_event").on(table.eventId),
    index("ledger_entries_payment").on(table.paymentId),
    index("ledger_entries_engagement").on(table.engagementId),
    check("ledger_entries_whole_cents", sql`typeof(${table.amountCents}) = 'integer'`),
  ],
);

// Sign-in identities, kept by better-auth (ADR 0017). An identity is an
// Account's or an Admin's; one Email is one identity, whichever it is. The
// admin plugin's `role` marks staff, and nothing else of it is used.

export const authUsers = sqliteTable("auth_users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull(),
  image: text("image"),
  role: text("role"),
  banned: integer("banned", { mode: "boolean" }),
  banReason: text("ban_reason"),
  banExpires: instant("ban_expires"),
  createdAt: instant("created_at").notNull(),
  updatedAt: instant("updated_at").notNull(),
});

export const authSessions = sqliteTable(
  "auth_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: instant("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    impersonatedBy: text("impersonated_by"),
    createdAt: instant("created_at").notNull(),
    updatedAt: instant("updated_at").notNull(),
  },
  (table) => [index("auth_sessions_user").on(table.userId)],
);

/** better-auth's "account" model: how an identity signs in (here, its password). */
export const authCredentials = sqliteTable(
  "auth_credentials",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: instant("access_token_expires_at"),
    refreshTokenExpiresAt: instant("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: instant("created_at").notNull(),
    updatedAt: instant("updated_at").notNull(),
  },
  (table) => [index("auth_credentials_user").on(table.userId)],
);

/** Email codes, hashed, one per Email and purpose. */
export const authVerifications = sqliteTable(
  "auth_verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: instant("expires_at").notNull(),
    createdAt: instant("created_at").notNull(),
    updatedAt: instant("updated_at").notNull(),
  },
  (table) => [index("auth_verifications_identifier").on(table.identifier)],
);

/**
 * A Client or an Artisan. Its id is its sign-in identity's. The kind is fixed
 * at sign-up. Until its Email is proven it is a sign-up, not yet an Account.
 */
export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id")
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["client", "artisan"] }).notNull(),
    name: text("name").notNull(),
    tradingName: text("trading_name"),
    rulesVersion: integer("rules_version")
      .notNull()
      .references(() => marketplaceRules.version),
    rulesAcceptedAt: instant("rules_accepted_at").notNull(),
    signedUpAt: instant("signed_up_at").notNull(),
    /**
     * Whether anyone else may see the names: false until the names given at
     * sign-up pass the Content check, or the Admin releases them. A name held
     * here that is not shown is the Account's and the Admin's only.
     */
    namesShown: integer("names_shown", { mode: "boolean" }).notNull().default(true),
    /**
     * An Artisan's switch for receiving Job Matches. Off hides nothing, and
     * turning it off and on keeps the Artisan's place in the offer order.
     */
    availableForJobs: integer("available_for_jobs", { mode: "boolean" }).notNull().default(true),
    /**
     * A VAT-registered Artisan's VAT number; their amounts include VAT. Each
     * Quote carries the one given when it was sent or last revised.
     */
    vatNumber: text("vat_number"),
    /** When the Admin held an Artisan's Payouts, while they are held (#128); they wait meanwhile. */
    payoutsHeldAt: instant("payouts_held_at"),
    /**
     * When the Admin took the Artisan's Profile out of view from a Report
     * (#136), until a Profile edit the Admin releases fixes it; and why, for
     * the Artisan.
     */
    profileOutOfViewSince: instant("profile_out_of_view_since"),
    profileOutOfViewFor: text("profile_out_of_view_for"),
  },
  (table) => [check("accounts_kind", sql`${table.kind} in ('client', 'artisan')`)],
);

export const NAMES_STATES = ["shown", "held", "released", "refused", "withdrawn"] as const;

/**
 * Each time an Account gives its names, at sign-up or changing them, and
 * what the Content check made of them: shown at once, or Held for the
 * Admin's Pre-check and then released, refused, or withdrawn. The newest row
 * says where the Account's names stand; `accounts` holds the names shown.
 */
export const namesSent = sqliteTable(
  "names_sent",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tradingName: text("trading_name"),
    state: text("state", { enum: NAMES_STATES }).notNull(),
    /** Why the check Held them, for the Admin. */
    heldFor: text("held_for"),
    sentAt: instant("sent_at").notNull(),
  },
  (table) => [
    index("names_sent_account").on(table.accountId, table.sentAt),
    // One set of names waits at a time.
    uniqueIndex("names_sent_one_held").on(table.accountId).where(sql.raw("state = 'held'")),
    check(
      "names_sent_state",
      sql.raw(`state in (${NAMES_STATES.map((state) => `'${state}'`).join(", ")})`),
    ),
  ],
);

/** Each published version of the Marketplace rules. The newest is current. */
export const marketplaceRules = sqliteTable("marketplace_rules", {
  version: integer("version").primaryKey(),
  summary: text("summary").notNull(),
  publishedAt: instant("published_at").notNull(),
});

/**
 * The in-app half of a Tell. "Told" means this row was written; its one
 * email goes after the event commits, and the every-minute cron retries one
 * that has not gone.
 */
export const notices = sqliteTable(
  "notices",
  {
    id: text("id").primaryKey(),
    /** The Account told; it sees the notice in its Notices stream. */
    accountId: text("account_id").references(() => accounts.id, { onDelete: "cascade" }),
    /**
     * Or an address told by email only, with no stream to show it in: one no
     * Account holds, such as an invited Admin's, or an Account's for what it
     * is told only by email, such as the answer to its Support request.
     */
    address: text("address"),
    /** What happened, by kind; the title names it for the person. */
    event: text("event").notNull(),
    title: text("title").notNull(),
    link: text("link").notNull(),
    /**
     * The email's own text, for an email that carries what it is about (a
     * Support answer). A Tell has none: its email names the event and links back.
     */
    body: text("body"),
    toldAt: instant("told_at").notNull(),
    emailedAt: instant("emailed_at"),
  },
  (table) => [
    index("notices_account").on(table.accountId, table.toldAt),
    index("notices_unemailed")
      .on(table.toldAt)
      .where(sql`${table.emailedAt} is null`),
    // Unqualified, so it survives the table rebuild that added it.
    check("notices_one_recipient", sql.raw("(account_id is null) <> (address is null)")),
  ],
);

/** One try at something rate-limited (a sign-in, a code request), by key. */
export const rateLimitHits = sqliteTable(
  "rate_limit_hits",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull(),
    at: instant("at").notNull(),
  },
  (table) => [index("rate_limit_hits_key").on(table.key, table.at)],
);

/**
 * A staff identity, not an Account (ADR 0015). While it is an Admin its id is
 * its sign-in identity's; removing it ends that identity, and this row stays
 * so the audit log can still say who acted. The first is written by setup
 * (invitedBy null); a trigger in the migration refuses removing the last.
 */
export const admins = sqliteTable(
  "admins",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    invitedBy: text("invited_by").references((): AnySQLiteColumn => admins.id),
    invitedAt: instant("invited_at").notNull(),
    removedBy: text("removed_by").references((): AnySQLiteColumn => admins.id),
    removedAt: instant("removed_at"),
  },
  (table) => [
    index("admins_current")
      .on(table.id)
      .where(sql`${table.removedAt} is null`),
  ],
);

/**
 * Every Admin decision and every logged read: who, what, and when; and what
 * the system logs for the Admin, such as a Payout sent back (#129). Append-only
 * (a trigger in the migration refuses updates and deletes). A decision's row
 * is written in the decision's own batch, and a read's before it is shown.
 */
export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    /** Null for what the system logs the Admin should see, such as a Payout sent back. */
    adminId: text("admin_id").references(() => admins.id),
    /** What was done, by kind, such as "admin.invited" or "read". */
    action: text("action").notNull(),
    /** What it was done to, said for the Admin. */
    summary: text("summary").notNull(),
    /** The id of what it was done to, if it has one. */
    subjectId: text("subject_id"),
    at: instant("at").notNull(),
  },
  (table) => [index("audit_log_at").on(table.at)],
);

/**
 * One thing waiting on the Admin. Its kind (a Dispute, a Held Quote, …) says
 * which queue it is in and which decisions it allows. A recorded decision
 * cannot be reopened: a trigger in the migration refuses it.
 */
export const queueItems = sqliteTable(
  "queue_items",
  {
    id: text("id").primaryKey(),
    queue: text("queue", { enum: QUEUE_NAMES }).notNull(),
    kind: text("kind").notNull(),
    /** The id of what the item is about, in its kind's own table. */
    subjectId: text("subject_id").notNull(),
    title: text("title").notNull(),
    raisedAt: instant("raised_at").notNull(),
    decision: text("decision"),
    reason: text("reason"),
    decidedBy: text("decided_by").references(() => admins.id),
    decidedAt: instant("decided_at"),
  },
  (table) => [
    index("queue_items_open")
      .on(table.raisedAt)
      .where(sql`${table.decidedAt} is null`),
    check(
      "queue_items_queue",
      sql.raw(`queue in (${QUEUE_NAMES.map((name) => `'${name}'`).join(", ")})`),
    ),
  ],
);

/**
 * A message to the Admin: an Account's, under a fixed topic, or one the
 * platform raises itself with a tag. The Admin's answer is the decision on
 * its queue item.
 */
export const supportRequests = sqliteTable(
  "support_requests",
  {
    id: text("id").primaryKey(),
    /**
     * The Account that sent it, or that a system request is about. A request
     * outlives its Account, as a system one may be about money owed.
     */
    accountId: text("account_id").references(() => accounts.id, { onDelete: "set null" }),
    /** An Account's request has a topic; a system request has a tag instead. */
    topic: text("topic", { enum: SUPPORT_TOPICS }),
    tag: text("tag"),
    message: text("message").notNull(),
    sentAt: instant("sent_at").notNull(),
    /** The Refund a failed-Refund request is for, which the Admin pays by hand (#132). */
    refundId: text("refund_id").references((): AnySQLiteColumn => refunds.id),
  },
  (table) => [
    index("support_requests_account").on(table.accountId, table.sentAt),
    check("support_requests_topic_or_tag", sql.raw("(topic is null) <> (tag is null)")),
    check(
      "support_requests_topic",
      sql.raw(`topic in (${SUPPORT_TOPICS.map((topic) => `'${topic}'`).join(", ")})`),
    ),
  ],
);

/** What a Report may be about (#136). A Review's waits for Reviews (#138). */
export const REPORT_SUBJECTS = ["job", "quote", "message", "profile"] as const;

/**
 * A signed-in Account's Report of a Job, Quote, message, or Artisan Profile
 * it can see, at most once per reporter per thing. Repeats fold into the one
 * queue item open for the thing; once that is decided, the next Report opens
 * another.
 */
export const reports = sqliteTable(
  "reports",
  {
    id: text("id").primaryKey(),
    reporterId: text("reporter_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    subjectKind: text("subject_kind", { enum: REPORT_SUBJECTS }).notNull(),
    /** The Job's, Quote's, or message's id, or the Profile's Artisan's. */
    subjectId: text("subject_id").notNull(),
    /** The Account reported: whose the thing is. Never shown to it, nor the reporter to it. */
    reportedId: text("reported_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    reason: text("reason", { enum: REPORT_REASONS }).notNull(),
    note: text("note"),
    /** Why the Content check was unsure of the note, for the Admin, who alone reads it. */
    noteHeldFor: text("note_held_for"),
    /** The queue item it folded into. */
    queueItemId: text("queue_item_id")
      .notNull()
      .references(() => queueItems.id),
    reportedAt: instant("reported_at").notNull(),
  },
  (table) => [
    uniqueIndex("reports_once_per_reporter").on(
      table.reporterId,
      table.subjectKind,
      table.subjectId,
    ),
    index("reports_item").on(table.queueItemId, table.reportedAt),
    check(
      "reports_subject_kind",
      sql.raw(`subject_kind in (${REPORT_SUBJECTS.map((kind) => `'${kind}'`).join(", ")})`),
    ),
    check(
      "reports_reason",
      sql.raw(`reason in (${REPORT_REASONS.map((reason) => `'${reason}'`).join(", ")})`),
    ),
  ],
);

/**
 * Each warning the Admin gives an Account, from a Report or the People page
 * (#136). It is told the reason. Warnings stay, a Suspension lifted or not;
 * one for Leaving makes the next Leaving a Suspension.
 */
export const warnings = sqliteTable(
  "warnings",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    /** Whether it was for Leaving. */
    leaving: integer("leaving", { mode: "boolean" }).notNull(),
    warnedBy: text("warned_by")
      .notNull()
      .references(() => admins.id),
    warnedAt: instant("warned_at").notNull(),
  },
  (table) => [index("warnings_account").on(table.accountId, table.warnedAt)],
);

/**
 * Each Suspension of an Account (#136): it cannot start new work until the
 * Admin lifts it, and sees the reason meanwhile. One stands at a time. The
 * system suspends a Client whose card Payment is charged back (#137).
 */
export const suspensions = sqliteTable(
  "suspensions",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    /** Whether it was for Leaving. */
    leaving: integer("leaving", { mode: "boolean" }).notNull(),
    /** Null when the system suspended it, at a Chargeback (#137). */
    suspendedBy: text("suspended_by").references(() => admins.id),
    suspendedAt: instant("suspended_at").notNull(),
    liftedBy: text("lifted_by").references(() => admins.id),
    liftedAt: instant("lifted_at"),
  },
  (table) => [
    index("suspensions_account").on(table.accountId, table.suspendedAt),
    uniqueIndex("suspensions_one_standing").on(table.accountId).where(sql.raw("lifted_at is null")),
  ],
);

export const CHECK_STATES = ["submitted", "accepted", "rejected", "removed", "superseded"] as const;

/**
 * Each check an Artisan submits for Verification: submitted, then accepted
 * (a Verification Badge) or rejected with a reason; an accepted one is
 * removed by the Admin if found false, or superseded once a replacement in
 * its slot is accepted. Expiry is not a state: a check stops being current on
 * its expiry date. Triggers in the migration refuse any other change of
 * state, and an Identity Number or Payout account accepted for two Artisans
 * at once.
 */
export const verificationChecks = sqliteTable(
  "verification_checks",
  {
    id: text("id").primaryKey(),
    artisanId: text("artisan_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: CHECK_KINDS }).notNull(),
    /** The category work photos are for, or a Credential's. */
    category: text("category", { enum: SERVICE_CATEGORIES }),
    /** Where it sits: its kind, but work photos per category. One may wait at a time. */
    slot: text("slot").notNull(),
    state: text("state", { enum: CHECK_STATES }).notNull(),
    /** What the Artisan typed, and what the Admin recorded on accepting it. */
    details: text("details", { mode: "json" }).$type<CheckDetails>().notNull(),
    /** An Identity Number's or a Payout account's, which one Artisan at most may hold. */
    heldKey: text("held_key"),
    /** South African calendar days, YYYY-MM-DD. */
    expiresOn: text("expires_on"),
    issuedOn: text("issued_on"),
    files: text("files", { mode: "json" }).$type<CheckFile[]>().notNull(),
    /** The automatic reading, shown to the Admin beside the document. */
    reading: text("reading", { mode: "json" }).$type<Reading>().notNull(),
    submittedAt: instant("submitted_at").notNull(),
    decidedBy: text("decided_by").references(() => admins.id),
    decidedAt: instant("decided_at"),
    /** Why it was rejected. */
    reason: text("reason"),
    removedBy: text("removed_by").references(() => admins.id),
    removedAt: instant("removed_at"),
    removedReason: text("removed_reason"),
    supersededAt: instant("superseded_at"),
    /**
     * When the bank refused or sent back a Payout to this Payout account,
     * whatever its reason: it stops being current (#129).
     */
    payoutsStoppedAt: instant("payouts_stopped_at"),
  },
  (table) => [
    index("verification_checks_artisan").on(table.artisanId, table.slot, table.submittedAt),
    index("verification_checks_held_key").on(table.heldKey),
    uniqueIndex("verification_checks_one_waiting")
      .on(table.artisanId, table.slot)
      .where(sql.raw("state = 'submitted'")),
    check(
      "verification_checks_state",
      sql.raw(`state in (${CHECK_STATES.map((state) => `'${state}'`).join(", ")})`),
    ),
  ],
);

/**
 * One of a city's districts, seeded with its suburbs by a migration (a later
 * city is another seed). Never renamed or removed: triggers in the migration
 * refuse both.
 */
export const regions = sqliteTable("regions", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
});

/**
 * One of the City's official suburbs, in exactly one Region. The Admin may
 * add one the City creates, but never move, rename, or remove one: triggers
 * in the migration refuse it.
 */
export const suburbs = sqliteTable(
  "suburbs",
  {
    id: text("id").primaryKey(),
    /** As the City publishes it. */
    name: text("name").notNull().unique(),
    /** The name without case, spaces, or punctuation (`suburbKey`), which two may share. */
    searchKey: text("search_key").notNull(),
    regionId: text("region_id")
      .notNull()
      .references(() => regions.id),
  },
  (table) => [
    index("suburbs_region").on(table.regionId, table.name),
    index("suburbs_search_key").on(table.searchKey),
  ],
);

/** The one to three Regions an Artisan works in and is offered Jobs in. */
export const artisanRegions = sqliteTable(
  "artisan_regions",
  {
    artisanId: text("artisan_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    regionId: text("region_id")
      .notNull()
      .references(() => regions.id),
  },
  (table) => [
    primaryKey({ columns: [table.artisanId, table.regionId] }),
    index("artisan_regions_region").on(table.regionId),
  ],
);

export const PROFILE_EDIT_STATES = ["held", "released", "refused", "withdrawn"] as const;

/**
 * Each edit an Artisan makes to their Profile: the whole new version, Held
 * for the Admin's Pre-check whatever the Content check made of it, then
 * released, refused, or withdrawn. The newest one released is the Profile
 * shown; until the first, it shows no About text and no photos.
 */
export const profileEdits = sqliteTable(
  "profile_edits",
  {
    id: text("id").primaryKey(),
    artisanId: text("artisan_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    about: text("about").notNull(),
    /** Its work photos, in the order shown: those kept from the version shown, then those added. */
    photos: text("photos", { mode: "json" })
      .$type<Extract<StoredFile, { kind: "photo" }>[]>()
      .notNull(),
    state: text("state", { enum: PROFILE_EDIT_STATES }).notNull(),
    /** Why the Content check was unsure, for the Admin; null if it found nothing. */
    heldFor: text("held_for"),
    sentAt: instant("sent_at").notNull(),
    releasedAt: instant("released_at"),
  },
  (table) => [
    index("profile_edits_artisan").on(table.artisanId, table.sentAt),
    index("profile_edits_released")
      .on(table.artisanId, table.releasedAt)
      .where(sql.raw("state = 'released'")),
    // One edit waits at a time.
    uniqueIndex("profile_edits_one_held").on(table.artisanId).where(sql.raw("state = 'held'")),
    check(
      "profile_edits_state",
      sql.raw(`state in (${PROFILE_EDIT_STATES.map((state) => `'${state}'`).join(", ")})`),
    ),
  ],
);

export const JOB_STATES = ["draft", "held", "open", "expired", "closed", "hired"] as const;

/**
 * A Client's request for work. A Draft may omit anything; posting it reads it
 * with the Content check and opens it, or Holds it for the Admin. The trade,
 * the site, the gas answer, and the matching choice lock at posting. Triggers
 * in the migration refuse any other change of state.
 */
export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => accounts.id),
    state: text("state", { enum: JOB_STATES }).notNull(),
    category: text("category", { enum: SERVICE_CATEGORIES }),
    siteType: text("site_type", { enum: SITE_TYPES }),
    /** Its Region is the suburb's. */
    suburbId: text("suburb_id").references(() => suburbs.id),
    /** Withheld from every Artisan until Payment. */
    street: text("street").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    photos: text("photos", { mode: "json" })
      .$type<Extract<StoredFile, { kind: "photo" }>[]>()
      .notNull(),
    /** A Plumbing Job's answer: does the work install or remove gas? Null for any other trade. */
    gasWork: integer("gas_work", { mode: "boolean" }),
    /** A South African calendar day, YYYY-MM-DD. */
    preferredStart: text("preferred_start"),
    matching: text("matching", { enum: MATCHINGS }),
    /** Why the Content check Held it at posting, for the Admin. */
    heldFor: text("held_for"),
    createdAt: instant("created_at").notNull(),
    /** When the Client last changed it, or it last changed state. */
    updatedAt: instant("updated_at").notNull(),
    /** Counts the Client's saves, so posting opens only the version the Content check read. */
    revision: integer("revision").notNull().default(0),
    /** When it last became Open, at posting, release, or Renew. Quotes count from here. */
    openedAt: instant("opened_at"),
    /** When it Expires without a Hire: 14 days after it opened. */
    expiresAt: instant("expires_at"),
    /** When an Open matched Job's next Batch is due; null for an Invite-only one. */
    nextBatchAt: instant("next_batch_at"),
    /**
     * When the Admin took it out of view from a Report (#136), until an edit
     * the Admin releases fixes it; and why, for the Client.
     */
    outOfViewSince: instant("out_of_view_since"),
    outOfViewFor: text("out_of_view_for"),
  },
  (table) => [
    index("jobs_client").on(table.clientId, table.updatedAt),
    check("jobs_state", sql.raw(`state in (${JOB_STATES.map((s) => `'${s}'`).join(", ")})`)),
  ],
);

export const JOB_EDIT_STATES = ["held", "released", "refused", "withdrawn"] as const;

/**
 * Each edit a Client makes to a posted Job, before its first Quote: the new
 * title, description, photos, Site type, and Preferred start. One the
 * Content check clears is released at once; one it is unsure about is Held
 * for the Admin's Pre-check, and the Job shows as it was meanwhile.
 */
export const jobEdits = sqliteTable(
  "job_edits",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id),
    title: text("title").notNull(),
    description: text("description").notNull(),
    /** Its photos, in order: those kept from the Job, then those added. */
    photos: text("photos", { mode: "json" })
      .$type<Extract<StoredFile, { kind: "photo" }>[]>()
      .notNull(),
    siteType: text("site_type", { enum: SITE_TYPES }).notNull(),
    preferredStart: text("preferred_start"),
    state: text("state", { enum: JOB_EDIT_STATES }).notNull(),
    /** Why the Content check Held it, for the Admin. */
    heldFor: text("held_for"),
    sentAt: instant("sent_at").notNull(),
  },
  (table) => [
    index("job_edits_job").on(table.jobId, table.sentAt),
    // One edit waits at a time.
    uniqueIndex("job_edits_one_held").on(table.jobId).where(sql.raw("state = 'held'")),
    check(
      "job_edits_state",
      sql.raw(`state in (${JOB_EDIT_STATES.map((state) => `'${state}'`).join(", ")})`),
    ),
  ],
);

/**
 * The offer of a Job to one Artisan in a Batch, at most once per Job. The
 * newest offer time of each Artisan places them in the offer order: those
 * offered least recently come first, so nothing else may move it. Passing is
 * recorded once (a trigger in the migration refuses undoing it).
 */
export const jobMatches = sqliteTable(
  "job_matches",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id),
    artisanId: text("artisan_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** When its Batch was sent. */
    offeredAt: instant("offered_at").notNull(),
    passedAt: instant("passed_at"),
  },
  (table) => [
    uniqueIndex("job_matches_once_per_job").on(table.jobId, table.artisanId),
    index("job_matches_artisan").on(table.artisanId, table.offeredAt),
  ],
);

/**
 * Each Invitation a Client sends one Artisan to Quote on a Job, which the
 * Artisan may pass. It stands beside any Job Match the Artisan holds for the
 * Job, which keeps its offer time and so the Artisan's place in the offer order.
 */
export const invitations = sqliteTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id),
    artisanId: text("artisan_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    invitedAt: instant("invited_at").notNull(),
    passedAt: instant("passed_at"),
  },
  (table) => [
    uniqueIndex("invitations_once_per_job").on(table.jobId, table.artisanId),
    index("invitations_artisan").on(table.artisanId, table.invitedAt),
  ],
);

export const QUOTE_STATES = [
  "held",
  "refused",
  "unsent",
  "sent",
  "declined",
  "withdrawn",
  "expired",
  "hired",
] as const;

/**
 * An Artisan's fixed price on a Job, one per Artisan per Job. The Content
 * check clears it and it is Sent, or Holds it for the Admin, who releases it
 * (Sent, if the Job still takes it) or refuses it. A Held one its Artisan
 * withdraws, or one the Job no longer takes once released, is unsent: like a
 * refused one it was never Sent, and the Artisan may send another. A Sent one
 * is Hired, Declined, Withdrawn, or Expires. Triggers in the migration refuse
 * any other change of state.
 */
export const quotes = sqliteTable(
  "quotes",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id),
    artisanId: text("artisan_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    state: text("state", { enum: QUOTE_STATES }).notNull(),
    scope: text("scope").notNull(),
    /** Whole cents, as are Materials; a VAT-registered Artisan's include VAT. */
    labourCents: integer("labour_cents").notNull(),
    materialsCents: integer("materials_cents").notNull(),
    materialsBy: text("materials_by", { enum: MATERIALS_BY }).notNull(),
    /** A South African calendar day, YYYY-MM-DD, counted as day 1 of the duration. */
    startOn: text("start_on").notNull(),
    durationDays: integer("duration_days").notNull(),
    warranty: text("warranty"),
    /** The Artisan's VAT number when they sent it, if they are VAT-registered. */
    vatNumber: text("vat_number"),
    /** Why the Content check Held it, for the Admin. */
    heldFor: text("held_for"),
    /** When the Artisan sent it. */
    createdAt: instant("created_at").notNull(),
    /** When it was Sent, at once or on release. The Job's five count from here. */
    sentAt: instant("sent_at"),
    /** When it Expires if still Sent: 14 days after it was Sent, whatever revisions. */
    expiresAt: instant("expires_at"),
    /** When a revision was last shown on it. */
    revisedAt: instant("revised_at"),
    /** When it was Declined, Withdrawn, or Expired. */
    endedAt: instant("ended_at"),
  },
  (table) => [
    index("quotes_job").on(table.jobId, table.sentAt),
    index("quotes_artisan").on(table.artisanId, table.createdAt),
    // One per Artisan per Job, but one never Sent leaves room for another.
    uniqueIndex("quotes_once_per_job")
      .on(table.jobId, table.artisanId)
      .where(sql.raw("state not in ('refused', 'unsent')")),
    check(
      "quotes_state",
      sql.raw(`state in (${QUOTE_STATES.map((state) => `'${state}'`).join(", ")})`),
    ),
    check(
      "quotes_amounts",
      sql.raw(
        "typeof(labour_cents) = 'integer' and typeof(materials_cents) = 'integer' and labour_cents > 0 and materials_cents >= 0",
      ),
    ),
  ],
);

export const QUOTE_REVISION_STATES = ["held", "released", "refused", "withdrawn"] as const;

/**
 * Each revision an Artisan makes to a Sent Quote, whole. One the Content
 * check clears is shown at once; one it is unsure about is Held for the
 * Admin's Pre-check, and the Quote shows as it was meanwhile, as a Job edit
 * does. Its 14 days never restart.
 */
export const quoteRevisions = sqliteTable(
  "quote_revisions",
  {
    id: text("id").primaryKey(),
    quoteId: text("quote_id")
      .notNull()
      .references(() => quotes.id),
    scope: text("scope").notNull(),
    labourCents: integer("labour_cents").notNull(),
    materialsCents: integer("materials_cents").notNull(),
    materialsBy: text("materials_by", { enum: MATERIALS_BY }).notNull(),
    startOn: text("start_on").notNull(),
    durationDays: integer("duration_days").notNull(),
    warranty: text("warranty"),
    vatNumber: text("vat_number"),
    state: text("state", { enum: QUOTE_REVISION_STATES }).notNull(),
    /** Why the Content check Held it, for the Admin. */
    heldFor: text("held_for"),
    sentAt: instant("sent_at").notNull(),
  },
  (table) => [
    index("quote_revisions_quote").on(table.quoteId, table.sentAt),
    // One revision waits at a time.
    uniqueIndex("quote_revisions_one_held").on(table.quoteId).where(sql.raw("state = 'held'")),
    check(
      "quote_revisions_state",
      sql.raw(`state in (${QUOTE_REVISION_STATES.map((state) => `'${state}'`).join(", ")})`),
    ),
  ],
);

/**
 * The messages between one Client and one Artisan on one Job (#125, ADR
 * 0010), opened by the first Quote Sent or the Invitation. Each party's
 * mark says when they last opened it: what was delivered to them since is
 * unread, and they are told of the first of it only.
 */
export const conversations = sqliteTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id),
    artisanId: text("artisan_id")
      .notNull()
      .references(() => accounts.id),
    openedAt: instant("opened_at").notNull(),
    clientReadAt: instant("client_read_at"),
    artisanReadAt: instant("artisan_read_at"),
  },
  (table) => [uniqueIndex("conversations_once_per_job").on(table.jobId, table.artisanId)],
);

/** A file in a message that is not a photo. */
export type MessageFile = Extract<StoredFile, { kind: "voice-note" | "pdf" }>;

export const MESSAGE_STATES = ["held", "delivered", "refused", "withdrawn", "unsent"] as const;

/**
 * A message, or a row for an event that is not speech (a Quote Sent, the Hire). A Held
 * one exists only for its sender and the Admin until it is delivered or
 * refused; one delivered is never changed or removed (a trigger in the
 * migration refuses both).
 */
export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id),
    /** The Account that sent it; null for an event's row. */
    senderId: text("sender_id").references(() => accounts.id),
    /** The event a row is for, such as "quote.sent"; null for a message. */
    event: text("event", { enum: MESSAGE_EVENTS }),
    text: text("text").notNull(),
    photos: text("photos", { mode: "json" })
      .$type<Extract<StoredFile, { kind: "photo" }>[]>()
      .notNull(),
    /** Its voice notes and PDFs, which only the Engagement's Conversation takes (#131). */
    files: text("files", { mode: "json" })
      .$type<MessageFile[]>()
      .notNull()
      .default(sql`'[]'`),
    state: text("state", { enum: MESSAGE_STATES }).notNull(),
    /** Why the Content check Held it, for the Admin. */
    heldFor: text("held_for"),
    /** What the Content check read from its files when it Held it, for the Admin. */
    heldFilesText: text("held_files_text"),
    sentAt: instant("sent_at").notNull(),
    /** When the other party could first see it. */
    deliveredAt: instant("delivered_at"),
  },
  (table) => [
    index("messages_conversation").on(table.conversationId, table.sentAt),
    check(
      "messages_state",
      sql.raw(`state in (${MESSAGE_STATES.map((state) => `'${state}'`).join(", ")})`),
    ),
    check("messages_speech_or_event", sql.raw("(sender_id is null) <> (event is null)")),
  ],
);

export const PAYMENT_STATES = ["open", "failed", "paid", "not-hired"] as const;

/** Why a Payment that arrived Hired nobody, and so is refunded whole. */
export const NOT_HIRED_REASONS = [
  "quote-ended",
  "quote-changed",
  "not-verified",
  /** An Updated Quote's Payment that arrived once it was no longer proposed (#134). */
  "updated-quote-ended",
  /** Either party was Suspended, or the Job taken out of view, while the Client paid (#136). */
  "suspended",
  "out-of-view",
] as const;

/**
 * Each checkout a Client opens to Hire a Sent Quote: the Quote as it stood
 * then, and the Payment it asks for, the Quote plus the Protection Fee; or to
 * accept an Updated Quote (#134): its difference plus the Protection Fee. Our
 * id is the collection's id at the payment adapter and its reference. It is
 * open until the collection's event arrives: failed, which changes nothing
 * else, or succeeded, which Hires the Quote or applies the Updated Quote
 * (paid) or, if that can no longer happen, refunds the whole Payment
 * (not-hired). A trigger in the migration refuses any other change of state.
 */
export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => accounts.id),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id),
    /** The Quote it Hires, or whose Engagement's Updated Quote it pays for. */
    quoteId: text("quote_id")
      .notNull()
      .references(() => quotes.id),
    /** The Updated Quote it pays the difference of; null for a Hire's (#134). */
    updatedQuoteId: text("updated_quote_id").references((): AnySQLiteColumn => updatedQuotes.id),
    /** When the Quote was last revised as the Client saw it; the Hire is of that version only. */
    quoteRevisedAt: instant("quote_revised_at"),
    /** The Labour it pays in: the Quote's, or what an Updated Quote adds to it. */
    labourCents: integer("labour_cents").notNull(),
    /** The Materials it pays in: the Quote's, or what an Updated Quote adds to them. */
    materialsCents: integer("materials_cents").notNull(),
    protectionFeeCents: integer("protection_fee_cents").notNull(),
    /** What the Client pays: Labour, Materials, and the Protection Fee. */
    amountCents: integer("amount_cents").notNull(),
    state: text("state", { enum: PAYMENT_STATES }).notNull(),
    /** Card or Instant EFT, once it arrived. */
    method: text("method"),
    notHiredFor: text("not_hired_for", { enum: NOT_HIRED_REASONS }),
    /** Our id of the Refund of a Payment that Hired nobody, at the payment adapter. */
    refundId: text("refund_id"),
    openedAt: instant("opened_at").notNull(),
    /** When its event arrived. */
    settledAt: instant("settled_at"),
  },
  (table) => [
    index("payments_job").on(table.jobId, table.openedAt),
    index("payments_updated_quote").on(table.updatedQuoteId),
    check(
      "payments_state",
      sql.raw(`state in (${PAYMENT_STATES.map((state) => `'${state}'`).join(", ")})`),
    ),
    check(
      "payments_amounts",
      sql.raw(
        "typeof(amount_cents) = 'integer' and amount_cents = labour_cents + materials_cents + protection_fee_cents",
      ),
    ),
  ],
);

export const ENGAGEMENT_STATES = [
  "paid",
  "work-started",
  "awaiting-approval",
  "fix-requested",
  "disputed",
  "completed",
  "cancelled",
] as const;

/** Who set Work started: the Client, or the Artisan when the Client did not answer in 24 hours. */
export const WORK_STARTED_BY = ["client", "artisan"] as const;

/** Which party cancelled an Engagement (#133). */
export const CANCELLED_BY = ["client", "artisan"] as const;

/**
 * A Hired Quote's work and money, made at Hire, when its Payment arrived:
 * one per Job, Quote, and Payment. The Artisan Fee is fixed here for its whole
 * life. A trigger in the migration refuses changing whose it is or its fee,
 * and any move of its state but the ones built so far.
 */
export const engagements = sqliteTable(
  "engagements",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .unique()
      .references(() => jobs.id),
    quoteId: text("quote_id")
      .notNull()
      .unique()
      .references(() => quotes.id),
    paymentId: text("payment_id")
      .notNull()
      .unique()
      .references(() => payments.id),
    clientId: text("client_id")
      .notNull()
      .references(() => accounts.id),
    artisanId: text("artisan_id")
      .notNull()
      .references(() => accounts.id),
    state: text("state", { enum: ENGAGEMENT_STATES }).notNull(),
    /** 10, or 5 if the Client Relationship had a Completed Engagement at Hire (ADR 0009). */
    artisanFeePercent: integer("artisan_fee_percent").notNull(),
    hiredAt: instant("hired_at").notNull(),
    /** When the Artisan said they've started, while the Client has not answered (#127). */
    startClaimedAt: instant("start_claimed_at"),
    workStartedAt: instant("work_started_at"),
    workStartedBy: text("work_started_by", { enum: WORK_STARTED_BY }),
    /** When it was Approved, by the Client or by seven days of silence (#130). */
    completedAt: instant("completed_at"),
    /** When either party cancelled it before Approval (#133). */
    cancelledAt: instant("cancelled_at"),
    cancelledBy: text("cancelled_by", { enum: CANCELLED_BY }),
    /** The reason the party gave, if any, for the Artisan record: only the Admin reads it. */
    cancellationReason: text("cancellation_reason"),
  },
  (table) => [
    index("engagements_relationship").on(table.clientId, table.artisanId),
    index("engagements_cancelled").on(table.artisanId, table.cancelledAt),
    check(
      "engagements_state",
      sql.raw(`state in (${ENGAGEMENT_STATES.map((state) => `'${state}'`).join(", ")})`),
    ),
    check("engagements_artisan_fee", sql.raw("artisan_fee_percent in (5, 10)")),
  ],
);

/**
 * An Updated Quote's states: proposed, until the Artisan withdraws it, the
 * Client rejects it, the Client's Payment of its difference accepts it, or
 * the Engagement is Cancelled while it is proposed (ended).
 */
export const UPDATED_QUOTE_STATES = [
  "proposed",
  "withdrawn",
  "rejected",
  "accepted",
  "ended",
] as const;

/**
 * Each Updated Quote the Artisan proposes on an Engagement before Completion
 * (#134, ADR 0019): the Labour and Materials it stood at then, and the new
 * ones, neither lower. One is proposed at a time. What it proposes never
 * changes, and its state moves forward only (a trigger in the migration
 * refuses anything else).
 */
export const updatedQuotes = sqliteTable(
  "updated_quotes",
  {
    id: text("id").primaryKey(),
    engagementId: text("engagement_id")
      .notNull()
      .references(() => engagements.id),
    /** The Engagement's Labour when it was proposed: paid in, less any refunded. */
    fromLabourCents: integer("from_labour_cents").notNull(),
    fromMaterialsCents: integer("from_materials_cents").notNull(),
    labourCents: integer("labour_cents").notNull(),
    materialsCents: integer("materials_cents").notNull(),
    state: text("state", { enum: UPDATED_QUOTE_STATES }).notNull(),
    proposedAt: instant("proposed_at").notNull(),
    /** When it was withdrawn, rejected, accepted, or ended. */
    answeredAt: instant("answered_at"),
  },
  (table) => [
    index("updated_quotes_engagement").on(table.engagementId, table.proposedAt),
    uniqueIndex("updated_quotes_one_proposed")
      .on(table.engagementId)
      .where(sql.raw("state = 'proposed'")),
    check(
      "updated_quotes_state",
      sql.raw(`state in (${UPDATED_QUOTE_STATES.map((state) => `'${state}'`).join(", ")})`),
    ),
    check(
      "updated_quotes_amounts",
      sql.raw(
        "typeof(labour_cents) = 'integer' and typeof(materials_cents) = 'integer' and labour_cents >= from_labour_cents and materials_cents >= from_materials_cents and labour_cents + materials_cents > from_labour_cents + from_materials_cents",
      ),
    ),
  ],
);

/**
 * A Completion's states: Held for the Admin's Pre-check, made (the Client
 * may answer it), refused by the Admin, withdrawn by the Artisan while Held,
 * or unsent if the Engagement had moved on by its release.
 */
export const COMPLETION_STATES = ["held", "made", "refused", "withdrawn", "unsent"] as const;

/** The Client's answer to a made Completion; silence for seven days is Approval. */
export const COMPLETION_ANSWERS = ["approved", "approved-by-silence", "fix-requested"] as const;

/** Where a Fix request's note stands: shown to the Artisan, Held for the Admin, or refused. */
export const FIX_NOTE_STATES = ["shown", "held", "refused"] as const;

/** A Completion's document, and whether it is the certificate the law requires (Completion evidence). */
export type CompletionDocument = Extract<StoredFile, { kind: "photo" | "pdf" }> & {
  certificate: boolean;
};

/**
 * Each time the Artisan marks the work complete (#130): a note, the
 * after-work photos, and any documents, the certificate among them. Once made,
 * the Client answers it once: Approval, or a Fix request with a note, after
 * which the next Completion is a new row. A trigger in the migration refuses
 * any other change.
 */
export const completions = sqliteTable(
  "completions",
  {
    id: text("id").primaryKey(),
    engagementId: text("engagement_id")
      .notNull()
      .references(() => engagements.id),
    note: text("note").notNull(),
    photos: text("photos", { mode: "json" })
      .$type<Extract<StoredFile, { kind: "photo" }>[]>()
      .notNull(),
    documents: text("documents", { mode: "json" }).$type<CompletionDocument[]>().notNull(),
    state: text("state", { enum: COMPLETION_STATES }).notNull(),
    /** Why the Content check or the certificate's reading Held it, for the Admin. */
    heldFor: text("held_for"),
    /** What the certificate's reading found, for the Admin. */
    certificateFacts: text("certificate_facts", { mode: "json" })
      .$type<{ label: string; value: string }[]>()
      .notNull(),
    sentAt: instant("sent_at").notNull(),
    /** When the Client could first see it: the seven days run from here. */
    madeAt: instant("made_at"),
    answer: text("answer", { enum: COMPLETION_ANSWERS }),
    answeredAt: instant("answered_at"),
    fixNote: text("fix_note"),
    fixNoteState: text("fix_note_state", { enum: FIX_NOTE_STATES }),
    /** Why the Content check Held the Fix request's note, for the Admin. */
    fixNoteHeldFor: text("fix_note_held_for"),
  },
  (table) => [
    index("completions_engagement").on(table.engagementId, table.sentAt),
    uniqueIndex("completions_one_held").on(table.engagementId).where(sql.raw("state = 'held'")),
    uniqueIndex("completions_one_unanswered")
      .on(table.engagementId)
      .where(sql.raw("state = 'made' and answer is null")),
    check(
      "completions_state",
      sql.raw(`state in (${COMPLETION_STATES.map((state) => `'${state}'`).join(", ")})`),
    ),
    check(
      "completions_answer",
      sql.raw(`answer in (${COMPLETION_ANSWERS.map((answer) => `'${answer}'`).join(", ")})`),
    ),
    check(
      "completions_fix_note_state",
      sql.raw(`fix_note_state in (${FIX_NOTE_STATES.map((state) => `'${state}'`).join(", ")})`),
    ),
  ],
);

/**
 * A Refund's states: waiting while another Refund of its Payment is with the
 * payment adapter (one at a time per collection), sent once the adapter has
 * it, paused while the float is low, paid, or failed, when it stays owed to
 * the Client until the Admin pays it by hand.
 */
export const REFUND_STATES = [
  "waiting",
  "sent",
  "paused",
  "paid",
  "failed",
  "paid-by-hand",
] as const;

/**
 * Why a Refund was made: the Artisan's choice, a Payment that Hired nobody, a
 * Cancellation (#133), the Admin's decision of a Dispute (#135), or of a
 * Chargeback, for what the bank did not send back (#137).
 */
export const REFUND_CAUSES = [
  "artisan",
  "not-hired",
  "cancellation",
  "dispute",
  "chargeback",
] as const;

/**
 * Each Refund of a Payment to its Client (#132): unreleased money, never the
 * Protection Fee, unless the Payment Hired nobody, when the whole of it goes
 * back. Our id is the payment adapter's idempotency key. What it refunds of
 * the Labour, Materials, and Protection Fee never changes; its state moves
 * forward only (a trigger in the migration refuses anything else).
 */
export const refunds = sqliteTable(
  "refunds",
  {
    id: text("id").primaryKey(),
    paymentId: text("payment_id")
      .notNull()
      .references(() => payments.id),
    /** The Engagement it refunds; null for a Payment that Hired nobody. */
    engagementId: text("engagement_id").references(() => engagements.id),
    clientId: text("client_id")
      .notNull()
      .references(() => accounts.id),
    cause: text("cause", { enum: REFUND_CAUSES }).notNull(),
    labourCents: integer("labour_cents").notNull(),
    materialsCents: integer("materials_cents").notNull(),
    protectionFeeCents: integer("protection_fee_cents").notNull(),
    amountCents: integer("amount_cents").notNull(),
    state: text("state", { enum: REFUND_STATES }).notNull(),
    madeAt: instant("made_at").notNull(),
    sentAt: instant("sent_at"),
    pausedAt: instant("paused_at"),
    /** When the bank took it, or the Admin paid it by hand. */
    paidAt: instant("paid_at"),
    failedAt: instant("failed_at"),
    /** Why the bank could not take it. */
    failedFor: text("failed_for"),
  },
  (table) => [
    index("refunds_payment").on(table.paymentId, table.madeAt),
    index("refunds_engagement").on(table.engagementId, table.madeAt),
    index("refunds_waiting").on(table.paymentId).where(sql.raw("state = 'waiting'")),
    check(
      "refunds_state",
      sql.raw(`state in (${REFUND_STATES.map((state) => `'${state}'`).join(", ")})`),
    ),
    check(
      "refunds_cause",
      sql.raw(`cause in (${REFUND_CAUSES.map((cause) => `'${cause}'`).join(", ")})`),
    ),
    check(
      "refunds_amounts",
      sql.raw(
        "typeof(amount_cents) = 'integer' and amount_cents > 0 and labour_cents >= 0 and materials_cents >= 0 and protection_fee_cents >= 0 and amount_cents = labour_cents + materials_cents + protection_fee_cents",
      ),
    ),
  ],
);

/** Which party opened a Dispute (#135). */
export const DISPUTED_BY = ["client", "artisan"] as const;

/**
 * What a Dispute is against: the Client's, a Completion; the Artisan's, a Fix
 * request or a Cancellation's refund of the Labour.
 */
export const DISPUTE_GROUNDS = ["completion", "fix-request", "cancellation"] as const;

/**
 * A Dispute's states: open until the Admin decides it, or until nothing is
 * held, when it is settled by the parties.
 */
export const DISPUTE_STATES = ["open", "settled", "decided"] as const;

/** Where a Dispute's reason stands: shown to the other party, or kept for the Admin, who was unsure of it. */
export const DISPUTE_REASON_STATES = ["shown", "held"] as const;

/**
 * An Engagement's one Dispute (#135): the Labour it holds, named by the
 * Client or all of it unreleased for the Artisan, which the Admin splits
 * between Release and Refund, finally. What is held now is derived from the
 * ledger. What it was opened for never changes, and its state moves forward
 * once (a trigger in the migration refuses anything else).
 */
export const disputes = sqliteTable(
  "disputes",
  {
    id: text("id").primaryKey(),
    engagementId: text("engagement_id")
      .notNull()
      .unique()
      .references(() => engagements.id),
    openedBy: text("opened_by", { enum: DISPUTED_BY }).notNull(),
    against: text("against", { enum: DISPUTE_GROUNDS }).notNull(),
    /** The Completion disputed, or the one the Fix request answered; null for a Cancellation's. */
    completionId: text("completion_id").references(() => completions.id),
    /** The Labour it held when opened. */
    heldCents: integer("held_cents").notNull(),
    reason: text("reason").notNull(),
    photos: text("photos", { mode: "json" })
      .$type<Extract<StoredFile, { kind: "photo" }>[]>()
      .notNull(),
    reasonState: text("reason_state", { enum: DISPUTE_REASON_STATES }).notNull(),
    /** Why the Content check was unsure of the reason or its photos, for the Admin. */
    reasonHeldFor: text("reason_held_for"),
    state: text("state", { enum: DISPUTE_STATES }).notNull(),
    openedAt: instant("opened_at").notNull(),
    /** When it was settled or decided. */
    closedAt: instant("closed_at"),
    /** What the Admin's decision released to the Artisan, and refunded to the Client. */
    releasedCents: integer("released_cents"),
    refundedCents: integer("refunded_cents"),
  },
  () => [
    check(
      "disputes_state",
      sql.raw(`state in (${DISPUTE_STATES.map((state) => `'${state}'`).join(", ")})`),
    ),
    check("disputes_held", sql.raw("typeof(held_cents) = 'integer' and held_cents > 0")),
  ],
);

/**
 * A Chargeback's states: open, while the bank looks into it; closed, by the
 * bank, with what it sent back to the Client; and decided, by the Admin.
 */
export const CHARGEBACK_STATES = ["open", "closed", "decided"] as const;

/** How the bank closed a Chargeback, as the payment adapter says. */
export const CHARGEBACK_OUTCOMES = [
  "won",
  "lost",
  "accepted",
  "partially_accepted",
] as const satisfies readonly ChargebackOutcome[];

/**
 * A card Payment reversed by the bank (#137), one per Payment. Until the
 * Admin decides it, it freezes the Payment's Engagement: no clock does
 * anything and nothing more is released or refunded. Once the bank closes
 * it, the Admin decides the Engagement's unreleased money: released to the
 * Artisan, or left with the Chargeback, the Client's, refunded only for what
 * the bank did not send back. Of what the bank sent back, what the platform
 * no longer held is its loss. A trigger in the migration refuses any other
 * change.
 */
export const chargebacks = sqliteTable(
  "chargebacks",
  {
    id: text("id").primaryKey(),
    paymentId: text("payment_id")
      .notNull()
      .unique()
      .references(() => payments.id),
    /** The Engagement it freezes; null for a Payment that Hired nobody. */
    engagementId: text("engagement_id").references(() => engagements.id),
    clientId: text("client_id")
      .notNull()
      .references(() => accounts.id),
    /** What the bank disputes, as it opened it. */
    amountCents: integer("amount_cents").notNull(),
    state: text("state", { enum: CHARGEBACK_STATES }).notNull(),
    openedAt: instant("opened_at").notNull(),
    closedAt: instant("closed_at"),
    outcome: text("outcome", { enum: CHARGEBACK_OUTCOMES }),
    /** What the bank sent back to the Client, as it closed it. */
    reversedCents: integer("reversed_cents"),
    decidedAt: instant("decided_at"),
    /** What the Admin's decision released to the Artisan, before the Artisan Fee. */
    releasedCents: integer("released_cents"),
    /** What it left with the Chargeback, of what the bank sent back. */
    chargedBackCents: integer("charged_back_cents"),
    /** What it left to the Client beyond what the bank sent back, refunded. */
    refundedCents: integer("refunded_cents"),
    /** Of what the bank sent back, what the platform no longer held: its loss. */
    lossCents: integer("loss_cents"),
  },
  (table) => [
    index("chargebacks_engagement").on(table.engagementId),
    check(
      "chargebacks_state",
      sql.raw(`state in (${CHARGEBACK_STATES.map((state) => `'${state}'`).join(", ")})`),
    ),
    check(
      "chargebacks_outcome",
      sql.raw(`outcome in (${CHARGEBACK_OUTCOMES.map((outcome) => `'${outcome}'`).join(", ")})`),
    ),
    check("chargebacks_amount", sql.raw("typeof(amount_cents) = 'integer' and amount_cents > 0")),
  ],
);

export const PAYOUT_STATES = [
  "created",
  "pending",
  "paused",
  "paid",
  "refused",
  "sent-back",
  "unsent",
] as const;

/** The states a Payout ends in without paying its Release, which is then owed again (#129). */
export const STOPPED_PAYOUT_STATES = ["refused", "sent-back", "unsent"] as const;

/**
 * Each Release owed to an Artisan, sent to their current Payout account by
 * the daily run (#128). Our id is the payment adapter's idempotency key and,
 * shortened, the reference on the Artisan's bank statement. It is created
 * before the adapter is asked, so its events always find it; pending once
 * the adapter has it; paused while the float is low; and paid. The bank may
 * refuse it, at once or later, or send it back even days after it was paid;
 * one that never reached the adapter before its account stopped being
 * current is unsent (#129). Those three leave the Release owed again, and a
 * Release has at most one Payout in any other state. A trigger in the
 * migration refuses any other change.
 */
export const payouts = sqliteTable(
  "payouts",
  {
    id: text("id").primaryKey(),
    /** The Release's `payout.owed` ledger row. */
    owedEntryId: text("owed_entry_id")
      .notNull()
      .references(() => ledgerEntries.id),
    artisanId: text("artisan_id")
      .notNull()
      .references(() => accounts.id),
    engagementId: text("engagement_id")
      .notNull()
      .references(() => engagements.id),
    /** The accepted Payout account check it is sent to. */
    payoutAccountId: text("payout_account_id")
      .notNull()
      .references(() => verificationChecks.id),
    amountCents: integer("amount_cents").notNull(),
    state: text("state", { enum: PAYOUT_STATES }).notNull(),
    /** Why the bank refused it, or sent it back. */
    refusedFor: text("refused_for"),
    createdAt: instant("created_at").notNull(),
    pausedAt: instant("paused_at"),
    paidAt: instant("paid_at"),
    /** When it was refused, sent back, or found unsent. */
    stoppedAt: instant("stopped_at"),
  },
  (table) => [
    uniqueIndex("payouts_one_going")
      .on(table.owedEntryId)
      .where(sql.raw("state not in ('refused', 'sent-back', 'unsent')")),
    index("payouts_artisan").on(table.artisanId, table.createdAt),
    index("payouts_unpaid")
      .on(table.state)
      .where(sql.raw("state in ('created', 'pending', 'paused')")),
    check(
      "payouts_state",
      sql.raw(`state in (${PAYOUT_STATES.map((state) => `'${state}'`).join(", ")})`),
    ),
    check("payouts_amount", sql.raw("typeof(amount_cents) = 'integer' and amount_cents > 0")),
  ],
);

/**
 * Each day's Payout run, once per South African day, and its float check:
 * the float's balance and what the run needed of it.
 */
export const payoutRuns = sqliteTable("payout_runs", {
  /** The South African calendar day, YYYY-MM-DD. */
  day: text("day").primaryKey(),
  ranAt: instant("ran_at").notNull(),
  /** When every Payout it had to send went; until then, later minutes that day retry. */
  finishedAt: instant("finished_at"),
  floatCents: integer("float_cents").notNull(),
  neededCents: integer("needed_cents").notNull(),
});

/**
 * The fake payment adapter's state, in the Worker (#126): launch money is
 * fake in every environment, and its collections must outlive one isolate
 * for its checkout page to work. One row; tests keep the fake in memory.
 */
export const fakePaymentState = sqliteTable("fake_payment_state", {
  id: text("id").primaryKey(),
  state: text("state", { mode: "json" }).notNull(),
  /** Counts saves, so two requests never overwrite each other's. */
  version: integer("version").notNull(),
});
