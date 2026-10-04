import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
  },
  (table) => [check("accounts_kind", sql`${table.kind} in ('client', 'artisan')`)],
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
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
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
