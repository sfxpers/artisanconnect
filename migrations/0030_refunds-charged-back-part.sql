-- A Refund the bank's Chargeback sent back only part of is charged back for
-- that part, and the rest is a waiting Refund of its own; a failed one, owed
-- and paid by hand, may be charged back too (#137).
ALTER TABLE `refunds` ADD `charged_back_cents` integer;--> statement-breakpoint
-- As before (0029), and a failed Refund may be charged back; what of it was
-- is set only then, once, and is more than nothing and at most all of it.
DROP TRIGGER IF EXISTS `refunds_state_moves`;--> statement-breakpoint
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
	OR (NEW.`charged_back_cents` IS NOT OLD.`charged_back_cents` AND NOT (
		OLD.`state` <> 'charged-back' AND NEW.`state` = 'charged-back'
		AND typeof(NEW.`charged_back_cents`) = 'integer'
		AND NEW.`charged_back_cents` > 0
		AND NEW.`charged_back_cents` <= NEW.`amount_cents`
	))
	OR (NEW.`state` = 'charged-back' AND NEW.`charged_back_cents` IS NULL)
	OR (NEW.`state` <> OLD.`state` AND NOT (
		(OLD.`state` = 'waiting' AND NEW.`state` IN ('sent', 'paused', 'paid', 'failed', 'charged-back'))
		OR (OLD.`state` = 'sent' AND NEW.`state` IN ('paused', 'paid', 'failed'))
		OR (OLD.`state` = 'paused' AND NEW.`state` IN ('paid', 'failed'))
		OR (OLD.`state` = 'failed' AND NEW.`state` IN ('paid-by-hand', 'charged-back'))
	))
BEGIN
	SELECT RAISE(ABORT, 'a Refund cannot change that way');
END;
