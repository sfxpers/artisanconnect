CREATE TABLE `verification_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`artisan_id` text NOT NULL,
	`kind` text NOT NULL,
	`category` text,
	`slot` text NOT NULL,
	`state` text NOT NULL,
	`details` text NOT NULL,
	`held_key` text,
	`expires_on` text,
	`issued_on` text,
	`files` text NOT NULL,
	`reading` text NOT NULL,
	`submitted_at` integer NOT NULL,
	`decided_by` text,
	`decided_at` integer,
	`reason` text,
	`removed_by` text,
	`removed_at` integer,
	`removed_reason` text,
	`superseded_at` integer,
	FOREIGN KEY (`artisan_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`decided_by`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`removed_by`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "verification_checks_state" CHECK(state in ('submitted', 'accepted', 'rejected', 'removed', 'superseded'))
);
--> statement-breakpoint
CREATE INDEX `verification_checks_artisan` ON `verification_checks` (`artisan_id`,`slot`,`submitted_at`);--> statement-breakpoint
CREATE INDEX `verification_checks_held_key` ON `verification_checks` (`held_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `verification_checks_one_waiting` ON `verification_checks` (`artisan_id`,`slot`) WHERE state = 'submitted';--> statement-breakpoint
-- A check moves only forward: a submitted one is accepted or rejected once,
-- and an accepted one is removed or superseded. Anything else aborts the
-- batch, so two Admins cannot both decide one check.
CREATE TRIGGER `verification_checks_state_moves_forward` BEFORE UPDATE OF `state` ON `verification_checks`
WHEN NOT (
	(OLD.`state` = 'submitted' AND NEW.`state` IN ('accepted', 'rejected'))
	OR (OLD.`state` = 'accepted' AND NEW.`state` IN ('removed', 'superseded'))
)
BEGIN
	SELECT RAISE(ABORT, 'a check cannot change that way');
END;
--> statement-breakpoint
-- One Identity Number, and one Payout account, is held by one Artisan at most:
-- whoever has it accepted, current or expired. One removed, or replaced by
-- another the Admin accepted, is no longer held.
CREATE TRIGGER `verification_checks_one_holder` BEFORE UPDATE OF `state` ON `verification_checks`
WHEN NEW.`state` = 'accepted' AND NEW.`held_key` IS NOT NULL AND EXISTS (
	SELECT 1 FROM `verification_checks` AS `other`
	WHERE `other`.`held_key` = NEW.`held_key`
		AND `other`.`artisan_id` <> NEW.`artisan_id`
		AND `other`.`state` = 'accepted'
)
BEGIN
	SELECT RAISE(ABORT, 'held by another Artisan');
END;
