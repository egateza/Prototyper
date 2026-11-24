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
import { defineMessages } from '../core/i18n.js';

interface Ctx {
  json: boolean;
  registry: Registry;
  config: { home: string };
}

type Act = (fn: (ctx: Ctx, args: Array<string | undefined>, cmd: Command) => Promise<void>) => (...raw: unknown[]) => Promise<void>;

const t = defineMessages({
  id: {
    copyCreated: 'disalin',
    copyUpdated: 'diperbarui',
    copyUnchanged: 'sudah sama',
    sourceMissing: 'tidak ada di desain sistem',
    stateOk: 'terbaru',
    stateOutdated: 'berbeda (perlu sync)',
    stateMissing: 'belum disalin (perlu sync)',
    linkAdded: 'Tautan CSS ditambahkan ke {file}',
    linkPresent: '{file} sudah memuat CSS desain sistem',
    linkSkippedNote: 'Tautan CSS tidak ditambahkan: {note}',
    linkSkipped: 'Tautan CSS tidak ditambahkan',
    agentInstructions: '  Petunjuk agent: {line}',
    dsDesc: 'desain sistem: token & komponen yang dipakai bersama beberapa prototype',
    dsHelp: [
      '',
      'Alur:',
      '  prototyper new brand-ds -t design-system        # buat desain sistem (katalog di index.html)',
      '  prototyper ds use kasir-grosir brand-ds          # pasang ke prototype yang sudah ada',
      '  prototyper new laporan --design-system brand-ds  # atau langsung saat membuat prototype',
      '  prototyper ds sync brand-ds                      # sebarkan perubahan ke semua pemakai',
      '  prototyper ds local kasir src/styles/tokens.css  # prototype punya desain sistem sendiri: catat lokasinya',
    ].join('\n'),
    listDesc: 'daftar desain sistem beserta prototype pemakainya',
    noneYet: 'Belum ada desain sistem. Buat dengan: prototyper new <id> -t design-system',
    localHeader: 'Desain sistem sendiri (di folder prototype):',
    notFoundSuffix: ' (tidak ditemukan)',
    files: '  File: {files}',
    filesMissing: '  — tidak ditemukan: {files}',
    notUsedYet: '  Belum dipakai prototype mana pun.',
    needsSync: 'perlu sync',
    upToDate: 'terbaru',
    useDesc: 'pasang desain sistem ke prototype: salin file, catat di prototyper.json, muat CSS-nya',
    optDir: 'folder salinan di prototype (default design-system)',
    optNoLink: 'jangan menyisipkan <link>/import CSS ke halaman atau entry JS',
    used: '✓ "{id}" memakai desain sistem "{ds}" (folder {dir}/)',
    syncDesc: 'salin ulang file desain sistem: id prototype = prototype itu, id desain sistem = semua pemakainya, kosong = semua',
    noConsumers: 'Tidak ada prototype yang memakai desain sistem ini.',
    alreadyUpToDate: 'sudah terbaru',
    statusDesc: 'status salinan desain sistem di satu prototype',
    usesOwn: '"{id}" memakai desain sistem sendiri:',
    kindFolder: 'folder',
    kindFile: 'file',
    notFound: 'tidak ditemukan',
    isDesignSystem: '"{id}" adalah desain sistem; dipakai: {consumers}',
    noneParen: '(belum ada)',
    usesUnregistered: '"{id}" memakai "{ds}", tetapi desain sistem itu tidak terdaftar.',
    noDesignSystem: '"{id}" tidak memakai desain sistem.',
    usesStatus: '"{id}" memakai "{ds}" (folder {dir}/): {state}',
    localDesc: 'catat lokasi desain sistem milik prototype sendiri (file/folder token & komponen); tanpa path = tampilkan tebakan lokasi',
    currentlyRecorded: 'Tercatat sekarang: {paths}',
    noCandidates: 'Tidak ada lokasi yang terdeteksi. Isi manual: prototyper ds local <id> <path> [path…]',
    candidatesHeader: 'Kemungkinan lokasi desain sistem:',
    recordWith: 'Catat dengan: prototyper ds local {id} <path> [path…]',
    localSet: '✓ "{id}" memakai desain sistem sendiri: {paths}',
    replaces: '  Menggantikan desain sistem "{ds}" (folder salinannya dibiarkan).',
    notYetExists: '  Belum ada: {paths} (tetap dicatat)',
    detachDesc: 'lepas desain sistem dari prototype (hapus dari prototyper.json; tidak ada file yang dihapus)',
    detachedLocal: '✓ Lokasi desain sistem sendiri "{id}" tidak lagi dicatat ({paths} tidak disentuh).',
    detached: '✓ "{id}" tidak lagi memakai "{ds}". Folder {dir}/ dan tautan CSS-nya dibiarkan; hapus manual bila tidak dipakai.',
  },
  en: {
    copyCreated: 'copied',
    copyUpdated: 'updated',
    copyUnchanged: 'already the same',
    sourceMissing: 'not in the design system',
    stateOk: 'up to date',
    stateOutdated: 'different (needs sync)',
    stateMissing: 'not copied yet (needs sync)',
    linkAdded: 'CSS link added to {file}',
    linkPresent: '{file} already loads the design system CSS',
    linkSkippedNote: 'CSS link not added: {note}',
    linkSkipped: 'CSS link not added',
    agentInstructions: '  Agent instructions: {line}',
    dsDesc: 'design systems: tokens & components shared by several prototypes',
    dsHelp: [
      '',
      'Workflow:',
      '  prototyper new brand-ds -t design-system        # create a design system (catalog in index.html)',
      '  prototyper ds use checkout brand-ds              # use it in an existing prototype',
      '  prototyper new report --design-system brand-ds   # or right when creating a prototype',
      '  prototyper ds sync brand-ds                      # push changes to all prototypes using it',
      '  prototyper ds local shop src/styles/tokens.css   # prototype has its own design system: record its location',
    ].join('\n'),
    listDesc: 'list design systems and the prototypes using them',
    noneYet: 'No design systems yet. Create one with: prototyper new <id> -t design-system',
    localHeader: 'Own design systems (in the prototype folder):',
    notFoundSuffix: ' (not found)',
    files: '  Files: {files}',
    filesMissing: '  — not found: {files}',
    notUsedYet: '  Not used by any prototype yet.',
    needsSync: 'needs sync',
    upToDate: 'up to date',
    useDesc: 'use a design system in a prototype: copy the files, record it in prototyper.json, load its CSS',
    optDir: 'folder for the copy in the prototype (default design-system)',
    optNoLink: 'do not insert a CSS <link>/import into the page or JS entry',
    used: '✓ "{id}" uses design system "{ds}" (folder {dir}/)',
    syncDesc: 'copy the design system files again: prototype id = that prototype, design system id = all prototypes using it, empty = all',
    noConsumers: 'No prototypes use this design system.',
    alreadyUpToDate: 'already up to date',
    statusDesc: 'status of the design system copy in one prototype',
    usesOwn: '"{id}" uses its own design system:',
    kindFolder: 'folder',
    kindFile: 'file',
    notFound: 'not found',
    isDesignSystem: '"{id}" is a design system; used by: {consumers}',
    noneParen: '(none yet)',
    usesUnregistered: '"{id}" uses "{ds}", but that design system is not registered.',
    noDesignSystem: '"{id}" does not use a design system.',
    usesStatus: '"{id}" uses "{ds}" (folder {dir}/): {state}',
    localDesc: "record the location of the prototype's own design system (token & component files/folders); without paths = show likely locations",
    currentlyRecorded: 'Currently recorded: {paths}',
    noCandidates: 'No locations detected. Enter them manually: prototyper ds local <id> <path> [path…]',
    candidatesHeader: 'Likely design system locations:',
    recordWith: 'Record with: prototyper ds local {id} <path> [path…]',
    localSet: '✓ "{id}" uses its own design system: {paths}',
    replaces: '  Replaces design system "{ds}" (its copy folder was left in place).',
    notYetExists: '  Not there yet: {paths} (recorded anyway)',
    detachDesc: 'detach the design system from a prototype (removes it from prototyper.json; no files are deleted)',
    detachedLocal: '✓ The own design system location of "{id}" is no longer recorded ({paths} not touched).',
    detached: '✓ "{id}" no longer uses "{ds}". Folder {dir}/ and its CSS link were left in place; delete them manually if unused.',
  },
});

const copyLabel = (a: DsCopyAction): string =>
  a === 'created' ? t('copyCreated') : a === 'updated' ? t('copyUpdated') : a === 'unchanged' ? t('copyUnchanged') : t('sourceMissing');

const stateLabel = (s: DsFileState): string =>
  s === 'ok' ? t('stateOk') : s === 'outdated' ? t('stateOutdated') : s === 'missing' ? t('stateMissing') : t('sourceMissing');

export function describeLink(l: DsLinkResult): string {
  if (l.action === 'added') return t('linkAdded', { file: l.file });
  if (l.action === 'present') return t('linkPresent', { file: l.file });
  return l.note ? t('linkSkippedNote', { note: l.note }) : t('linkSkipped');
}

/** Perintah `prototyper ds …`: desain sistem yang dipakai bersama beberapa prototype. */
export function registerDesignSystemCommands(program: Command, act: Act): void {
  const ds = program
    .command('ds')
    .alias('design-system')
    .description(t('dsDesc'))
    .addHelpText('after', t('dsHelp'));

  ds.command('list')
    .alias('ls')
    .description(t('listDesc'))
    .action(
      act(async (ctx) => {
        const list = await listDesignSystems(ctx.registry);
        const locals = await listLocalDesignSystems(ctx.registry);
        if (ctx.json) return printJson({ designSystems: list, locals });
        if (!list.length && !locals.length) {
          console.log(t('noneYet'));
          return;
        }
        if (locals.length) {
          console.log(t('localHeader'));
          for (const l of locals) {
            console.log(`  · ${l.id}  ${l.paths.map((x) => `${x.path}${x.exists ? '' : t('notFoundSuffix')}`).join(', ')}`);
          }
          if (list.length) console.log('');
        }
        for (const d of list) {
          console.log(`${d.id}  ${d.name}  (${d.path})`);
          console.log(`${t('files', { files: d.files.join(', ') })}${d.missing.length ? t('filesMissing', { files: d.missing.join(', ') }) : ''}`);
          if (!d.consumers.length) console.log(t('notUsedYet'));
          for (const c of d.consumers) console.log(`  · ${c.id}  ${c.dir}/  ${c.outdated ? t('needsSync') : t('upToDate')}`);
        }
      }),
    );

  ds.command('use <id> <designSystem>')
    .description(t('useDesc'))
    .option('--dir <folder>', t('optDir'))
    .option('--no-link', t('optNoLink'))
    .action(
      act(async (ctx, [id, dsId], cmd) => {
        const o = cmd.opts<{ dir?: string; link: boolean }>();
        const r = await useDesignSystem(ctx.registry, id ?? '', dsId ?? '', {
          home: ctx.config.home,
          link: o.link,
          ...(o.dir ? { dir: o.dir } : {}),
        });
        if (ctx.json) return printJson(r);
        console.log(t('used', { id: r.id, ds: r.designSystem, dir: r.dir }));
        for (const f of r.files) console.log(`  ${f.file}: ${copyLabel(f.action)}`);
        console.log(`  ${describeLink(r.link)}`);
        for (const line of describeAgentFiles(r.agentFiles)) console.log(t('agentInstructions', { line }));
      }),
    );

  ds.command('sync [id]')
    .description(t('syncDesc'))
    .action(
      act(async (ctx, [id]) => {
        const results = await syncDesignSystem(ctx.registry, id);
        if (ctx.json) return printJson(results);
        if (!results.length) console.log(t('noConsumers'));
        for (const r of results) {
          if (r.error) {
            console.log(`✗ ${r.id}: ${r.error}`);
            continue;
          }
          const changed = r.files.filter((f) => f.action === 'created' || f.action === 'updated');
          console.log(`${changed.length ? '✓' : '·'} ${r.id} ← ${r.designSystem}: ${changed.length ? changed.map((f) => f.file).join(', ') : t('alreadyUpToDate')}`);
          for (const f of r.files.filter((x) => x.action === 'source-missing')) console.log(`  ${f.file}: ${copyLabel(f.action)}`);
        }
        if (results.some((r) => r.error)) process.exitCode = 1;
      }),
    );

  ds.command('status <id>')
    .description(t('statusDesc'))
    .action(
      act(async (ctx, [id]) => {
        const list = await listDesignSystems(ctx.registry);
        const c = list.flatMap((d) => d.consumers).find((x) => x.id === id);
        const own = list.find((d) => d.id === id);
        const local = (await listLocalDesignSystems(ctx.registry)).find((x) => x.id === id);
        if (ctx.json) return printJson(c ?? own ?? local ?? null);
        if (local) {
          console.log(t('usesOwn', { id: local.id }));
          for (const x of local.paths) console.log(`  ${x.path}: ${x.exists ? (x.kind === 'dir' ? t('kindFolder') : t('kindFile')) : t('notFound')}`);
          return;
        }
        if (own) {
          console.log(t('isDesignSystem', { id: own.id, consumers: own.consumers.map((x) => x.id).join(', ') || t('noneParen') }));
          return;
        }
        if (!c) {
          // Pemakai desain sistem yang tidak terdaftar tidak muncul di daftar di atas.
          const p = await ctx.registry.require(id ?? '');
          const use = p.manifest?.designSystem?.use;
          console.log(use ? t('usesUnregistered', { id: p.id, ds: use }) : t('noDesignSystem', { id: p.id }));
          return;
        }
        console.log(t('usesStatus', { id: c.id, ds: c.use, dir: c.dir, state: c.outdated ? t('needsSync') : t('upToDate') }));
        for (const f of c.files) console.log(`  ${f.file}: ${stateLabel(f.state)}`);
      }),
    );

  ds.command('local <id> [paths...]')
    .description(t('localDesc'))
    .action(
      act(async (ctx, [id], cmd) => {
        const paths = cmd.args.slice(1);
        if (!paths.length) {
          const p = await ctx.registry.require(id ?? '');
          const candidates = await detectLocalCandidates(p.path);
          if (ctx.json) return printJson({ id: p.id, candidates, current: p.manifest?.designSystem?.local ?? null });
          if (p.manifest?.designSystem?.local) console.log(t('currentlyRecorded', { paths: p.manifest.designSystem.local.join(', ') }));
          if (!candidates.length) console.log(t('noCandidates'));
          else {
            console.log(t('candidatesHeader'));
            for (const c of candidates) console.log(`  ${c}`);
            console.log(t('recordWith', { id: p.id }));
          }
          return;
        }
        const r = await setLocalDesignSystem(ctx.registry, id ?? '', paths, { home: ctx.config.home });
        if (ctx.json) return printJson(r);
        console.log(t('localSet', { id: r.id, paths: r.local.join(', ') }));
        if (r.replaced) console.log(t('replaces', { ds: r.replaced }));
        if (r.missing.length) console.log(t('notYetExists', { paths: r.missing.join(', ') }));
        for (const line of describeAgentFiles(r.agentFiles)) console.log(t('agentInstructions', { line }));
      }),
    );

  ds.command('detach <id>')
    .description(t('detachDesc'))
    .action(
      act(async (ctx, [id]) => {
        const r = await detachDesignSystem(ctx.registry, id ?? '', { home: ctx.config.home });
        if (ctx.json) return printJson(r);
        if (r.local) console.log(t('detachedLocal', { id: r.id, paths: r.local.join(', ') }));
        else console.log(t('detached', { id: r.id, ds: r.designSystem, dir: r.dir }));
      }),
    );
}
