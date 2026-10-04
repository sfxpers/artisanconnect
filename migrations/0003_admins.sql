CREATE TABLE `admins` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`invited_by` text,
	`invited_at` integer NOT NULL,
	`removed_by` text,
	`removed_at` integer,
	FOREIGN KEY (`invited_by`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`removed_by`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `admins_current` ON `admins` (`id`) WHERE "admins"."removed_at" is null;--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`admin_id` text NOT NULL,
	`action` text NOT NULL,
	`summary` text NOT NULL,
	`subject_id` text,
	`at` integer NOT NULL,
	FOREIGN KEY (`admin_id`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_log_at` ON `audit_log` (`at`);--> statement-breakpoint
CREATE TABLE `queue_items` (
	`id` text PRIMARY KEY NOT NULL,
	`queue` text NOT NULL,
	`kind` text NOT NULL,
	`subject_id` text NOT NULL,
	`title` text NOT NULL,
	`raised_at` integer NOT NULL,
	`decision` text,
	`reason` text,
	`decided_by` text,
	`decided_at` integer,
	FOREIGN KEY (`decided_by`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "queue_items_queue" CHECK(queue in ('verification', 'pre-checks', 'signals', 'reports', 'disputes', 'chargebacks', 'support', 'data-requests'))
);
--> statement-breakpoint
CREATE INDEX `queue_items_open` ON `queue_items` (`raised_at`) WHERE "queue_items"."decided_at" is null;--> statement-breakpoint
-- Notices may go to an address no Account holds (an invited Admin). Nothing
-- references notices, so the rebuild needs no foreign-key pragma.
CREATE TABLE `__new_notices` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text,
	`address` text,
	`event` text NOT NULL,
	`title` text NOT NULL,
	`link` text NOT NULL,
	`told_at` integer NOT NULL,
	`emailed_at` integer,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "notices_one_recipient" CHECK((account_id is null) <> (address is null))
);
--> statement-breakpoint
INSERT INTO `__new_notices`("id", "account_id", "address", "event", "title", "link", "told_at", "emailed_at") SELECT "id", "account_id", NULL, "event", "title", "link", "told_at", "emailed_at" FROM `notices`;--> statement-breakpoint
DROP TABLE `notices`;--> statement-breakpoint
ALTER TABLE `__new_notices` RENAME TO `notices`;--> statement-breakpoint
CREATE INDEX `notices_account` ON `notices` (`account_id`,`told_at`);--> statement-breakpoint
CREATE INDEX `notices_unemailed` ON `notices` (`told_at`) WHERE "notices"."emailed_at" is null;--> statement-breakpoint
-- The audit log is append-only: a row is never changed or removed.
CREATE TRIGGER `audit_log_no_update` BEFORE UPDATE ON `audit_log`
BEGIN
	SELECT RAISE(ABORT, 'the audit log is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `audit_log_no_delete` BEFORE DELETE ON `audit_log`
BEGIN
	SELECT RAISE(ABORT, 'the audit log is append-only');
END;
--> statement-breakpoint
-- An Admin may remove another, but never the last; a removed Admin stays
-- removed. Checked in the batch that removes, so two Admins removing each
-- other at once cannot both succeed.
CREATE TRIGGER `admins_keep_the_last` BEFORE UPDATE OF `removed_at` ON `admins`
WHEN OLD.`removed_at` IS NOT NULL
	OR (SELECT count(*) FROM `admins` WHERE `removed_at` IS NULL) <= 1
BEGIN
	SELECT RAISE(ABORT, 'the last Admin cannot be removed');
END;
--> statement-breakpoint
-- A recorded decision cannot be reopened. Marking a decided item decided
-- again aborts the batch that tries it, so two Admins cannot both decide one.
CREATE TRIGGER `queue_items_decided_once` BEFORE UPDATE OF `decided_at` ON `queue_items`
WHEN OLD.`decided_at` IS NOT NULL
BEGIN
	SELECT RAISE(ABORT, 'a recorded decision cannot be reopened');
END;
--> statement-breakpoint
CREATE TRIGGER `queue_items_decision_fixed` BEFORE UPDATE OF `decision`, `reason`, `decided_by` ON `queue_items`
WHEN OLD.`decided_at` IS NOT NULL
BEGIN
	SELECT RAISE(ABORT, 'a recorded decision cannot be reopened');
END;
