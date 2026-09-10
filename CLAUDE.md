# Alpine Security

## Projekt

Sicherheits-App für Berg-/Trailtouren mit zwei Nutzergruppen: Wanderer/Trailläufer (Endnutzer-App) und Bergwacht-Mitarbeitende (Einsicht/Dashboard). Kernidee: Nutzer aktivieren beim Losgehen ihren Standort, die App liefert fortlaufend Positions-Pings (kein hochgeladener Routenplan). Die Bergwacht bekommt dadurch kein automatisches Alarmsystem, sondern ein Nachschlagewerkzeug: bei einer Vermisstenmeldung oder Sichtung über den normalen Notruf-Weg kann sie nachsehen, ob die Person eingeloggt war und wo ihr letzter bekannter Standort ist. Details siehe [docs/adr/0001-systemdesign-und-check-in-modell.md](docs/adr/0001-systemdesign-und-check-in-modell.md) (Grundidee) und ADR 0003–0005 (aktueller Stand, weicht in Details von ADR 0001 ab).

## Tech-Stack

pnpm-Workspace-Monorepo, TypeScript durchgängig.

- `apps/web` – Nutzer-PWA (React, Vite)
- `apps/dashboard` – Bergwacht-Dashboard (React, Vite, Refine)
- `apps/api` – Backend (Fastify, REST); Datenbank: PostgreSQL + PostGIS (Docker), Migrationen via Flyway (`apps/api/db/migrations`), Query-Schicht via Drizzle (`apps/api/src/db`) (siehe ADR 0002)
- `packages/shared-types` – gemeinsame TS-Typen zwischen den Apps
- Gemeinsames Setup: `tsconfig.base.json`, ESLint Flat Config (`eslint.config.js`), Prettier

`web`/`dashboard` sind reine Grundgerüste ohne Fachlogik (Hello World). `apps/api` hat ein migriertes Datenmodell (`region`, `app_user`, `rescue_org_member`, `tour`, `location_ping` – siehe ADRs 0001–0005), aber noch keine fachlichen Endpoints, nur den Health-Check.

## Leitplanken

- **Kein Ersatz für den Notruf.** Das muss sich in UX-Texten, Onboarding und technischen Grenzen widerspiegeln (z. B. keine automatische Sturzerkennung/Alarmierung ohne sehr hohe Zuverlässigkeit – Fehlalarme zerstören das Vertrauen der Bergwacht).
- **Check-in-Modell statt Dauertracking** (ADR 0001): Standort wird opportunistisch bei Netzverfügbarkeit gesendet, kein kontinuierliches Hintergrund-GPS-Tracking. Das ist eine bewusste Architekturentscheidung (PWA-Tauglichkeit, Akkulaufzeit, Datensparsamkeit) – nicht ohne neues ADR ändern.
- **Bergwacht-Zugriff ist Pull, kein Push** (ADR 0003): Das System alarmiert die Bergwacht nicht automatisch bei "überfällig". Das Dashboard ist ein Suchwerkzeug für einen externen Anlass (Vermisstenmeldung, Sichtung) – kein Benachrichtigungsdienst an die Bergwacht im MVP.
- **Datensparsamkeit/DSGVO beachten.** Standortverlauf nach Tourende zeitnah löschen; gestaffelte Löschfristen für den Ernstfall bewusst im Datenmodell abbilden, nicht als nachträglicher Fix.
- **Regionale Zugriffskontrolle technisch durchsetzen.** Bergwacht-Accounts sehen nur Touren in ihrer zuständigen Region – sonst Datenschutzproblem. MVP-Scope laut ADR 0003: eine Region (Oberallgäu), `region` bleibt aber als eigene Entität für spätere Erweiterung.

## Architekturentscheidungen

Neue, nicht-triviale Architekturentscheidungen als weiteres ADR unter `docs/adr/` dokumentieren (fortlaufend nummeriert, gleiches Format wie 0001).

- [0001](docs/adr/0001-systemdesign-und-check-in-modell.md) – Systemdesign & Check-in-Modell statt Dauertracking
- [0002](docs/adr/0002-datenbank-technologie.md) – Datenbank & Datenzugriffsschicht (Postgres+PostGIS, Flyway, Drizzle)
- [0003](docs/adr/0003-region-zugriffsmodell-verifizierung.md) – Region (MVP: Oberallgäu), Pull- statt Push-Zugriffsmodell, manuelle Account-Verifizierung
- [0004](docs/adr/0004-kein-automatischer-ueberfaellig-status.md) – Kein automatischer "überfällig"-Status; Tour endet nur durch explizite Nutzeraktion
- [0005](docs/adr/0005-auth-handynummer-sms-verifizierung.md) – Nutzer-Auth über Handynummer mit SMS-Verifizierung statt E-Mail/Passwort
