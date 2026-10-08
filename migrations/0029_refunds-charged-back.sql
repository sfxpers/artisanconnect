-- A Refund waiting on a Payment the bank charged back is never sent once the
-- Admin decides the Chargeback, as far as the bank sent its money back to the
-- Client already (#137): it is charged back. The refunds table is made again
-- for the new state, and its trigger with it. A failed Refund's Support
-- request references a Refund, so foreign keys are checked at the end: D1
-- ignores turning them off in a migration.
PRAGMA defer_foreign_keys = on;--> statement-breakpoint
CREATE TABLE `__new_refunds` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_id` text NOT NULL,
	`engagement_id` text,
	`client_id` text NOT NULL,
	`cause` text NOT NULL,
	`labour_cents` integer NOT NULL,
	`materials_cents` integer NOT NULL,
	`protection_fee_cents` integer NOT NULL,
	`amount_cents` integer NOT NULL,
	`state` text NOT NULL,
	`made_at` integer NOT NULL,
	`sent_at` integer,
	`paused_at` integer,
	`paid_at` integer,
	`failed_at` integer,
	`failed_for` text,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "refunds_state" CHECK(state in ('waiting', 'sent', 'paused', 'paid', 'failed', 'paid-by-hand', 'charged-back')),
	CONSTRAINT "refunds_cause" CHECK(cause in ('artisan', 'not-hired', 'cancellation', 'dispute', 'chargeback')),
	CONSTRAINT "refunds_amounts" CHECK(typeof(amount_cents) = 'integer' and amount_cents > 0 and labour_cents >= 0 and materials_cents >= 0 and protection_fee_cents >= 0 and amount_cents = labour_cents + materials_cents + protection_fee_cents)
);
--> statement-breakpoint
INSERT INTO `__new_refunds`("id", "payment_id", "engagement_id", "client_id", "cause", "labour_cents", "materials_cents", "protection_fee_cents", "amount_cents", "state", "made_at", "sent_at", "paused_at", "paid_at", "failed_at", "failed_for") SELECT "id", "payment_id", "engagement_id", "client_id", "cause", "labour_cents", "materials_cents", "protection_fee_cents", "amount_cents", "state", "made_at", "sent_at", "paused_at", "paid_at", "failed_at", "failed_for" FROM `refunds`;--> statement-breakpoint
DROP TABLE `refunds`;--> statement-breakpoint
ALTER TABLE `__new_refunds` RENAME TO `refunds`;--> statement-breakpoint
CREATE INDEX `refunds_payment` ON `refunds` (`payment_id`,`made_at`);--> statement-breakpoint
CREATE INDEX `refunds_engagement` ON `refunds` (`engagement_id`,`made_at`);--> statement-breakpoint
CREATE INDEX `refunds_waiting` ON `refunds` (`payment_id`) WHERE state = 'waiting';--> statement-breakpoint
PRAGMA defer_foreign_keys = off;--> statement-breakpoint
-- As before (0028), and a waiting Refund may be charged back.
CREATE TRIGGER `refunds_state_moves` BEFORE UPDATE ON `refunds`
WHEN NEW.`payment_id` <> OLD.`payment_id`
	OR NEW.`engagement_id` IS NOT OLD.`engagement_id`
	OR NEW.`client_id` <> OLD.`client_id`
	OR NEW.`cause` <> OLD.`cause`
	OR NEW.`labour_cents` <> OLD.`labour_cents`
	OR NEW.`materials_cents` <> OLD.`materials_cents`
	OR NEW.`protection_fee_cents` <> OLD.`protection_fee_cents`
	OR NEW.`amount_cents` <> OLD.`amount_cents`
	OR NEW.`made_at` <> OLD.`made_at`
	OR (NEW.`state` <> OLD.`state` AND NOT (
		(OLD.`state` = 'waiting' AND NEW.`state` IN ('sent', 'paused', 'paid', 'failed', 'charged-back'))
		OR (OLD.`state` = 'sent' AND NEW.`state` IN ('paused', 'paid', 'failed'))
		OR (OLD.`state` = 'paused' AND NEW.`state` IN ('paid', 'failed'))
		OR (OLD.`state` = 'failed' AND NEW.`state` = 'paid-by-hand')
	))
BEGIN
	SELECT RAISE(ABORT, 'a Refund cannot change that way');
END;
