// Menjalankan vitest dari cwd yang dinormalkan.
// Windows: bila terminal memakai huruf drive kecil (d:\...), vitest memuat modulnya dua kali
// (d:/ vs D:/) dan semua tes gagal dengan "Cannot read properties of undefined (reading 'config')".
import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const cwd = realpathSync.native(process.cwd());
const require = createRequire(`${cwd}/package.json`);
const bin = path.join(path.dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
const child = spawn(process.execPath, [bin, ...process.argv.slice(2)], { cwd, stdio: 'inherit' });
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
