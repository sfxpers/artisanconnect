import { sql } from "drizzle-orm";
import { QUEUE_NAMES } from "./queue-names";
import {
  check,
  index,
  integer,
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
     * Or an address no Account holds, such as an invited Admin's: told by
     * email only, with no stream to show it in.
     */
    address: text("address"),
    /** What happened, by kind; the title names it for the person. */
    event: text("event").notNull(),
    title: text("title").notNull(),
    link: text("link").notNull(),
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
