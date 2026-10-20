-- Reports, Leaving, warnings, and Suspension (#136): an Account Reports a
-- Job, Quote, message, or Profile to the Admin, who may take a Job or Profile
-- out of view until it is fixed, warn the Account, or suspend it.
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`reporter_id` text NOT NULL,
	`subject_kind` text NOT NULL,
	`subject_id` text NOT NULL,
	`reported_id` text NOT NULL,
	`reason` text NOT NULL,
	`note` text,
	`note_held_for` text,
	`queue_item_id` text NOT NULL,
	`reported_at` integer NOT NULL,
	FOREIGN KEY (`reporter_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reported_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`queue_item_id`) REFERENCES `queue_items`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "reports_subject_kind" CHECK(subject_kind in ('job', 'quote', 'message', 'profile')),
	CONSTRAINT "reports_reason" CHECK(reason in ('contact-or-payment', 'leaving', 'threat-or-abuse', 'fake-or-misleading', 'other'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reports_once_per_reporter` ON `reports` (`reporter_id`,`subject_kind`,`subject_id`);--> statement-breakpoint
CREATE INDEX `reports_item` ON `reports` (`queue_item_id`,`reported_at`);--> statement-breakpoint
CREATE TABLE `suspensions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`reason` text NOT NULL,
	`leaving` integer NOT NULL,
	`suspended_by` text NOT NULL,
	`suspended_at` integer NOT NULL,
	`lifted_by` text,
	`lifted_at` integer,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`suspended_by`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lifted_by`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `suspensions_account` ON `suspensions` (`account_id`,`suspended_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `suspensions_one_standing` ON `suspensions` (`account_id`) WHERE lifted_at is null;--> statement-breakpoint
CREATE TABLE `warnings` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`reason` text NOT NULL,
	`leaving` integer NOT NULL,
	`warned_by` text NOT NULL,
	`warned_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`warned_by`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `warnings_account` ON `warnings` (`account_id`,`warned_at`);--> statement-breakpoint
ALTER TABLE `accounts` ADD `profile_out_of_view_since` integer;--> statement-breakpoint
ALTER TABLE `accounts` ADD `profile_out_of_view_for` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `out_of_view_since` integer;--> statement-breakpoint
ALTER TABLE `jobs` ADD `out_of_view_for` text;
