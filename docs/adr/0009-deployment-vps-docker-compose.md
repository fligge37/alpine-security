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

Beantwortet (siehe „Umsetzung" unten):

- ~~Welcher VPS-Anbieter konkret und welche Region~~ → IONOS VPS S+ (1 vCPU, 2 GB RAM), deutsches Rechenzentrum (siehe „Update" unten; ursprünglich Hetzner Cloud CX22 vorgesehen)
- ~~Domain + TLS-Einrichtung~~ → Caddy als Reverse-Proxy mit automatischem Let's-Encrypt-Zertifikat
- ~~CI/CD zum eigentlichen Ausrollen~~ → GitHub Actions
- ~~Wie `apps/web` auf die öffentliche API-Domain zeigt~~ → eigene `api.<domain>`-Subdomain, `VITE_API_BASE_URL` bleibt manuell zu setzen (nur für native App relevant, siehe ADR 0007)

Weiterhin offen:

- Secrets-Management für Produktion über die Basis (`deploy/.env` direkt auf dem Server, siehe `docs/deployment.md`) hinaus – kein Secrets-Manager/Vault, bewusst minimal fürs MVP; künftiger SMS-Provider-Key aus ADR 0005 kommt in dieselbe Datei
- Backup-Strategie für die Postgres-Daten (Frequenz, Aufbewahrungsdauer, Off-Site-Kopie, Restore-Test) – noch nicht umgesetzt, siehe „Umsetzung"

## Umsetzung

`apps/api/Dockerfile` (Multi-Stage-Build über `pnpm deploy` – der offizielle pnpm-Weg, ein einzelnes Workspace-Paket mit aufgelösten Prod-Dependencies ohne Monorepo-Symlink-Probleme in ein schlankes Image zu exportieren) plus `deploy/docker-compose.yml`, `deploy/Caddyfile` und `deploy/.env.example` als Produktions-Stack (Postgres+PostGIS, Flyway als einmaliger Migrations-Job, API-Container, Caddy). `apps/web` und `apps/dashboard` werden als statische Builds direkt von Caddy ausgeliefert, nicht als eigene Container. Drei Subdomains (`app.`/`rescue.`/`api.<domain>`), jeweils per `handle_path /api/*` gegen den API-Container geroutet – passt zum bestehenden Muster, dass beide Frontends schon jetzt relative `/api`-Pfade verwenden (siehe CLAUDE.md, Vite-Dev-Proxy).

CI/CD in einem GitHub-Actions-Workflow (`.github/workflows/ci-cd.yml`): bei jedem Push/PR Lint, Format-Check, Typecheck, API-Tests gegen einen echten Postgres+PostGIS-Service-Container (kein Mocking – konsistent mit der bestehenden Testphilosophie, siehe CLAUDE.md) sowie ein Docker-Image-Build als Smoke-Test (ohne Push in die Registry). Deployment ist davon bewusst entkoppelt: bei Solo-Arbeit ohne Branch-Modell landet auch unfertiger Code auf `main`, ein Deploy bei jedem Push wäre deshalb ungewollt. Tatsächlich deployed wird nur, wenn ein Commit mit einem `v*`-Tag versehen wird, oder manuell über den „Run workflow"-Knopf in der GitHub-Actions-UI (dort lässt sich der Branch/Tag auswählen) – dann zusätzlich Docker-Image-Push nach GHCR, Web/Dashboard-Build und Rollout auf den VPS per SSH/rsync (Dateien kopieren, Migrationen ausführen, `docker compose up -d`). Die einmaligen manuellen Vorbereitungsschritte (Server anlegen, DNS, GHCR-Login auf dem Server, GitHub Secrets) sind in `docs/deployment.md` festgehalten, da sie außerhalb dessen liegen, was sich im Repo automatisieren lässt.

Noch nicht umgesetzt: Backup-Strategie für Postgres (weiterhin offen, siehe oben) und die Einplanung des Löschfrist-Scripts aus ADR 0008 als Cron-Job auf dem neuen Server (naheliegender nächster Schritt, jetzt, wo der fehlende Infra-Baustein aus CLAUDE.md "Offene Punkte" nicht mehr fehlt).

## Update (2026-10-08): VPS-Anbieter gewechselt, Hetzner → IONOS

Noch vor dem ersten tatsächlichen Server-Anlegen zeigte sich, dass die bei Hetzner angenommene Preisannahme (CX22, ~4 €/Monat) nicht mehr aktuell war: Hetzner hat die Shared-vCPU-Linie umbenannt/neu gepreist (jetzt "Regular Performance"/CPX), der günstigste zum Zeitpunkt der Prüfung tatsächlich bestellbare Server lag bei 13,67 €/Monat (CPX12, 1 vCPU/2 GB) – das günstigere "Cost-Optimized"-Tier war am gewählten Standort nicht verfügbar ("Limitierte Verfügbarkeit"). Da der MVP-Umfang (eine Region, Testbetrieb auf echten Touren) ohnehin nur einen kleinen Server braucht, wurde stattdessen IONOS geprüft: **VPS S+** (1 vCPU, 2 GB RAM, 60 GB SSD) kostet dort 5 €/Monat im Regelpreis (3 Monate Einführungspreis 2 €/Monat, danach 5 €/Monat; einmalig 10 € Einrichtungsgebühr) – bei gleichen Specs günstiger als die aktuell verfügbare Hetzner-Alternative. IONOS hat ebenfalls Rechenzentren in Deutschland, die DSGVO-Leitplanke aus CLAUDE.md bleibt also erfüllt.

Technisch ändert sich an der in diesem ADR getroffenen Entscheidung (VPS + Docker Compose, selbst gehostetes Postgres) nichts – IONOS VPS S+ ist wie der ursprünglich angenommene Hetzner-Server ein gewöhnlicher Ubuntu-Root-Server mit SSH-Zugang, der Rest der Umsetzung (Caddy, GitHub-Actions-Workflow, Secrets-Namen) ist provider-agnostisch und unverändert gültig. Betroffen sind nur die konkreten Schritte in [docs/deployment.md](../deployment.md) (Server-Anlage) sowie die Produktwahl selbst; sollte sich IONOS in der Praxis als ungeeignet erweisen (z. B. Performance, Support), ist ein erneuter Wechsel ohne Architekturänderung möglich, da nichts im Stack IONOS-spezifisch ist.
