## Yang baru

- **Installer MSI (Windows).** `prototyper-<versi>-win-x64.msi` memasang Prototyper per pengguna tanpa hak admin (default `%LOCALAPPDATA%\Programs\Prototyper`): shortcut Start Menu, PATH pengguna, dan tray langsung menyala setelah dipasang. Uninstall menutup tray, daemon, dan prototype lebih dulu, serta menghapus "jalankan saat startup".
- **Pembaruan lebih kecil dari tray.** Bila exe tidak perlu diganti, tray cukup mengunduh paket aplikasi `prototyper-<versi>-app-r<runtime>.tar.gz` (sekitar 0,6 MB) alih-alih exe penuh. Aplikasi yang gagal dimuat otomatis kembali ke versi bawaan exe. Instalasi MSI diperbarui lewat MSI. Dari 0.2.0, tray mengunduh exe penuh sekali.
- **Halaman Yang baru** di Web UI (item di sidebar, klik nomor versi, atau `Ctrl+K`) dan di menu klik kanan tray.
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
