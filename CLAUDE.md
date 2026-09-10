# Alpine Security

## Projekt

Sicherheits-App für Berg-/Trailtouren mit zwei Nutzergruppen: Wanderer/Trailläufer (Endnutzer-App) und Bergwacht-Mitarbeitende (Einsicht/Dashboard). Kernidee: Nutzer hinterlegen vor Tourstart Route und geplante Rückkehrzeit; bleibt eine Rückmeldung aus, markiert das System die Tour als überfällig, damit die Bergwacht letzten bekannten Standort und geplante Route einsehen kann. Details und Begründung siehe [docs/adr/0001-systemdesign-und-check-in-modell.md](docs/adr/0001-systemdesign-und-check-in-modell.md).

## Tech-Stack

pnpm-Workspace-Monorepo, TypeScript durchgängig.

- `apps/web` – Nutzer-PWA (React, Vite)
- `apps/dashboard` – Bergwacht-Dashboard (React, Vite, Refine)
- `apps/api` – Backend (Fastify, REST); Datenbank: PostgreSQL + PostGIS (Docker), Migrationen via Flyway, Query-Schicht via Drizzle (siehe ADR 0002)
- `packages/shared-types` – gemeinsame TS-Typen zwischen den Apps
- Gemeinsames Setup: `tsconfig.base.json`, ESLint Flat Config (`eslint.config.js`), Prettier

Aktuell reine Grundgerüste ohne Fachlogik (Hello World / Health-Check).

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
