# Alpine Security

Monorepo für die Alpine-Sicherheits-App (Systemdesign siehe [docs/adr/0001-systemdesign-und-check-in-modell.md](docs/adr/0001-systemdesign-und-check-in-modell.md)).

## Struktur

```
apps/
  web/          Nutzer-PWA (React + TypeScript, Vite)
  dashboard/    Bergwacht-Dashboard (React + TypeScript, Refine)
  api/          Backend (TypeScript, Fastify)
packages/
  shared-types/ Gemeinsame TypeScript-Typen zwischen den Apps
docs/
  adr/          Architecture Decision Records
```

Dies ist aktuell ein reines Grundgerüst ohne Fachlogik: jede App liefert nur "Hello World" bzw. einen Health-Check.

## Voraussetzungen

- Node.js >= 20
- [pnpm](https://pnpm.io/) via [Corepack](https://nodejs.org/api/corepack.html) (in Node enthalten)

Corepack einmalig aktivieren:

```bash
corepack enable
```

pnpm wird dann automatisch in der im Root-`package.json` festgelegten Version verwendet.

## Setup

```bash
pnpm install
```

## Entwicklung

Jede App einzeln starten:

```bash
pnpm dev:web        # http://localhost:5180
pnpm dev:dashboard  # http://localhost:5181
pnpm dev:api        # http://localhost:3000 (Health-Check unter /health)
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
