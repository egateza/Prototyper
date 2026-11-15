import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { ROOT } from './bundle.js';
import { buildIco } from './winres.js';

/**
 * Bangun turunan icon dari assets/icon.svg (sumber tunggal):
 *   assets/icon.ico   16–256 px, dipasang ke prototyper.exe oleh scripts/release.ts
 *   assets/icon-256.png, assets/icon-512.png
 *   web/favicon.svg   favicon Web UI
 *   assets/tray/tray-<px>.png  dari assets/icon-tray.svg (tile tanpa padding, seperti prototype): ikon tray & logo popup
 * Hasilnya di-commit, jadi build rilis tidak perlu rasterizer. Jalankan ulang setelah mengubah icon.svg:
 *   npm run icon
 */
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
/** Ikon tray: ukuran ikon kecil pada 100–250% + logo popup. */
const TRAY_SIZES = [16, 20, 24, 32, 40, 48, 64];

export function renderPng(svg: string, size: number): Buffer {
  return Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng());
}

function main(): void {
  const src = path.join(ROOT, 'assets', 'icon.svg');
  const svg = readFileSync(src, 'utf8');
  const ico = buildIco(ICO_SIZES.map((size) => ({ size, png: renderPng(svg, size) })));
  writeFileSync(path.join(ROOT, 'assets', 'icon.ico'), ico);
  for (const size of [256, 512]) writeFileSync(path.join(ROOT, 'assets', `icon-${size}.png`), renderPng(svg, size));
  copyFileSync(src, path.join(ROOT, 'web', 'favicon.svg'));
  // PNG terpisah per ukuran: System.Drawing (.NET Framework) salah membaca .ico berisi PNG saat diubah ukurannya
  const traySvg = readFileSync(path.join(ROOT, 'assets', 'icon-tray.svg'), 'utf8');
  mkdirSync(path.join(ROOT, 'assets', 'tray'), { recursive: true });
  for (const size of TRAY_SIZES) writeFileSync(path.join(ROOT, 'assets', 'tray', `tray-${size}.png`), renderPng(traySvg, size));
  console.log(`assets/icon.ico (${ICO_SIZES.join(', ')} px, ${ico.length} byte), assets/icon-256.png, assets/icon-512.png, web/favicon.svg, assets/tray/tray-*.png`);
}

main();
