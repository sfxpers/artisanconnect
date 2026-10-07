-- Cancellation (#133): either party ends an Engagement before Approval. A
-- Cancellation's Refund is a Refund of its own cause, so the refunds table is
-- made again with it, and its trigger with it. A failed Refund's Support
-- request references it, so foreign keys are checked at the end, once the
-- new table holds every Refund: D1 ignores turning them off in a migration.
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
	CONSTRAINT "refunds_state" CHECK(state in ('waiting', 'sent', 'paused', 'paid', 'failed', 'paid-by-hand')),
	CONSTRAINT "refunds_cause" CHECK(cause in ('artisan', 'not-hired', 'cancellation')),
	CONSTRAINT "refunds_amounts" CHECK(typeof(amount_cents) = 'integer' and amount_cents > 0 and labour_cents >= 0 and materials_cents >= 0 and protection_fee_cents >= 0 and amount_cents = labour_cents + materials_cents + protection_fee_cents)
);
--> statement-breakpoint
INSERT INTO `__new_refunds`("id", "payment_id", "engagement_id", "client_id", "cause", "labour_cents", "materials_cents", "protection_fee_cents", "amount_cents", "state", "made_at", "sent_at", "paused_at", "paid_at", "failed_at", "failed_for") SELECT "id", "payment_id", "engagement_id", "client_id", "cause", "labour_cents", "materials_cents", "protection_fee_cents", "amount_cents", "state", "made_at", "sent_at", "paused_at", "paid_at", "failed_at", "failed_for" FROM `refunds`;--> statement-breakpoint
DROP TABLE `refunds`;--> statement-breakpoint
ALTER TABLE `__new_refunds` RENAME TO `refunds`;--> statement-breakpoint
PRAGMA defer_foreign_keys = off;--> statement-breakpoint
CREATE INDEX `refunds_payment` ON `refunds` (`payment_id`,`made_at`);--> statement-breakpoint
CREATE INDEX `refunds_engagement` ON `refunds` (`engagement_id`,`made_at`);--> statement-breakpoint
CREATE INDEX `refunds_waiting` ON `refunds` (`payment_id`) WHERE state = 'waiting';--> statement-breakpoint
ALTER TABLE `engagements` ADD `cancelled_at` integer;--> statement-breakpoint
ALTER TABLE `engagements` ADD `cancelled_by` text;--> statement-breakpoint
ALTER TABLE `engagements` ADD `cancellation_reason` text;--> statement-breakpoint
CREATE INDEX `engagements_cancelled` ON `engagements` (`artisan_id`,`cancelled_at`);--> statement-breakpoint
-- What a Refund refunds, of whose Payment, never changes. Its state moves
-- only forward: a waiting one is sent, or its event arrives first; a sent one
-- is paused while the float is low, paid, or fails; a paused one is paid or
-- fails; a failed one the Admin pays by hand. Anything else aborts the batch.
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
		(OLD.`state` = 'waiting' AND NEW.`state` IN ('sent', 'paused', 'paid', 'failed'))
		OR (OLD.`state` = 'sent' AND NEW.`state` IN ('paused', 'paid', 'failed'))
		OR (OLD.`state` = 'paused' AND NEW.`state` IN ('paid', 'failed'))
		OR (OLD.`state` = 'failed' AND NEW.`state` = 'paid-by-hand')
	))
BEGIN
	SELECT RAISE(ABORT, 'a Refund cannot change that way');
END;
--> statement-breakpoint
-- Whose an Engagement is, and its fee, never change. Its state moves only as
-- built so far, now also to Cancelled, once, before Approval: from Paid, Work
-- started, Awaiting approval, or Fix requested, with when and by which party.
-- Who cancelled, when, and why are written only with that move.
DROP TRIGGER `engagements_fixed`;
--> statement-breakpoint
CREATE TRIGGER `engagements_fixed` BEFORE UPDATE ON `engagements`
WHEN NEW.`job_id` <> OLD.`job_id`
	OR NEW.`quote_id` <> OLD.`quote_id`
	OR NEW.`payment_id` <> OLD.`payment_id`
	OR NEW.`client_id` <> OLD.`client_id`
	OR NEW.`artisan_id` <> OLD.`artisan_id`
	OR NEW.`artisan_fee_percent` <> OLD.`artisan_fee_percent`
	OR NEW.`hired_at` <> OLD.`hired_at`
	OR (NEW.`start_claimed_at` IS NOT OLD.`start_claimed_at` AND OLD.`state` <> 'paid')
	OR (
		(NEW.`work_started_at` IS NOT OLD.`work_started_at`
			OR NEW.`work_started_by` IS NOT OLD.`work_started_by`)
		AND NOT (OLD.`state` = 'paid' AND NEW.`state` = 'work-started')
	)
	OR (
		NEW.`completed_at` IS NOT OLD.`completed_at`
		AND NOT (OLD.`state` = 'awaiting-approval' AND NEW.`state` = 'completed')
	)
	OR (
		(NEW.`cancelled_at` IS NOT OLD.`cancelled_at`
			OR NEW.`cancelled_by` IS NOT OLD.`cancelled_by`
			OR NEW.`cancellation_reason` IS NOT OLD.`cancellation_reason`)
		AND NOT (OLD.`state` <> 'cancelled' AND NEW.`state` = 'cancelled')
	)
	OR (
		NEW.`state` <> OLD.`state`
		AND NOT (
			(OLD.`state` = 'paid' AND NEW.`state` = 'work-started'
				AND NEW.`work_started_at` IS NOT NULL
				AND NEW.`work_started_by` IN ('client', 'artisan'))
			OR (OLD.`state` IN ('work-started', 'fix-requested') AND NEW.`state` = 'awaiting-approval')
			OR (OLD.`state` = 'awaiting-approval' AND NEW.`state` = 'fix-requested')
			OR (OLD.`state` = 'awaiting-approval' AND NEW.`state` = 'completed'
				AND NEW.`completed_at` IS NOT NULL)
			OR (OLD.`state` IN ('paid', 'work-started', 'awaiting-approval', 'fix-requested')
				AND NEW.`state` = 'cancelled'
				AND NEW.`cancelled_at` IS NOT NULL
				AND NEW.`cancelled_by` IN ('client', 'artisan'))
		)
	)
BEGIN
	SELECT RAISE(ABORT, 'an Engagement cannot change that way');
END;
