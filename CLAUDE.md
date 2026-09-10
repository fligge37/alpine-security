# Alpine Security

## Projekt

Sicherheits-App für Berg-/Trailtouren mit zwei Nutzergruppen: Wanderer/Trailläufer (Endnutzer-App) und Bergwacht-Mitarbeitende (Einsicht/Dashboard). Kernidee: Nutzer hinterlegen vor Tourstart Route und geplante Rückkehrzeit; bleibt eine Rückmeldung aus, markiert das System die Tour als überfällig, damit die Bergwacht letzten bekannten Standort und geplante Route einsehen kann. Details und Begründung siehe [docs/adr/0001-systemdesign-und-check-in-modell.md](docs/adr/0001-systemdesign-und-check-in-modell.md).

## Tech-Stack

pnpm-Workspace-Monorepo, TypeScript durchgängig.

- `apps/web` – Nutzer-PWA (React, Vite)
- `apps/dashboard` – Bergwacht-Dashboard (React, Vite, Refine)
- `apps/api` – Backend (Fastify); geplant: PostgreSQL + PostGIS für räumlich-zeitliche Abfragen, Push/SMS-Benachrichtigung
- `packages/shared-types` – gemeinsame TS-Typen zwischen den Apps
- Gemeinsames Setup: `tsconfig.base.json`, ESLint Flat Config (`eslint.config.js`), Prettier

Aktuell reine Grundgerüste ohne Fachlogik (Hello World / Health-Check).

## Leitplanken

- **Kein Ersatz für den Notruf.** Das muss sich in UX-Texten, Onboarding und technischen Grenzen widerspiegeln (z. B. keine automatische Sturzerkennung/Alarmierung ohne sehr hohe Zuverlässigkeit – Fehlalarme zerstören das Vertrauen der Bergwacht).
- **Check-in-Modell statt Dauertracking** (ADR 0001): Standort wird opportunistisch bei Netzverfügbarkeit gesendet, kein kontinuierliches Hintergrund-GPS-Tracking. Das ist eine bewusste Architekturentscheidung (PWA-Tauglichkeit, Akkulaufzeit, Datensparsamkeit) – nicht ohne neues ADR ändern.
- **Datensparsamkeit/DSGVO beachten.** Standortverlauf nach Tourende zeitnah löschen; gestaffelte Löschfristen für den Ernstfall bewusst im Datenmodell abbilden, nicht als nachträglicher Fix.
- **Regionale Zugriffskontrolle technisch durchsetzen.** Bergwacht-Accounts sehen nur Touren in ihrer zuständigen Region – sonst Datenschutzproblem.

## Architekturentscheidungen

Neue, nicht-triviale Architekturentscheidungen als weiteres ADR unter `docs/adr/` dokumentieren (fortlaufend nummeriert, gleiches Format wie 0001).
