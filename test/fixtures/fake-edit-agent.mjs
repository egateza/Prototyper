// Agent palsu yang mengubah file di folder kerja (cwd = folder prototype): ubah, tambah, hapus.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
if (args.includes('--version')) {
  console.log('fake-edit 0.0.0');
  process.exit(0);
}
writeFileSync('index.html', '<p>diubah agent</p>');
mkdirSync('halaman/baru', { recursive: true });
writeFileSync('halaman/baru/a.html', '<p>baru</p>');
rmSync('lama.css', { force: true });
mkdirSync('.prototyper', { recursive: true });
writeFileSync('.prototyper/catatan.txt', 'data prototyper tidak ikut checkpoint');
console.log('Selesai mengedit.');
