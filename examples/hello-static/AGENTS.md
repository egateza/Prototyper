# Hello Static — panduan agent

Prototype HTML statis tanpa build. Ubah `index.html`; perubahan langsung terlihat setelah refresh (server mengirim `Cache-Control: no-store`).

<!-- prototyper:start -->
## Prototyper

Folder ini adalah prototype **Hello Static** (id `hello-static`, mode static) yang dikelola Prototyper.
Bagian ini dibuat otomatis — jangan diedit manual; perbarui dengan `prototyper agents sync`.

- Info & URL: `prototyper info hello-static --json` · jalankan: `prototyper start hello-static --json` · log: `prototyper logs hello-static -n 100 --json`
- Mode static: file disajikan apa adanya (`Cache-Control: no-store`). Setelah edit cukup refresh, tidak perlu restart. Titik masuk: `index.html`.
- Jangan mengubah `prototyper.json` kecuali memang perlu mengubah cara menjalankan prototype.

### Komentar dari pengguna

Pengguna menulis komentar di Web UI Prototyper. Bila diminta "kerjakan komentar" (atau sejenisnya):

1. Ambil yang giliran agent: `prototyper comments hello-static --waiting agent --json`. Perhatikan `page`, `anchor` (elemen yang diklik/diblok pengguna: `selector` CSS, `text`, `quote` — cari elemen itu di kode), balasan, dan `answer` pada pertanyaan berpilihan.
2. Kerjakan satu per satu, lalu laporkan lewat `prototyper comments reply hello-static <commentId> "<ringkasan perubahan>"` dan biarkan komentar tetap open.
   **Jangan menutup komentar** (`prototyper comments resolve`): penggunalah yang memeriksa hasil dan menentukan pekerjaan selesai. Resolve hanya bila pengguna secara eksplisit memintanya.
3. Bila ada beberapa kemungkinan, jangan menebak: `prototyper comments ask hello-static <commentId> "<pertanyaan>" --option "A" --option "B"` (`--multi` bila boleh lebih dari satu), lalu biarkan open.
4. Pertanyaan balik atau permintaan revisi dari pengguna dijawab dengan `prototyper comments reply hello-static <commentId> "<jawaban>"`.
5. Komentar dengan `waitingFor: "user"` sedang menunggu pengguna — jangan dikerjakan dulu.

Bila perintah `prototyper` tidak ditemukan, di mesin ini pakai: `npm --prefix "D:\IdeaProjects\prototyper" run cli -- <perintah>`.
<!-- prototyper:end -->
