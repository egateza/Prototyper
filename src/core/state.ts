import path from 'node:path';
import { readJsonFile, writeJsonAtomic } from './fsutil.js';

export interface ProcessRecord {
  pid: number;
  startedAt: string;
}

export interface StaleProcess extends ProcessRecord {
  id: string;
}

interface StateFile {
  version: 1;
  /** Port terakhir tiap prototype (sticky), agar URL stabil. */
  ports: Record<string, number>;
  /** Proses command yang sedang berjalan, untuk deteksi sisa setelah daemon crash. */
  processes: Record<string, ProcessRecord>;
  /** id prototype yang dibuka ke LAN (bind 0.0.0.0) walau mode LAN daemon mati. */
  lan: string[];
}

/** State milik daemon (state.json). Disimpan di memori, ditulis atomik berurutan. */
export class StateStore {
  readonly file: string;
  private data: StateFile = { version: 1, ports: {}, processes: {}, lan: [] };
  private saving: Promise<void> = Promise.resolve();

  constructor(home: string) {
    this.file = path.join(home, 'state.json');
  }

  async load(): Promise<void> {
    const d = await readJsonFile<Partial<StateFile>>(this.file).catch(() => undefined);
    this.data = {
      version: 1,
      ports: d?.ports ?? {},
      processes: d?.processes ?? {},
      lan: Array.isArray(d?.lan) ? d.lan.filter((x): x is string => typeof x === 'string') : [],
    };
  }

  getPort(id: string): number | undefined {
    return this.data.ports[id];
  }

  setPort(id: string, port: number): Promise<void> {
    if (this.data.ports[id] === port) return this.saving;
    this.data.ports[id] = port;
    return this.save();
  }

  isLanExposed(id: string): boolean {
    return this.data.lan.includes(id);
  }

  setLanExposed(id: string, on: boolean): Promise<void> {
    if (this.isLanExposed(id) === on) return this.saving;
    this.data.lan = on ? [...this.data.lan, id] : this.data.lan.filter((x) => x !== id);
    return this.save();
  }

  setProcess(id: string, rec: ProcessRecord | undefined): Promise<void> {
    if (rec) this.data.processes[id] = rec;
    else delete this.data.processes[id];
    return this.save();
  }

  /** Ambil dan kosongkan catatan proses dari sesi daemon sebelumnya. */
  takeStaleProcesses(): StaleProcess[] {
    const list = Object.entries(this.data.processes).map(([id, rec]) => ({ id, ...rec }));
    if (list.length) {
      this.data.processes = {};
      void this.save();
    }
    return list;
  }

  forget(id: string): Promise<void> {
    delete this.data.ports[id];
    delete this.data.processes[id];
    this.data.lan = this.data.lan.filter((x) => x !== id);
    return this.save();
  }

  flush(): Promise<void> {
    return this.saving;
  }

  private save(): Promise<void> {
    this.saving = this.saving.then(() => writeJsonAtomic(this.file, this.data)).catch(() => undefined);
    return this.saving;
  }
}
