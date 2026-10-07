CREATE TABLE `completions` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`note` text NOT NULL,
	`photos` text NOT NULL,
	`documents` text NOT NULL,
	`state` text NOT NULL,
	`held_for` text,
	`certificate_facts` text NOT NULL,
	`sent_at` integer NOT NULL,
	`made_at` integer,
	`answer` text,
	`answered_at` integer,
	`fix_note` text,
	`fix_note_state` text,
	`fix_note_held_for` text,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "completions_state" CHECK(state in ('held', 'made', 'refused', 'withdrawn', 'unsent')),
	CONSTRAINT "completions_answer" CHECK(answer in ('approved', 'approved-by-silence', 'fix-requested')),
	CONSTRAINT "completions_fix_note_state" CHECK(fix_note_state in ('shown', 'held', 'refused'))
);
--> statement-breakpoint
CREATE INDEX `completions_engagement` ON `completions` (`engagement_id`,`sent_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `completions_one_held` ON `completions` (`engagement_id`) WHERE state = 'held';--> statement-breakpoint
CREATE UNIQUE INDEX `completions_one_unanswered` ON `completions` (`engagement_id`) WHERE state = 'made' and answer is null;--> statement-breakpoint
ALTER TABLE `engagements` ADD `completed_at` integer;--> statement-breakpoint
-- Whose an Engagement is, what it Hired, and its Artisan Fee never change.
-- Its state moves Paid to Work started (#127), with when and by whom, once;
-- then, with Completion (#130), Work started or Fix requested to Awaiting
-- approval, and Awaiting approval to Fix requested or to Completed, with
-- when, once. The Artisan's claim to have started changes only while it is
-- Paid. Later states move with the tickets that move them (#132 on).
DROP TRIGGER `engagements_fixed`;
--> statement-breakpoint
CREATE TRIGGER `engagements_fixed` BEFORE UPDATE ON `engagements`
WHEN NEW.`job_id` <> OLD.`job_id`
	OR NEW.`quote_id` <> OLD.`quote_id`
	OR NEW.`payment_id` <> OLD.`payment_id`
	OR NEW.`client_id` <> OLD.`client_id`
	OR NEW.`artisan_id` <> OLD.`artisan_id`
	OR NEW.`artisan_fee_percent` <> OLD.`artisan_fee_percent`
	OR NEW.`hired_at` <> OLD.`hired_at`
	OR (NEW.`start_claimed_at` IS NOT OLD.`start_claimed_at` AND OLD.`state` <> 'paid')
	OR (
		(NEW.`work_started_at` IS NOT OLD.`work_started_at`
			OR NEW.`work_started_by` IS NOT OLD.`work_started_by`)
		AND NOT (OLD.`state` = 'paid' AND NEW.`state` = 'work-started')
	)
	OR (
		NEW.`completed_at` IS NOT OLD.`completed_at`
		AND NOT (OLD.`state` = 'awaiting-approval' AND NEW.`state` = 'completed')
	)
	OR (
		NEW.`state` <> OLD.`state`
		AND NOT (
			(OLD.`state` = 'paid' AND NEW.`state` = 'work-started'
				AND NEW.`work_started_at` IS NOT NULL
				AND NEW.`work_started_by` IN ('client', 'artisan'))
			OR (OLD.`state` IN ('work-started', 'fix-requested') AND NEW.`state` = 'awaiting-approval')
			OR (OLD.`state` = 'awaiting-approval' AND NEW.`state` = 'fix-requested')
			OR (OLD.`state` = 'awaiting-approval' AND NEW.`state` = 'completed'
				AND NEW.`completed_at` IS NOT NULL)
		)
	)
BEGIN
	SELECT RAISE(ABORT, 'an Engagement cannot change that way');
END;
--> statement-breakpoint
-- What a Completion says and holds never changes. A Held one is made,
-- refused, withdrawn, or unsent, once; a made one is answered once, and a
-- Fix request's note is written with its answer and, if Held, then shown or
-- refused, once.
CREATE TRIGGER `completions_fixed` BEFORE UPDATE ON `completions`
WHEN NEW.`engagement_id` <> OLD.`engagement_id`
	OR NEW.`note` <> OLD.`note`
	OR NEW.`photos` <> OLD.`photos`
	OR NEW.`documents` <> OLD.`documents`
	OR NEW.`held_for` IS NOT OLD.`held_for`
	OR NEW.`certificate_facts` <> OLD.`certificate_facts`
	OR NEW.`sent_at` <> OLD.`sent_at`
	OR (
		NEW.`state` <> OLD.`state`
		AND NOT (OLD.`state` = 'held' AND NEW.`state` IN ('made', 'refused', 'withdrawn', 'unsent'))
	)
	OR (
		NEW.`made_at` IS NOT OLD.`made_at`
		AND NOT (OLD.`made_at` IS NULL AND NEW.`state` = 'made' AND NEW.`made_at` IS NOT NULL)
	)
	OR (
		(NEW.`answer` IS NOT OLD.`answer` OR NEW.`answered_at` IS NOT OLD.`answered_at`)
		AND NOT (OLD.`answer` IS NULL AND OLD.`state` = 'made'
			AND NEW.`answer` IS NOT NULL AND NEW.`answered_at` IS NOT NULL)
	)
	OR (
		(NEW.`fix_note` IS NOT OLD.`fix_note` OR NEW.`fix_note_held_for` IS NOT OLD.`fix_note_held_for`)
		AND NOT (OLD.`answer` IS NULL AND NEW.`answer` = 'fix-requested')
	)
	OR (
		NEW.`fix_note_state` IS NOT OLD.`fix_note_state`
		AND NOT (
			(OLD.`answer` IS NULL AND NEW.`answer` = 'fix-requested'
				AND NEW.`fix_note_state` IN ('shown', 'held'))
			OR (OLD.`fix_note_state` = 'held' AND NEW.`fix_note_state` IN ('shown', 'refused'))
		)
	)
BEGIN
	SELECT RAISE(ABORT, 'a Completion cannot change that way');
END;
