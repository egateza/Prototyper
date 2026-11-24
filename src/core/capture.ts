import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AppError, errorMessage } from './errors.js';
import { killTree } from './runtime.js';
import { defineMessages } from './i18n.js';

const tr = defineMessages({
  id: {
    stateMustBeObject: 'state.{label} harus objek',
    stateAttrNotAllowed: 'state.{label}: atribut "{attr}" tidak diizinkan',
    stateTooLarge: 'state terlalu besar',
    stateMustBeJson: 'state harus JSON',
    stateRootMustBeObject: 'state harus objek',
    stateStringsOnly: 'state.{label} hanya berisi string',
    stateStorageTooLarge: 'state.storage/session terlalu besar',
    mustBeNumber: '{label} harus berupa angka',
    badFormat: 'format harus png, jpg, atau pdf',
    pathMustStartWithSlash: 'path halaman harus diawali "/", mis. /kasir',
    pathMustBeInPrototype: 'path halaman harus berada di prototype ini',
    badPaper: 'paper harus screen atau a4',
    badScheme: 'scheme harus light atau dark',
    browserDisconnected: 'Koneksi ke browser terputus',
    browserNotResponding: 'Browser tidak merespons',
    browserConnectFailed: 'Gagal terhubung ke browser',
    browserNotReady: 'Browser tidak siap dalam waktu yang ditentukan',
    browserExited: 'Browser berhenti (exit {code}){tail}',
    noBrowser:
      'Ekspor butuh Microsoft Edge, Google Chrome, atau Chromium di komputer ini. Pasang salah satunya, atau isi env PROTOTYPER_BROWSER dengan path browser.',
    browserLaunchFailed: 'Gagal menjalankan browser untuk ekspor ({bin}): {message}',
    exportTimeout: 'Ekspor melebihi batas waktu. Coba lagi, atau periksa apakah halaman terus memuat.',
    exportFailed: 'Ekspor gagal: {message}',
    pageOpenFailed: 'Halaman tidak bisa dibuka ({error}). Pastikan prototype berjalan.',
  },
  en: {
    stateMustBeObject: 'state.{label} must be an object',
    stateAttrNotAllowed: 'state.{label}: attribute "{attr}" is not allowed',
    stateTooLarge: 'state is too large',
    stateMustBeJson: 'state must be JSON',
    stateRootMustBeObject: 'state must be an object',
    stateStringsOnly: 'state.{label} may only contain strings',
    stateStorageTooLarge: 'state.storage/session is too large',
    mustBeNumber: '{label} must be a number',
    badFormat: 'format must be png, jpg, or pdf',
    pathMustStartWithSlash: 'page path must start with "/", e.g. /checkout',
    pathMustBeInPrototype: 'page path must be inside this prototype',
    badPaper: 'paper must be screen or a4',
    badScheme: 'scheme must be light or dark',
    browserDisconnected: 'Connection to the browser was lost',
    browserNotResponding: 'The browser is not responding',
    browserConnectFailed: 'Could not connect to the browser',
    browserNotReady: 'The browser was not ready in time',
    browserExited: 'The browser stopped (exit {code}){tail}',
    noBrowser:
      'Export needs Microsoft Edge, Google Chrome, or Chromium on this computer. Install one of them, or set the PROTOTYPER_BROWSER env variable to the browser path.',
    browserLaunchFailed: 'Could not start the browser for export ({bin}): {message}',
    exportTimeout: 'Export took too long. Try again, or check whether the page keeps loading.',
    exportFailed: 'Export failed: {message}',
    pageOpenFailed: 'The page could not be opened ({error}). Make sure the prototype is running.',
  },
});

/**
 * Ekspor halaman prototype ke PDF / PNG / JPG. Halaman dirender ulang oleh browser Chromium
 * headless (Edge bawaan Windows, Chrome, atau Chromium) lewat Chrome DevTools Protocol, sehingga
 * hasilnya sama dengan yang tampil di browser: PDF tetap vektor (teks bisa dipilih) dan PNG bisa
 * satu halaman penuh, bukan hanya area yang terlihat. Tanpa dependensi tambahan: WebSocket bawaan Node.
 */

export type ExportFormat = 'png' | 'jpeg' | 'pdf';
/** `screen` = satu halaman panjang selebar layar (seperti yang tampil); `a4` = tata letak cetak A4. */
export type PdfPaper = 'screen' | 'a4';

/** Atribut elemen akar yang disalin dari pratinjau (class, style, data-*). */
export type RootAttrs = Record<string, string>;

/**
 * Keadaan halaman di pratinjau yang ikut diterapkan saat ekspor, karena halaman dimuat ulang dari
 * awal di browser lain: tema lewat `<html data-theme>`/class, serta localStorage & sessionStorage kecil
 * (preferensi, status login).
 */
export interface PageState {
  html?: RootAttrs;
  body?: RootAttrs;
  storage?: Record<string, string>;
  /** sessionStorage (mis. status login prototype). */
  session?: Record<string, string>;
}

export interface CaptureRequest {
  url: string;
  format: ExportFormat;
  /** Ukuran jendela (px CSS). */
  width: number;
  height: number;
  /** Seluruh halaman (gulir) atau hanya area jendela. */
  fullPage: boolean;
  /** Kerapatan piksel gambar (1–3). */
  scale: number;
  /** Emulasi perangkat sentuh (tablet/mobile): meta viewport & media query pointer ikut aktif. */
  mobile: boolean;
  paper: PdfPaper;
  /** Jeda setelah halaman dimuat (ms), untuk animasi/render client-side. */
  wait: number;
  /** `prefers-color-scheme` yang dipakai pratinjau; null = bawaan browser. */
  colorScheme: 'light' | 'dark' | null;
  state: PageState | null;
}

export interface CaptureResult {
  data: Buffer;
  /** Tinggi halaman terlalu besar sehingga dipotong. */
  truncated: boolean;
}

export type Capturer = (req: CaptureRequest) => Promise<CaptureResult>;

export const EXPORT_MIME: Record<ExportFormat, string> = { png: 'image/png', jpeg: 'image/jpeg', pdf: 'application/pdf' };
export const EXPORT_EXT: Record<ExportFormat, string> = { png: 'png', jpeg: 'jpg', pdf: 'pdf' };

/** Batas tinggi gambar (px perangkat): di atas ini Chromium gagal / menghasilkan gambar kosong. */
const MAX_IMAGE_PX = 16_384;
/** Batas tinggi satu halaman PDF: 200 inci. */
const MAX_PDF_CSS = 200 * 96;

// ---------- Cari browser ----------

/** Lokasi browser Chromium yang umum per OS, urut prioritas. */
export function browserCandidates(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string[] {
  if (platform === 'win32') {
    const roots = [env['PROGRAMFILES(X86)'] ?? env['ProgramFiles(x86)'], env.PROGRAMFILES ?? env.ProgramFiles, env.LOCALAPPDATA].filter(
      (r): r is string => !!r,
    );
    const rel = [
      ['Microsoft', 'Edge', 'Application', 'msedge.exe'],
      ['Google', 'Chrome', 'Application', 'chrome.exe'],
      ['Chromium', 'Application', 'chrome.exe'],
      ['BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'],
    ];
    return rel.flatMap((r) => roots.map((root) => path.win32.join(root, ...r)));
  }
  if (platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    ];
  }
  const names = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'microsoft-edge-stable', 'brave-browser'];
  const dirs = (env.PATH ?? '').split(path.delimiter).filter(Boolean);
  return names.flatMap((n) => dirs.map((d) => path.posix.join(d, n)));
}

/** Browser untuk ekspor: `PROTOTYPER_BROWSER` bila diisi, selain itu kandidat pertama yang ada. */
export function findBrowser(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  exists: (p: string) => boolean = existsSync,
): string | null {
  const forced = env.PROTOTYPER_BROWSER?.trim();
  if (forced) return forced;
  return browserCandidates(platform, env).find((p) => exists(p)) ?? null;
}

// ---------- Validasi permintaan ----------

export interface ExportQuery {
  format?: string;
  path?: string;
  width?: string;
  height?: string;
  full?: string;
  scale?: string;
  mobile?: string;
  paper?: string;
  wait?: string;
  scheme?: string;
  /** JSON PageState. */
  state?: string;
}

const ATTR_NAME = /^(class|style|data-[a-z0-9_.:-]+)$/i;
const MAX_STATE_JSON = 12_000;
const MAX_STORAGE = 8_000;

function attrs(v: unknown, label: string): RootAttrs | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'object' || Array.isArray(v)) throw new AppError('BAD_REQUEST', tr('stateMustBeObject', { label }));
  const out: RootAttrs = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (!ATTR_NAME.test(k) || typeof x !== 'string' || x.length > 2000) throw new AppError('BAD_REQUEST', tr('stateAttrNotAllowed', { label, attr: k }));
    out[k] = x;
  }
  return out;
}

/** Validasi PageState dari query (JSON). Hanya class/style/data-* dan localStorage string berukuran kecil. */
export function parsePageState(raw: string | undefined): PageState | null {
  if (raw === undefined || raw === '') return null;
  if (raw.length > MAX_STATE_JSON) throw new AppError('BAD_REQUEST', tr('stateTooLarge'));
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    throw new AppError('BAD_REQUEST', tr('stateMustBeJson'));
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new AppError('BAD_REQUEST', tr('stateRootMustBeObject'));
  const o = v as Record<string, unknown>;
  const state: PageState = {};
  const html = attrs(o.html, 'html');
  const body = attrs(o.body, 'body');
  if (html) state.html = html;
  if (body) state.body = body;
  let size = 0;
  for (const key of ['storage', 'session'] as const) {
    const v = o[key];
    if (v === undefined || v === null) continue;
    if (typeof v !== 'object' || Array.isArray(v)) throw new AppError('BAD_REQUEST', tr('stateMustBeObject', { label: key }));
    const st: Record<string, string> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (typeof x !== 'string') throw new AppError('BAD_REQUEST', tr('stateStringsOnly', { label: key }));
      size += k.length + x.length;
      st[k] = x;
    }
    state[key] = st;
  }
  if (size > MAX_STORAGE) throw new AppError('BAD_REQUEST', tr('stateStorageTooLarge'));
  return state;
}

function num(v: string | undefined, def: number, min: number, max: number, label: string): number {
  if (v === undefined || v === '') return def;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new AppError('BAD_REQUEST', tr('mustBeNumber', { label }));
  return Math.max(min, Math.min(max, Math.round(n)));
}

const bool = (v: string | undefined, def: boolean) => (v === undefined || v === '' ? def : v === '1' || v === 'true');

/**
 * Ubah query string menjadi permintaan capture. `base` = alamat prototype; path halaman harus tetap
 * di origin itu (mencegah daemon dipakai mengambil URL lain).
 */
export function parseExportQuery(base: string, q: ExportQuery): CaptureRequest & { page: string } {
  const raw = (q.format ?? 'png').toLowerCase();
  const format = (raw === 'jpg' ? 'jpeg' : raw) as ExportFormat;
  if (!(format in EXPORT_MIME)) throw new AppError('BAD_REQUEST', tr('badFormat'));
  const page = (q.path ?? '/').trim() || '/';
  if (!page.startsWith('/') || page.startsWith('//') || page.startsWith('/\\')) {
    throw new AppError('BAD_REQUEST', tr('pathMustStartWithSlash'));
  }
  const origin = new URL(base).origin;
  const url = new URL(page, origin);
  if (url.origin !== origin) throw new AppError('BAD_REQUEST', tr('pathMustBeInPrototype'));
  const paper = (q.paper ?? 'screen') as PdfPaper;
  if (paper !== 'screen' && paper !== 'a4') throw new AppError('BAD_REQUEST', tr('badPaper'));
  const scheme = q.scheme || null;
  if (scheme !== null && scheme !== 'light' && scheme !== 'dark') throw new AppError('BAD_REQUEST', tr('badScheme'));
  return {
    page,
    url: url.href,
    format,
    width: num(q.width, 1280, 240, 3840, 'width'),
    height: num(q.height, 800, 240, 4000, 'height'),
    fullPage: bool(q.full, true),
    scale: num(q.scale, format === 'pdf' ? 1 : 2, 1, 3, 'scale'),
    mobile: bool(q.mobile, false),
    paper,
    wait: num(q.wait, 500, 0, 10_000, 'wait'),
    colorScheme: scheme,
    state: parsePageState(q.state),
  };
}

/** Nama file unduhan, mis. `kasir-grosir_kasir-bayar_390px.png`. */
export function exportFileName(id: string, page: string, width: number, format: ExportFormat): string {
  const slug =
    page
      .replace(/^\/+/, '')
      .replace(/\.html?$/i, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 60) || 'index';
  const safeId = id.replace(/[^a-zA-Z0-9._-]+/g, '-');
  return `${safeId}_${slug}_${width}px.${EXPORT_EXT[format]}`;
}

// ---------- Chrome DevTools Protocol (minimal) ----------

type Json = Record<string, unknown>;
interface Pending {
  resolve: (v: Json) => void;
  reject: (e: Error) => void;
}

class Cdp {
  private seq = 0;
  private readonly pending = new Map<number, Pending>();
  private readonly listeners = new Set<(method: string, params: Json, sessionId?: string) => void>();
  private closed: Error | null = null;

  private constructor(private readonly ws: WebSocket) {
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(String(ev.data)) as { id?: number; result?: Json; error?: { message: string }; method?: string; params?: Json; sessionId?: string };
      if (msg.id !== undefined) {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message));
        else p.resolve(msg.result ?? {});
      } else if (msg.method) {
        for (const l of this.listeners) l(msg.method, msg.params ?? {}, msg.sessionId);
      }
    });
    ws.addEventListener('close', () => {
      this.closed = new Error(tr('browserDisconnected'));
      for (const p of this.pending.values()) p.reject(this.closed);
      this.pending.clear();
    });
  }

  static connect(url: string, timeoutMs: number): Promise<Cdp> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const t = setTimeout(() => {
        ws.close();
        reject(new Error(tr('browserNotResponding')));
      }, timeoutMs);
      ws.addEventListener('open', () => {
        clearTimeout(t);
        resolve(new Cdp(ws));
      });
      ws.addEventListener('error', () => {
        clearTimeout(t);
        reject(new Error(tr('browserConnectFailed')));
      });
    });
  }

  send(method: string, params: Json = {}, sessionId?: string): Promise<Json> {
    if (this.closed) return Promise.reject(this.closed);
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  /** Tunggu event tertentu; resolve false bila waktu habis. */
  waitFor(method: string, sessionId: string, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const l = (m: string, _p: Json, s?: string) => {
        if (m === method && s === sessionId) done(true);
      };
      const t = setTimeout(() => done(false), timeoutMs);
      const done = (v: boolean) => {
        clearTimeout(t);
        this.listeners.delete(l);
        resolve(v);
      };
      this.listeners.add(l);
    });
  }

  close(): void {
    try {
      this.ws.close();
    } catch {
      /* sudah tertutup */
    }
  }
}

/** Jalankan browser headless dan ambil alamat WebSocket DevTools dari stderr-nya. */
function launch(bin: string, userDataDir: string, timeoutMs: number): Promise<{ child: ChildProcess; exited: Promise<void>; ws: string }> {
  const args = [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-sync',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-features=Translate,MediaRouter,OptimizationHints',
    '--disable-gpu',
    '--hide-scrollbars',
    '--mute-audio',
    '--force-color-profile=srgb',
    ...(process.platform === 'linux' && process.getuid?.() === 0 ? ['--no-sandbox'] : []),
    'about:blank',
  ];
  return new Promise((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true, detached: process.platform !== 'win32' });
    } catch (err) {
      reject(new Error(errorMessage(err)));
      return;
    }
    const exited = new Promise<void>((r) => child.once('exit', () => r()));
    let buf = '';
    const t = setTimeout(() => {
      void killTree(child, exited);
      reject(new Error(tr('browserNotReady')));
    }, timeoutMs);
    child.once('error', (err) => {
      clearTimeout(t);
      reject(new Error(errorMessage(err)));
    });
    child.once('exit', (code) => {
      clearTimeout(t);
      reject(new Error(tr('browserExited', { code, tail: buf.trim() ? `: ${buf.trim().split('\n').slice(-3).join(' ')}` : '' })));
    });
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (s: string) => {
      buf = (buf + s).slice(-8000);
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf);
      if (m?.[1]) {
        clearTimeout(t);
        child.stderr?.removeAllListeners('data');
        child.stderr?.resume();
        resolve({ child, exited, ws: m[1] });
      }
    });
  });
}

/** Skrip yang dijalankan di halaman sebelum diambil: gambar lazy dimuat, font & gambar ditunggu. */
const SETTLE = (wait: number) => `(async () => {
  for (const img of document.querySelectorAll('img[loading="lazy"]')) img.loading = 'eager';
  const imgs = [...document.images].filter((i) => !i.complete);
  await Promise.race([
    Promise.all([document.fonts ? document.fonts.ready : null, ...imgs.map((i) => new Promise((r) => { i.onload = i.onerror = r; }))]),
    new Promise((r) => setTimeout(r, 5000)),
  ]);
  await new Promise((r) => setTimeout(r, ${wait}));
  const el = document.scrollingElement || document.documentElement;
  return Math.max(el.scrollHeight, document.body ? document.body.scrollHeight : 0);
})()`;

/**
 * Skrip yang dijalankan di setiap dokumen sebelum skrip halaman (Page.addScriptToEvaluateOnNewDocument):
 * isi localStorage/sessionStorage dan pasang atribut <html>/<body> dari pratinjau, hanya pada origin prototype.
 */
export function stateScript(origin: string, state: PageState): string {
  return `(() => {
  if (location.origin !== ${JSON.stringify(origin)}) return;
  const s = ${JSON.stringify(state)};
  window.__prototyperState = s;
  try { for (const [k, v] of Object.entries(s.storage || {})) localStorage.setItem(k, v); } catch {}
  try { for (const [k, v] of Object.entries(s.session || {})) sessionStorage.setItem(k, v); } catch {}
  const put = (el, a) => { if (el && a) for (const [k, v] of Object.entries(a)) el.setAttribute(k, v); };
  const done = { html: !s.html, body: !s.body };
  const apply = () => {
    if (!done.html && document.documentElement) { put(document.documentElement, s.html); done.html = true; }
    if (!done.body && document.body) { put(document.body, s.body); done.body = true; }
    return done.html && done.body;
  };
  if (apply()) return;
  const mo = new MutationObserver(() => { if (apply()) mo.disconnect(); });
  mo.observe(document, { childList: true, subtree: true });
})()`;
}

/** Setelah halaman dimuat: pasang lagi atribut akar bila skrip halaman menimpanya (sama dengan yang tampil). */
const REAPPLY = `(() => {
  const s = window.__prototyperState;
  if (!s) return;
  const put = (el, a) => { if (el && a) for (const [k, v] of Object.entries(a)) if (el.getAttribute(k) !== v) el.setAttribute(k, v); };
  put(document.documentElement, s.html);
  put(document.body, s.body);
})()`;

export interface CapturerOptions {
  /** Path browser; default `findBrowser()`. */
  browser?: string | null;
  /** Batas waktu satu ekspor (ms). */
  timeoutMs?: number;
}

/**
 * Capturer berbasis Chromium headless. Satu browser per ekspor (dimatikan setelahnya) dan satu ekspor
 * dalam satu waktu, agar daemon tidak menumpuk proses browser.
 */
export function createCapturer(opts: CapturerOptions = {}): Capturer {
  let queue: Promise<unknown> = Promise.resolve();
  return (req) => {
    const run = queue.then(() => captureOnce(req, opts));
    queue = run.catch(() => undefined);
    return run;
  };
}

async function captureOnce(req: CaptureRequest, opts: CapturerOptions): Promise<CaptureResult> {
  const bin = opts.browser === undefined ? findBrowser() : opts.browser;
  if (!bin) {
    throw new AppError('NOT_IMPLEMENTED', tr('noBrowser'));
  }
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const deadline = Date.now() + timeoutMs;
  const left = () => Math.max(1000, deadline - Date.now());
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prototyper-export-'));
  let proc: Awaited<ReturnType<typeof launch>> | null = null;
  let cdp: Cdp | null = null;
  try {
    try {
      proc = await launch(bin, userDataDir, Math.min(20_000, left()));
      cdp = await Cdp.connect(proc.ws, Math.min(10_000, left()));
    } catch (err) {
      throw new AppError('INTERNAL', tr('browserLaunchFailed', { bin, message: errorMessage(err) }));
    }
    return await withTimeout(render(cdp, req, left), left(), tr('exportTimeout'));
  } finally {
    cdp?.close();
    if (proc) await killTree(proc.child, proc.exited);
    await fs.rm(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => undefined);
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new AppError('INTERNAL', message)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof AppError ? e : new AppError('INTERNAL', tr('exportFailed', { message: errorMessage(e) })));
      },
    );
  });
}

async function render(cdp: Cdp, req: CaptureRequest, left: () => number): Promise<CaptureResult> {
  const { targetId } = (await cdp.send('Target.createTarget', { url: 'about:blank' })) as { targetId: string };
  const { sessionId } = (await cdp.send('Target.attachToTarget', { targetId, flatten: true })) as { sessionId: string };
  const s = (method: string, params: Json = {}) => cdp.send(method, params, sessionId);
  await s('Page.enable');
  await s('Emulation.setDeviceMetricsOverride', {
    width: req.width,
    height: req.height,
    deviceScaleFactor: req.format === 'pdf' ? 1 : req.scale,
    mobile: req.mobile,
  });
  if (req.mobile) await s('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const media = req.format === 'pdf' && req.paper === 'screen' ? 'screen' : '';
  if (media || req.colorScheme) {
    await s('Emulation.setEmulatedMedia', {
      media,
      features: req.colorScheme ? [{ name: 'prefers-color-scheme', value: req.colorScheme }] : [],
    });
  }
  if (req.state) {
    await s('Page.addScriptToEvaluateOnNewDocument', { source: stateScript(new URL(req.url).origin, req.state) });
  }

  const loaded = cdp.waitFor('Page.loadEventFired', sessionId, Math.min(30_000, left()));
  const nav = (await s('Page.navigate', { url: req.url })) as { errorText?: string };
  if (nav.errorText) throw new AppError('BAD_REQUEST', tr('pageOpenFailed', { error: nav.errorText }));
  await loaded; // waktu habis pun tetap lanjut: ambil apa yang sudah tampil
  if (req.state) await s('Runtime.evaluate', { expression: REAPPLY });
  const ev = (await s('Runtime.evaluate', { expression: SETTLE(req.wait), awaitPromise: true, returnByValue: true })) as {
    result?: { value?: unknown };
  };
  const contentH = typeof ev.result?.value === 'number' ? Math.ceil(ev.result.value) : req.height;

  if (req.format === 'pdf') {
    if (req.paper === 'a4') {
      const r = (await s('Page.printToPDF', {
        printBackground: true,
        preferCSSPageSize: true,
        paperWidth: 8.27,
        paperHeight: 11.69,
        marginTop: 0.4,
        marginBottom: 0.4,
        marginLeft: 0.4,
        marginRight: 0.4,
      })) as { data: string };
      return { data: Buffer.from(r.data, 'base64'), truncated: false };
    }
    const want = req.fullPage ? Math.max(req.height, contentH) : req.height;
    const h = Math.min(want, MAX_PDF_CSS);
    const r = (await s('Page.printToPDF', {
      printBackground: true,
      paperWidth: req.width / 96,
      paperHeight: (h + 1) / 96,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
      pageRanges: '1',
    })) as { data: string };
    return { data: Buffer.from(r.data, 'base64'), truncated: want > h };
  }

  const maxCss = Math.floor(MAX_IMAGE_PX / req.scale);
  const want = req.fullPage ? Math.max(req.height, contentH) : req.height;
  const h = Math.min(want, maxCss);
  const r = (await s('Page.captureScreenshot', {
    format: req.format,
    ...(req.format === 'jpeg' ? { quality: 90 } : {}),
    captureBeyondViewport: req.fullPage,
    clip: { x: 0, y: 0, width: req.width, height: h, scale: 1 },
  })) as { data: string };
  return { data: Buffer.from(r.data, 'base64'), truncated: want > h };
}
