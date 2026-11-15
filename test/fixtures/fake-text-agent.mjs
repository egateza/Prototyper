// Agent palsu berbasis teks (meniru `codex exec …`): mencetak teks biasa, memanggil `prototyper` lewat PATH.
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
if (args.includes('--version')) {
  console.log('codex-cli 0.0.0-fake');
  process.exit(0);
}
const prompt = args[args.length - 1] ?? '';
const id = /\(id `([a-z0-9-]+)`\)/.exec(prompt)?.[1];
const focus = /Fokus hanya pada komentar: ([^.]+)\./.exec(prompt)?.[1]?.split(', ') ?? ['c1'];
console.log(`[args] ${args.slice(0, 4).join(' ')}`);
console.log('Membaca komentar…');
const r = spawnSync(`prototyper comments resolve ${id} ${focus[0]} --note "Dikerjakan agent teks"`, { shell: true, encoding: 'utf8' });
console.log(r.status === 0 ? 'Komentar diselesaikan.' : `Gagal: ${r.stderr}`);
console.log('Ringkasan: semua beres.');
process.exit(r.status === 0 ? 0 : 1);
