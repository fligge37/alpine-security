import { randomInt } from 'node:crypto';
import { Type } from '@sinclair/typebox';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { appUser, otpCode } from '../db/schema.js';

const OTP_TTL_MS = 5 * 60 * 1000;

const RequestOtpBody = Type.Object({
  phoneNumber: Type.String({ minLength: 6, maxLength: 20 }),
});

const VerifyOtpBody = Type.Object({
  phoneNumber: Type.String({ minLength: 6, maxLength: 20 }),
  code: Type.String({ minLength: 6, maxLength: 6 }),
});

const authRoutes: FastifyPluginAsyncTypebox = async (server) => {
  server.post('/auth/request-otp', { schema: { body: RequestOtpBody } }, async (request, reply) => {
    const { phoneNumber } = request.body;
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');

    await db.insert(otpCode).values({
      phoneNumber,
      code,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    });

    // Stub statt echtem SMS-Versand (Provider-Wahl ist laut ADR 0005 noch offen).
    request.log.info({ phoneNumber, code }, 'OTP generated (dev stub, not sent via SMS)');

    return reply.code(202).send({ ok: true });
  });

  server.post('/auth/verify-otp', { schema: { body: VerifyOtpBody } }, async (request, reply) => {
    const { phoneNumber, code } = request.body;

    const [candidate] = await db
      .select()
      .from(otpCode)
      .where(
        and(
          eq(otpCode.phoneNumber, phoneNumber),
          eq(otpCode.code, code),
          isNull(otpCode.consumedAt),
          gt(otpCode.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(otpCode.createdAt))
      .limit(1);

    if (!candidate) {
      return reply.code(401).send({ error: 'invalid_or_expired_code' });
    }

    await db.update(otpCode).set({ consumedAt: new Date() }).where(eq(otpCode.id, candidate.id));

    const [existingUser] = await db
      .select()
      .from(appUser)
      .where(eq(appUser.phoneNumber, phoneNumber))
      .limit(1);

    const user =
      existingUser ??
      (
        await db.insert(appUser).values({ phoneNumber, phoneVerifiedAt: new Date() }).returning()
      )[0];

    if (!user) {
      throw new Error('Failed to create or load user');
    }

    if (!existingUser) {
      request.log.info({ userId: user.id }, 'New user registered via OTP verification');
    }

    const token = await reply.jwtSign({ role: 'user', userId: user.id });

    return reply.send({ token });
  });
};

export default authRoutes;
