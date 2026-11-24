import type { FastifyInstance } from 'fastify';
import { autoSyncAgentFiles, describeAutoSync } from '../core/autosync.js';
import type { Config } from '../core/config.js';
import { lanAddresses } from '../core/net.js';
import { buildApp } from './app.js';
import { defineMessages } from '../core/i18n.js';

// Teks konsol daemon (bahasa proses: pengaturan / OS).
const t = defineMessages({
  id: {
    stopping: 'Menghentikan Prototyper ({reason}), menghentikan semua prototype...',
    shutdownCommand: 'perintah shutdown',
    staleProcess:
      'Peringatan: proses "{id}" (PID {pid}) dari sesi sebelumnya mungkin masih berjalan. Periksa dan hentikan manual bila perlu: {hint}',
    portInUse: 'Port {port} sudah dipakai. Mungkin Prototyper sudah berjalan (cek: prototyper status) atau pakai --port lain.',
    modeLan: 'Mode   : LAN (kontrol hanya dari mesin ini)',
    modeLanPrototypes: 'Mode   : LAN untuk prototype saja ({addresses}); Web UI hanya dari mesin ini',
    noNetwork: 'tanpa jaringan',
    running: 'Prototyper berjalan:',
    data: 'Data   : {home}',
    ports: 'Port   : prototype {start}-{end}',
    ctrlC: 'Ctrl+C untuk berhenti.',
  },
  en: {
    stopping: 'Stopping Prototyper ({reason}), stopping all prototypes...',
    shutdownCommand: 'shutdown command',
    staleProcess:
      'Warning: process "{id}" (PID {pid}) from a previous session may still be running. Check and stop it manually if needed: {hint}',
    portInUse: 'Port {port} is already in use. Prototyper may already be running (check: prototyper status), or use another --port.',
    modeLan: 'Mode   : LAN (control only from this machine)',
    modeLanPrototypes: 'Mode   : LAN for prototypes only ({addresses}); Web UI only from this machine',
    noNetwork: 'no network',
    running: 'Prototyper is running:',
    data: 'Data   : {home}',
    ports: 'Ports  : prototypes {start}-{end}',
    ctrlC: 'Press Ctrl+C to stop.',
  },
});

export { lanAddresses };

/** Jalankan daemon sampai SIGINT/SIGTERM atau POST /api/shutdown. */
export async function startServer(config: Config): Promise<void> {
  let app: FastifyInstance | undefined;
  let stopping = false;
  const shutdown = async (reason: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`\n${t('stopping', { reason })}`);
    try {
      await app?.close();
    } finally {
      process.exit(0);
    }
  };

  const built = await buildApp({
    config,
    logger: { level: 'warn' },
    onShutdown: () => void shutdown(t('shutdownCommand')),
  });
  app = built.app;

  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.once(sig, () => void shutdown(sig));

  for (const s of built.ctx.staleProcesses) {
    const hint = process.platform === 'win32' ? `taskkill /PID ${s.pid} /T /F` : `kill -- -${s.pid}`;
    console.warn(t('staleProcess', { id: s.id, pid: s.pid, hint }));
  }

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (err) {
    await app.close().catch(() => undefined);
    if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      throw new Error(t('portInUse', { port: config.port }));
    }
    throw err;
  }

  const urls = [`http://localhost:${config.port}`];
  if (config.lanMode === 'all') urls.push(...lanAddresses().map((a) => `http://${a}:${config.port}`));
  const mode =
    config.lanMode === 'all'
      ? `\n${t('modeLan')}`
      : config.lanMode === 'prototypes'
        ? `\n${t('modeLanPrototypes', { addresses: lanAddresses().join(', ') || t('noNetwork') })}`
        : '';
  console.log(
    `\n${t('running')}\n${urls.map((u) => `  ${u}`).join('\n')}\n` +
      `${t('data', { home: config.home })}\n${t('ports', { start: config.portRange.start, end: config.portRange.end })}` +
      `${mode}\n${t('ctrlC')}\n`,
  );

  // Setelah update Prototyper: sesuaikan petunjuk agent di semua prototype (di belakang layar).
  if (config.autoSyncAgents) {
    void autoSyncAgentFiles(config, built.ctx.registry).then((r) => {
      for (const line of describeAutoSync(r)) console.log(line);
    });
  }
}
