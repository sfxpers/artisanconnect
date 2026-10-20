-- The money ledger is append-only: a row is never changed or removed.
CREATE TRIGGER `ledger_entries_no_update` BEFORE UPDATE ON `ledger_entries`
BEGIN
	SELECT RAISE(ABORT, 'ledger entries are append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `ledger_entries_no_delete` BEFORE DELETE ON `ledger_entries`
BEGIN
	SELECT RAISE(ABORT, 'ledger entries are append-only');
END;
--> statement-breakpoint
-- A clock fires once. Marking a fired clock fired again aborts the batch that
-- tries it, so two overlapping runs cannot both fire one clock.
CREATE TRIGGER `due_clocks_fire_once` BEFORE UPDATE OF `fired_at` ON `due_clocks`
WHEN OLD.`fired_at` IS NOT NULL
BEGIN
	SELECT RAISE(ABORT, 'clock already fired');
END;
