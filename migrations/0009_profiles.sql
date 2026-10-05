CREATE TABLE `profile_edits` (
	`id` text PRIMARY KEY NOT NULL,
	`artisan_id` text NOT NULL,
	`about` text NOT NULL,
	`photos` text NOT NULL,
	`state` text NOT NULL,
	`held_for` text,
	`sent_at` integer NOT NULL,
	`released_at` integer,
	FOREIGN KEY (`artisan_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "profile_edits_state" CHECK(state in ('held', 'released', 'refused', 'withdrawn'))
);
--> statement-breakpoint
CREATE INDEX `profile_edits_artisan` ON `profile_edits` (`artisan_id`,`sent_at`);--> statement-breakpoint
CREATE INDEX `profile_edits_released` ON `profile_edits` (`artisan_id`,`released_at`) WHERE state = 'released';--> statement-breakpoint
CREATE UNIQUE INDEX `profile_edits_one_held` ON `profile_edits` (`artisan_id`) WHERE state = 'held';--> statement-breakpoint
-- An edit is decided once: a Held one is released, refused, or withdrawn, and
-- never changes after. Anything else aborts the batch.
CREATE TRIGGER `profile_edits_decided_once` BEFORE UPDATE OF `state` ON `profile_edits`
WHEN OLD.`state` <> 'held'
BEGIN
	SELECT RAISE(ABORT, 'a Profile edit is decided once');
END;
