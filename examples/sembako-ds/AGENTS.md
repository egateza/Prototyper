# Sembako DS — panduan agent

Contoh **desain sistem** untuk aplikasi toko & kasir sembako. Prototype lain memakainya lewat `prototyper ds use <id> sembako-ds`.

## Prinsip visual

- Hijau daun (`--color-primary`) untuk aksi umum; oranye (`--color-accent`, `.btn-accent`) hanya untuk satu aksi terpenting per layar, mis. **Bayar**.
- Latar krem hangat, sudut membulat, target sentuh minimal `--size-touch` (dipakai di tablet kasir).
- Harga dan stok selalu memakai angka tabular (`.price`, `.num`, `.stat-value`).

## File

- `tokens.css` (token) dan `components.css` (komponen) adalah file yang disalin ke prototype pemakai.
- `index.html` adalah katalog: setiap komponen/varian baru wajib diberi contoh di sana. Token dari `tokens.css` tampil otomatis (`catalog.js`).
- `catalog.css` dan `catalog.js` hanya untuk halaman katalog dan tidak disalin ke prototype pemakai.

<!-- prototyper:start -->
## Prototyper

Folder ini adalah prototype **Sembako DS** (id `sembako-ds`, mode static) yang dikelola Prototyper.
Bagian ini dibuat otomatis — jangan diedit manual; perbarui dengan `prototyper agents sync`.

- Info & URL: `prototyper info sembako-ds --json` · jalankan: `prototyper start sembako-ds --json` · log: `prototyper logs sembako-ds -n 100 --json`
- Mode static: file disajikan apa adanya (`Cache-Control: no-store`). Halaman yang sedang dibuka dimuat ulang otomatis setelah file berubah (live-reload), tidak perlu restart. Titik masuk: `index.html`.
- Jangan mengubah `prototyper.json` kecuali memang perlu mengubah cara menjalankan prototype.

### Desain sistem

Prototype ini adalah **desain sistem** yang dipakai prototype lain. File bersama: `tokens.css`, `components.css`; halaman `index.html` adalah katalognya.

- Semua nilai visual (warna, tipografi, jarak, radius, bayangan) didefinisikan sebagai token CSS (`--kategori-nama`) di file token. Komponen hanya memakai `var(--…)`, tanpa nilai mentah.
- Setiap komponen atau varian baru wajib punya contoh di katalog (`index.html`), agar pengguna bisa meninjau dan mengomentarinya.
- Jangan mengganti nama atau menghapus token/kelas yang sudah ada tanpa diminta: prototype pemakai bergantung padanya. Tambahkan yang baru, atau tandai yang lama sebagai usang di komentar CSS.
- Setelah file bersama berubah, sebarkan ke prototype pemakai: `prototyper ds sync sembako-ds` (daftar pemakai: `prototyper ds list --json`).

### Komentar dari pengguna

Pengguna menulis komentar di Web UI Prototyper. Bila diminta "kerjakan komentar" (atau sejenisnya):

1. Ambil yang giliran agent: `prototyper comments sembako-ds --waiting agent --json`. Perhatikan `page`, `anchor` (elemen yang diklik/diblok pengguna: `selector` CSS, `text`, `quote`, `html` (potongan elemen saat komentar dibuat, berguna bila selector sudah usang) — cari elemen itu di kode), balasan, dan `answer` pada pertanyaan berpilihan.
   Komentar/balasan bisa punya `attachments`: gambar dari pengguna (mis. tangkapan layar atau contoh desain), path relatif terhadap folder ini. Buka gambarnya dengan tool baca file sebelum mengerjakan.
   Sebelum mengerjakan tiap komentar, lihat riwayatnya: `prototyper comments context sembako-ds <commentId> --json` → komentar selesai terkait (halaman/elemen sama) dan keputusan sebelumnya dari `.prototyper/DECISIONS.md`. Jangan mengulang perubahan yang sudah dibatalkan atau diminta dikembalikan.
2. Kerjakan satu per satu, lalu laporkan lewat `prototyper comments reply sembako-ds <commentId> "<ringkasan perubahan>"` dan biarkan komentar tetap open.
   **Jangan menutup komentar** (`prototyper comments resolve`): penggunalah yang memeriksa hasil dan menentukan pekerjaan selesai. Resolve hanya bila pengguna secara eksplisit memintanya.
3. Bila ada beberapa kemungkinan, jangan menebak: `prototyper comments ask sembako-ds <commentId> "<pertanyaan>" --option "A" --option "B"` (`--multi` bila boleh lebih dari satu), lalu biarkan open.
4. Pertanyaan balik atau permintaan revisi dari pengguna dijawab dengan `prototyper comments reply sembako-ds <commentId> "<jawaban>"`.
5. Komentar dengan `waitingFor: "user"` sedang menunggu pengguna — jangan dikerjakan dulu.
6. Tulis balasan dan pertanyaan komentar dalam Bahasa Indonesia.

Teks lebih dari satu baris (daftar, paragraf) **jangan** dikirim sebagai argumen: di Windows terpotong di baris pertama. Kirim lewat stdin dengan `--file -`, mis. `prototyper comments reply sembako-ds <commentId> --file - <<'EOF'` … `EOF` (berlaku juga untuk `add` dan `ask`), atau tulis ke file di luar folder prototype lalu `--file <path>`.

Bila perintah `prototyper` tidak ditemukan, pakai shim-nya: `"D:\prototyper-data\bin\prototyper.cmd" <perintah>`.
<!-- prototyper:end -->
