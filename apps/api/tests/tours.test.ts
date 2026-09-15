import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { createRescueMember, loginAsRescue, registerUser } from './helpers.js';

describe('tours: anlegen und beenden', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await app.close();
  });

  it('lehnt POST /tours ohne Token ab (401)', async () => {
    const res = await app.inject({ method: 'POST', url: '/tours' });
    expect(res.statusCode).toBe(401);
  });

  it('legt für einen eingeloggten Nutzer eine aktive Tour an', async () => {
    const { token, userId } = await registerUser(app);

    const res = await app.inject({
      method: 'POST',
      url: '/tours',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ status: 'aktiv', userId, endedAt: null });
  });

  it('lehnt POST /tours mit einem Rescue-Token ab (403, Rollentrennung)', async () => {
    const { email, password } = await createRescueMember();
    const rescueToken = await loginAsRescue(app, email, password);

    const res = await app.inject({
      method: 'POST',
      url: '/tours',
      headers: { authorization: `Bearer ${rescueToken}` },
    });

    expect(res.statusCode).toBe(403);
  });

  it('beendet die eigene aktive Tour', async () => {
    const { token } = await registerUser(app);
    const created = await app.inject({
      method: 'POST',
      url: '/tours',
      headers: { authorization: `Bearer ${token}` },
    });
    const { id } = created.json() as { id: string };

    const res = await app.inject({
      method: 'POST',
      url: `/tours/${id}/end`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'beendet' });
  });

  it('lehnt das erneute Beenden einer bereits beendeten Tour ab (404)', async () => {
    const { token } = await registerUser(app);
    const created = await app.inject({
      method: 'POST',
      url: '/tours',
      headers: { authorization: `Bearer ${token}` },
    });
    const { id } = created.json() as { id: string };

    await app.inject({
      method: 'POST',
      url: `/tours/${id}/end`,
      headers: { authorization: `Bearer ${token}` },
    });
    const secondEnd = await app.inject({
      method: 'POST',
      url: `/tours/${id}/end`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(secondEnd.statusCode).toBe(404);
  });

  it('lehnt das Beenden einer fremden Tour ab (404, Ownership-Check)', async () => {
    const owner = await registerUser(app);
    const otherUser = await registerUser(app);

    const created = await app.inject({
      method: 'POST',
      url: '/tours',
      headers: { authorization: `Bearer ${owner.token}` },
    });
    const { id } = created.json() as { id: string };

    const res = await app.inject({
      method: 'POST',
      url: `/tours/${id}/end`,
      headers: { authorization: `Bearer ${otherUser.token}` },
    });

    expect(res.statusCode).toBe(404);
  });
});
