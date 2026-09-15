# Changelog

Fortlaufendes Protokoll der umgesetzten Schritte – chronologisch, wird nur ergänzt, nicht überschrieben. Für den aktuellen Ist-Zustand siehe [CLAUDE.md](CLAUDE.md), für Architekturentscheidungen samt Begründung siehe [docs/adr/](docs/adr/).

## 2026-09-10

- Projekt-Grundgerüst: pnpm-Workspace-Monorepo mit `apps/web` (React/Vite PWA), `apps/dashboard` (React/Vite/Refine), `apps/api` (Fastify), `packages/shared-types`; gemeinsames TypeScript-/ESLint-/Prettier-Setup
- [CLAUDE.md](CLAUDE.md) angelegt
- [ADR 0002](docs/adr/0002-datenbank-technologie.md): PostgreSQL+PostGIS (Docker), Flyway für Migrationen, Drizzle als Query-Schicht
- [ADR 0003](docs/adr/0003-region-zugriffsmodell-verifizierung.md): MVP eine Region (Oberallgäu), Bergwacht-Zugriff als Pull/Suchwerkzeug statt Push-Alarm, manuelle Account-Verifizierung
- [ADR 0004](docs/adr/0004-kein-automatischer-ueberfaellig-status.md): kein automatisch berechneter "überfällig"-Status; Tour endet nur durch explizite Nutzeraktion
- [ADR 0005](docs/adr/0005-auth-handynummer-sms-verifizierung.md): Nutzer-Auth über Handynummer + SMS-OTP statt E-Mail/Passwort
- Datenmodell umgesetzt: fünf Kernentitäten (`region`, `app_user`, `rescue_org_member`, `tour`, `location_ping`) als Flyway-Migrationen + gespiegeltes Drizzle-Schema; Docker Compose für Postgres+PostGIS
- Erste Endpoints: `POST /auth/request-otp`, `POST /auth/verify-otp`, `POST /tours`, `POST /tours/:id/end`
- Einheitliches Start-Skript `pnpm dev` (Datenbank hochfahren, migrieren, alle Apps parallel starten)

## 2026-09-11

- `POST /tours/:id/pings` – Standort-Pings speichern (PostGIS-Geography-Insert per WKT-String)
- `otp_code`-Tabelle für die OTP-Verifizierung ergänzt
- Bergwacht-Seite: `POST /rescue/login`, `GET /rescue/tours?status=aktiv|beendet` (Suchwerkzeug mit letztem bekannten Standort pro Tour)
- Operator-Script `create-rescue-member.ts` statt Registrierungs-Endpoint (ADR 0003: manuelle Verifizierung)
- Sicherheitsfix: JWTs tragen jetzt ein `role`-Feld (`user`/`rescue`), durchgesetzt über `requireUser`/`requireRescue` – verhindert, dass ein Wanderer-Token auf Bergwacht-Endpoints funktioniert und umgekehrt

## 2026-09-15

- Integrationstests eingeführt: Vitest + Fastifys `.inject()` gegen die echte Postgres+PostGIS-Instanz (keine Mocks), 26 Tests über 5 Dateien (`health`, `auth`, `tours`, `pings`, `rescue`)
- `src/index.ts` in `buildApp()` (`src/app.ts`) + schlankes Bootstrap aufgeteilt, damit Tests den Server ohne echten Netzwerk-Port ansprechen können
- Test-Fixtures sind pro Test zufällig generiert (keine DB-Truncate) – Suite kann gefahrlos gegen die lokale Dev-Datenbank laufen
- [ADR 0006](docs/adr/0006-teilbarer-tour-link-fuer-angehoerige.md): teilbarer Tour-Link für Angehörige (Linkbesitz als Autorisierung) als neues Feature entschieden – noch nicht implementiert, offene Detailfragen (Ablauf/Widerruf, Granularität) im ADR festgehalten
