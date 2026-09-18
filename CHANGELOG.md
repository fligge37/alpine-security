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
- `apps/web` bekommt erste Fachlogik: kompletter Ende-zu-Ende-Flow für Wanderer (Handynummer-Login mit OTP, Tour starten, Standort-Ping manuell senden, Tour beenden), verdrahtet gegen die bestehenden API-Endpoints
- Neuer Endpoint `GET /tours/active`, damit der Client nach einem Reload weiß, ob bereits eine Tour läuft (inkl. Tests: kein Token, keine aktive Tour, eigene aktive Tour, fremde Tour nicht sichtbar)
- Vite-Dev-Proxy (`/api` → `localhost:3000`) statt CORS-Konfiguration im Backend
- Flow manuell gegen echtes Postgres+PostGIS end-to-end verifiziert (Playwright-Skript, nicht Teil des Repos): Login, Tour starten, Ping senden (Standort landete korrekt als PostGIS-Punkt in der DB), Tour beenden
- Bugfix beim API-Client: `Content-Type: application/json` wurde auch bei Requests ohne Body gesetzt – Fastify lehnt das mit 400 ab (`FST_ERR_CTP_EMPTY_JSON_BODY`); Header wird jetzt nur bei tatsächlichem Body gesetzt
- [ADR 0007](docs/adr/0007-natives-hintergrund-tracking-capacitor.md): Kurswechsel entschieden – manueller Ping-Button in der PWA ist in der Praxis unbrauchbar ("das macht kein Mensch"), daher natives Hintergrund-Tracking via Capacitor (iOS zuerst, ~2–3 Min. Intervall) als primärer Weg; PWA-Check-in-Flow bleibt als Fallback bestehen. Noch nicht implementiert, offene Fragen (Plugin-Wahl, iOS-Permission-Flow, Retry-Strategie, Store-Distribution) im ADR festgehalten
- Umstieg auf Tailwind CSS v4 (`@tailwindcss/vite`) in `apps/web` und `apps/dashboard`; bestehende Web-Screens (Login, Tour) auf Tailwind-Klassen umgebaut, gemeinsame Klassen-Strings in `apps/web/src/ui.ts`
- `apps/dashboard` bekommt erste Fachlogik: Bergwacht-Login (E-Mail/Passwort) und Touren-Suche (Tabs Aktiv/Beendet, letzter bekannter Standort mit Kartenlink, "Aktualisieren"-Button statt Auto-Refresh – passend zum Pull-Modell aus ADR 0003), verdrahtet gegen `POST /rescue/login` und `GET /rescue/tours`
- Kompletter Flow (Wanderer startet Tour + sendet Ping → Bergwacht findet Tour in der Suche → Wanderer beendet Tour → Tour taucht bei der Bergwacht unter "Beendet" auf) end-to-end gegen echtes Postgres+PostGIS mit einem Playwright-Skript verifiziert (nicht Teil des Repos)
- Echte 3D-Kartenansicht im Bergwacht-Dashboard (`apps/dashboard/src/components/ToursMap.tsx`): MapLibre GL JS + OpenFreeMap-Basiskarte + AWS-Open-Data-Terrain-Tiles (Terrarium), alles kostenlos/Open Source, kein API-Key. Marker pro Tour mit letztem bekannten Standort, Klick öffnet Popup mit Name/Nummer/Zeit; automatisches `fitBounds` auf alle sichtbaren Marker

## 2026-09-16

- [ADR 0006](docs/adr/0006-teilbarer-tour-link-fuer-angehoerige.md) implementiert: offene Detailfragen vor Umsetzung mit dem Nutzer geklärt (Link gültig während `aktiv` plus 24h nach Tourende; kompletter Tourverlauf statt nur letzter Standort; ein Link pro Tour, Erzeugen rotiert/invalidiert den alten)
- `tour.share_token` (Flyway `V4__tour_share_link.sql`, 24 Zufallsbytes Base64url gegen Bruteforcing) + drei neue Endpoints in `apps/api/src/routes/share.ts`: `POST /tours/:id/share` (erzeugen/rotieren, nur Tour-Owner), `DELETE /tours/:id/share` (widerrufen), `GET /share/:token` (öffentlich, kein Login – Linkbesitz ist der Autorisierungsnachweis) inkl. 8 neuer Integrationstests (`apps/api/tests/share.test.ts`, jetzt 38 Tests gesamt)
- `apps/web`: Teilen-Steuerung in `TourScreen` (Link erzeugen/kopieren/widerrufen) sowie neue öffentliche `ShareScreen` unter `/share/:token` ohne Login (pfadbasierte Weiche in `App.tsx`, kein Router nötig für die eine Route), mit eigener MapLibre-Kartenansicht `ShareMap.tsx` (Track als Linie, `maplibre-gl` + `optimizeDeps`-Exclude wie im Dashboard)
- Flow (Link erzeugen → in anderem Browser-Kontext ohne Login öffnen → Karte mit Track sehen → widerrufen → Link zeigt "ungültig") end-to-end mit einem Playwright-Skript gegen die echten Dev-Server verifiziert (nicht Teil des Repos)
- Vite-Falle gefunden und gefixt: `maplibre-gl` braucht `optimizeDeps: { exclude: ['maplibre-gl'] }`, sonst schlägt der Worker-Import mit 404 fehl und die Karte rendert nur den leeren Hintergrund (keine Fehlermeldung in der Konsole, nur ein stiller `net::ERR_FAILED` für `maplibre-gl-worker.mjs`) – per Playwright-Netzwerk-Log diagnostiziert (0 Terrain-Tile-Requests trotz korrektem Code)
- Bugfix: `fitBounds()` setzte bei jeder Kartenaktualisierung (Tab-Wechsel, "Aktualisieren"-Button) die Blickrichtung auf Norden zurück, weil das MapLibre-Standardverhalten ist – jede manuelle Drehung der Bergwacht ging dadurch sofort wieder verloren. Jetzt wird nur noch beim ersten Laden automatisch gezoomt/zentriert; danach bleibt die Kamera unter Nutzerkontrolle, mit einem manuellen "Auf Touren zentrieren"-Button als Rückweg (`RecenterControl` in `ToursMap.tsx`)
- Satellitenbild-Modus für `ToursMap` als Ausbau zurückgestellt statt sofort umgesetzt: der kostenlose, keyless Anbieter (EOX Sentinel-2 Cloudless) ist nur für die 2016/2017er-Bilder CC BY 4.0 (kommerziell nutzbar) – alles ab 2018 ist CC BY-NC-SA (nicht-kommerziell), zu riskant für ein kommerzielles Produkt. Entscheidung: später ein Anbieter mit kostenlosem API-Key-Kontingent (MapTiler oder Mapbox Satellite) statt der alten, keyless Bilder – Details siehe CLAUDE.md "Offene Punkte"

## 2026-09-18

- [ADR 0008](docs/adr/0008-loeschfristen-standortverlauf.md): Löschfristen für den Standortverlauf entschieden und umgesetzt – schließt die in ADR 0001 offen gelassene Lücke (Zielkonflikt Datensparsamkeit vs. Bergwacht-Bedarf im Ernstfall). Offene Detailfragen (Basis-Frist, Verlängerungsmechanismus, Löschumfang, Ausführung) vorher mit dem Nutzer geklärt: 7-Tage-Basisfrist nach Tourende, manueller unbegrenzter Hold durch die Bergwacht für tatsächliche Ernstfälle, nur `location_ping` wird gelöscht (Tour-Metadaten bleiben), Ausführung als eigenständiges Operator-Script statt In-Process-Timer oder `pg_cron`
- `tour.retention_hold_at` / `tour.retention_hold_by` (Flyway `V5__tour_retention_hold.sql`, Drizzle-Schema) + zwei neue Bergwacht-Endpoints `POST /rescue/tours/:id/hold` und `DELETE /rescue/tours/:id/hold` in `apps/api/src/routes/rescue.ts`; `GET /rescue/tours` liefert jetzt zusätzlich `retentionHoldAt` pro Tour
- Neues Operator-Script `apps/api/src/scripts/delete-expired-pings.ts` (exportierte, direkt testbare `deleteExpiredPings()`-Funktion + CLI-Ausführung analog zu `create-rescue-member.ts`) – löscht `location_ping`-Zeilen von Touren, die länger als 7 Tage beendet und nicht per Hold zurückgehalten sind; noch nicht per Cron eingeplant (gleicher fehlender Infra-Baustein wie die CI-Pipeline)
- 6 neue Integrationstests (`apps/api/tests/retention.test.ts`, jetzt 44 Tests gesamt): Löschung nach Fristablauf, kein Löschen innerhalb der Frist, Hold verhindert Löschung, Löschung nach Hold-Aufhebung, Rollentrennung (403 ohne Rescue-Token), 404 für nicht existierende Tour
- `apps/dashboard`: Anzeige des Hold-Status pro Tour sowie Button zum Setzen/Aufheben ("Für Ernstfall halten" / "Hold aufheben") in `ToursScreen`, angebunden über neue `holdTour`/`releaseTourHold`-Funktionen in `apps/dashboard/src/api/client.ts`
