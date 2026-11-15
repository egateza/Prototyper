import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { inject } from 'postject';
import { BUNDLE_FILE, SEA_MANIFEST_ASSET, type SeaManifest } from '../src/core/appfiles.js';
import { bundleApp, readPackage, ROOT } from './bundle.js';

/**
 * Buat berkas rilis untuk OS + arsitektur mesin ini (Node yang menjalankan skrip ini ikut dikemas).
 *
 *   npm run release                      # semua: exe + portable + npm
 *   npm run release -- exe portable      # pilih target
 *   npm run release -- --out D:\rilis    # folder hasil (default: release/)
 *
 * Hasil (contoh Windows x64, versi 0.1.0):
 *   prototyper-0.1.0-win-x64.exe            biner tunggal (Node SEA), tanpa perlu Node
 *   prototyper-0.1.0-win-x64-portable.zip   node.exe + app + prototyper.cmd, cukup diekstrak
 *   prototyper-0.1.0.tgz                    paket npm (butuh Node ≥ 22.12): npm i -g <file>
 * Linux/macOS: biner tunggal & portable dikemas .tar.gz agar izin eksekusi terjaga.
 */

type Target = 'exe' | 'portable' | 'npm';
const TARGETS: Target[] = ['exe', 'portable', 'npm'];
const SEA_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';

function platformLabel(): string {
  const os = isWin ? 'win' : isMac ? 'macos' : process.platform;
  return `${os}-${process.arch}`;
}

function run(cmd: string, args: string[], opts: { cwd?: string; shell?: boolean } = {}): void {
  console.log(`$ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: opts.cwd ?? ROOT, shell: opts.shell ?? false });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`${cmd} gagal (exit ${r.status})`);
}

/** Arsipkan `folder` (di dalam `parent`) ke `out`: .zip atau .tar.gz sesuai ekstensi. */
function archive(parent: string, folder: string | string[], out: string): void {
  rmSync(out, { force: true });
  const items = Array.isArray(folder) ? folder : [folder];
  if (out.endsWith('.zip')) {
    // (hanya di Windows) bsdtar bawaan Windows 10+ bisa membuat zip; hindari tar GNU dari Git Bash
    const tar = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
    run(tar, ['-a', '-c', '-f', out, ...items], { cwd: parent });
  } else {
    run('tar', ['-czf', out, ...items], { cwd: parent });
  }
}

function listFiles(dir: string, base = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full, base) : [path.relative(base, full).split(path.sep).join('/')];
  });
}

const PORTABLE_README = (name: string, version: string) => `Prototyper ${version} — versi portable (${name})

Isi folder ini:
  node/        runtime Node.js (tidak perlu menginstal Node)
  app/         kode Prototyper
  prototyper${isWin ? '.cmd' : ''}   peluncur

Pakai:
  ${isWin ? 'prototyper.cmd --help' : './prototyper --help'}
  ${isWin ? 'prototyper.cmd serve' : './prototyper serve'}        lalu buka http://localhost:4000

Agar perintah \`prototyper\` bisa dipanggil dari mana saja, tambahkan folder ini ke PATH${
  isWin ? '' : '\n(atau buat symlink: ln -s "$PWD/prototyper" ~/.local/bin/prototyper)'
}.
Data (registry, log) disimpan di ~/.prototyper atau PROTOTYPER_HOME.

Catatan: prototype mode command (template vite-*) tetap butuh Node.js + npm di PATH.
`;

const SH_LAUNCHER = `#!/bin/sh
# Peluncur Prototyper portable: ikuti symlink agar bisa ditaruh di PATH lewat ln -s.
SELF="$0"
while [ -h "$SELF" ]; do
  LINK=$(readlink "$SELF")
  case "$LINK" in
    /*) SELF="$LINK" ;;
    *) SELF="$(dirname "$SELF")/$LINK" ;;
  esac
done
DIR=$(cd "$(dirname "$SELF")" && pwd)
exec "$DIR/node/node" "$DIR/app/${BUNDLE_FILE}" "$@"
`;

const CMD_LAUNCHER = `@echo off\r\n"%~dp0node\\node.exe" "%~dp0app\\${BUNDLE_FILE}" %*\r\n`;

async function buildPortable(appDir: string, version: string, work: string, out: string): Promise<string> {
  const name = `prototyper-${version}-${platformLabel()}-portable`;
  const stage = path.join(work, name);
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(path.join(stage, 'node'), { recursive: true });
  const nodeOut = path.join(stage, 'node', isWin ? 'node.exe' : 'node');
  copyFileSync(process.execPath, nodeOut);
  chmodSync(nodeOut, 0o755);
  copyDir(appDir, path.join(stage, 'app'));
  if (isWin) {
    writeFileSync(path.join(stage, 'prototyper.cmd'), CMD_LAUNCHER);
  } else {
    writeFileSync(path.join(stage, 'prototyper'), SH_LAUNCHER, { mode: 0o755 });
  }
  writeFileSync(path.join(stage, 'README.txt'), PORTABLE_README(name, version).replace(/\n/g, isWin ? '\r\n' : '\n'));
  const file = path.join(out, `${name}${isWin ? '.zip' : '.tar.gz'}`);
  archive(work, name, file);
  return file;
}

function copyDir(from: string, to: string): void {
  for (const rel of listFiles(from)) {
    const target = path.join(to, ...rel.split('/'));
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(path.join(from, ...rel.split('/')), target);
  }
}

async function buildExe(appDir: string, bundle: string, version: string, work: string, out: string): Promise<string> {
  const seaDir = path.join(work, 'sea');
  rmSync(seaDir, { recursive: true, force: true });
  mkdirSync(seaDir, { recursive: true });

  // aset yang tertanam: semua isi folder aplikasi kecuali bundle-nya sendiri
  const files = listFiles(appDir).filter((f) => f !== BUNDLE_FILE).sort();
  const hash = createHash('sha256');
  for (const f of [BUNDLE_FILE, ...files]) hash.update(f).update(readFileSync(path.join(appDir, ...f.split('/'))));
  const manifest: SeaManifest = { id: `${version}-${hash.digest('hex').slice(0, 12)}`, files };
  const manifestFile = path.join(seaDir, SEA_MANIFEST_ASSET);
  writeFileSync(manifestFile, JSON.stringify(manifest));

  const assets: Record<string, string> = { [SEA_MANIFEST_ASSET]: manifestFile };
  for (const f of files) assets[f] = path.join(appDir, ...f.split('/'));
  const blob = path.join(seaDir, 'sea-prep.blob');
  const config = path.join(seaDir, 'sea-config.json');
  writeFileSync(config, JSON.stringify({ main: bundle, output: blob, disableExperimentalSEAWarning: true, useSnapshot: false, useCodeCache: false, assets }, null, 2));
  run(process.execPath, ['--experimental-sea-config', config]);

  const exeName = isWin ? 'prototyper.exe' : 'prototyper';
  const exe = path.join(seaDir, exeName);
  copyFileSync(process.execPath, exe);
  chmodSync(exe, 0o755);
  if (isMac) run('codesign', ['--remove-signature', exe]);
  await inject(exe, 'NODE_SEA_BLOB', readFileSync(blob), {
    sentinelFuse: SEA_FUSE,
    ...(isMac ? { machoSegmentName: 'NODE_SEA' } : {}),
  });
  if (isMac) run('codesign', ['--sign', '-', exe]); // tanda tangan ad-hoc (wajib di Apple Silicon)

  // uji asap: biner harus bisa jalan
  const check = spawnSync(exe, ['--version'], { encoding: 'utf8', env: { ...process.env, PROTOTYPER_HOME: path.join(seaDir, 'home') } });
  if (check.status !== 0 || check.stdout.trim() !== version) {
    throw new Error(`Uji biner gagal: exit ${check.status}, stdout "${check.stdout}", stderr "${check.stderr}"`);
  }

  const base = `prototyper-${version}-${platformLabel()}`;
  if (isWin) {
    const file = path.join(out, `${base}.exe`);
    copyFileSync(exe, file);
    return file;
  }
  const file = path.join(out, `${base}.tar.gz`);
  archive(seaDir, exeName, file);
  return file;
}

/** Jalankan npm; lewat `npm run` pakai npm-cli.js langsung (tanpa shell, aman untuk spasi di path). */
function npm(args: string[]): void {
  const cli = process.env.npm_execpath;
  if (cli && /\.(c|m)?js$/.test(cli)) run(process.execPath, [cli, ...args]);
  else run(isWin ? 'npm.cmd' : 'npm', args, { shell: isWin });
}

function buildNpm(out: string): string {
  rmSync(path.join(ROOT, 'dist'), { recursive: true, force: true });
  npm(['run', 'build']);
  npm(['pack', '--pack-destination', out]);
  const pkg = readPackage();
  return path.join(out, `${pkg.name}-${pkg.version}.tgz`);
}

function sha256(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const outIdx = argv.indexOf('--out');
  const out = path.resolve(outIdx >= 0 && argv[outIdx + 1] ? argv[outIdx + 1]! : path.join(ROOT, 'release'));
  const picked = argv.filter((a, i) => !a.startsWith('--') && !(outIdx >= 0 && i === outIdx + 1));
  for (const t of picked) if (!TARGETS.includes(t as Target)) throw new Error(`Target tidak dikenal: ${t} (pilih: ${TARGETS.join(', ')})`);
  const targets = picked.length ? (picked as Target[]) : TARGETS;

  mkdirSync(out, { recursive: true });
  const work = path.join(ROOT, 'build');
  const produced: string[] = [];

  if (targets.includes('exe') || targets.includes('portable')) {
    const { dir, bundle, version } = await bundleApp(path.join(work, 'app'));
    if (targets.includes('exe')) produced.push(await buildExe(dir, bundle, version, work, out));
    if (targets.includes('portable')) produced.push(await buildPortable(dir, version, work, out));
  }
  if (targets.includes('npm')) produced.push(buildNpm(out));

  console.log('\nBerkas rilis:');
  for (const f of produced) {
    if (!existsSync(f)) throw new Error(`Berkas tidak ditemukan: ${f}`);
    const mb = (statSync(f).size / 1024 / 1024).toFixed(1);
    console.log(`  ${path.basename(f)}  ${mb} MB  sha256:${sha256(f)}`);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
