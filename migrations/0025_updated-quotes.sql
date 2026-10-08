-- Updated Quote (#134): the Artisan proposes new Labour and Materials before
-- Completion, neither lower, and the Client accepts by paying the difference
-- plus its Protection Fee, as a Payment of its own.
CREATE TABLE `updated_quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`from_labour_cents` integer NOT NULL,
	`from_materials_cents` integer NOT NULL,
	`labour_cents` integer NOT NULL,
	`materials_cents` integer NOT NULL,
	`state` text NOT NULL,
	`proposed_at` integer NOT NULL,
	`answered_at` integer,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "updated_quotes_state" CHECK(state in ('proposed', 'withdrawn', 'rejected', 'accepted', 'ended')),
	CONSTRAINT "updated_quotes_amounts" CHECK(typeof(labour_cents) = 'integer' and typeof(materials_cents) = 'integer' and labour_cents >= from_labour_cents and materials_cents >= from_materials_cents and labour_cents + materials_cents > from_labour_cents + from_materials_cents)
);
--> statement-breakpoint
CREATE INDEX `updated_quotes_engagement` ON `updated_quotes` (`engagement_id`,`proposed_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `updated_quotes_one_proposed` ON `updated_quotes` (`engagement_id`) WHERE state = 'proposed';--> statement-breakpoint
ALTER TABLE `payments` ADD `updated_quote_id` text REFERENCES updated_quotes(id);--> statement-breakpoint
CREATE INDEX `payments_updated_quote` ON `payments` (`updated_quote_id`);;--> statement-breakpoint
-- What an Updated Quote proposes never changes. A proposed one is withdrawn,
-- rejected, accepted, or ended by a Cancellation, once, with when; nothing
-- else moves. Anything else aborts the batch.
CREATE TRIGGER `updated_quotes_state_moves` BEFORE UPDATE ON `updated_quotes`
WHEN NEW.`engagement_id` <> OLD.`engagement_id`
	OR NEW.`from_labour_cents` <> OLD.`from_labour_cents`
	OR NEW.`from_materials_cents` <> OLD.`from_materials_cents`
	OR NEW.`labour_cents` <> OLD.`labour_cents`
	OR NEW.`materials_cents` <> OLD.`materials_cents`
	OR NEW.`proposed_at` <> OLD.`proposed_at`
	OR NOT (
		OLD.`state` = 'proposed'
		AND NEW.`state` IN ('withdrawn', 'rejected', 'accepted', 'ended')
		AND NEW.`answered_at` IS NOT NULL
	)
BEGIN
	SELECT RAISE(ABORT, 'an Updated Quote cannot change that way');
END;
--> statement-breakpoint
-- As before, and the Updated Quote a Payment pays for never changes either.
DROP TRIGGER `payments_state_moves`;
--> statement-breakpoint
CREATE TRIGGER `payments_state_moves` BEFORE UPDATE ON `payments`
WHEN NEW.`quote_id` <> OLD.`quote_id`
	OR NEW.`updated_quote_id` IS NOT OLD.`updated_quote_id`
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
-- A Release of Materials leaves none of them unreleased: Work started releases
-- them all, and an Updated Quote's extra Materials after it are released as
-- they are paid in. So a Work started whose read of the Materials an Updated
-- Quote's Payment changed before its batch aborts, and is worked out again.
CREATE TRIGGER `ledger_entries_materials_all_released` AFTER INSERT ON `ledger_entries`
WHEN NEW.`kind` = 'release.materials'
	AND (
		SELECT coalesce(sum(CASE WHEN `kind` = 'payment.materials' THEN `amount_cents` ELSE -`amount_cents` END), 0)
		FROM `ledger_entries`
		WHERE `engagement_id` = NEW.`engagement_id`
			AND `kind` IN ('payment.materials', 'release.materials', 'refund.materials')
	) > 0
BEGIN
	SELECT RAISE(ABORT, 'Materials left unreleased');
END;
--> statement-breakpoint
-- An Engagement's money may come in by more than one Payment, and a Refund
-- takes it back from each by its own collection, which gives back at most
-- what it took: no Refund takes more of a line from one Payment than that
-- Payment paid in of it, less what was refunded of it. Two Refunds at once
-- cannot both take the same Payment's money: the second one's batch aborts.
CREATE TRIGGER `ledger_entries_within_payment` AFTER INSERT ON `ledger_entries`
WHEN NEW.`kind` IN ('refund.labour', 'refund.materials')
	AND (
		SELECT coalesce(sum(CASE WHEN `kind` LIKE 'payment.%' THEN `amount_cents` ELSE -`amount_cents` END), 0)
		FROM `ledger_entries`
		WHERE `payment_id` = NEW.`payment_id`
			AND `engagement_id` = NEW.`engagement_id`
			AND `kind` IN (
				'payment.' || substr(NEW.`kind`, instr(NEW.`kind`, '.') + 1),
				'refund.' || substr(NEW.`kind`, instr(NEW.`kind`, '.') + 1)
			)
	) < 0
BEGIN
	SELECT RAISE(ABORT, 'more than is unreleased');
END;
