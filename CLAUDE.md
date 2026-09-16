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
- Styling in `apps/web` und `apps/dashboard`: Tailwind CSS v4 über `@tailwindcss/vite` (kein PostCSS-Config nötig), CSS-Einstiegspunkt jeweils `src/App.css`/`src/index.css` mit nur `@import 'tailwindcss';`; wiederverwendete Klassen-Strings in `apps/web/src/ui.ts`

`apps/web` hat einen ersten Ende-zu-Ende-Flow für Wanderer (Login per Handynummer/OTP, Tour starten, Standort-Ping manuell senden, Tour beenden) unter `apps/web/src/screens`, angebunden über `apps/web/src/api/client.ts`. `apps/dashboard` hat den entsprechenden Flow für die Bergwacht (Login per E-Mail/Passwort, Touren-Suche nach Status `aktiv`/`beendet` inkl. letztem bekannten Standort) unter `apps/dashboard/src/screens`, angebunden über `apps/dashboard/src/api/client.ts` – inklusive einer echten 3D-Kartenansicht (`apps/dashboard/src/components/ToursMap.tsx`) mit Markern für den letzten bekannten Standort pro Tour: MapLibre GL JS (Open Source) mit OpenFreeMap als Basiskarte (`https://tiles.openfreemap.org/styles/liberty`) und AWS-Open-Data-Terrain-Tiles (`elevation-tiles-prod`, Terrarium-Encoding) für die Höhendaten – beides kostenlos, kein API-Key. **Wichtige Vite-Falle:** `maplibre-gl` braucht `optimizeDeps: { exclude: ['maplibre-gl'] }` in `vite.config.ts`, sonst wird der Web-Worker nicht mitausgeliefert (404) und die Karte rendert nur den Hintergrund ohne Straßen/Labels/Terrain – kein Fehler in der Konsole, nur ein `net::ERR_FAILED` für `maplibre-gl-worker.mjs`. Beide Apps: im Dev-Betrieb läuft je ein Vite-Proxy (`/api` → `localhost:3000`) statt CORS im Backend. `apps/api` hat ein migriertes Datenmodell (`region`, `app_user`, `rescue_org_member`, `tour`, `location_ping`, `otp_code` – siehe ADRs 0001–0005) und erste Endpoints:

- Nutzer-Auth: `POST /auth/request-otp`, `POST /auth/verify-otp` (Handynummer + SMS-OTP-Stub, siehe ADR 0005)
- Touren: `POST /tours`, `GET /tours/active` (aktive Tour des eingeloggten Nutzers, für Restore nach Reload), `POST /tours/:id/end`, `POST /tours/:id/pings`
- Bergwacht: `POST /rescue/login` (E-Mail/Passwort), `GET /rescue/tours?status=aktiv|beendet` (Suchwerkzeug aus ADR 0003, inkl. letztem bekannten Standort pro Tour)
- Bergwacht-Accounts werden nicht über einen Endpoint angelegt, sondern über `apps/api/src/scripts/create-rescue-member.ts` (Operator-Tool, entspricht der manuellen Verifizierung aus ADR 0003)
- JWTs tragen ein `role`-Feld (`user`/`rescue`); `requireUser`/`requireRescue` in `apps/api/src/plugins/auth.ts` setzen das durch – ein Wanderer-Token funktioniert nicht auf Bergwacht-Endpoints und umgekehrt
- Bekannte Lücke: `GET /rescue/tours` filtert noch nicht nach `region` (MVP hat nur eine Region, siehe ADR 0003) – sobald eine zweite Region existiert, muss das nachgezogen werden
- Integrationstests (Vitest + Fastify `.inject()`, gegen echtes Postgres+PostGIS, keine Mocks) in `apps/api/tests` – Fixtures sind pro Test zufällig (kein DB-Truncate), lauffähig gegen die lokale Dev-DB: `pnpm --filter @alpine-security/api test`

## Offene Punkte

- SMS-Versand ist ein Log-Stub, kein echter Provider (Twilio/Vonage noch offen, siehe ADR 0005)
- `GET /rescue/tours` filtert noch nicht nach `region` (nur eine Region im MVP, siehe ADR 0003)
- Kein Rate-Limiting/Missbrauchsschutz für den OTP-Versand (siehe ADR 0005)
- `apps/web` deckt bisher nur den Wanderer-Flow ab, kein Teilen/Angehörigen-Zugriff (siehe ADR 0006)
- Keine CI-Pipeline (Tests/Lint/Typecheck laufen bisher nur lokal)
- Teilbarer Tour-Link für Angehörige (ADR 0006) ist als Feature entschieden, aber noch nicht implementiert – offene Detailfragen (Ablauf/Widerruf, Granularität) siehe ADR
- Natives Hintergrund-Tracking via Capacitor (ADR 0007) ist als Kurswechsel entschieden, aber noch nicht umgesetzt – offene Fragen (Plugin-Wahl, iOS-Permission-Flow, Retry-Strategie, Store-Distribution) siehe ADR
- Satellitenbild-Ansicht für `ToursMap` (Bergwacht-Dashboard) ist als Ausbau geplant, aber bewusst zurückgestellt: der kostenlose, keyless Anbieter (EOX Sentinel-2 Cloudless) ist nur für die 2016/2017er-Bilder kommerziell nutzbar (CC BY 4.0) – jede aktuellere Version (2018–2025) steht unter CC BY-NC-SA (nicht-kommerziell), was für ein kommerzielles Produkt riskant wäre. Stattdessen soll später ein Anbieter mit kostenlosem API-Key-Kontingent (z. B. MapTiler Satellite oder Mapbox Satellite) angebunden werden – aktuelle Bilder, klare kommerzielle Lizenz, braucht aber einen Account/Key statt der bisherigen keyless Kartenquellen (OpenFreeMap, AWS-Terrain-Tiles)

## Leitplanken

- **Kein Ersatz für den Notruf.** Das muss sich in UX-Texten, Onboarding und technischen Grenzen widerspiegeln (z. B. keine automatische Sturzerkennung/Alarmierung ohne sehr hohe Zuverlässigkeit – Fehlalarme zerstören das Vertrauen der Bergwacht).
- **Check-in-Modell als Fallback, natives Hintergrund-Tracking als primärer Weg** (ADR 0001 + [ADR 0007](docs/adr/0007-natives-hintergrund-tracking-capacitor.md)): Die PWA sendet Standorte weiterhin nur manuell/opportunistisch – das bleibt der Fallback für Nutzer ohne installierte App. Die über Capacitor gebaute native App (iOS zuerst) sendet automatisch im Hintergrund, ca. alle 2–3 Minuten während einer aktiven Tour. Kein Dauertracking in der PWA selbst – das war und bleibt technisch nicht zuverlässig umsetzbar.
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
- [0006](docs/adr/0006-teilbarer-tour-link-fuer-angehoerige.md) – Teilbarer Tour-Link für Angehörige (Linkbesitz als Autorisierung), noch nicht implementiert
- [0007](docs/adr/0007-natives-hintergrund-tracking-capacitor.md) – Natives Hintergrund-Tracking via Capacitor (iOS zuerst) statt reinem Check-in-Modell; PWA-Check-in bleibt Fallback, noch nicht implementiert

## Fortschritt

Fortlaufendes, datiertes Protokoll der umgesetzten Schritte in [CHANGELOG.md](CHANGELOG.md) – nach jedem abgeschlossenen Arbeitsschritt dort einen Eintrag ergänzen (Datum + Stichpunkte), nicht überschreiben. CLAUDE.md bleibt der kompakte Ist-Zustand, CHANGELOG.md die Historie dazu.
