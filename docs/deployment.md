# Deployment

Umsetzung von [ADR 0009](adr/0009-deployment-vps-docker-compose.md): ein VPS mit Docker Compose,
automatisch bespielt über den GitHub-Actions-Workflow [`.github/workflows/ci-cd.yml`](../.github/workflows/ci-cd.yml).
Dieses Dokument beschreibt die einmaligen manuellen Schritte, die vor dem ersten automatischen Deploy nötig sind
(Server anlegen, DNS, Secrets) - Claude Code kann diese nicht selbst ausführen (kein Zugriff auf IONOS-Konto,
Domain-Verwaltung oder GitHub-Repo-Settings).

## 1. Server anlegen

- IONOS, Produktlinie **VPS** (nicht "Cloud Server"/IaaS - das ist eine andere, teurere Linie), Tarif
  **VPS S+** (1 vCPU, 2 GB RAM, 60 GB SSD, 5 €/Monat im Regelpreis nach der 3-monatigen Einführungsphase)
  reicht für API + Postgres/PostGIS + zwei statische Frontends bei diesem Nutzungsumfang (siehe ADR 0009,
  Update vom 2026-10-08, zur Preisbegründung und zum ursprünglich geplanten Hetzner-Server). Falls der RAM
  im Betrieb zu knapp wird, Upgrade auf VPS M+ (2 vCPU/4 GB, 12 €/Monat) über das IONOS-Kundencenter möglich.
- Rechenzentrum: ein deutscher Standort - passt zur DSGVO-Leitplanke aus CLAUDE.md.
- Image: **Ubuntu 26.04 + Docker** (aktuelles LTS, Docker bereits vorinstalliert), beim Anlegen den eigenen
  SSH-Public-Key hinterlegen (kein Passwort-Login). Nach dem ersten Login einmal `docker compose version`
  prüfen - der Deploy-Workflow nutzt die Compose-v2-Syntax (`docker compose`, nicht `docker-compose`);
  fehlt das Plugin, offizielles Docker-Repo nachinstallieren: `curl -fsSL https://get.docker.com | sh`.
- **Kein SSL-Zertifikat dazubuchen** (IONOS "SSL Starter" o. Ä.): Caddy holt sich die Zertifikate
  automatisch und kostenlos von Let's Encrypt, inklusive Erneuerung (siehe Schritt 7).
- In der IONOS-Firewall **Port 80 und 443 eingehend freigeben** - Port 80 wird nicht nur für die
  HTTP→HTTPS-Weiterleitung gebraucht, sondern auch für die ACME-Challenge beim Zertifikatsabruf.

## 2. Deploy-User anlegen

GitHub Actions soll nicht als `root` auf dem Server deployen. Stattdessen einmalig (als `root`, direkt
nach dem ersten Login) einen eigenen `deploy`-User anlegen:

```
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
mkdir -p /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
```

Separates SSH-Keypair **nur für diesen Deploy-User** erzeugen - nicht den eigenen persönlichen Key
wiederverwenden, damit das Secret in GitHub unabhängig von deinem eigenen Zugang rotiert/widerrufen werden
kann (lokal ausführen, nicht auf dem Server):

```
ssh-keygen -t ed25519 -f ~/.ssh/deploy_alpine_security -C "github-actions-deploy" -N ""
```

Den Inhalt von `deploy_alpine_security.pub` auf dem Server hinterlegen:

```
echo "<Inhalt von deploy_alpine_security.pub>" > /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
```

`usermod -aG docker deploy` ist der entscheidende Schritt: nur `root` und Mitglieder der `docker`-Gruppe
dürfen den Docker-Daemon ansprechen, ohne das bräuchte der Workflow `sudo` - das wäre wieder effektiv
Root-Zugriff. Mitgliedschaft in der `docker`-Gruppe ist zwar faktisch root-äquivalent (Zugriff auf den
Docker-Socket erlaubt u. a. beliebige Host-Mounts), aber für dieses Solo-VPS ein akzeptabler Trade-off und
klar besser als SSH direkt als `root`.

Der Inhalt von `deploy_alpine_security` (privater Key, **nicht** `.pub`) wird später unter Schritt 6 als
GitHub-Secret `VPS_SSH_KEY` hinterlegt.

## 3. DNS

**Aktuell (Provisorium, siehe ADR 0009-Update vom 2026-10-13):** noch keine eigene Domain gekauft - bewusste
Entscheidung, um erstmal ohne Vertrag/laufende Zusatzkosten auf echten Touren testen zu können. Stattdessen
läuft [`deploy/Caddyfile`](../deploy/Caddyfile) aktuell nur mit dem automatisch von IONOS vergebenen
Hostnamen des Servers (z. B. `06yre4t.cserverhost.cloud`, im Kundencenter bei den Server-Details sichtbar) -
der zeigt schon per DNS auf die Server-IP, zusätzliche DNS-Einträge sind dafür nicht nötig. Eingeschränkt auf
die API, da das der eigentliche Blocker für den Gerätetest ist (siehe ADR 0009, "Für einen realistischen Test
unterwegs braucht es eine über das Internet erreichbare API"); `apps/dashboard` bleibt für Kontrollzwecke
vorerst lokal (`pnpm --filter dashboard dev`, Vite-Proxy-Ziel auf den Hostnamen umgestellt statt
`localhost:3000`), `apps/web` wird nicht öffentlich deployed, da die native App ihr Web-Bundle schon enthält.

**Später, sobald eine Domain gekauft ist:** drei A-Records auf die Server-IP, für die drei Domains aus dem
in `deploy/Caddyfile` bereits vorbereiteten (aktuell auskommentierten) Ziel-Setup:

- `app.<deine-domain>` → Wanderer-PWA
- `rescue.<deine-domain>` → Bergwacht-Dashboard
- `api.<deine-domain>` → direkter API-Zugriff (auch für die native iOS-App, siehe `VITE_API_BASE_URL`)

Dann im Repo den provisorischen Hostnamen-Block in `deploy/Caddyfile` durch die auskommentierten
Domain-Blöcke ersetzen (`example.com` darin durch die echten Domains) und committen - der Deploy-Workflow
kopiert die Datei bei jedem Durchlauf auf den Server.

## 4. Verzeichnis + Secrets auf dem Server

```
ssh deploy@<server-ip>
mkdir -p /opt/alpine-security/deploy
```

(Verzeichnis gehört dem `deploy`-User, der es anlegt - kein zusätzliches `chown` nötig, solange alle
folgenden Schritte ebenfalls als `deploy` laufen.)

`deploy/.env` **auf dem Server** anlegen (liegt nicht im Repo, wird vom Deploy-Workflow nie überschrieben):

```
POSTGRES_PASSWORD=<mit openssl rand -hex 32 erzeugen - nicht -base64, siehe deploy/.env.example>
JWT_SECRET=<mit z.B. openssl rand -base64 32 erzeugen>
IMAGE_TAG=latest
```

## 5. GHCR-Zugriff auf dem Server

Der Deploy-Job baut das API-Image und pusht es nach GitHub Container Registry (`ghcr.io`) - standardmäßig
privat. Damit der Server es pullen kann, einmalig auf dem Server einloggen:

1. Auf GitHub ein Personal Access Token (classic) mit Scope `read:packages` erzeugen.
2. Auf dem Server (als `deploy`, da `docker compose up` im Workflow ebenfalls als `deploy` läuft):
   `docker login ghcr.io -u <github-username>` und das Token als Passwort eingeben.

Alternativ: das Package nach dem ersten Push unter github.com/fligge37/alpine-security/pkgs/container/alpine-security-api
auf "Public" stellen, dann entfällt der Login auf dem Server. Bei einer sicherheitsnahen App eher nicht empfehlenswert,
auch wenn im Image selbst keine Geheimnisse stecken (Secrets kommen erst zur Laufzeit aus `deploy/.env`).

## 6. GitHub Actions Secrets

Im Repo unter Settings → Secrets and variables → Actions:

- `VPS_HOST` - IP oder Hostname des Servers
- `VPS_USER` - `deploy` (siehe Schritt 2; nicht `root`)
- `VPS_SSH_KEY` - Inhalt der privaten Key-Datei `deploy_alpine_security` aus Schritt 2 (nicht `.pub`),
  deren öffentliches Gegenstück dort bereits in `~/.ssh/authorized_keys` des `deploy`-Users liegt

## 7. Erster Durchlauf

Jeder Push nach `main` und jeder PR stößt Lint/Format-Check/Typecheck/Tests sowie einen Docker-Image-Build
als Smoke-Test an – aber noch keinen Deploy. Da hier allein ohne Branches gearbeitet wird, landet auf `main`
auch mal unfertiger Code; ein automatischer Deploy bei jedem Push wäre deshalb unerwünscht.

**Deployed wird nur gezielt**, auf zwei Wegen:

- **Tag setzen:** `git tag v1 <commit>` (oder einfach `HEAD`) und `git push origin v1` – löst den kompletten
  Workflow inkl. Deploy für genau diesen Commit aus. Nächstes Mal `v2`, `v3`, usw. (keine Versionierungslogik
  nötig, nur eindeutige Namen).
- **Manuell:** im Reiter „Actions" auf GitHub den Workflow „CI/CD" öffnen, „Run workflow" klicken und den
  gewünschten Branch oder Tag auswählen – nützlich, um einen bereits getaggten Stand erneut auszurollen, ohne
  neu zu taggen.

Beide Wege durchlaufen den vollen Workflow: Lint/Typecheck/Tests → Docker-Image bauen & nach GHCR pushen →
`apps/web`/`apps/dashboard` bauen → alles per `rsync` auf den Server kopieren → per SSH Migrationen ausführen
und `docker compose up -d`. Caddy holt sich beim ersten Start automatisch ein Let's-Encrypt-Zertifikat -
aktuell (Provisorium) für den einen IONOS-Hostnamen, später für die drei eigenen Domains (setzt jeweils
voraus, dass die DNS-Einträge aus Schritt 3 schon aktiv sind - beim Hostnamen automatisch der Fall).

Kontrolle danach: aktuell `https://<ionos-hostname>/health` (Provisorium); sobald die eigene Domain aktiv
ist, `https://app.<domain>/api/health`, `https://rescue.<domain>`, `https://api.<domain>/health` - jeweils
mit gültigem Zertifikat.

## Bewusst nicht Teil dieses Schritts

- **Backup-Strategie für Postgres** - in ADR 0009 als offene Frage benannt, hier nicht mit entschieden.
  Bis dahin: kein automatisches Backup, ein VPS-Totalausfall bedeutet Datenverlust.
- **Staging-Umgebung** - MVP-Entscheidung laut ADR 0009, nur eine Umgebung.
- **`apps/web/.env` für die native iOS-App** - `VITE_API_BASE_URL` muss lokal gesetzt werden, bevor man
  `pnpm --filter web cap:sync` für einen echten Gerätetest laufen lässt (aktuell, Provisorium: der
  IONOS-Hostname; später: `https://api.<domain>`); das ist ein manueller lokaler Schritt (ADR 0007), keine
  Automatisierung über diesen Workflow.
