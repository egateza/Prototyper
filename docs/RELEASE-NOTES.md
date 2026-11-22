## Yang baru di 0.4.0

- **Edit dari HP lewat jaringan.** Nyalakan Mode LAN **Web UI + prototype** (tray, atau `prototyper serve --lan`), lalu di Web UI komputer klik ikon **HP** di bawah sidebar (atau palet perintah → *Hubungkan HP*). Pindai QR dengan kamera HP, atau buka alamatnya dan ketik kode 6 digit. Kode berlaku 5 menit, hanya sekali pakai, dan dibatalkan setelah 5 kali salah.
- HP yang terpasang bisa berkomentar (termasuk lampiran gambar), menjawab pertanyaan agent, menjalankan/menghentikan/membatalkan agent, serta start/stop/restart prototype. Hapus/daftarkan prototype, manifest, install, desain sistem, update, dan mematikan Prototyper tetap hanya dari komputer. Daftar HP terpasang ada di dialog yang sama, lengkap dengan tombol **Cabut**.
- **Perubahan perilaku `--lan`:** perangkat yang belum dipasangkan tidak bisa lagi membaca daftar prototype, komentar, atau log. Yang terbuka untuknya hanya halaman pairing.
- **Keamanan:** token HP disimpan di cookie `HttpOnly`, dan daemon hanya menyimpan hash-nya (`<PROTOTYPER_HOME>/devices.json`). API kini menolak request yang Origin-nya dari situs lain (CSRF) dan nama host selain IP, `localhost`, atau nama komputer (DNS rebinding). Nama host tambahan, mis. MagicDNS Tailscale, didaftarkan di `PROTOTYPER_ALLOWED_HOSTS` (dipisah koma).
- **Tampilan mobile.** Di layar ≤ 800px, sidebar menjadi laci (tombol ☰) dan panel komentar menjadi lembar dari bawah (tombol komentar, dengan jumlah komentar open). Tombol panah menyalakan mode komentar elemen: ketuk elemen di pratinjau, dan lembar komentar terbuka dengan elemen itu terlampir. Panel komentar di mobile yang sebelumnya terdorong jauh ke bawah sudah diperbaiki.
- Mode **Desktop** di pratinjau dirender selebar 1280px lalu diperkecil bila kotak pratinjau lebih sempit dari 1024px, jadi prototype tetap memakai tata letak desktop di HP.
- **Desain sistem.** `prototyper new <id> -t design-system` membuat token & komponen bersama. Pasang ke prototype dengan `prototyper ds use <prototype> <desain-sistem>` (atau `new … --design-system <id>`), sebarkan perubahan dengan `prototyper ds sync <desain-sistem>`. Prototype yang punya token/komponen sendiri: `prototyper ds local`. Semuanya juga tersedia di Web UI. Contoh: `examples/sembako-ds`.
- **Lampiran gambar** di komentar, balasan, dan pesan ke agent (PNG, JPG, GIF, WebP, SVG). Disimpan di `.prototyper/attachments/` dan diteruskan ke agent.
- Tombol **Pilih…** di dialog Buat baru / Daftarkan membuka dialog pilih folder/file bawaan OS.
- `prototyper update` memasang pembaruan tanpa tray, dan pembaruan diperiksa berkala. `prototyper lan <id> on|off` membuka akses LAN untuk satu prototype. `prototyper serve --detach` menjalankan daemon di latar. Teks komentar multi-baris bisa lewat `--file -` (stdin).

Pembaruan ke 0.4.0 mengubah kode server, jadi Prototyper dimulai ulang sekali.

## 0.3.11

- **Lanjut sesi agent (Claude Code).** Klik **Kerjakan** berikutnya pada prototype yang sama melanjutkan percakapan run sebelumnya, jadi agent ingat apa yang sudah dilihat dan diubahnya dan tidak perlu membaca ulang semuanya dari awal. Hasilnya lebih nyambung dan lebih hemat.
- Bar agent menampilkan **↻ Lanjutkan sesi · N run**. Klik untuk memulai **Sesi baru** pada run berikutnya.
- Sesi otomatis tidak dilanjutkan bila sudah lewat 24 jam (`PROTOTYPER_AGENT_RESUME_HOURS`, 0 = mati), bila perubahan run terakhir Anda batalkan, atau bila folder prototype berpindah. Bila sesinya sudah tidak ada di Claude Code, Prototyper otomatis mengulang dengan sesi baru.
- Sesi disimpan di `<PROTOTYPER_HOME>/agent-sessions.json`, jadi tetap bisa dilanjutkan setelah Prototyper dimulai ulang. Agent lain (Codex, Gemini, Copilot) selalu memulai sesi baru seperti sebelumnya.

- **Mode LAN dari tray.** Popup tray (klik kiri) dan menu klik kanan punya toggle **Mode LAN**. Saat dinyalakan, daemon dimulai ulang agar bisa dibuka dari HP/laptop lain di jaringan yang sama, dan prototype yang tadi berjalan dinyalakan lagi. Alamatnya (mis. `192.168.1.5:4000`) tampil di bawah toggle dengan tombol **Salin**. Pilihannya diingat. Seperti `--lan`, perangkat lain hanya bisa melihat; start/stop, komentar, dan agent tetap hanya dari komputer ini. Bila Windows meminta izin firewall, izinkan untuk jaringan Private.
- **LAN untuk prototype saja.** Di bawah toggle ada pilihan **Semua** / **Prototype saja**. *Prototype saja* membuka prototype ke jaringan (mis. `http://192.168.1.5:4101`), sedangkan Web UI Prototyper, komentar, dan log tetap hanya di komputer ini. Tombol **Salin** menyalin alamat prototype yang sedang berjalan. Dari terminal: `prototyper --lan-prototypes …` atau `PROTOTYPER_LAN=prototypes`.
- **Tampilan HP sama dengan pratinjau.** Prototype static tanpa `<meta name="viewport">` dulu tampil sebagai layout desktop yang diperkecil saat dibuka di HP, meskipun di pratinjau perangkat sudah tampil versi mobile. Sekarang meta itu disisipkan otomatis bila belum ada. Matikan dengan `"static": { "viewport": false }`.

Pembaruan ke 0.3.11 mengubah kode server, jadi Prototyper dimulai ulang sekali.

## 0.3.10

- **Riwayat & konteks komentar.** Setiap komentar yang diselesaikan dicatat satu baris di `.prototyper/DECISIONS.md` (tanggal · komentar · halaman · elemen · permintaan → hasil). Hasilnya diambil dari catatan saat menyelesaikan, atau dari laporan terakhir agent bila catatannya kosong. Komentar yang dibuka lagi dan perubahan agent yang dibatalkan juga tercatat.
- `prototyper comments context <id> <komentar> [--json]` (dan `GET /api/prototypes/:id/comments/:cid/context`) memberi agent konteks satu komentar: thread-nya, sampai 10 komentar selesai di halaman yang sama (yang elemennya sama lebih dulu), dan sampai 20 keputusan terkait. Petunjuk agent di `AGENTS.md` prototype dan prompt "Kerjakan" dari Web UI memintanya dijalankan sebelum mengerjakan komentar.
- Komentar elemen menyimpan potongan HTML elemen (`anchor.html`) saat dibuat, agar tetap bermakna bila selector sudah usang.
- **Arsip otomatis.** Komentar selesai yang lebih tua dari 30 hari dipindah ke `.prototyper/comments-archive/YYYY-MM.json` saat komentar disimpan. Atur dengan `"comments": { "archiveDays": N }` di `prototyper.json` (0 = tidak diarsipkan). `comments list --include-archive` / `?archive=1` menampilkannya lagi.

Pembaruan ke 0.3.10 mengubah kode server, jadi Prototyper dimulai ulang sekali. Petunjuk agent di folder prototype diperbarui otomatis saat Prototyper menyala.

## 0.3.9

- **Batalkan perubahan agent.** Sebelum agent mulai bekerja dari Web UI, Prototyper menyimpan checkpoint folder prototype. Bila agent mengubah file, bar agent menampilkan tombol **Batalkan (N file)** beserta daftar filenya. File yang diubah agent dikembalikan, file baru buatan agent dihapus. File lain yang Anda edit tidak ikut berubah.
- Bila file yang diubah agent sudah Anda edit lagi, Prototyper menampilkan daftarnya dan bertanya dulu sebelum menimpa.
- Komentar yang dikerjakan agent mendapat balasan bahwa perubahannya dibatalkan, lengkap dengan daftar file, dan giliran kembali ke Anda. Komentar yang sempat diselesaikan agent dibuka lagi. Agent berikutnya jadi tahu bahwa percobaan itu ditolak.
- Checkpoint butuh Git dan disimpan terpisah di `<PROTOTYPER_HOME>/checkpoints/`, jadi repo Git Anda (index, stash, branch) tidak disentuh. Tanpa Git, agent tetap jalan tanpa checkpoint. Checkpoint ikut dihapus saat prototype dihapus dari daftar. Matikan dengan `PROTOTYPER_AGENT_CHECKPOINT=0`.

Pembaruan ke 0.3.9 mengubah kode server, jadi Prototyper dimulai ulang sekali.

## 0.3.8

- **Live-reload untuk prototype static.** Halaman yang terbuka, di pratinjau Web UI maupun di tab browser biasa, dimuat ulang otomatis begitu file prototype berubah, misalnya saat agent selesai mengedit. Posisi scroll dipertahankan.
- Bila yang berubah hanya file `.css`, stylesheet diganti tanpa memuat ulang halaman, jadi isian form dan state lain tetap.
- Setiap muat ulang dicatat di log prototype. Matikan per prototype dengan `"static": { "liveReload": false }` di `prototyper.json`.

Pembaruan ke 0.3.8 mengubah kode server, jadi Prototyper dimulai ulang sekali. Prototype static yang sedang berjalan perlu di-restart agar live-reload aktif.

## 0.3.7

- **Ikon perangkat memantul saat diputar.** Saat orientasi pratinjau diputar (klik ikon tablet/mobile yang aktif), ikon itu berputar dengan efek memantul. Ikon lain tetap diam.

Dari 0.3.0–0.3.6 (exe atau MSI), tray cukup mengunduh paket aplikasi `prototyper-0.3.7-app-r1.tar.gz` (sekitar 0,6 MB). Dari 0.3.6, pembaruan ini hanya mengubah Web UI: tombolnya "Pasang", Prototyper dan prototype tetap berjalan, cukup muat ulang halaman Prototyper di browser.

## 0.3.6

- **Tombol "Pasang" untuk pembaruan Web UI.** Bila pembaruan yang diunduh tray hanya mengubah Web UI, tombolnya kini "Pasang", bukan "Mulai ulang": Prototyper dan prototype tetap berjalan, cukup muat ulang halaman Prototyper di browser. Pembaruan yang mengubah kode tetap bertuliskan "Mulai ulang".

Pembaruan ke 0.3.6 mengubah kode tray, jadi Prototyper dimulai ulang sekali.

## 0.3.5

- **Sembunyikan pratinjau tanpa memuat ulang.** Menyembunyikan lalu menampilkan pratinjau di Web UI tidak lagi memuat ulang halaman prototype, jadi posisi scroll, isian form, dan state lainnya tetap.
- Mode **Komentari** otomatis berhenti saat pratinjau disembunyikan.

Dari 0.3.3 ke atas, pembaruan ke 0.3.5 hanya mengubah Web UI dan dipasang tanpa restart.

## 0.3.4

- **Notifikasi tray benar-benar bisa dimatikan.** Bila "Tampilkan notifikasi" tidak dicentang, notifikasi pembaruan, konfirmasi startup, dan info lain kini ikut diam. Sebelumnya hanya notifikasi status prototype yang mati.
- Yang tetap tampil hanya error dari aksi yang Anda klik sendiri (mis. gagal memasang pembaruan), agar kegagalan tidak terjadi diam-diam.

Pembaruan ke 0.3.4 mengubah kode tray, jadi Prototyper dimulai ulang sekali.

## 0.3.3

- **Pembaruan Web UI tanpa restart.** Pembaruan dari tray yang hanya mengubah Web UI kini dipasang tanpa mematikan daemon maupun prototype yang sedang berjalan: cukup muat ulang halaman Prototyper di browser. Pembaruan yang mengubah kode tetap memulai ulang Prototyper seperti biasa.
- Paket aplikasi dipasang lebih dulu selagi Prototyper berjalan; bila pemasangan gagal, tidak ada yang dihentikan.

Pembaruan ke 0.3.3 sendiri masih memulai ulang sekali; sesudahnya, pembaruan khusus Web UI berlaku tanpa restart.

## 0.3.2

- Popup klik kiri tray kini menampilkan versi Prototyper yang sedang berjalan di samping judul.

## 0.3.1

- Halaman **Yang baru** di Web UI kini dibuka dengan klik nomor versi di samping logo; titik kecil di samping versi menandai perubahan yang belum dilihat. Item di sidebar dan palet perintah dihapus. Menu tray tetap ada.
- Ikon tombol agent **Kerjakan** kembali seperti semula.
- Berkas `.wixpdb` tidak lagi ikut di halaman rilis.

## 0.3.0 (sejak 0.2.0)

- **Installer MSI (Windows).** `prototyper-<versi>-win-x64.msi` memasang Prototyper per pengguna tanpa hak admin (default `%LOCALAPPDATA%\Programs\Prototyper`): shortcut Start Menu, PATH pengguna, dan tray langsung menyala setelah dipasang. Uninstall menutup tray, daemon, dan prototype lebih dulu, serta menghapus "jalankan saat startup".
- **Pembaruan lebih kecil dari tray.** Bila exe tidak perlu diganti, tray cukup mengunduh paket aplikasi `prototyper-<versi>-app-r<runtime>.tar.gz` (sekitar 0,6 MB) alih-alih exe penuh. Aplikasi yang gagal dimuat otomatis kembali ke versi bawaan exe. Instalasi MSI diperbarui lewat MSI. Dari 0.2.0, tray mengunduh exe penuh sekali.
- **Halaman Yang baru**: klik nomor versi di Web UI, atau dari menu klik kanan tray.
- Perintah `prototyper quit`: tutup tray, daemon, dan semua prototype sekaligus.
- Popup tray tertutup saat mengklik di luar popup, dan popup/menu tidak lagi muncul di Alt+Tab maupun taskbar.

## Pilih berkas unduhan

| OS | Biner tunggal (tanpa Node) | Portable (tanpa Node) | Lewat npm (butuh Node ≥ 22.12) |
|---|---|---|---|
| Windows x64 | `prototyper-<versi>-win-x64.exe` | `prototyper-<versi>-win-x64-portable.zip` | `prototyper-<versi>.tgz` |
| Linux x64 (Ubuntu, dll.) | `prototyper-<versi>-linux-x64.tar.gz` | `prototyper-<versi>-linux-x64-portable.tar.gz` | `prototyper-<versi>.tgz` |
| Linux arm64 | `prototyper-<versi>-linux-arm64.tar.gz` | `prototyper-<versi>-linux-arm64-portable.tar.gz` | `prototyper-<versi>.tgz` |
| macOS Apple Silicon | `prototyper-<versi>-macos-arm64.tar.gz` | `prototyper-<versi>-macos-arm64-portable.tar.gz` | `prototyper-<versi>.tgz` |
| macOS Intel | `prototyper-<versi>-macos-x64.tar.gz` | `prototyper-<versi>-macos-x64-portable.tar.gz` | `prototyper-<versi>.tgz` |

- **Windows**: selain biner tunggal ada installer `prototyper-<versi>-win-x64.msi` (per pengguna, tanpa admin; menambahkan shortcut Start Menu dan PATH).
- **Biner tunggal**: satu file berisi Node.js + Prototyper (sekitar 90 MB). Cukup diunduh lalu dijalankan.
- **Portable**: folder berisi `node`, `app/`, dan peluncur `prototyper` / `prototyper.cmd`. Ukuran unduhan lebih kecil, isinya bisa dilihat, dan tidak perlu diinstal.
- **npm**: untuk yang sudah punya Node. Perintah `prototyper` terpasang global.

Prototype mode command (template `vite-vanilla` / `vite-react`) tetap butuh Node.js + npm di PATH. Prototype static tidak butuh Node.

### Windows

```powershell
# installer (disarankan): dobel-klik, atau tanpa wizard
msiexec /i prototyper-<versi>-win-x64.msi /passive

# biner tunggal: taruh di folder yang ada di PATH, misalnya D:\Tools
Rename-Item prototyper-<versi>-win-x64.exe prototyper.exe
prototyper --version

# portable: ekstrak zip, lalu tambahkan foldernya ke PATH
prototyper.cmd --version

# npm
npm install -g .\prototyper-<versi>.tgz
```

Bila `prototyper.exe` di-dobel-klik dari Explorer, Prototyper berjalan sebagai ikon di tray Windows: daemon ikut dinyalakan, lalu jendela konsolnya tertutup sendiri. Klik kiri ikon untuk status dan daftar prototype, klik kanan untuk menu (buka Web UI, jalankan saat startup, periksa pembaruan, keluar), dan klik dua kali untuk membuka Web UI (http://localhost:4000). Perintah lain dijalankan dari terminal (`prototyper --help`).

Karena biner belum ditandatangani, Windows SmartScreen bisa memperingatkan. Pilih **More info → Run anyway**.

### Linux / macOS

```sh
# biner tunggal
tar -xzf prototyper-<versi>-linux-x64.tar.gz      # menghasilkan ./prototyper
mkdir -p ~/.local/bin && mv prototyper ~/.local/bin/
prototyper --version

# portable
tar -xzf prototyper-<versi>-linux-x64-portable.tar.gz
ln -s "$PWD/prototyper-<versi>-linux-x64-portable/prototyper" ~/.local/bin/prototyper

# npm
npm install -g ./prototyper-<versi>.tgz
```

Di macOS, file yang diunduh lewat browser diberi tanda karantina dan Gatekeeper akan menolak menjalankannya. Hapus tandanya sekali:
`xattr -d com.apple.quarantine ~/.local/bin/prototyper` (untuk versi portable: `xattr -dr com.apple.quarantine <folder>`).

Periksa integritas dengan `SHA256SUMS.txt`.
