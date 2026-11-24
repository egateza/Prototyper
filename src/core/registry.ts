import path from 'node:path';
import { AppError, errorMessage } from './errors.js';
import { isDirectory, readJsonFile, samePath, writeJsonAtomic } from './fsutil.js';
import { loadManifest, type Manifest } from './manifest.js';
import { defineMessages } from './i18n.js';

const t = defineMessages({
  id: {
    corruptWithError: 'Registry rusak ({file}): {message}',
    corrupt: 'Registry rusak ({file})',
    notRegisteredHint: 'Prototype "{id}" tidak terdaftar. Lihat daftar: prototyper list',
    idTaken: 'id "{id}" sudah dipakai oleh {path}',
    folderRegistered: 'Folder ini sudah terdaftar sebagai "{id}"',
    folderNotFound: 'Folder tidak ditemukan: {path}',
    notRegistered: 'Prototype "{id}" tidak terdaftar',
    manifestIdTaken: 'id "{id}" di manifest sudah dipakai prototype lain',
  },
  en: {
    corruptWithError: 'The registry is corrupt ({file}): {message}',
    corrupt: 'The registry is corrupt ({file})',
    notRegisteredHint: 'Prototype "{id}" is not registered. See the list: prototyper list',
    idTaken: 'id "{id}" is already used by {path}',
    folderRegistered: 'This folder is already registered as "{id}"',
    folderNotFound: 'Folder not found: {path}',
    notRegistered: 'Prototype "{id}" is not registered',
    manifestIdTaken: 'id "{id}" in the manifest is already used by another prototype',
  },
});

export interface RegistryEntry {
  id: string;
  path: string;
  addedAt: string;
}

interface RegistryFile {
  version: 1;
  prototypes: RegistryEntry[];
}

export interface ResolvedPrototype extends RegistryEntry {
  manifest: Manifest | null;
  error: string | null;
}

/**
 * Registry pusat: hanya menyimpan pointer (id + path). Manifest di folder
 * prototype adalah sumber kebenaran dan dibaca ulang setiap kali diakses.
 */
export class Registry {
  readonly file: string;
  readonly home: string;

  constructor(home: string) {
    this.home = home;
    this.file = path.join(home, 'registry.json');
  }

  private async read(): Promise<RegistryFile> {
    let data: RegistryFile | undefined;
    try {
      data = await readJsonFile<RegistryFile>(this.file);
    } catch (err) {
      throw new AppError('INTERNAL', t('corruptWithError', { file: this.file, message: errorMessage(err) }));
    }
    if (!data) return { version: 1, prototypes: [] };
    if (!Array.isArray(data.prototypes)) throw new AppError('INTERNAL', t('corrupt', { file: this.file }));
    return data;
  }

  private write(data: RegistryFile): Promise<void> {
    return writeJsonAtomic(this.file, data);
  }

  private async resolveEntry(e: RegistryEntry): Promise<ResolvedPrototype> {
    if (!(await isDirectory(e.path))) return { ...e, manifest: null, error: t('folderNotFound', { path: e.path }) };
    try {
      return { ...e, manifest: await loadManifest(e.path), error: null };
    } catch (err) {
      return { ...e, manifest: null, error: errorMessage(err) };
    }
  }

  async list(): Promise<ResolvedPrototype[]> {
    const data = await this.read();
    const out = await Promise.all(data.prototypes.map((e) => this.resolveEntry(e)));
    let changed = false;
    out.forEach((r, i) => {
      const entry = data.prototypes[i];
      if (!entry || !r.manifest || r.manifest.id === entry.id) return;
      const newId = r.manifest.id;
      if (data.prototypes.some((o) => o !== entry && o.id === newId)) {
        r.error = t('manifestIdTaken', { id: newId });
        r.manifest = null;
        return;
      }
      entry.id = newId; // id di manifest berubah: ikuti manifest
      r.id = newId;
      changed = true;
    });
    if (changed) await this.write(data);
    return out;
  }

  async get(id: string): Promise<ResolvedPrototype | undefined> {
    return (await this.list()).find((p) => p.id === id);
  }

  async require(id: string): Promise<ResolvedPrototype> {
    const p = await this.get(id);
    if (!p) throw new AppError('NOT_FOUND', t('notRegisteredHint', { id }));
    return p;
  }

  /** Pastikan folder dan id belum terdaftar (dipanggil sebelum menulis manifest baru). */
  async assertCanAdd(dir: string, id: string): Promise<void> {
    this.checkConflicts(await this.read(), path.resolve(dir), id);
  }

  /** Pastikan `id` tidak dipakai prototype lain selain yang berada di folder `dir`. */
  async assertIdFree(id: string, dir: string): Promise<void> {
    const abs = path.resolve(dir);
    const other = (await this.read()).prototypes.find((e) => e.id === id && !samePath(e.path, abs));
    if (other) throw new AppError('CONFLICT', t('idTaken', { id, path: other.path }));
  }

  private checkConflicts(data: RegistryFile, abs: string, id: string): void {
    const samePathEntry = data.prototypes.find((e) => samePath(e.path, abs));
    if (samePathEntry) throw new AppError('CONFLICT', t('folderRegistered', { id: samePathEntry.id }));
    const sameId = data.prototypes.find((e) => e.id === id);
    if (sameId) throw new AppError('CONFLICT', t('idTaken', { id, path: sameId.path }));
  }

  async add(dir: string): Promise<ResolvedPrototype> {
    const abs = path.resolve(dir);
    if (!(await isDirectory(abs))) throw new AppError('BAD_REQUEST', t('folderNotFound', { path: abs }));
    const manifest = await loadManifest(abs);
    const data = await this.read();
    this.checkConflicts(data, abs, manifest.id);
    const entry: RegistryEntry = { id: manifest.id, path: abs, addedAt: new Date().toISOString() };
    data.prototypes.push(entry);
    await this.write(data);
    return { ...entry, manifest, error: null };
  }

  async remove(id: string): Promise<RegistryEntry> {
    const data = await this.read();
    const idx = data.prototypes.findIndex((e) => e.id === id);
    const entry = data.prototypes[idx];
    if (idx < 0 || !entry) throw new AppError('NOT_FOUND', t('notRegistered', { id }));
    data.prototypes.splice(idx, 1);
    await this.write(data);
    return entry;
  }
}
