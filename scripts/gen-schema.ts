import { mkdirSync, writeFileSync } from 'node:fs';
import { manifestJsonSchemaText } from '../src/core/manifest.js';

const out = new URL('../schemas/', import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL('prototyper.schema.json', out), manifestJsonSchemaText());
console.log('schemas/prototyper.schema.json diperbarui');
