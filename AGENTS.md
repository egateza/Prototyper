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
prototyper comments reply <id> <commentId> "apa yang diubah"   # lapor hasil; komentar tetap open
prototyper comments ask <id> <commentId> "pertanyaan" --option "A" --option "B" [--multi]
```

- Jangan menyalin kode prototype ke repo ini; prototype tinggal di foldernya sendiri.
- Folder prototype biasanya sudah punya bagian `<!-- prototyper:start -->` di `AGENTS.md` (dan `CLAUDE.md` → `@AGENTS.md`) yang ditulis Prototyper saat didaftarkan; ikuti itu. Bila belum ada: `prototyper agents sync <id>`.
- "Kerjakan komentar di prototype X": ambil komentar dengan `--waiting agent`, kerjakan satu per satu (perhatikan `page`, balasan, dan `answer` pada pertanyaan berpilihan), lalu laporkan hasilnya dengan `comments reply` dan biarkan komentar tetap open. **Jangan `resolve`**: pengguna yang memeriksa hasil dan menutup komentar (kecuali pengguna eksplisit meminta agent menutupnya). Bila ada beberapa kemungkinan, pakai `comments ask` dengan `--option` (tampil sebagai radio/checkbox di Web UI) dan biarkan tetap open; pertanyaan balik dari pengguna dijawab dengan `comments reply`. Komentar `waitingFor: "user"` jangan dikerjakan dulu. Komentar disimpan di `<folder>/.prototyper/comments.json` (boleh dibaca langsung).
- Prototype baru: `prototyper new <id> --template static|vite-vanilla|vite-react --json` → dapat `path`; isi file di sana (impor HTML: `--from <file.html>`). Folder yang sudah ada: `prototyper add <folder>` (manifest dideteksi bila belum ada), lalu periksa `prototyper.json`.
- Mode static mengirim `Cache-Control: no-store`: cukup refresh setelah edit. Mode command biasanya punya HMR; bila tidak, `restart`.
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
npm run release      # berkas rilis untuk OS ini: exe (Node SEA) + portable + npm → release/ (lihat docs/RELEASE.md)
```

Struktur:

```
src/core/    appfiles (APP_DIR/APP_MODE: source|dist|bundle|sea, cliCommand), config, manifest (zod), detect (init), scaffold (new + template), agentfiles (AGENTS.md/CLAUDE.md), comments, embed (sisip skrip pratinjau), agent (menjalankan claude -p), registry, state, ports, logs, runtime, views
src/server/  app.ts (buildApp), routes/health.ts, routes/prototypes.ts, routes/comments.ts, routes/agent.ts
src/cli/     index.ts (perintah), comments.ts (prototyper comments …), client.ts (HTTP + auto-start daemon), output.ts
web/         UI tanpa build step (HTML + JS modul); web/embed.js = skrip yang disisipkan ke prototype static (komentar elemen)
scripts/     bundle.ts (esbuild → prototyper.cjs), release.ts (exe/portable/npm), gen-schema.ts, vitest.mjs
examples/    hello-static, hello-command (dipakai tes)
test/        vitest; route diuji dengan app.inject(); tes runtime memakai port 47100-47149
```

Aturan:

- Error selalu `AppError` dari `src/core/errors.ts` → respons `{ "error": { "code", "message", "details?" } }`.
- Request non-GET dari IP non-loopback ditolak. Jangan dilonggarkan tanpa diskusi.
- Pesan untuk pengguna dalam Bahasa Indonesia; identifier kode dalam bahasa Inggris.
- Fitur baru wajib disertai tes; `npm run typecheck && npm test` harus lolos. `npm test` memakai `scripts/vitest.mjs` (menormalkan huruf drive `d:` → `D:` di Windows; tanpa itu vitest gagal "reading 'config'").
