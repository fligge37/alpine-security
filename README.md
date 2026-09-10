# Alpine Security

Monorepo für die Alpine-Sicherheits-App (Systemdesign siehe [docs/adr/0001-systemdesign-und-check-in-modell.md](docs/adr/0001-systemdesign-und-check-in-modell.md)).

## Struktur

```
apps/
  web/          Nutzer-PWA (React + TypeScript, Vite)
  dashboard/    Bergwacht-Dashboard (React + TypeScript, Refine)
  api/          Backend (TypeScript, Fastify)
    db/migrations/  Flyway-SQL-Migrationen (Schema-Quelle der Wahrheit)
    src/db/          Drizzle-Schema + Client (typsichere Query-Schicht)
packages/
  shared-types/ Gemeinsame TypeScript-Typen zwischen den Apps
docs/
  adr/          Architecture Decision Records
```

Web/Dashboard sind aktuell reine Grundgerüste ohne Fachlogik ("Hello World"). Die API hat bereits ein Datenmodell (siehe ADRs 0001–0005) und eine laufende Datenbank, aber noch keine Endpoints darauf – nur den Health-Check.

## Voraussetzungen

- Node.js >= 20
- [pnpm](https://pnpm.io/) via [Corepack](https://nodejs.org/api/corepack.html) (in Node enthalten)
- [Docker](https://www.docker.com/) für die lokale Datenbank (Postgres + PostGIS)

Corepack einmalig aktivieren:

```bash
corepack enable
```

pnpm wird dann automatisch in der im Root-`package.json` festgelegten Version verwendet.

## Setup

```bash
pnpm install
```

## Datenbank (für `apps/api`)

```bash
pnpm db:up       # startet Postgres+PostGIS in Docker (Port 5432)
pnpm db:migrate  # wendet alle Flyway-Migrationen aus apps/api/db/migrations an
pnpm db:down     # stoppt und entfernt die Container
```

`apps/api/.env.example` nach `.env` kopieren, bevor `pnpm dev:api` gestartet wird – dort steht die passende `DATABASE_URL` für die lokale Datenbank.

## Entwicklung

Jede App einzeln starten:

```bash
pnpm dev:web        # http://localhost:5180
pnpm dev:dashboard  # http://localhost:5181
pnpm dev:api        # http://localhost:3000 (Health-Check unter /health, Datenbank muss laufen)
```

## Weitere Skripte (im Root ausführbar)

```bash
pnpm build          # baut alle Apps/Packages
pnpm lint           # ESLint über das gesamte Repo
pnpm format         # Prettier – Dateien formatieren
pnpm format:check   # Prettier – nur prüfen, nicht schreiben
pnpm typecheck       # TypeScript-Typprüfung über alle Workspaces
```

## Konventionen

- Gemeinsame TS-Basis-Config: [tsconfig.base.json](tsconfig.base.json) – wird von allen Apps/Packages erweitert
- ESLint (Flat Config): [eslint.config.js](eslint.config.js)
- Prettier: [.prettierrc.json](.prettierrc.json)
- Gemeinsame Typen liegen in `packages/shared-types` und werden per `workspace:*` referenziert (siehe z. B. `HealthStatus` in `apps/api`)
