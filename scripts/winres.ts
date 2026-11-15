/** Helper resource Windows untuk skrip rilis (murni, tanpa efek samping — bisa dites). */

/** Versi numerik a.b.c.0 untuk resource VERSIONINFO (tanpa sufiks prerelease). */
export function windowsFileVersion(version: string): string {
  const [a = 0, b = 0, c = 0] = version.split(/[-+]/)[0]!.split('.').map((n) => Number.parseInt(n, 10) || 0);
  return `${a}.${b}.${c}.0`;
}

/** File .ico berisi entri PNG (didukung Windows Vista ke atas). */
export function buildIco(images: Array<{ size: number; png: Buffer }>): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // tipe: icon
  header.writeUInt16LE(images.length, 4);
  const entries: Buffer[] = [];
  let offset = 6 + 16 * images.length;
  for (const { size, png } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // lebar (0 = 256)
    e.writeUInt8(size >= 256 ? 0 : size, 1); // tinggi
    e.writeUInt8(0, 2); // jumlah warna palet
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // color planes
    e.writeUInt16LE(32, 6); // bit per piksel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += png.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}
