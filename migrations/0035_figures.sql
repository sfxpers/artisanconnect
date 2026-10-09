-- The Admin's figures (#142). A Job's posted time: when it first became Open,
-- at posting or the Admin's release, kept through Renew.
ALTER TABLE `jobs` ADD `posted_at` integer;--> statement-breakpoint
CREATE INDEX `jobs_posted` ON `jobs` (`posted_at`);--> statement-breakpoint
-- Each opening starts an Expiry clock 14 days on, so the first one says when a
-- Job was posted; one with none is dated by its last opening.
UPDATE `jobs` SET `posted_at` = coalesce(
	(SELECT min(`due_at`) FROM `due_clocks` WHERE `kind` = 'job.expires' AND `subject_id` = `jobs`.`id`) - 14 * 86400000,
	`opened_at`
)
WHERE `state` NOT IN ('draft', 'held');--> statement-breakpoint
-- A posted time never changes once set.
CREATE TRIGGER `jobs_posted_fixed` BEFORE UPDATE OF `posted_at` ON `jobs`
WHEN OLD.`posted_at` IS NOT NULL AND NEW.`posted_at` IS NOT OLD.`posted_at`
BEGIN
	SELECT RAISE(ABORT, 'a Job''s posted time never changes');
END;--> statement-breakpoint
-- A refused send outlives its discarded Draft, so the figures never drop.
-- D1 ignores PRAGMA foreign_keys=OFF; nothing references refused_sends, so
-- the table is rebuilt with its foreign keys deferred.
PRAGMA defer_foreign_keys = on;--> statement-breakpoint
CREATE TABLE `__new_refused_sends` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`job_id` text,
	`what` text NOT NULL,
	`reason` text NOT NULL,
	`refused_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_refused_sends`("id", "account_id", "job_id", "what", "reason", "refused_at") SELECT "id", "account_id", "job_id", "what", "reason", "refused_at" FROM `refused_sends`;--> statement-breakpoint
DROP TABLE `refused_sends`;--> statement-breakpoint
ALTER TABLE `__new_refused_sends` RENAME TO `refused_sends`;--> statement-breakpoint
PRAGMA defer_foreign_keys = off;--> statement-breakpoint
CREATE INDEX `refused_sends_job` ON `refused_sends` (`account_id`,`job_id`);
