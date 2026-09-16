import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { buildApp } from '../src/app.js';
import { db } from '../src/db/client.js';
import { tour } from '../src/db/schema.js';
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

describe('share: Link erzeugen und widerrufen', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await app.close();
  });

  it('lehnt POST /tours/:id/share ohne Token ab (401)', async () => {
    const res = await app.inject({ method: 'POST', url: '/tours/00000000-0000-0000-0000-000000000000/share' });
    expect(res.statusCode).toBe(401);
  });

  it('erzeugt einen Share-Link für die eigene Tour', async () => {
    const { token } = await registerUser(app);
    const tourId = await createTour(app, token);

    const res = await app.inject({
      method: 'POST',
      url: `/tours/${tourId}/share`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { shareToken: string | null };
    expect(body.shareToken).toBeTruthy();
  });

  it('rotiert den Token bei erneutem Erzeugen – alter Link wird ungültig', async () => {
    const { token } = await registerUser(app);
    const tourId = await createTour(app, token);

    const first = await app.inject({
      method: 'POST',
      url: `/tours/${tourId}/share`,
      headers: { authorization: `Bearer ${token}` },
    });
    const { shareToken: firstToken } = first.json() as { shareToken: string };

    const second = await app.inject({
      method: 'POST',
      url: `/tours/${tourId}/share`,
      headers: { authorization: `Bearer ${token}` },
    });
    const { shareToken: secondToken } = second.json() as { shareToken: string };

    expect(secondToken).not.toBe(firstToken);

    const oldLookup = await app.inject({ method: 'GET', url: `/share/${firstToken}` });
    expect(oldLookup.statusCode).toBe(404);
  });

  it('lehnt das Erzeugen eines Links für eine fremde Tour ab (404, Ownership-Check)', async () => {
    const owner = await registerUser(app);
    const otherUser = await registerUser(app);
    const tourId = await createTour(app, owner.token);

    const res = await app.inject({
      method: 'POST',
      url: `/tours/${tourId}/share`,
      headers: { authorization: `Bearer ${otherUser.token}` },
    });

    expect(res.statusCode).toBe(404);
  });

  it('widerruft einen Link, sodass er danach nicht mehr abrufbar ist', async () => {
    const { token } = await registerUser(app);
    const tourId = await createTour(app, token);

    const created = await app.inject({
      method: 'POST',
      url: `/tours/${tourId}/share`,
      headers: { authorization: `Bearer ${token}` },
    });
    const { shareToken } = created.json() as { shareToken: string };

    const revoke = await app.inject({
      method: 'DELETE',
      url: `/tours/${tourId}/share`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(revoke.statusCode).toBe(200);
    expect((revoke.json() as { shareToken: string | null }).shareToken).toBeNull();

    const lookup = await app.inject({ method: 'GET', url: `/share/${shareToken}` });
    expect(lookup.statusCode).toBe(404);
  });
});

describe('GET /share/:token', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await app.close();
  });

  it('liefert 404 für einen unbekannten Token', async () => {
    const res = await app.inject({ method: 'GET', url: '/share/does-not-exist' });
    expect(res.statusCode).toBe(404);
  });

  it('liefert Tourdaten inkl. komplettem Tourverlauf für eine aktive Tour, ohne Login', async () => {
    const { token } = await registerUser(app);
    const tourId = await createTour(app, token);

    await app.inject({
      method: 'POST',
      url: `/tours/${tourId}/pings`,
      headers: { authorization: `Bearer ${token}` },
      payload: { recordedAt: new Date().toISOString(), latitude: 47.4923, longitude: 10.2412 },
    });

    const shareRes = await app.inject({
      method: 'POST',
      url: `/tours/${tourId}/share`,
      headers: { authorization: `Bearer ${token}` },
    });
    const { shareToken } = shareRes.json() as { shareToken: string };

    const res = await app.inject({ method: 'GET', url: `/share/${shareToken}` });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { id: string; status: string; track: unknown[] };
    expect(body.id).toBe(tourId);
    expect(body.status).toBe('aktiv');
    expect(body.track).toHaveLength(1);
  });

  it('bleibt bis 24h nach Tourende abrufbar, danach nicht mehr', async () => {
    const { token } = await registerUser(app);
    const tourId = await createTour(app, token);

    const shareRes = await app.inject({
      method: 'POST',
      url: `/tours/${tourId}/share`,
      headers: { authorization: `Bearer ${token}` },
    });
    const { shareToken } = shareRes.json() as { shareToken: string };

    await app.inject({
      method: 'POST',
      url: `/tours/${tourId}/end`,
      headers: { authorization: `Bearer ${token}` },
    });

    const stillValid = await app.inject({ method: 'GET', url: `/share/${shareToken}` });
    expect(stillValid.statusCode).toBe(200);

    // Tourende künstlich auf vor 25h zurückdatieren, um das Ablaufen des Links zu prüfen.
    await db
      .update(tour)
      .set({ endedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
      .where(eq(tour.id, tourId));

    const expired = await app.inject({ method: 'GET', url: `/share/${shareToken}` });
    expect(expired.statusCode).toBe(404);
  });
});
