-- Teilbarer Tour-Link für Angehörige (ADR 0006). Ein Link pro Tour: Erzeugen
-- rotiert den Token (alter Link wird ungültig), Widerrufen setzt ihn auf NULL.
-- Gültigkeitsfenster (aktiv, oder bis 24h nach Tourende) wird zur Laufzeit anhand
-- von status/ended_at geprüft, nicht in dieser Tabelle gespeichert.
ALTER TABLE tour ADD COLUMN share_token text UNIQUE;
