CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`artisan_id` text NOT NULL,
	`opened_at` integer NOT NULL,
	`client_read_at` integer,
	`artisan_read_at` integer,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`artisan_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversations_once_per_job` ON `conversations` (`job_id`,`artisan_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`sender_id` text,
	`event` text,
	`text` text NOT NULL,
	`photos` text NOT NULL,
	`state` text NOT NULL,
	`held_for` text,
	`sent_at` integer NOT NULL,
	`delivered_at` integer,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sender_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "messages_state" CHECK(state in ('held', 'delivered', 'refused', 'withdrawn', 'unsent')),
	CONSTRAINT "messages_speech_or_event" CHECK((sender_id is null) <> (event is null))
);
--> statement-breakpoint
CREATE INDEX `messages_conversation` ON `messages` (`conversation_id`,`sent_at`);--> statement-breakpoint
-- A message moves only these ways: a Held one is delivered, refused,
-- withdrawn, or unsent, once. What it says, who sent it, and where never
-- change, and one delivered is never changed again.
CREATE TRIGGER `messages_fixed` BEFORE UPDATE ON `messages`
WHEN OLD.`state` <> 'held'
	OR NEW.`state` NOT IN ('delivered', 'refused', 'withdrawn', 'unsent')
	OR NEW.`conversation_id` <> OLD.`conversation_id`
	OR NEW.`sender_id` IS NOT OLD.`sender_id`
	OR NEW.`event` IS NOT OLD.`event`
	OR NEW.`text` <> OLD.`text`
	OR NEW.`photos` <> OLD.`photos`
	OR NEW.`sent_at` <> OLD.`sent_at`
BEGIN
	SELECT RAISE(ABORT, 'a delivered message is never changed');
END;
--> statement-breakpoint
CREATE TRIGGER `messages_kept` BEFORE DELETE ON `messages`
BEGIN
	SELECT RAISE(ABORT, 'a message is never removed');
END;
--> statement-breakpoint
-- Whose Conversation it is, and on which Job, never changes, and it is never removed.
CREATE TRIGGER `conversations_fixed` BEFORE UPDATE ON `conversations`
WHEN NEW.`job_id` <> OLD.`job_id`
	OR NEW.`artisan_id` <> OLD.`artisan_id`
	OR NEW.`opened_at` <> OLD.`opened_at`
BEGIN
	SELECT RAISE(ABORT, 'a Conversation never moves');
END;
--> statement-breakpoint
CREATE TRIGGER `conversations_kept` BEFORE DELETE ON `conversations`
BEGIN
	SELECT RAISE(ABORT, 'a Conversation is never removed');
END;
