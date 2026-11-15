# Prototyper

Aplikasi lokal untuk mendaftarkan, menjalankan, dan mengelola prototype yang tersimpan di folder/repo masing-masing, agar bisa dikerjakan oleh LLM agent apa pun (dan oleh Anda lewat Web UI). Rancangan: [`docs/DESIGN.md`](docs/DESIGN.md).

## Persiapan (Windows, drive C hampir penuh)

```powershell
# simpan data Prototyper (registry, state, log) di D:
setx PROTOTYPER_HOME "D:\prototyper-data"
# folder induk untuk prototype baru (prototyper new)
setx PROTOTYPER_WORKSPACE "D:\Prototypes"

# pindahkan npm global prefix & cache ke D: (sebelum npm link)
npm config set prefix "D:\npm-global"
npm config set cache "D:\npm-cache"
# tambahkan D:\npm-global ke PATH user, lalu buka terminal baru
```

## Unduh rilis

Tanpa clone repo: unduh dari [GitHub Releases](https://github.com/egateza/Prototyper/releases). Setiap OS (Windows, Linux x64/arm64, macOS Apple Silicon/Intel) punya **biner tunggal** (`.exe` di Windows) dan **versi portable**; keduanya tidak butuh Node. Ada juga **paket npm** (`npm i -g prototyper-<versi>.tgz`) bagi yang sudah punya Node. Panduannya ada di [`docs/RELEASE-NOTES.md`](docs/RELEASE-NOTES.md); cara membangun dan menerbitkan rilis di [`docs/RELEASE.md`](docs/RELEASE.md).

## Tray Windows

Di Windows, Prototyper bisa berjalan sebagai ikon di tray (pojok kanan bawah taskbar), tanpa jendela konsol:

```powershell
prototyper tray        # atau dobel-klik prototyper.exe dari Explorer
```

- **Klik kiri**: popup ringkas bertema gelap. Isinya status daemon dengan tombol jeda, daftar prototype (toggle jalankan/hentikan, ↗ buka di browser), jalankan saat startup, periksa pembaruan, jalankan/hentikan semua, dan bar **Buka Prototyper** di bawah. Popup tetap terbuka saat tombolnya diklik. Untuk menutupnya, pakai tombol ✕ di kanan atas, tekan Esc, atau klik ikon tray lagi.
- **Klik kanan**: menu seperti prototype (terang/gelap mengikuti tema Windows) berisi buka Prototyper di browser, jalankan/hentikan semua, jeda/lanjutkan daemon, jalankan saat startup, tampilkan notifikasi, periksa pembaruan, dan keluar.
- **Klik dua kali**: buka Web UI.

Angka di ikon = jumlah prototype yang berjalan; titik oranye = ada pembaruan. "Jeda daemon" menghentikan daemon beserta semua prototype, dan "Keluar" juga menghentikan daemon. "Jalankan saat startup" menulis nilai `Prototyper` di `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`. Pembaruan diambil dari GitHub Releases. Untuk `prototyper.exe`, pembaruan bisa diunduh (dicek dengan `SHA256SUMS.txt`) lalu dipasang lewat "Mulai ulang", dan prototype yang sedang berjalan dinyalakan lagi. Untuk bentuk rilis lain, tray hanya membuka halaman rilis. Log tray ada di `<PROTOTYPER_HOME>/tray.log`; untuk debug: `prototyper tray --foreground`.

## Install dari source

```powershell
cd D:\IdeaProjects\prototyper
npm install
npm test
npm run build
npm link        # perintah `prototyper` tersedia global
```

Tanpa `npm link`, ganti `prototyper` dengan `npm run cli --` di contoh bawah.

## Pemakaian cepat

Prototype baru dari template:

```powershell
prototyper new kasir-grosir --template vite-react --start   # npm install otomatis
prototyper new laporan-stok --from Downloads\artifact.html   # HTML artifact → prototype static
```

Folder yang sudah ada:

```powershell
# 1. daftarkan; bila belum ada prototyper.json, dibuat otomatis (deteksi static / npm run dev)
prototyper add D:\IdeaProjects\pos-sembako-ui
# 2. periksa prototyper.json yang dibuat (atau buat sendiri dulu dengan `prototyper init`)
# 3. (mode command) install dependensi
prototyper install pos-sembako-ui
# 4. jalankan — daemon dinyalakan otomatis di background
prototyper start pos-sembako-ui
# 5. Web UI
start http://localhost:4000
```

Lewat Web UI: **Baru** membuat prototype dari template (bisa unggah HTML), **Daftarkan** untuk folder yang sudah ada — cukup tempel path-nya. Bila folder belum punya `prototyper.json`, UI menampilkan hasil deteksi yang bisa diedit sebelum disimpan, jadi `init` tidak wajib.

Coba dengan contoh bawaan: `prototyper add examples\hello-static` lalu `prototyper start hello-static`.

| Perintah | Fungsi |
|---|---|
| `new <id>` | buat prototype dari template lalu daftarkan (`--template static\|vite-vanilla\|vite-react`, `--from <file.html>`, `--dir`, `--name`, `--no-install`, `--start`) |
| `init [dir]` | buat `prototyper.json` (`--type`, `--id`, `--name`, `--run`, `--force`) |
| `add <dir>` / `remove <id>` | daftarkan (manifest dideteksi bila belum ada; `--type`, `--id`, `--run`) / hapus dari daftar (file tidak disentuh) |
| `list` / `status` / `info <id>` | lihat prototype |
| `validate [dir]` | cek manifest |
| `install <id>` | jalankan `command.install` |
| `start` / `stop` / `restart <id>` | jalankan prototype |
| `logs <id> [-n 200] [-f]` | log |
| `agents list` | cek agent coding yang tersedia (Claude Code, Codex, Gemini CLI, Copilot CLI) |
| `agents sync [id]` | pasang/perbarui petunjuk agent (`AGENTS.md` + `CLAUDE.md`) di folder prototype |
| `comments <id>` | komentar open (`--all`, `--resolved`, `--page`, `--waiting agent\|user`); subperintah `context` (riwayat & keputusan terkait satu komentar), `add`, `reply`, `ask --option … [--multi]`, `resolve --note`, `reopen`, `rm`; `--include-archive` untuk komentar yang sudah diarsipkan |
| `serve` | daemon di foreground (Ctrl+C untuk berhenti) |
| `shutdown` | hentikan daemon + semua prototype |

Semua perintah menerima `--json` (untuk agent/skrip) dan exit code ≠ 0 bila gagal.

## Kerjakan komentar dengan agent (dari Web UI)

Prototyper mendeteksi agent coding di komputer ini: **Claude Code** dan **OpenAI Codex** (teruji), **Gemini CLI** dan **GitHub Copilot CLI** (eksperimental — preset belum diuji dengan versi aslinya). Lihat statusnya lewat ikon ⚙ di panel Komentar (dialog *Agent lokal*, tombol **Cek ulang** setelah menginstal agent baru) atau `prototyper agents list`.

Panel Komentar punya tombol **Kerjakan dengan [agent ▾]** (semua komentar yang menunggu agent) dan **Kerjakan** per komentar; pilihan agent diingat. Prototyper menjalankan agent dalam mode non-interaktif di folder prototype (`claude -p`, `codex exec`, `gemini -p`, `copilot -p`); progres tampil live, tombol **Stop** tersedia, dan setelah selesai komentar diperbarui serta pratinjau static dimuat ulang. Tidak perlu kembali ke terminal.

- Agent hanya jalan saat Anda klik (tidak ada pemicu otomatis), dan hanya dari laptop ini (bukan dari LAN).
- Izin dibatasi: baca/edit file + perintah `prototyper`; lainnya ditolak otomatis (`--permission-mode dontAsk`, `--permission-prompts none`). Agent tidak bisa bertanya lewat terminal — ia bertanya lewat komentar (`comments ask`).
- Prototyper tidak membaca atau menyimpan kredensial; ia hanya menjalankan binary `claude` dengan login Claude Code Anda. Untuk memakai API key sebagai gantinya: set `ANTHROPIC_API_KEY` dan `PROTOTYPER_AGENT_AUTH=apikey` (Claude dijalankan dengan `--bare`). Lihat [aturan autentikasi Claude Code](https://code.claude.com/docs/en/legal-and-compliance.md).
- Batas waktu per run: `PROTOTYPER_AGENT_TIMEOUT_MIN` (default 20). Log run: `<PROTOTYPER_HOME>/logs/<id>.agent.log`.
- **Batalkan perubahan agent.** Sebelum dan sesudah run, Prototyper menyimpan checkpoint folder prototype (butuh Git; disimpan terpisah di `<PROTOTYPER_HOME>/checkpoints/`, repo Git Anda tidak disentuh). Bila run mengubah file, bar agent menampilkan **Batalkan (N file)**: file yang diubah agent dikembalikan, file baru buatan agent dihapus, sementara file lain yang Anda edit tetap. Komentar yang dikerjakan agent diberi balasan bahwa perubahannya dibatalkan (dan dibuka lagi bila sempat diselesaikan), sehingga agent berikutnya tahu riwayatnya. Bila file itu sudah Anda edit lagi, Prototyper bertanya dulu sebelum menimpanya. Matikan dengan `PROTOTYPER_AGENT_CHECKPOINT=0`.
- Agent default: `PROTOTYPER_AGENT_DEFAULT` (`claude`/`codex`/`gemini`/`copilot`). Path agent bisa dipaksa: `PROTOTYPER_AGENT_BIN_<ID>` (mis. `PROTOTYPER_AGENT_BIN_CODEX`). Shim npm (`codex.cmd`) dijalankan langsung lewat Node, tanpa `cmd.exe`.
- Izin per agent: Claude — baca/edit + `prototyper` saja (lainnya ditolak); Codex — sandbox `workspace-write` (tulis hanya di folder prototype, tanpa jaringan), `--ignore-user-config` agar model/MCP dari `config.toml` (mis. milik aplikasi Codex desktop) tidak ikut; hanya `[windows] sandbox` yang dibawa, model bisa dipilih lewat `PROTOTYPER_AGENT_CODEX_MODEL`; Gemini — `--approval-mode auto_edit` + shell `prototyper`; Copilot — `--allow-tool write` + `shell(prototyper)`.

## Petunjuk untuk agent (otomatis)

Saat folder didaftarkan (`add`, `new`, atau Web UI), Prototyper menulis bagian petunjuk di `AGENTS.md` folder prototype (dibuat bila belum ada; isi Anda di luar penanda `<!-- prototyper:start/end -->` tidak disentuh) dan `CLAUDE.md` berisi `@AGENTS.md` untuk Claude Code. Agent yang dibuka di folder prototype langsung tahu cara menjalankan prototype dan mengerjakan komentar — cukup bilang *"kerjakan komentar"*.

- **Setelah update Prototyper, petunjuk ikut disesuaikan otomatis.** Setiap kali daemon menyala, bagian bertanda di semua prototype terdaftar diperbarui ke versi Prototyper yang sedang berjalan; daftar prototype yang berubah tercatat di `daemon.log`. Sinkron otomatis hanya memperbarui bagian yang sudah ada: bila bagian itu dihapus, atau bila prototype memasang `"agent": { "syncInstructions": false }`, folder tersebut tidak disentuh. Matikan untuk semua prototype dengan `PROTOTYPER_AUTO_SYNC=0`.
- Untuk memasang ulang secara manual (termasuk membuat `AGENTS.md`/`CLAUDE.md` bila belum ada): `prototyper agents sync` (atau `agents sync <id>`).
- Bila `prototyper` belum ada di PATH, petunjuk menyebut shim `<PROTOTYPER_HOME>/bin/prototyper(.cmd)`. Shim itu ditulis ulang oleh daemon sehingga selalu menunjuk ke instalasi yang terakhir berjalan, baik exe, portable, npm, maupun source.
- Tidak mau file ditulis: `"agent": { "syncInstructions": false }` di `prototyper.json`.

## Komentar

Tulis komentar di panel **Komentar** pada halaman detail Web UI, lalu minta agent: *"kerjakan semua komentar open di prototype kasir-grosir"*. Agent memakai:

```powershell
prototyper comments kasir-grosir --json
prototyper comments resolve kasir-grosir c3 --note "Tombol bayar diperbesar"
prototyper comments ask kasir-grosir c4 "Warna tombol?" --option Ungu --option Hijau
```

**Komentari elemen** (prototype static): klik tombol **Komentari** di bilah pratinjau, lalu klik elemen atau blok teks di pratinjau — form komentar terisi elemen itu (selector CSS, cuplikan teks, teks yang diblok) dan halamannya otomatis. Komentar berelemen tampil sebagai pin bernomor di pratinjau; klik pin untuk melihat komentarnya, klik chip elemen di komentar untuk menyorot elemennya. Ini bekerja lewat skrip kecil yang disisipkan server static ke halaman HTML (diam bila halaman tidak dibuka di Web UI); matikan dengan `"static": { "inject": false }`. Prototype mode command (Vite) belum didukung — pakai komentar per halaman.

**Live-reload** (prototype static): halaman yang terbuka, baik di pratinjau maupun di tab browser biasa, dimuat ulang otomatis begitu file di folder prototype berubah, dan posisi scroll dipertahankan. Bila yang berubah hanya file `.css`, stylesheet diganti tanpa memuat ulang halaman, jadi isian form dan state lain tetap. Matikan dengan `"static": { "liveReload": false }`.

Pertanyaan dari `ask` tampil di Web UI sebagai radio button (atau checkbox dengan `--multi`) plus kolom teks: pilih opsi untuk menjawab, atau tulis pertanyaan balik tanpa memilih — pertanyaannya tetap menunggu. Setiap komentar open diberi label **Menunggu Anda** / **Menunggu agent**; badge sidebar berwarna oranye bila ada yang menunggu Anda. Agent mengambil yang gilirannya dengan `prototyper comments <id> --waiting agent --json`.

Komentar disimpan di `<folder prototype>/.prototyper/comments.json` (boleh di-commit; tidak ikut disajikan oleh server static). Badge di sidebar menunjukkan jumlah komentar open.

**Riwayat komentar.** Setiap komentar yang diselesaikan dicatat di `.prototyper/DECISIONS.md` (tanggal · komentar · halaman · elemen · permintaan → hasil), termasuk saat dibuka lagi atau saat perubahan agent dibatalkan. Sebelum mengerjakan komentar, agent menjalankan `prototyper comments context <id> <komentar> --json` untuk melihat komentar selesai di halaman/elemen yang sama dan keputusan sebelumnya, sehingga tidak mengulang revisi yang sudah ditolak. Komentar elemen juga menyimpan potongan HTML elemennya. Komentar selesai yang lebih tua dari 30 hari dipindah ke `.prototyper/comments-archive/` (`"comments": { "archiveDays": N }` di `prototyper.json`, 0 = tidak diarsipkan).

## Manifest `prototyper.json`

```json
{
  "id": "pos-sembako-ui",
  "name": "POS Sembako UI",
  "type": "command",
  "command": {
    "run": "npm run dev -- --port {port} --host {host} --strictPort",
    "install": "npm install"
  }
}
```

Mode `static`: `"type": "static", "static": { "root": "dist", "spa": true }`. Skema lengkap: [`schemas/prototyper.schema.json`](schemas/prototyper.schema.json). Port dialokasikan otomatis (4100–4199) dan dipakai ulang untuk prototype yang sama.

## Berbagi di jaringan lokal

```powershell
prototyper shutdown          # bila daemon sudah jalan dalam mode biasa
prototyper --lan start pos-sembako-ui
```

URL LAN tampil di `prototyper info` dan Web UI. Dari perangkat lain hanya bisa melihat & membuka prototype; start/stop/hapus hanya dari laptop ini. Izinkan Node di Windows Firewall untuk port 4000 dan 4100–4199.

## Konfigurasi

| Env | Default | Keterangan |
|---|---|---|
| `PROTOTYPER_HOME` | `~/.prototyper` | registry, state, log (`logs/<id>.log`, `daemon.log`) |
| `PROTOTYPER_WORKSPACE` | `<PROTOTYPER_HOME>/prototypes` | folder induk default untuk `prototyper new` |
| `PROTOTYPER_PORT` | `4000` | port daemon (API + UI) |
| `PROTOTYPER_PORT_RANGE` | `4100-4199` | rentang port prototype |
| `PROTOTYPER_LAN` | – | `1` = sama dengan `--lan` |
| `PROTOTYPER_AUTO_SYNC` | `1` | `0` = jangan memperbarui petunjuk agent di prototype saat daemon menyala |
| `PROTOTYPER_UPDATE_CHECK` | `1` | `0` = tray tidak memeriksa pembaruan otomatis (saat menyala dan tiap 24 jam) |
| `PROTOTYPER_UPDATE_REPO` | `egateza/Prototyper` | repo GitHub sumber pembaruan tray |
| `PROTOTYPER_AGENT_AUTH` | `login` | `apikey` = jalankan Claude dengan `--bare` + `ANTHROPIC_API_KEY` |
| `PROTOTYPER_AGENT_TIMEOUT_MIN` | `20` | batas waktu satu run agent |
| `PROTOTYPER_AGENT_CHECKPOINT` | `1` | `0` = tanpa checkpoint/Batalkan untuk run agent |
| `PROTOTYPER_AGENT_DEFAULT` | `claude` | agent default (`claude`, `codex`, `gemini`, `copilot`) |
| `PROTOTYPER_AGENT_BIN_<ID>` | – | path executable agent, mis. `PROTOTYPER_AGENT_BIN_CODEX` |

## Pengembangan

```powershell
npm run dev        # daemon dengan auto-reload
npm run typecheck
npm test
npm run schema     # regenerasi JSON Schema setelah mengubah src/core/manifest.ts
```
