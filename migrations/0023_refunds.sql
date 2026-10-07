CREATE TABLE `refunds` (
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
	CONSTRAINT "refunds_cause" CHECK(cause in ('artisan', 'not-hired')),
	CONSTRAINT "refunds_amounts" CHECK(typeof(amount_cents) = 'integer' and amount_cents > 0 and labour_cents >= 0 and materials_cents >= 0 and protection_fee_cents >= 0 and amount_cents = labour_cents + materials_cents + protection_fee_cents)
);
--> statement-breakpoint
CREATE INDEX `refunds_payment` ON `refunds` (`payment_id`,`made_at`);--> statement-breakpoint
CREATE INDEX `refunds_engagement` ON `refunds` (`engagement_id`,`made_at`);--> statement-breakpoint
CREATE INDEX `refunds_waiting` ON `refunds` (`payment_id`) WHERE state = 'waiting';--> statement-breakpoint
ALTER TABLE `support_requests` ADD `refund_id` text REFERENCES refunds(id);--> statement-breakpoint
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
-- No Release or Refund takes more of a part (Labour, Materials) of an
-- Engagement than is unreleased, so a Refund and a Release at once cannot
-- both take the same money: the second one's batch aborts.
CREATE TRIGGER `ledger_entries_within_unreleased` AFTER INSERT ON `ledger_entries`
WHEN NEW.`kind` IN ('release.labour', 'release.materials', 'refund.labour', 'refund.materials')
	AND (
		SELECT coalesce(sum(CASE WHEN `kind` LIKE 'payment.%' THEN `amount_cents` ELSE -`amount_cents` END), 0)
		FROM `ledger_entries`
		WHERE `engagement_id` = NEW.`engagement_id`
			AND `kind` IN (
				'payment.' || substr(NEW.`kind`, instr(NEW.`kind`, '.') + 1),
				'release.' || substr(NEW.`kind`, instr(NEW.`kind`, '.') + 1),
				'refund.' || substr(NEW.`kind`, instr(NEW.`kind`, '.') + 1)
			)
	) < 0
BEGIN
	SELECT RAISE(ABORT, 'more than is unreleased');
END;
--> statement-breakpoint
-- The Refunds of Payments that Hired nobody, asked of the adapter before
-- Refunds had rows of their own (#126).
INSERT INTO `refunds` (`id`, `payment_id`, `engagement_id`, `client_id`, `cause`, `labour_cents`, `materials_cents`, `protection_fee_cents`, `amount_cents`, `state`, `made_at`, `sent_at`)
SELECT `refund_id`, `id`, NULL, `client_id`, 'not-hired', `labour_cents`, `materials_cents`, `protection_fee_cents`, `amount_cents`, 'sent', `settled_at`, `settled_at`
FROM `payments`
WHERE `state` = 'not-hired' AND `refund_id` IS NOT NULL;
