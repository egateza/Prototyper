# Rilis

Prototyper dirilis dalam beberapa bentuk untuk setiap OS. Daftar berkas untuk pengguna ada di [`RELEASE-NOTES.md`](RELEASE-NOTES.md), yang juga menjadi isi halaman GitHub Release.

| Bentuk | Isi | Mode `APP_MODE` |
|---|---|---|
| Biner tunggal | Node SEA: `node` + bootstrap + aplikasi bawaan (`prototyper.cjs`, web/, schemas/, assets/, package.json, app.json) dalam satu file | `sea` |
| MSI (Windows) | Installer per-user berisi biner tunggal di atas + `installer.json` | `sea` |
| Paket aplikasi | `prototyper-<versi>-app-r<runtime>.tar.gz`: isi folder aplikasi saja, untuk pembaruan kecil dari tray (lintas OS) | — |
| Portable | `node/` + `app/prototyper.cjs` + aset + peluncur `prototyper` / `prototyper.cmd` | `bundle` |
| npm | `npm pack` dari `dist/` (hasil `tsc`) + web/ + schemas/ | `dist` |

## Membangun lokal

```bash
npm run release                       # exe + portable + npm + app (+ msi di Windows bila WiX terpasang)
npm run release -- exe portable       # pilih target: exe, portable, npm, app, msi
npm run release -- --out D:\rilis     # folder hasil (default release/)
```

Node yang menjalankan skrip ikut dikemas, jadi pakai Node resmi dari nodejs.org (versi 24). Node dari distro atau Homebrew bisa saja tidak memiliki fuse SEA. Build tidak bisa lintas OS: biner macOS harus dibangun di macOS, dan seterusnya. Itu sebabnya ada workflow CI.

MSI butuh WiX Toolset v4+ (dotnet tool): `dotnet tool install --global wix --version 5.0.2`. Tanpa WiX, `npm run release` melewati MSI dengan peringatan.

Urutan kerja [`scripts/release.ts`](../scripts/release.ts):

1. [`scripts/bundle.ts`](../scripts/bundle.ts) menjalankan esbuild: `src/cli/index.ts` → `build/app/prototyper.cjs` (CommonJS, semua dependensi ikut di-bundle), lalu menyalin web/, schemas/, assets/tray/, dan package.json ringkas. `stampApp()` menambahkan `app.json` (`id` = versi + hash isi, `runtime` = `RUNTIME`).
2. **exe**: main SEA adalah bootstrap kecil ([`src/boot/sea.ts`](../src/boot/sea.ts)); seluruh isi `build/app` (termasuk bundle) menjadi aset SEA, ditambah `sea-manifest.json`. `node --experimental-sea-config` → blob, salin `node`, lalu `postject`. Di Windows, sebelum `postject` dijalankan, `rcedit` memasang `assets/icon.ico` dan info file (ProductName, versi) agar exe tidak tampil sebagai Node.js. Di macOS ada langkah `codesign --remove-signature` sebelumnya dan tanda tangan ad-hoc sesudahnya. Hasilnya diuji: aplikasi bawaan jalan, aplikasi lebih baru di app store dipilih, dan aplikasi rusak ditandai `.broken` lalu kembali ke bawaan.
3. **app**: isi `build/app` dikemas tar.gz ([`src/core/apppack.ts`](../src/core/apppack.ts)).
4. **msi**: [`scripts/msi.ts`](../scripts/msi.ts) menulis `.wxs` (per-user tanpa UAC; wizard WixUI_InstallDir berbahasa Inggris tanpa halaman lisensi, default ke `%LOCALAPPDATA%\Programs\Prototyper`, folder pilihan diingat di `HKCU\Software\Prototyper\InstallDir` untuk pembaruan; shortcut Start Menu, PATH pengguna, `installer.json`, MajorUpgrade; uninstall/upgrade menjalankan `prototyper quit` (uninstall: `--remove-startup`) sebelum file diperiksa; tray dinyalakan setelah pasang kecuali `LAUNCHAPP=0`; folder di luar drive Windows dipasang tanpa rollback (`DISABLEROLLBACK`) karena `<drive>:\Config.Msi` di drive lain biasanya tidak bisa ditulis instalasi per-user; notifikasi memakai AppUserModelID `Prototyper.Tray`; tanpa jendela konsol: `quit` lewat `WixQuietExec`, menjalankan Prototyper = membuka shortcut Start Menu yang `Show="minimized"` lewat explorer. Exe peluncur GUI terpisah sengaja tidak dipakai: tanpa tanda tangan, Defender mendeteksinya sebagai Trojan, false positive), lalu `wix extension add` (WixToolset.UI.wixext, WixToolset.Util.wixext) dan `wix build`.
5. **portable**: salin `node` + `build/app` + peluncur, lalu arsipkan (.zip di Windows lewat `tar.exe` bawaan, .tar.gz di Linux/macOS).
6. **npm**: `npm run build` (setelah `dist/` dibersihkan) lalu `npm pack`.

## Runtime dan aplikasi terpisah (biner tunggal)

Exe = runtime (Node + bootstrap + aplikasi bawaan). Aplikasi aktif tinggal di `<PROTOTYPER_HOME>/app/<id>/`, dan `app/current.json` menunjuk aplikasi hasil pembaruan. Bootstrap (`bootApp` di [`src/core/apphost.ts`](../src/core/apphost.ts)) memakai aplikasi di `current.json` bila `runtime`-nya sama dengan exe, versinya lebih baru dari aplikasi bawaan, dan tidak bertanda `.broken`. Selain itu aplikasi bawaan yang dipakai, jadi exe yang lebih baru otomatis menang. Aplikasi yang gagal dimuat ditandai `.broken` dan bootstrap kembali ke aplikasi bawaan.

Pembaruan dari tray memilih berkas rilis (`updateCandidates()` di [`src/core/update.ts`](../src/core/update.ts)):

| Berkas di rilis | Dipakai bila | Pemasangan |
|---|---|---|
| `prototyper-<v>-app-r<RUNTIME exe>.tar.gz` | ada (runtime sama) | ekstrak ke app store, ganti `current.json`, verifikasi `prototyper --version` (gagal → `current.json` dikembalikan), semuanya selagi daemon tetap berjalan. Bila hanya Web UI yang berubah (lihat di bawah): tanpa restart. Selain itu: daemon dihentikan, tray dimulai ulang |
| `prototyper-<v>-win-<arch>.msi` | dipasang lewat MSI (`installer.json` di sebelah exe) | skrip PowerShell: tunggu tray keluar, `msiexec /passive LAUNCHAPP=0`, nyalakan tray dengan `--restore` |
| `prototyper-<v>-win-<arch>.exe` | selain itu | exe lama di-rename ke `.old`, exe baru disalin |

**Pembaruan Web UI tanpa restart.** `stampApp()` menulis `codeHash` di `app.json`: hash semua file aplikasi kecuali `web/` dan `app.json`, dengan `version` di `package.json` diabaikan (`computeCodeHash()` di `src/core/apphost.ts`). Rilis yang hanya mengubah `web/` (termasuk `whatsnew.json`) menghasilkan `codeHash` yang sama. Setelah paket dipasang, tray membandingkan `codeHash` aplikasi baru dengan kodenya sendiri. Bila sama, tray memanggil `POST /api/app/reload-web`: daemon memeriksa ulang terhadap kodenya sendiri (`resolveWebSwap()`), lalu melayani Web UI dan versi `/api/health` dari folder aplikasi baru. Daemon dan prototype tetap berjalan, dan pengguna cukup memuat ulang browser. Bila `codeHash` berbeda, tidak ada, atau daemon menolak (409), tray kembali ke alur restart. Folder aplikasi yang sedang menjadi sumber Web UI tidak ikut dibersihkan (`keep` di `installAppUpdate`). Aplikasi ≤ 0.3.2 belum punya `codeHash`, jadi pembaruan pertama dari versi itu tetap restart. Perubahan di `src/`, `schemas/`, `assets/`, atau dependensi selalu berarti restart.

**Kapan menaikkan `RUNTIME`** (`src/core/apphost.ts`): versi mayor Node di CI berganti, `src/boot/sea.ts` atau kontrak `HostInfo` berubah, atau aplikasi memakai API Node yang belum ada di exe lama. Setelah dinaikkan, paket aplikasi bernama `-app-r<baru>` tidak cocok dengan exe lama, sehingga tray mengunduh MSI/exe penuh. Ikon exe dan info versi di Properties exe hanya berganti lewat MSI/exe penuh. Bila perubahan ikon perlu segera sampai ke pengguna, naikkan `RUNTIME`.

## Icon

Sumber tunggal icon adalah `assets/icon.svg`, monogram "Blueprint" beraksen Indigo `#5b5bf6`. Setelah mengubahnya, jalankan `npm run icon` ([`scripts/gen-icon.ts`](../scripts/gen-icon.ts)) untuk membuat ulang `assets/icon.ico` (16–256 px), `assets/icon-256.png`, `assets/icon-512.png`, dan `web/favicon.svg`, lalu commit hasilnya. Build rilis tidak merender ulang icon.

## Hal yang perlu diingat saat mengubah kode

- Jangan memakai `import.meta.url` untuk mencari file aplikasi. Pakai `APP_DIR` dari [`src/core/appfiles.ts`](../src/core/appfiles.ts). Di bundle CJS `import.meta` kosong, dan di biner tunggal file aplikasi diekstrak ke `<PROTOTYPER_HOME>/app/<id>/`.
- Untuk memanggil CLI dari proses lain, pakai `cliCommand()`. Jangan menyusun `process.execPath` + skrip sendiri, karena di biner tunggal `process.execPath` adalah prototyper itu sendiri. Untuk menjalankan skrip JS pihak lain, pakai `scriptRunner()`.
- Jangan memakai top-level await atau `import()` dinamis di `src/`: bundle-nya CommonJS.
- Pembaruan dari tray (`src/core/update.ts`) bergantung pada nama berkas `prototyper-<versi>-app-r<runtime>.tar.gz`, `prototyper-<versi>-win-<arch>.msi`, `prototyper-<versi>-win-<arch>.exe`, tag `v<versi>`, dan `SHA256SUMS.txt` di rilis. Bila salah satunya diubah, ubah juga `updateCandidates()`. Nama `.exe` jangan diubah: tray 0.2 hanya mengenal nama itu.
- `MSI_UPGRADE_CODE` dan `MSI_COMPONENT_GUIDS` di `scripts/msi.ts` jangan pernah diubah. Tanpa kode yang sama, MSI baru tidak mengganti yang lama. Bila isi komponen MSI berubah (file ditambah/dihapus), buat komponen baru ber-GUID baru. Cek hasil build dengan `wix msi validate <file.msi>`: peringatan ICE61 (AllowSameVersionUpgrades) dan ICE91 (khusus per-user) memang diharapkan.
- File baru yang perlu dibaca saat runtime harus disalin oleh `bundleApp()` (mis. `assets/tray/` untuk logo tray). Tes `test/bundle.test.ts` menjalankan bundle tanpa `node_modules`.

## Menerbitkan rilis

1. Naikkan `version` di `package.json` (dan `package-lock.json`), tambahkan entri versi itu di urutan teratas [`web/whatsnew.json`](../web/whatsnew.json) (halaman *Yang baru* di Web UI & tray; tes `whatsnew.test.ts` gagal bila lupa), perbarui `RELEASE-NOTES.md`, lalu commit.
2. `git tag v0.1.0 && git push origin v0.1.0`
3. Workflow [`release.yml`](../.github/workflows/release.yml) membangun di Windows x64, Linux x64/arm64, dan macOS arm64/x64, lalu membuat GitHub Release beserta `SHA256SUMS.txt`. Tag dengan tanda minus (`v0.2.0-beta.1`) diterbitkan sebagai prerelease.

`workflow_dispatch` (Actions → release → Run workflow) hanya membangun berkas sebagai artefak, tanpa membuat rilis.

Belum ada: penandatanganan kode (Authenticode / Apple notarization), installer selain MSI (.pkg / .deb), pembaruan aplikasi untuk versi portable, dan publikasi ke registry npm.
