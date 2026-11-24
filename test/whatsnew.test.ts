import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LOCALES, SOURCE_LOCALE } from '../src/core/i18n.js';
import { compareVersions } from '../src/core/semver.js';
import { WEB_DIR } from '../src/server/app.js';
import { VERSION } from '../src/version.js';

interface Release {
  version: string;
  date: string;
  title?: string;
  items: string[];
  /** Terjemahan per bahasa selain bahasa sumber (Indonesia): judul & item dengan urutan yang sama. */
  translations?: Record<string, { title?: string; items: string[] }>;
}

/** web/whatsnew.json: isi halaman "Yang baru" di Web UI (dibuka juga dari menu tray). */
const data = JSON.parse(readFileSync(path.join(WEB_DIR, 'whatsnew.json'), 'utf8')) as { releasesUrl?: string; releases: Release[] };

describe('web/whatsnew.json', () => {
  it('memuat versi package.json sebagai entri teratas (perbarui saat menaikkan versi)', () => {
    expect(data.releases[0]?.version).toBe(VERSION);
  });

  it('setiap entri lengkap, versi unik & urut menurun', () => {
    expect(data.releases.length).toBeGreaterThan(0);
    for (const r of data.releases) {
      expect(r.version).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/);
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.items.length).toBeGreaterThan(0);
      for (const i of r.items) expect(typeof i === 'string' && i.trim().length > 0).toBe(true);
    }
    for (let i = 1; i < data.releases.length; i++) {
      expect(compareVersions(data.releases[i - 1]!.version, data.releases[i]!.version)).toBeGreaterThan(0);
    }
  });

  it('setiap entri punya terjemahan untuk setiap bahasa selain sumber, dengan jumlah item sama', () => {
    const targets = LOCALES.filter((l) => l !== SOURCE_LOCALE);
    expect(targets.length).toBeGreaterThan(0);
    for (const r of data.releases) {
      for (const l of targets) {
        const tr = r.translations?.[l];
        expect(tr, `${r.version} → ${l}`).toBeTruthy();
        expect(tr!.items.length, `${r.version} → ${l}`).toBe(r.items.length);
        for (const i of tr!.items) expect(typeof i === 'string' && i.trim().length > 0).toBe(true);
        if (r.title) expect(tr!.title?.trim(), `${r.version} → ${l} title`).toBeTruthy();
      }
      for (const l of Object.keys(r.translations ?? {})) expect(targets as string[]).toContain(l);
    }
  });

  it('tautan rilis memakai https', () => {
    if (data.releasesUrl) expect(data.releasesUrl).toMatch(/^https:\/\//);
  });
});
