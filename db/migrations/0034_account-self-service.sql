-- Account self-service (#141): an Account closes and reopens itself, and asks
-- for a copy of its data or its erasure in a Data request.
CREATE TABLE `data_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`kind` text NOT NULL,
	`requested_at` integer NOT NULL,
	`export_key` text,
	`queue_item_id` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`queue_item_id`) REFERENCES `queue_items`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "data_requests_kind" CHECK(kind in ('copy', 'erasure'))
);
--> statement-breakpoint
CREATE INDEX `data_requests_account` ON `data_requests` (`account_id`,`requested_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `data_requests_item` ON `data_requests` (`queue_item_id`);--> statement-breakpoint
ALTER TABLE `accounts` ADD `closed_at` integer;--> statement-breakpoint
ALTER TABLE `accounts` ADD `erased_at` integer;--> statement-breakpoint
-- Erasure is final: an erased Account is never reopened, nor erased again.
CREATE TRIGGER `accounts_erased_for_good` BEFORE UPDATE OF `closed_at`, `erased_at` ON `accounts`
WHEN OLD.`erased_at` IS NOT NULL
BEGIN
	SELECT RAISE(ABORT, 'an erased Account stays erased');
END;
