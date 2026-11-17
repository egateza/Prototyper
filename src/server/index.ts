import type { FastifyInstance } from 'fastify';
import { autoSyncAgentFiles, describeAutoSync } from '../core/autosync.js';
import type { Config } from '../core/config.js';
import { lanAddresses } from '../core/net.js';
import { buildApp } from './app.js';

export { lanAddresses };

/** Jalankan daemon sampai SIGINT/SIGTERM atau POST /api/shutdown. */
export async function startServer(config: Config): Promise<void> {
  let app: FastifyInstance | undefined;
  let stopping = false;
  const shutdown = async (reason: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`\nMenghentikan Prototyper (${reason}), menghentikan semua prototype...`);
    try {
      await app?.close();
    } finally {
      process.exit(0);
    }
  };

  const built = await buildApp({
    config,
    logger: { level: 'warn' },
    onShutdown: () => void shutdown('perintah shutdown'),
  });
  app = built.app;

  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.once(sig, () => void shutdown(sig));

  for (const s of built.ctx.staleProcesses) {
    const hint = process.platform === 'win32' ? `taskkill /PID ${s.pid} /T /F` : `kill -- -${s.pid}`;
    console.warn(
      `Peringatan: proses "${s.id}" (PID ${s.pid}) dari sesi sebelumnya mungkin masih berjalan. ` +
        `Periksa dan hentikan manual bila perlu: ${hint}`,
    );
  }

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (err) {
    await app.close().catch(() => undefined);
    if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      throw new Error(
        `Port ${config.port} sudah dipakai. Mungkin Prototyper sudah berjalan (cek: prototyper status) atau pakai --port lain.`,
      );
    }
    throw err;
  }

  const urls = [`http://localhost:${config.port}`];
  if (config.lanMode === 'all') urls.push(...lanAddresses().map((a) => `http://${a}:${config.port}`));
  const mode =
    config.lanMode === 'all'
      ? '\nMode   : LAN (kontrol hanya dari mesin ini)'
      : config.lanMode === 'prototypes'
        ? `\nMode   : LAN untuk prototype saja (${lanAddresses().join(', ') || 'tanpa jaringan'}); Web UI hanya dari mesin ini`
        : '';
  console.log(
    `\nPrototyper berjalan:\n${urls.map((u) => `  ${u}`).join('\n')}\n` +
      `Data   : ${config.home}\nPort   : prototype ${config.portRange.start}-${config.portRange.end}` +
      `${mode}\nCtrl+C untuk berhenti.\n`,
  );

  // Setelah update Prototyper: sesuaikan petunjuk agent di semua prototype (di belakang layar).
  if (config.autoSyncAgents) {
    void autoSyncAgentFiles(config, built.ctx.registry).then((r) => {
      for (const line of describeAutoSync(r)) console.log(line);
    });
  }
}
