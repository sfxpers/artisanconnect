CREATE TABLE `due_clocks` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`subject_id` text NOT NULL,
	`due_at` integer NOT NULL,
	`fired_at` integer
);
--> statement-breakpoint
CREATE INDEX `due_clocks_unfired` ON `due_clocks` (`due_at`) WHERE "due_clocks"."fired_at" is null;--> statement-breakpoint
CREATE TABLE `ledger_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`recorded_at` integer NOT NULL,
	CONSTRAINT "ledger_entries_whole_cents" CHECK(typeof("ledger_entries"."amount_cents") = 'integer')
);
--> statement-breakpoint
CREATE INDEX `ledger_entries_event` ON `ledger_entries` (`event_id`);