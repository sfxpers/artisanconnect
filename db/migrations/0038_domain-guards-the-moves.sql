-- void:allow-destructive
-- Each of these moves is guarded where its command writes it: the update
-- names the state it moves from, and the command checks the move first.
-- Who and what an Engagement is for stays fixed here.
DROP TRIGGER `completions_fixed`;--> statement-breakpoint
DROP TRIGGER `disputes_fixed`;--> statement-breakpoint
DROP TRIGGER `refunds_state_moves`;--> statement-breakpoint
DROP TRIGGER `payouts_state_moves`;--> statement-breakpoint
DROP TRIGGER `updated_quotes_state_moves`;--> statement-breakpoint
DROP TRIGGER `invitations_fixed`;--> statement-breakpoint
DROP TRIGGER `job_matches_fixed`;--> statement-breakpoint
DROP TRIGGER `job_edits_decided_once`;--> statement-breakpoint
DROP TRIGGER `profile_edits_decided_once`;--> statement-breakpoint
DROP TRIGGER `quote_revisions_decided_once`;--> statement-breakpoint
DROP TRIGGER `verification_checks_payouts_stopped_once`;--> statement-breakpoint
DROP TRIGGER `engagements_fixed`;--> statement-breakpoint
CREATE TRIGGER `engagements_fixed` BEFORE UPDATE ON `engagements`
WHEN NEW.`job_id` <> OLD.`job_id`
	OR NEW.`quote_id` <> OLD.`quote_id`
	OR NEW.`payment_id` <> OLD.`payment_id`
	OR NEW.`client_id` <> OLD.`client_id`
	OR NEW.`artisan_id` <> OLD.`artisan_id`
	OR NEW.`artisan_fee_percent` <> OLD.`artisan_fee_percent`
	OR NEW.`hired_at` <> OLD.`hired_at`
BEGIN
	SELECT RAISE(ABORT, 'an Engagement cannot change that way');
END;
