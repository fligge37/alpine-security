// Operator-Tool statt Admin-UI (ADR 0003): Anlegen und Verifizieren eines
// Bergwacht-Accounts in einem Schritt. Ausführen entspricht der manuellen
// Verifizierung – es gibt bewusst keinen Registrierungs-Endpoint.
//
// Nutzung:
//   pnpm --filter @alpine-security/api exec tsx --env-file=.env \
//     src/scripts/create-rescue-member.ts <email> <password> <displayName> [regionName]

import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { region, rescueOrgMember } from '../db/schema.js';

const [email, password, displayName, regionName = 'Oberallgäu'] = process.argv.slice(2);

if (!email || !password || !displayName) {
  console.error(
    'Usage: create-rescue-member.ts <email> <password> <displayName> [regionName=Oberallgäu]',
  );
  process.exit(1);
}

const [targetRegion] = await db.select().from(region).where(eq(region.name, regionName)).limit(1);

if (!targetRegion) {
  console.error(`Region "${regionName}" not found`);
  process.exit(1);
}

const passwordHash = await bcrypt.hash(password, 12);

const [created] = await db
  .insert(rescueOrgMember)
  .values({
    email,
    passwordHash,
    displayName,
    regionId: targetRegion.id,
    verifiedAt: new Date(),
  })
  .returning({ id: rescueOrgMember.id, email: rescueOrgMember.email });

console.log('Created and verified rescue_org_member:', created);
process.exit(0);
