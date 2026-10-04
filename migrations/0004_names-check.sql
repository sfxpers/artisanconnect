CREATE TABLE `names_sent` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`name` text NOT NULL,
	`trading_name` text,
	`state` text NOT NULL,
	`held_for` text,
	`sent_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "names_sent_state" CHECK(state in ('shown', 'held', 'released', 'refused', 'withdrawn'))
);
--> statement-breakpoint
CREATE INDEX `names_sent_account` ON `names_sent` (`account_id`,`sent_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `names_sent_one_held` ON `names_sent` (`account_id`) WHERE state = 'held';--> statement-breakpoint
ALTER TABLE `accounts` ADD `names_shown` integer DEFAULT true NOT NULL;