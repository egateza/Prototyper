import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { inject } from 'postject';
import { rcedit } from 'rcedit';
import { APP_INFO_FILE, BROKEN_MARK, BUNDLE_FILE, RUNTIME, SEA_MANIFEST_ASSET, writeCurrent, type AppInfo, type SeaManifest } from '../src/core/apphost.js';
import { packFiles } from '../src/core/apppack.js';
import { appPackName, msiName } from '../src/core/update.js';
import { bundleApp, readPackage, ROOT } from './bundle.js';
import { buildWxs, installerJson, MSI_EXTENSIONS, WIX_VERSION } from './msi.js';
import { windowsFileVersion } from './winres.js';

/**
 * Buat berkas rilis untuk OS + arsitektur mesin ini (Node yang menjalankan skrip ini ikut dikemas).
 *
 *   npm run release                      # semua: exe + portable + npm + app (+ msi di Windows bila WiX ada)
 *   npm run release -- exe portable      # pilih target
 *   npm run release -- --out D:\rilis    # folder hasil (default: release/)
 *
 * Hasil (contoh Windows x64, versi 0.1.0):
 *   prototyper-0.1.0-win-x64.exe            biner tunggal (Node SEA), tanpa perlu Node
 *   prototyper-0.1.0-win-x64.msi            installer per-user berisi exe di atas (butuh WiX: docs/RELEASE.md)
 *   prototyper-0.1.0-app-r1.tar.gz          paket aplikasi untuk pembaruan kecil dari tray (lintas OS)
 *   prototyper-0.1.0-win-x64-portable.zip   node.exe + app + prototyper.cmd, cukup diekstrak
 *   prototyper-0.1.0.tgz                    paket npm (butuh Node ≥ 22.12): npm i -g <file>
 * Linux/macOS: biner tunggal & portable dikemas .tar.gz agar izin eksekusi terjaga.
 */

type Target = 'exe' | 'portable' | 'npm' | 'app' | 'msi';
const TARGETS: Target[] = ['exe', 'portable', 'npm', 'app', 'msi'];
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

/** Ganti icon dan info file node.exe (Properties → Details) dengan milik Prototyper. */
async function brandWindowsExe(exe: string, version: string): Promise<void> {
  const pkg = readPackage();
  await rcedit(exe, {
    icon: path.join(ROOT, 'assets', 'icon.ico'),
    'file-version': windowsFileVersion(version),
    'product-version': version,
    'version-string': {
      ProductName: 'Prototyper',
      FileDescription: 'Prototyper',
      InternalFilename: 'prototyper',
      OriginalFilename: 'prototyper.exe',
      CompanyName: 'Prototyper',
      Comments: `${pkg.description ?? ''} Berjalan di atas Node.js ${process.version}.`.trim(),
    },
  });
}

/**
 * Beri aplikasi identitas (`app.json`): id = versi + hash isi folder. Dipakai aplikasi bawaan exe
 * dan paket aplikasi agar keduanya bernama folder yang sama di app store.
 */
function stampApp(appDir: string, version: string): AppInfo {
  rmSync(path.join(appDir, APP_INFO_FILE), { force: true });
  const hash = createHash('sha256');
  for (const f of listFiles(appDir).sort()) hash.update(f).update(readFileSync(path.join(appDir, ...f.split('/'))));
  const info: AppInfo = { id: `${version}-${hash.digest('hex').slice(0, 12)}`, version, runtime: RUNTIME };
  writeFileSync(path.join(appDir, APP_INFO_FILE), `${JSON.stringify(info, null, 2)}\n`);
  return info;
}

/** Bootstrap exe (src/boot/sea.ts) → satu skrip CommonJS untuk main SEA. */
async function buildBoot(outFile: string): Promise<string> {
  await build({
    entryPoints: [path.join(ROOT, 'src', 'boot', 'sea.ts')],
    outfile: outFile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    legalComments: 'none',
    logLevel: 'warning',
  });
  return outFile;
}

function runVersion(exe: string, home: string): string {
  const r = spawnSync(exe, ['--version'], { encoding: 'utf8', env: { ...process.env, PROTOTYPER_HOME: home } });
  if (r.status !== 0) throw new Error(`Uji biner gagal: exit ${r.status}, stderr "${r.stderr}"`);
  return r.stdout.trim();
}

/**
 * Uji asap biner: aplikasi bawaan jalan; aplikasi di app store yang lebih baru dipilih; aplikasi
 * yang gagal dimuat ditandai .broken lalu kembali ke aplikasi bawaan.
 */
function smokeTestExe(exe: string, appDir: string, info: AppInfo, seaDir: string): void {
  const v = runVersion(exe, path.join(seaDir, 'home'));
  if (v !== info.version) throw new Error(`Uji biner gagal: versi "${v}", seharusnya ${info.version}`);

  const home = path.join(seaDir, 'home-update');
  const root = path.join(home, 'app');
  const fake: AppInfo = { id: '999.0.0-smoke', version: '999.0.0', runtime: RUNTIME };
  const fakeDir = path.join(root, fake.id);
  copyDir(appDir, fakeDir);
  const pkgFile = path.join(fakeDir, 'package.json');
  writeFileSync(pkgFile, JSON.stringify({ ...JSON.parse(readFileSync(pkgFile, 'utf8')), version: fake.version }));
  writeCurrent(root, { ...fake, previous: null });
  const updated = runVersion(exe, home);
  if (updated !== fake.version) throw new Error(`Uji app store gagal: versi "${updated}", seharusnya ${fake.version}`);

  writeFileSync(path.join(fakeDir, BUNDLE_FILE), 'throw new Error("uji aplikasi rusak");');
  const fallback = runVersion(exe, home);
  if (fallback !== info.version || !existsSync(path.join(fakeDir, BROKEN_MARK))) {
    throw new Error(`Uji fallback gagal: versi "${fallback}", seharusnya ${info.version} dengan penanda ${BROKEN_MARK}`);
  }
}

async function buildExe(appDir: string, info: AppInfo, work: string, out: string): Promise<{ file: string; exe: string }> {
  const { version } = info;
  const seaDir = path.join(work, 'sea');
  rmSync(seaDir, { recursive: true, force: true });
  mkdirSync(seaDir, { recursive: true });

  // main = bootstrap kecil; seluruh aplikasi (termasuk bundle) tertanam sebagai aset
  const boot = await buildBoot(path.join(seaDir, 'boot.cjs'));
  const files = listFiles(appDir).sort();
  const manifest: SeaManifest = { ...info, files };
  const manifestFile = path.join(seaDir, SEA_MANIFEST_ASSET);
  writeFileSync(manifestFile, JSON.stringify(manifest));

  const assets: Record<string, string> = { [SEA_MANIFEST_ASSET]: manifestFile };
  for (const f of files) assets[f] = path.join(appDir, ...f.split('/'));
  const blob = path.join(seaDir, 'sea-prep.blob');
  const config = path.join(seaDir, 'sea-config.json');
  writeFileSync(config, JSON.stringify({ main: boot, output: blob, disableExperimentalSEAWarning: true, useSnapshot: false, useCodeCache: false, assets }, null, 2));
  run(process.execPath, ['--experimental-sea-config', config]);

  const exeName = isWin ? 'prototyper.exe' : 'prototyper';
  const exe = path.join(seaDir, exeName);
  copyFileSync(process.execPath, exe);
  chmodSync(exe, 0o755);
  if (isWin) await brandWindowsExe(exe, version); // sebelum inject: mengubah resource setelahnya berisiko merusak blob
  if (isMac) run('codesign', ['--remove-signature', exe]);
  await inject(exe, 'NODE_SEA_BLOB', readFileSync(blob), {
    sentinelFuse: SEA_FUSE,
    ...(isMac ? { machoSegmentName: 'NODE_SEA' } : {}),
  });
  if (isMac) run('codesign', ['--sign', '-', exe]); // tanda tangan ad-hoc (wajib di Apple Silicon)

  smokeTestExe(exe, appDir, info, seaDir);

  const base = `prototyper-${version}-${platformLabel()}`;
  if (isWin) {
    const file = path.join(out, `${base}.exe`);
    copyFileSync(exe, file);
    return { file, exe };
  }
  const file = path.join(out, `${base}.tar.gz`);
  archive(seaDir, exeName, file);
  return { file, exe };
}

/** Paket aplikasi untuk pembaruan dari tray: isi folder aplikasi (termasuk app.json) dalam tar.gz. */
function buildAppPack(appDir: string, info: AppInfo, out: string): string {
  const files = new Map<string, Buffer>();
  for (const f of listFiles(appDir)) files.set(f, readFileSync(path.join(appDir, ...f.split('/'))));
  const file = path.join(out, appPackName(info.version, info.runtime));
  writeFileSync(file, packFiles(files));
  return file;
}

/** WiX Toolset v4+ (`wix`, dotnet tool) di PATH, atau null. */
function findWix(): string | null {
  const r = spawnSync('wix', ['--version'], { encoding: 'utf8' });
  return r.status === 0 ? 'wix' : null;
}

function buildMsi(exe: string, version: string, work: string, out: string): string {
  const dir = path.join(work, 'msi');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const installer = path.join(dir, 'installer.json');
  writeFileSync(installer, installerJson(version));
  const wxs = path.join(dir, 'prototyper.wxs');
  writeFileSync(wxs, buildWxs({ version, exe, installerJson: installer, icon: path.join(ROOT, 'assets', 'icon.ico'), url: 'https://github.com/egateza/Prototyper' }));
  const file = path.join(out, msiName(version, process.arch));
  rmSync(file, { force: true });
  for (const ext of MSI_EXTENSIONS) run('wix', ['extension', 'add', '-g', `${ext}/${WIX_VERSION}`]); // aman diulang
  run('wix', ['build', '-arch', process.arch, ...MSI_EXTENSIONS.flatMap((e) => ['-ext', e]), '-o', file, wxs]);
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
  const targets = picked.length ? (picked as Target[]) : TARGETS.filter((t) => t !== 'msi' || (isWin && findWix()));
  if (!picked.length && isWin && !targets.includes('msi')) console.warn('Lewati msi: WiX Toolset tidak ditemukan (lihat docs/RELEASE.md).');
  if (targets.includes('msi')) {
    if (!isWin) throw new Error('MSI hanya bisa dibangun di Windows');
    if (!findWix()) throw new Error(`WiX Toolset tidak ditemukan. Pasang: dotnet tool install --global wix --version ${WIX_VERSION}`);
  }

  mkdirSync(out, { recursive: true });
  const work = path.join(ROOT, 'build');
  const produced: string[] = [];

  if (targets.some((t) => t === 'exe' || t === 'portable' || t === 'app' || t === 'msi')) {
    const { dir, version } = await bundleApp(path.join(work, 'app'));
    const info = stampApp(dir, version);
    if (targets.includes('exe') || targets.includes('msi')) {
      const { file, exe } = await buildExe(dir, info, work, out);
      if (targets.includes('exe')) produced.push(file);
      if (targets.includes('msi')) produced.push(buildMsi(exe, version, work, out));
    }
    if (targets.includes('app')) produced.push(buildAppPack(dir, info, out));
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
