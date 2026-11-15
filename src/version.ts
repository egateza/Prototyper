import { readFileSync } from 'node:fs';
import path from 'node:path';
import { APP_DIR } from './core/appfiles.js';

const pkg = JSON.parse(readFileSync(path.join(APP_DIR, 'package.json'), 'utf8')) as { version: string };

export const VERSION: string = pkg.version;
