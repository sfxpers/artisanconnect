CREATE TABLE `quote_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`quote_id` text NOT NULL,
	`scope` text NOT NULL,
	`labour_cents` integer NOT NULL,
	`materials_cents` integer NOT NULL,
	`materials_by` text NOT NULL,
	`start_on` text NOT NULL,
	`duration_days` integer NOT NULL,
	`warranty` text,
	`vat_number` text,
	`state` text NOT NULL,
	`held_for` text,
	`sent_at` integer NOT NULL,
	FOREIGN KEY (`quote_id`) REFERENCES `quotes`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "quote_revisions_state" CHECK(state in ('held', 'released', 'refused', 'withdrawn'))
);
--> statement-breakpoint
CREATE INDEX `quote_revisions_quote` ON `quote_revisions` (`quote_id`,`sent_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `quote_revisions_one_held` ON `quote_revisions` (`quote_id`) WHERE state = 'held';--> statement-breakpoint
CREATE TABLE `quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`artisan_id` text NOT NULL,
	`state` text NOT NULL,
	`scope` text NOT NULL,
	`labour_cents` integer NOT NULL,
	`materials_cents` integer NOT NULL,
	`materials_by` text NOT NULL,
	`start_on` text NOT NULL,
	`duration_days` integer NOT NULL,
	`warranty` text,
	`vat_number` text,
	`held_for` text,
	`created_at` integer NOT NULL,
	`sent_at` integer,
	`expires_at` integer,
	`revised_at` integer,
	`ended_at` integer,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`artisan_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "quotes_state" CHECK(state in ('held', 'refused', 'unsent', 'sent', 'declined', 'withdrawn', 'expired', 'hired')),
	CONSTRAINT "quotes_amounts" CHECK(typeof(labour_cents) = 'integer' and typeof(materials_cents) = 'integer' and labour_cents > 0 and materials_cents >= 0)
);
--> statement-breakpoint
CREATE INDEX `quotes_job` ON `quotes` (`job_id`,`sent_at`);--> statement-breakpoint
CREATE INDEX `quotes_artisan` ON `quotes` (`artisan_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `quotes_once_per_job` ON `quotes` (`job_id`,`artisan_id`) WHERE state not in ('refused', 'unsent');--> statement-breakpoint
ALTER TABLE `accounts` ADD `vat_number` text;--> statement-breakpoint
-- A Quote moves only these ways: a Held one is Sent, refused, or unsent; a
-- Sent one is Hired, Declined, Withdrawn, or Expires. Anything else aborts
-- the batch. Whose Quote it is, and on which Job, never changes.
CREATE TRIGGER `quotes_state_moves` BEFORE UPDATE ON `quotes`
WHEN NEW.`job_id` <> OLD.`job_id`
	OR NEW.`artisan_id` <> OLD.`artisan_id`
	OR (NEW.`state` <> OLD.`state` AND NOT (
		(OLD.`state` = 'held' AND NEW.`state` IN ('sent', 'refused', 'unsent'))
		OR (OLD.`state` = 'sent' AND NEW.`state` IN ('hired', 'declined', 'withdrawn', 'expired'))
	))
BEGIN
	SELECT RAISE(ABORT, 'a Quote cannot change that way');
END;
--> statement-breakpoint
-- A revision is decided once: a Held one is released, refused, or withdrawn,
-- and never changes after. Anything else aborts the batch.
CREATE TRIGGER `quote_revisions_decided_once` BEFORE UPDATE OF `state` ON `quote_revisions`
WHEN OLD.`state` <> 'held'
BEGIN
	SELECT RAISE(ABORT, 'a Quote revision is decided once');
END;
