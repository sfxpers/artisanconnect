-- Disputes (#135): the Client disputes a named part of the Labour at
-- Completion; the Artisan disputes the unreleased Labour against a Fix request
-- or a Cancellation's refund. A Dispute decision's Refund is a Refund of its
-- own cause, so the refunds table is made again with it, and its trigger with
-- it. A failed Refund's Support request references it, so foreign keys are
-- checked at the end: D1 ignores turning them off in a migration.
CREATE TABLE `disputes` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`opened_by` text NOT NULL,
	`against` text NOT NULL,
	`completion_id` text,
	`held_cents` integer NOT NULL,
	`reason` text NOT NULL,
	`photos` text NOT NULL,
	`reason_state` text NOT NULL,
	`reason_held_for` text,
	`state` text NOT NULL,
	`opened_at` integer NOT NULL,
	`closed_at` integer,
	`released_cents` integer,
	`refunded_cents` integer,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`completion_id`) REFERENCES `completions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "disputes_state" CHECK(state in ('open', 'settled', 'decided')),
	CONSTRAINT "disputes_held" CHECK(typeof(held_cents) = 'integer' and held_cents > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `disputes_engagement_id_unique` ON `disputes` (`engagement_id`);--> statement-breakpoint
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
	CONSTRAINT "refunds_cause" CHECK(cause in ('artisan', 'not-hired', 'cancellation', 'dispute')),
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
-- As before (0024): what a Refund refunds never changes, and its state moves
-- only forward.
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
-- What a Dispute was opened for never changes. An open one is settled, or
-- decided with what the Admin released and refunded, once, with when.
CREATE TRIGGER `disputes_fixed` BEFORE UPDATE ON `disputes`
WHEN NEW.`engagement_id` <> OLD.`engagement_id`
	OR NEW.`opened_by` <> OLD.`opened_by`
	OR NEW.`against` <> OLD.`against`
	OR NEW.`completion_id` IS NOT OLD.`completion_id`
	OR NEW.`held_cents` <> OLD.`held_cents`
	OR NEW.`reason` <> OLD.`reason`
	OR NEW.`photos` <> OLD.`photos`
	OR NEW.`reason_state` <> OLD.`reason_state`
	OR NEW.`reason_held_for` IS NOT OLD.`reason_held_for`
	OR NEW.`opened_at` <> OLD.`opened_at`
	OR NOT (
		OLD.`state` = 'open'
		AND NEW.`closed_at` IS NOT NULL
		AND (
			(NEW.`state` = 'settled' AND NEW.`released_cents` IS NULL AND NEW.`refunded_cents` IS NULL)
			OR (NEW.`state` = 'decided' AND NEW.`released_cents` >= 0 AND NEW.`refunded_cents` >= 0)
		)
	)
BEGIN
	SELECT RAISE(ABORT, 'a Dispute cannot change that way');
END;
--> statement-breakpoint
-- Whose an Engagement is, and its fee, never change. Its state moves only as
-- built so far, now also to Disputed: from Awaiting approval (the Client's),
-- from Fix requested or Cancelled (the Artisan's); and from Disputed to
-- Completed, with when, or back to Cancelled, after a Cancellation. Who
-- cancelled, when, and why are written only with the move to Cancelled, so a
-- Dispute that ends Cancelled leaves them as they were.
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
		AND NOT (OLD.`state` IN ('awaiting-approval', 'disputed') AND NEW.`state` = 'completed')
	)
	OR (
		(NEW.`cancelled_at` IS NOT OLD.`cancelled_at`
			OR NEW.`cancelled_by` IS NOT OLD.`cancelled_by`
			OR NEW.`cancellation_reason` IS NOT OLD.`cancellation_reason`)
		AND NOT (OLD.`state` NOT IN ('cancelled', 'disputed') AND NEW.`state` = 'cancelled')
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
			OR (OLD.`state` IN ('awaiting-approval', 'fix-requested') AND NEW.`state` = 'disputed')
			OR (OLD.`state` = 'cancelled' AND NEW.`state` = 'disputed'
				AND OLD.`work_started_at` IS NOT NULL)
			OR (OLD.`state` = 'disputed' AND NEW.`state` = 'completed'
				AND NEW.`completed_at` IS NOT NULL)
			OR (OLD.`state` = 'disputed' AND NEW.`state` = 'cancelled'
				AND OLD.`cancelled_at` IS NOT NULL)
		)
	)
BEGIN
	SELECT RAISE(ABORT, 'an Engagement cannot change that way');
END;
--> statement-breakpoint
-- What a Dispute holds is in the ledger: held when it opens, less what of it
-- is released or refunded. No Release or Refund of it takes more than is
-- held, so the Client's Release, the Artisan's Refund, and the Admin's split
-- at once cannot all take the same money: the later one's batch aborts.
CREATE TRIGGER `ledger_entries_within_held` AFTER INSERT ON `ledger_entries`
WHEN NEW.`kind` IN ('dispute.released', 'dispute.refunded')
	AND (
		SELECT coalesce(sum(CASE WHEN `kind` = 'dispute.held' THEN `amount_cents` ELSE -`amount_cents` END), 0)
		FROM `ledger_entries`
		WHERE `engagement_id` = NEW.`engagement_id`
			AND `kind` IN ('dispute.held', 'dispute.released', 'dispute.refunded')
	) < 0
BEGIN
	SELECT RAISE(ABORT, 'more than is held');
END;
--> statement-breakpoint
-- A Dispute never holds more Labour than is unreleased: a Release or Refund
-- of Labour, or a Dispute opened, that would leave it so aborts its batch, as
-- when a Dispute opened between an Artisan's read and their Refund's batch.
-- A batch that takes held Labour writes what it takes of the Dispute first.
CREATE TRIGGER `ledger_entries_held_within_unreleased` AFTER INSERT ON `ledger_entries`
WHEN NEW.`kind` IN ('release.labour', 'refund.labour', 'dispute.held')
	AND (
		SELECT coalesce(sum(CASE WHEN `kind` = 'dispute.held' THEN `amount_cents` ELSE -`amount_cents` END), 0)
		FROM `ledger_entries`
		WHERE `engagement_id` = NEW.`engagement_id`
			AND `kind` IN ('dispute.held', 'dispute.released', 'dispute.refunded')
	) > (
		SELECT coalesce(sum(CASE WHEN `kind` = 'payment.labour' THEN `amount_cents` ELSE -`amount_cents` END), 0)
		FROM `ledger_entries`
		WHERE `engagement_id` = NEW.`engagement_id`
			AND `kind` IN ('payment.labour', 'release.labour', 'refund.labour')
	)
BEGIN
	SELECT RAISE(ABORT, 'more than is held');
END;
