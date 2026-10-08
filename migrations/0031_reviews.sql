-- Reviews (#138, ADR 0012): one per party on a Completed Engagement.
CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`author_id` text NOT NULL,
	`reviewed_id` text NOT NULL,
	`rating` integer NOT NULL,
	`comment` text,
	`comment_held_for` text,
	`state` text NOT NULL,
	`written_at` integer NOT NULL,
	`decided_at` integer,
	`ground` text,
	`ground_note` text,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "reviews_state" CHECK(state in ('held', 'published', 'refused', 'removed')),
	CONSTRAINT "reviews_ground" CHECK(ground in ('fraud', 'abuse', 'personal-data')),
	CONSTRAINT "reviews_rating" CHECK(typeof(rating) = 'integer' and rating between 1 and 5)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reviews_once_per_party` ON `reviews` (`engagement_id`,`author_id`);--> statement-breakpoint
CREATE INDEX `reviews_of` ON `reviews` (`reviewed_id`,`state`,`written_at`);--> statement-breakpoint
-- A Review is never edited or withdrawn: what it says, whose it is, and when
-- it was written never change. Its state moves once from held, to published
-- or refused, and a published one may be removed; a refusal or removal
-- names its ground.
CREATE TRIGGER `reviews_fixed` BEFORE UPDATE ON `reviews`
WHEN NEW.`engagement_id` <> OLD.`engagement_id`
	OR NEW.`author_id` <> OLD.`author_id`
	OR NEW.`reviewed_id` <> OLD.`reviewed_id`
	OR NEW.`rating` <> OLD.`rating`
	OR NEW.`comment` IS NOT OLD.`comment`
	OR NEW.`comment_held_for` IS NOT OLD.`comment_held_for`
	OR NEW.`written_at` <> OLD.`written_at`
	OR (NEW.`state` = OLD.`state` AND (
		NEW.`decided_at` IS NOT OLD.`decided_at`
		OR NEW.`ground` IS NOT OLD.`ground`
		OR NEW.`ground_note` IS NOT OLD.`ground_note`
	))
	OR (NEW.`state` <> OLD.`state` AND NOT (
		(OLD.`state` = 'held' AND NEW.`state` IN ('published', 'refused'))
		OR (OLD.`state` = 'published' AND NEW.`state` = 'removed')
	))
	OR (NEW.`state` IN ('refused', 'removed') AND NEW.`ground` IS NULL)
	OR (NEW.`state` = 'published' AND NEW.`ground` IS NOT NULL)
BEGIN
	SELECT RAISE(ABORT, 'a Review cannot change that way');
END;
--> statement-breakpoint
-- A Review may be Reported. D1 ignores foreign_keys=OFF, so the rebuild
-- defers the checks instead (#133).
PRAGMA defer_foreign_keys = on;--> statement-breakpoint
CREATE TABLE `__new_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`reporter_id` text NOT NULL,
	`subject_kind` text NOT NULL,
	`subject_id` text NOT NULL,
	`reported_id` text NOT NULL,
	`reason` text NOT NULL,
	`note` text,
	`note_held_for` text,
	`queue_item_id` text NOT NULL,
	`reported_at` integer NOT NULL,
	FOREIGN KEY (`reporter_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reported_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`queue_item_id`) REFERENCES `queue_items`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "reports_subject_kind" CHECK(subject_kind in ('job', 'quote', 'message', 'profile', 'review')),
	CONSTRAINT "reports_reason" CHECK(reason in ('contact-or-payment', 'leaving', 'threat-or-abuse', 'fake-or-misleading', 'other'))
);
--> statement-breakpoint
INSERT INTO `__new_reports`("id", "reporter_id", "subject_kind", "subject_id", "reported_id", "reason", "note", "note_held_for", "queue_item_id", "reported_at") SELECT "id", "reporter_id", "subject_kind", "subject_id", "reported_id", "reason", "note", "note_held_for", "queue_item_id", "reported_at" FROM `reports`;--> statement-breakpoint
DROP TABLE `reports`;--> statement-breakpoint
ALTER TABLE `__new_reports` RENAME TO `reports`;--> statement-breakpoint
PRAGMA defer_foreign_keys = off;--> statement-breakpoint
CREATE UNIQUE INDEX `reports_once_per_reporter` ON `reports` (`reporter_id`,`subject_kind`,`subject_id`);--> statement-breakpoint
CREATE INDEX `reports_item` ON `reports` (`queue_item_id`,`reported_at`);