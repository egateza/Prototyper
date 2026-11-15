# Hello Command

<!-- prototyper:start -->
## Prototyper

Folder ini adalah prototype **Hello Command** (id `hello-command`, mode command) yang dikelola Prototyper.
Bagian ini dibuat otomatis — jangan diedit manual; perbarui dengan `prototyper agents sync`.

- Info & URL: `prototyper info hello-command --json` · jalankan: `prototyper start hello-command --json` · log: `prototyper logs hello-command -n 100 --json`
- Mode command: dijalankan dengan `node server.js`. Dev server dengan HMR tidak perlu restart; `prototyper restart hello-command` bila tidak ada HMR atau setelah mengubah `prototyper.json`.
- Jangan mengubah `prototyper.json` kecuali memang perlu mengubah cara menjalankan prototype.

### Komentar dari pengguna

Pengguna menulis komentar di Web UI Prototyper. Bila diminta "kerjakan komentar" (atau sejenisnya):

1. Ambil yang giliran agent: `prototyper comments hello-command --waiting agent --json`. Perhatikan `page`, `anchor` (elemen yang diklik/diblok pengguna: `selector` CSS, `text`, `quote` — cari elemen itu di kode), balasan, dan `answer` pada pertanyaan berpilihan.
2. Kerjakan satu per satu, lalu laporkan lewat `prototyper comments reply hello-command <commentId> "<ringkasan perubahan>"` dan biarkan komentar tetap open.
   **Jangan menutup komentar** (`prototyper comments resolve`): penggunalah yang memeriksa hasil dan menentukan pekerjaan selesai. Resolve hanya bila pengguna secara eksplisit memintanya.
3. Bila ada beberapa kemungkinan, jangan menebak: `prototyper comments ask hello-command <commentId> "<pertanyaan>" --option "A" --option "B"` (`--multi` bila boleh lebih dari satu), lalu biarkan open.
4. Pertanyaan balik atau permintaan revisi dari pengguna dijawab dengan `prototyper comments reply hello-command <commentId> "<jawaban>"`.
5. Komentar dengan `waitingFor: "user"` sedang menunggu pengguna — jangan dikerjakan dulu.

Bila perintah `prototyper` tidak ditemukan, di mesin ini pakai: `npm --prefix "D:\IdeaProjects\prototyper" run cli -- <perintah>`.
<!-- prototyper:end -->
