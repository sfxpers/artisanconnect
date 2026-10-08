-- Chargebacks (#137): a card Payment the bank reverses freezes its
-- Engagement until the Admin decides its unreleased money, once the bank has
-- closed it. A Refund the decision makes, of what the bank did not send back,
-- is a Refund of its own cause, so the refunds table is made again with it,
-- and its trigger with it; and the system suspends the Client, so a
-- Suspension's Admin may be none, and the suspensions table is made again
-- too. A failed Refund's Support request references a Refund, so foreign keys
-- are checked at the end: D1 ignores turning them off in a migration. Each
-- trigger made again is dropped only if it exists, as a local database may
-- have lost one.
CREATE TABLE `chargebacks` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_id` text NOT NULL,
	`engagement_id` text,
	`client_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`state` text NOT NULL,
	`opened_at` integer NOT NULL,
	`closed_at` integer,
	`outcome` text,
	`reversed_cents` integer,
	`decided_at` integer,
	`released_cents` integer,
	`charged_back_cents` integer,
	`refunded_cents` integer,
	`loss_cents` integer,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "chargebacks_state" CHECK(state in ('open', 'closed', 'decided')),
	CONSTRAINT "chargebacks_outcome" CHECK(outcome in ('won', 'lost', 'accepted', 'partially_accepted')),
	CONSTRAINT "chargebacks_amount" CHECK(typeof(amount_cents) = 'integer' and amount_cents > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chargebacks_payment_id_unique` ON `chargebacks` (`payment_id`);--> statement-breakpoint
CREATE INDEX `chargebacks_engagement` ON `chargebacks` (`engagement_id`);--> statement-breakpoint
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
CREATE TABLE `__new_suspensions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`reason` text NOT NULL,
	`leaving` integer NOT NULL,
	`suspended_by` text,
	`suspended_at` integer NOT NULL,
	`lifted_by` text,
	`lifted_at` integer,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`suspended_by`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lifted_by`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_suspensions`("id", "account_id", "reason", "leaving", "suspended_by", "suspended_at", "lifted_by", "lifted_at") SELECT "id", "account_id", "reason", "leaving", "suspended_by", "suspended_at", "lifted_by", "lifted_at" FROM `suspensions`;--> statement-breakpoint
DROP TABLE `suspensions`;--> statement-breakpoint
ALTER TABLE `__new_suspensions` RENAME TO `suspensions`;--> statement-breakpoint
CREATE INDEX `suspensions_account` ON `suspensions` (`account_id`,`suspended_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `suspensions_one_standing` ON `suspensions` (`account_id`) WHERE lifted_at is null;--> statement-breakpoint
PRAGMA defer_foreign_keys = off;--> statement-breakpoint
-- As before (0026): what a Refund refunds never changes, and its state moves
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
-- What the bank opened a Chargeback for never changes. An open one is closed
-- once, with how, what was sent back, and when; a closed one is decided once,
-- with what the Admin released, left with it, and refunded, the loss, and when.
CREATE TRIGGER `chargebacks_state_moves` BEFORE UPDATE ON `chargebacks`
WHEN NEW.`payment_id` <> OLD.`payment_id`
	OR NEW.`engagement_id` IS NOT OLD.`engagement_id`
	OR NEW.`client_id` <> OLD.`client_id`
	OR NEW.`amount_cents` <> OLD.`amount_cents`
	OR NEW.`opened_at` <> OLD.`opened_at`
	OR NOT (
		(OLD.`state` = 'open' AND NEW.`state` = 'closed'
			AND NEW.`closed_at` IS NOT NULL
			AND NEW.`outcome` IS NOT NULL
			AND typeof(NEW.`reversed_cents`) = 'integer' AND NEW.`reversed_cents` >= 0
			AND NEW.`decided_at` IS NULL)
		OR (OLD.`state` = 'closed' AND NEW.`state` = 'decided'
			AND NEW.`closed_at` = OLD.`closed_at`
			AND NEW.`outcome` = OLD.`outcome`
			AND NEW.`reversed_cents` = OLD.`reversed_cents`
			AND NEW.`decided_at` IS NOT NULL
			AND NEW.`released_cents` >= 0
			AND NEW.`charged_back_cents` >= 0
			AND NEW.`refunded_cents` >= 0
			AND NEW.`loss_cents` >= 0)
	)
BEGIN
	SELECT RAISE(ABORT, 'a Chargeback cannot change that way');
END;
--> statement-breakpoint
-- While a Chargeback on its Payment is undecided, nothing more of an
-- Engagement is released or refunded, and no Dispute holds any of it: its
-- money is the Admin's to decide. The decision's own batch decides the
-- Chargeback first.
CREATE TRIGGER `ledger_entries_not_frozen` AFTER INSERT ON `ledger_entries`
WHEN NEW.`kind` IN ('release.labour', 'release.materials', 'refund.labour', 'refund.materials', 'dispute.held')
	AND EXISTS (
		SELECT 1 FROM `chargebacks`
		WHERE `engagement_id` = NEW.`engagement_id` AND `state` <> 'decided'
	)
BEGIN
	SELECT RAISE(ABORT, 'frozen by a Chargeback');
END;
--> statement-breakpoint
-- As before (0023), and what the Admin left with a Chargeback (#137) is taken
-- from a part as a Release or Refund is: none takes more than is unreleased.
DROP TRIGGER IF EXISTS `ledger_entries_within_unreleased`;
--> statement-breakpoint
CREATE TRIGGER `ledger_entries_within_unreleased` AFTER INSERT ON `ledger_entries`
WHEN NEW.`kind` IN ('release.labour', 'release.materials', 'refund.labour', 'refund.materials', 'chargeback.labour', 'chargeback.materials')
	AND (
		SELECT coalesce(sum(CASE WHEN `kind` LIKE 'payment.%' THEN `amount_cents` ELSE -`amount_cents` END), 0)
		FROM `ledger_entries`
		WHERE `engagement_id` = NEW.`engagement_id`
			AND `kind` IN (
				'payment.' || substr(NEW.`kind`, instr(NEW.`kind`, '.') + 1),
				'release.' || substr(NEW.`kind`, instr(NEW.`kind`, '.') + 1),
				'refund.' || substr(NEW.`kind`, instr(NEW.`kind`, '.') + 1),
				'chargeback.' || substr(NEW.`kind`, instr(NEW.`kind`, '.') + 1)
			)
	) < 0
BEGIN
	SELECT RAISE(ABORT, 'more than is unreleased');
END;
--> statement-breakpoint
-- As before (0025), counting the Materials left with a Chargeback as gone.
DROP TRIGGER IF EXISTS `ledger_entries_materials_all_released`;
--> statement-breakpoint
CREATE TRIGGER `ledger_entries_materials_all_released` AFTER INSERT ON `ledger_entries`
WHEN NEW.`kind` = 'release.materials'
	AND (
		SELECT coalesce(sum(CASE WHEN `kind` = 'payment.materials' THEN `amount_cents` ELSE -`amount_cents` END), 0)
		FROM `ledger_entries`
		WHERE `engagement_id` = NEW.`engagement_id`
			AND `kind` IN ('payment.materials', 'release.materials', 'refund.materials', 'chargeback.materials')
	) > 0
BEGIN
	SELECT RAISE(ABORT, 'Materials left unreleased');
END;
--> statement-breakpoint
-- As before (0025), and what a Chargeback took back of a Payment counts
-- against what may be refunded of it, as a Refund does.
DROP TRIGGER IF EXISTS `ledger_entries_within_payment`;
--> statement-breakpoint
CREATE TRIGGER `ledger_entries_within_payment` AFTER INSERT ON `ledger_entries`
WHEN NEW.`kind` IN ('refund.labour', 'refund.materials', 'chargeback.labour', 'chargeback.materials')
	AND (
		SELECT coalesce(sum(CASE WHEN `kind` LIKE 'payment.%' THEN `amount_cents` ELSE -`amount_cents` END), 0)
		FROM `ledger_entries`
		WHERE `payment_id` = NEW.`payment_id`
			AND `engagement_id` = NEW.`engagement_id`
			AND `kind` IN (
				'payment.' || substr(NEW.`kind`, instr(NEW.`kind`, '.') + 1),
				'refund.' || substr(NEW.`kind`, instr(NEW.`kind`, '.') + 1),
				'chargeback.' || substr(NEW.`kind`, instr(NEW.`kind`, '.') + 1)
			)
	) < 0
BEGIN
	SELECT RAISE(ABORT, 'more than is unreleased');
END;
--> statement-breakpoint
-- As before (0026), counting the Labour left with a Chargeback as gone, so a
-- decision that leaves some with it takes it out of the Dispute first.
DROP TRIGGER IF EXISTS `ledger_entries_held_within_unreleased`;
--> statement-breakpoint
CREATE TRIGGER `ledger_entries_held_within_unreleased` AFTER INSERT ON `ledger_entries`
WHEN NEW.`kind` IN ('release.labour', 'refund.labour', 'chargeback.labour', 'dispute.held')
	AND (
		SELECT coalesce(sum(CASE WHEN `kind` = 'dispute.held' THEN `amount_cents` ELSE -`amount_cents` END), 0)
		FROM `ledger_entries`
		WHERE `engagement_id` = NEW.`engagement_id`
			AND `kind` IN ('dispute.held', 'dispute.released', 'dispute.refunded')
	) > (
		SELECT coalesce(sum(CASE WHEN `kind` = 'payment.labour' THEN `amount_cents` ELSE -`amount_cents` END), 0)
		FROM `ledger_entries`
		WHERE `engagement_id` = NEW.`engagement_id`
			AND `kind` IN ('payment.labour', 'release.labour', 'refund.labour', 'chargeback.labour')
	)
BEGIN
	SELECT RAISE(ABORT, 'more than is held');
END;
--> statement-breakpoint
-- As before (0026), and the Admin's decision of a Chargeback ends its
-- Engagement: Completed once a Completion was made, now also from Fix
-- requested; otherwise Cancelled, from Paid or Work started, by neither
-- party, so who cancelled stays empty.
DROP TRIGGER IF EXISTS `engagements_fixed`;
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
		AND NOT (OLD.`state` IN ('awaiting-approval', 'disputed', 'fix-requested') AND NEW.`state` = 'completed')
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
			OR (OLD.`state` = 'fix-requested' AND NEW.`state` = 'completed'
				AND NEW.`completed_at` IS NOT NULL
				AND EXISTS (SELECT 1 FROM `chargebacks` WHERE `engagement_id` = NEW.`id`))
			OR (OLD.`state` IN ('paid', 'work-started') AND NEW.`state` = 'cancelled'
				AND NEW.`cancelled_at` IS NOT NULL
				AND NEW.`cancelled_by` IS NULL
				AND EXISTS (SELECT 1 FROM `chargebacks` WHERE `engagement_id` = NEW.`id`))
		)
	)
BEGIN
	SELECT RAISE(ABORT, 'an Engagement cannot change that way');
END;