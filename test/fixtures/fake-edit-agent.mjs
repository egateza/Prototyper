// Agent palsu yang mengubah file di folder kerja (cwd = folder prototype): ubah, tambah, hapus.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
if (args.includes('--version')) {
  console.log('fake-edit 0.0.0');
  process.exit(0);
}
if (args.includes('--help')) {
  // probe flag yang didukung (cwd = folder daemon, bukan prototype): jangan menulis apa pun
  console.log('Usage: fake-edit [options]\n  --session-id <uuid>\n  --resume <id>');
  process.exit(0);
}
const sid = args.includes('--session-id') ? args[args.indexOf('--session-id') + 1] : null;
if (sid) console.log(JSON.stringify({ type: 'system', subtype: 'init', session_id: sid }));
writeFileSync('index.html', '<p>diubah agent</p>');
mkdirSync('halaman/baru', { recursive: true });
writeFileSync('halaman/baru/a.html', '<p>baru</p>');
rmSync('lama.css', { force: true });
mkdirSync('.prototyper', { recursive: true });
writeFileSync('.prototyper/catatan.txt', 'data prototyper tidak ikut checkpoint');
console.log('Selesai mengedit.');
