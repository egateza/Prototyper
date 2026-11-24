import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { AppError } from './errors.js';
import { defineMessages } from './i18n.js';

const t = defineMessages({
  id: {
    relPath: 'harus path relatif di dalam folder prototype (tanpa ".." dan bukan path absolut)',
    badRegex: 'bukan regular expression yang valid',
    badId: 'id harus huruf kecil/angka/strip, 2-63 karakter, diawali huruf atau angka',
    badDsId: 'id desain sistem tidak valid',
    dsPickOne: 'pilih salah satu: source (desain sistem), use (memakai desain sistem), atau local (desain sistem sendiri)',
    dsFilesSourceOnly: 'files hanya untuk desain sistem (source: true)',
    dsDirUseOnly: 'dir hanya untuk pemakai (use)',
    dsRequired: 'isi source: true (desain sistem), use: "<id>" (memakai desain sistem), atau local: [...] (desain sistem sendiri)',
    invalid: '{source} tidak valid: {issues}',
    notFound: '{file} tidak ditemukan di {dir}. Buat dengan: prototyper init "{dir}"',
    notJson: '{file} bukan JSON yang valid: {message}',
    exists: '{file} sudah ada. Timpa secara eksplisit bila memang ingin mengganti.',
  },
  en: {
    relPath: 'must be a relative path inside the prototype folder (no ".." and not an absolute path)',
    badRegex: 'is not a valid regular expression',
    badId: 'id must be lowercase letters/digits/hyphens, 2-63 characters, starting with a letter or digit',
    badDsId: 'invalid design system id',
    dsPickOne: 'choose one: source (design system), use (uses a design system), or local (own design system)',
    dsFilesSourceOnly: 'files is only for design systems (source: true)',
    dsDirUseOnly: 'dir is only for consumers (use)',
    dsRequired: 'set source: true (design system), use: "<id>" (uses a design system), or local: [...] (own design system)',
    invalid: '{source} is invalid: {issues}',
    notFound: '{file} was not found in {dir}. Create it with: prototyper init "{dir}"',
    notJson: '{file} is not valid JSON: {message}',
    exists: '{file} already exists. Overwrite it explicitly if you really want to replace it.',
  },
});

export const MANIFEST_FILE = 'prototyper.json';
export const SCHEMA_URL =
  'https://raw.githubusercontent.com/egateza/prototyper/main/schemas/prototyper.schema.json';

const ID_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;

/** Path relatif yang tetap berada di dalam folder prototype. */
const relPath = z
  .string()
  .min(1)
  .refine((p) => !path.isAbsolute(p) && !/^[a-zA-Z]:/.test(p) && !p.split(/[\\/]/).includes('..'), {
    error: () => t('relPath'),
  });

const regexString = z
  .string()
  .min(1)
  .refine(
    (s) => {
      try {
        new RegExp(s);
        return true;
      } catch {
        return false;
      }
    },
    { error: () => t('badRegex') },
  );

export const staticConfigSchema = z
  .object({
    root: relPath.default('.').describe('Folder yang di-serve, relatif ke folder prototype'),
    index: relPath.default('index.html').describe('File index'),
    spa: z.boolean().default(false).describe('Jika true, path tak dikenal diarahkan ke index (SPA)'),
    inject: z
      .boolean()
      .default(true)
      .describe('Sisipkan skrip Prototyper ke halaman HTML (komentar dengan klik/blok elemen di pratinjau). false = HTML dikirim apa adanya'),
    liveReload: z
      .boolean()
      .default(true)
      .describe('Muat ulang halaman otomatis saat file di root berubah (CSS diganti tanpa muat ulang). Butuh inject: true'),
    viewport: z
      .boolean()
      .default(true)
      .describe(
        'Sisipkan <meta name="viewport" content="width=device-width, initial-scale=1"> bila halaman belum punya, agar tampilan di HP sama dengan pratinjau perangkat. Butuh inject: true',
      ),
  })
  .strict();

export const commandConfigSchema = z
  .object({
    run: z.string().min(1).describe('Perintah start. Placeholder {port} dan {host} diganti saat dijalankan'),
    install: z.string().min(1).optional().describe('Perintah install dependensi (mis. npm install)'),
    cwd: relPath.default('.').describe('Folder kerja, relatif ke folder prototype'),
    env: z.record(z.string(), z.string()).default({}).describe('Environment variable tambahan'),
    portEnv: z
      .string()
      .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
      .default('PORT')
      .describe('Nama env yang diisi port yang dialokasikan'),
    readyPattern: regexString.optional().describe('Regex pada output; cocok = prototype siap. Tanpa ini dipakai cek port'),
    readyTimeoutSec: z.number().int().min(1).max(600).default(60).describe('Batas waktu menunggu siap (detik)'),
  })
  .strict();

const baseShape = {
  $schema: z.string().optional(),
  id: z
    .string()
    .regex(ID_RE, { error: () => t('badId') })
    .describe('ID unik, mis. pos-sembako-ui'),
  name: z.string().min(1).describe('Nama tampilan'),
  description: z.string().optional(),
  tags: z.array(z.string()).default([]),
  agent: z
    .object({
      instructions: relPath.optional().describe('File panduan untuk LLM agent (default AGENTS.md)'),
      syncInstructions: z
        .boolean()
        .optional()
        .describe('false = Prototyper tidak menulis bagian petunjuk di file instruksi dan CLAUDE.md (default true)'),
    })
    .strict()
    .optional(),
  comments: z
    .object({
      archiveDays: z
        .number()
        .int()
        .min(0)
        .max(3650)
        .optional()
        .describe('Komentar selesai yang lebih tua dari N hari dipindah ke .prototyper/comments-archive/ (default 30; 0 = tidak diarsipkan)'),
    })
    .strict()
    .optional(),
  designSystem: z
    .object({
      source: z
        .boolean()
        .optional()
        .describe('true = prototype ini adalah desain sistem yang dipakai prototype lain (dibuat dengan template design-system)'),
      files: z
        .array(relPath)
        .min(1)
        .optional()
        .describe('Desain sistem: file yang disalin ke prototype pemakai, relatif ke folder ini (default ["tokens.css", "components.css"])'),
      use: z
        .string()
        .regex(ID_RE, { error: () => t('badDsId') })
        .optional()
        .describe('Pemakai: id desain sistem yang dipakai. Pasang dengan: prototyper ds use <id> <desain-sistem>'),
      dir: relPath
        .optional()
        .describe('Pemakai: folder salinan file desain sistem, relatif ke folder prototype (default "design-system")'),
      local: z
        .array(relPath)
        .min(1)
        .optional()
        .describe('Desain sistem sendiri: file/folder desain sistem milik prototype ini (mis. ["src/styles/tokens.css"]), relatif ke folder prototype'),
    })
    .strict()
    .refine((d) => [d.source, d.use, d.local].filter(Boolean).length <= 1, {
      error: () => t('dsPickOne'),
    })
    .refine((d) => d.source || d.files === undefined, { error: () => t('dsFilesSourceOnly') })
    .refine((d) => d.use || d.dir === undefined, { error: () => t('dsDirUseOnly') })
    .refine((d) => d.source || d.use || d.local, {
      error: () => t('dsRequired'),
    })
    .optional()
    .describe('Desain sistem: token & komponen yang dipakai bersama beberapa prototype'),
};

export const manifestSchema = z.discriminatedUnion('type', [
  z.object({ ...baseShape, type: z.literal('static'), static: staticConfigSchema.prefault({}) }).strict(),
  z.object({ ...baseShape, type: z.literal('command'), command: commandConfigSchema }).strict(),
]);

export type Manifest = z.output<typeof manifestSchema>;
export type ManifestInput = z.input<typeof manifestSchema>;
export type StaticConfig = z.output<typeof staticConfigSchema>;
export type CommandConfig = z.output<typeof commandConfigSchema>;

function formatIssues(err: z.ZodError): string[] {
  return err.issues.map((i) => `${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`);
}

/** Validasi objek manifest; melempar AppError INVALID_MANIFEST dengan daftar masalah. */
export function parseManifest(data: unknown, source = MANIFEST_FILE): Manifest {
  const r = manifestSchema.safeParse(data);
  if (!r.success) {
    const issues = formatIssues(r.error);
    throw new AppError('INVALID_MANIFEST', t('invalid', { source, issues: issues.join('; ') }), issues);
  }
  return r.data;
}

/** Baca dan validasi `prototyper.json` di sebuah folder. */
export async function loadManifest(dir: string): Promise<Manifest> {
  const file = path.join(dir, MANIFEST_FILE);
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new AppError('INVALID_MANIFEST', t('notFound', { file: MANIFEST_FILE, dir }));
    }
    throw err;
  }
  let data: unknown;
  try {
    data = JSON.parse(raw.replace(/^﻿/, ''));
  } catch (err) {
    throw new AppError('INVALID_MANIFEST', t('notJson', { file, message: (err as Error).message }));
  }
  return parseManifest(data, file);
}

/** JSON Schema manifest (digenerate dari zod) untuk editor dan agent. */
export function manifestJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(manifestSchema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
  return {
    ...schema,
    $id: SCHEMA_URL,
    title: 'Prototyper manifest (prototyper.json)',
    description: 'Mendeskripsikan cara Prototyper menjalankan sebuah prototype.',
  };
}

export function manifestJsonSchemaText(): string {
  return `${JSON.stringify(manifestJsonSchema(), null, 2)}\n`;
}

/**
 * Tulis prototyper.json. Isi yang ditulis adalah input apa adanya (tanpa default yang diisi zod),
 * agar file tetap ringkas. Validasi dulu dengan parseManifest sebelum memanggil ini.
 */
export async function writeManifest(
  dir: string,
  manifest: unknown,
  { overwrite = false }: { overwrite?: boolean } = {},
): Promise<string> {
  const file = path.join(dir, MANIFEST_FILE);
  if (!overwrite && existsSync(file)) {
    throw new AppError('CONFLICT', t('exists', { file }));
  }
  await fs.writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return file;
}
