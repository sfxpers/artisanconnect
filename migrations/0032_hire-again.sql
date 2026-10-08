-- Hire Again (#139, ADR 0013): a Job opened from a Completed Engagement,
-- inviting only its Artisan.
ALTER TABLE `jobs` ADD `hire_again_of` text REFERENCES engagements(id);--> statement-breakpoint
CREATE INDEX `jobs_hire_again` ON `jobs` (`hire_again_of`);--> statement-breakpoint
-- Which Engagement a Job was opened from never changes.
CREATE TRIGGER `jobs_hire_again_fixed` BEFORE UPDATE OF `hire_again_of` ON `jobs`
WHEN NEW.`hire_again_of` IS NOT OLD.`hire_again_of`
BEGIN
	SELECT RAISE(ABORT, 'a Job''s Hire Again never changes');
END;
