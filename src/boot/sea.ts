import { createRequire } from 'node:module';
import { getAsset } from 'node:sea';
import { appStoreDir, bootApp, SEA_MANIFEST_ASSET, type SeaManifest } from '../core/apphost.js';

/**
 * Main script biner tunggal (SEA). Sengaja kecil dan jarang berubah: hanya memilih aplikasi
 * (bawaan exe atau hasil pembaruan di `<PROTOTYPER_HOME>/app/`) lalu memuatnya.
 * Mengubah file ini = menaikkan RUNTIME di src/core/apphost.ts.
 */
bootApp({
  manifest: JSON.parse(getAsset(SEA_MANIFEST_ASSET, 'utf8')) as SeaManifest,
  read: (name) => getAsset(name),
  root: appStoreDir(),
  // require di SEA hanya untuk modul bawaan; file di disk dimuat lewat createRequire
  load: (file) => createRequire(file)(file),
  warn: (message) => process.stderr.write(`${message}\n`),
});
