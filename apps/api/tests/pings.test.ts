import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { buildApp } from '../src/app.js';
import { db } from '../src/db/client.js';
import { registerUser } from './helpers.js';

async function createTour(app: FastifyInstance, token: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/tours',
    headers: { authorization: `Bearer ${token}` },
  });
  const { id } = res.json() as { id: string };
  return id;
}

describe('tours/:id/pings', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await app.close();
  });

  it('speichert einen Ping und die Koordinaten kommen korrekt in PostGIS an', async () => {
    const { token } = await registerUser(app);
    const tourId = await createTour(app, token);

    const res = await app.inject({
      method: 'POST',
      url: `/tours/${tourId}/pings`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        recordedAt: new Date().toISOString(),
        latitude: 47.4923,
        longitude: 10.2412,
        accuracyMeters: 12.5,
      },
    });

    expect(res.statusCode).toBe(201);

    const result = await db.execute<{ lon: number; lat: number }>(sql`
      SELECT ST_X(location::geometry) AS lon, ST_Y(location::geometry) AS lat
      FROM location_ping WHERE tour_id = ${tourId}
    `);
    expect(result.rows[0]).toMatchObject({ lon: 10.2412, lat: 47.4923 });
  });

  it('lehnt ungültige Koordinaten ab (400)', async () => {
    const { token } = await registerUser(app);
    const tourId = await createTour(app, token);

    const res = await app.inject({
      method: 'POST',
      url: `/tours/${tourId}/pings`,
      headers: { authorization: `Bearer ${token}` },
      payload: { recordedAt: new Date().toISOString(), latitude: 999, longitude: 10 },
    });

    expect(res.statusCode).toBe(400);
  });

  it('lehnt Pings ohne Token ab (401)', async () => {
    const { token } = await registerUser(app);
    const tourId = await createTour(app, token);

    const res = await app.inject({
      method: 'POST',
      url: `/tours/${tourId}/pings`,
      payload: { recordedAt: new Date().toISOString(), latitude: 47, longitude: 10 },
    });

    expect(res.statusCode).toBe(401);
  });

  it('lehnt Pings auf eine unbekannte Tour ab (404)', async () => {
    const { token } = await registerUser(app);

    const res = await app.inject({
      method: 'POST',
      url: '/tours/00000000-0000-0000-0000-000000000000/pings',
      headers: { authorization: `Bearer ${token}` },
      payload: { recordedAt: new Date().toISOString(), latitude: 47, longitude: 10 },
    });

    expect(res.statusCode).toBe(404);
  });

  it('lehnt Pings auf eine bereits beendete Tour ab (404)', async () => {
    const { token } = await registerUser(app);
    const tourId = await createTour(app, token);
    await app.inject({
      method: 'POST',
      url: `/tours/${tourId}/end`,
      headers: { authorization: `Bearer ${token}` },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/tours/${tourId}/pings`,
      headers: { authorization: `Bearer ${token}` },
      payload: { recordedAt: new Date().toISOString(), latitude: 47, longitude: 10 },
    });

    expect(res.statusCode).toBe(404);
  });

  it('lehnt Pings auf eine fremde Tour ab (404, Ownership-Check)', async () => {
    const owner = await registerUser(app);
    const otherUser = await registerUser(app);
    const tourId = await createTour(app, owner.token);

    const res = await app.inject({
      method: 'POST',
      url: `/tours/${tourId}/pings`,
      headers: { authorization: `Bearer ${otherUser.token}` },
      payload: { recordedAt: new Date().toISOString(), latitude: 47, longitude: 10 },
    });

    expect(res.statusCode).toBe(404);
  });
});
