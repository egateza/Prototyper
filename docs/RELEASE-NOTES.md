## Yang baru di 0.3.5

- **Sembunyikan pratinjau tanpa memuat ulang.** Menyembunyikan lalu menampilkan pratinjau di Web UI tidak lagi memuat ulang halaman prototype, jadi posisi scroll, isian form, dan state lainnya tetap.
- Mode **Komentari** otomatis berhenti saat pratinjau disembunyikan.

Dari 0.3.0–0.3.4 (exe atau MSI), tray cukup mengunduh paket aplikasi `prototyper-0.3.5-app-r1.tar.gz` (sekitar 0,6 MB). Dari 0.3.3 ke atas, pembaruan ini hanya mengubah Web UI: Prototyper dan prototype tetap berjalan, cukup muat ulang halaman Prototyper di browser.

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
