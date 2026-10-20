CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`artisan_id` text NOT NULL,
	`invited_at` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`artisan_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_once_per_job` ON `invitations` (`job_id`,`artisan_id`);--> statement-breakpoint
CREATE INDEX `invitations_artisan` ON `invitations` (`artisan_id`,`invited_at`);--> statement-breakpoint
-- An Invitation is sent once and never changed: who was invited, and when, stays.
CREATE TRIGGER `invitations_fixed` BEFORE UPDATE ON `invitations`
BEGIN
	SELECT RAISE(ABORT, 'an Invitation is never changed');
END;
