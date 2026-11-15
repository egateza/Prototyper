# Rilis

Prototyper dirilis dalam tiga bentuk untuk setiap OS. Daftar berkas untuk pengguna ada di [`RELEASE-NOTES.md`](RELEASE-NOTES.md), yang juga menjadi isi halaman GitHub Release.

| Bentuk | Isi | Mode `APP_MODE` |
|---|---|---|
| Biner tunggal | Node SEA: `node` + `prototyper.cjs` + aset (web/, schemas/, package.json) dalam satu file | `sea` |
| Portable | `node/` + `app/prototyper.cjs` + aset + peluncur `prototyper` / `prototyper.cmd` | `bundle` |
| npm | `npm pack` dari `dist/` (hasil `tsc`) + web/ + schemas/ | `dist` |

## Membangun lokal

```bash
npm run release                       # exe + portable + npm untuk OS/arsitektur mesin ini
npm run release -- exe portable       # pilih target
npm run release -- --out D:\rilis     # folder hasil (default release/)
```

Node yang menjalankan skrip ikut dikemas, jadi pakai Node resmi dari nodejs.org (versi 24). Node dari distro atau Homebrew bisa saja tidak memiliki fuse SEA. Build tidak bisa lintas OS: biner macOS harus dibangun di macOS, dan seterusnya. Itu sebabnya ada workflow CI.

Urutan kerja [`scripts/release.ts`](../scripts/release.ts):

1. [`scripts/bundle.ts`](../scripts/bundle.ts) menjalankan esbuild: `src/cli/index.ts` → `build/app/prototyper.cjs` (CommonJS, semua dependensi ikut di-bundle), lalu menyalin web/, schemas/, dan package.json ringkas.
2. **exe**: semua isi `build/app` (kecuali bundle) menjadi aset SEA, ditambah `sea-manifest.json` (`id` = versi + hash). `node --experimental-sea-config` → blob, salin `node`, lalu `postject`. Di macOS ada langkah `codesign --remove-signature` sebelumnya dan tanda tangan ad-hoc sesudahnya. Hasilnya diuji dengan `--version`.
3. **portable**: salin `node` + `build/app` + peluncur, lalu arsipkan (.zip di Windows lewat `tar.exe` bawaan, .tar.gz di Linux/macOS).
4. **npm**: `npm run build` (setelah `dist/` dibersihkan) lalu `npm pack`.

## Hal yang perlu diingat saat mengubah kode

- Jangan memakai `import.meta.url` untuk mencari file aplikasi. Pakai `APP_DIR` dari [`src/core/appfiles.ts`](../src/core/appfiles.ts). Di bundle CJS `import.meta` kosong, dan di biner tunggal file aplikasi diekstrak ke `<PROTOTYPER_HOME>/app/<id>/`.
- Untuk memanggil CLI dari proses lain, pakai `cliCommand()`. Jangan menyusun `process.execPath` + skrip sendiri, karena di biner tunggal `process.execPath` adalah prototyper itu sendiri. Untuk menjalankan skrip JS pihak lain, pakai `scriptRunner()`.
- Jangan memakai top-level await atau `import()` dinamis di `src/`: bundle-nya CommonJS.
- File baru yang perlu dibaca saat runtime harus disalin oleh `bundleApp()`. Tes `test/bundle.test.ts` menjalankan bundle tanpa `node_modules`.

## Menerbitkan rilis

1. Naikkan `version` di `package.json` (dan `package-lock.json`), lalu commit.
2. `git tag v0.1.0 && git push origin v0.1.0`
3. Workflow [`release.yml`](../.github/workflows/release.yml) membangun di Windows x64, Linux x64/arm64, dan macOS arm64/x64, lalu membuat GitHub Release beserta `SHA256SUMS.txt`. Tag dengan tanda minus (`v0.2.0-beta.1`) diterbitkan sebagai prerelease.

`workflow_dispatch` (Actions → release → Run workflow) hanya membangun berkas sebagai artefak, tanpa membuat rilis.

Belum ada: penandatanganan kode (Authenticode / Apple notarization), installer (.msi / .pkg / .deb), dan publikasi ke registry npm.
