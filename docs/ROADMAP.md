# Roadmap Prototyper

> Catatan rencana kerja setelah v0.1. Untuk arsitektur yang sudah berjalan lihat [`DESIGN.md`](DESIGN.md).
> Terakhir diperbarui: 23 November 2026 (versi 0.4.1 + ekspor halaman yang belum dirilis).

## Sudah selesai

- [x] M0–M6 (DESIGN.md §13): manifest, registry, runtime static/command, log, HTTP API, CLI, Web UI, mode LAN
- [x] Web UI layout **Workspace** (DESIGN.md §10a): sidebar berkelompok + pencarian, pratinjau `<iframe>`, log live, palet perintah `Ctrl+K`, tema
- [x] Mendaftarkan folder tanpa `prototyper.json` lewat Web UI (deteksi → editor → Simpan & Daftarkan)
- [x] **#1 `prototyper new`**: template `static` / `vite-vanilla` / `vite-react`, `--from <file.html>`, `AGENTS.md` awal, `PROTOTYPER_WORKSPACE`, API `POST /api/prototypes/new`, dialog **Baru** di Web UI
- [x] **#2 Kelengkapan Web UI**: tombol **Install**, editor manifest (`PUT /api/prototypes/:id/manifest`), tombol **Matikan Prototyper**, `prototyper add` mendeteksi manifest otomatis
- [x] **#3 Komentar, tahap 1**: komentar per halaman di `.prototyper/comments.json`, API, CLI `prototyper comments`, panel di Web UI, badge di sidebar (DESIGN.md §10b)
- [x] **#3 Pertanyaan berpilihan**: `comments ask --option … [--multi]` tampil sebagai radio/checkbox; pertanyaan balik; label giliran Menunggu Anda/agent; `--waiting agent`
- [x] **#3 Komentar, tahap 2 — klik/blok elemen (static)**: tombol Komentari di pratinjau, anchor (selector + teks + quote), halaman otomatis, pin bernomor, fokus ke elemen; `static.inject: false` untuk mematikan (DESIGN.md §10c)
- [x] **#3 Komentar, tahap 3 — konteks komentar** (0.3.10, DESIGN.md §10d): `DECISIONS.md`, `comments context`, snapshot `anchor.html`, arsip otomatis
- [x] **Lampiran gambar** di komentar, balasan, dan pesan ke agent (0.4.0)
- [x] **Petunjuk agent otomatis**: blok bertanda di `AGENTS.md` + `CLAUDE.md` (`@AGENTS.md`) saat didaftarkan; `prototyper agents sync`; opt-out `agent.syncInstructions: false` (DESIGN.md §10e)
- [x] **#4 Agent dari Web UI**: Kerjakan dengan Claude (`claude -p`, izin terbatas, shim `prototyper`, log live, Stop, batas waktu), tombol per komentar, pratinjau static di-refresh setelah selesai (DESIGN.md §10f)
- [x] **#4 Multi-agent**: deteksi agent lokal (`prototyper agents list`, dialog Agent lokal, `PROTOTYPER_AGENT_BIN_<ID>`), pilihan agent saat Kerjakan; Codex teruji (codex-cli 0.169); preset Gemini/Copilot eksperimental
- [x] **#4 Lanjut sesi Claude** (`--resume`, 0.3.11)
- [x] **Checkpoint run agent + Batalkan**: snapshot sebelum/sesudah run di repo git bayangan, tombol Batalkan (N file), deteksi bentrok (0.3.9, DESIGN.md §10f)
- [x] **Live-reload static**: `fs.watch` → SSE → `embed.js` memuat ulang halaman (CSS diganti tanpa muat ulang); `static.liveReload: false` untuk mematikan (0.3.8, DESIGN.md §7)
- [x] **#5 Distribusi**: biner tunggal Node SEA (`src/boot/sea.ts`), portable, paket npm (`npm run release`, docs/RELEASE.md); installer MSI (0.3.0)
- [x] **Tray Windows** (0.2.0, DESIGN.md §10g): popup + menu, pembaruan dari tray, Run key; daftar ringkas 5 per halaman + label Prototype/Desain sistem (0.4.1)
- [x] **Pembaruan**: paket aplikasi kecil tanpa ganti exe (0.3.0), pembaruan Web UI tanpa restart (0.3.3), `prototyper update` dari CLI, halaman **Yang baru**
- [x] **Desain sistem** (0.4.0, DESIGN.md §10h): template `design-system`, `ds use/sync/detach/local`, sebarkan ke semua pemakai
- [x] **LAN per prototype** (`prototyper lan <id> on|off`) dan mode LAN dari tray (0.3.11–0.4.0)
- [x] **Edit dari HP** (0.4.0): pairing perangkat dengan QR (`src/core/devices.ts`), hak akses per request (`src/server/access.ts`), tampilan mobile
- [x] **Dialog pilih file/folder OS** untuk tombol **Pilih…** (0.4.0)
- [x] **Ekspor halaman** ke PNG/JPG/PDF lewat Chromium headless (`prototyper export`), belum dirilis
- [x] Tes jalan di Windows lewat `scripts/vitest.mjs` (normalisasi huruf drive)
- [x] Commit baseline

## Perlu diverifikasi (oleh Ega, di Windows)

- [x] `npm install`, `npm run typecheck`, dan `npm test` lolos di Windows (Node 24.16)
- [x] `prototyper shutdown` dengan prototype Vite yang berjalan tidak meninggalkan `node.exe`, dan portnya dilepas
- [x] Run Claude Code sungguhan dari Web UI (manual)
- [x] Preset Codex diuji dengan codex-cli 0.169 (login ChatGPT) → `tested`
- [x] Stop/restart satu prototype command dari Web UI tidak meninggalkan `node.exe` (diuji 23 Nov 2026 dengan exe terpasang + Vite: rantai `cmd → npm → cmd → vite` mati semua, port lepas)
- [x] Stop run agent dari Web UI tidak meninggalkan proses `claude`/`node.exe` (diuji 23 Nov 2026 dengan Claude Code: `claude.exe` + `conhost.exe` mati, status `stopped`)
- [x] Akses dari HP lewat LAN dan pairing (izin Windows Firewall untuk port 4000 dan 4100–4199). Diuji 23 Nov 2026 dari Android; jaringan laptop berprofil Public, aturan `prototyper.exe` dibuat Windows hanya untuk Public. Dari HP juga diuji: komentar, Kerjakan + Batalkan agent, start/stop prototype, dan operasi khusus komputer ditolak
- [ ] Preset Gemini CLI / Copilot CLI dengan agent aslinya → tandai `tested` di `PRESETS`

## Rencana

Urutan yang disarankan:

1. Verifikasi yang tersisa di atas.
2. Rilis ekspor halaman (naikkan versi + entri `web/whatsnew.json`).
3. **MCP server**.
4. Lanjutan #3 dan #4 (daftar di bawah), sesuai kebutuhan.

### #1 Membuat prototype baru

Dasar selesai. Belum:

- Template TypeScript (`vite-react-ts`) bila dibutuhkan.
- Impor beberapa file (HTML + aset, atau `.zip`) sekaligus. Saat ini hanya satu file HTML.

### #3 Komentar pada prototype

Tahap 1–3 selesai untuk mode static. Belum:

- Komentar elemen di mode **command**: butuh reverse proxy di depan dev server (risiko bentrok dengan HMR/WebSocket), atau tag skrip manual ke `http://localhost:4000/...`. Ditunda.
- Selector bisa usang bila struktur halaman berubah: pertimbangkan beberapa kandidat selector atau posisi relatif.
- Jejak git (trailer `Prototyper-Comment: c12`).
- `prototyper comments search` dan `prototyper decisions compact`.
- Tampilkan komentar arsip di Web UI (filter "Semua" saat ini hanya komentar di `comments.json`).

### #4 Agent dari Web UI

Dasar selesai (Claude dan Codex teruji, Gemini/Copilot eksperimental). Belum:

- Lanjut sesi untuk Codex (`codex exec resume`) bila sudah diuji. Saat ini hanya Claude.
- Parsing output JSON Codex (`--json`) agar log lebih rapi.
- Agent kustom lewat perintah bebas (bukan hanya preset).
- `prototyper comments wait` untuk sesi agent interaktif di terminal (menunggu sampai ada komentar `--waiting agent`).
- Sengaja **tidak**: menjalankan agent otomatis saat ada komentar baru atau saat pengguna menjawab. Agent tetap berjalan atas permintaan.

### MCP server

- Di atas HTTP API yang sama (prototype + komentar + run agent), untuk agent tanpa akses shell (mis. Claude Desktop); termasuk tool `get_comment_context`.

### Nanti

- Auto-restart prototype yang crash.
- Penandatanganan kode exe/MSI (saat ini memunculkan peringatan SmartScreen).
