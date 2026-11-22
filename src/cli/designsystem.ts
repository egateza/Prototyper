import type { Command } from 'commander';
import { describeAgentFiles } from '../core/agentfiles.js';
import {
  detachDesignSystem,
  detectLocalCandidates,
  listDesignSystems,
  listLocalDesignSystems,
  setLocalDesignSystem,
  syncDesignSystem,
  useDesignSystem,
  type DsCopyAction,
  type DsFileState,
  type DsLinkResult,
} from '../core/designsystem.js';
import type { Registry } from '../core/registry.js';
import { printJson } from './output.js';

interface Ctx {
  json: boolean;
  registry: Registry;
  config: { home: string };
}

type Act = (fn: (ctx: Ctx, args: Array<string | undefined>, cmd: Command) => Promise<void>) => (...raw: unknown[]) => Promise<void>;

const COPY_LABEL: Record<DsCopyAction, string> = {
  created: 'disalin',
  updated: 'diperbarui',
  unchanged: 'sudah sama',
  'source-missing': 'tidak ada di desain sistem',
};

const STATE_LABEL: Record<DsFileState, string> = {
  ok: 'terbaru',
  outdated: 'berbeda (perlu sync)',
  missing: 'belum disalin (perlu sync)',
  'source-missing': 'tidak ada di desain sistem',
};

export function describeLink(l: DsLinkResult): string {
  if (l.action === 'added') return `Tautan CSS ditambahkan ke ${l.file}`;
  if (l.action === 'present') return `${l.file} sudah memuat CSS desain sistem`;
  return l.note ? `Tautan CSS tidak ditambahkan: ${l.note}` : 'Tautan CSS tidak ditambahkan';
}

/** Perintah `prototyper ds …`: desain sistem yang dipakai bersama beberapa prototype. */
export function registerDesignSystemCommands(program: Command, act: Act): void {
  const ds = program
    .command('ds')
    .alias('design-system')
    .description('desain sistem: token & komponen yang dipakai bersama beberapa prototype')
    .addHelpText(
      'after',
      [
        '',
        'Alur:',
        '  prototyper new brand-ds -t design-system        # buat desain sistem (katalog di index.html)',
        '  prototyper ds use kasir-grosir brand-ds          # pasang ke prototype yang sudah ada',
        '  prototyper new laporan --design-system brand-ds  # atau langsung saat membuat prototype',
        '  prototyper ds sync brand-ds                      # sebarkan perubahan ke semua pemakai',
        '  prototyper ds local kasir src/styles/tokens.css  # prototype punya desain sistem sendiri: catat lokasinya',
      ].join('\n'),
    );

  ds.command('list')
    .alias('ls')
    .description('daftar desain sistem beserta prototype pemakainya')
    .action(
      act(async (ctx) => {
        const list = await listDesignSystems(ctx.registry);
        const locals = await listLocalDesignSystems(ctx.registry);
        if (ctx.json) return printJson({ designSystems: list, locals });
        if (!list.length && !locals.length) {
          console.log('Belum ada desain sistem. Buat dengan: prototyper new <id> -t design-system');
          return;
        }
        if (locals.length) {
          console.log('Desain sistem sendiri (di folder prototype):');
          for (const l of locals) {
            console.log(`  · ${l.id}  ${l.paths.map((x) => `${x.path}${x.exists ? '' : ' (tidak ditemukan)'}`).join(', ')}`);
          }
          if (list.length) console.log('');
        }
        for (const d of list) {
          console.log(`${d.id}  ${d.name}  (${d.path})`);
          console.log(`  File: ${d.files.join(', ')}${d.missing.length ? `  — tidak ditemukan: ${d.missing.join(', ')}` : ''}`);
          if (!d.consumers.length) console.log('  Belum dipakai prototype mana pun.');
          for (const c of d.consumers) console.log(`  · ${c.id}  ${c.dir}/  ${c.outdated ? 'perlu sync' : 'terbaru'}`);
        }
      }),
    );

  ds.command('use <id> <designSystem>')
    .description('pasang desain sistem ke prototype: salin file, catat di prototyper.json, muat CSS-nya')
    .option('--dir <folder>', 'folder salinan di prototype (default design-system)')
    .option('--no-link', 'jangan menyisipkan <link>/import CSS ke halaman atau entry JS')
    .action(
      act(async (ctx, [id, dsId], cmd) => {
        const o = cmd.opts<{ dir?: string; link: boolean }>();
        const r = await useDesignSystem(ctx.registry, id ?? '', dsId ?? '', {
          home: ctx.config.home,
          link: o.link,
          ...(o.dir ? { dir: o.dir } : {}),
        });
        if (ctx.json) return printJson(r);
        console.log(`✓ "${r.id}" memakai desain sistem "${r.designSystem}" (folder ${r.dir}/)`);
        for (const f of r.files) console.log(`  ${f.file}: ${COPY_LABEL[f.action]}`);
        console.log(`  ${describeLink(r.link)}`);
        for (const line of describeAgentFiles(r.agentFiles)) console.log(`  Petunjuk agent: ${line}`);
      }),
    );

  ds.command('sync [id]')
    .description('salin ulang file desain sistem: id prototype = prototype itu, id desain sistem = semua pemakainya, kosong = semua')
    .action(
      act(async (ctx, [id]) => {
        const results = await syncDesignSystem(ctx.registry, id);
        if (ctx.json) return printJson(results);
        if (!results.length) console.log('Tidak ada prototype yang memakai desain sistem ini.');
        for (const r of results) {
          if (r.error) {
            console.log(`✗ ${r.id}: ${r.error}`);
            continue;
          }
          const changed = r.files.filter((f) => f.action === 'created' || f.action === 'updated');
          console.log(`${changed.length ? '✓' : '·'} ${r.id} ← ${r.designSystem}: ${changed.length ? changed.map((f) => f.file).join(', ') : 'sudah terbaru'}`);
          for (const f of r.files.filter((x) => x.action === 'source-missing')) console.log(`  ${f.file}: ${COPY_LABEL[f.action]}`);
        }
        if (results.some((r) => r.error)) process.exitCode = 1;
      }),
    );

  ds.command('status <id>')
    .description('status salinan desain sistem di satu prototype')
    .action(
      act(async (ctx, [id]) => {
        const list = await listDesignSystems(ctx.registry);
        const c = list.flatMap((d) => d.consumers).find((x) => x.id === id);
        const own = list.find((d) => d.id === id);
        const local = (await listLocalDesignSystems(ctx.registry)).find((x) => x.id === id);
        if (ctx.json) return printJson(c ?? own ?? local ?? null);
        if (local) {
          console.log(`"${local.id}" memakai desain sistem sendiri:`);
          for (const x of local.paths) console.log(`  ${x.path}: ${x.exists ? (x.kind === 'dir' ? 'folder' : 'file') : 'tidak ditemukan'}`);
          return;
        }
        if (own) {
          console.log(`"${own.id}" adalah desain sistem; dipakai: ${own.consumers.map((x) => x.id).join(', ') || '(belum ada)'}`);
          return;
        }
        if (!c) {
          // Pemakai desain sistem yang tidak terdaftar tidak muncul di daftar di atas.
          const p = await ctx.registry.require(id ?? '');
          const use = p.manifest?.designSystem?.use;
          console.log(use ? `"${p.id}" memakai "${use}", tetapi desain sistem itu tidak terdaftar.` : `"${p.id}" tidak memakai desain sistem.`);
          return;
        }
        console.log(`"${c.id}" memakai "${c.use}" (folder ${c.dir}/): ${c.outdated ? 'perlu sync' : 'terbaru'}`);
        for (const f of c.files) console.log(`  ${f.file}: ${STATE_LABEL[f.state]}`);
      }),
    );

  ds.command('local <id> [paths...]')
    .description('catat lokasi desain sistem milik prototype sendiri (file/folder token & komponen); tanpa path = tampilkan tebakan lokasi')
    .action(
      act(async (ctx, [id], cmd) => {
        const paths = cmd.args.slice(1);
        if (!paths.length) {
          const p = await ctx.registry.require(id ?? '');
          const candidates = await detectLocalCandidates(p.path);
          if (ctx.json) return printJson({ id: p.id, candidates, current: p.manifest?.designSystem?.local ?? null });
          if (p.manifest?.designSystem?.local) console.log(`Tercatat sekarang: ${p.manifest.designSystem.local.join(', ')}`);
          if (!candidates.length) console.log('Tidak ada lokasi yang terdeteksi. Isi manual: prototyper ds local <id> <path> [path…]');
          else {
            console.log('Kemungkinan lokasi desain sistem:');
            for (const c of candidates) console.log(`  ${c}`);
            console.log(`Catat dengan: prototyper ds local ${p.id} <path> [path…]`);
          }
          return;
        }
        const r = await setLocalDesignSystem(ctx.registry, id ?? '', paths, { home: ctx.config.home });
        if (ctx.json) return printJson(r);
        console.log(`✓ "${r.id}" memakai desain sistem sendiri: ${r.local.join(', ')}`);
        if (r.replaced) console.log(`  Menggantikan desain sistem "${r.replaced}" (folder salinannya dibiarkan).`);
        if (r.missing.length) console.log(`  Belum ada: ${r.missing.join(', ')} (tetap dicatat)`);
        for (const line of describeAgentFiles(r.agentFiles)) console.log(`  Petunjuk agent: ${line}`);
      }),
    );

  ds.command('detach <id>')
    .description('lepas desain sistem dari prototype (hapus dari prototyper.json; tidak ada file yang dihapus)')
    .action(
      act(async (ctx, [id]) => {
        const r = await detachDesignSystem(ctx.registry, id ?? '', { home: ctx.config.home });
        if (ctx.json) return printJson(r);
        if (r.local) console.log(`✓ Lokasi desain sistem sendiri "${r.id}" tidak lagi dicatat (${r.local.join(', ')} tidak disentuh).`);
        else console.log(`✓ "${r.id}" tidak lagi memakai "${r.designSystem}". Folder ${r.dir}/ dan tautan CSS-nya dibiarkan; hapus manual bila tidak dipakai.`);
      }),
    );
}
