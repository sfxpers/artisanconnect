import { sql } from "drizzle-orm";
import { MATCHINGS, SITE_TYPES } from "./jobs/inputs";
import { QUEUE_NAMES } from "./queue-names";
import { SUPPORT_TOPICS } from "./support/topics";
import { SERVICE_CATEGORIES } from "./service-categories";
import { CHECK_KINDS } from "./verification/checks";
import type { CheckDetails, CheckFile, Reading } from "./verification/stored";
import type { StoredFile } from "./uploads";
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
  },
  (table) => [
    index("ledger_entries_event").on(table.eventId),
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
 * Every Admin decision and every logged read: who, what, and when. Append-only
 * (a trigger in the migration refuses updates and deletes). A decision's row
 * is written in the decision's own batch, and a read's before it is shown.
 */
export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    adminId: text("admin_id")
      .notNull()
      .references(() => admins.id),
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
