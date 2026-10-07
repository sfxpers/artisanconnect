-- A Payout refused or sent back (#129). A Release may have more than one
-- Payout, as one the bank refused or sent back leaves it owed again, so the
-- one-Payout-per-Release index becomes one going Payout per Release.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_payouts` (
	`id` text PRIMARY KEY NOT NULL,
	`owed_entry_id` text NOT NULL,
	`artisan_id` text NOT NULL,
	`engagement_id` text NOT NULL,
	`payout_account_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`state` text NOT NULL,
	`refused_for` text,
	`created_at` integer NOT NULL,
	`paused_at` integer,
	`paid_at` integer,
	`stopped_at` integer,
	FOREIGN KEY (`owed_entry_id`) REFERENCES `ledger_entries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`artisan_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payout_account_id`) REFERENCES `verification_checks`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payouts_state" CHECK(state in ('created', 'pending', 'paused', 'paid', 'refused', 'sent-back', 'unsent')),
	CONSTRAINT "payouts_amount" CHECK(typeof(amount_cents) = 'integer' and amount_cents > 0)
);
--> statement-breakpoint
INSERT INTO `__new_payouts`("id", "owed_entry_id", "artisan_id", "engagement_id", "payout_account_id", "amount_cents", "state", "refused_for", "created_at", "paused_at", "paid_at", "stopped_at") SELECT "id", "owed_entry_id", "artisan_id", "engagement_id", "payout_account_id", "amount_cents", "state", "refused_for", "created_at", "paused_at", "paid_at", NULL FROM `payouts`;--> statement-breakpoint
DROP TABLE `payouts`;--> statement-breakpoint
ALTER TABLE `__new_payouts` RENAME TO `payouts`;--> statement-breakpoint
CREATE UNIQUE INDEX `payouts_one_going` ON `payouts` (`owed_entry_id`) WHERE state not in ('refused', 'sent-back', 'unsent');--> statement-breakpoint
CREATE INDEX `payouts_artisan` ON `payouts` (`artisan_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `payouts_unpaid` ON `payouts` (`state`) WHERE state in ('created', 'pending', 'paused');--> statement-breakpoint
-- What a Payout pays, to whom, and where never change. Its state moves only
-- forward: created to pending once the adapter has it; then paused while the
-- float is low, and paid. The bank may refuse it, at once or later, or send
-- it back, even once paid; one created whose account stopped being current
-- before the adapter had it is unsent. Those three are where it ends.
CREATE TRIGGER `payouts_state_moves` BEFORE UPDATE ON `payouts`
WHEN NEW.`owed_entry_id` <> OLD.`owed_entry_id`
	OR NEW.`artisan_id` <> OLD.`artisan_id`
	OR NEW.`engagement_id` <> OLD.`engagement_id`
	OR NEW.`payout_account_id` <> OLD.`payout_account_id`
	OR NEW.`amount_cents` <> OLD.`amount_cents`
	OR NEW.`created_at` <> OLD.`created_at`
	OR (NEW.`state` <> OLD.`state` AND NOT (
		(OLD.`state` = 'created' AND NEW.`state` IN ('pending', 'paused', 'paid', 'refused', 'sent-back', 'unsent'))
		OR (OLD.`state` = 'pending' AND NEW.`state` IN ('paused', 'paid', 'refused', 'sent-back'))
		OR (OLD.`state` = 'paused' AND NEW.`state` IN ('paid', 'refused', 'sent-back'))
		OR (OLD.`state` = 'paid' AND NEW.`state` = 'sent-back')
	))
BEGIN
	SELECT RAISE(ABORT, 'a Payout cannot change that way');
END;
--> statement-breakpoint
-- The system logs for the Admin too, such as a Payout sent back: its rows have no Admin.
CREATE TABLE `__new_audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`admin_id` text,
	`action` text NOT NULL,
	`summary` text NOT NULL,
	`subject_id` text,
	`at` integer NOT NULL,
	FOREIGN KEY (`admin_id`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_audit_log`("id", "admin_id", "action", "summary", "subject_id", "at") SELECT "id", "admin_id", "action", "summary", "subject_id", "at" FROM `audit_log`;--> statement-breakpoint
DROP TABLE `audit_log`;--> statement-breakpoint
ALTER TABLE `__new_audit_log` RENAME TO `audit_log`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `audit_log_at` ON `audit_log` (`at`);--> statement-breakpoint
-- The audit log is append-only: a row is never changed or removed.
CREATE TRIGGER `audit_log_no_update` BEFORE UPDATE ON `audit_log`
BEGIN
	SELECT RAISE(ABORT, 'the audit log is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `audit_log_no_delete` BEFORE DELETE ON `audit_log`
BEGIN
	SELECT RAISE(ABORT, 'the audit log is append-only');
END;
--> statement-breakpoint
ALTER TABLE `payout_runs` ADD `finished_at` integer;--> statement-breakpoint
-- The runs before this one are done.
UPDATE `payout_runs` SET `finished_at` = `ran_at`;--> statement-breakpoint
ALTER TABLE `verification_checks` ADD `payouts_stopped_at` integer;--> statement-breakpoint
-- Only a Payout account is stopped by the bank, and once.
CREATE TRIGGER `verification_checks_payouts_stopped_once` BEFORE UPDATE OF `payouts_stopped_at` ON `verification_checks`
WHEN OLD.`payouts_stopped_at` IS NOT NULL OR NEW.`kind` <> 'payout-account'
BEGIN
	SELECT RAISE(ABORT, 'a Payout account is stopped once');
END;
