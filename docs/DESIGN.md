# Prototyper — Dokumen Rancangan (v0.1)

> Status: **v0.1 — M0–M6 terimplementasi**, ditambah `prototyper new`, komentar (termasuk klik elemen di mode static), petunjuk agent otomatis, dan menjalankan agent dari Web UI. Terakhir diperbarui: 15 November 2026.
> Baca juga `AGENTS.md` untuk panduan singkat bagi LLM agent, dan [`ROADMAP.md`](ROADMAP.md) untuk rencana berikutnya.

## 1. Tujuan

Prototyper adalah aplikasi lokal untuk **mendaftarkan, memperbarui, dan menjalankan prototype** yang tersimpan di repo/folder masing-masing, sehingga prototype bisa dikerjakan oleh **LLM agent apa pun** (Claude dari org mana pun, Codex, Gemini CLI, Cursor, dsb.) dan oleh manusia lewat UI.

### Non-goals (v1)

- Tidak di-host di domain/cloud. Hanya `localhost`, opsional dibagikan via IP LAN + port.
- Tidak menyalin atau memiliki kode prototype. Prototyper hanya menyimpan *path*.
- Tidak ada multi-user/auth kompleks.
- Prototyper sendiri tidak mengedit kode prototype; itu tugas agent/manusia. (Prototyper boleh *menjalankan* agent lokal atas permintaan pengguna, §10f, dan menulis blok petunjuk bertanda di `AGENTS.md`/`CLAUDE.md`, §10e.)

## 2. Keputusan

| Area | Keputusan |
|---|---|
| Runtime | Node.js ≥ 22.12 (dikembangkan di Node 24, Windows), TypeScript 7, ESM (NodeNext) |
| Backend | **Fastify 5** + `@fastify/static` |
| Registrasi | **Manifest `prototyper.json` di tiap folder prototype + registry pusat** yang hanya berisi daftar path |
| Mode jalan | **`static`** (Prototyper serve folder) dan **`command`** (mis. `npm run dev`), port dialokasikan otomatis |
| Akses agent | **CLI + HTTP API**; semua perintah CLI punya `--json`. MCP server menyusul di atas API yang sama |
| Data komentar | File di folder prototype (`.prototyper/comments.json`), bukan di Prototyper — agent bisa membaca tanpa Prototyper |
| UI | Web UI yang di-serve Fastify, tanpa build step (HTML + modul JS) |

## 3. Arsitektur

```
            ┌──────────── LLM agent / manusia ────────────┐
            │                                              │
       CLI `prototyper`                              Browser (UI)
            │  (registry & komentar langsung,              │
            │   run ops via HTTP)                          │
            ▼                                              ▼
     ┌───────────────────── Daemon (Fastify, :4000) ──────────────────┐
     │  HTTP API /api/*      Web UI /                                  │
     │  ┌──────────┐ ┌──────────┐ ┌───────┐ ┌─────────┐ ┌───────────┐  │
     │  │ Registry │ │ Manifest │ │ Ports │ │ Runtime │ │AgentRunner│  │
     │  └──────────┘ └──────────┘ └───────┘ └─────────┘ └───────────┘  │
     │        StaticServer (1 instance/port, sisip embed.js)           │
     └────────────────────────────────────────────────────────────────┘
            │                                   │
   PROTOTYPER_HOME/registry.json       D:\...\prototype-a\prototyper.json
   PROTOTYPER_HOME/state.json          D:\...\prototype-a\.prototyper\comments.json
   PROTOTYPER_HOME/logs/<id>.log       D:\...\prototype-a\AGENTS.md, CLAUDE.md
   PROTOTYPER_HOME/logs/<id>.agent.log
   PROTOTYPER_HOME/bin/prototyper(.cmd)   (shim untuk agent)
```

- **Core** (`src/core`) berisi logika murni yang dipakai bersama oleh CLI dan daemon.
- **Daemon** memiliki semua proses prototype dan run agent yang berjalan. Hanya daemon yang boleh start/stop.
- **CLI**: operasi registry (`new`, `init`, `add`, `remove`, `list`, `info`, `validate`, `agents sync`) dan `comments` bekerja langsung pada file sehingga tetap jalan tanpa daemon. Operasi run (`start`, `stop`, `restart`, `install`, `status`, `logs --follow`, `shutdown`) memanggil HTTP API; bila daemon belum jalan, CLI menyalakannya otomatis (detached).

## 4. Manifest `prototyper.json`

Diletakkan di root folder prototype. Ini *sumber kebenaran* untuk info prototype; agent yang membuka repo prototype langsung bisa membacanya.

### Contoh mode static (mis. artifact HTML yang diekspor)

```json
{
  "$schema": "https://raw.githubusercontent.com/egateza/prototyper/main/schemas/prototyper.schema.json",
  "id": "kalkulator-margin",
  "name": "Kalkulator Margin",
  "description": "Prototype hitung margin grosir vs eceran",
  "type": "static",
  "static": {
    "root": ".",
    "index": "index.html",
    "spa": false
  },
  "agent": { "instructions": "AGENTS.md" },
  "tags": ["pos", "kalkulator"]
}
```

### Contoh mode command (mis. proyek Vite)

```json
{
  "id": "pos-sembako-ui",
  "name": "POS Sembako UI",
  "type": "command",
  "command": {
    "install": "npm install",
    "run": "npm run dev -- --port {port} --host {host}",
    "cwd": ".",
    "env": { "NODE_ENV": "development" },
    "portEnv": "PORT",
    "readyPattern": "Local:",
    "readyTimeoutSec": 60
  },
  "agent": { "instructions": "AGENTS.md" }
}
```

### Aturan field

| Field | Wajib | Keterangan |
|---|---|---|
| `id` | ya | slug `^[a-z0-9][a-z0-9-]{1,62}$`, unik di registry |
| `name` | ya | nama tampilan |
| `description` | tidak | |
| `type` | ya | `static` \| `command` |
| `static.root` | tidak | folder relatif yang di-serve, default `.` |
| `static.index` | tidak | default `index.html` |
| `static.spa` | tidak | jika `true`, path tak dikenal fallback ke `index` |
| `static.inject` | tidak | default `true`: sisipkan skrip pratinjau (komentar elemen, §10c). `false` = HTML dikirim apa adanya |
| `command.run` | ya (command) | perintah start; placeholder `{port}` dan `{host}` diganti saat jalan |
| `command.install` | tidak | dijalankan via `prototyper install <id>` / tombol Install, bukan otomatis |
| `command.cwd` | tidak | relatif ke folder prototype, default `.` |
| `command.env` | tidak | env tambahan |
| `command.portEnv` | tidak | nama env yang diisi port, default `PORT` |
| `command.readyPattern` | tidak | regex pada stdout/stderr penanda siap; tanpa ini dipakai TCP probe ke port |
| `command.readyTimeoutSec` | tidak | default 60 (maks. 600) |
| `agent.instructions` | tidak | file panduan untuk agent, default `AGENTS.md` |
| `agent.syncInstructions` | tidak | `false` = Prototyper tidak menulis blok petunjuk di file instruksi dan `CLAUDE.md` (§10e) |
| `tags` | tidak | |

Field tak dikenal ditolak (`strict`). Validasi memakai **zod**; JSON Schema (`schemas/prototyper.schema.json`) digenerate dari zod (`npm run schema`, ada tes yang mengecek sinkron) agar editor dan agent bisa memvalidasi tanpa menjalankan Prototyper.

## 5. Konfigurasi, registry & state

### Konfigurasi (env; flag CLI menang atas env)

| Env | Flag | Default | Keterangan |
|---|---|---|---|
| `PROTOTYPER_HOME` | `--home` | `~/.prototyper` | data: registry, state, log, shim |
| `PROTOTYPER_PORT` | `-p/--port` | `4000` | port daemon; tidak boleh di dalam rentang prototype |
| `PROTOTYPER_PORT_RANGE` | | `4100-4199` | rentang port prototype |
| `PROTOTYPER_LAN` | `--lan` | — | `1` = mode LAN (§11) |
| `PROTOTYPER_WORKSPACE` | | `<HOME>/prototypes` | folder induk prototype baru (`new`) |
| `PROTOTYPER_AGENT_DEFAULT` | | `claude` | agent default untuk run dari Web UI |
| `PROTOTYPER_AGENT_TIMEOUT_MIN` | | `20` | batas waktu satu run agent |
| `PROTOTYPER_AGENT_AUTH` | | `login` | `apikey` = jalankan Claude dengan `--bare` |
| `PROTOTYPER_AGENT_BIN_<ID>` | | cari di PATH | path executable agent (`_CLAUDE`, `_CODEX`, `_GEMINI`, `_COPILOT`; `PROTOTYPER_AGENT_BIN` = Claude) |

**Catatan Windows:** karena drive C hampir penuh, set `PROTOTYPER_HOME=D:\prototyper-data` (log bisa membesar) dan `PROTOTYPER_WORKSPACE=D:\Prototypes`.

### `registry.json` — hanya pointer

```json
{
  "version": 1,
  "prototypes": [
    { "id": "pos-sembako-ui", "path": "D:\\IdeaProjects\\pos-sembako-ui", "addedAt": "2026-11-15T07:00:00Z" }
  ]
}
```

- `id` di registry adalah cache dari manifest; saat dibaca, manifest dimuat ulang. Bila `id` di manifest berubah, registry diperbarui; bila bentrok, prototype ditandai `invalid`.
- Path tidak ditemukan / manifest rusak → status `invalid` dengan pesan error, tidak menghapus entri.
- Penulisan file atomik (tulis ke `.tmp` lalu rename) agar CLI dan daemon tidak saling merusak.

### `state.json` — milik daemon

Port terakhir tiap prototype (*sticky port*, supaya URL stabil) dan PID proses yang berjalan.

Bila daemon mati tidak wajar, PID yang tersisa **tidak dibunuh otomatis** saat daemon start berikutnya (PID bisa sudah dipakai ulang oleh proses lain, terutama di Windows). Daemon hanya menampilkan peringatan berisi PID dan perintah `taskkill` untuk dicek manual; alokasi port otomatis menghindari port yang masih terpakai.

## 6. Port

- Daemon/UI: `4000`.
- Prototype: rentang `4100–4199`.
- Alokasi: pakai port sticky dari `state.json` bila masih bebas; jika tidak, cari port bebas pertama di rentang. Cek bebas dengan mencoba `net.createServer().listen(port, host)`.
- Satu prototype = satu port, baik `static` maupun `command`. Tidak memakai reverse proxy berbasis path karena dev server (Vite, Next, dsb.) sering rusak bila tidak di root `/`.

## 7. Menjalankan prototype

### Static
Daemon membuat instance Fastify terpisah + `@fastify/static` per prototype di port yang dialokasikan. Header `Cache-Control: no-store` agar perubahan file oleh agent langsung terlihat saat refresh (live-reload menyusul). Path yang memuat segmen `.prototyper` ditolak (404). Bila `static.inject` ≠ `false`, skrip pratinjau disisipkan ke setiap respons HTML (§10c).

### Command — Runtime (`src/core/runtime.ts`)
- `spawn(run, { shell: true, cwd, env })` dengan `PORT`/`{port}`/`{host}` terisi.
- **Status:** `stopped → starting → running`, atau `crashed` (exit tak terduga) / `failed` (tidak siap sebelum timeout).
- **Siap** bila `readyPattern` cocok atau TCP probe ke port berhasil.
- **Stop:** `npm run dev` memunculkan proses anak, jadi stop membunuh *process tree* lewat `killTree`: `taskkill /PID <pid> /T /F` di Windows, `kill(-pgid)` di Linux/macOS (spawn dengan `detached: true`).
- Setelah kill, stop menunggu sampai port benar-benar dilepas (maks. 5 detik) karena proses cucu (`cmd`/`sh` → `npm` → `node`) bisa melepas port sedikit lebih lambat.
- **Install:** `command.install` dijalankan sebagai proses terpisah dengan log yang sama.
- **Log:** stdout+stderr ke ring buffer (1000 baris terakhir) dan file `logs/<id>.log` (dirotasi saat > 5 MB). Bisa di-stream via SSE.
- Saat daemon berhenti (SIGINT/SIGTERM/SIGHUP atau `prototyper shutdown`), semua proses anak dan run agent di-stop.
- Tidak ada auto-restart di v1.

## 8. HTTP API

Base: `http://127.0.0.1:4000/api`. Semua respons JSON (kecuali SSE). Semua request non-GET dari IP non-loopback ditolak (`FORBIDDEN`).

### Prototype

| Method | Path | Fungsi |
|---|---|---|
| GET | `/health` | versi, uptime, `home`, `workspace` |
| GET | `/prototypes` | daftar + status + URL + jumlah komentar |
| POST | `/prototypes` | daftarkan `{ "path": "..." }`; opsional `manifest` (ditulis dulu sebagai `prototyper.json`, cek bentrok id/folder sebelum menulis) dan `overwrite: true` untuk menimpa file yang ada. Respons memuat `agentFiles` |
| POST | `/prototypes/new` | buat dari template `{ "id", "template?": "static\|vite-vanilla\|vite-react", "name?", "description?", "dir?", "html?", "install?" }` lalu daftarkan; default folder `<workspace>/<id>`; template Vite menjalankan `npm install` kecuali `install: false`. Respons = view + `template`, `files`, `install`, `agentFiles` |
| POST | `/manifest/detect` | periksa folder: manifest yang ada (`exists`, `valid`, `raw`) atau hasil deteksi untuk diedit (`detected`, `notes`); opsional `type`, `id`, `name`, `run` |
| GET | `/prototypes/:id` | detail (manifest, path, status, url, instructions, comments) |
| DELETE | `/prototypes/:id` | hapus dari registry (tidak menghapus file) |
| PUT | `/prototypes/:id/manifest` | tulis ulang `prototyper.json` `{ "manifest": {...} }` (validasi dulu; ganti id ditolak bila bentrok atau prototype sedang berjalan) |
| POST | `/prototypes/:id/reload` | baca ulang manifest |
| POST | `/prototypes/:id/start` \| `stop` \| `restart` | jalankan / hentikan / restart |
| POST | `/prototypes/:id/install` | jalankan `command.install` |
| GET | `/prototypes/:id/logs?tail=200` | log terakhir |
| GET | `/prototypes/:id/logs/stream?tail=100` | SSE log realtime |
| POST | `/shutdown` | hentikan daemon + semua prototype |

### Komentar (§10b)

| Method | Path | Fungsi |
|---|---|---|
| GET | `/prototypes/:id/comments?status=open\|resolved\|all&page=&waiting=user\|agent` | `{ id, counts: { open, resolved, waitingUser }, comments }` |
| POST | `/prototypes/:id/comments` | tambah `{ text, page?, author?, role?, anchor? }` |
| POST | `/prototypes/:id/comments/:cid/replies` | balas `{ text, author?, role? }`; pertanyaan berpilihan `{ text, options: [...], multi? }`; jawaban `{ answerTo, choices: [...], text? }` |
| POST | `/prototypes/:id/comments/:cid/resolve` | selesai `{ note?, author? }` |
| POST | `/prototypes/:id/comments/:cid/reopen` | buka lagi |
| DELETE | `/prototypes/:id/comments/:cid` | hapus |

### Agent (§10f)

| Method | Path | Fungsi |
|---|---|---|
| GET | `/agents?refresh=1` | agent lokal: tersedia/tidak, versi, path, dukungan, izin, cara install; `refresh=1` memaksa cek ulang |
| GET | `/prototypes/:id/agent` | run yang sedang/terakhir berjalan |
| POST | `/prototypes/:id/agent/run` | `{ agent?, commentIds?, message? }` → 202; satu run per prototype |
| POST | `/prototypes/:id/agent/stop` | hentikan run |
| GET | `/prototypes/:id/agent/logs?tail=` | log run |
| GET | `/prototypes/:id/agent/logs/stream` | SSE log run |

### Error

Format seragam: `{ "error": { "code": "NOT_FOUND", "message": "...", "details": ["..."] } }` (`details` hanya ada bila relevan, mis. daftar masalah manifest). Selalu dilempar sebagai `AppError` (`src/core/errors.ts`).

| Kode | HTTP | Arti |
|---|---|---|
| `BAD_REQUEST` | 400 | input salah |
| `FORBIDDEN` | 403 | operasi mengubah dari luar mesin lokal |
| `NOT_FOUND` | 404 | prototype/komentar/route tidak ada |
| `CONFLICT` | 409 | id/folder ganda, port habis, run agent sudah berjalan |
| `INVALID_MANIFEST` | 422 | `prototyper.json` hilang/tidak valid |
| `START_FAILED` | 500 | proses gagal/keluar/timeout sebelum siap |
| `DAEMON_UNAVAILABLE` | 503 | (CLI) daemon tidak bisa dihubungi/dinyalakan |

## 9. CLI

Nama binary: `prototyper` (tanpa `npm link`: `npm run cli -- <perintah>`). Semua perintah mendukung `--json` (output mesin, tanpa warna) dan exit code ≠ 0 bila gagal — penting agar agent mana pun bisa memakainya lewat shell.

Opsi global (boleh di mana saja): `--json`, `--home <dir>`, `-p/--port <port>`, `--lan`.

```
prototyper serve                             # jalankan daemon (foreground)
prototyper new <id> [-t static|vite-vanilla|vite-react] [--from <file.html>] [-d <folder>] [--name] [--description] [--no-install] [--start]
prototyper init [dir] [-t static|command] [--id] [--name] [--run "<cmd>"] [-f]
prototyper add <dir> [-t] [--id] [--run] [--start]   # daftarkan; manifest dideteksi bila belum ada
prototyper remove <id>
prototyper list
prototyper info <id>
prototyper validate [dir]
prototyper install <id>
prototyper start|stop|restart <id>           # start cetak URL
prototyper status
prototyper logs <id> [-n 200] [-f]           # tanpa daemon: dibaca dari file log; -f butuh daemon
prototyper shutdown                          # hentikan daemon + semua prototype
prototyper tray [--foreground] [--restore a,b]   # Windows: ikon tray (lihat §10g); default berjalan di latar
prototyper agents list                       # agent coding lokal yang terdeteksi
prototyper agents sync [id]                  # tulis ulang blok petunjuk AGENTS.md/CLAUDE.md
prototyper comments <id> [-a|--resolved] [--page /x] [-w agent|user]
prototyper comments add <id> "<teks>" [--page /x] [--selector <css> [--quote <teks>]] [--author] [--role]
prototyper comments reply <id> <commentId> "<teks>" [--author] [--role user]
prototyper comments ask <id> <commentId> "<pertanyaan>" -o A -o B [--multi]
prototyper comments resolve <id> <commentId> [--note "<ringkasan>"]
prototyper comments reopen|rm <id> <commentId>
```

`comments` membaca/menulis file langsung (tanpa daemon). Penulis default dari CLI `agent` (role `agent`), dari Web UI `pengguna` (role `user`); `--author`/`--role` untuk mengganti.

`new`: folder tujuan harus belum ada atau kosong; id dicek bentrok sebelum menulis apa pun, dan folder yang baru dibuat dihapus lagi bila gagal. Template static = `index.html` + `style.css` + `app.js` (atau satu `index.html` dari `--from`); template Vite = `package.json` (Vite 8; `vite-react` + React 19, JSX tanpa TypeScript) dengan `command.run` memakai `{port}`/`{host}`. Semua template menulis `AGENTS.md` awal. Folder induk default: `PROTOTYPER_WORKSPACE`, atau `<PROTOTYPER_HOME>/prototypes`.

Deteksi `init` (juga dipakai `add` dan `/manifest/detect` bila manifest belum ada): ada `package.json` dengan script `dev` → `command` (Vite/Next/Astro otomatis diberi `--port {port} --host {host}`); ada `index.html` di `.`, `dist`, `build`, atau `public` → `static`; hanya script `start` → `npm start`; selain itu wajib `--type`/`--run`.

## 10. Alur kerja agent (agnostik)

1. `prototyper list --json` → pilih prototype.
2. `prototyper info <id> --json` → dapat `path`, `url`, `status`, dan letak `instructions`.
3. Baca `AGENTS.md` di folder prototype, edit file di `path`.
4. `prototyper start <id> --json` (atau `restart`) → buka/cek `url`.
5. `prototyper logs <id> -n 100 --json` untuk debug.
6. Komentar: `prototyper comments <id> --waiting agent --json` → kerjakan satu per satu → laporkan dengan `comments reply <id> <cid> "..."` dan biarkan open (agent tidak me-`resolve`; pengguna yang menutup komentar setelah memeriksa hasil); bila ada beberapa kemungkinan, `comments ask … --option …` dan biarkan tetap open.

Repo Prototyper sendiri juga punya `AGENTS.md` yang menjelaskan alur ini. Tidak ada fitur yang bergantung pada vendor agent tertentu; menjalankan agent dari Web UI (§10f) hanya kemudahan tambahan.

## 10a. Web UI

Layout **Workspace** (tanpa build step, `web/`):

- **Beranda** (dibuka tanpa `#id`, item Beranda di atas sidebar, klik logo, atau palet): ringkasan jumlah prototype / berjalan / komentar menunggu Anda / menunggu agent, daftar *Perlu perhatian*, kartu semua prototype (status, URL, badge komentar, Start/Stop), dan agent lokal. Tidak ada lagi pemilihan prototype otomatis; ↑/↓ dari beranda masuk ke prototype pertama.
- **Sidebar**: daftar dikelompokkan Aktif / Bermasalah / Berhenti, pencarian (`/`), filter, pindah pilihan dengan `↑`/`↓` atau `j`/`k`, badge komentar open (oranye bila ada yang menunggu Anda). Prototype terpilih disimpan di hash URL (`/#<id>`).
- **Sidebar bawah**: **Baru** (dialog buat dari template: id, nama, template, unggah HTML untuk static, opsi `npm install`, folder), **Daftarkan**, dan *Agent lokal*. Tombol power di samping versi mematikan daemon (`POST /shutdown`, dengan konfirmasi).
- **Detail**: aksi Start/Stop/Restart/Install/Hapus, pratinjau `<iframe>` saat `running` (bisa disembunyikan; pilihan disimpan di browser) dengan tombol Komentari (static), log live via SSE, tabel detail, dan `prototyper.json` (tombol Edit/Perbaiki → `PUT /prototypes/:id/manifest`). Kolom kanan: panel Komentar + bar agent.
- **Palet perintah** `Ctrl+K`, tema otomatis/terang/gelap.
- Polling `/api/prototypes` tiap 2 detik; bagian yang tidak berubah tidak di-render ulang agar iframe dan stream log tidak terputus.
- URL pratinjau memakai host yang sama dengan UI, sehingga tetap jalan saat dibuka dari LAN. Dibuka dari bukan-loopback, tombol yang mengubah state dinonaktifkan (mode baca saja).
- Dev server yang menolak di-embed (`X-Frame-Options`/CSP `frame-ancestors`) tetap bisa dibuka lewat tombol "buka di tab baru".

Desain berasal dari eksplorasi di prototype `prototyper-ui` (layout Galeri/Konsol tidak diambil).

Mendaftarkan folder di UI selalu memanggil `/manifest/detect` lebih dulu:

- manifest ada dan valid → langsung didaftarkan;
- belum ada → editor JSON berisi hasil deteksi (bisa ganti jenis static/command), lalu **Simpan & Daftarkan**;
- ada tapi tidak valid → editor berisi isi mentah file, simpan menimpa file.

Error validasi ditampilkan per field (`details`). File baru tidak ditulis bila manifest tidak valid atau id/folder bentrok.

## 10b. Komentar

- File: `<folder prototype>/.prototyper/comments.json` → `{ version: 1, nextId, comments: [{ id: "c1", page: "/kasir", anchor?, author, role, text, status: "open"|"resolved", createdAt, updatedAt, resolvedAt, resolvedBy, resolution, replies: [{ id, author, role, text, createdAt, options?, multi?, answerTo?, choices? }] }] }`. Disimpan di folder prototype agar agent mana pun bisa membaca tanpa Prototyper, dan boleh di-commit.
- id berurutan per prototype (`c1`, `c2`, …) dan tidak dipakai ulang setelah dihapus — mudah diketik agent. Balasan: `c1-r1`, `c1-r2`, …
- Setiap komentar/balasan punya `role` (`user`/`agent`); data lama tanpa `role` disimpulkan dari `author` (`agent` → agent).
- `page` dinormalkan menjadi path (`kasir` → `/kasir`, URL penuh → path-nya saja).
- `anchor` opsional: `{ selector, tag?, text?, quote? }` — elemen yang diklik / teks yang diblok di pratinjau (§10c), atau `--selector`/`--quote` dari CLI.
- **Pertanyaan berpilihan**: balasan dengan `options` (2–8, unik) dan opsional `multi`. **Jawaban**: balasan dengan `answerTo` (id pertanyaan) dan `choices` (teks opsi; tepat satu bila bukan `multi`), `text` opsional sebagai catatan. Balasan teks biasa saat pertanyaan masih tertunda = pertanyaan balik; pertanyaan tetap tertunda.
- Field turunan (tidak disimpan) di respons API/CLI: `waitingFor` (`user` bila entri terakhir dari agent, `agent` bila dari pengguna; `null` bila selesai), `pendingQuestions`, dan `answer` pada setiap pertanyaan.
- Penulisan atomik (file sementara + rename) dan diantrikan per file di dalam satu proses. CLI dan daemon menulis file yang sama; bentrok antarproses dianggap jarang (tulis terakhir menang).
- Server static menolak path yang memuat segmen `.prototyper` (404), sehingga komentar tidak bocor ke LAN.
- View prototype memuat `comments: { open, resolved, waitingUser }` (dipakai `info` dan badge sidebar).
- Web UI: panel di kolom kanan halaman detail; filter Open/Selesai/Semua; label Menunggu Anda/agent, yang menunggu Anda di urutan atas; pertanyaan berpilihan sebagai radio/checkbox + kolom teks (pilih = jawaban, tanpa pilih = pertanyaan balik; isian dipertahankan saat daftar dimuat ulang); Balas, Selesai, Buka lagi, Hapus; daftar dimuat ulang tiap ±4 detik agar perubahan dari agent langsung terlihat. Untuk mode static, halaman diisi otomatis dari pratinjau (§10c); untuk mode command diisi manual karena pratinjau berasal dari origin lain.

## 10c. Komentar pada elemen (pratinjau, mode static)

- Server static (bila `static.inject` ≠ `false`) menyajikan `/__prototyper/embed.js` (dari `web/embed.js`) dan menyisipkan `<script src="/__prototyper/embed.js" defer>` sebelum `</body>` pada setiap respons `text/html` (termasuk fallback SPA) lewat hook `onSend` (`src/core/embed.ts`).
- Skrip diam bila halaman tidak berada di iframe. Di pratinjau, ia mengirim `prototyper:ready {page}` ke induk; Web UI membalas `prototyper:hello` dan sejak itu skrip hanya berbicara dengan origin tersebut. Web UI hanya menerima pesan dari `contentWindow` iframe pratinjau dengan origin sama dengan URL pratinjau.
- Mode komentar (`prototyper:mode`): sorotan saat hover, klik memilih elemen, blok teks memilih teks (`quote`) + elemen induk bersama. Handler milik prototype dihentikan selama mode aktif (propagasi dihentikan di fase capture `window`; aksi bawaan hanya dicegah untuk click/submit agar seleksi teks tetap jalan). Esc membatalkan.
- `prototyper:pick {anchor, page}` → form komentar terisi chip elemen dan halaman. Path halaman juga dilaporkan saat navigasi SPA (`pushState`/`replaceState`/`popstate`/`hashchange`).
- `prototyper:pins` → pin bernomor (oranye bila menunggu pengguna) untuk komentar open berelemen di halaman yang sedang tampil; klik pin → `prototyper:pin-click` → komentar disorot. Chip elemen di komentar → `prototyper:focus` → elemen digulir dan di-flash.
- Selector: `#id` bila unik, selain itu jalur `tag:nth-of-type(n)` (atau `[data-testid]`) sampai id unik/`body`. Bisa usang bila struktur halaman berubah; `text`/`quote` membantu agent menemukan elemen.
- Mode command belum didukung (butuh reverse proxy di depan dev server, lihat ROADMAP).

## 10d. Konteks komentar (rencana)

Tujuan: agent yang mengerjakan sebuah komentar tahu riwayat dan keputusan sebelumnya tanpa membaca seluruh `comments.json`, sehingga tidak keluar konteks atau mengulang revisi yang sudah ditolak.

- **Thread** (sudah ada): `comments <id> --waiting agent --json` memuat balasan, pertanyaan berpilihan, `answer`, dan `anchor`.
- **Ringkasan wajib saat selesai**: untuk role `agent`, `resolve` wajib membawa `--note` (satu kalimat apa yang diubah). Catatan ini sumber log keputusan. (Saat ini `--note` masih opsional.)
- **Log keputusan** `<folder>/.prototyper/DECISIONS.md`: setiap `resolve` menambahkan satu baris `YYYY-MM-DD · c12 · /kasir · <selector anchor bila ada> · <note>` (append-only, atomik). Blok `AGENTS.md` meminta agent membacanya sebelum mulai.
- **Perintah konteks**: `prototyper comments context <id> <cid> [--json]` dan `GET /prototypes/:id/comments/:cid/context` → `{ comment, related, decisions }`: komentar beserta thread, komentar resolved di `page` yang sama dan anchor yang sama, serta baris `DECISIONS.md` yang relevan. Dibatasi (mis. 10 `related`, 20 `decisions`) agar hemat token.
- **Snapshot elemen**: `anchor` ditambah potongan `outerHTML` saat komentar dibuat, agar komentar tetap bermakna setelah selector usang.
- **Arsip**: agar `comments.json` tidak terus membesar, komentar resolved yang lebih tua dari N hari (default 30, `comments.archiveDays` di manifest) dipindah ke `.prototyper/comments-archive/YYYY-MM.json` saat file ditulis. `--all` dan `context` membaca arsip bila diminta (`--include-archive`); ringkasannya tetap ada di `DECISIONS.md`.
- **Jejak git** (opsional): bila agent commit, pesan memuat trailer `Prototyper-Comment: c12` agar bisa dilacak lewat `git log --grep`.
- **Nanti**: `comments search <id> "<kata>"`, `prototyper decisions compact <id>` untuk merangkum `DECISIONS.md` yang panjang, dan tool MCP `get_comment_context`.

## 10e. Petunjuk agent di folder prototype

- Saat didaftarkan (`POST /prototypes`, `POST /prototypes/new`, CLI `add`/`new`) dan saat `PUT /prototypes/:id/manifest`, Prototyper memanggil `syncAgentFiles` (`src/core/agentfiles.ts`).
- File instruksi (`agent.instructions`, default `AGENTS.md`): dibuat bila belum ada; bila ada, hanya blok di antara `<!-- prototyper:start -->` … `<!-- prototyper:end -->` yang diganti/ditambahkan di akhir. Isi blok: id, mode, cara menjalankan/refresh, alur komentar (`--waiting agent`, `reply` lalu biarkan open — agent tidak me-`resolve`, `ask --option`), dan shim `<PROTOTYPER_HOME>/bin/prototyper(.cmd)` sebagai fallback bila `prototyper` tidak ada di PATH. Fallback-nya sengaja shim, bukan path instalasi, agar isi blok sama di exe/portable/npm/source dan tidak berubah bolak-balik.
- `CLAUDE.md`: dibuat berisi `@AGENTS.md`; bila sudah ada dan belum mengimpor, ditambahkan blok bertanda berisi baris impor itu.
- `agent.syncInstructions: false` mematikan semuanya. Gagal menulis tidak menggagalkan pendaftaran (dilaporkan sebagai `agentFiles[].action = "error"`).
- Sinkron otomatis (`src/core/autosync.ts`): setiap kali daemon menyala (setelah `listen`, di belakang layar), shim CLI ditulis ulang lalu `syncAgentFiles(…, { onlyExisting: true })` dijalankan untuk semua prototype terdaftar. Dengan begitu, setelah Prototyper diperbarui, petunjuk di semua prototype mengikuti versi baru. `onlyExisting` hanya mengganti blok yang sudah ada: file tanpa penanda (belum dipasang atau sengaja dihapus) dilaporkan `missing` dan tidak dibuat ulang, dan `CLAUDE.md` tidak disentuh. Yang berubah atau gagal dicatat di log daemon. `PROTOTYPER_AUTO_SYNC=0` mematikan sinkron otomatis.
- `prototyper agents sync [id]` memasang lengkap secara manual, termasuk membuat file yang belum ada.

## 10f. Agent dari Web UI (Claude Code, Codex, Gemini CLI, Copilot CLI)

- Preset per agent di `PRESETS` (`src/core/agent.ts`): executable, argumen non-interaktif, izin, format output (`claude-stream` = stream-json diringkas; `text` = output apa adanya, ringkasan = baris terakhir), dan cara install. Aturan untuk agent dibuat per agent (`agentRules`): Claude/Gemini/Copilot memakai tool baca/edit dan shell hanya `prototyper`; Codex membaca file lewat shell dan mengedit dengan `apply_patch`, jadi shell diizinkan untuk membaca/mencari (batas tulis dijaga sandbox). Claude dan Codex `tested`; Gemini/Copilot `experimental` sampai diuji dengan versi aslinya. Codex: `exec --ignore-user-config --sandbox workspace-write --skip-git-repo-check` + `-c windows.sandbox="<nilai [windows] sandbox dari config.toml>"` (tanpanya sandbox Windows turun ke read-only); `PROTOTYPER_AGENT_CODEX_MODEL` → `-m`. Deteksi juga membaca PATH terbaru dari registry Windows (user + mesin), sehingga agent yang baru diinstal terdeteksi tanpa me-restart VS Code/daemon.
- Deteksi: `PROTOTYPER_AGENT_BIN_<ID>` bila di-set, selain itu cari di PATH (`.exe/.com`; di Windows juga shim npm `.cmd` → skrip JS-nya dijalankan langsung dengan Node), lalu `--version` (batas 15 dtk). Agent tersedia hanya bila `--version` sukses (mis. shim Copilot VS Code tanpa CLI terpasang = tidak tersedia). Hasil di-cache; `GET /agents?refresh=1` / tombol **Cek ulang** memaksa cek ulang. CLI: `prototyper agents list`.
- Run: `POST /prototypes/:id/agent/run { agent?, commentIds?, message? }`; default `PROTOTYPER_AGENT_DEFAULT` atau `claude`. Satu run per prototype; batas waktu `PROTOTYPER_AGENT_TIMEOUT_MIN` (default 20 menit); stop memakai `killTree`. Info run memuat `agent`, status (`running`/`done`/`failed`/`stopped`), ringkasan, dan exit code.
- Prompt: id prototype, fokus komentar (opsional), pesan pengguna (opsional), langkah alur komentar. Instruksi tambahan: tidak interaktif → bertanya lewat `comments ask/reply`; hanya ubah folder ini; jangan ubah `prototyper.json`, `.prototyper/`, `AGENTS.md`, `CLAUDE.md`.
- `prototyper` disediakan lewat shim `<PROTOTYPER_HOME>/bin/prototyper(.cmd)` yang ditambahkan di depan `PATH` proses agent (beserta `PROTOTYPER_HOME`/`PROTOTYPER_PORT`), sehingga tidak perlu `npm link`. Penanda sesi `CLAUDECODE` tidak diwariskan.
- Log run di `logs/<id>.agent.log` (+ SSE). Bila agent keluar tanpa output, log menyarankan menjalankannya di terminal atau mengatur `PROTOTYPER_AGENT_BIN_<ID>`.
- Web UI: bar agent di panel Komentar (dropdown agent yang tersedia — pilihan disimpan di browser — tombol Kerjakan, status, Stop, log live), tombol Kerjakan per komentar yang menunggu agent, dialog *Agent lokal* (status, versi, path, izin, cara install, Pakai). Saat run selesai komentar dimuat ulang dan pratinjau static di-refresh.
- Tidak ada pemicu otomatis (mis. menjalankan agent setiap ada komentar baru atau saat pengguna menjawab) — sengaja, agar pemakaian tetap atas permintaan pengguna.

Rincian Claude Code:

- Perintah: `claude -p "<prompt>" --output-format stream-json --verbose --permission-mode dontAsk --permission-prompts none --allowedTools "Read,Edit,Write,Glob,Grep,Bash(prototyper *),PowerShell(prototyper *)" --append-system-prompt …` di folder prototype (`--bare` bila `PROTOTYPER_AGENT_AUTH=apikey`).
- Output stream-json diringkas menjadi log (`💬` teks, `→` pemakaian tool, `✗` tool gagal, `✓` selesai); ringkasan akhir, jumlah langkah, dan estimasi biaya disimpan di info run.

## 10g. Tray Windows (`src/tray/`)

Rancangannya divalidasi lewat prototype `prototyper-runtime`: hanya ikon tray, tanpa jendela.

- **Proses**: `prototyper tray` menjalankan `tray --foreground` terlepas dari konsol (output ke `<home>/tray.log`), lalu keluar. Satu tray per home (`<home>/tray.pid`); bila sudah ada yang berjalan, Web UI dibuka. Dobel-klik `prototyper.exe` dari Explorer = `prototyper tray`.
- **Daemon terpisah dari tray**: tray berbicara lewat HTTP seperti CLI (`DaemonClient`), polling `/api/prototypes` tiap 2 detik. Jeda = `POST /api/shutdown`, lanjutkan = `ensure()`. Keluar juga mematikan daemon. Daemon yang dimatikan dari luar tampil sebagai "dijeda" dan tidak dinyalakan ulang otomatis.
- **Ikon tanpa modul native**: `host.ts` menulis skrip PowerShell (NotifyIcon WinForms) ke `<home>/tray/` dan menjalankannya. Protokolnya JSON per baris lewat stdin/stdout. Host hanya menggambar dan melaporkan klik; semua logika ada di `controller.ts` (diuji dengan host tiruan). Klik kiri membuka popup tanpa bingkai yang meniru varian **B Ringkas** prototype: `popup.ts` menghitung tata letaknya sebagai daftar bentuk berkoordinat (rect, teks, toggle, spinner, progress, area klik) pada 96 DPI, lalu host menskalakannya ke DPI layar. Sudut membulat dipasang lewat DWM di Windows 11, dan di Windows 10 dipakai `Region` sebagai gantinya. Popup tidak tertutup saat kehilangan fokus. Popup hanya ditutup lewat tombol ✕ (area klik `close` tanpa id, ditangani host), Esc, atau klik ikon tray. Klik kanan membuka menu yang juga digambar sendiri (`menuLayout`): urutan, teks, ✓, dan sorotan item pembaruan sama dengan menu konteks prototype. Warna terang/gelapnya mengikuti tema aplikasi Windows (`AppsUseLightTheme`), dan menu tertutup setelah item dipilih atau saat kehilangan fokus. Klik diproses satu fungsi (`Click-At`), dan tes memanggilnya lewat pesan `clickAt` tanpa menggerakkan mouse. Area klik yang bertumpuk (tombol di dalam baris) pernah membuat id terkirim sebagai `" update"` dan popup langsung tertutup. Teks digambar dengan GDI+ (ClearType); simbol di awal teks memakai Segoe UI Symbol (`glyphRuns`). Logo tray & popup berasal dari `assets/tray/tray-<px>.png` (`npm run icon` dari `assets/icon-tray.svg`, tile tanpa padding seperti prototype), bukan .ico, karena System.Drawing salah membaca .ico berisi PNG. Pesan `snapshot` menggambar popup ke PNG untuk tes dan pengecekan visual.
- **Startup**: nilai `Prototyper` di `HKCU\…\Run` lewat `reg.exe` (`src/core/startup.ts`), isinya `cliCommand()` + `--home --port tray`.
- **Pembaruan** (`src/core/update.ts`): GitHub Releases `PROTOTYPER_UPDATE_REPO`, diperiksa otomatis 10 detik setelah menyala lalu tiap 24 jam (`PROTOTYPER_UPDATE_CHECK=0` mematikan). Biner tunggal Windows: unduh `prototyper-<versi>-win-<arch>.exe` ke `<home>/updates/`, cocokkan dengan `SHA256SUMS.txt`, lalu "Mulai ulang": daemon dimatikan, exe lama di-rename ke `.old` (dihapus saat tray berikutnya menyala), exe baru disalin, dan tray baru dijalankan dengan `--restore <prototype yang tadi berjalan>`. Bentuk rilis lain: buka halaman rilis.
- Belum ada: tray untuk macOS/Linux.

## 11. Mode LAN

- Default semua bind ke `127.0.0.1`.
- `prototyper serve --lan` (atau `PROTOTYPER_LAN=1`): UI dan server static prototype bind ke `0.0.0.0`; `{host}` di perintah command diisi `0.0.0.0`. UI menampilkan URL `http://<ip-lan>:<port>`.
- Endpoint API yang **mengubah** (POST/PUT/DELETE) hanya diterima dari loopback; dari LAN hanya baca (GET) dan akses prototype. Web UI dari LAN otomatis mode baca saja.
- `.prototyper/` (komentar) tidak disajikan server static.
- Catatan: Windows Firewall perlu mengizinkan Node pada port 4000 dan 4100–4199.

## 12. Struktur repo

```
prototyper/
├─ package.json          # "type": "module", "bin": { "prototyper": "dist/cli/index.js" }
├─ tsconfig.json, tsconfig.build.json, vitest.config.ts
├─ AGENTS.md, README.md
├─ docs/      DESIGN.md ROADMAP.md
├─ schemas/   prototyper.schema.json   # digenerate (npm run schema)
├─ src/
│  ├─ version.ts
│  ├─ core/   config manifest detect scaffold agentfiles comments embed agent
│  │          registry state ports logs runtime views errors fsutil net
│  │          autosync open startup update
│  ├─ server/ index.ts app.ts errors.ts
│  │          routes/health.ts routes/prototypes.ts routes/comments.ts routes/agent.ts
│  ├─ cli/    index.ts comments.ts client.ts output.ts launcher.ts
│  └─ tray/   index.ts controller.ts popup.ts menu.ts host.ts (ikon tray Windows, §10g)
├─ web/       index.html app.js style.css embed.js
├─ examples/  hello-static, hello-command (dipakai tes)
├─ scripts/   gen-schema.ts vitest.mjs
└─ test/      *.test.ts (route diuji dengan app.inject(); runtime memakai port 47100-47149)
```

Dependensi: `fastify`, `@fastify/static`, `zod`, `commander`. Dev: `typescript`, `tsx`, `vitest`, `@types/node`.

**Catatan Windows:**
- `npm link`/install global memakai npm prefix (default di C). Set dulu `npm config set prefix D:\npm-global` dan tambahkan ke PATH, atau pakai `npm run cli -- <perintah>`.
- `npm test` lewat `scripts/vitest.mjs`, yang menormalkan huruf drive (`d:\` → `D:\`); tanpa itu vitest memuat modul dua kali dan semua tes gagal `reading 'config'`.

## 13. Milestone

| # | Isi | Selesai bila |
|---|---|---|
| M0 | Scaffold TS + Fastify + CLI kosong + vitest | `npm run dev` menyalakan `/api/health` |
| M1 | Manifest (zod + JSON Schema), registry, `init/add/remove/list/info/validate` | prototype bisa didaftarkan & divalidasi tanpa daemon |
| M2 | PortAllocator + mode `static` + `start/stop` via API | prototype HTML terbuka di `localhost:41xx` |
| M3 | Runtime mode `command`, log, kill tree Windows | proyek Vite jalan & berhenti bersih |
| M4 | CLI ↔ daemon (auto-start), `status/logs --follow` | alur agent §10 jalan end-to-end |
| M5 | Web UI daftar/start/stop/log | |
| M6 | Mode LAN | bisa dibuka dari HP di jaringan sama |
| Lanjutan | `new`, kelengkapan Web UI, komentar (tahap 1–2), petunjuk agent, agent dari Web UI | lihat [`ROADMAP.md`](ROADMAP.md) |

Status 15 Nov 2026: M0–M6 dan fitur lanjutan di atas selesai. 87 tes otomatis (12 file) lolos di Windows (Node 24.16); agent diuji dengan agent palsu (format Claude dan format teks), plus run Claude Code sungguhan secara manual. Shutdown daemon di Windows terbukti tidak meninggalkan `node.exe` (prototype Vite). Belum diuji: akses dari perangkat LAN sungguhan, preset Codex/Gemini/Copilot dengan agent aslinya.

## 14. Risiko & catatan

- **Kill process tree di Windows** — semua kill lewat `killTree`; dev server yang tetap hidup = port bocor.
- **Prototype command yang tidak menghormati `PORT`** — wajib pakai placeholder `{port}` di `run`; `start` gagal dengan pesan jelas bila port tidak terbuka sebelum timeout.
- **Perintah dari manifest dieksekusi dengan shell** — hanya daftarkan repo yang dipercaya. `add` menampilkan perintah `run`/`install` yang akan dieksekusi.
- **Agent dari Web UI mengubah file tanpa konfirmasi per langkah** — dibatasi lewat izin tool (Claude: hanya Read/Edit/Write/Glob/Grep + `prototyper *`), satu run per prototype, batas waktu, dan hanya dipicu dari loopback. Preset eksperimental belum terverifikasi izinnya.
- **Skrip yang disisipkan ke HTML** dapat bentrok dengan prototype tertentu → `static.inject: false`.
- **Konkurensi CLI vs daemon** pada `registry.json` dan `comments.json` — tulis atomik; registry dibaca ulang dari file pada setiap operasi (tanpa cache); komentar: tulis terakhir menang.
