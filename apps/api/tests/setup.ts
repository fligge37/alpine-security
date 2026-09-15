import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll } from 'vitest';

// tsx/node werden über --env-file gestartet, vitest nicht – deshalb hier von
// Hand nachladen (CI setzt DATABASE_URL/JWT_SECRET stattdessen direkt).
// db/client.js erst NACH dem Laden importieren (dynamic import), sonst würde
// der statische Import oben schon vor loadEnvFile ausgewertet und fehlschlagen.
const envPath = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

afterAll(async () => {
  const { pool } = await import('../src/db/client.js');
  await pool.end();
});
