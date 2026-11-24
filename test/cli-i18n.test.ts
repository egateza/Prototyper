import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { translateCommanderError } from '../src/cli/commander-i18n.js';
import { withLocale } from '../src/core/i18n.js';
import { tmpDir } from './helpers.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const TSX = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const ENTRY = path.join(ROOT, 'src', 'cli', 'index.ts');

/** Jalankan CLI dengan home sementara; `lang` = PROTOTYPER_LANG (undefined = tidak diset). Port daemon tidak terpakai. */
function cli(home: string, args: string[], lang: string | undefined) {
  const env: NodeJS.ProcessEnv = { ...process.env, PROTOTYPER_PORT: '47195' };
  delete env.PROTOTYPER_LANG;
  if (lang !== undefined) env.PROTOTYPER_LANG = lang;
  const r = spawnSync(process.execPath, [TSX, ENTRY, '--home', home, ...args], { cwd: ROOT, encoding: 'utf8', env, timeout: 60_000 });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

describe('CLI i18n', () => {
  it('bantuan, teks bawaan commander, dan pesan error mengikuti PROTOTYPER_LANG', () => {
    const home = tmpDir('prototyper-home-');
    const en = cli(home, ['--help'], 'en');
    expect(en.out).toContain('Usage: prototyper');
    expect(en.out).toContain('Register and run local prototypes');
    expect(en.out).toContain('display help for command');
    expect(en.out).toContain('output the version number');
    expect(en.out).not.toContain('Daftarkan');

    const id = cli(home, ['--help'], 'id');
    expect(id.out).toContain('Penggunaan: prototyper');
    expect(id.out).toContain('Daftarkan dan jalankan prototype lokal');
    expect(id.out).toContain('tampilkan bantuan perintah');

    const sub = cli(home, ['logs', '--help'], 'en');
    expect(sub.out).toContain('number of last lines (default: 200)');
    expect(cli(home, ['logs', '--help'], 'id').out).toContain('jumlah baris terakhir (default: 200)');

    expect(cli(home, ['lsx'], 'en').err).toContain("error: unknown command 'lsx'");
    expect(cli(home, ['lsx'], 'id').err).toContain("error: perintah tidak dikenal 'lsx'");
    expect(cli(home, ['logs', 'x', '--tail', 'abc'], 'en').err).toContain('must be a number 0-1000');

    const bad = cli(home, ['--json', 'init', home, '--type', 'x'], 'en');
    expect(bad.code).toBe(1);
    expect(JSON.parse(bad.out)).toMatchObject({ error: { code: 'BAD_REQUEST', message: '--type must be "static" or "command"' } });
    expect(cli(home, ['list'], 'en').out).toContain('No prototypes yet');
    expect(cli(home, ['list'], 'id').out).toContain('Belum ada prototype');
  }, 120_000);

  it('lang: tampilkan & ganti bahasa tanpa daemon (settings.json)', () => {
    const home = tmpDir('prototyper-home-');
    const set = cli(home, ['lang', 'en'], undefined);
    expect(set.code).toBe(0);
    expect(set.out).toContain('✓ Language setting: en → English (en)');
    expect(JSON.parse(readFileSync(path.join(home, 'settings.json'), 'utf8'))).toEqual({ lang: 'en' });

    // Tanpa PROTOTYPER_LANG, CLI memakai settings.json
    expect(cli(home, ['lang'], undefined).out).toContain('Language: English (en)');
    expect(cli(home, ['--help'], undefined).out).toContain('Usage: prototyper');
    const json = JSON.parse(cli(home, ['--json', 'lang'], undefined).out);
    expect(json).toMatchObject({ setting: 'en', locale: 'en', fromEnv: false, choices: ['auto', 'id', 'en'], daemon: null });

    const id = cli(home, ['lang', 'id'], undefined);
    expect(id.out).toContain('✓ Pengaturan bahasa: id → Bahasa Indonesia (id)');
    expect(cli(home, ['lang'], undefined).out).toContain('Pengaturan: id');

    const unknown = cli(home, ['--json', 'lang', 'fr'], undefined);
    expect(unknown.code).toBe(1);
    expect(JSON.parse(unknown.out)).toMatchObject({ error: { code: 'BAD_REQUEST' } });

    // PROTOTYPER_LANG mengunci: pengaturan tetap disimpan, tetapi bahasa efektif dari env
    const locked = cli(home, ['--json', 'lang', 'auto'], 'en');
    expect(JSON.parse(locked.out)).toMatchObject({ setting: 'en', fromEnv: true, saved: 'auto', via: 'file' });
    expect(JSON.parse(readFileSync(path.join(home, 'settings.json'), 'utf8'))).toEqual({ lang: 'auto' });
    expect(cli(home, ['lang', 'id'], 'en').out).toContain('PROTOTYPER_LANG=en overrides this setting');
  }, 120_000);

  it('translateCommanderError: teks asli commander → bahasa aktif', () => {
    const msg = "error: unknown option '--jsn'\n(Did you mean --json?)\n";
    expect(withLocale('id', () => translateCommanderError(msg))).toBe("error: opsi tidak dikenal '--jsn'\n(Maksud Anda --json?)\n");
    expect(withLocale('en', () => translateCommanderError(msg))).toBe(msg);
    const many = "error: too many arguments for 'info'. Expected 1 argument but got 2: a, b.\n";
    expect(withLocale('en', () => translateCommanderError(many))).toBe(many);
    expect(withLocale('id', () => translateCommanderError(many))).toBe(
      "error: argumen terlalu banyak untuk 'info'. Seharusnya 1 argumen, diberikan 2: a, b.\n",
    );
  });
});
