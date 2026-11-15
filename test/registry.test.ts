import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Registry } from '../src/core/registry.js';
import { makePrototype, tmpDir } from './helpers.js';

const manifest = (id: string) => ({ id, name: id, type: 'static' });

describe('Registry', () => {
  it('add, list, require, remove', async () => {
    const reg = new Registry(tmpDir());
    const dir = makePrototype(manifest('alpha'), { 'index.html': 'x' });
    const added = await reg.add(dir);
    expect(added).toMatchObject({ id: 'alpha', path: path.resolve(dir), error: null });
    expect((await reg.list()).map((p) => p.id)).toEqual(['alpha']);
    expect((await reg.require('alpha')).manifest?.name).toBe('alpha');
    await expect(reg.require('beta')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await reg.remove('alpha');
    expect(await reg.list()).toEqual([]);
  });

  it('menolak folder/ID ganda, folder hilang, dan manifest tidak valid', async () => {
    const reg = new Registry(tmpDir());
    const dir = makePrototype(manifest('alpha'));
    await reg.add(dir);
    await expect(reg.add(dir)).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(reg.add(makePrototype(manifest('alpha')))).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(reg.add(path.join(dir, 'tidak-ada'))).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(reg.add(makePrototype({ id: 'x' }))).rejects.toMatchObject({ code: 'INVALID_MANIFEST' });
  });

  it('menandai invalid tanpa menghapus entri, dan mengikuti perubahan id di manifest', async () => {
    const reg = new Registry(tmpDir());
    const a = makePrototype(manifest('alpha'));
    const b = makePrototype(manifest('beta'));
    await reg.add(a);
    await reg.add(b);

    writeFileSync(path.join(a, 'prototyper.json'), '{rusak');
    rmSync(path.join(b, 'prototyper.json'));
    let list = await reg.list();
    expect(list.map((p) => [p.id, !!p.manifest])).toEqual([
      ['alpha', false],
      ['beta', false],
    ]);
    expect(list[0]?.error).toMatch(/JSON/);

    writeFileSync(path.join(a, 'prototyper.json'), JSON.stringify(manifest('alpha-2')));
    list = await reg.list();
    expect(list[0]?.id).toBe('alpha-2');
    expect((await reg.require('alpha-2')).manifest?.id).toBe('alpha-2');

    writeFileSync(path.join(b, 'prototyper.json'), JSON.stringify(manifest('alpha-2')));
    list = await reg.list();
    expect(list[1]).toMatchObject({ id: 'beta', manifest: null });
    expect(list[1]?.error).toMatch(/sudah dipakai/);
  });
});
