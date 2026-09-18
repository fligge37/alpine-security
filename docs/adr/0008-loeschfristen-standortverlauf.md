# ADR 0008: Löschfristen für den Standortverlauf

## Kontext

ADR 0001 benennt den Zielkonflikt explizit, ohne ihn zu lösen: Standortverlauf sollte nach Tourende aus Datensparsamkeit (DSGVO) zeitnah gelöscht werden, aber die Bergwacht braucht ihn im Ernstfall unter Umständen länger – etwa weil eine Vermisstenmeldung erst Tage nach der geplanten Rückkehr eingeht. CLAUDE.md hält als Leitplanke fest, dass gestaffelte Löschfristen bewusst im Datenmodell abgebildet werden sollen, nicht als nachträglicher Fix. Bisher gab es dafür keinerlei Code – `location_ping`-Daten blieben unbegrenzt erhalten.

Zwei Randbedingungen aus bestehenden Entscheidungen schränken die Lösung ein:

- Der Teilen-Link für Angehörige (ADR 0006) ist während der aktiven Tour plus 24 Stunden nach Tourende gültig und zeigt den kompletten Tourverlauf. Die Basis-Löschfrist muss also mindestens dieses Fenster abdecken, sonst zeigt ein noch gültiger Link eine unvollständige Historie.
- Das Bergwacht-Zugriffsmodell ist Pull, nicht Push (ADR 0003): Es gibt keinen automatischen "überfällig"-Status (ADR 0004) und keine Systemkomponente, die von sich aus weiß, dass gerade ein Ernstfall vorliegt. Eine Verlängerung der Löschfrist kann deshalb nicht automatisch ausgelöst werden, sondern nur durch eine explizite Aktion der Bergwacht, wenn sie im Rahmen einer echten Vermisstenmeldung/Sichtung eine Tour bereits gefunden hat.

## Entscheidung

**Basis-Löschfrist:** `location_ping`-Zeilen werden 7 Tage nach `tour.ended_at` automatisch gelöscht. Der Tour-Datensatz selbst (Start-/Endzeit, Status) bleibt erhalten – nur die präzisen GPS-Punkte sind die eigentlich sensiblen Daten; die Metadaten sind für Statistik/Debugging und eine mögliche spätere Nutzerhistorie ("meine Touren") weiterhin nützlich, ohne ein Datenschutzrisiko darzustellen.

**Gestaffelte Verlängerung für den Ernstfall ("Hold"):** Die Bergwacht kann eine konkrete, bereits gefundene Tour manuell von der automatischen Löschung ausnehmen (`POST /rescue/tours/:id/hold`). Das setzt kein neues Ablaufdatum, sondern hält die Tour bis auf Widerruf zurück (`DELETE /rescue/tours/:id/hold`) – die tatsächliche Dauer eines Ernstfalls (Suche, Ermittlung) ist im Voraus nicht seriös schätzbar, ein fester Zeitraum hätte entweder unnötig lang oder riskant kurz sein können. `retention_hold_by` dokumentiert, welches Bergwacht-Mitglied den Hold gesetzt hat, für Nachvollziehbarkeit.

**Ausführung:** Die Löschung läuft nicht im API-Prozess mit, sondern als eigenständiges Operator-Script (`apps/api/src/scripts/delete-expired-pings.ts`, analog zu `create-rescue-member.ts`), das per externem Cron periodisch aufgerufen werden muss. Es gibt noch keine CI-/Infra-Automatisierung im Projekt (offener Punkt in CLAUDE.md); ein In-Process-Timer im Fastify-Server hätte das Risiko doppelter Ausführung bei mehreren Server-Instanzen, ein Postgres-`pg_cron`-Job hätte einen neuen Infrastruktur-Baustein erfordert. Ein separates Script bleibt einfach, testbar und unabhängig davon, wie später tatsächlich orchestriert wird.

## Verhältnis zu bestehenden Leitplanken

- **Datensparsamkeit/DSGVO:** Die 7-Tage-Frist ist eine bewusste Abwägung zwischen "zeitnah" (CLAUDE.md) und einem Puffer für real verzögerte Vermisstenmeldungen, die selten am selben Tag eingehen. Der Hold-Mechanismus verhindert, dass dafür pauschal die Frist für *alle* Touren verlängert werden muss.
- **Bergwacht-Zugriff ist Pull, kein Push (ADR 0003):** Der Hold ist folgerichtig ebenfalls ein Pull-Vorgang – er setzt voraus, dass die Bergwacht die Tour bereits über die bestehende Suche gefunden hat, und automatisiert nichts darüber hinaus.
- **Teilbarer Tour-Link (ADR 0006):** Die 7-Tage-Basisfrist liegt über der Link-Gültigkeit (aktiv + 24h), damit ein noch gültiger Link nie eine bereits teilweise gelöschte Historie zeigt.

## Umsetzung

Implementiert: `tour.retention_hold_at` / `tour.retention_hold_by` (Flyway `V5__tour_retention_hold.sql`, Drizzle-Schema), Endpoints `POST /rescue/tours/:id/hold` und `DELETE /rescue/tours/:id/hold` (nur Bergwacht-Rolle, keine Ownership-Prüfung nötig – Bergwacht darf jede Tour halten, analog zur bestehenden Suche) in `apps/api/src/routes/rescue.ts`. Löschlogik in `apps/api/src/scripts/delete-expired-pings.ts` (exportierte, direkt testbare Funktion `deleteExpiredPings`, zusätzlich per CLI ausführbar). `apps/dashboard`: Anzeige des Hold-Status und Button zum Setzen/Aufheben pro Tour in `ToursScreen`. Noch nicht umgesetzt: die tatsächliche Cron-Einplanung des Scripts in einer produktiven Umgebung (hängt an der noch fehlenden CI-/Infra-Automatisierung, siehe CLAUDE.md "Offene Punkte").
