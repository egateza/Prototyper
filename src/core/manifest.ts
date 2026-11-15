import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { AppError } from './errors.js';

export const MANIFEST_FILE = 'prototyper.json';
export const SCHEMA_URL =
  'https://raw.githubusercontent.com/egateza/prototyper/main/schemas/prototyper.schema.json';

const ID_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;

/** Path relatif yang tetap berada di dalam folder prototype. */
const relPath = z
  .string()
  .min(1)
  .refine((p) => !path.isAbsolute(p) && !/^[a-zA-Z]:/.test(p) && !p.split(/[\\/]/).includes('..'), {
    message: 'harus path relatif di dalam folder prototype (tanpa ".." dan bukan path absolut)',
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
    { message: 'bukan regular expression yang valid' },
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
    .regex(ID_RE, 'id harus huruf kecil/angka/strip, 2-63 karakter, diawali huruf atau angka')
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
    throw new AppError('INVALID_MANIFEST', `${source} tidak valid: ${issues.join('; ')}`, issues);
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
      throw new AppError(
        'INVALID_MANIFEST',
        `${MANIFEST_FILE} tidak ditemukan di ${dir}. Buat dengan: prototyper init "${dir}"`,
      );
    }
    throw err;
  }
  let data: unknown;
  try {
    data = JSON.parse(raw.replace(/^﻿/, ''));
  } catch (err) {
    throw new AppError('INVALID_MANIFEST', `${file} bukan JSON yang valid: ${(err as Error).message}`);
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
    throw new AppError('CONFLICT', `${file} sudah ada. Timpa secara eksplisit bila memang ingin mengganti.`);
  }
  await fs.writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return file;
}
