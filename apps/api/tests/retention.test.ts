import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { db } from '../src/db/client.js';
import { locationPing, tour } from '../src/db/schema.js';
import { deleteExpiredPings, RETENTION_DAYS } from '../src/scripts/delete-expired-pings.js';
import { createRescueMember, loginAsRescue, registerUser } from './helpers.js';

async function createEndedTourWithPing(app: FastifyInstance, endedAt: Date) {
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

  await db.update(tour).set({ status: 'beendet', endedAt }).where(eq(tour.id, tourId));

  return tourId;
}

async function pingCount(tourId: string): Promise<number> {
  const rows = await db.select().from(locationPing).where(eq(locationPing.tourId, tourId));
  return rows.length;
}

describe('Löschfristen für Standortverlauf (ADR 0008)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await app.close();
  });

  it('löscht Pings von Touren, die länger als die Frist beendet sind', async () => {
    const longAgo = new Date(Date.now() - (RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000);
    const tourId = await createEndedTourWithPing(app, longAgo);

    expect(await pingCount(tourId)).toBe(1);

    await deleteExpiredPings();

    expect(await pingCount(tourId)).toBe(0);
  });

  it('lässt Pings von kürzlich beendeten Touren unangetastet', async () => {
    const recently = new Date(Date.now() - 60 * 60 * 1000);
    const tourId = await createEndedTourWithPing(app, recently);

    await deleteExpiredPings();

    expect(await pingCount(tourId)).toBe(1);
  });

  it('lässt Pings von Touren mit aktivem Hold unangetastet, obwohl die Frist abgelaufen ist', async () => {
    const longAgo = new Date(Date.now() - (RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000);
    const tourId = await createEndedTourWithPing(app, longAgo);

    const { email, password } = await createRescueMember();
    const rescueToken = await loginAsRescue(app, email, password);

    await app.inject({
      method: 'POST',
      url: `/rescue/tours/${tourId}/hold`,
      headers: { authorization: `Bearer ${rescueToken}` },
    });

    await deleteExpiredPings();

    expect(await pingCount(tourId)).toBe(1);
  });

  it('löscht Pings wieder, sobald ein Hold aufgehoben wurde', async () => {
    const longAgo = new Date(Date.now() - (RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000);
    const tourId = await createEndedTourWithPing(app, longAgo);

    const { email, password } = await createRescueMember();
    const rescueToken = await loginAsRescue(app, email, password);

    await app.inject({
      method: 'POST',
      url: `/rescue/tours/${tourId}/hold`,
      headers: { authorization: `Bearer ${rescueToken}` },
    });
    await app.inject({
      method: 'DELETE',
      url: `/rescue/tours/${tourId}/hold`,
      headers: { authorization: `Bearer ${rescueToken}` },
    });

    await deleteExpiredPings();

    expect(await pingCount(tourId)).toBe(0);
  });

  it('lehnt Hold-Setzen ohne Rescue-Token ab (403)', async () => {
    const user = await registerUser(app);
    const tourRes = await app.inject({
      method: 'POST',
      url: '/tours',
      headers: { authorization: `Bearer ${user.token}` },
    });
    const { id: tourId } = tourRes.json() as { id: string };

    const res = await app.inject({
      method: 'POST',
      url: `/rescue/tours/${tourId}/hold`,
      headers: { authorization: `Bearer ${user.token}` },
    });

    expect(res.statusCode).toBe(403);
  });

  it('gibt 404 zurück, wenn die zu haltende Tour nicht existiert', async () => {
    const { email, password } = await createRescueMember();
    const rescueToken = await loginAsRescue(app, email, password);

    const res = await app.inject({
      method: 'POST',
      url: '/rescue/tours/00000000-0000-0000-0000-000000000000/hold',
      headers: { authorization: `Bearer ${rescueToken}` },
    });

    expect(res.statusCode).toBe(404);
  });
});
