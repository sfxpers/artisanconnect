ALTER TABLE `messages` ADD `files` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
-- What a message holds never changes, its voice notes and PDFs (#131) too.
DROP TRIGGER `messages_fixed`;
--> statement-breakpoint
CREATE TRIGGER `messages_fixed` BEFORE UPDATE ON `messages`
WHEN OLD.`state` <> 'held'
	OR NEW.`state` NOT IN ('delivered', 'refused', 'withdrawn', 'unsent')
	OR NEW.`conversation_id` <> OLD.`conversation_id`
	OR NEW.`sender_id` IS NOT OLD.`sender_id`
	OR NEW.`event` IS NOT OLD.`event`
	OR NEW.`text` <> OLD.`text`
	OR NEW.`photos` <> OLD.`photos`
	OR NEW.`files` <> OLD.`files`
	OR NEW.`sent_at` <> OLD.`sent_at`
BEGIN
	SELECT RAISE(ABORT, 'a delivered message is never changed');
END;
