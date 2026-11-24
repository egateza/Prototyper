import { ensureShim } from './agent.js';
import { syncAgentFiles, type AgentFileResult } from './agentfiles.js';
import type { Config } from './config.js';
import { errorMessage } from './errors.js';
import { defineMessages, getLocale } from './i18n.js';
import type { Registry } from './registry.js';

const t = defineMessages({
  id: {
    shimFailed: 'Peringatan: gagal menulis shim prototyper: {error}',
    updated: 'Petunjuk agent diperbarui: {ids}',
    fileFailed: 'Peringatan: gagal memperbarui {file} di "{id}": {error}',
  },
  en: {
    shimFailed: 'Warning: failed to write the prototyper shim: {error}',
    updated: 'Agent instructions updated: {ids}',
    fileFailed: 'Warning: failed to update {file} in "{id}": {error}',
  },
});

export interface AutoSyncResult {
  id: string;
  path: string;
  files: AgentFileResult[];
}

/**
 * Dijalankan saat daemon menyala: setelah Prototyper diperbarui, petunjuk agent di semua prototype
 * terdaftar ikut disesuaikan dengan versi ini. Hanya bagian bertanda yang sudah ada yang diubah
 * (lihat SyncOptions.onlyExisting); shim CLI di `<home>/bin` ditulis ulang agar menunjuk ke
 * instalasi yang sedang berjalan. Tidak pernah melempar error.
 *
 * Bahasa petunjuk = `getLocale()` saat dipanggil: di luar request itu bahasa proses (pengaturan);
 * setelah pengaturan bahasa diganti, daemon memanggilnya di dalam `withLocale(<bahasa baru>)` sehingga
 * bagian Prototyper ditulis ulang dalam bahasa baru (`getProcessLocale()` akan mengabaikan withLocale).
 */
export async function autoSyncAgentFiles(config: Config, registry: Registry): Promise<{ shimError: string | null; results: AutoSyncResult[] }> {
  const locale = getLocale(); // diambil di awal, sebelum await
  let shimError: string | null = null;
  try {
    await ensureShim(config.home);
  } catch (err) {
    shimError = errorMessage(err);
  }
  const results: AutoSyncResult[] = [];
  let prototypes;
  try {
    prototypes = await registry.list();
  } catch (err) {
    return { shimError, results: [{ id: '*', path: config.home, files: [{ file: 'registry.json', action: 'error', error: errorMessage(err) }] }] };
  }
  for (const p of prototypes) {
    if (!p.manifest) continue; // folder hilang / manifest tidak valid: dilaporkan di tempat lain
    results.push({ id: p.id, path: p.path, files: await syncAgentFiles(p.path, p.manifest, { home: config.home, onlyExisting: true, locale }) });
  }
  return { shimError, results };
}

/** Baris ringkas untuk log daemon: hanya yang berubah atau gagal. */
export function describeAutoSync(r: { shimError: string | null; results: AutoSyncResult[] }): string[] {
  const lines: string[] = [];
  if (r.shimError) lines.push(t('shimFailed', { error: r.shimError }));
  const updated = r.results.filter((x) => x.files.some((f) => f.action === 'updated'));
  if (updated.length) lines.push(t('updated', { ids: updated.map((x) => x.id).join(', ') }));
  for (const x of r.results) {
    for (const f of x.files) if (f.action === 'error') lines.push(t('fileFailed', { file: f.file, id: x.id, error: f.error ?? '' }));
  }
  return lines;
}
