CREATE TABLE `job_edits` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`photos` text NOT NULL,
	`site_type` text NOT NULL,
	`preferred_start` text,
	`state` text NOT NULL,
	`held_for` text,
	`sent_at` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "job_edits_state" CHECK(state in ('held', 'released', 'refused', 'withdrawn'))
);
--> statement-breakpoint
CREATE INDEX `job_edits_job` ON `job_edits` (`job_id`,`sent_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `job_edits_one_held` ON `job_edits` (`job_id`) WHERE state = 'held';--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`state` text NOT NULL,
	`category` text,
	`site_type` text,
	`suburb_id` text,
	`street` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`photos` text NOT NULL,
	`gas_work` integer,
	`preferred_start` text,
	`matching` text,
	`held_for` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`opened_at` integer,
	`expires_at` integer,
	FOREIGN KEY (`client_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`suburb_id`) REFERENCES `suburbs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "jobs_state" CHECK(state in ('draft', 'held', 'open', 'expired', 'closed', 'hired'))
);
--> statement-breakpoint
CREATE INDEX `jobs_client` ON `jobs` (`client_id`,`updated_at`);--> statement-breakpoint
-- A Job moves only these ways: a Draft is Held or opens; a Held one opens, or
-- is a Draft again; an Open one Expires, closes, or is Hired; an Expired one
-- opens again by Renew. Anything else aborts the batch.
CREATE TRIGGER `jobs_state_moves` BEFORE UPDATE OF `state` ON `jobs`
WHEN NOT (
	(OLD.`state` = 'draft' AND NEW.`state` IN ('held', 'open'))
	OR (OLD.`state` = 'held' AND NEW.`state` IN ('draft', 'open'))
	OR (OLD.`state` = 'open' AND NEW.`state` IN ('expired', 'closed', 'hired'))
	OR (OLD.`state` = 'expired' AND NEW.`state` = 'open')
)
BEGIN
	SELECT RAISE(ABORT, 'a Job cannot change that way');
END;
--> statement-breakpoint
-- Only a Draft is discarded; a posted Job stays.
CREATE TRIGGER `jobs_only_drafts_deleted` BEFORE DELETE ON `jobs`
WHEN OLD.`state` <> 'draft'
BEGIN
	SELECT RAISE(ABORT, 'only a Draft is discarded');
END;
--> statement-breakpoint
-- An edit is decided once: a Held one is released, refused, or withdrawn, and
-- never changes after. Anything else aborts the batch.
CREATE TRIGGER `job_edits_decided_once` BEFORE UPDATE OF `state` ON `job_edits`
WHEN OLD.`state` <> 'held'
BEGIN
	SELECT RAISE(ABORT, 'a Job edit is decided once');
END;
