ALTER TABLE `invitations` ADD `passed_at` integer;--> statement-breakpoint
DROP TRIGGER `invitations_fixed`;
--> statement-breakpoint
-- An Invitation may be passed, once; who was invited to what, and when, stays.
CREATE TRIGGER `invitations_fixed` BEFORE UPDATE ON `invitations`
WHEN OLD.`passed_at` IS NOT NULL
	OR NEW.`job_id` <> OLD.`job_id`
	OR NEW.`artisan_id` <> OLD.`artisan_id`
	OR NEW.`invited_at` <> OLD.`invited_at`
BEGIN
	SELECT RAISE(ABORT, 'an Invitation is passed once and never moved');
END;
