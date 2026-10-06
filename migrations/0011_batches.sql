CREATE TABLE `job_matches` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`artisan_id` text NOT NULL,
	`offered_at` integer NOT NULL,
	`passed_at` integer,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`artisan_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_matches_once_per_job` ON `job_matches` (`job_id`,`artisan_id`);--> statement-breakpoint
CREATE INDEX `job_matches_artisan` ON `job_matches` (`artisan_id`,`offered_at`);--> statement-breakpoint
ALTER TABLE `jobs` ADD `next_batch_at` integer;--> statement-breakpoint
-- A pass is recorded once, and a Job Match never moves to another Job,
-- Artisan, or offer time: the offer order is read from these rows.
CREATE TRIGGER `job_matches_fixed` BEFORE UPDATE ON `job_matches`
WHEN OLD.`passed_at` IS NOT NULL
	OR NEW.`job_id` <> OLD.`job_id`
	OR NEW.`artisan_id` <> OLD.`artisan_id`
	OR NEW.`offered_at` <> OLD.`offered_at`
BEGIN
	SELECT RAISE(ABORT, 'a Job Match is passed once and never moved');
END;
