import path from 'node:path';
import { AppError, errorMessage } from './errors.js';
import { isDirectory, readJsonFile, samePath, writeJsonAtomic } from './fsutil.js';
import { loadManifest, type Manifest } from './manifest.js';

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

  constructor(home: string) {
    this.file = path.join(home, 'registry.json');
  }

  private async read(): Promise<RegistryFile> {
    let data: RegistryFile | undefined;
    try {
      data = await readJsonFile<RegistryFile>(this.file);
    } catch (err) {
      throw new AppError('INTERNAL', `Registry rusak (${this.file}): ${errorMessage(err)}`);
    }
    if (!data) return { version: 1, prototypes: [] };
    if (!Array.isArray(data.prototypes)) throw new AppError('INTERNAL', `Registry rusak (${this.file})`);
    return data;
  }

  private write(data: RegistryFile): Promise<void> {
    return writeJsonAtomic(this.file, data);
  }

  private async resolveEntry(e: RegistryEntry): Promise<ResolvedPrototype> {
    if (!(await isDirectory(e.path))) return { ...e, manifest: null, error: `Folder tidak ditemukan: ${e.path}` };
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
        r.error = `id "${newId}" di manifest sudah dipakai prototype lain`;
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
    if (!p) throw new AppError('NOT_FOUND', `Prototype "${id}" tidak terdaftar. Lihat daftar: prototyper list`);
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
    if (other) throw new AppError('CONFLICT', `id "${id}" sudah dipakai oleh ${other.path}`);
  }

  private checkConflicts(data: RegistryFile, abs: string, id: string): void {
    const samePathEntry = data.prototypes.find((e) => samePath(e.path, abs));
    if (samePathEntry) throw new AppError('CONFLICT', `Folder ini sudah terdaftar sebagai "${samePathEntry.id}"`);
    const sameId = data.prototypes.find((e) => e.id === id);
    if (sameId) throw new AppError('CONFLICT', `id "${id}" sudah dipakai oleh ${sameId.path}`);
  }

  async add(dir: string): Promise<ResolvedPrototype> {
    const abs = path.resolve(dir);
    if (!(await isDirectory(abs))) throw new AppError('BAD_REQUEST', `Folder tidak ditemukan: ${abs}`);
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
    if (idx < 0 || !entry) throw new AppError('NOT_FOUND', `Prototype "${id}" tidak terdaftar`);
    data.prototypes.splice(idx, 1);
    await this.write(data);
    return entry;
  }
}
