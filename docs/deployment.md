# Deployment

Umsetzung von [ADR 0009](adr/0009-deployment-vps-docker-compose.md): ein Hetzner-VPS mit Docker Compose,
automatisch bespielt über den GitHub-Actions-Workflow [`.github/workflows/ci-cd.yml`](../.github/workflows/ci-cd.yml).
Dieses Dokument beschreibt die einmaligen manuellen Schritte, die vor dem ersten automatischen Deploy nötig sind
(Server anlegen, DNS, Secrets) - Claude Code kann diese nicht selbst ausführen (kein Zugriff auf Hetzner-Konto,
Domain-Verwaltung oder GitHub-Repo-Settings).

## 1. Server anlegen

- Hetzner Cloud, Server-Typ **CX22** (2 vCPU, 4 GB RAM, ~4 €/Monat) reicht für API + Postgres/PostGIS +
  zwei statische Frontends bei diesem Nutzungsumfang.
- Region: Nürnberg oder Falkenstein (Deutschland) - passt zur DSGVO-Leitplanke aus CLAUDE.md.
- Image: Ubuntu 24.04, beim Anlegen den eigenen SSH-Public-Key hinterlegen (kein Passwort-Login).
- Docker installieren (Hetzner bietet dafür auch ein fertiges "Docker CE"-App-Image beim Server-Erstellen an,
  alternativ nach dem ersten Login `curl -fsSL https://get.docker.com | sh`).

## 2. DNS

Drei A-Records auf die Server-IP, für die drei Domains aus [`deploy/Caddyfile`](../deploy/Caddyfile):

- `app.<deine-domain>` → Wanderer-PWA
- `rescue.<deine-domain>` → Bergwacht-Dashboard
- `api.<deine-domain>` → direkter API-Zugriff (auch für die native iOS-App, siehe `VITE_API_BASE_URL`)

`deploy/Caddyfile` enthält aktuell `example.com` als Platzhalter (laut RFC 2606 extra für sowas reserviert) -
vor dem ersten Deploy im Repo durch die echten Domains ersetzen und committen, der Deploy-Workflow kopiert die
Datei bei jedem Durchlauf auf den Server.

## 3. Verzeichnis + Secrets auf dem Server

```
ssh <user>@<server-ip>
mkdir -p /opt/alpine-security/deploy
```

`deploy/.env` **auf dem Server** anlegen (liegt nicht im Repo, wird vom Deploy-Workflow nie überschrieben):

```
POSTGRES_PASSWORD=<mit z.B. openssl rand -base64 32 erzeugen>
JWT_SECRET=<mit z.B. openssl rand -base64 32 erzeugen>
IMAGE_TAG=latest
```

## 4. GHCR-Zugriff auf dem Server

Der Deploy-Job baut das API-Image und pusht es nach GitHub Container Registry (`ghcr.io`) - standardmäßig
privat. Damit der Server es pullen kann, einmalig auf dem Server einloggen:

1. Auf GitHub ein Personal Access Token (classic) mit Scope `read:packages` erzeugen.
2. Auf dem Server: `docker login ghcr.io -u <github-username>` und das Token als Passwort eingeben.

Alternativ: das Package nach dem ersten Push unter github.com/fligge37/alpine-security/pkgs/container/alpine-security-api
auf "Public" stellen, dann entfällt der Login auf dem Server. Bei einer sicherheitsnahen App eher nicht empfehlenswert,
auch wenn im Image selbst keine Geheimnisse stecken (Secrets kommen erst zur Laufzeit aus `deploy/.env`).

## 5. GitHub Actions Secrets

Im Repo unter Settings → Secrets and variables → Actions:

- `VPS_HOST` - IP oder Hostname des Servers
- `VPS_USER` - SSH-Benutzer (z. B. `root` oder ein eigens angelegter Deploy-User)
- `VPS_SSH_KEY` - privater SSH-Schlüssel, dessen öffentliches Gegenstück auf dem Server unter
  `~/.ssh/authorized_keys` des `VPS_USER` liegt

## 6. Erster Durchlauf

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
und `docker compose up -d`. Caddy holt sich beim ersten Start automatisch Let's-Encrypt-Zertifikate für die
drei Domains (setzt voraus, dass die DNS-Einträge aus Schritt 2 schon aktiv sind).

Kontrolle danach: `https://app.<domain>/api/health`, `https://rescue.<domain>`, `https://api.<domain>/health`
sollten erreichbar sein, jeweils mit gültigem Zertifikat.

## Bewusst nicht Teil dieses Schritts

- **Backup-Strategie für Postgres** - in ADR 0009 als offene Frage benannt, hier nicht mit entschieden.
  Bis dahin: kein automatisches Backup, ein VPS-Totalausfall bedeutet Datenverlust.
- **Staging-Umgebung** - MVP-Entscheidung laut ADR 0009, nur eine Umgebung.
- **`apps/web/.env` für die native iOS-App** - `VITE_API_BASE_URL` muss lokal auf `https://api.<domain>`
  gesetzt werden, bevor man `pnpm --filter web cap:sync` für einen echten Gerätetest laufen lässt; das ist
  ein manueller lokaler Schritt (ADR 0007), keine Automatisierung über diesen Workflow.
