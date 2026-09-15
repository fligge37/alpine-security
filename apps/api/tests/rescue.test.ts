import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { createRescueMember, loginAsRescue, registerUser } from './helpers.js';

describe('rescue: Login und Suche', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await app.close();
  });

  it('loggt mit korrekten Zugangsdaten ein', async () => {
    const { email, password } = await createRescueMember();

    const res = await app.inject({
      method: 'POST',
      url: '/rescue/login',
      payload: { email, password },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty('token');
  });

  it('lehnt ein falsches Passwort ab (401)', async () => {
    const { email } = await createRescueMember();

    const res = await app.inject({
      method: 'POST',
      url: '/rescue/login',
      payload: { email, password: 'falsches-passwort' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('lehnt den Login eines unverifizierten Accounts ab (403)', async () => {
    const { email, password } = await createRescueMember({ verified: false });

    const res = await app.inject({
      method: 'POST',
      url: '/rescue/login',
      payload: { email, password },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: 'not_verified' });
  });

  it('lehnt GET /rescue/tours ohne Token ab (401)', async () => {
    const res = await app.inject({ method: 'GET', url: '/rescue/tours' });
    expect(res.statusCode).toBe(401);
  });

  it('lehnt GET /rescue/tours mit einem Nutzer-Token ab (403, Rollentrennung)', async () => {
    const { token } = await registerUser(app);

    const res = await app.inject({
      method: 'GET',
      url: '/rescue/tours',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(403);
  });

  it('zeigt eine aktive Tour inkl. letztem Ping für verifizierte Rescue-Mitglieder', async () => {
    const user = await registerUser(app);
    const tourRes = await app.inject({
      method: 'POST',
      url: '/tours',
      headers: { authorization: `Bearer ${user.token}` },
    });
    const { id: tourId } = tourRes.json() as { id: string };

    await app.inject({
      method: 'POST',
      url: `/tours/${tourId}/pings`,
      headers: { authorization: `Bearer ${user.token}` },
      payload: { recordedAt: new Date().toISOString(), latitude: 47.4923, longitude: 10.2412 },
    });

    const { email, password } = await createRescueMember();
    const rescueToken = await loginAsRescue(app, email, password);

    const res = await app.inject({
      method: 'GET',
      url: '/rescue/tours',
      headers: { authorization: `Bearer ${rescueToken}` },
    });

    expect(res.statusCode).toBe(200);
    const tours = res.json() as Array<{ id: string; phoneNumber: string; lastPing: unknown }>;
    const match = tours.find((t) => t.id === tourId);

    expect(match).toBeTruthy();
    expect(match?.phoneNumber).toBe(user.phoneNumber);
    expect(match?.lastPing).toMatchObject({ latitude: 47.4923, longitude: 10.2412 });
  });

  it('filtert nach status=beendet und zeigt keine aktiven Touren', async () => {
    const user = await registerUser(app);
    const tourRes = await app.inject({
      method: 'POST',
      url: '/tours',
      headers: { authorization: `Bearer ${user.token}` },
    });
    const { id: tourId } = tourRes.json() as { id: string };

    const { email, password } = await createRescueMember();
    const rescueToken = await loginAsRescue(app, email, password);

    const activeList = (
      await app.inject({
        method: 'GET',
        url: '/rescue/tours?status=beendet',
        headers: { authorization: `Bearer ${rescueToken}` },
      })
    ).json() as Array<{ id: string }>;
    expect(activeList.find((t) => t.id === tourId)).toBeUndefined();

    await app.inject({
      method: 'POST',
      url: `/tours/${tourId}/end`,
      headers: { authorization: `Bearer ${user.token}` },
    });

    const endedList = (
      await app.inject({
        method: 'GET',
        url: '/rescue/tours?status=beendet',
        headers: { authorization: `Bearer ${rescueToken}` },
      })
    ).json() as Array<{ id: string }>;
    expect(endedList.find((t) => t.id === tourId)).toBeTruthy();
  });
});
