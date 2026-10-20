CREATE TABLE `artisan_regions` (
	`artisan_id` text NOT NULL,
	`region_id` text NOT NULL,
	PRIMARY KEY(`artisan_id`, `region_id`),
	FOREIGN KEY (`artisan_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`region_id`) REFERENCES `regions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `artisan_regions_region` ON `artisan_regions` (`region_id`);--> statement-breakpoint
CREATE TABLE `regions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `regions_name_unique` ON `regions` (`name`);--> statement-breakpoint
CREATE TABLE `suburbs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`search_key` text NOT NULL,
	`region_id` text NOT NULL,
	FOREIGN KEY (`region_id`) REFERENCES `regions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `suburbs_name_unique` ON `suburbs` (`name`);--> statement-breakpoint
CREATE INDEX `suburbs_region` ON `suburbs` (`region_id`,`name`);--> statement-breakpoint
CREATE INDEX `suburbs_search_key` ON `suburbs` (`search_key`);--> statement-breakpoint
ALTER TABLE `accounts` ADD `available_for_jobs` integer DEFAULT true NOT NULL;--> statement-breakpoint
-- A Region is seeded and never changes. A suburb may be added, but never
-- moved, renamed, or removed.
CREATE TRIGGER `regions_no_update` BEFORE UPDATE ON `regions`
BEGIN
	SELECT RAISE(ABORT, 'a Region never changes');
END;
--> statement-breakpoint
CREATE TRIGGER `regions_no_delete` BEFORE DELETE ON `regions`
BEGIN
	SELECT RAISE(ABORT, 'a Region never changes');
END;
--> statement-breakpoint
CREATE TRIGGER `suburbs_no_update` BEFORE UPDATE ON `suburbs`
BEGIN
	SELECT RAISE(ABORT, 'a suburb is never moved, renamed, or removed');
END;
--> statement-breakpoint
CREATE TRIGGER `suburbs_no_delete` BEFORE DELETE ON `suburbs`
BEGIN
	SELECT RAISE(ABORT, 'a suburb is never moved, renamed, or removed');
END;
