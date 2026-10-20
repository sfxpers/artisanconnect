CREATE TABLE `support_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text,
	`topic` text,
	`tag` text,
	`message` text NOT NULL,
	`sent_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "support_requests_topic_or_tag" CHECK((topic is null) <> (tag is null)),
	CONSTRAINT "support_requests_topic" CHECK(topic in ('account', 'payment', 'verification', 'suspension', 'other'))
);
--> statement-breakpoint
CREATE INDEX `support_requests_account` ON `support_requests` (`account_id`,`sent_at`);--> statement-breakpoint
ALTER TABLE `notices` ADD `body` text;