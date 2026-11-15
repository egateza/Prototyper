import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/server/app.js';
import { VERSION } from '../src/version.js';
import { testConfig } from './helpers.js';

describe('HTTP API dasar', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    ({ app } = await buildApp({ config: testConfig() }));
  });
  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health mengembalikan status ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', version: VERSION, lan: false });
  });

  it('route tak dikenal mengembalikan format error seragam', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/tidak-ada' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'NOT_FOUND', message: expect.any(String) } });
  });

  it('POST dari non-loopback ditolak, GET tetap boleh', async () => {
    const post = await app.inject({ method: 'POST', url: '/api/prototypes', remoteAddress: '192.168.1.20', payload: {} });
    expect(post.statusCode).toBe(403);
    expect(post.json().error.code).toBe('FORBIDDEN');
    const get = await app.inject({ method: 'GET', url: '/api/prototypes', remoteAddress: '192.168.1.20' });
    expect(get.statusCode).toBe(200);
  });

  it('menyajikan Web UI di /', async () => {
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<title>Prototyper</title>');
    expect(res.body).toContain('id="side-list"'); // layout Workspace
    for (const asset of ['/app.js', '/style.css']) {
      expect((await app.inject({ method: 'GET', url: asset })).statusCode).toBe(200);
    }
  });

  it('shutdown tanpa handler = 501', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/shutdown' });
    expect(res.statusCode).toBe(501);
  });
});
