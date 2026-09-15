import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../src/db/client.js';
import { otpCode, region, rescueOrgMember } from '../src/db/schema.js';

// Jeder Test erzeugt eigene, zufällige Telefonnummern/E-Mails statt die DB
// zwischen Tests zu leeren – dadurch bleiben Tests parallelisierbar und
// verändern keine bestehenden Daten in der (geteilten Dev-)Datenbank.
export function randomPhoneNumber(): string {
  const digits = randomUUID().replace(/\D/g, '').slice(0, 9);
  return `+491${digits}`;
}

export function randomEmail(): string {
  return `rescue-${randomUUID()}@example.com`;
}

async function getLatestOtpCode(phoneNumber: string): Promise<string> {
  const [row] = await db
    .select()
    .from(otpCode)
    .where(eq(otpCode.phoneNumber, phoneNumber))
    .orderBy(desc(otpCode.createdAt))
    .limit(1);

  if (!row) {
    throw new Error(`No OTP found for ${phoneNumber}`);
  }
  return row.code;
}

export function decodeJwtPayload(token: string): Record<string, unknown> {
  const payloadSegment = token.split('.')[1];
  if (!payloadSegment) {
    throw new Error('Malformed JWT');
  }
  return JSON.parse(Buffer.from(payloadSegment, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
}

export async function registerUser(
  app: FastifyInstance,
  phoneNumber: string = randomPhoneNumber(),
): Promise<{ token: string; phoneNumber: string; userId: string }> {
  await app.inject({ method: 'POST', url: '/auth/request-otp', payload: { phoneNumber } });
  const code = await getLatestOtpCode(phoneNumber);

  const res = await app.inject({
    method: 'POST',
    url: '/auth/verify-otp',
    payload: { phoneNumber, code },
  });

  const { token } = res.json() as { token: string };
  const { userId } = decodeJwtPayload(token) as { userId: string };
  return { token, phoneNumber, userId };
}

export async function createRescueMember(options?: {
  verified?: boolean;
  password?: string;
}): Promise<{ email: string; password: string; id: string; regionId: string }> {
  const email = randomEmail();
  const password = options?.password ?? 'test-passwort-123';

  const [existingRegion] = await db.select().from(region).limit(1);
  if (!existingRegion) {
    throw new Error('No region seeded — run `pnpm db:migrate` before running tests');
  }

  const passwordHash = await bcrypt.hash(password, 4); // niedriger Cost-Faktor: Tests, nicht Produktion

  const [member] = await db
    .insert(rescueOrgMember)
    .values({
      email,
      passwordHash,
      displayName: 'Test Rescue Member',
      regionId: existingRegion.id,
      verifiedAt: options?.verified === false ? null : new Date(),
    })
    .returning();

  if (!member) {
    throw new Error('Failed to create rescue_org_member fixture');
  }

  return { email, password, id: member.id, regionId: member.regionId };
}

export async function loginAsRescue(
  app: FastifyInstance,
  email: string,
  password: string,
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/rescue/login',
    payload: { email, password },
  });
  const { token } = res.json() as { token: string };
  return token;
}
