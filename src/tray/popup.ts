import { isLive, lanCopyText, lanNote, type TrayState, type UpdateState } from './menu.js';
import type { RunStatus } from '../core/runtime.js';
import type { PrototypeView } from '../core/views.js';
import { formatPercent, langName, statusLabel, t } from './messages.js';
import { LANG_SETTINGS } from '../core/i18n.js';

/**
 * Popup klik kiri tray: varian "B Ringkas" dari prototype prototyper-runtime (gelap, padat, lebar 284px).
 * Tata letak dihitung di sini sebagai daftar bentuk berkoordinat (px pada 96 DPI); host PowerShell
 * hanya menggambar, menskalakan ke DPI layar, dan melaporkan klik pada area `hit`.
 */

export interface Run {
  text: string;
  /** Ukuran huruf dalam px (96 DPI). */
  size: number;
  color: string;
  bold?: boolean;
  /** Pakai Segoe UI Symbol (⏸ ↗ ⟳ 🌐 …). */
  symbol?: boolean;
}

export type PopupItem =
  | { k: 'rect'; x: number; y: number; w: number; h: number; fill?: string; fill2?: string; stroke?: string; r?: number }
  | { k: 'circle'; x: number; y: number; d: number; fill: string; ring?: string; ringW?: number }
  | { k: 'text'; x: number; y: number; w: number; h: number; runs: Run[]; align?: 'left' | 'center' | 'right' }
  | { k: 'icon'; x: number; y: number; size: number }
  | { k: 'toggle'; x: number; y: number; w: number; h: number; on: boolean }
  | { k: 'spinner'; x: number; y: number; d: number; color: string }
  | { k: 'progress'; x: number; y: number; w: number; h: number; value: number; track: string; fill: string }
  /** Area klik. Tanpa `id`: hanya efek hover. `close`: popup ditutup setelah diklik (tanpa id = tombol tutup). */
  | { k: 'hit'; x: number; y: number; w: number; h: number; id?: string; hover?: string; r?: number; close?: boolean };

export interface Popup {
  w: number;
  h: number;
  /** Warna latar jendela, radius sudut, dan warna garis tepi (DWM Windows 11). */
  bg: string;
  r: number;
  border: string;
  items: PopupItem[];
  /** Tinggi bagian atas yang tetap di tempat saat host menganimasikan perubahan tinggi (header popup). */
  head?: number;
}

/** Warna varian B (style.css prototype). */
export const C = {
  bg: '#1c1d23',
  line: '#34363f',
  text: '#e5e7eb',
  muted: '#9ca3af',
  hover: '#2c2e37',
  ok: '#16a34a',
  okRing: '#14532d',
  warn: '#d97706',
  err: '#dc2626',
  idle: '#9ca3af',
  accent: '#6d4aff',
  accentHover: '#8f74ff',
  accentEnd: '#4f46e5',
  btnHover: '#312a5c',
};

export const POPUP_W = 284;
/** Baris prototype yang tampil awalnya; "Tampilkan lagi" menambah sebanyak ini. */
export const LIST_PAGE = 5;
/** Tinggi satu baris prototype (nama + label jenis/status). */
export const ROW_H = 38;

/** Label jenis di bawah nama: desain sistem (dibuat dengan template design-system) atau prototype biasa. */
export function kindLabel(p: PrototypeView): { text: string; color: string } {
  return p.manifest?.designSystem?.source ? { text: t('kindDesignSystem'), color: '#c4b5fd' } : { text: t('kindPrototype'), color: '#7dd3fc' };
}

const STATUS_DOT: Record<RunStatus, string> = {
  stopped: C.idle,
  starting: C.warn,
  running: C.ok,
  stopping: C.warn,
  crashed: C.err,
  failed: C.err,
};

/**
 * Teks berawalan simbol ("▶ Jalankan semua"): simbolnya digambar dengan Segoe UI Symbol, karena GDI+
 * tidak punya font fallback (▶ jadi kecil, ⏸ jadi emoji berkotak).
 */
export function glyphRuns(text: string, size: number, color: string, bold = false): Run[] {
  const m = /^(\S+) (.*)$/u.exec(text);
  if (!m || !/^[^\p{L}\p{N}]+$/u.test(m[1]!)) return [{ text, size, color, bold }];
  return [{ text: m[1]!, size, color, bold, symbol: true }, { text: ` ${m[2]!}`, size, color, bold }];
}

/** Perkiraan lebar tombol kecil (12px Segoe UI, padding 10px). */
export const buttonWidth = (text: string) => Math.round(text.length * 6.8 + 20);

export function popupSummary(s: TrayState): string {
  if (s.daemonBusy === 'starting') return t('daemonStarting');
  if (s.daemonBusy === 'stopping') return t('daemonStopping');
  if (!s.daemonUp) return t('daemonPaused');
  const running = s.prototypes.filter((p) => p.status === 'running').length;
  return t('popupActive', { running, total: s.prototypes.length });
}

interface UpdateView {
  icon: string | null; // null = spinner
  iconBg: string;
  iconFg: string;
  title: string;
  button: string;
  busy: boolean;
  primary: boolean;
}

export function updateView(u: UpdateState): UpdateView {
  const base = { iconBg: C.btnHover, iconFg: '#c4b5fd', busy: false, primary: false };
  switch (u.status) {
    case 'checking':
      return { ...base, icon: null, title: t('updCheckingTitle'), button: t('updCheckingButton'), busy: true };
    case 'uptodate':
      return { ...base, icon: '✓', iconBg: '#14532d', iconFg: '#86efac', title: t('updUpToDate'), button: t('updCheckButton') };
    case 'available':
      return {
        ...base, icon: '⬇', iconBg: '#451a03', iconFg: '#fbbf24', title: t('updAvailableTitle', { version: u.latest }),
        button: t(u.selfUpdate ? 'updDownloadButton' : 'updViewButton'), primary: true,
      };
    case 'downloading':
      return {
        ...base, icon: '⬇', iconBg: '#451a03', iconFg: '#fbbf24', title: t('updDownloadingTitle', { version: u.latest }),
        button: t('updDownloadingButton'), busy: true,
      };
    case 'ready':
      return {
        ...base, icon: '★', iconBg: C.accent, iconFg: '#ffffff', title: t('updReadyTitle', { version: u.latest }),
        button: t(u.restart ? 'updRestartButton' : 'updInstallButton'), primary: true,
      };
    case 'error':
      return { ...base, icon: '!', iconBg: '#450a0a', iconFg: '#fca5a5', title: t('updCheckFailed'), button: t('updRetryButton') };
    default:
      return { ...base, icon: '⟳', title: t('updCheckTitle'), button: t('updCheckButton') };
  }
}

export function popupLayout(s: TrayState): Popup {
  const W = POPUP_W;
  const items: PopupItem[] = [];
  const bg: Extract<PopupItem, { k: 'rect' }> = { k: 'rect', x: 0, y: 0, w: W, h: 0, fill: C.bg };
  items.push(bg);
  const busy = s.daemonBusy !== null;
  const canAct = s.daemonUp && !busy;
  let y = 0;

  // ── Header: logo, judul, ringkasan + tombol jeda/lanjutkan & tutup popup
  const cbx = W - 12 - 30;
  const pbx = cbx - 6 - 30;
  items.push({ k: 'icon', x: 12, y: 13, size: 24 });
  // judul + versi yang sedang berjalan (lebar ±152px sampai tombol jeda: "Prototyper Runtime" + versi tidak muat)
  items.push({
    k: 'text', x: 46, y: 8, w: pbx - 8 - 46, h: 18,
    runs: [{ text: 'Prototyper', size: 13, color: C.text, bold: true }, { text: `  v${s.update.current}`, size: 11, color: C.muted }],
  });
  const dot = busy || !s.daemonUp ? C.warn : C.ok;
  items.push({ k: 'circle', x: 46, y: 30, d: 8, fill: dot, ...(dot === C.ok ? { ring: C.okRing, ringW: 3 } : {}) });
  items.push({ k: 'text', x: 59, y: 26, w: pbx - 8 - 59, h: 16, runs: [{ text: popupSummary(s), size: 11, color: C.muted }] });
  // tutup: ditangani host sendiri (tanpa id), popup juga tertutup saat kehilangan fokus (klik di luar)
  items.push({ k: 'hit', x: cbx, y: 10, w: 30, h: 30, r: 6, hover: C.hover, close: true });
  items.push({ k: 'text', x: cbx, y: 10, w: 30, h: 30, align: 'center', runs: [{ text: '✕', size: 13, color: C.muted, symbol: true }] });
  items.push({ k: 'rect', x: pbx, y: 10, w: 30, h: 30, r: 6, stroke: C.line });
  if (!busy) items.push({ k: 'hit', x: pbx, y: 10, w: 30, h: 30, r: 6, id: 'pause', hover: C.btnHover });
  items.push({ k: 'text', x: pbx, y: 10, w: 30, h: 30, align: 'center', runs: [{ text: s.daemonUp ? '⏸' : '▶', size: 13, color: busy ? C.muted : C.text, symbol: true }] });
  y = 50;

  // ── Daftar prototype: satu baris per prototype, toggle di kanan
  const rowX = 6;
  const rowW = W - 12;
  const toggleX = rowX + rowW - 8 - 28;
  const limit = Math.max(LIST_PAGE, s.listLimit);
  const shown = s.prototypes.slice(0, limit);
  for (const p of shown) {
    const live = isLive(p);
    const mid = y + ROW_H / 2;
    items.push({ k: 'hit', x: rowX, y, w: rowW, h: ROW_H, r: 6, hover: C.hover });
    items.push({ k: 'circle', x: 14, y: mid - 4, d: 8, fill: STATUS_DOT[p.status], ...(p.status === 'running' ? { ring: C.okRing, ringW: 3 } : {}) });
    let textEnd = toggleX - 8;
    if (p.status === 'running' && p.url) {
      const ox = toggleX - 8 - 24;
      items.push({ k: 'rect', x: ox, y: mid - 12, w: 24, h: 24, r: 6, stroke: C.line });
      items.push({ k: 'hit', x: ox, y: mid - 12, w: 24, h: 24, r: 6, id: `p:open:${p.id}`, hover: C.btnHover });
      items.push({ k: 'text', x: ox, y: mid - 12, w: 24, h: 24, align: 'center', runs: [{ text: '↗', size: 12, color: C.text, symbol: true }] });
      textEnd = ox - 8;
    }
    const status = p.valid ? `${statusLabel(p.status)}${p.status === 'running' && p.port ? ` · :${p.port}` : ''}` : t('invalidManifest');
    const kind = kindLabel(p);
    items.push({ k: 'text', x: 30, y: y + 3, w: textEnd - 30, h: 18, runs: [{ text: p.name, size: 13, color: C.text }] });
    items.push({
      k: 'text', x: 30, y: y + 20, w: textEnd - 30, h: 15,
      runs: [{ text: kind.text, size: 10, color: kind.color, bold: true }, { text: `  ·  ${status}`, size: 10, color: C.muted }],
    });
    if (p.valid) {
      items.push({ k: 'toggle', x: toggleX, y: mid - 8, w: 28, h: 16, on: live });
      items.push({ k: 'hit', x: toggleX - 4, y: mid - 12, w: 36, h: 24, r: 8, id: `p:${live ? 'stop' : 'start'}:${p.id}` });
    }
    y += ROW_H;
  }
  // "Tampilkan lagi" bila masih ada yang tersembunyi; "Tampilkan lebih sedikit" setelah diperluas
  const hidden = s.prototypes.length - shown.length;
  if (hidden > 0 || shown.length > LIST_PAGE) {
    const n = Math.min(hidden, LIST_PAGE);
    const more = hidden > LIST_PAGE ? t('showMoreHidden', { n, hidden }) : t('showMore', { n });
    if (s.listBusy) {
      // spinner + "Memuat…" di tengah; tanpa area klik agar tidak diklik dua kali
      const cx = rowX + rowW / 2;
      items.push({ k: 'spinner', x: cx - 38, y: y + 8, d: 12, color: '#c4b5fd' });
      items.push({ k: 'text', x: cx - 20, y: y + 2, w: 80, h: 24, runs: [{ text: t('loading'), size: 11, color: C.muted, bold: true }] });
    } else {
      const label = hidden > 0 ? more : t('showLess');
      items.push({ k: 'hit', x: rowX, y: y + 2, w: rowW, h: 24, r: 6, id: hidden > 0 ? 'more' : 'less', hover: C.hover });
      items.push({ k: 'text', x: rowX, y: y + 2, w: rowW, h: 24, align: 'center', runs: [{ text: label, size: 11, color: '#c4b5fd', bold: true }] });
    }
    y += 28;
  }
  if (!s.prototypes.length) {
    const msg = t(s.daemonUp ? 'emptyList' : 'emptyListPaused');
    items.push({ k: 'text', x: 14, y, w: rowW - 16, h: 28, runs: [{ text: msg, size: 12, color: C.muted }] });
    y += 28;
  }
  y += 4;

  // ── Opsi: startup + pembaruan
  items.push({ k: 'rect', x: 0, y, w: W, h: 1, fill: C.line });
  y += 5;
  if (s.startup !== null) {
    items.push({ k: 'hit', x: rowX, y, w: rowW, h: 26, r: 6, id: 'startup', hover: C.hover });
    items.push({ k: 'text', x: 14, y, w: toggleX - 22, h: 26, runs: [{ text: t('runAtStartup'), size: 12, color: C.text, bold: true }] });
    items.push({ k: 'toggle', x: toggleX, y: y + 5, w: 28, h: 16, on: s.startup });
    y += 26;
  }
  // Mode LAN: toggle; saat aktif, baris kedua berisi alamat untuk perangkat lain + tombol Salin
  items.push({ k: 'hit', x: rowX, y, w: rowW, h: 26, r: 6, ...(busy ? {} : { id: 'lan' }), hover: C.hover });
  items.push({
    k: 'text', x: 14, y, w: toggleX - 22, h: 26,
    runs: [{ text: t('lanMode'), size: 12, color: busy ? C.muted : C.text, bold: true }, { text: `  ${t('lanModeHint')}`, size: 11, color: C.muted }],
  });
  items.push({ k: 'toggle', x: toggleX, y: y + 5, w: 28, h: 16, on: s.lanMode !== 'off' });
  y += 26;
  if (s.lanMode !== 'off') {
    // lingkup: Web UI + prototype, atau prototype saja
    const segX = 14;
    const segW = (toggleX + 28 - segX - 4) / 2;
    for (const [i, mode, label] of [[0, 'all', t('lanScopeAll')], [1, 'prototypes', t('lanScopePrototypes')]] as const) {
      const sx = segX + i * (segW + 4);
      const on = s.lanMode === mode;
      items.push({ k: 'rect', x: sx, y: y + 1, w: segW, h: 22, r: 6, ...(on ? { fill: C.accent } : { stroke: C.line }) });
      if (!on && !busy) items.push({ k: 'hit', x: sx, y: y + 1, w: segW, h: 22, r: 6, id: `lan:${mode}`, hover: C.hover });
      items.push({ k: 'text', x: sx, y: y + 1, w: segW, h: 22, align: 'center', runs: [{ text: label, size: 11, color: on ? '#ffffff' : busy ? C.muted : C.text, bold: on }] });
    }
    y += 26;
    const copy = s.daemonUp ? lanCopyText(s) : null;
    const copyLabel = t('copy');
    const bw2 = buttonWidth(copyLabel);
    const sx = toggleX + 28 - bw2;
    const note = lanNote(s);
    items.push({ k: 'text', x: 14, y, w: sx - 8 - 14, h: 20, runs: [{ text: note, size: 11, color: copy ? '#c4b5fd' : C.muted }] });
    if (copy) {
      items.push({ k: 'rect', x: sx, y: y + 1, w: bw2, h: 18, r: 5, stroke: C.line });
      items.push({ k: 'hit', x: sx, y: y + 1, w: bw2, h: 18, r: 5, id: 'lanCopy', hover: C.btnHover });
      items.push({ k: 'text', x: sx, y: y + 1, w: bw2, h: 18, align: 'center', runs: [{ text: copyLabel, size: 11, color: C.text }] });
    }
    y += 24;
  }
  const u = updateView(s.update);
  const downloading = s.update.status === 'downloading';
  const rowH = downloading ? 36 : 32;
  const bw = buttonWidth(u.button);
  const bx = rowX + rowW - 8 - bw;
  const by = y + (rowH - 22) / 2;
  items.push({ k: 'hit', x: rowX, y, w: rowW, h: rowH, r: 6, hover: C.hover });
  items.push({ k: 'rect', x: 14, y: y + (rowH - 22) / 2, w: 22, h: 22, r: 6, fill: u.iconBg });
  if (u.icon === null) items.push({ k: 'spinner', x: 19, y: y + (rowH - 12) / 2, d: 12, color: u.iconFg });
  else items.push({ k: 'text', x: 14, y: y + (rowH - 22) / 2, w: 22, h: 22, align: 'center', runs: [{ text: u.icon, size: 12, color: u.iconFg, bold: true, symbol: true }] });
  items.push({ k: 'text', x: 44, y: downloading ? y + 5 : y, w: bx - 8 - 44, h: downloading ? 18 : rowH, runs: [{ text: u.title, size: 12, color: C.text, bold: true }] });
  if (downloading) items.push({ k: 'progress', x: 44, y: y + 26, w: bx - 8 - 44, h: 4, value: s.update.progress, track: C.line, fill: C.accent });
  items.push({ k: 'rect', x: bx, y: by, w: bw, h: 22, r: 6, ...(u.primary ? { fill: C.accent } : { stroke: C.line }) });
  if (!u.busy) items.push({ k: 'hit', x: bx, y: by, w: bw, h: 22, r: 6, id: 'update', hover: u.primary ? C.accentHover : C.hover });
  items.push({ k: 'text', x: bx, y: by, w: bw, h: 22, align: 'center', runs: [{ text: u.button, size: 12, color: u.busy ? C.muted : u.primary ? '#ffffff' : C.text }] });
  y += rowH + 4;

  // ── Jalankan / hentikan semua
  items.push({ k: 'rect', x: 0, y, w: W, h: 1, fill: C.line });
  y += 1;
  const fw = (W - 24 - 8) / 2;
  for (const [i, id, label] of [[0, 'startAll', t('startAll')], [1, 'stopAll', t('stopAll')]] as const) {
    const fx = 12 + i * (fw + 8);
    items.push({ k: 'rect', x: fx, y: y + 6, w: fw, h: 26, r: 6, stroke: C.line });
    if (canAct) items.push({ k: 'hit', x: fx, y: y + 6, w: fw, h: 26, r: 6, id, hover: C.hover });
    items.push({ k: 'text', x: fx, y: y + 6, w: fw, h: 26, align: 'center', runs: glyphRuns(label, 12, canAct ? C.text : C.muted) });
  }
  y += 38;

  // ── Bar "Buka Prototyper" di paling bawah
  items.push({ k: 'rect', x: 0, y, w: W, h: 38, fill: C.accent, fill2: C.accentEnd });
  items.push({ k: 'hit', x: 0, y, w: W, h: 38, id: 'open', hover: '#ffffff1f' });
  items.push({
    k: 'text', x: 12, y, w: W - 40, h: 38,
    runs: [{ text: '🌐', size: 16, color: '#ffffff', symbol: true }, { text: `  ${t('openPrototyper')}`, size: 14, color: '#ffffff', bold: true }],
  });
  items.push({ k: 'text', x: W - 36, y, w: 24, h: 38, align: 'right', runs: [{ text: '↗', size: 16, color: '#ffffff', symbol: true }] });
  y += 38;

  bg.h = y;
  return { w: W, h: y, bg: C.bg, r: 12, border: '#3a3c46', head: 50, items };
}

/** Warna menu klik kanan prototype (`.ctx-menu`), terang & gelap. */
export const MENU_THEME = {
  light: { bg: '#ffffff', text: '#1c1e23', muted: '#9ca3af', hover: '#ebe6ff', line: '#e3e5ea', accent: '#6d4aff' },
  dark: { bg: '#272a33', text: '#e5e7eb', muted: '#6b7280', hover: '#312a5c', line: '#353945', accent: '#c4b5fd' },
};
export const MENU_W = 240;

type MenuRow =
  | { sep: true }
  | {
      id: string;
      text: string;
      bold?: boolean;
      check?: boolean;
      checked?: boolean;
      disabled?: boolean;
      hl?: boolean;
      /** Menu tetap terbuka setelah diklik (mis. membuka pilihan bahasa). */
      keepOpen?: boolean;
      /** Panah buka/tutup di kanan: `open` = pilihan sedang tampil. */
      expand?: 'open' | 'closed';
      /** Sub-pilihan: digeser ke kanan. */
      indent?: boolean;
    };

/** Teks item pembaruan di menu klik kanan (`#ctxUpdate` di prototype). */
export function menuUpdateRow(u: UpdateState): { text: string; disabled: boolean; hl: boolean } {
  switch (u.status) {
    case 'checking':
      return { text: t('menuUpdChecking'), disabled: true, hl: false };
    case 'available':
      return { text: t(u.selfUpdate ? 'menuUpdDownload' : 'menuUpdView', { version: u.latest }), disabled: false, hl: true };
    case 'downloading':
      return { text: t('menuUpdDownloading', { percent: formatPercent(u.progress) }), disabled: true, hl: false };
    case 'ready':
      return { text: u.restart ? t('menuUpdRestart') : t('menuUpdInstall', { version: u.latest }), disabled: false, hl: true };
    default:
      return { text: t('menuUpdCheck'), disabled: false, hl: false };
  }
}

/** Menu klik kanan: urutan & gaya sama dengan menu konteks prototype. */
export function menuLayout(s: TrayState): Popup {
  const th = MENU_THEME[s.theme];
  const busy = s.daemonBusy !== null;
  const rows: MenuRow[] = [
    { id: 'open', text: t('menuOpen'), bold: true },
    { sep: true },
    { id: 'startAll', text: t('startAll'), disabled: !s.daemonUp || busy },
    { id: 'stopAll', text: t('stopAll'), disabled: !s.daemonUp || busy },
    { id: 'pause', text: t(s.daemonUp ? 'menuPause' : 'menuResume'), disabled: busy },
    { sep: true },
    ...(s.startup === null ? [] : [{ id: 'startup', text: t('runAtStartup'), check: true, checked: s.startup }]),
    { id: 'lan', text: t('lanMode'), check: true, checked: s.lanMode !== 'off', disabled: busy },
    ...(s.lanMode === 'off'
      ? []
      : [
          { id: 'lan:all', text: t('menuLanAll'), check: true, checked: s.lanMode === 'all', disabled: busy },
          { id: 'lan:prototypes', text: t('menuLanPrototypes'), check: true, checked: s.lanMode === 'prototypes', disabled: busy },
        ]),
    ...(s.daemonUp && lanCopyText(s) ? [{ id: 'lanCopy', text: t('menuCopyLan') }] : []),
    { id: 'notif', text: t('menuNotifications'), check: true, checked: s.notifications },
    { id: 'langMenu', text: t('menuLanguage', { name: langName(s.lang.setting) }), keepOpen: true, expand: s.langOpen ? 'open' : 'closed' },
    ...(s.langOpen
      ? LANG_SETTINGS.map((l) => ({ id: `lang:${l}`, text: langName(l), check: true, checked: s.lang.setting === l, disabled: s.lang.fromEnv, indent: true }))
      : []),
    { sep: true },
    { id: 'update', ...menuUpdateRow(s.update) },
    { id: 'whatsnew', text: t('menuWhatsNew', { version: s.update.current }), disabled: !s.daemonUp || busy },
    { sep: true },
    { id: 'quit', text: t('menuQuit') },
  ];
  const W = MENU_W;
  const bg: Extract<PopupItem, { k: 'rect' }> = { k: 'rect', x: 0, y: 0, w: W, h: 0, fill: th.bg };
  const items: PopupItem[] = [bg];
  let y = 4;
  for (const r of rows) {
    if ('sep' in r) {
      items.push({ k: 'rect', x: 10, y: y + 4, w: W - 20, h: 1, fill: th.line });
      y += 9;
      continue;
    }
    const h = 30;
    // item menutup menu setelah diklik, seperti menu biasa (kecuali yang membuka sub-pilihan)
    if (!r.disabled) items.push({ k: 'hit', x: 4, y, w: W - 8, h, r: 4, id: r.id, hover: th.hover, close: !r.keepOpen });
    const dx = r.indent ? 14 : 0;
    if (r.check && r.checked) items.push({ k: 'text', x: 15 + dx, y, w: 14, h, runs: [{ text: '✓', size: 13, color: th.accent, bold: true, symbol: true }] });
    const color = r.disabled ? th.muted : r.hl ? th.accent : th.text;
    const runs = glyphRuns(r.text, 13, color, !!(r.bold || r.hl));
    const x = (r.check ? 34 : 16) + dx;
    items.push({ k: 'text', x, y, w: W - x - (r.expand ? 30 : 12), h, runs });
    if (r.expand) items.push({ k: 'text', x: W - 28, y, w: 14, h, runs: [{ text: r.expand === 'open' ? '▾' : '▸', size: 12, color: th.muted, symbol: true }] });
    y += h;
  }
  y += 4;
  bg.h = y;
  return { w: W, h: y, bg: th.bg, r: 8, border: th.line, items };
}
