# ADR 0009: Deployment – Einzelner VPS mit Docker Compose

## Kontext

Bisher existiert kein deployter Zustand des Projekts – alles läuft ausschließlich lokal (`pnpm dev`, lokales Docker Compose für Postgres+PostGIS). Mehrere bereits dokumentierte Lücken hängen genau daran:

- CLAUDE.md "Offene Punkte": "Keine CI-Pipeline (Tests/Lint/Typecheck laufen bisher nur lokal)" und die Löschfrist aus [ADR 0008](0008-loeschfristen-standortverlauf.md) "ist als Script implementiert, aber noch nicht per Cron eingeplant – hängt am selben fehlenden Infra-Baustein wie die CI-Pipeline".
- Beim ersten Test der nativen iOS-App (ADR 0007) auf einem echten Gerät zeigte sich das konkret: die App kann die API nur erreichen, solange `VITE_API_BASE_URL` auf eine private LAN-IP des Dev-Rechners zeigt und das Testgerät im selben WLAN ist. Für einen realistischen Test unterwegs (auf einer Tour, ohne Heim-WLAN) braucht es eine über das Internet erreichbare API.

Ein Deployment ist damit kein optionaler nächster Schritt mehr, sondern eine Voraussetzung für weitere sinnvolle Fortschritte an mehreren bereits offenen Punkten gleichzeitig.

## Entscheidung

- **Hosting:** ein einzelner VPS (z. B. Hetzner oder DigitalOcean) mit Docker Compose – gleiches mentales Modell wie der bestehende lokale Dev-Stack, das vorhandene `docker-compose.yml` ist der Ausgangspunkt. Bewusst keine Managed-PaaS-Lösung (Fly.io/Render/Railway) und keine große Cloud-Plattform (AWS/GCP/Azure) – für den aktuellen MVP-Umfang (eine Region, überschaubare Nutzerzahl) unnötige Komplexität bzw. Anbieter-Abhängigkeit.
- **Datenbank:** Postgres+PostGIS selbst gehostet im selben Docker Compose auf dem VPS, kein Managed-Postgres-Anbieter – konsistent mit dem VPS-Ansatz, kein zusätzlicher Account/Anbieter, kein Risiko fehlender PostGIS-Unterstützung.
- **Umgebungen:** nur eine Umgebung (Produktion), kein separates Staging fürs MVP – passt zum bisherigen MVP-Pragmatismus im Projekt (eine Region, eine Umgebung lokal).
- **Umfang des Deployments:** `apps/api` (Fastify) inkl. Flyway-Migrationen und Postgres/PostGIS als Container auf dem VPS; `apps/web` (PWA, plus API-Ziel für die native iOS-App) und `apps/dashboard` als statische Builds, ausgeliefert über denselben VPS.

## Konsequenzen

- Löst die in der Praxis aufgetretene Lücke beim nativen App-Test: mit einer öffentlich erreichbaren API muss `VITE_API_BASE_URL` nicht mehr auf eine private LAN-IP zeigen, echte Tests unterwegs werden möglich.
- Ermöglicht endlich den Cron für das Löschfrist-Script (ADR 0008) und eine echte CI-Pipeline – beide waren bisher konkret durch das Fehlen jeglicher Infrastruktur blockiert.
- Betriebsverantwortung liegt jetzt beim Team: Betriebssystem-Updates, TLS-Zertifikate, Monitoring, Neustart bei Ausfall – nichts davon existiert aktuell und muss aufgebaut werden. Das ist der bewusst in Kauf genommene Preis für volle Kontrolle statt Managed-Services.
- Self-hosted Postgres bedeutet: keine automatischen Managed-Backups. Ohne eigene Backup-Strategie (siehe offene Fragen) ist ein Datenverlust bei VPS-Ausfall permanent – bei einem Sicherheits-Produkt für Bergtouren ein ernstzunehmendes Risiko, sobald echte Nutzer/die Bergwacht sich darauf verlassen.
- Eine einzelne Umgebung ohne Staging bedeutet: Deploy-Fehler wirken sich direkt auf die einzige laufende Instanz aus, ohne Testpuffer davor.

## Offene Fragen (vor Umsetzung zu klären)

- Welcher VPS-Anbieter konkret und welche Region (Datenschutz/DSGVO: EU-Serverstandort naheliegend angesichts der Datensparsamkeit-Leitplanke)
- Domain + TLS-Einrichtung (z. B. Caddy oder Traefik mit automatischem Let's-Encrypt-Zertifikat)
- Secrets-Management für Produktion (JWT-Secret, DB-Passwort, künftiger SMS-Provider-Key aus ADR 0005) – aktuell nur lokal per `.env`
- CI/CD zum eigentlichen Ausrollen (z. B. GitHub Actions, das nach erfolgreichem Test/Lint/Typecheck automatisch auf den VPS deployt) vs. zunächst manuelles Deployment
- Backup-Strategie für die Postgres-Daten (Frequenz, Aufbewahrungsdauer, Off-Site-Kopie, Restore-Test)
- Wie `apps/web` nach dem Deployment auf die öffentliche API-Domain zeigt (Build-Zeit-Konfiguration von `VITE_API_BASE_URL` statt der bisherigen LAN-IP-Krücke)
