CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`trading_name` text,
	`rules_version` integer NOT NULL,
	`rules_accepted_at` integer NOT NULL,
	`signed_up_at` integer NOT NULL,
	FOREIGN KEY (`id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`rules_version`) REFERENCES `marketplace_rules`(`version`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "accounts_kind" CHECK("accounts"."kind" in ('client', 'artisan'))
);
--> statement-breakpoint
CREATE TABLE `auth_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `auth_credentials_user` ON `auth_credentials` (`user_id`);--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`impersonated_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_sessions_token_unique` ON `auth_sessions` (`token`);--> statement-breakpoint
CREATE INDEX `auth_sessions_user` ON `auth_sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `auth_users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer NOT NULL,
	`image` text,
	`role` text,
	`banned` integer,
	`ban_reason` text,
	`ban_expires` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_users_email_unique` ON `auth_users` (`email`);--> statement-breakpoint
CREATE TABLE `auth_verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_verifications_identifier` ON `auth_verifications` (`identifier`);--> statement-breakpoint
CREATE TABLE `marketplace_rules` (
	`version` integer PRIMARY KEY NOT NULL,
	`summary` text NOT NULL,
	`published_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notices` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`event` text NOT NULL,
	`title` text NOT NULL,
	`link` text NOT NULL,
	`told_at` integer NOT NULL,
	`emailed_at` integer,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notices_account` ON `notices` (`account_id`,`told_at`);--> statement-breakpoint
CREATE INDEX `notices_unemailed` ON `notices` (`told_at`) WHERE "notices"."emailed_at" is null;--> statement-breakpoint
CREATE TABLE `rate_limit_hits` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_limit_hits_key` ON `rate_limit_hits` (`key`,`at`);--> statement-breakpoint
-- Marketplace rules version 1, which every Account accepts at sign-up. Its
-- wording is a placeholder until the legal text is written.
INSERT INTO `marketplace_rules` (`version`, `summary`, `published_at`)
VALUES (1, 'The first Marketplace rules.', 1791072000000);
--> statement-breakpoint
-- An Account's kind is fixed at sign-up.
CREATE TRIGGER `accounts_kind_fixed` BEFORE UPDATE OF `kind` ON `accounts`
WHEN NEW.`kind` IS NOT OLD.`kind`
BEGIN
	SELECT RAISE(ABORT, 'an Account''s kind is fixed');
END;
