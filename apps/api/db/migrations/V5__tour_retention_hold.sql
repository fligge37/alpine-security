-- Gestaffelte Löschfristen (ADR 0008): location_ping wird standardmäßig eine
-- feste Frist nach Tourende automatisch gelöscht (siehe delete-expired-pings.ts).
-- Für den echten Ernstfall kann die Bergwacht eine konkrete Tour manuell davon
-- ausnehmen ("Hold") - ohne eingebautes Ablaufdatum, bis sie aktiv wieder
-- aufgehoben wird. retention_hold_by dokumentiert, wer den Hold gesetzt hat.
ALTER TABLE tour ADD COLUMN retention_hold_at timestamptz;
ALTER TABLE tour ADD COLUMN retention_hold_by uuid REFERENCES rescue_org_member (id);
