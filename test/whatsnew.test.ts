import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareVersions } from '../src/core/semver.js';
import { WEB_DIR } from '../src/server/app.js';
import { VERSION } from '../src/version.js';

interface Release {
  version: string;
  date: string;
  title?: string;
  items: string[];
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

  it('tautan rilis memakai https', () => {
    if (data.releasesUrl) expect(data.releasesUrl).toMatch(/^https:\/\//);
  });
});
