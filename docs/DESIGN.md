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
| `static.liveReload` | tidak | default `true`: halaman dimuat ulang saat file di `root` berubah (§7, butuh `inject`) |
| `static.viewport` | tidak | default `true`: sisipkan `<meta name="viewport" content="width=device-width, initial-scale=1">` bila halaman belum punya (di luar komentar HTML), agar tampilan di HP sama dengan pratinjau perangkat (butuh `inject`) |
| `command.run` | ya (command) | perintah start; placeholder `{port}` dan `{host}` diganti saat jalan |
| `command.install` | tidak | dijalankan via `prototyper install <id>` / tombol Install, bukan otomatis |
| `command.cwd` | tidak | relatif ke folder prototype, default `.` |
| `command.env` | tidak | env tambahan |
| `command.portEnv` | tidak | nama env yang diisi port, default `PORT` |
| `command.readyPattern` | tidak | regex pada stdout/stderr penanda siap; tanpa ini dipakai TCP probe ke port |
| `command.readyTimeoutSec` | tidak | default 60 (maks. 600) |
| `agent.instructions` | tidak | file panduan untuk agent, default `AGENTS.md` |
| `agent.syncInstructions` | tidak | `false` = Prototyper tidak menulis blok petunjuk di file instruksi dan `CLAUDE.md` (§10e) |
| `designSystem.source` | tidak | `true` = prototype ini adalah desain sistem (§10h) |
| `designSystem.files` | tidak | desain sistem: file yang disalin ke pemakai, relatif ke foldernya; default `["tokens.css", "components.css"]` |
| `designSystem.use` | tidak | pemakai: id desain sistem yang dipakai (§10h) |
| `designSystem.dir` | tidak | pemakai: folder salinan, relatif ke folder prototype; default `design-system` |
| `designSystem.local` | tidak | desain sistem sendiri: file/folder token & komponen milik prototype ini, mis. `["src/styles/tokens.css"]` (§10h). `source`, `use`, dan `local` saling eksklusif |
| `tags` | tidak | |

Field tak dikenal ditolak (`strict`). Validasi memakai **zod**; JSON Schema (`schemas/prototyper.schema.json`) digenerate dari zod (`npm run schema`, ada tes yang mengecek sinkron) agar editor dan agent bisa memvalidasi tanpa menjalankan Prototyper.

## 5. Konfigurasi, registry & state

### Konfigurasi (env; flag CLI menang atas env)

| Env | Flag | Default | Keterangan |
|---|---|---|---|
| `PROTOTYPER_HOME` | `--home` | `~/.prototyper` | data: registry, state, log, shim |
| `PROTOTYPER_PORT` | `-p/--port` | `4000` | port daemon; tidak boleh di dalam rentang prototype |
| `PROTOTYPER_PORT_RANGE` | | `4100-4199` | rentang port prototype |
| `PROTOTYPER_LAN` | `--lan` / `--lan-prototypes` | — | `1` = mode LAN semua, `prototypes` = prototype saja (§11) |
| `PROTOTYPER_WORKSPACE` | | `<HOME>/prototypes` | folder induk prototype baru (`new`) |
| `PROTOTYPER_DS_WORKSPACE` | | `<HOME>/design-systems` | folder induk desain sistem baru (`new -t design-system`), terpisah dari prototype |
| `PROTOTYPER_AGENT_DEFAULT` | | `claude` | agent default untuk run dari Web UI |
| `PROTOTYPER_AGENT_TIMEOUT_MIN` | | `20` | batas waktu satu run agent |
| `PROTOTYPER_AGENT_CHECKPOINT` | | `1` | `0` = jangan buat checkpoint sebelum/sesudah run agent |
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

Port terakhir tiap prototype (*sticky port*, supaya URL stabil), PID proses yang berjalan, dan `lan`: id prototype yang dibuka ke LAN satu per satu (§11).

Bila daemon mati tidak wajar, PID yang tersisa **tidak dibunuh otomatis** saat daemon start berikutnya (PID bisa sudah dipakai ulang oleh proses lain, terutama di Windows). Daemon hanya menampilkan peringatan berisi PID dan perintah `taskkill` untuk dicek manual; alokasi port otomatis menghindari port yang masih terpakai.

## 6. Port

- Daemon/UI: `4000`.
- Prototype: rentang `4100–4199`.
- Alokasi: pakai port sticky dari `state.json` bila masih bebas; jika tidak, cari port bebas pertama di rentang. Cek bebas dengan mencoba `net.createServer().listen(port, host)`.
- Satu prototype = satu port, baik `static` maupun `command`. Tidak memakai reverse proxy berbasis path karena dev server (Vite, Next, dsb.) sering rusak bila tidak di root `/`.

## 7. Menjalankan prototype

### Static
Daemon membuat instance Fastify terpisah + `@fastify/static` per prototype di port yang dialokasikan. Header `Cache-Control: no-store` agar perubahan file oleh agent langsung terlihat saat refresh. Path yang memuat segmen `.prototyper` ditolak (404). Bila `static.inject` ≠ `false`, skrip pratinjau disisipkan ke setiap respons HTML (§10c).

**Live-reload** (`src/core/livereload.ts`, bila `inject` dan `liveReload` tidak `false`): tag skrip diberi `data-livereload`; `embed.js` (juga di luar iframe) membuka `EventSource` ke `/__prototyper/livereload`. Server mengawasi `root` dengan `fs.watch` rekursif **hanya selama ada halaman terhubung** (handle folder dilepas saat tidak ada yang membuka), mengabaikan `.prototyper`, `.git`, `node_modules`, dan file sementara editor, lalu mengirim satu event per 120 ms: `css` bila semua yang berubah `.css` (stylesheet same-origin diganti dengan `?__pt=<waktu>`, state halaman tetap), selain itu `reload` (posisi scroll disimpan di `sessionStorage` lalu dipulihkan). Setiap event dicatat di log prototype. Aliran ditutup di hook `preClose` agar stop tidak tertahan. Web UI tidak lagi memuat ulang pratinjau setelah run agent bila live-reload aktif.

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
| POST | `/prototypes/new` | buat dari template `{ "id", "template?": "static\|vite-vanilla\|vite-react\|design-system", "name?", "description?", "dir?", "html?", "install?", "designSystem?" }` lalu daftarkan; default folder `<workspace>/<id>`; template Vite menjalankan `npm install` kecuali `install: false`; `designSystem` = id desain sistem yang langsung dipasang (§10h). Respons = view + `template`, `files`, `install`, `agentFiles`, `designSystem` |
| POST | `/manifest/detect` | periksa folder: manifest yang ada (`exists`, `valid`, `raw`) atau hasil deteksi untuk diedit (`detected`, `notes`); opsional `type`, `id`, `name`, `run` |
| GET | `/prototypes/:id` | detail (manifest, path, status, url, instructions, comments) |
| DELETE | `/prototypes/:id` | hapus dari registry (tidak menghapus file) |
| PUT | `/prototypes/:id/manifest` | tulis ulang `prototyper.json` `{ "manifest": {...} }` (validasi dulu; ganti id ditolak bila bentrok atau prototype sedang berjalan) |
| POST | `/prototypes/:id/reload` | baca ulang manifest |
| POST | `/prototypes/:id/start` \| `stop` \| `restart` | jalankan / hentikan / restart |
| POST | `/prototypes/:id/install` | jalankan `command.install` |
| PUT | `/prototypes/:id/lan` | buka/tutup akses LAN satu prototype `{ "exposed": true|false }`; yang sedang berjalan di-restart bila host berubah (§11) |
| GET | `/design-systems` | `{ designSystems: [{ id, name, path, files, missing, consumers: [{ id, use, dir, found, outdated, files: [{ file, state }] }] }], locals: [{ id, name, paths: [{ path, exists, kind }] }] }` (§10h) |
| PUT | `/prototypes/:id/design-system` | pasang desain sistem `{ "id", "dir?", "link?": true }`, atau catat desain sistem sendiri `{ "local": ["<path>", …] }` → hasil + `prototype` (view) |
| GET | `/prototypes/:id/design-system/candidates` | tebakan lokasi desain sistem sendiri di folder prototype `{ id, candidates }` |
| DELETE | `/prototypes/:id/design-system` | lepas desain sistem / lokasi sendiri (tidak ada file yang dihapus) |
| POST | `/prototypes/:id/design-system/sync` | salin ulang; id pemakai = prototype itu, id desain sistem = semua pemakainya → `{ results }` |
| GET | `/prototypes/:id/logs?tail=200` | log terakhir |
| GET | `/prototypes/:id/logs/stream?tail=100` | SSE log realtime |
| POST | `/pick` | buka dialog pilih file/folder bawaan OS di komputer ini `{ "kind": "folder"\|"file", "title?", "initial?", "multiple?" }` → `{ paths, cancelled }` (§10a) |
| POST | `/shutdown` | hentikan daemon + semua prototype |

### Komentar (§10b)

| Method | Path | Fungsi |
|---|---|---|
| GET | `/prototypes/:id/comments?status=open\|resolved\|all&page=&waiting=user\|agent` | `{ id, counts: { open, resolved, waitingUser }, comments }` |
| POST | `/prototypes/:id/comments` | tambah `{ text, page?, author?, role?, anchor?, attachments? }` (teks boleh kosong bila ada `attachments`) |
| POST | `/prototypes/:id/comments/:cid/replies` | balas `{ text, author?, role?, attachments? }`; pertanyaan berpilihan `{ text, options: [...], multi? }`; jawaban `{ answerTo, choices: [...], text? }` |
| POST | `/prototypes/:id/comments/:cid/resolve` | selesai `{ note?, author? }` |
| POST | `/prototypes/:id/comments/:cid/reopen` | buka lagi |
| DELETE | `/prototypes/:id/comments/:cid` | hapus (gambar lampirannya ikut dihapus bila tidak dipakai komentar lain) |
| POST | `/prototypes/:id/attachments` | unggah gambar `{ data }` (base64/data URL; PNG/JPG/GIF/WebP/SVG, jenis dikenali dari isi file, maks. 5 MB) → `{ name, path, type, size }`; disimpan di `.prototyper/attachments/<hash>.<ext>`, `path` dipakai di `attachments` (maks. 6) |
| GET | `/prototypes/:id/attachments/:name` | sajikan gambar lampiran (SVG dengan `Content-Security-Policy: … sandbox` agar skrip di dalamnya tidak jalan walau dibuka langsung) |

### Agent (§10f)

| Method | Path | Fungsi |
|---|---|---|
| GET | `/agents?refresh=1` | agent lokal: tersedia/tidak, versi, path, dukungan, izin, cara install; `refresh=1` memaksa cek ulang |
| GET | `/prototypes/:id/agent` | run yang sedang/terakhir berjalan |
| POST | `/prototypes/:id/agent/run` | `{ agent?, commentIds?, message?, attachments? }` → 202; satu run per prototype |
| POST | `/prototypes/:id/agent/stop` | hentikan run |
| POST | `/prototypes/:id/agent/undo` | `{ force? }` batalkan perubahan file run terakhir (checkpoint); 409 + `details` (file) bila file itu sudah diedit lagi |
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

Opsi global (boleh di mana saja): `--json`, `--home <dir>`, `-p/--port <port>`, `--lan`, `--lan-prototypes`.

```
prototyper serve                             # jalankan daemon (foreground)
prototyper serve --detach                    # jalankan daemon di background (semua OS); terminal boleh ditutup
prototyper new <id> [-t static|vite-vanilla|vite-react|design-system] [--from <file.html>] [--design-system <id>] [-d <folder>] [--name] [--description] [--no-install] [--start]
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
prototyper ds list                           # desain sistem + pemakai + status salinan (§10h)
prototyper ds use <id> <desain-sistem> [--dir <folder>] [--no-link]
prototyper ds sync [id]                      # id pemakai | id desain sistem (semua pemakai) | kosong = semua
prototyper ds local <id> [path…]             # catat desain sistem milik prototype sendiri; tanpa path = tebakan lokasi
prototyper ds status <id>
prototyper ds detach <id>
prototyper comments <id> [-a|--resolved] [--page /x] [-w agent|user]
prototyper comments add <id> "<teks>" [--page /x] [--selector <css> [--quote <teks>]] [--author] [--role]
prototyper comments reply <id> <commentId> "<teks>" [--author] [--role user]
prototyper comments ask <id> <commentId> "<pertanyaan>" -o A -o B [--multi]
prototyper comments resolve <id> <commentId> [--note "<ringkasan>" | --note-file <path>]
prototyper comments reply <id> <commentId> --file -  <<'EOF' … EOF   # teks multi-baris lewat stdin (juga add/ask; -F <path> = file)
prototyper comments reopen|rm <id> <commentId>
```

Teks multi-baris wajib lewat `--file` (`-` = stdin): bila CLI dipanggil lewat shim `prototyper.cmd`, cmd.exe memotong argumen di newline pertama sehingga balasan agent tersimpan hanya baris pertamanya. Petunjuk agent (AGENTS.md dan prompt agent) menyebut ini.

`comments` membaca/menulis file langsung (tanpa daemon). Penulis default dari CLI `agent` (role `agent`), dari Web UI `pengguna` (role `user`); `--author`/`--role` untuk mengganti.

`new`: folder tujuan harus belum ada atau kosong; id dicek bentrok sebelum menulis apa pun, dan folder yang baru dibuat dihapus lagi bila gagal. Template static = `index.html` + `style.css` + `app.js` (atau satu `index.html` dari `--from`); template Vite = `package.json` (Vite 8; `vite-react` + React 19, JSX tanpa TypeScript) dengan `command.run` memakai `{port}`/`{host}`. Semua template menulis `AGENTS.md` awal. Folder induk default: `PROTOTYPER_WORKSPACE`, atau `<PROTOTYPER_HOME>/prototypes`; template `design-system` memakai `PROTOTYPER_DS_WORKSPACE`, atau `<PROTOTYPER_HOME>/design-systems` (`-d/--dir` selalu menang). Keduanya dikirim di `GET /health` (`workspace`, `dsWorkspace`) untuk placeholder & dialog Pilih… di Web UI.

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
- **Yang baru** (`/#!whatsnew`; di Web UI hanya dibuka dengan klik versi di samping logo, selain dari menu tray): daftar perubahan per versi dari `web/whatsnew.json`. File ini ikut terkirim bersama `web/`, jadi isinya selalu sesuai versi daemon dan tetap jalan tanpa internet. Titik aksen di samping versi tampil sampai halaman dibuka untuk versi itu (`prototyper:seen-version` di localStorage). `!` tidak mungkin muncul di id prototype, jadi hash ini tidak bentrok.
- Polling `/api/prototypes` tiap 2 detik; bagian yang tidak berubah tidak di-render ulang agar iframe dan stream log tidak terputus.
- URL pratinjau memakai host yang sama dengan UI, sehingga tetap jalan saat dibuka dari LAN. Dibuka dari bukan-loopback, tombol yang mengubah state dinonaktifkan (mode baca saja).
- Dev server yang menolak di-embed (`X-Frame-Options`/CSP `frame-ancestors`) tetap bisa dibuka lewat tombol "buka di tab baru".

Desain berasal dari eksplorasi di prototype `prototyper-ui` (layout Galeri/Konsol tidak diambil).

Mendaftarkan folder di UI selalu memanggil `/manifest/detect` lebih dulu:

- manifest ada dan valid → langsung didaftarkan;
- belum ada → editor JSON berisi hasil deteksi (bisa ganti jenis static/command), lalu **Simpan & Daftarkan**;
- ada tapi tidak valid → editor berisi isi mentah file, simpan menimpa file.

Error validasi ditampilkan per field (`details`). File baru tidak ditulis bila manifest tidak valid atau id/folder bentrok.

### Pilih file/folder lewat dialog OS (`src/core/picker.ts`)

Browser tidak bisa memberi path lengkap dari `<input type="file">`, jadi tombol **Pilih…** di Web UI memanggil `POST /api/pick` dan daemon (di komputer yang sama) membuka dialog bawaan sistem, lalu mengembalikan path absolut. Windows: `powershell.exe -STA` + IFileOpenDialog (dialog Explorer modern, juga untuk folder; parameter lewat env, kode C# dikompilasi `Add-Type`), dengan form kecil TopMost sebagai pemilik agar dialog muncul di depan browser. macOS: `osascript` (`choose folder` / `choose file`). Linux: `zenity`, lalu `kdialog`; tanpa keduanya → `NOT_IMPLEMENTED`. Satu dialog sekaligus (`CONFLICT`); batal → `{ paths: [], cancelled: true }`. Dipakai di: Daftarkan (path folder; setelah dipilih langsung diperiksa), Baru (folder induk → `<induk>/<id>`, ikut berubah saat id diketik), dan dialog Desain sistem (folder salinan & lokasi desain sistem sendiri; path diubah menjadi relatif dan ditolak bila di luar folder prototype). Seperti request non-GET lain, hanya dari mesin lokal.

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

- Server static (bila `static.inject` ≠ `false`) menyajikan `/__prototyper/embed.js` (dari `web/embed.js`) dan menyisipkan `<script src="/__prototyper/embed.js" defer>` sebelum `</body>` pada setiap respons `text/html` (termasuk fallback SPA) lewat hook `onSend` (`src/core/embed.ts`). Bila `static.viewport` ≠ `false` dan halaman belum punya meta viewport, `injectViewportMeta` menyisipkannya tepat setelah `<head>` (lalu `<html>`/doctype). Tanpa meta ini browser HP merender dengan lebar virtual ±980px sehingga media query mobile tidak aktif, padahal di pratinjau perangkat aktif (iframe selebar perangkat).
- Skrip diam bila halaman tidak berada di iframe. Di pratinjau, ia mengirim `prototyper:ready {page}` ke induk; Web UI membalas `prototyper:hello` dan sejak itu skrip hanya berbicara dengan origin tersebut. Web UI hanya menerima pesan dari `contentWindow` iframe pratinjau dengan origin sama dengan URL pratinjau.
- Mode komentar (`prototyper:mode`): sorotan saat hover, klik memilih elemen, blok teks memilih teks (`quote`) + elemen induk bersama. Handler milik prototype dihentikan selama mode aktif (propagasi dihentikan di fase capture `window`; aksi bawaan hanya dicegah untuk click/submit agar seleksi teks tetap jalan). Esc membatalkan.
- `prototyper:pick {anchor, page}` → form komentar terisi chip elemen dan halaman. Path halaman juga dilaporkan saat navigasi SPA (`pushState`/`replaceState`/`popstate`/`hashchange`).
- `prototyper:pins` → pin bernomor (oranye bila menunggu pengguna) untuk komentar open berelemen di halaman yang sedang tampil; klik pin → `prototyper:pin-click` → komentar disorot. Chip elemen di komentar → `prototyper:focus` → elemen digulir dan di-flash.
- Selector: `#id` bila unik, selain itu jalur `tag:nth-of-type(n)` (atau `[data-testid]`) sampai id unik/`body`. Bisa usang bila struktur halaman berubah; `text`/`quote` membantu agent menemukan elemen.
- Mode command belum didukung (butuh reverse proxy di depan dev server, lihat ROADMAP).

## 10d. Konteks komentar

Tujuan: agent yang mengerjakan sebuah komentar tahu riwayat dan keputusan sebelumnya tanpa membaca seluruh `comments.json`, sehingga tidak keluar konteks atau mengulang revisi yang sudah ditolak. Kode: `src/core/comments.ts`.

- **Thread**: `comments <id> --waiting agent --json` memuat balasan, pertanyaan berpilihan, `answer`, dan `anchor`.
- **Log keputusan** `<folder>/.prototyper/DECISIONS.md` (append-only, ditulis di bawah kunci yang sama dengan `comments.json`, setelah file itu ditulis). Satu baris per kejadian: `- YYYY-MM-DD · c12 · /kasir · <selector atau -> · <permintaan> → <hasil>`. Hasil saat `resolve` = `--note`, atau balasan teks terakhir agent bila catatannya kosong. `--note` tetap opsional karena agent tidak me-resolve; pengguna menyelesaikan dari Web UI tanpa catatan, dan laporan agent sudah berisi ringkasan perubahan. `reopen` komentar yang selesai menulis `↺ dibuka lagi`; pembatalan run agent (`noteUndo`) menulis `↺ perubahan agent dibatalkan (<laporan agent>)`. Teks dibuat satu baris dan dipotong; ` · ` di dalam teks diganti agar baris tetap bisa diurai (`parseDecision`).
- **Perintah konteks**: `prototyper comments context <id> <cid> [--json] [--include-archive]` dan `GET /prototypes/:id/comments/:cid/context[?archive=1]` → `{ comment, related, decisions }`. `related` = komentar resolved di `page` yang sama, yang `anchor.selector`-nya sama lebih dulu (`sameAnchor: true`) lalu terbaru, maks. 10. `decisions` = baris `DECISIONS.md` untuk komentar itu, komentar `related`, atau halaman yang sama, maks. 20 terakhir (kronologis). Blok `AGENTS.md` dan prompt run agent memintanya dijalankan sebelum mengerjakan tiap komentar.
- **Snapshot elemen**: `web/embed.js` menambahkan `anchor.html` = `outerHTML` elemen (tanpa elemen milik Prototyper, spasi dirapatkan, maks. 1500 karakter; server memotong di 2000), agar komentar tetap bermakna setelah selector usang.
- **Arsip**: setiap kali `comments.json` ditulis, komentar resolved yang `resolvedAt`-nya lebih tua dari N hari (default 30, `comments.archiveDays` di manifest, 0 = mati) dipindah ke `.prototyper/comments-archive/YYYY-MM.json` (bulan `resolvedAt`). Arsip ditulis lebih dulu; bila id ada di keduanya, yang di `comments.json` menang. `archiveDays` dibaca longgar dari `prototyper.json` agar manifest rusak tidak menggagalkan penyimpanan komentar. `comments list --include-archive` / `?archive=1` dan `context --include-archive` membaca arsip; komentar dari arsip diberi `archived: true`. Web UI belum menampilkan arsip; ringkasannya tetap ada di `DECISIONS.md`.
- **Belum**: jejak git (trailer `Prototyper-Comment: c12` bila agent commit), `comments search <id> "<kata>"`, `prototyper decisions compact <id>` untuk merangkum `DECISIONS.md` yang panjang, tool MCP `get_comment_context`, dan menampilkan arsip di Web UI.

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
- Run: `POST /prototypes/:id/agent/run { agent?, commentIds?, message?, attachments?, resume? }`; path lampiran dicantumkan di prompt (agent membukanya dengan tool baca file), khusus Codex juga diberikan lewat `--image` bersama lampiran komentar yang akan dikerjakan; default `PROTOTYPER_AGENT_DEFAULT` atau `claude`. Satu run per prototype; batas waktu `PROTOTYPER_AGENT_TIMEOUT_MIN` (default 20 menit); stop memakai `killTree`. Info run memuat `agent`, status (`running`/`done`/`failed`/`stopped`), ringkasan, exit code, `checkpoint`, `sessionId`, dan `resumed`.
- **Checkpoint & Batalkan** (`src/core/checkpoint.ts`): sebelum agent dijalankan dan sesudah selesai (termasuk gagal/dihentikan), folder prototype di-snapshot ke repo git bayangan `<PROTOTYPER_HOME>/checkpoints/<id>.git` (bare, work-tree = folder prototype, `GIT_*` env dibuang, config lokal mematikan hooks/tanda tangan/autocrlf). Repo git milik pengguna (index, stash, branch) tidak disentuh dan folder prototype tidak mendapat file baru. `.gitignore` pengguna dihormati; `.prototyper/`, `node_modules/`, `.git/` selalu dikecualikan, sehingga komentar dan balasan agent tidak ikut dibatalkan. Info run: `checkpoint = { before, after, changes: [{status: added|modified|deleted, path}], undoneAt }` atau `checkpointError` (mis. git tidak ada — run tetap jalan). `POST …/agent/undo` hanya mengembalikan file di `changes` (file baru dihapus beserta folder yang jadi kosong); file lain yang diedit pengguna tidak tersentuh. Bila salah satu file itu sudah berubah sejak `after`, ditolak 409 dengan daftar file, kecuali `force`. Setelah berhasil, `noteUndo` (`src/core/comments.ts`) menambahkan balasan (author `prototyper`, role `agent`, sehingga giliran kembali ke pengguna) ke komentar yang dibalas/di-resolve agent selama run plus `commentIds` run; komentar yang di-resolve selama run dibuka lagi. Respons undo memuat `comments` (id yang dibalas). Hanya run terakhir, sekali, dan tidak bertahan setelah daemon restart (info run ada di memori; snapshot tetap di repo bayangan). Repo bayangan dihapus saat prototype dihapus dari daftar (API `DELETE` maupun CLI `remove` tanpa daemon). `PROTOTYPER_AGENT_CHECKPOINT=0` mematikan.
- **Lanjut sesi** (`src/core/agentsession.ts`, hanya preset ber-`session`, saat ini Claude Code): run baru diberi `--session-id <uuid>` buatan Prototyper; run berikutnya memakai `--resume <id>` sehingga agent ingat apa yang dilihat dan diubahnya. Sesi terakhir per prototype disimpan di `<PROTOTYPER_HOME>/agent-sessions.json` (`agent`, `sessionId`, `cwd`, `runs`, `endedAt`, `undoneAt`), jadi bertahan setelah daemon restart. Sesi dilanjutkan hanya bila agent sama, folder sama, `endedAt` belum lewat `PROTOTYPER_AGENT_RESUME_HOURS` (default 24; 0 = mati), dan run terakhirnya tidak dibatalkan (undo mengisi `undoneAt`, karena sesi itu berisi perubahan yang sudah tidak ada). Sesi baru dicatat hanya bila agent benar-benar mulai, yaitu event `system init` diterima. Event `result` tidak dipakai sebagai penanda karena resume yang gagal tetap mengirim `result` ber-`session_id` (`num_turns: 0`, "No conversation found"). Resume yang gagal sebelum ada `init` diulang sekali otomatis dengan sesi baru. `GET /prototypes/:id/agent?agent=<id>` memuat `resume: { agent, resumable, session, reason }` untuk Web UI; `resume: false` di body run memaksa sesi baru. Prompt sesi lanjutan menambahkan bahwa file dan komentar bisa sudah berubah, jadi harus dibaca ulang.
- Prompt: id prototype, fokus komentar (opsional), pesan pengguna (opsional), langkah alur komentar. Instruksi tambahan: tidak interaktif → bertanya lewat `comments ask/reply`; hanya ubah folder ini; jangan ubah `prototyper.json`, `.prototyper/`, `AGENTS.md`, `CLAUDE.md`.
- `prototyper` disediakan lewat shim `<PROTOTYPER_HOME>/bin/prototyper(.cmd)` yang ditambahkan di depan `PATH` proses agent (beserta `PROTOTYPER_HOME`/`PROTOTYPER_PORT`), sehingga tidak perlu `npm link`. Penanda sesi `CLAUDECODE` tidak diwariskan.
- Log run di `logs/<id>.agent.log` (+ SSE). Bila agent keluar tanpa output, log menyarankan menjalankannya di terminal atau mengatur `PROTOTYPER_AGENT_BIN_<ID>`.
- Web UI: bar agent di panel Komentar (dropdown agent yang tersedia — pilihan disimpan di browser — tombol Kerjakan, status, Stop, log live), tombol Kerjakan per komentar yang menunggu agent, dialog *Agent lokal* (status, versi, path, izin, cara install, Pakai). Saat run selesai komentar dimuat ulang dan pratinjau static di-refresh (bila live-reload mati). Run yang mengubah file menampilkan tombol **Batalkan (N file)** dengan dialog daftar file; bila bentrok, dialog kedua menawarkan **Timpa & batalkan**. Bila sesi bisa dilanjutkan, bar menampilkan tombol **↻ Lanjutkan sesi · N run**; klik → **✦ Sesi baru** untuk run berikutnya saja (per prototype, kembali ke lanjutkan setelah run).
- Tidak ada pemicu otomatis (mis. menjalankan agent setiap ada komentar baru atau saat pengguna menjawab) — sengaja, agar pemakaian tetap atas permintaan pengguna.

Rincian Claude Code:

- Perintah: `claude -p "<prompt>" --output-format stream-json --verbose --permission-mode dontAsk --permission-prompts none --allowedTools "Read,Edit,Write,Glob,Grep,Bash(prototyper *),PowerShell(prototyper *)" --append-system-prompt …` + `--session-id <uuid>` atau `--resume <uuid>` di folder prototype (`--bare` bila `PROTOTYPER_AGENT_AUTH=apikey`). `--permission-prompts` hanya dikirim bila muncul di `claude --help` (dicek sekali, di-cache bersama cek versi); Claude Code lama menolaknya dengan "unknown option".
- Output stream-json diringkas menjadi log (`💬` teks, `→` pemakaian tool, `✗` tool gagal, `✓` selesai); ringkasan akhir, jumlah langkah, dan estimasi biaya disimpan di info run.

## 10g. Tray Windows (`src/tray/`)

Rancangannya divalidasi lewat prototype `prototyper-runtime`: hanya ikon tray, tanpa jendela.

- **Proses**: `prototyper tray` menjalankan `tray --foreground` terlepas dari konsol (output ke `<home>/tray.log`), lalu keluar. Satu tray per home (`<home>/tray.pid`); bila sudah ada yang berjalan, Web UI dibuka. Dobel-klik `prototyper.exe` dari Explorer = `prototyper tray`.
- **Daemon terpisah dari tray**: tray berbicara lewat HTTP seperti CLI (`DaemonClient`), polling `/api/prototypes` tiap 2 detik. Jeda = `POST /api/shutdown`, lanjutkan = `ensure()`. Keluar juga mematikan daemon. Daemon yang dimatikan dari luar tampil sebagai "dijeda" dan tidak dinyalakan ulang otomatis.
- **Ikon tanpa modul native**: `host.ts` menulis skrip PowerShell (NotifyIcon WinForms) ke `<home>/tray/` dan menjalankannya. Protokolnya JSON per baris lewat stdin/stdout. Host hanya menggambar dan melaporkan klik; semua logika ada di `controller.ts` (diuji dengan host tiruan). Klik kiri membuka popup tanpa bingkai yang meniru varian **B Ringkas** prototype: `popup.ts` menghitung tata letaknya sebagai daftar bentuk berkoordinat (rect, teks, toggle, spinner, progress, area klik) pada 96 DPI, lalu host menskalakannya ke DPI layar. Sudut membulat dipasang lewat DWM di Windows 11, dan di Windows 10 dipakai `Region` sebagai gantinya. Popup ditutup lewat tombol ✕ (area klik `close` tanpa id, ditangani host), Esc, klik ikon tray, atau klik di luar popup (kehilangan fokus); klik di dalam popup tidak menutupnya. Karena menekan ikon tray lebih dulu memindahkan fokus ke taskbar, host menganggap popup yang baru saja tertutup (<600 ms) masih terbuka agar klik ikon tetap berarti "tutup", bukan membuka ulang. Klik kanan membuka menu yang juga digambar sendiri (`menuLayout`): urutan, teks, ✓, dan sorotan item pembaruan sama dengan menu konteks prototype. Item `✨ Yang baru di <versi>` membuka `<url>/#!whatsnew` di browser (nonaktif saat daemon dijeda). Warna terang/gelapnya mengikuti tema aplikasi Windows (`AppsUseLightTheme`), dan menu tertutup setelah item dipilih atau saat kehilangan fokus. Klik diproses satu fungsi (`Click-At`), dan tes memanggilnya lewat pesan `clickAt` tanpa menggerakkan mouse. Area klik yang bertumpuk (tombol di dalam baris) pernah membuat id terkirim sebagai `" update"` dan popup langsung tertutup. Popup & menu adalah flyout tray, bukan aplikasi: diberi `WS_EX_TOOLWINDOW` sehingga tidak muncul di Alt+Tab, recent apps, maupun taskbar. Jendelanya tetap diberi judul & ikon Prototyper. Teks digambar dengan GDI+ (ClearType); simbol di awal teks memakai Segoe UI Symbol (`glyphRuns`). Logo tray & popup berasal dari `assets/tray/tray-<px>.png` (`npm run icon` dari `assets/icon-tray.svg`, tile tanpa padding seperti prototype), bukan .ico, karena System.Drawing salah membaca .ico berisi PNG. Pesan `snapshot` menggambar popup ke PNG untuk tes dan pengecekan visual.
- **Notifikasi**: balon tray untuk perubahan status prototype, pembaruan, dan konfirmasi. "Tampilkan notifikasi" (disimpan di `<home>/tray.json`) mematikan semuanya kecuali error dari aksi yang diklik pengguna (gagal memeriksa/mengunduh/memasang pembaruan, daemon gagal dinyalakan, aksi diblokir karena daemon dijeda), agar kegagalan tidak terjadi diam-diam.
- **Mode LAN** (§11): toggle di popup & menu, plus pilihan lingkup **Semua** (`all`) / **Prototype saja** (`prototypes`). Toggle menyalakan lingkup terakhir (`lanScope`). Alamat bind hanya bisa diatur saat daemon menyala, jadi mengubah mode = `POST /api/shutdown` lalu `ensure({ lanMode })` (daemon dijalankan dengan `lanArgs(mode)`: `--lan`, `--lan-prototypes`, atau tanpa flag), lalu prototype yang tadi berjalan dinyalakan lagi. Saat daemon dijeda, pilihan hanya disimpan dan berlaku saat dilanjutkan. `lanMode` & `lanScope` disimpan di `tray.json` (`--lan`/`--lan-prototypes` pada `prototyper tray` memaksanya). Polling membaca `lanMode` dari `/api/health` (daemon lama: `lan` → `all`/`off`, `healthLanMode`), jadi daemon yang dinyalakan dari terminal dengan mode lain tetap tampil sesuai mode sebenarnya. Popup menampilkan alamat untuk perangkat lain (alamat 192.168.x didahulukan dari 10.x, lalu 172.16–31.x yang biasanya adaptor WSL/Hyper-V, `rankLanAddresses`) dan tombol Salin (`clip.exe`). Mode `all` menyalin URL Web UI, sedangkan mode `prototypes` menyalin URL LAN prototype yang berjalan (`lanCopyText`).
- **Startup**: nilai `Prototyper` di `HKCU\…\Run` lewat `reg.exe` (`src/core/startup.ts`), isinya `cliCommand()` + `--home --port tray`.
- **Pembaruan** (`src/core/update.ts`): GitHub Releases `PROTOTYPER_UPDATE_REPO`, diperiksa otomatis 10 detik setelah menyala lalu tiap 24 jam (`PROTOTYPER_UPDATE_CHECK=0` mematikan). Biner tunggal Windows: berkas diunduh ke `<home>/updates/` dan dicocokkan dengan `SHA256SUMS.txt`. Urutan pilihan: paket aplikasi `-app-r<runtime>.tar.gz` bila runtime exe sama (±0,6 MB, dipasang ke `<PROTOTYPER_HOME>/app/` tanpa mengganti exe), lalu MSI untuk instalasi MSI, lalu exe. Paket aplikasi dipasang selagi daemon berjalan; bila hanya `web/` yang berubah (`codeHash` sama), daemon cukup dialihkan lewat `POST /api/app/reload-web` tanpa restart, dan prototype tetap berjalan; tombolnya "Pasang" (bukan "Mulai ulang") bila `codeHash` di `app.json` paket yang diunduh sama dengan kode tray (`packCodeHash`). Selain itu, "Mulai ulang": daemon dimatikan, berkas dipasang (lihat docs/RELEASE.md "Runtime dan aplikasi terpisah"), dan tray baru dijalankan dengan `--restore <prototype yang tadi berjalan>`. Bentuk rilis lain: buka halaman rilis.
- Belum ada: tray untuk macOS/Linux.

## 10h. Desain sistem (`src/core/designsystem.ts`)

Agar beberapa prototype konsisten (warna, tipografi, jarak, komponen) dan agent tidak menebak nilai visual tiap kali.

- **Desain sistem = prototype biasa** (mode static) dengan `designSystem.source: true`, dibuat dari template `design-system` (`src/core/dstemplate.ts`): `tokens.css` (custom property `--kategori-nama`, tema terang/gelap), `components.css` (komponen dasar yang hanya memakai token), dan katalog `index.html` + `catalog.css`/`catalog.js` (token dibaca langsung dari `tokens.css`, jadi token baru tampil otomatis). Karena prototype biasa, katalog bisa dibuka, dikomentari, dan dikerjakan agent seperti prototype lain.
- **Pemakai** (`designSystem.use`): file di `designSystem.files` milik desain sistem **disalin** ke `<prototype>/<dir>/` (default `design-system/`) dengan baris pembuka "jangan diedit di sini". Salinan, bukan tautan ke folder lain: prototype tetap mandiri (bisa di-commit, dibagikan, dan jalan di mode static maupun Vite tanpa konfigurasi `server.fs`).
- `ds use` menyisipkan pemuatan CSS sekali (idempoten): mode static → `<link rel="stylesheet">` di `static.index`, sebelum stylesheet pertama (gaya prototype tetap menang) atau sebelum `</head>`; mode command → `import '<relatif>'` di awal entry pertama yang ada (`src/main.{jsx,tsx,js,ts}`, `src/index.*`, relatif ke `command.cwd`). Bila tidak bisa (folder di luar `static.root`, entry tidak ditemukan), hasilnya `link.action = "skipped"` dengan `note`. Template baru dengan desain sistem juga memakai kelas `btn btn-primary` pada tombol contoh.
- **Sinkron manual**: `ds sync` membandingkan isi (baris pembuka + file sumber) dan hanya menulis yang berbeda. Status `outdated` (berbeda/belum disalin) tampil di `ds list`, `GET /design-systems`, dan Web UI (dicek berkala bila ada prototype yang memakai desain sistem). Tidak ada sinkron otomatis: perubahan desain sistem sampai ke pemakai saat pengguna/agent memintanya.
- `ds detach` hanya menghapus `designSystem` dari manifest dan memperbarui petunjuk; folder salinan dan tautan CSS dibiarkan agar tampilan tidak rusak tiba-tiba.
- Petunjuk agent (§10e) mendapat bagian "Desain sistem": di desain sistem → token sebagai satu-satunya sumber nilai, setiap komponen punya contoh di katalog, jangan mengganti nama/menghapus token, sebarkan dengan `ds sync`; di pemakai → pakai token & kelas komponen, jangan mengedit `<dir>/`, token/komponen baru ditambahkan di desain sistem.
- **Desain sistem sendiri** (`designSystem.local`): prototype yang sudah punya token/komponen di foldernya sendiri cukup mencatat lokasinya (file atau folder, boleh belum ada). Tidak ada yang disalin; gunanya agar petunjuk agent menyuruh memakai dan menambah token di sana, dan Web UI/CLI menampilkannya. `ds local <id>` tanpa path (dan `GET …/design-system/candidates`) menebak lokasi dari nama file (`tokens`, `variables`, `theme`, `design-tokens`, … `.css/.scss/.json/.js/.ts`) dan folder (`design-system`, `tokens`, `theme`, `styles`, …) sampai 4 tingkat, melewati `node_modules`, folder tersembunyi, build, dan salinan `design-system/`. Memakai `local` menggantikan `use` (salinan lama dibiarkan), begitu pula sebaliknya. Belum ada "promosi" desain sistem sendiri menjadi desain sistem bersama.
- **Desain sistem dibedakan dari prototype di tampilan**, bukan di model data (tetap prototype, agar pratinjau, komentar, agent, Batalkan, dan LAN berlaku tanpa pengecualian):
  - Sidebar: grup **Desain sistem** di atas grup status, avatar bersudut tajam dengan cincin aksen, jumlah pemakai (titik oranye bila ada yang perlu sinkron); prototype pemakai diberi ◇ (◇ oranye = perlu sinkron), desain sistem sendiri ◆. Filter **Desain sistem**.
  - Beranda: bagian **Desain sistem** terpisah dari kartu prototype (pemakai sebagai chip yang bisa diklik, **Buka katalog**, **Sebarkan (N)**); kartu prototype menampilkan chip desain sistemnya; "Perlu perhatian" memuat desain sistem yang pemakainya tertinggal; statistik Prototype tidak menghitung desain sistem.
  - Agent di desain sistem: bar agent menampilkan "◇ dipakai N prototype"; sebelum run pertama per sesi browser muncul konfirmasi berisi daftar pemakai; setelah run yang mengubah file, status pemakai dimuat ulang dan bila ada yang tertinggal muncul toast + tombol **Sebarkan ke N** di bar agent (alur: agent mengubah → tinjau katalog → sebarkan).
  - Detail: baris **Desain sistem** (Atur…/Ubah…: dialog dengan mode **Bersama** atau **Milik sendiri** + kandidat lokasi; Sinkronkan/Sebarkan; Lepas). Template **desain sistem** dan pilihan **Desain sistem** di dialog Baru; palet perintah "Buat desain sistem baru".
  - CLI: `prototyper list` mengurutkan desain sistem di atas dan menambah kolom `DS` (`desain sistem`, `→ <id>`, `sendiri`); `info` menampilkan baris Desain sistem.

## 11. Mode LAN

- Default semua bind ke `127.0.0.1`.
- `prototyper serve --lan` (atau `PROTOTYPER_LAN=1`, atau toggle **Mode LAN** lingkup *Semua* di tray, §10g): UI dan server static prototype bind ke `0.0.0.0`; `{host}` di perintah command diisi `0.0.0.0`. UI menampilkan URL `http://<ip-lan>:<port>`.
- `--lan-prototypes` (atau `PROTOTYPER_LAN=prototypes`, atau lingkup *Prototype saja* di tray): hanya server prototype yang bind ke `0.0.0.0` (`config.prototypeHost`; `{host}`/`HOST` ikut), sedangkan daemon/Web UI tetap `127.0.0.1` (`config.host`). Skrip embed & live-reload dilayani server prototype sendiri, jadi tetap jalan dari perangkat lain. `lanUrls` di view tetap diisi; `/api/health` mengirim `lanMode`.
- **Per prototype** (`prototyper lan <id> on|off`, tombol **LAN** di header detail Web UI, atau `PUT /api/prototypes/:id/lan`): hanya prototype itu yang bind ke `0.0.0.0` walau mode LAN daemon mati; daemon/Web UI tetap `127.0.0.1`. Disimpan di `state.json` (`lan`), dilupakan saat prototype dihapus. Host dipilih saat start (`Runtime.hostFor`), jadi prototype yang berjalan di-restart saat toggle. View berisi `lanExposed`; `lanUrls` diisi bila proses yang berjalan bind `0.0.0.0` (dari mode daemon atau per prototype). Pada mode LAN daemon semua prototype sudah terbuka, tombol di Web UI tampil aktif & nonaktif.
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
│  ├─ core/   config manifest detect scaffold dstemplate designsystem agentfiles comments embed agent
│  │          registry state ports logs runtime views errors fsutil net
│  │          autosync open startup update picker
│  ├─ server/ index.ts app.ts errors.ts
│  │          routes/health.ts routes/prototypes.ts routes/comments.ts routes/agent.ts routes/pick.ts
│  ├─ cli/    index.ts comments.ts designsystem.ts client.ts output.ts launcher.ts
│  └─ tray/   index.ts controller.ts popup.ts menu.ts host.ts (ikon tray Windows, §10g)
├─ web/       index.html app.js style.css embed.js
├─ examples/  hello-static, hello-command, sembako-ds (contoh desain sistem); dipakai tes
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
