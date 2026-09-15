import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { buildApp } from '../src/app.js';
import { db } from '../src/db/client.js';
import { otpCode } from '../src/db/schema.js';
import { decodeJwtPayload, randomPhoneNumber, registerUser } from './helpers.js';

describe('auth: OTP-Flow', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await app.close();
  });

  it('lehnt request-otp ohne phoneNumber ab (400)', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/request-otp', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('legt bei erster Verifizierung einen neuen Nutzer an und liefert ein user-Token', async () => {
    const { token, userId } = await registerUser(app);

    expect(token).toBeTruthy();
    expect(decodeJwtPayload(token)).toMatchObject({ role: 'user', userId });
  });

  it('liefert beim zweiten Login derselben Nummer dieselbe userId zurück', async () => {
    const phoneNumber = randomPhoneNumber();
    const first = await registerUser(app, phoneNumber);
    const second = await registerUser(app, phoneNumber);

    expect(second.userId).toBe(first.userId);
  });

  it('lehnt einen falschen Code ab (401)', async () => {
    const phoneNumber = randomPhoneNumber();
    await app.inject({ method: 'POST', url: '/auth/request-otp', payload: { phoneNumber } });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/verify-otp',
      payload: { phoneNumber, code: '000000' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('lehnt einen bereits verbrauchten Code beim zweiten Versuch ab (401)', async () => {
    const phoneNumber = randomPhoneNumber();
    await app.inject({ method: 'POST', url: '/auth/request-otp', payload: { phoneNumber } });
    const [row] = await db
      .select()
      .from(otpCode)
      .where(eq(otpCode.phoneNumber, phoneNumber))
      .limit(1);

    const payload = { phoneNumber, code: row!.code };
    const firstAttempt = await app.inject({ method: 'POST', url: '/auth/verify-otp', payload });
    const secondAttempt = await app.inject({ method: 'POST', url: '/auth/verify-otp', payload });

    expect(firstAttempt.statusCode).toBe(200);
    expect(secondAttempt.statusCode).toBe(401);
  });

  it('lehnt einen abgelaufenen Code ab (401)', async () => {
    const phoneNumber = randomPhoneNumber();
    await app.inject({ method: 'POST', url: '/auth/request-otp', payload: { phoneNumber } });

    await db
      .update(otpCode)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(otpCode.phoneNumber, phoneNumber));

    const [row] = await db
      .select()
      .from(otpCode)
      .where(eq(otpCode.phoneNumber, phoneNumber))
      .limit(1);

    const res = await app.inject({
      method: 'POST',
      url: '/auth/verify-otp',
      payload: { phoneNumber, code: row!.code },
    });

    expect(res.statusCode).toBe(401);
  });
});
