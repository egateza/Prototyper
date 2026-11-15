# AGENTS.md — panduan untuk LLM agent

Untuk agent apa pun (Claude, Codex, Gemini, Cursor, dll.). Rancangan lengkap: [`docs/DESIGN.md`](docs/DESIGN.md).

## A. Memakai Prototyper untuk mengerjakan sebuah prototype

```bash
prototyper list --json                 # pilih prototype
prototyper info <id> --json            # path, url, status, instructions.path
# baca file instructions.path (AGENTS.md prototype) bila exists = true, lalu edit file di `path`
prototyper start <id> --json           # atau restart; cetak url
prototyper logs <id> -n 100 --json     # debug
prototyper comments <id> --waiting agent --json   # komentar yang giliran agent
prototyper comments context <id> <commentId> --json   # riwayat: komentar selesai terkait + keputusan (DECISIONS.md)
prototyper comments reply <id> <commentId> "apa yang diubah"   # lapor hasil; komentar tetap open
prototyper comments ask <id> <commentId> "pertanyaan" --option "A" --option "B" [--multi]
```

- Jangan menyalin kode prototype ke repo ini; prototype tinggal di foldernya sendiri.
- Folder prototype biasanya sudah punya bagian `<!-- prototyper:start -->` di `AGENTS.md` (dan `CLAUDE.md` → `@AGENTS.md`) yang ditulis Prototyper saat didaftarkan; ikuti itu. Bila belum ada: `prototyper agents sync <id>`.
- "Kerjakan komentar di prototype X": ambil komentar dengan `--waiting agent`, kerjakan satu per satu (perhatikan `page`, balasan, dan `answer` pada pertanyaan berpilihan), lalu laporkan hasilnya dengan `comments reply` dan biarkan komentar tetap open. **Jangan `resolve`**: pengguna yang memeriksa hasil dan menutup komentar (kecuali pengguna eksplisit meminta agent menutupnya). Bila ada beberapa kemungkinan, pakai `comments ask` dengan `--option` (tampil sebagai radio/checkbox di Web UI) dan biarkan tetap open; pertanyaan balik dari pengguna dijawab dengan `comments reply`. Komentar `waitingFor: "user"` jangan dikerjakan dulu. Sebelum mengerjakan tiap komentar, jalankan `comments context` agar tidak mengulang revisi yang sudah ditolak. Komentar disimpan di `<folder>/.prototyper/comments.json`, log keputusan di `DECISIONS.md`, komentar selesai lama di `comments-archive/` (semua boleh dibaca langsung).
- Prototype baru: `prototyper new <id> --template static|vite-vanilla|vite-react --json` → dapat `path`; isi file di sana (impor HTML: `--from <file.html>`). Folder yang sudah ada: `prototyper add <folder>` (manifest dideteksi bila belum ada), lalu periksa `prototyper.json`.
- Mode static mengirim `Cache-Control: no-store` dan live-reload (halaman terbuka dimuat ulang sendiri setelah file berubah; `static.liveReload: false` untuk mematikan). Mode command biasanya punya HMR; bila tidak, `restart`.
- Tanpa `npm link`, pakai `npm run cli -- <perintah>` dari repo ini.

## B. Mengerjakan repo Prototyper itu sendiri

- Node.js ≥ 22.12 (dikembangkan di Node 24, Windows), TypeScript 7 ESM, Fastify 5, commander, zod 4, vitest.
- Import relatif **wajib** berekstensi `.js` (NodeNext); import tipe pakai `import type` (`verbatimModuleSyntax`).
- Lokasi file aplikasi (web/, schemas/, package.json) selalu lewat `APP_DIR` dari `src/core/appfiles.ts`, jangan `import.meta.url`; memanggil CLI sendiri lewat `cliCommand()`. Kode harus tetap bisa di-bundle ke CommonJS (tanpa top-level await). Lihat docs/RELEASE.md.
- Kode harus jalan di Windows: pakai `node:path`, jangan hardcode `/` atau perintah shell Unix. Kill proses lewat `killTree` di `src/core/runtime.ts`.

```bash
npm install
npm run dev          # daemon + auto-reload di http://localhost:4000
npm run cli -- <cmd>
npm run typecheck && npm test
npm run schema       # wajib setelah mengubah skema manifest (ada tes yang mengecek sinkron)
npm run icon         # setelah mengubah assets/icon.svg / icon-tray.svg: buat ulang icon.ico, png, web/favicon.svg, assets/tray/*.png
npm run release      # berkas rilis untuk OS ini: exe (Node SEA) + portable + npm → release/ (lihat docs/RELEASE.md)
```

Struktur:

```
src/boot/    sea.ts (main biner tunggal: pilih aplikasi di app store lalu muat; mengubahnya = naikkan RUNTIME)
src/core/    appfiles (APP_DIR/APP_MODE: source|dist|bundle|sea, cliCommand), apphost (RUNTIME, app store, bootApp), apppack (tar.gz paket aplikasi), semver, config, manifest (zod), detect (init), scaffold (new + template), agentfiles (AGENTS.md/CLAUDE.md), comments (+ DECISIONS.md, arsip, context), embed (sisip skrip pratinjau), agent (menjalankan claude -p), registry, state, ports, logs, runtime, views, startup (Run key Windows), update (GitHub Releases), open (buka browser)
src/server/  app.ts (buildApp), routes/health.ts, routes/prototypes.ts, routes/comments.ts, routes/agent.ts
src/cli/     index.ts (perintah), comments.ts (prototyper comments …), client.ts (HTTP + auto-start daemon), launcher.ts (dobel-klik exe), output.ts
src/tray/    tray Windows: index.ts (proses, lock, install), controller.ts (logika, diuji dgn host tiruan), popup.ts (tata letak popup klik kiri, varian B Ringkas), menu.ts (menu klik kanan), host.ts (skrip PowerShell: NotifyIcon + popup)
web/         UI tanpa build step (HTML + JS modul); web/embed.js = skrip yang disisipkan ke prototype static (komentar elemen); web/whatsnew.json = halaman "Yang baru" (tambah entri tiap naik versi)
scripts/     bundle.ts (esbuild → prototyper.cjs), release.ts (exe/msi/app/portable/npm), msi.ts (WiX .wxs), gen-icon.ts + winres.ts (icon/resource exe), gen-schema.ts, vitest.mjs
examples/    hello-static, hello-command (dipakai tes)
test/        vitest; route diuji dengan app.inject(); tes runtime memakai port 47100-47149
```

Aturan:

- Error selalu `AppError` dari `src/core/errors.ts` → respons `{ "error": { "code", "message", "details?" } }`.
- Request non-GET dari IP non-loopback ditolak. Jangan dilonggarkan tanpa diskusi.
- Pesan untuk pengguna dalam Bahasa Indonesia; identifier kode dalam bahasa Inggris.
- Fitur baru wajib disertai tes; `npm run typecheck && npm test` harus lolos. `npm test` memakai `scripts/vitest.mjs` (menormalkan huruf drive `d:` → `D:` di Windows; tanpa itu vitest gagal "reading 'config'").
