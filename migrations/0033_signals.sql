-- Signals (#140, ADR 0020): devices and IPs seen at sign-in and each Payment,
-- sends the Content check refused on a Job, and the Signals detection raises.
CREATE TABLE `refused_sends` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`job_id` text NOT NULL,
	`what` text NOT NULL,
	`reason` text NOT NULL,
	`refused_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `refused_sends_job` ON `refused_sends` (`account_id`,`job_id`);--> statement-breakpoint
CREATE TABLE `sightings` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`device` text,
	`ip` text,
	`at` text NOT NULL,
	`seen_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "sightings_at" CHECK(at in ('sign-in', 'payment'))
);
--> statement-breakpoint
CREATE INDEX `sightings_account` ON `sightings` (`account_id`,`seen_at`);--> statement-breakpoint
CREATE INDEX `sightings_device` ON `sightings` (`device`);--> statement-breakpoint
CREATE INDEX `sightings_ip` ON `sightings` (`ip`);--> statement-breakpoint
CREATE TABLE `signals` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`account_id` text NOT NULL,
	`other_account_id` text,
	`job_id` text,
	`key` text NOT NULL,
	`found` text NOT NULL,
	`evidence` text NOT NULL,
	`queue_item_id` text NOT NULL,
	`raised_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`other_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`queue_item_id`) REFERENCES `queue_items`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "signals_kind" CHECK(kind in ('shared', 'cancellations', 'disputes', 'fix-requests', 'chargebacks', 'refusals', 'linked', 'sent-back'))
);
--> statement-breakpoint
CREATE INDEX `signals_key` ON `signals` (`key`,`raised_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `signals_item` ON `signals` (`queue_item_id`);