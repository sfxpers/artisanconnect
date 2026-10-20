-- void:allow-destructive
-- An Identity Number stays held by the Artisan that first had it accepted,
-- even once its check is replaced or removed, so that replacing the document
-- does not free it for a second Artisan Account (ADR 0021). A Payout account
-- is still held only while accepted.
DROP TRIGGER `verification_checks_one_holder`;--> statement-breakpoint
CREATE TRIGGER `verification_checks_one_holder` BEFORE UPDATE OF `state` ON `verification_checks`
WHEN NEW.`state` = 'accepted' AND NEW.`held_key` IS NOT NULL AND EXISTS (
	SELECT 1 FROM `verification_checks` AS `other`
	WHERE `other`.`held_key` = NEW.`held_key`
		AND `other`.`artisan_id` <> NEW.`artisan_id`
		AND (
			`other`.`state` = 'accepted'
			OR (`other`.`kind` = 'identity' AND `other`.`state` IN ('superseded', 'removed'))
		)
)
BEGIN
	SELECT RAISE(ABORT, 'held by another Artisan');
END;
