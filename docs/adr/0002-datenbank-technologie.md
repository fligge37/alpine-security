# ADR 0002: Datenbank & Datenzugriffsschicht

## Kontext

ADR 0001 legt die Kernentitäten fest (`user`, `rescue_org_member`, `tour`, `location_ping`, `region`) und verlangt räumlich-zeitliche Abfragen (z. B. "welche Touren waren zum Zeitpunkt X im Umkreis von Punkt Y aktiv?") für den Ernstfall am Schreibtisch der Bergwacht. Das braucht eine Datenbank mit Geo-Unterstützung, eine nachvollziehbare, versionierte Migrationshistorie und eine Zugriffsschicht aus `apps/api`, die TypeScript-Typfehler bei Schema-Abweichungen sofort sichtbar macht statt sie erst zur Laufzeit zu bemerken.

## Entscheidung

- **PostgreSQL mit PostGIS-Extension**, betrieben als Docker-Container – lokal wie produktiv identisch.
- **Flyway** für versionierte SQL-Migrationen (reines SQL, kein generiertes DSL).
- **Drizzle** ausschließlich als typsichere Query-Schicht in `apps/api` – nicht dessen eigenes Migrationstool (`drizzle-kit`).

## Abgewogene Alternativen

- **Prisma** statt Drizzle: eigene Schema-Sprache, generiert einen typsicheren Client, sehr verbreitet. Verworfen, weil der PostGIS-Support schwach ist – Geometrie-Spalten und `ST_`-Funktionen (zentral für die Umkreissuche aus ADR 0001) lassen sich nur über Raw-SQL-Escape-Hatches ansprechen, was den Typsicherheits-Vorteil an genau der Stelle aufhebt, die uns am wichtigsten ist.
- **Drizzles eigene Migrationsverwaltung** statt Flyway: würde ein Tool statt zwei bedeuten. Verworfen, weil plain SQL besser zu PostGIS-DDL passt (Extensions aktivieren, GIST-Indizes, `ST_`-Funktionen in Migrationen), und weil im Team bereits Flyway-Erfahrung besteht.

## Konsequenzen

- Zwei separate Tools für Migration (Flyway) und Query (Drizzle) – bewusst in Kauf genommen, siehe oben.
- Datenbankschema wird zweimal beschrieben: einmal in Flyway-SQL-Migrationen (Quelle der Wahrheit für die DB), einmal in Drizzle-Schema-Definitionen (für Typsicherheit in `apps/api`). Beide müssen bei Änderungen synchron gehalten werden – das ist ein manueller Schritt, kein automatischer Codegen aus der DB.
- PostGIS-Typen (Geometrie/Geography) werden in Drizzle über dessen PostGIS-Erweiterung bzw. bei Bedarf Raw-SQL abgebildet.

## Offene Fragen (nächste Iteration)

- Docker-Compose-Setup für lokale Entwicklung (Postgres+PostGIS-Image, Healthcheck, Volume)
- Connection-Pooling-Strategie in Fastify (z. B. `pg.Pool` vs. externer Pooler wie PgBouncer)
- Ablage der Flyway-Migrationen im Repo (vermutlich `apps/api/db/migrations` oder eigenes `packages/db`)
