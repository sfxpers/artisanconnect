CREATE TABLE `payout_runs` (
	`day` text PRIMARY KEY NOT NULL,
	`ran_at` integer NOT NULL,
	`float_cents` integer NOT NULL,
	`needed_cents` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payouts` (
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
	FOREIGN KEY (`owed_entry_id`) REFERENCES `ledger_entries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`artisan_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payout_account_id`) REFERENCES `verification_checks`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payouts_state" CHECK(state in ('created', 'pending', 'paused', 'paid', 'refused')),
	CONSTRAINT "payouts_amount" CHECK(typeof(amount_cents) = 'integer' and amount_cents > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payouts_owed_entry_id_unique` ON `payouts` (`owed_entry_id`);--> statement-breakpoint
CREATE INDEX `payouts_artisan` ON `payouts` (`artisan_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `payouts_unpaid` ON `payouts` (`state`) WHERE state in ('created', 'pending', 'paused');--> statement-breakpoint
ALTER TABLE `accounts` ADD `payouts_held_at` integer;--> statement-breakpoint
-- What a Payout pays, to whom, and where never change. Its state moves only
-- forward: created to pending once the adapter has it, or refused at once by
-- the bank; then paused while the float is low, and paid. A sent-back or
-- failed Payout comes with #129.
CREATE TRIGGER `payouts_state_moves` BEFORE UPDATE ON `payouts`
WHEN NEW.`owed_entry_id` <> OLD.`owed_entry_id`
	OR NEW.`artisan_id` <> OLD.`artisan_id`
	OR NEW.`engagement_id` <> OLD.`engagement_id`
	OR NEW.`payout_account_id` <> OLD.`payout_account_id`
	OR NEW.`amount_cents` <> OLD.`amount_cents`
	OR NEW.`created_at` <> OLD.`created_at`
	OR (NEW.`state` <> OLD.`state` AND NOT (
		(OLD.`state` = 'created' AND NEW.`state` IN ('pending', 'refused', 'paused', 'paid'))
		OR (OLD.`state` = 'pending' AND NEW.`state` IN ('paused', 'paid'))
		OR (OLD.`state` = 'paused' AND NEW.`state` = 'paid')
	))
BEGIN
	SELECT RAISE(ABORT, 'a Payout cannot change that way');
END;
