ALTER TABLE `engagements` ADD `start_claimed_at` integer;--> statement-breakpoint
ALTER TABLE `engagements` ADD `work_started_at` integer;--> statement-breakpoint
ALTER TABLE `engagements` ADD `work_started_by` text;--> statement-breakpoint
-- Whose an Engagement is, what it Hired, and its Artisan Fee never change.
-- Its state moves only Paid to Work started (#127), with when and by whom,
-- once; the Artisan's claim to have started changes only while it is Paid.
-- Later states move with the tickets that move them (#130 on).
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
		(NEW.`state` <> OLD.`state`
			OR NEW.`work_started_at` IS NOT OLD.`work_started_at`
			OR NEW.`work_started_by` IS NOT OLD.`work_started_by`)
		AND NOT (
			OLD.`state` = 'paid' AND NEW.`state` = 'work-started'
			AND NEW.`work_started_at` IS NOT NULL
			AND NEW.`work_started_by` IN ('client', 'artisan')
		)
	)
BEGIN
	SELECT RAISE(ABORT, 'an Engagement cannot change that way');
END;
