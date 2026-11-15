import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { allocatePort, probePort } from '../src/core/ports.js';

const hosts = ['127.0.0.1', '0.0.0.0'];
const servers: net.Server[] = [];
const occupy = (port: number) =>
  new Promise<void>((resolve) => {
    const s = net.createServer().listen(port, '127.0.0.1', () => resolve());
    servers.push(s);
  });

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
});

describe('allocatePort', () => {
  const range = { start: 47200, end: 47203 };

  it('memakai port sticky bila bebas', async () => {
    expect(await allocatePort({ range, preferred: 47202, hosts })).toBe(47202);
  });

  it('melewati port yang dipakai dan yang dikecualikan', async () => {
    await occupy(47200);
    expect(await allocatePort({ range, preferred: 47200, exclude: new Set([47201]), hosts })).toBe(47202);
    expect(await probePort(47200)).toBe(true);
    expect(await probePort(47203)).toBe(false);
  });

  it('error CONFLICT bila rentang habis', async () => {
    await occupy(47200);
    await occupy(47201);
    await expect(allocatePort({ range: { start: 47200, end: 47201 }, hosts })).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
