import { ensureShim } from './agent.js';
import { syncAgentFiles, type AgentFileResult } from './agentfiles.js';
import type { Config } from './config.js';
import { errorMessage } from './errors.js';
import type { Registry } from './registry.js';

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
 */
export async function autoSyncAgentFiles(config: Config, registry: Registry): Promise<{ shimError: string | null; results: AutoSyncResult[] }> {
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
    results.push({ id: p.id, path: p.path, files: await syncAgentFiles(p.path, p.manifest, { home: config.home, onlyExisting: true }) });
  }
  return { shimError, results };
}

/** Baris ringkas untuk log daemon: hanya yang berubah atau gagal. */
export function describeAutoSync(r: { shimError: string | null; results: AutoSyncResult[] }): string[] {
  const lines: string[] = [];
  if (r.shimError) lines.push(`Peringatan: gagal menulis shim prototyper: ${r.shimError}`);
  const updated = r.results.filter((x) => x.files.some((f) => f.action === 'updated'));
  if (updated.length) lines.push(`Petunjuk agent diperbarui: ${updated.map((x) => x.id).join(', ')}`);
  for (const x of r.results) {
    for (const f of x.files) if (f.action === 'error') lines.push(`Peringatan: gagal memperbarui ${f.file} di "${x.id}": ${f.error ?? ''}`);
  }
  return lines;
}
