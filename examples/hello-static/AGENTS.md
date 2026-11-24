# Hello Static — panduan agent

Prototype HTML statis tanpa build. Ubah `index.html`; perubahan langsung terlihat setelah refresh (server mengirim `Cache-Control: no-store`).

<!-- prototyper:start -->
## Prototyper

Folder ini adalah prototype **Hello Static** (id `hello-static`, mode static) yang dikelola Prototyper.
Bagian ini dibuat otomatis — jangan diedit manual; perbarui dengan `prototyper agents sync`.

- Info & URL: `prototyper info hello-static --json` · jalankan: `prototyper start hello-static --json` · log: `prototyper logs hello-static -n 100 --json`
- Mode static: file disajikan apa adanya (`Cache-Control: no-store`). Halaman yang sedang dibuka dimuat ulang otomatis setelah file berubah (live-reload), tidak perlu restart. Titik masuk: `index.html`.
- Jangan mengubah `prototyper.json` kecuali memang perlu mengubah cara menjalankan prototype.

### Komentar dari pengguna

Pengguna menulis komentar di Web UI Prototyper. Bila diminta "kerjakan komentar" (atau sejenisnya):

1. Ambil yang giliran agent: `prototyper comments hello-static --waiting agent --json`. Perhatikan `page`, `anchor` (elemen yang diklik/diblok pengguna: `selector` CSS, `text`, `quote`, `html` (potongan elemen saat komentar dibuat, berguna bila selector sudah usang) — cari elemen itu di kode), balasan, dan `answer` pada pertanyaan berpilihan.
   Komentar/balasan bisa punya `attachments`: gambar dari pengguna (mis. tangkapan layar atau contoh desain), path relatif terhadap folder ini. Buka gambarnya dengan tool baca file sebelum mengerjakan.
   Sebelum mengerjakan tiap komentar, lihat riwayatnya: `prototyper comments context hello-static <commentId> --json` → komentar selesai terkait (halaman/elemen sama) dan keputusan sebelumnya dari `.prototyper/DECISIONS.md`. Jangan mengulang perubahan yang sudah dibatalkan atau diminta dikembalikan.
2. Kerjakan satu per satu, lalu laporkan lewat `prototyper comments reply hello-static <commentId> "<ringkasan perubahan>"` dan biarkan komentar tetap open.
   **Jangan menutup komentar** (`prototyper comments resolve`): penggunalah yang memeriksa hasil dan menentukan pekerjaan selesai. Resolve hanya bila pengguna secara eksplisit memintanya.
3. Bila ada beberapa kemungkinan, jangan menebak: `prototyper comments ask hello-static <commentId> "<pertanyaan>" --option "A" --option "B"` (`--multi` bila boleh lebih dari satu), lalu biarkan open.
4. Pertanyaan balik atau permintaan revisi dari pengguna dijawab dengan `prototyper comments reply hello-static <commentId> "<jawaban>"`.
5. Komentar dengan `waitingFor: "user"` sedang menunggu pengguna — jangan dikerjakan dulu.
6. Tulis balasan dan pertanyaan komentar dalam Bahasa Indonesia.

Teks lebih dari satu baris (daftar, paragraf) **jangan** dikirim sebagai argumen: di Windows terpotong di baris pertama. Kirim lewat stdin dengan `--file -`, mis. `prototyper comments reply hello-static <commentId> --file - <<'EOF'` … `EOF` (berlaku juga untuk `add` dan `ask`), atau tulis ke file di luar folder prototype lalu `--file <path>`.

Bila perintah `prototyper` tidak ditemukan, pakai shim-nya: `"D:\prototyper-data\bin\prototyper.cmd" <perintah>`.
<!-- prototyper:end -->
