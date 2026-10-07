CREATE TABLE `engagements` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`quote_id` text NOT NULL,
	`payment_id` text NOT NULL,
	`client_id` text NOT NULL,
	`artisan_id` text NOT NULL,
	`state` text NOT NULL,
	`artisan_fee_percent` integer NOT NULL,
	`hired_at` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`quote_id`) REFERENCES `quotes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`artisan_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "engagements_state" CHECK(state in ('paid', 'work-started', 'awaiting-approval', 'fix-requested', 'disputed', 'completed', 'cancelled')),
	CONSTRAINT "engagements_artisan_fee" CHECK(artisan_fee_percent in (5, 10))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `engagements_job_id_unique` ON `engagements` (`job_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `engagements_quote_id_unique` ON `engagements` (`quote_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `engagements_payment_id_unique` ON `engagements` (`payment_id`);--> statement-breakpoint
CREATE INDEX `engagements_relationship` ON `engagements` (`client_id`,`artisan_id`);--> statement-breakpoint
CREATE TABLE `fake_payment_state` (
	`id` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`version` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`job_id` text NOT NULL,
	`quote_id` text NOT NULL,
	`quote_revised_at` integer,
	`labour_cents` integer NOT NULL,
	`materials_cents` integer NOT NULL,
	`protection_fee_cents` integer NOT NULL,
	`amount_cents` integer NOT NULL,
	`state` text NOT NULL,
	`method` text,
	`not_hired_for` text,
	`refund_id` text,
	`opened_at` integer NOT NULL,
	`settled_at` integer,
	FOREIGN KEY (`client_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`quote_id`) REFERENCES `quotes`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payments_state" CHECK(state in ('open', 'failed', 'paid', 'not-hired')),
	CONSTRAINT "payments_amounts" CHECK(typeof(amount_cents) = 'integer' and amount_cents = labour_cents + materials_cents + protection_fee_cents)
);
--> statement-breakpoint
CREATE INDEX `payments_job` ON `payments` (`job_id`,`opened_at`);--> statement-breakpoint
ALTER TABLE `ledger_entries` ADD `payment_id` text REFERENCES payments(id);--> statement-breakpoint
ALTER TABLE `ledger_entries` ADD `engagement_id` text REFERENCES engagements(id);--> statement-breakpoint
CREATE INDEX `ledger_entries_payment` ON `ledger_entries` (`payment_id`);--> statement-breakpoint
CREATE INDEX `ledger_entries_engagement` ON `ledger_entries` (`engagement_id`);--> statement-breakpoint
-- A Payment moves only these ways: an open one fails, or arrives and Hires
-- (paid) or Hires nobody (not-hired); a failed one may still arrive. What it
-- asks for, and for which Quote, never changes. Anything else aborts the batch.
CREATE TRIGGER `payments_state_moves` BEFORE UPDATE ON `payments`
WHEN NEW.`quote_id` <> OLD.`quote_id`
	OR NEW.`client_id` <> OLD.`client_id`
	OR NEW.`amount_cents` <> OLD.`amount_cents`
	OR NEW.`labour_cents` <> OLD.`labour_cents`
	OR NEW.`materials_cents` <> OLD.`materials_cents`
	OR NEW.`protection_fee_cents` <> OLD.`protection_fee_cents`
	OR (NEW.`state` <> OLD.`state` AND NOT (
		(OLD.`state` = 'open' AND NEW.`state` IN ('failed', 'paid', 'not-hired'))
		OR (OLD.`state` = 'failed' AND NEW.`state` IN ('paid', 'not-hired'))
	))
BEGIN
	SELECT RAISE(ABORT, 'a Payment cannot change that way');
END;
--> statement-breakpoint
-- Whose an Engagement is, what it Hired, and its Artisan Fee never change.
-- Its states move with the tickets that move them (#127 on); until then none.
CREATE TRIGGER `engagements_fixed` BEFORE UPDATE ON `engagements`
WHEN NEW.`job_id` <> OLD.`job_id`
	OR NEW.`quote_id` <> OLD.`quote_id`
	OR NEW.`payment_id` <> OLD.`payment_id`
	OR NEW.`client_id` <> OLD.`client_id`
	OR NEW.`artisan_id` <> OLD.`artisan_id`
	OR NEW.`artisan_fee_percent` <> OLD.`artisan_fee_percent`
	OR NEW.`hired_at` <> OLD.`hired_at`
	OR NEW.`state` <> OLD.`state`
BEGIN
	SELECT RAISE(ABORT, 'an Engagement cannot change that way');
END;
--> statement-breakpoint
-- An Expired Job may still be Hired from a Quote that is still Sent, without
-- a Renew (#126). Otherwise as before.
DROP TRIGGER `jobs_state_moves`;
--> statement-breakpoint
CREATE TRIGGER `jobs_state_moves` BEFORE UPDATE OF `state` ON `jobs`
WHEN NOT (
	(OLD.`state` = 'draft' AND NEW.`state` IN ('held', 'open'))
	OR (OLD.`state` = 'held' AND NEW.`state` IN ('draft', 'open'))
	OR (OLD.`state` = 'open' AND NEW.`state` IN ('expired', 'closed', 'hired'))
	OR (OLD.`state` = 'expired' AND NEW.`state` IN ('open', 'hired'))
)
BEGIN
	SELECT RAISE(ABORT, 'a Job cannot change that way');
END;
