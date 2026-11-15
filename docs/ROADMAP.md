# Roadmap Prototyper

> Catatan rencana kerja setelah v0.1. Untuk arsitektur yang sudah berjalan lihat [`DESIGN.md`](DESIGN.md).
> Terakhir diperbarui: 15 November 2026.

## Sudah selesai

- [x] M0–M6 (DESIGN.md §13): manifest, registry, runtime static/command, log, HTTP API, CLI, Web UI, mode LAN
- [x] Web UI layout **Workspace** (DESIGN.md §10a): sidebar berkelompok + pencarian, pratinjau `<iframe>`, log live, palet perintah `Ctrl+K`, tema
- [x] Mendaftarkan folder tanpa `prototyper.json` lewat Web UI (deteksi → editor → Simpan & Daftarkan)
- [x] **#1 `prototyper new`**: template `static` / `vite-vanilla` / `vite-react`, `--from <file.html>`, `AGENTS.md` awal, `PROTOTYPER_WORKSPACE`, API `POST /api/prototypes/new`, dialog **Baru** di Web UI
- [x] **#2 Kelengkapan Web UI**: tombol **Install**, editor manifest (`PUT /api/prototypes/:id/manifest`), tombol **Matikan Prototyper**, `prototyper add` mendeteksi manifest otomatis
- [x] **#3 Komentar, tahap 1**: komentar per halaman di `.prototyper/comments.json`, API, CLI `prototyper comments`, panel di Web UI, badge di sidebar (DESIGN.md §10b)
- [x] **#3 Pertanyaan berpilihan**: `comments ask --option … [--multi]` tampil sebagai radio/checkbox; pertanyaan balik; label giliran Menunggu Anda/agent; `--waiting agent`
- [x] **#3 Komentar, tahap 2 — klik/blok elemen (static)**: tombol Komentari di pratinjau, anchor (selector + teks + quote), halaman otomatis, pin bernomor, fokus ke elemen; `static.inject: false` untuk mematikan (DESIGN.md §10c)
- [x] **Petunjuk agent otomatis**: blok bertanda di `AGENTS.md` + `CLAUDE.md` (`@AGENTS.md`) saat didaftarkan; `prototyper agents sync`; opt-out `agent.syncInstructions: false` (DESIGN.md §10e)
- [x] **#4 Agent dari Web UI**: Kerjakan dengan Claude (`claude -p`, izin terbatas, shim `prototyper`, log live, Stop, batas waktu), tombol per komentar, pratinjau static di-refresh setelah selesai (DESIGN.md §10f)
- [x] **#4 Multi-agent**: deteksi agent lokal (`prototyper agents list`, dialog Agent lokal, `PROTOTYPER_AGENT_BIN_<ID>`), pilihan agent saat Kerjakan; Codex teruji (codex-cli 0.169); preset Gemini/Copilot eksperimental
- [x] **Live-reload static**: `fs.watch` → SSE → `embed.js` memuat ulang halaman (CSS diganti tanpa muat ulang); `static.liveReload: false` untuk mematikan (DESIGN.md §7)
- [x] Tes jalan di Windows lewat `scripts/vitest.mjs` (normalisasi huruf drive)

## Perlu diverifikasi (oleh Ega, di Windows)

- [x] `npm install`, `npm run typecheck`, dan `npm test` (87 tes, 12 file) lolos di Windows (Node 24.16)
- [x] `prototyper shutdown` dengan prototype Vite yang berjalan tidak meninggalkan `node.exe`, dan portnya dilepas
- [x] Run Claude Code sungguhan dari Web UI (manual)
- [ ] Stop/restart satu prototype command dari Web UI tidak meninggalkan `node.exe` (dicek manual di Task Manager)
- [ ] Stop run agent dari Web UI tidak meninggalkan proses `claude`/`node.exe`
- [ ] Akses dari HP lewat `--lan` (izin Windows Firewall untuk port 4000 dan 4100–4199)
- [x] Preset Codex diuji dengan codex-cli 0.169 (login ChatGPT) → `tested`
- [ ] Preset Gemini CLI / Copilot CLI dengan agent aslinya → tandai `tested` di `PRESETS`
- [ ] Commit baseline pertama (semua file masih untracked)

## Rencana

Urutan yang disarankan:

1. **Commit baseline** + verifikasi yang tersisa di atas.
2. **#3 tahap 3 — konteks komentar** (DECISIONS.md, `comments context`, arsip). Paling berdampak untuk kualitas kerja agent, dan sekarang komentar elemen sudah ada sehingga `related` bisa memakai anchor.
3. **Lanjutan #4** (agent): `--resume` sesi Claude, uji preset lain.
4. ~~**Live-reload static**~~ ✓ (0.3.8).
5. **MCP server**.
6. **#5 `.exe`** terakhir, supaya semua fitur ikut terbungkus.

### #1 Membuat prototype baru ✓

Selesai. Catatan lanjutan:

- Template TypeScript (`vite-react-ts`) bila dibutuhkan.
- Impor beberapa file (HTML + aset, atau `.zip`) sekaligus. Saat ini hanya satu file HTML.

### #2 Kelengkapan Web UI ✓

Selesai.

### #3 Komentar pada prototype

Tahap 1 (komentar per halaman + pertanyaan berpilihan) dan tahap 2 untuk mode static selesai.

**Sisa tahap 2:**

- Mode **command**: butuh reverse proxy di depan dev server (risiko bentrok dengan HMR/WebSocket), atau tag skrip manual ke `http://localhost:4000/...`. Ditunda.
- Selector bisa usang bila struktur halaman berubah; pertimbangkan beberapa kandidat selector / posisi relatif, plus snapshot `outerHTML` (tahap 3).

**Tahap 3 — konteks komentar** (belum dikerjakan, rincian di DESIGN.md §10d):

- `resolve --note` wajib untuk role agent; setiap `resolve` menambah satu baris ke `.prototyper/DECISIONS.md`.
- `prototyper comments context <id> <cid>` + `GET /prototypes/:id/comments/:cid/context`: thread, komentar resolved terkait (page/anchor sama), dan keputusan relevan, dibatasi agar hemat token.
- Snapshot elemen: potongan `outerHTML` di `anchor`.
- Arsip otomatis komentar resolved lama ke `.prototyper/comments-archive/YYYY-MM.json` supaya `comments.json` tetap kecil.
- Blok `AGENTS.md` dan prompt run agent diperbarui: baca `DECISIONS.md` dan jalankan `comments context` sebelum mengerjakan komentar.

### #4 Agent dari Web UI — lanjutan

Dasar selesai (Claude dan Codex teruji, Gemini/Copilot eksperimental). Belum:

- Melanjutkan sesi Claude sebelumnya (`--resume`) agar konteks tidak hilang antar run.
- Uji preset Gemini/Copilot dengan versi aslinya; parsing output JSON Codex (`--json`) agar log lebih rapi.
- Agent kustom lewat perintah bebas (bukan hanya preset).
- `prototyper comments wait` untuk sesi agent interaktif di terminal (menunggu sampai ada komentar `--waiting agent`).
- Sengaja **tidak**: menjalankan agent otomatis saat ada komentar baru atau saat pengguna menjawab — tetap atas permintaan.

### #5 Distribusi sebagai `.exe` (Node SEA)

Status: diusulkan.

- Node 24: belum ada `node --build-sea` (baru di Node 25.5) → pakai blob `--experimental-sea-config` + `postject` ke salinan `node.exe`; dibungkus dalam `npm run build:exe`.
- SEA Node 24 hanya menjalankan satu skrip CommonJS → bundle dengan esbuild.
- Penyesuaian kode: `web/` (termasuk `embed.js`) dan `package.json` dibaca lewat `node:sea` `getAsset()`, bukan `import.meta.url`; auto-start daemon memanggil `prototyper.exe serve`; shim agent (`<HOME>/bin/prototyper.cmd`) menunjuk ke exe; klik dua kali → serve + buka Web UI di browser.
- Konsekuensi: ukuran ±80–120 MB, peringatan SmartScreen (tidak ditandatangani), fitur SEA masih Stability 1.1.
- Build harus di Windows (butuh `node.exe` Windows).
- Alternatif yang ditimbang: Bun/Deno compile (risiko kompatibilitas Fastify & kill tree), shortcut `.cmd` + `npm link` (tetap butuh Node).

### Nanti

- MCP server di atas HTTP API yang sama (prototype + komentar + run agent), untuk agent tanpa akses shell (mis. Claude Desktop); termasuk tool `get_comment_context`
- `comments search` dan `prototyper decisions compact`
- Auto-restart prototype yang crash
