// Web UI Prototyper — layout Workspace: sidebar daftar + detail, pratinjau, dan log live.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

const ACTIVE = ['starting', 'running', 'stopping'];
const LABEL = {
  running: 'Berjalan', starting: 'Memulai', stopping: 'Menghentikan', stopped: 'Berhenti',
  crashed: 'Crash', failed: 'Gagal', invalid: 'Tidak valid',
};
const svg = (d, extra = 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"') =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"><path ${extra} d="${d}"/></svg>`;
const ICON = {
  play: svg('M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5Z', 'fill="currentColor"'),
  stop: svg('M7.5 5h9A2.5 2.5 0 0 1 19 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 16.5v-9A2.5 2.5 0 0 1 7.5 5Z', 'fill="currentColor"'),
  restart: svg('M20 12a8 8 0 1 1-2.34-5.66M20 4v4.5h-4.5', 'fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"'),
  undo: svg('M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11', 'fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"'),
  install: svg('M12 4v11M7 10l5 5 5-5M5 20h14'),
  trash: svg('M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3', 'fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"'),
  copy: svg('M9 9h10v11H9zM5 15V4h10', 'fill="none" stroke="currentColor" stroke-width="2"'),
  pencil: svg('M4 20h4L19 9a2.1 2.1 0 0 0-4-4L4 16v4ZM13.5 6.5l4 4', 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'),
  ext: svg('M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5'),
  eye: svg('M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'fill="none" stroke="currentColor" stroke-width="2"'),
  eyeOff: svg('M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.1 3.9M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2', 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"'),
  sun: svg('M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4', 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"'),
  moon: svg('M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z', 'fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"'),
  auto: svg('M12 3a9 9 0 1 0 0 18V3Z', 'fill="currentColor"'),
  gear: svg('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z', 'fill="none" stroke="currentColor" stroke-width="1.8"'),
  spark: svg('M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z', 'fill="currentColor"'),
  pin: svg('M9 4h6l-1 6 4 4H6l4-4-1-6ZM12 14v7', 'fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"'),
  pinOff: svg('M9 4h6l-1 6 4 4H6l4-4-1-6ZM12 14v7M3 3l18 18', 'fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"'),
  desktop: svg('M3 5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5ZM9 20h6M12 16v4', 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'),
  tablet: svg('M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM11 18h2', 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'),
  mobile: svg('M8 2.5h8a1 1 0 0 1 1 1v17a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-17a1 1 0 0 1 1-1ZM11 18.5h2', 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'),
  home: svg('M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10', 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'),
  plus: svg('M12 5v14M5 12h14', 'fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"'),
  chev: svg('M6 9l6 6 6-6', 'fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"'),
  pick: svg('M4 4l7 17 2.5-7.5L21 11 4 4Z', 'fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"'),
  panel: svg('M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM15 5v14', 'fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"'),
  globe: svg('M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM3.5 9h17M3.5 15h17M12 3c-2.5 2.6-3.5 5.6-3.5 9s1 6.4 3.5 9M12 3c2.5 2.6 3.5 5.6 3.5 9s-1 6.4-3.5 9', 'fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"'),
  download: svg('M12 3v12M7 10l5 5 5-5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2', 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"'),
  clip: svg('M20.5 11.5l-8.4 8.4a5 5 0 0 1-7.1-7.1l8.4-8.4a3.3 3.3 0 0 1 4.7 4.7l-8.4 8.4a1.7 1.7 0 0 1-2.4-2.4l7.7-7.7', 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'),
};

// Hak akses dari /api/health (lihat src/server/access.ts): `local` = komputer ini, semua operasi;
// `device` = HP terpasang pada mode LAN: komentar, agent, start/stop; `none` = perlu pairing.
// Sebelum health dimuat, ditebak dari hostname.
const LOCAL_HOST = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
let ACCESS = LOCAL_HOST ? 'local' : 'device';
let LOCAL = LOCAL_HOST; // semua operasi
let EDIT = true; // alur komentar → agent → periksa hasil
document.documentElement.dataset.access = ACCESS;
const RO_TITLE = 'Hanya bisa dari komputer tempat Prototyper berjalan';
/** Aksi tombol prototype yang boleh dari HP terpasang (selaras DEVICE_WRITES di access.ts). */
const DEVICE_ACTS = new Set(['start', 'stop', 'restart', 'lan']);
function setAccess(a) {
  if (a === ACCESS) return false;
  ACCESS = a; LOCAL = a === 'local'; EDIT = a !== 'none';
  mainFor = null; // bangun ulang kerangka halaman (form komentar, panel agent)
  document.documentElement.dataset.access = a;
  return true;
}
/** Mode LAN daemon dari /api/health: `off`, `prototypes`, atau `all`. */
let daemonLan = 'off';

// ---------- API ----------
async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.error?.message ?? `HTTP ${res.status}`);
    err.code = data?.error?.code;
    if (err.code === 'UNAUTHORIZED') showPairScreen(); // belum dipasangkan atau aksesnya dicabut
    err.details = data?.error?.details ?? [];
    throw err;
  }
  return data;
}
const enc = encodeURIComponent;

// ---------- State ----------
let list = [];
let loaded = false;
const ui = {
  query: '',
  filter: 'semua',
  selected: decodeURIComponent(location.hash.slice(1)) || null,
  busy: new Set(),
  shutdown: false,
  preview: readPref('prototyper:preview', 'on') === 'on',
  device: readPref('prototyper:device', 'desktop'),
  landscape: readPref('prototyper:orientation', 'portrait') === 'landscape',
  theme: readPref('prototyper:theme', 'auto'),
  sidePinned: readPref('prototyper:sidebar', 'pinned') !== 'auto',
};
/** Ukuran jendela pratinjau (px CSS). Desktop = selebar panel. */
const DEVICES = {
  desktop: { label: 'Desktop' },
  tablet: { label: 'Tablet', w: 820, h: 1180 },
  mobile: { label: 'Mobile', w: 390, h: 844 },
};
if (!DEVICES[ui.device]) ui.device = 'desktop';
/** Mode Desktop pada kotak pratinjau yang lebih sempit dari DESKTOP_MIN dirender selebar DESKTOP_W lalu diperkecil. */
const DESKTOP_MIN = 1024;
const DESKTOP_W = 1280;
/** Klik ikon perangkat yang sudah aktif = putar portrait/landscape. */
function setDevice(d) {
  if (!DEVICES[d]) return;
  if (d === ui.device) {
    if (!DEVICES[d].w) return;
    setLandscape(!ui.landscape);
    // hanya ikon yang diklik yang memantul; kelas dipasang di DOM (bukan HTML) agar render ulang tidak memotongnya
    const btn = $(`#d-bar-btns [data-dev="${d}"]`);
    if (btn) {
      btn.classList.add(ui.landscape ? 'bounce-land' : 'bounce-port');
      btn.addEventListener('animationend', () => btn.classList.remove('bounce-land', 'bounce-port'), { once: true });
    }
    return;
  }
  ui.device = d; writePref('prototyper:device', d);
  setLandscape(false); // ganti perangkat selalu mulai dari portrait
}
/** Ukuran perangkat aktif sesuai orientasi; null untuk desktop. */
function deviceSize() {
  const d = DEVICES[ui.device];
  if (!d.w) return null;
  return ui.landscape ? { w: d.h, h: d.w } : { w: d.w, h: d.h };
}
function deviceBtn(k, d) {
  const on = ui.device === k;
  const land = on && d.w && ui.landscape;
  const size = d.w ? ` ${land ? `${d.h}×${d.w}` : `${d.w}×${d.h}`}` : '';
  const title = !d.w || !on ? d.label
    : `${d.label} ${land ? 'landscape' : 'portrait'}${size}${on ? ` — klik lagi untuk ${land ? 'portrait' : 'landscape'}` : ''}`;
  return `<button type="button" class="icon-btn${land ? ' land' : ''}" data-act="device" data-dev="${k}" aria-pressed="${on}" title="${title}">${ICON[k]}</button>`;
}
function setLandscape(on) {
  ui.landscape = on; writePref('prototyper:orientation', on ? 'landscape' : 'portrait'); render();
}
function readPref(k, def) { try { return localStorage.getItem(k) ?? def; } catch { return def; } }
function writePref(k, v) { try { localStorage.setItem(k, v); } catch { /* abaikan */ } }

const byId = (id) => list.find((p) => p.id === id);
/** Halaman "Yang baru" (`/#!whatsnew`); `!` tidak mungkin ada di id prototype. Tray membuka URL ini. */
const WHATSNEW = '!whatsnew';
const st = (p) => (p.valid ? p.status : 'invalid');
const isActive = (p) => p.valid && ACTIVE.includes(p.status);
const isProblem = (p) => ['crashed', 'failed', 'invalid'].includes(st(p));
/** Prototype ini adalah desain sistem (designSystem.source). */
const isDs = (p) => p.manifest?.designSystem?.source === true;
/** Label jenis: desain sistem atau prototype biasa (sama dengan popup tray). */
const kindTag = (p) => (isDs(p) ? '<span class="kind-tag ds">Desain sistem</span>' : '<span class="kind-tag">Prototype</span>');
/** URL yang dibuka dari browser ini: host sama dengan UI (penting di mode LAN). */
const openUrl = (p) => (p.url && p.port ? `${location.protocol}//${location.hostname}:${p.port}/` : null);
function hue(id) { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }
function initials(p) {
  const w = p.name.replace(/[^\p{L}\p{N} _-]/gu, '').split(/[\s_-]+/).filter(Boolean);
  return ((w[0]?.[0] ?? '?') + (w[1]?.[0] ?? '')).toUpperCase();
}
function uptime(p) {
  if (!p.startedAt || !isActive(p)) return null;
  const m = Math.max(0, Math.floor((Date.now() - new Date(p.startedAt).getTime()) / 60000));
  if (m < 1) return 'baru saja';
  if (m < 60) return `${m} mnt`;
  return `${Math.floor(m / 60)} j ${m % 60} mnt`;
}
function visible() {
  const q = ui.query.trim().toLowerCase();
  return list.filter((p) => {
    if (ui.filter === 'aktif' && !isActive(p)) return false;
    if (ui.filter === 'masalah' && !isProblem(p)) return false;
    if (ui.filter === 'ds' && !isDs(p)) return false;
    return !q || [p.id, p.name, p.description, p.path, ...p.tags].join(' ').toLowerCase().includes(q);
  });
}

// ---------- Komponen ----------
const statusHtml = (p) => `<span class="status ${st(p)}" title="${LABEL[st(p)]}"><i class="dot"></i>${LABEL[st(p)]}</span>`;
const avatar = (p, cls = '') => `<span class="mono-av ${cls} ${isDs(p) ? 'ds' : ''} ${isActive(p) ? '' : 'off'}" style="--h:${hue(p.id)}" ${isDs(p) ? 'title="Desain sistem"' : ''}>${esc(initials(p))}</span>`;
function btn(act, p, { label, icon, cls = '', title = label, mutating = true, disabled = false, pressed }) {
  const ro = mutating && !(DEVICE_ACTS.has(act) ? EDIT : LOCAL);
  const dis = disabled || ro || ui.busy.has(p.id);
  const ap = pressed === undefined ? '' : ` aria-pressed="${pressed}"`;
  return `<button type="button" class="btn sm ${cls}" data-act="${act}" data-id="${esc(p.id)}" title="${esc(ro ? RO_TITLE : title)}"${ap} ${dis ? 'disabled' : ''}>${icon}${label ? esc(label) : ''}</button>`;
}
/** Tombol akses LAN satu prototype; pada mode LAN daemon semua prototype sudah terbuka. */
function lanBtn(p) {
  if (daemonLan !== 'off') {
    return btn('lan', p, { label: 'LAN', icon: ICON.globe, cls: 'ghost lan-btn', pressed: true, disabled: true, mutating: false,
      title: 'Semua prototype sudah terbuka ke LAN (mode LAN daemon dari tray atau --lan / --lan-prototypes)' });
  }
  const on = !!p.lanExposed;
  const restart = isActive(p) ? ' (prototype di-restart)' : '';
  return btn('lan', p, { label: 'LAN', icon: ICON.globe, cls: `ghost lan-btn${on ? ' on' : ''}`, pressed: on, disabled: !p.valid,
    title: on ? `Terbuka untuk perangkat lain di jaringan yang sama. Klik untuk menutup${restart}.`
      : `Buka prototype ini untuk perangkat lain di jaringan yang sama (Web UI tetap hanya dari komputer ini)${restart}.` });
}
function actionsHtml(p) {
  const b = ui.busy.has(p.id);
  const out = [];
  if (isActive(p)) {
    out.push(btn('restart', p, { label: 'Restart', icon: ICON.restart }));
    out.push(btn('stop', p, { label: 'Stop', icon: ICON.stop }));
  } else {
    out.push(btn('start', p, { label: b ? 'Memproses…' : 'Start', icon: ICON.play, cls: 'primary', disabled: !p.valid }));
  }
  if (p.type === 'command' && p.manifest?.command?.install) {
    out.push(btn('install', p, { label: 'Install', icon: ICON.install, cls: 'ghost', title: `Jalankan: ${p.manifest.command.install}`, disabled: isActive(p) }));
  }
  out.push(lanBtn(p));
  out.push(btn('remove', p, { label: '', icon: ICON.trash, cls: 'ghost danger', title: 'Hapus dari daftar' }));
  return out.join('');
}
function jsonHtml(obj) {
  return esc(JSON.stringify(obj, null, 2))
    .replace(/(&quot;(?:[^&]|&(?!quot;))*?&quot;)(\s*:)/g, '<span class="k">$1</span>$2')
    .replace(/(:\s*)(&quot;.*?&quot;)/g, '$1<span class="s">$2</span>')
    .replace(/(:\s*)(true|false|null|-?\d+(?:\.\d+)?)/g, '$1<span class="n">$2</span>');
}
function urlsHtml(p) {
  const u = openUrl(p);
  if (!u) return '<span class="muted">—</span>';
  const extra = p.lanUrls.filter((x) => !u.startsWith(x));
  return [u, ...extra].map((x) => `<span class="url"><a href="${esc(x)}" target="_blank" rel="noopener">${esc(x.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a>
    <button type="button" class="icon-btn copy" data-act="copy" data-url="${esc(x)}" title="Salin URL">${ICON.copy}</button></span>`).join('<br>');
}

// ---------- Sidebar ----------
let lastSide = '';
function renderSide() {
  const vis = visible();
  // Desain sistem dikelompokkan sendiri di atas (fondasi bersama), prototype per status di bawahnya.
  const protos = vis.filter((x) => !isDs(x));
  const groups = [
    ['Desain sistem', vis.filter(isDs)],
    ['Aktif', protos.filter(isActive)],
    ['Bermasalah', protos.filter(isProblem)],
    ['Berhenti', protos.filter((x) => !isActive(x) && !isProblem(x))],
  ].filter(([, xs]) => xs.length);
  const empty = !loaded ? '' : list.length === 0
    ? '<div class="empty"><b>Belum ada prototype</b>Daftarkan folder pertama Anda.</div>'
    : vis.length === 0 ? '<div class="empty"><b>Tidak ada yang cocok</b>Coba kata kunci lain atau ganti filter.</div>' : '';
  const html = groups.map(([g, xs]) => `<div class="ws-group">${g} · ${xs.length}</div>${xs.map((x) => `
    <button type="button" class="ws-item" data-act="select" data-id="${esc(x.id)}" aria-current="${x.id === ui.selected}">
      ${avatar(x, 'sm')}<span class="t"><b>${esc(x.name)}</b><span>${kindTag(x)}${x.url ? `:${x.port}` : esc(x.id)}${sideDsHtml(x)}</span></span>${x.comments?.open ? `<span class="cm-badge${x.comments.waitingUser ? ' wait' : ''}" title="${x.comments.open} komentar open${x.comments.waitingUser ? `, ${x.comments.waitingUser} menunggu jawaban Anda` : ''}">${x.comments.open}</span>` : ''}${statusHtml(x)}
    </button>`).join('')}`).join('') + empty;
  const home = loaded && list.length ? `<button type="button" class="ws-item ws-home" data-act="select" data-id="" aria-current="${!ui.selected}">
      <span class="home-ic">${ICON.home}</span><span class="t"><b>Beranda</b><span>ringkasan semua prototype</span></span>${totalWaitingUser() ? `<span class="cm-badge wait" title="Komentar menunggu jawaban Anda">${totalWaitingUser()}</span>` : ''}
    </button>` : '';
  const fullHtml = home + html;
  if (fullHtml !== lastSide) { $('#side-list').innerHTML = fullHtml; lastSide = fullHtml; }
  for (const b of $$('#filter button')) b.setAttribute('aria-pressed', String(b.dataset.f === ui.filter));
}

/** Penanda desain sistem di item sidebar: jumlah pemakai, desain sistem yang dipakai, atau milik sendiri. */
function sideDsHtml(p) {
  const d = p.manifest?.designSystem;
  if (!d) return '';
  if (d.source) {
    const info = ds.list?.find((x) => x.id === p.id);
    if (!info) return '';
    const stale = info.consumers.filter((c) => c.outdated).length;
    return ` · ${info.consumers.length} pemakai${stale ? `<span class="ds-mark stale" title="${stale} prototype perlu sinkron">●</span>` : ''}`;
  }
  if (d.use) {
    const c = ds.list?.find((x) => x.id === d.use)?.consumers.find((x) => x.id === p.id);
    return `<span class="ds-mark${c?.outdated ? ' stale' : ''}" title="Memakai desain sistem ${esc(d.use)}${c?.outdated ? ' (perlu sinkron)' : ''}">◇</span>`;
  }
  return `<span class="ds-mark" title="Desain sistem sendiri: ${esc(d.local.join(', '))}">◆</span>`;
}

// ---------- Panel utama ----------
// Kerangka dibangun ulang hanya saat pilihan berganti, sehingga iframe pratinjau dan
// stream log tidak terputus oleh polling. Bagian lain diperbarui bila HTML-nya berubah.
let mainFor = undefined;
const last = {};
function patch(sel, html) {
  if (last[sel] === html) return;
  last[sel] = html;
  const el = $(sel);
  if (el) el.innerHTML = html;
}

function renderMain() {
  const p = byId(ui.selected);
  const key = ui.selected === WHATSNEW ? 'whatsnew' : p ? p.id : loaded ? (list.length ? 'none' : 'empty') : 'loading';
  if (key !== mainFor) {
    mainFor = key;
    for (const k of Object.keys(last)) delete last[k];
    $('#main').innerHTML = p ? skeleton(p) : placeholderMain(key);
    if (p) connectLog(p.id); else disconnectLog();
    cm.id = p ? p.id : null; cm.data = null; cm.replyTo = null; cm.lastHtml = ''; cm.anchor = null; clearFiles();
    if (p) { applyPanel(); watchWsBody(); renderComments(); loadComments(); }
    disconnectAgentLog(); ag.state = null; ag.lastHtml = ''; ag.open = false;
    if (p && EDIT) loadAgent();
    if (key === 'none' && !ag.agents && !ag.loading) loadAgents();
  }
  if (key === 'none') return renderHome();
  if (key === 'whatsnew') return renderWhatsNew();
  if (!p) return;

  patch('#d-head', `${avatar(p)}
    <div class="grow"><h2>${esc(p.name)} ${kindTag(p)} ${p.type ? `<span class="type-tag">${p.type}</span>` : ''}</h2>
      <p class="meta">${statusHtml(p)}${uptime(p) ? `<span>· ${uptime(p)}</span>` : ''}</p>
      ${p.description ? `<p class="desc" title="${esc(p.description)}">${esc(p.description)}</p>` : ''}</div>
    <div class="actions">${actionsHtml(p)}</div>`);

  const u = openUrl(p);
  patch('#d-addr', u ? esc(u) : 'tidak berjalan');
  patch('#d-bar-btns', `
    ${ui.preview ? `<span class="dev-seg" role="group" aria-label="Ukuran jendela">${Object.entries(DEVICES).map(([k, d]) =>
      deviceBtn(k, d)).join('')}</span>` : ''}
    ${u && ui.preview && EDIT && p.status === 'running' ? `<button type="button" class="pick-btn${embed.mode ? ' on' : ''}" data-act="cm-pick" title="Komentari elemen: klik elemen atau blok teks di pratinjau (Esc untuk batal)" aria-pressed="${embed.mode}">${ICON.pick}<span>${embed.mode ? 'Pilih elemen…' : 'Komentari'}</span></button>` : ''}
    ${u && p.status === 'running' ? `<button type="button" class="icon-btn" data-act="export" title="Ekspor halaman ini ke PNG, JPG, atau PDF">${ICON.download}</button>` : ''}
    ${u && ui.preview ? `<button type="button" class="icon-btn" data-act="reload-preview" title="Muat ulang pratinjau">${ICON.restart}</button>` : ''}
    <button type="button" class="icon-btn" data-act="toggle-preview" title="${ui.preview ? 'Sembunyikan pratinjau' : 'Tampilkan pratinjau'}">${ui.preview ? ICON.eyeOff : ICON.eye}</button>
    ${u ? `<a class="icon-btn" href="${esc(u)}" target="_blank" rel="noopener" title="Buka di tab baru">${ICON.ext}</a>` : ''}`);
  patch('#d-view', viewHtml(p, u));
  const frame = $('#d-view iframe');
  if (frame !== embed.frame) { embed.frame = frame; embed.origin = null; embed.page = null; if (embed.mode) { embed.mode = false; patchBar(); } }
  const viewEl = $('#d-view');
  const live = p.status === 'running' && u && ui.preview;
  viewEl.className = `browser-view ${live ? 'live' : 'off'} ${ui.preview ? '' : 'collapsed'} dev-${ui.device}`;
  fitDevice();

  patch('#d-err', p.error ? `<div class="callout err">${esc(p.error)}</div>` : '');
  patch('#d-info', infoHtml(p));
  applySections();
}

function skeleton(p) {
  return `<div class="detail-head" id="d-head"></div>
    <div class="ws-body">
      <div class="col ws-left">
        <div class="browser">
          <div class="browser-bar"><span class="dots"><i></i><i></i><i></i></span>
            <span class="addr" id="d-addr"></span><span class="bar-btns" id="d-bar-btns"></span>
            <button type="button" class="icon-btn panel-btn" id="btn-panel-show" data-act="toggle-panel"></button></div>
          <div id="d-view"></div>
        </div>
        <div id="d-err"></div>
        <div class="ws-log sec" data-sec="log">
          <div class="log-tools sec-head">${secTitle('log', 'Log')}<span class="live" id="log-live"><i></i>Live</span><span class="spacer"></span>
            <button type="button" class="btn sm ghost" data-act="clear-log">Bersihkan tampilan</button></div>
          <pre class="log" id="log" data-id="${esc(p.id)}"></pre>
        </div>
      </div>
      <div class="col ws-right">
        <section class="cm-panel sec" data-sec="comments">
          <div class="log-tools sec-head">${secTitle('comments', 'Komentar')}<span class="cm-count" id="cm-count"></span><span class="spacer"></span>
            <button type="button" class="btn sm ghost cm-collapse-all" id="cm-collapse-all" data-act="cm-collapse-all" hidden></button>
            <div class="seg cm-filter" id="cm-filter">
              <button type="button" data-f="open">Open</button><button type="button" data-f="resolved">Selesai</button><button type="button" data-f="all">Semua</button>
            </div>
            <button type="button" class="icon-btn panel-btn" id="btn-panel-hide" data-act="toggle-panel"></button></div>
          ${EDIT ? '<div class="agent-bar" id="agent-bar" hidden></div><pre class="log agent-log" id="agent-log" hidden></pre>' : ''}
          <div class="cm-list-wrap">
            <div class="cm-list" id="cm-list"><p class="muted cm-empty">Memuat…</p></div>
            <button type="button" class="cm-latest" id="cm-latest" data-act="cm-latest" title="Gulir ke pesan terbaru" hidden>↓ <span>Terbaru</span></button>
          </div>
          ${EDIT ? `<form class="cm-form" id="cm-form">
            <div class="cm-replying" id="cm-replying" hidden><span></span><button type="button" class="btn sm ghost" data-act="cm-cancel-reply">Batal</button></div>
            <div class="cm-anchor" id="cm-anchor" hidden><span class="cm-anchor-ic">${ICON.pick}</span><span class="cm-anchor-t"></span><button type="button" class="icon-btn" data-act="cm-clear-anchor" title="Lepas elemen">✕</button></div>
            <div class="cm-files" id="cm-files" hidden></div>
            <textarea id="cm-text" rows="2" placeholder="Tulis komentar untuk prototype ini…  (Ctrl+Enter untuk kirim)"></textarea>
            <div class="cm-form-row">
              <button type="button" class="icon-btn" data-act="cm-attach" title="Lampirkan gambar (atau tempel dengan Ctrl+V / seret ke kolom komentar)">${ICON.clip}</button>
              <input type="file" id="cm-file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,.svg" multiple hidden>
              <label class="cm-page-field" id="cm-page-field"><span>Halaman</span><input id="cm-page" value="${esc(cm.pages[p.id] ?? '/')}" spellcheck="false" autocomplete="off" title="Path halaman yang dikomentari, mis. /kasir"></label>
              <span class="spacer"></span>
              <button type="submit" class="btn primary sm" id="cm-send">Kirim</button>
            </div>
          </form>` : ''}
          <p class="muted hint">Atau dari terminal/agent lain: <code>prototyper comments ${esc(p.id)} --waiting agent --json</code></p>
        </section>
        <div class="col" id="d-info"></div>
      </div>
    </div>`;
}

function placeholderMain(key) {
  if (key === 'loading') return '<div class="ws-empty"><div class="empty">Memuat…</div></div>';
  if (key === 'none') return homeSkeleton();
  if (key === 'whatsnew') return whatsNewSkeleton();
  return `<div class="ws-empty"><div class="empty welcome">
    <b>Belum ada prototype terdaftar</b>
    <p>Buat prototype baru dari template, daftarkan folder yang sudah ada, atau dari terminal:</p>
    <pre class="json">prototyper new &lt;id&gt; [--template vite-react]\nprototyper add &lt;folder&gt;</pre>
    <div class="welcome-actions">
      <button type="button" class="btn primary" data-act="new" ${LOCAL ? '' : `disabled title="${RO_TITLE}"`}>Buat baru</button>
      <button type="button" class="btn" data-act="add" ${LOCAL ? '' : `disabled title="${RO_TITLE}"`}>Daftarkan folder</button>
    </div>
  </div></div>`;
}

// Mode tablet/mobile: iframe diberi ukuran perangkat sebenarnya lalu diperkecil (transform)
// agar muat di panel, sehingga breakpoint CSS prototype tetap sesuai perangkat.
// Tinggi konten area kerja → --ws-h, dipakai CSS agar pratinjau mengisi tinggi layar.
let wsObs = null;
function watchWsBody() {
  const body = $('.ws-body');
  if (!body || !('ResizeObserver' in window)) return;
  wsObs?.disconnect();
  wsObs = new ResizeObserver(() => {
    const cs = getComputedStyle(body);
    const h = body.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    body.style.setProperty('--ws-h', `${Math.max(0, Math.floor(h))}px`);
  });
  wsObs.observe(body);
}

let fitObs = null;
function fitDevice() {
  const view = $('#d-view');
  if (!view) return;
  if (!fitObs && 'ResizeObserver' in window) fitObs = new ResizeObserver(() => fitDevice());
  if (fitObs && fitObs.el !== view) { fitObs.disconnect(); fitObs.observe(view); fitObs.el = view; }
  const f = view.querySelector('iframe');
  const d = DEVICES[ui.device];
  const sz = deviceSize();
  let lbl = view.querySelector('.dev-size');
  if (f && !sz && view.clientWidth && view.clientWidth < DESKTOP_MIN) {
    // Desktop di layar sempit (mis. HP): render selebar layar desktop lalu perkecil agar muat,
    // supaya prototype tetap memakai tata letak desktop, bukan media query mobile.
    const W = view.clientWidth, H = view.clientHeight;
    const s = W / DESKTOP_W;
    f.style.cssText = `inset:auto;left:0;top:0;width:${DESKTOP_W}px;height:${Math.round(H / s)}px;transform:scale(${s});transform-origin:0 0;`;
    lbl?.remove();
    return;
  }
  if (!f || !sz) {
    if (f) f.removeAttribute('style');
    lbl?.remove();
    return;
  }
  const pad = 24;
  const W = view.clientWidth, H = view.clientHeight;
  if (!W || !H) return; // tersembunyi (.collapsed): ukur ulang saat tampil lagi
  const s = Math.min(1, (W - pad * 2) / sz.w, (H - pad * 2 - 18) / sz.h);
  const left = Math.max(0, (W - sz.w * s) / 2), top = Math.max(0, (H - 18 - sz.h * s) / 2);
  f.style.cssText = `width:${sz.w}px;height:${sz.h}px;left:${left}px;top:${top}px;transform:scale(${s});`;
  if (!lbl) { lbl = document.createElement('span'); lbl.className = 'dev-size'; view.append(lbl); }
  lbl.textContent = `${d.label} ${ui.landscape ? 'landscape' : 'portrait'} · ${sz.w}×${sz.h}${s < 1 ? ` · ${Math.round(s * 100)}%` : ''}`;
}

let previewNonce = 0;
function togglePreview() {
  ui.preview = !ui.preview;
  writePref('prototyper:preview', ui.preview ? 'on' : 'off');
  if (!ui.preview && embed.mode) { embed.mode = false; sendEmbed('prototyper:mode', { on: false }); }
  render();
}
// Saat disembunyikan, iframe tetap di DOM (hanya .collapsed → display:none) supaya
// menampilkan lagi tidak memuat ulang halaman dan state prototype tidak hilang.
function viewHtml(p, u) {
  if (p.status === 'running' && u) {
    return `<iframe src="${esc(u)}" data-n="${previewNonce}" title="Pratinjau ${esc(p.name)}"></iframe>`;
  }
  const title = p.status === 'starting' ? 'Sedang memulai…'
    : p.status === 'stopping' ? 'Sedang menghentikan…'
    : isProblem(p) ? 'Prototype bermasalah' : 'Pratinjau belum tersedia';
  const sub = p.valid && !isActive(p) ? (isProblem(p) ? 'Periksa log, lalu Start lagi.' : 'Tekan Start untuk menjalankan.') : !p.valid ? 'Perbaiki prototyper.json dulu.' : '';
  return `<div><b>${title}</b>${sub}</div>`;
}

function infoHtml(p) {
  const rows = [
    ['ID', `<code>${esc(p.id)}</code>`],
    ['Folder', `<span class="mono">${esc(p.path)}</span>
      <button type="button" class="icon-btn copy" data-act="copy" data-url="${esc(p.path)}" title="Salin path">${ICON.copy}</button>`],
    ['Jenis', p.type ? `<span class="type-tag">${p.type}</span>` : '—'],
    ['URL', urlsHtml(p)],
    ['Port / PID', `${p.port ?? '—'} / ${p.pid ?? '—'}`],
    ['Uptime', uptime(p) ?? '—'],
    ['Exit code', p.exitCode ?? '—'],
    ['Instruksi agent', `${p.instructions.exists
      ? `<span class="mono">${esc(p.instructions.path.split(/[\\/]/).pop())}</span> ✓`
      : `<span class="muted">Belum ada ${esc(p.instructions.path.split(/[\\/]/).pop())}</span>`}${LOCAL && p.valid
      ? ` <button type="button" class="btn sm ghost instr-sync" data-act="sync-instr" data-id="${esc(p.id)}" title="Pasang/perbarui petunjuk Prototyper di AGENTS.md dan CLAUDE.md (sama dengan prototyper agents sync)" ${ui.busy.has(`sync:${p.id}`) ? 'disabled' : ''}>${ICON.restart}Sinkronkan</button>`
      : ''}`],
    ['Desain sistem', dsRowHtml(p)],
  ];
  const editBtn = LOCAL
    ? `<button type="button" class="btn sm ${p.valid ? 'ghost' : 'primary'}" data-act="edit-manifest" data-id="${esc(p.id)}">${p.valid ? 'Edit' : 'Perbaiki manifest'}</button>`
    : '';
  return `<section class="sec" data-sec="detail">
      <div class="log-tools sec-head">${secTitle('detail', 'Detail')}</div>
      <dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
      ${p.tags.length ? `<div class="chips">${p.tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join('')}</div>` : ''}
      <div class="callout info">Untuk agent: <code>prototyper info ${esc(p.id)} --json</code></div>
    </section>
    <section class="sec" data-sec="manifest">
      <div class="log-tools sec-head">${secTitle('manifest', 'prototyper.json')}<span class="spacer"></span>${editBtn}</div>
      ${p.manifest ? `<pre class="json">${jsonHtml(p.manifest)}</pre>` : '<p class="muted" style="margin:0">Manifest tidak bisa dibaca.</p>'}
    </section>`;
}

// ---------- Section panel kanan: ciutkan per section & sembunyikan seluruh panel ----------
// State disimpan global (bukan per prototype). Kelas diterapkan lewat DOM agar tidak
// mengganggu cache patch() dan form komentar yang sedang diketik.
const secTitle = (key, label) => `<h3 class="section-title"><button type="button" class="sec-toggle" data-act="sec-toggle" data-sec="${key}"><span class="sec-chev" aria-hidden="true">▾</span>${label}</button></h3>`;
function readSecs() { try { return new Set(JSON.parse(readPref('prototyper:sections', '[]'))); } catch { return new Set(); } }
ui.secCollapsed = readSecs();
ui.panelHidden = readPref('prototyper:panel', 'shown') === 'hidden';

function applySections() {
  for (const el of $$('.sec[data-sec]')) {
    const collapsed = ui.secCollapsed.has(el.dataset.sec);
    el.classList.toggle('sec-collapsed', collapsed);
    const b = el.querySelector('.sec-toggle');
    if (b) { b.setAttribute('aria-expanded', String(!collapsed)); b.title = collapsed ? 'Tampilkan section' : 'Ciutkan section'; }
  }
}
function toggleSection(key) {
  if (ui.secCollapsed.has(key)) ui.secCollapsed.delete(key); else ui.secCollapsed.add(key);
  writePref('prototyper:sections', JSON.stringify([...ui.secCollapsed]));
  applySections();
  if (key === 'comments' && !ui.secCollapsed.has(key)) updateLatestBtn();
}

function setPanelHidden(hidden) {
  ui.panelHidden = hidden;
  writePref('prototyper:panel', hidden ? 'hidden' : 'shown');
  applyPanel();
}
function applyPanel() {
  const root = document.documentElement;
  if (ui.panelHidden) root.dataset.panel = 'hidden'; else delete root.dataset.panel;
  // Panel terbuka: tombol sembunyikan di kanan atas panel. Panel tersembunyi: tombol tampilkan
  // di kanan atas area kerja (ujung kanan bilah pratinjau), dengan badge jumlah komentar.
  const hide = $('#btn-panel-hide');
  if (hide && !hide.innerHTML) {
    hide.innerHTML = ICON.panel;
    hide.title = 'Sembunyikan panel kanan (])';
    hide.setAttribute('aria-label', hide.title);
  }
  const show = $('#btn-panel-show');
  if (!show) return;
  const label = 'Tampilkan panel kanan (])';
  const c = cm.data?.counts;
  const n = c ? (c.waitingUser || c.open || 0) : 0;
  show.innerHTML = `${ICON.panel}${n ? `<span class="panel-badge${c.waitingUser ? ' wait' : ''}">${n}</span>` : ''}`;
  show.title = n ? `${label} — ${c.waitingUser ? `${n} komentar menunggu Anda` : `${n} komentar open`}` : label;
  show.setAttribute('aria-label', label);
}

function render() {
  if (ui.selected && ui.selected !== WHATSNEW && !byId(ui.selected) && loaded) ui.selected = null;
  const hash = ui.selected ? `#${enc(ui.selected)}` : '';
  if (location.hash !== hash) history.replaceState(null, '', hash || location.pathname);
  renderSide();
  renderMain();
  updateFabs();
}

// ---------- Tampilan mobile (≤ 800px) ----------
// Sidebar dan panel komentar tidak ditumpuk di halaman, tetapi dibuka sebagai lembar (sheet)
// lewat tombol mengambang: ☰ = daftar prototype, 💬 = komentar & agent, ↖ = komentari elemen.
const MOBILE = matchMedia('(max-width: 800px)');
const isMobile = () => MOBILE.matches;
const sheet = () => document.documentElement.dataset.sheet ?? null;
function setSheet(name) {
  const root = document.documentElement;
  if (name === sheet()) return;
  if (name) root.dataset.sheet = name; else delete root.dataset.sheet;
  if (name === 'side' && embed.mode) togglePick();
  if (name === 'cm') requestAnimationFrame(() => { const l = $('#cm-list'); if (l) l.scrollTop = l.scrollHeight; });
  if (!name && $('.ws-side').contains(document.activeElement)) document.activeElement.blur();
  updateFabs();
}
function updateFabs() {
  const p = byId(ui.selected);
  const fcm = $('#fab-cm');
  const fpick = $('#fab-pick');
  if (!fcm) return;
  fcm.hidden = !p;
  const c = p && cm.id === p.id ? cm.data?.counts : null;
  const n = c ? (c.waitingUser || c.open || 0) : 0;
  const badge = $('#fab-cm-badge');
  badge.hidden = !n;
  badge.textContent = n > 99 ? '99+' : String(n);
  badge.classList.toggle('wait', !!c?.waitingUser);
  fcm.setAttribute('aria-expanded', String(sheet() === 'cm'));
  fcm.title = n ? `Komentar — ${c.waitingUser ? `${n} menunggu Anda` : `${n} open`}` : 'Komentar';
  fpick.hidden = !(p && EDIT && ui.preview && p.status === 'running' && embed.origin);
  fpick.setAttribute('aria-pressed', String(embed.mode));
  $('#fab-menu').setAttribute('aria-expanded', String(sheet() === 'side'));
}
$('#fab-menu').addEventListener('click', () => setSheet(sheet() === 'side' ? null : 'side'));
$('#fab-cm').addEventListener('click', () => setSheet(sheet() === 'cm' ? null : 'cm'));
$('#fab-pick').addEventListener('click', () => {
  setSheet(null);
  togglePick();
  updateFabs();
});
$('#m-backdrop').addEventListener('click', () => setSheet(null));
MOBILE.addEventListener('change', () => setSheet(null));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sheet() && !$('dialog[open]')) setSheet(null);
});

// ---------- Log (SSE) ----------
let es = null;
function disconnectLog() { es?.close(); es = null; }
function connectLog(id) {
  disconnectLog();
  const pre = $('#log');
  const src = new EventSource(`/api/prototypes/${enc(id)}/logs/stream?tail=300`);
  es = src;
  // EventSource menyambung ulang sendiri; server mengirim ulang tail, jadi kosongkan dulu.
  src.onopen = () => { pre.textContent = ''; $('#log-live')?.classList.remove('off'); };
  src.onerror = () => $('#log-live')?.classList.add('off');
  src.onmessage = (ev) => {
    const l = JSON.parse(ev.data);
    const atBottom = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 30;
    const d = new Date(l.ts);
    const ts = Number.isNaN(d.getTime()) ? '' : d.toTimeString().slice(0, 8);
    const span = document.createElement('span');
    span.className = `ln ${l.stream}`;
    span.innerHTML = `<span class="ts">${ts}</span>`;
    span.append(l.line);
    pre.appendChild(span);
    while (pre.childNodes.length > 2000) pre.removeChild(pre.firstChild);
    if (atBottom) pre.scrollTop = pre.scrollHeight;
  };
}

// ---------- Polling ----------
let lastKey = '';
async function refresh(force = false) {
  try {
    const next = await api('GET', '/api/prototypes');
    if (!upd.installing) $('#offline').hidden = true;
    if (ui.shutdown) { ui.shutdown = false; $('#offline').textContent = 'Daemon tidak terjangkau. Mencoba lagi…'; }
    const key = JSON.stringify(next);
    loaded = true;
    if (force || key !== lastKey) { lastKey = key; list = next; }
    render();
    if (list.some((x) => x.manifest?.designSystem) && (force || !ds.list || ++ds.tick % 3 === 0)) loadDesignSystems().then(render);
    if (cm.id && (force || ++cm.tick % 2 === 0)) loadComments();
    if (cm.id && EDIT && (force || ag.state?.running || cm.tick % 2 === 0)) loadAgent();
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED') return;
    $('#offline').hidden = false;
  }
}

// ---------- Aksi ----------
async function run(act, p) {
  if (!p || ui.busy.has(p.id)) return;
  ui.busy.add(p.id);
  render();
  try {
    if (act === 'install') {
      toast(`Menjalankan install untuk ${p.name}…`);
      const r = await api('POST', `/api/prototypes/${enc(p.id)}/install`);
      toast(r.ok ? `Install ${p.name} selesai` : `Install ${p.name} gagal (kode ${r.exitCode})`, !r.ok);
    } else if (act === 'lan') {
      const on = !p.lanExposed;
      const v = await api('PUT', `/api/prototypes/${enc(p.id)}/lan`, { exposed: on });
      if (!on) toast(`Akses LAN ${p.name} ditutup`);
      else if (v.lanUrls.length) toast(`${p.name} terbuka di LAN: ${v.lanUrls[0]}`);
      else if (isActive(v)) toast(`Akses LAN ${p.name} dibuka, tapi tidak ada jaringan terdeteksi`, true);
      else toast(`Akses LAN ${p.name} dibuka; berlaku saat Start`);
    } else {
      const v = await api('POST', `/api/prototypes/${enc(p.id)}/${act}`);
      if (act === 'stop') toast(`${p.name} dihentikan`);
      else if (v.url) toast(`${p.name} berjalan di ${openUrl(v) ?? v.url}`);
    }
  } catch (err) {
    toast(err.message, true);
  } finally {
    ui.busy.delete(p.id);
    await refresh(true);
  }
}

// ---------- Sinkron petunjuk agent (AGENTS.md / CLAUDE.md) ----------
const SYNC_LABEL = {
  created: 'dibuat', updated: 'diperbarui', unchanged: 'sudah terbaru',
  skipped: 'dilewati (agent.syncInstructions: false)', missing: 'belum dipasang', error: 'gagal',
};
const describeSync = (files) => files.map((f) => `${f.file} ${SYNC_LABEL[f.action] ?? f.action}${f.error ? `: ${f.error}` : ''}`).join(', ');

async function syncInstructions(p) {
  const key = `sync:${p.id}`;
  if (ui.busy.has(key)) return;
  ui.busy.add(key);
  render();
  try {
    const r = await api('POST', `/api/prototypes/${enc(p.id)}/instructions/sync`);
    toast(`${p.name}: ${describeSync(r.agentFiles)}`, r.agentFiles.some((f) => f.action === 'error'));
  } catch (err) {
    toast(err.message, true);
  } finally {
    ui.busy.delete(key);
    await refresh(true);
  }
}

async function syncAllInstructions() {
  try {
    const { results } = await api('POST', '/api/instructions/sync');
    const changed = results.filter((r) => r.agentFiles.some((f) => f.action === 'created' || f.action === 'updated'));
    const failed = results.filter((r) => r.error || r.agentFiles.some((f) => f.action === 'error'));
    const parts = [changed.length ? `diperbarui: ${changed.map((r) => r.id).join(', ')}` : 'semua sudah terbaru'];
    if (failed.length) parts.push(`gagal/dilewati: ${failed.map((r) => r.id).join(', ')}`);
    toast(`Petunjuk agent — ${parts.join('; ')}`, failed.length > 0);
  } catch (err) {
    toast(err.message, true);
  } finally {
    await refresh(true);
  }
}

/** Dialog konfirmasi; resolve true bila tombol OK ditekan. */
function confirmDialog({ title, body, ok, list, tone = 'danger' }) {
  const d = $('#dlg-confirm');
  $('#cf-title').textContent = title;
  $('#cf-body').textContent = body;
  $('#cf-ok').textContent = ok;
  $('#cf-ok').className = `btn ${tone === 'primary' ? 'primary' : 'danger-solid'}`;
  const ul = $('#cf-list');
  ul.hidden = !list?.length;
  ul.innerHTML = (list ?? []).map((x) => `<li>${esc(x)}</li>`).join('');
  d.returnValue = '';
  d.showModal();
  return new Promise((resolve) => d.addEventListener('close', () => resolve(d.returnValue === 'ok'), { once: true }));
}

async function confirmRemove(p) {
  const yes = await confirmDialog({
    title: `Hapus "${p.name}" dari daftar?`,
    body: `Folder ${p.path} tidak dihapus — hanya keluar dari daftar Prototyper.${isActive(p) ? ' Prototype yang berjalan akan dihentikan.' : ''}`,
    ok: 'Hapus',
  });
  if (!yes) return;
  ui.busy.add(p.id);
  try {
    await api('DELETE', `/api/prototypes/${enc(p.id)}`);
    toast(`"${p.id}" dihapus dari daftar`);
    if (ui.selected === p.id) ui.selected = null;
  } catch (err) {
    toast(err.message, true);
  } finally {
    ui.busy.delete(p.id);
    await refresh(true);
  }
}

async function confirmShutdown() {
  if (!LOCAL) return toast(RO_TITLE, true);
  const n = list.filter(isActive).length;
  const yes = await confirmDialog({
    title: 'Matikan Prototyper?',
    body: `Daemon dan Web UI berhenti${n ? `, dan ${n} prototype yang berjalan ikut dihentikan` : ''}. Nyalakan lagi dengan: prototyper serve (atau perintah prototyper apa pun).`,
    ok: 'Matikan',
  });
  if (!yes) return;
  try {
    await api('POST', '/api/shutdown');
    ui.shutdown = true;
    disconnectLog();
    $('#offline').textContent = 'Prototyper sudah dimatikan. Nyalakan lagi dengan: prototyper serve — halaman ini tersambung otomatis.';
    $('#offline').hidden = false;
  } catch (err) {
    toast(err.message, true);
  }
}

function select(id) {
  if (sheet() === 'side') setSheet(null);
  const next = id || null; // '' / null = beranda
  if (next === ui.selected) return;
  ui.selected = next;
  render();
}

document.addEventListener('click', (e) => {
  if (e.target.closest('a')) return;
  const t = e.target.closest('[data-act]');
  if (!t || !$('#ws').contains(t)) return;
  const { act, id } = t.dataset;
  const p = id ? byId(id) : null;
  switch (act) {
    case 'start': case 'stop': case 'restart': case 'install': case 'lan': return run(act, p);
    case 'remove': return p && confirmRemove(p);
    case 'select': return select(id);
    case 'copy':
      navigator.clipboard?.writeText(t.dataset.url).then(() => toast('Disalin'), () => toast('Gagal menyalin', true));
      return;
    case 'clear-log': { const pre = $('#log'); if (pre) pre.textContent = ''; return; }
    case 'toggle-preview': return togglePreview();
    case 'reload-preview': previewNonce++; return render();
    case 'device': return setDevice(t.dataset.dev);
    case 'export': return openExport(byId(ui.selected));
    case 'edit-manifest': return p && openManifestEditor(p);
    case 'sync-instr': return p && syncInstructions(p);
    case 'ds-sync': return p && dsSync(p);
    case 'ds-use': return p && openDsDialog(p);
    case 'ds-detach': return p && dsDetach(p);
    case 'add': return openAdd();
    case 'new': return openNew();
    case 'agent-run': return runAgent();
    case 'agent-run-one': return runAgent([t.dataset.cid]);
    case 'agent-stop': return stopAgent();
    case 'agent-undo': return undoAgent();
    case 'agent-list': return openAgentsDialog();
    case 'agent-log-toggle': ag.open = !ag.open; return renderAgent();
    case 'agent-resume': if (ag.fresh.has(cm.id)) ag.fresh.delete(cm.id); else ag.fresh.add(cm.id); return renderAgent();
    case 'cm-pick': return togglePick();
    case 'cm-attach': return $('#cm-file')?.click();
    case 'cm-rm-file': return removeFile(t.dataset.k);
    case 'cm-clear-anchor': return setAnchor(null);
    case 'cm-focus': return focusAnchor(t.dataset.cid);
    case 'cm-latest': return scrollToLatest();
    case 'cm-toggle': {
      const c = cm.data?.comments?.find((x) => x.id === t.dataset.cid);
      return c && setCollapsed([c.id], !isCollapsed(c));
    }
    case 'cm-collapse-all': return toggleCollapseAll();
    case 'sec-toggle': return toggleSection(t.dataset.sec);
    case 'toggle-panel': return isMobile() ? setSheet(null) : setPanelHidden(!ui.panelHidden);
    case 'cm-reply': return startReply(t.dataset.cid);
    case 'cm-cancel-reply': return startReply(null);
    case 'cm-resolve': return commentAction('resolve', t.dataset.cid);
    case 'cm-reopen': return commentAction('reopen', t.dataset.cid);
    case 'cm-delete': return commentAction('delete', t.dataset.cid);
    case 'cm-edit': return startEdit(t.dataset.rid ?? t.dataset.cid);
    case 'cm-delete-reply': return deleteReply(t.dataset.cid, t.dataset.rid);
    case 'cm-edit-cancel': return startEdit(null);
  }
});
$('#q').addEventListener('input', (e) => { ui.query = e.target.value; render(); });
$('#filter').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-f]');
  if (b) { ui.filter = b.dataset.f; render(); }
});
$('#btn-add').addEventListener('click', () => openAdd());
$('#btn-new').addEventListener('click', () => openNew());
$('#btn-shutdown').addEventListener('click', () => confirmShutdown());
$('#btn-palette').addEventListener('click', () => openPalette());
$('#meta').addEventListener('click', () => select(WHATSNEW));
$('#btn-theme').addEventListener('click', () => setTheme({ auto: 'light', light: 'dark', dark: 'auto' }[ui.theme] ?? 'auto'));
window.addEventListener('hashchange', () => select(decodeURIComponent(location.hash.slice(1))));

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); return openPalette(); }
  if ($('dialog[open]')) return;
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName ?? '');
  if (e.key === 'Escape' && typing) return document.activeElement.blur();
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === '/') { e.preventDefault(); return $('#q').focus(); }
  if (e.key === '[') { e.preventDefault(); return setSidePinned(!ui.sidePinned); }
  if (e.key === ']') { e.preventDefault(); return setPanelHidden(!ui.panelHidden); }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'j' || e.key === 'k') {
    // Urutan sama dengan sidebar (dikelompokkan).
    const order = $$('#side-list .ws-item').map((b) => b.dataset.id);
    if (!order.length) return;
    const i = order.indexOf(ui.selected ?? '');
    const step = e.key === 'ArrowDown' || e.key === 'j' ? 1 : -1;
    const next = order[Math.max(0, Math.min(order.length - 1, i < 0 ? 0 : i + step))];
    e.preventDefault();
    select(next);
    $(`#side-list .ws-item[data-id="${CSS.escape(next)}"]`)?.scrollIntoView({ block: 'nearest' });
  }
});

// ---------- Tema ----------
const mql = matchMedia('(prefers-color-scheme: dark)');
function setTheme(t) {
  ui.theme = t;
  writePref('prototyper:theme', t);
  applyTheme();
}
function applyTheme() {
  const root = document.documentElement;
  if (ui.theme === 'auto') delete root.dataset.theme; else root.dataset.theme = ui.theme;
  const label = { auto: 'Tema: otomatis', light: 'Tema: terang', dark: 'Tema: gelap' }[ui.theme];
  const b = $('#btn-theme');
  b.innerHTML = { auto: ICON.auto, light: ICON.sun, dark: ICON.moon }[ui.theme];
  b.title = label;
  b.setAttribute('aria-label', label);
}
mql.addEventListener('change', applyTheme);

// ---------- Sidebar: sematkan / sembunyi otomatis ----------
// Bila tidak disematkan, sidebar melayang di kiri: muncul saat kursor menyentuh tepi kiri
// (atau tombol tepi diklik / fokus masuk), dan tersembunyi lagi saat kursor keluar.
const side = { timer: 0 };
function setSidePinned(pinned) {
  ui.sidePinned = pinned;
  writePref('prototyper:sidebar', pinned ? 'pinned' : 'auto');
  applySide();
  if (!pinned) openSide(false);
}
function applySide() {
  const root = document.documentElement;
  if (ui.sidePinned) delete root.dataset.side; else root.dataset.side = 'auto';
  if (ui.sidePinned) $('#ws').classList.remove('side-open');
  const b = $('#btn-pin');
  const label = ui.sidePinned ? 'Sidebar disematkan — klik untuk sembunyi otomatis ([)' : 'Sembunyi otomatis — klik untuk menyematkan sidebar ([)';
  b.innerHTML = ui.sidePinned ? ICON.pin : ICON.pinOff;
  b.title = label;
  b.setAttribute('aria-label', label);
  b.setAttribute('aria-pressed', String(ui.sidePinned));
}
function openSide(open) {
  clearTimeout(side.timer);
  if (ui.sidePinned) return;
  const ws = $('#ws');
  if (open) return ws.classList.add('side-open');
  if (!ws.classList.contains('side-open')) return;
  ws.classList.remove('side-open');
  if ($('.ws-side').contains(document.activeElement)) document.activeElement.blur();
}
function closeSideSoon(delay = 280) {
  clearTimeout(side.timer);
  side.timer = setTimeout(() => {
    // Jangan tutup saat pengguna sedang mengetik di kotak cari.
    if (document.activeElement === $('#q')) return;
    openSide(false);
  }, delay);
}
$('#btn-pin').addEventListener('click', () => setSidePinned(!ui.sidePinned));
$('#side-edge').addEventListener('mouseenter', () => openSide(true));
$('#side-edge').addEventListener('click', () => openSide(true));
$('.ws-side').addEventListener('mouseenter', () => clearTimeout(side.timer));
$('.ws-side').addEventListener('mouseleave', () => closeSideSoon());
$('.ws-side').addEventListener('focusin', () => openSide(true));
$('.ws-side').addEventListener('focusout', (e) => { if (!$('.ws-side').contains(e.relatedTarget) && !$('.ws-side').matches(':hover')) closeSideSoon(); });
// Sentuh/klik di luar sidebar menutupnya (penting di layar sentuh, tanpa mouseleave).
document.addEventListener('pointerdown', (e) => {
  if (!ui.sidePinned && !e.target.closest('.ws-side, #side-edge, dialog')) openSide(false);
});

// ---------- Pembaruan Prototyper ----------
// GET /api/update di-cache daemon (6 jam); `refresh` memaksa memeriksa GitHub lagi.
const upd = { info: null, checking: false, installing: null };

async function loadUpdate(refresh = false) {
  if (upd.checking || upd.installing) return;
  upd.checking = true;
  if (refresh) renderUpdateDialog();
  try {
    upd.info = await api('GET', `/api/update${refresh ? '?refresh=1' : ''}`);
  } catch (err) {
    if (refresh) toast(err.message, true);
  } finally {
    upd.checking = false;
  }
  renderUpdateBar();
  renderUpdateDialog();
}

function renderUpdateBar() {
  const i = upd.info;
  const bar = $('#upd-bar');
  bar.hidden = !(i?.available || upd.installing);
  if (bar.hidden) return;
  bar.innerHTML = upd.installing
    ? `<span class="upd-dot spin"></span><span><b>Memasang ${esc(upd.installing)}…</b><small>Prototyper dimulai ulang</small></span>`
    : `<span class="upd-dot"></span><span><b>Pembaruan ${esc(i.latest)}</b><small>${i.autoInstall && LOCAL ? 'Klik untuk memasang' : 'Lihat cara memperbarui'}</small></span>`;
}

function openUpdateDialog() {
  if (!$('#dlg-update').open) $('#dlg-update').showModal();
  renderUpdateDialog();
}

function renderUpdateDialog() {
  const dlg = $('#dlg-update');
  if (!dlg.open && !upd.checking) return;
  const i = upd.info;
  const checked = i?.checkedAt ? new Date(i.checkedAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : null;
  let body;
  if (upd.checking) body = '<p class="muted">Memeriksa pembaruan…</p>';
  else if (!i) body = '<p class="muted">Belum diperiksa.</p>';
  else if (i.available) {
    body = `<p>Prototyper <b>${esc(i.latest)}</b> sudah rilis. Versi Anda <b>${esc(i.current)}</b>.</p>
      ${i.autoInstall
        ? `<p class="muted">Daemon dan semua prototype akan dihentikan sebentar, lalu dinyalakan lagi otomatis setelah pembaruan terpasang${i.kind === 'msi' ? ' (lewat installer MSI)' : ''}.</p>`
        : `<div class="callout info">${esc(i.hint ?? 'Instalasi ini tidak bisa diperbarui otomatis.')}</div>`}
      ${LOCAL ? '' : `<div class="callout warn">${RO_TITLE}.</div>`}`;
  } else body = `<p>Prototyper <b>${esc(i.current)}</b> sudah versi terbaru${i.latest ? '' : ' (belum pernah diperiksa)'}.</p>`;
  const err = i?.error ? `<div class="callout err">Gagal memeriksa: ${esc(i.error)}</div>` : '';
  const canInstall = i?.available && i.autoInstall && LOCAL && !upd.checking;
  $('#upd-form').innerHTML = `<h2>Pembaruan Prototyper</h2>${body}${err}
    ${checked ? `<p class="muted upd-checked">Terakhir diperiksa ${esc(checked)}${i.enabled ? '' : ' · pemeriksaan otomatis mati (PROTOTYPER_UPDATE_CHECK=0)'}</p>` : ''}
    <div class="dlg-foot">
      ${i?.pageUrl ? `<a class="btn ghost" href="${esc(i.pageUrl)}" target="_blank" rel="noopener">Catatan rilis</a>` : ''}
      <span class="spacer"></span>
      <button type="button" class="btn" data-upd="check"${upd.checking ? ' disabled' : ''}>Periksa lagi</button>
      ${canInstall ? '<button type="button" class="btn primary" data-upd="install">Perbarui sekarang</button>' : '<button value="close" class="btn">Tutup</button>'}
    </div>`;
}

async function installUpdate() {
  if (!LOCAL) return toast(RO_TITLE, true);
  let r;
  try {
    r = await api('POST', '/api/update/install');
  } catch (err) {
    return toast(err.message, true);
  }
  $('#dlg-update').close();
  upd.installing = r.version;
  renderUpdateBar();
  disconnectLog();
  const offline = $('#offline');
  offline.textContent = `Memasang Prototyper ${r.version}… Halaman dimuat ulang otomatis setelah selesai. Log: ${r.log}`;
  // Tunggu daemon versi baru menyala (MSI bisa makan waktu beberapa menit).
  const deadline = Date.now() + 10 * 60_000;
  const poll = async () => {
    const h = await fetch('/api/health', { cache: 'no-store' }).then((res) => (res.ok ? res.json() : null)).catch(() => null);
    if (h?.version === r.version) return location.reload();
    if (Date.now() > deadline) {
      upd.installing = null;
      renderUpdateBar();
      offline.textContent = `Pembaruan belum selesai setelah 10 menit. Periksa log: ${r.log}`;
      offline.hidden = false;
      return;
    }
    if (!h) offline.hidden = false;
    setTimeout(poll, 1500);
  };
  setTimeout(poll, 2000);
}

$('#upd-bar').addEventListener('click', () => { if (!upd.installing) openUpdateDialog(); });
$('#upd-form').addEventListener('click', (e) => {
  const b = e.target.closest('[data-upd]');
  if (!b) return;
  if (b.dataset.upd === 'check') loadUpdate(true);
  else if (b.dataset.upd === 'install') installUpdate();
});

// ---------- Toast ----------
function toast(msg, err = false) {
  const el = document.createElement('div');
  el.className = `toast${err ? ' err' : ''}`;
  el.innerHTML = '<i></i>';
  el.append(msg);
  $('#toasts').appendChild(el);
  raiseToasts();
  setTimeout(() => el.remove(), err ? 7000 : 3000);
}
/**
 * Dialog modal (<dialog>.showModal) berada di top layer, di atas elemen biasa. Wadah toast adalah
 * popover; tampilkan (ulang) agar ia menjadi lapisan teratas, di atas dialog yang sedang terbuka.
 */
function raiseToasts() {
  const box = $('#toasts');
  if (typeof box.showPopover !== 'function') return; // browser lama: z-index biasa
  try {
    const open = box.matches(':popover-open');
    if (open && !document.querySelector('dialog[open]')) return;
    if (open) box.hidePopover(); // urutan top layer = urutan tampil: tampilkan ulang di atas dialog
    box.showPopover();
  } catch { /* abaikan */ }
}

// ---------- Dialog daftarkan / edit manifest ----------
// mode: 'add' (folder baru) atau 'edit' (prototype terdaftar → PUT manifest)
const add = { step: 1, mode: 'add', d: null, id: null, type: '' };

function resetAdd(mode) {
  add.mode = mode; add.d = null; add.id = null; add.type = '';
  $('#add-err').hidden = true;
}
function openAdd() {
  if (!LOCAL) return toast(RO_TITLE, true);
  resetAdd('add');
  add.step = 1;
  $('#add-title').textContent = 'Daftarkan prototype';
  $('#add-sub').innerHTML = 'Arahkan ke folder prototype. Bila belum ada <code>prototyper.json</code>, isinya dideteksi otomatis.';
  $('#add-path').value = '';
  $('#add-step1').hidden = false; $('#add-step2').hidden = true;
  $('#add-next').textContent = 'Lanjut';
  $('#dlg-add').showModal();
  $('#add-path').focus();
}
function openManifestEditor(p) {
  resetAdd('edit');
  add.id = p.id;
  add.step = 2;
  $('#add-title').textContent = p.valid ? `Edit prototyper.json — ${p.name}` : 'Perbaiki prototyper.json';
  $('#add-sub').textContent = 'Perubahan ditulis ke file prototyper.json di folder prototype.';
  $('#add-folder').textContent = p.path;
  $('#add-type-row').hidden = true;
  $('#add-notes').innerHTML = '';
  $('#add-json').value = p.manifest ? JSON.stringify(p.manifest, null, 2) : '';
  $('#add-step1').hidden = true; $('#add-step2').hidden = false;
  $('#add-next').textContent = 'Simpan';
  $('#dlg-add').showModal();
  if (!p.manifest) {
    // Ambil isi mentah file agar bisa diperbaiki.
    api('POST', '/api/manifest/detect', { path: p.path })
      .then((d) => {
        $('#add-json').value = d.raw ?? JSON.stringify(d.manifest, null, 2);
        if (d.error) showAddErr(d.error);
      })
      .catch((err) => showAddErr(err.message, err.details));
  }
  $('#add-json').focus();
}
function showDetect(d) {
  add.d = d;
  add.step = 2;
  $('#add-folder').textContent = d.path;
  $('#add-type-row').hidden = d.exists;
  for (const b of $$('#add-type button')) b.setAttribute('aria-pressed', String(b.dataset.val === add.type));
  $('#add-notes').innerHTML = d.notes.map((n) => `<li>${esc(n)}</li>`).join('');
  $('#add-json').value = d.raw ?? JSON.stringify(d.manifest, null, 2);
  $('#add-sub').textContent = d.exists
    ? 'prototyper.json tidak valid — perbaiki lalu simpan.'
    : 'Folder belum punya prototyper.json — periksa hasil deteksi.';
  $('#add-step1').hidden = true; $('#add-step2').hidden = false;
  $('#add-next').textContent = 'Simpan & daftarkan';
  $('#add-err').hidden = true;
  if (d.error) showAddErr(d.error);
  $('#add-json').focus();
}
function showAddErr(message, details = []) {
  const el = $('#add-err');
  // Bila ada daftar detail, judul ringkas saja agar pesan tidak tampil dua kali.
  el.innerHTML = esc(details.length ? 'Manifest belum valid:' : message)
    + (details.length ? `<ul>${details.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '');
  el.hidden = false;
}
function done(p, msg) {
  $('#dlg-add').close();
  ui.selected = p.id;
  toast(msg);
  refresh(true);
}

$('#add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const next = $('#add-next');
  next.disabled = true;
  try {
    if (add.step === 1) {
      const path = $('#add-path').value.trim();
      if (!path) { $('#add-path').focus(); return; }
      const d = await api('POST', '/api/manifest/detect', { path });
      if (d.exists && d.valid) done(await api('POST', '/api/prototypes', { path: d.path }), `"${d.manifest.id}" terdaftar`);
      else showDetect(d);
      return;
    }
    let manifest;
    try { manifest = JSON.parse($('#add-json').value); } catch (err) { return showAddErr(`JSON tidak valid: ${err.message}`); }
    if (add.mode === 'edit') {
      done(await api('PUT', `/api/prototypes/${enc(add.id)}/manifest`, { manifest }), 'prototyper.json disimpan');
    } else {
      done(await api('POST', '/api/prototypes', { path: add.d.path, manifest, overwrite: add.d.exists }), `"${manifest.id}" terdaftar`);
    }
  } catch (err) {
    showAddErr(err.message, err.details);
  } finally {
    next.disabled = false;
  }
});
$('#add-type').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-val]');
  if (!b || !add.d) return;
  add.type = b.dataset.val;
  let current = {};
  try { current = JSON.parse($('#add-json').value); } catch { /* pakai default */ }
  try {
    showDetect(await api('POST', '/api/manifest/detect', {
      path: add.d.path, type: add.type || undefined, id: current.id, name: current.name,
    }));
  } catch (err) {
    showAddErr(err.message, err.details);
  }
});
$$('#dlg-add [data-close]').forEach((b) => b.addEventListener('click', () => $('#dlg-add').close()));
$('#dlg-add').addEventListener('close', () => { $('#add-type-row').hidden = false; });

// ---------- Yang baru ----------
// Isi dari web/whatsnew.json (ikut terkirim bersama web/, jadi selalu cocok dengan versi daemon).
const wn = { version: null, data: null, loading: false, error: null };
const SEEN_KEY = 'prototyper:seen-version';
const wnUnseen = () => !!wn.version && readPref(SEEN_KEY, '') !== wn.version;
/** Titik di samping versi (satu-satunya pintu ke halaman ini di Web UI) sampai halaman dibuka untuk versi itu. */
const wnMark = () => $('#meta').classList.toggle('new', wnUnseen());
function wnInline(t) {
  return esc(t).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
}
function wnDate(d) {
  const x = new Date(`${d}T00:00:00`);
  return Number.isNaN(x.getTime()) ? esc(d) : x.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}
function whatsNewSkeleton() {
  return `<div class="home whatsnew">
    <header class="home-head">
      <div><h1>Yang baru</h1><p class="muted">Perubahan di setiap versi Prototyper.</p></div>
    </header>
    <section id="wn-body"></section>
  </div>`;
}
async function loadWhatsNew() {
  wn.loading = true; wn.error = null;
  try {
    const res = await fetch('/whatsnew.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    wn.data = await res.json();
  } catch (err) {
    wn.error = err.message;
  } finally {
    wn.loading = false;
    render();
  }
}
function renderWhatsNew() {
  if (wnUnseen()) { writePref(SEEN_KEY, wn.version); wnMark(); }
  if (!wn.data && !wn.error) {
    if (!wn.loading) loadWhatsNew();
    return patch('#wn-body', '<p class="muted">Memuat…</p>');
  }
  if (!wn.data) return patch('#wn-body', `<div class="callout err">Gagal memuat daftar perubahan: ${esc(wn.error)}</div>`);
  const rel = Array.isArray(wn.data.releases) ? wn.data.releases : [];
  patch('#wn-body', `<div class="wn-list">${rel.map((r) => `<article class="wn-rel${r.version === wn.version ? ' current' : ''}">
      <div class="wn-head"><span class="wn-ver">v${esc(r.version)}</span>${r.version === wn.version ? '<span class="h-chip accent">versi Anda</span>' : ''}<span class="spacer"></span><span class="muted">${r.date ? wnDate(r.date) : ''}</span></div>
      ${r.title ? `<h2>${esc(r.title)}</h2>` : ''}
      <ul>${(r.items ?? []).map((i) => `<li>${wnInline(i)}</li>`).join('')}</ul>
    </article>`).join('')}</div>
    ${wn.data.releasesUrl ? `<p class="muted wn-foot">Semua rilis dan berkas unduhan: <a href="${esc(wn.data.releasesUrl)}" target="_blank" rel="noopener">GitHub Releases ${ICON.ext}</a></p>` : ''}`);
}

// ---------- Beranda ----------
/** Chip desain sistem pada kartu prototype di Beranda. */
function dsChipHtml(p) {
  const d = p.manifest?.designSystem;
  if (d?.use) {
    const c = ds.list?.find((x) => x.id === d.use)?.consumers.find((x) => x.id === p.id);
    return `<span class="h-chip ${c?.outdated ? 'warn' : 'ds'}" title="Memakai desain sistem ${esc(d.use)}${c?.outdated ? ' — perlu sinkron' : ''}">◇ ${esc(d.use)}</span>`;
  }
  if (d?.local) return `<span class="h-chip ds" title="Desain sistem sendiri: ${esc(d.local.join(', '))}">◆ desain sistem sendiri</span>`;
  return '';
}
/** Kartu desain sistem di Beranda: pemakai (klik untuk membuka), status sinkron, dan aksi. */
function dsCardHtml(p) {
  const info = ds.list?.find((x) => x.id === p.id);
  const users = info?.consumers ?? [];
  const stale = users.filter((c) => c.outdated);
  const u = openUrl(p);
  const act = isActive(p)
    ? btn('stop', p, { label: 'Stop', icon: ICON.stop })
    : btn('start', p, { label: ui.busy.has(p.id) ? 'Memproses…' : 'Buka katalog', icon: ICON.play, cls: 'primary', disabled: !p.valid });
  const sync = stale.length && LOCAL
    ? `<button type="button" class="btn sm" data-act="ds-sync" data-id="${esc(p.id)}" title="Salin ulang token & komponen ke ${stale.length} prototype" ${ui.busy.has(`ds:${p.id}`) ? 'disabled' : ''}>${ICON.restart}Sebarkan (${stale.length})</button>` : '';
  return `<article class="h-card ds ${isActive(p) ? 'on' : ''}" data-act="select" data-id="${esc(p.id)}" tabindex="0">
      <div class="h-card-top">${avatar(p)}<div class="t"><b>${esc(p.name)}</b><span>${kindTag(p)}${esc(p.id)}</span></div>${statusHtml(p)}</div>
      ${p.description ? `<p class="h-desc">${esc(p.description)}</p>` : ''}
      <div class="h-meta">
        ${u ? `<a href="${esc(u)}" target="_blank" rel="noopener" class="h-url">${esc(u.replace(/^https?:\/\//, '').replace(/\/$/, ''))} ${ICON.ext}</a>` : `<span class="muted">${info ? (users.length ? `dipakai ${users.length} prototype` : 'belum dipakai prototype lain') : ''}</span>`}
      </div>
      ${users.length ? `<div class="h-ds-users">${users.map((c) => `<span class="h-chip ${c.outdated ? 'warn' : 'ds'}" data-act="select" data-id="${esc(c.id)}" title="${c.outdated ? 'Perlu sinkron' : 'Terbaru'} — buka ${esc(c.name)}">${esc(c.id)}${c.outdated ? ' ●' : ''}</span>`).join('')}</div>` : ''}
      <div class="h-card-actions">${act}${sync}<span class="spacer"></span><span class="h-open">Buka detail →</span></div>
    </article>`;
}

const sum = (f) => list.reduce((n, p) => n + (f(p) || 0), 0);
const totalWaitingUser = () => sum((p) => p.comments?.waitingUser);

function homeSkeleton() {
  return `<div class="home">
    <header class="home-head">
      <div><h1>Beranda</h1><p class="muted">Ringkasan semua prototype di komputer ini.</p></div>
      <div class="home-actions">
        <button type="button" class="btn primary" data-act="new" ${LOCAL ? '' : `disabled title="${RO_TITLE}"`}>${ICON.plus}Buat baru</button>
        <button type="button" class="btn" data-act="add" ${LOCAL ? '' : `disabled title="${RO_TITLE}"`}>Daftarkan folder</button>
      </div>
    </header>
    <section class="home-stats" id="h-stats"></section>
    <section id="h-attn"></section>
    <section id="h-ds"></section>
    <section>
      <div class="log-tools"><h3 class="section-title">Prototype</h3><span class="spacer"></span><span class="muted" id="h-count"></span></div>
      <div class="home-cards" id="h-cards"></div>
    </section>
    <section id="h-agents"></section>
  </div>`;
}

function renderHome() {
  const running = list.filter(isActive).length;
  const open = sum((p) => p.comments?.open);
  const waitUser = totalWaitingUser();
  const waitAgent = open - waitUser;
  const problems = list.filter(isProblem).length;
  const dss = list.filter(isDs);
  const protos = list.filter((p) => !isDs(p));
  const stat = (n, label, cls = '', sub = '') => `<div class="h-stat ${cls}"><b>${n}</b><span>${label}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
  patch('#h-stats', [
    stat(protos.length, 'Prototype', '', [problems ? `${problems} bermasalah` : '', dss.length ? `+ ${dss.length} desain sistem` : ''].filter(Boolean).join(' · ')),
    stat(running, 'Berjalan', running ? 'ok' : ''),
    stat(waitUser, 'Menunggu Anda', waitUser ? 'warn' : '', 'komentar perlu jawaban'),
    stat(waitAgent, 'Menunggu agent', waitAgent ? 'accent' : '', 'siap dikerjakan'),
  ].join(''));

  const attn = [];
  for (const p of list) {
    const c = p.comments ?? { open: 0, waitingUser: 0 };
    if (c.waitingUser) attn.push({ p, cls: 'warn', text: `${c.waitingUser} komentar menunggu jawaban Anda` });
    if (c.open - c.waitingUser > 0) attn.push({ p, cls: 'accent', text: `${c.open - c.waitingUser} komentar menunggu agent` });
    if (isProblem(p)) attn.push({ p, cls: 'err', text: p.valid ? `${LABEL[st(p)]}${p.error ? ` — ${p.error}` : ''}` : 'Manifest tidak valid' });
    const stale = isDs(p) ? (ds.list?.find((x) => x.id === p.id)?.consumers ?? []).filter((c) => c.outdated) : [];
    if (stale.length) attn.push({ p, cls: 'accent', text: `${stale.length} prototype perlu sinkron desain sistem: ${stale.map((c) => c.id).join(', ')}` });
  }
  patch('#h-attn', attn.length ? `<div class="log-tools"><h3 class="section-title">Perlu perhatian</h3></div>
    <div class="h-attn">${attn.map((a) => `<button type="button" class="h-attn-item ${a.cls}" data-act="select" data-id="${esc(a.p.id)}">
      ${avatar(a.p, 'sm')}<span class="t"><b>${esc(a.p.name)}</b><span>${esc(a.text)}</span></span><span class="h-go">Buka →</span></button>`).join('')}</div>` : '');

  patch('#h-ds', dss.length ? `<div class="log-tools"><h3 class="section-title">Desain sistem</h3><span class="spacer"></span>
      <span class="muted">token &amp; komponen yang dipakai bersama</span></div>
    <div class="home-cards">${dss.map(dsCardHtml).join('')}</div>` : '');
  $('#h-count').textContent = `${protos.length} terdaftar`;
  const order = [...protos].sort((a, b) => Number(isActive(b)) - Number(isActive(a)) || Number(isProblem(b)) - Number(isProblem(a)));
  patch('#h-cards', order.map((p) => {
    const u = openUrl(p);
    const c = p.comments ?? { open: 0, waitingUser: 0 };
    const act = isActive(p)
      ? btn('stop', p, { label: 'Stop', icon: ICON.stop })
      : btn('start', p, { label: ui.busy.has(p.id) ? 'Memproses…' : 'Start', icon: ICON.play, cls: 'primary', disabled: !p.valid });
    return `<article class="h-card ${isActive(p) ? 'on' : ''}" data-act="select" data-id="${esc(p.id)}" tabindex="0">
      <div class="h-card-top">${avatar(p)}<div class="t"><b>${esc(p.name)}</b><span>${kindTag(p)}${esc(p.id)}${p.type ? ` · ${p.type}` : ''}</span></div>${statusHtml(p)}</div>
      ${p.description ? `<p class="h-desc">${esc(p.description)}</p>` : ''}
      <div class="h-meta">
        ${u ? `<a href="${esc(u)}" target="_blank" rel="noopener" class="h-url">${esc(u.replace(/^https?:\/\//, '').replace(/\/$/, ''))} ${ICON.ext}</a>` : `<span class="muted">${p.valid ? 'tidak berjalan' : 'tidak valid'}</span>`}
        <span class="spacer"></span>
        ${dsChipHtml(p)}
        ${c.waitingUser ? `<span class="h-chip warn" title="Menunggu jawaban Anda">${c.waitingUser} menunggu Anda</span>` : ''}
        ${c.open - c.waitingUser > 0 ? `<span class="h-chip accent" title="Menunggu agent">${c.open - c.waitingUser} untuk agent</span>` : ''}
      </div>
      <div class="h-card-actions">${act}<span class="spacer"></span><span class="h-open">Buka detail →</span></div>
    </article>`;
  }).join(''));

  const av = (ag.agents ?? []).filter((a) => a.available);
  patch('#h-agents', `<div class="log-tools"><h3 class="section-title">Agent lokal</h3><span class="spacer"></span>
      <button type="button" class="btn sm ghost" data-act="agent-list">${ICON.gear}Kelola</button></div>
    <div class="h-agents">${!ag.agents ? '<span class="muted">Memeriksa agent…</span>'
      : av.length ? av.map((a) => `<span class="h-agent">${agentLogo(a.id)}<b>${esc(a.name)}</b><small>${esc(a.version ?? '')}</small>${a.support === 'tested' ? '' : '<span class="agent-exp">eksperimental</span>'}</span>`).join('')
      : '<span class="muted">Belum ada agent coding yang terdeteksi (Claude Code, Codex, Gemini CLI, Copilot CLI).</span>'}</div>`);
}

// ---------- Komentar ----------
// Dimuat terpisah dari polling daftar; daftar komentar di-render ulang hanya bila isinya berubah,
// sedangkan form tulis berada di luar daftar sehingga teks yang sedang diketik tidak hilang.
const cm = { id: null, data: null, filter: readPref('prototyper:cm-filter', 'open'), replyTo: null, editing: null, tick: 0, lastHtml: '', pages: {}, files: [] };

async function loadComments() {
  const id = cm.id;
  if (!id) return;
  try {
    const d = await api('GET', `/api/prototypes/${enc(id)}/comments?status=all`);
    if (cm.id !== id) return;
    cm.data = d;
  } catch (err) {
    if (cm.id !== id) return;
    cm.data = { error: err.message, comments: [], counts: { open: 0, resolved: 0 } };
  }
  renderComments();
}

function fmtTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const same = d.toDateString() === new Date().toDateString();
  return same ? d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const WAIT = { user: ['user', 'Menunggu Anda'], agent: ['agent', 'Menunggu agent'] };

function questionHtml(c, r) {
  const type = r.multi ? 'checkbox' : 'radio';
  const head = `<div class="cm-q-head"><b>${esc(r.author)}</b><span class="cm-q-tag">${r.multi ? 'Pilih satu atau lebih' : 'Pilih satu'}</span><span class="cm-meta">${fmtTime(r.createdAt)}</span></div>
    <p class="cm-text">${esc(r.text)}</p>`;
  if (r.answer || c.status !== 'open' || !EDIT) {
    const chosen = r.answer?.choices ?? [];
    return `<div class="cm-question answered" data-rid="${esc(r.id)}">${head}
      <ul class="cm-opts-done">${r.options.map((o) => `<li class="${chosen.includes(o) ? 'on' : ''}">${chosen.includes(o) ? '✓' : '○'} ${esc(o)}</li>`).join('')}</ul>
      ${r.answer ? '' : `<p class="muted cm-q-none">${c.status === 'open' ? 'Belum dijawab.' : 'Tidak dijawab.'}</p>`}
    </div>`;
  }
  const name = `q-${r.id}`;
  return `<form class="cm-question cm-q" data-cid="${esc(c.id)}" data-qid="${esc(r.id)}" data-rid="${esc(r.id)}">${head}
    <div class="cm-opts" role="${r.multi ? 'group' : 'radiogroup'}">
      ${r.options.map((o) => `<label class="cm-opt"><input type="${type}" name="${esc(name)}" value="${esc(o)}"><span>${esc(o)}</span></label>`).join('')}
    </div>
    <textarea rows="2" placeholder="Catatan untuk jawaban — atau tulis pertanyaan balik tanpa memilih opsi"></textarea>
    <div class="cm-q-row"><span class="muted cm-q-hint"></span><span class="spacer"></span><button type="submit" class="btn primary sm" disabled>Kirim</button></div>
  </form>`;
}

/** URL lampiran (path relatif ".prototyper/attachments/<nama>") lewat API daemon. */
const attachmentUrl = (rel) => `/api/prototypes/${enc(cm.id)}/attachments/${enc(rel.split('/').pop())}`;
function attachmentsHtml(list) {
  if (!list?.length) return '';
  return `<div class="cm-atts">${list.map((a) => `<a href="${esc(attachmentUrl(a))}" target="_blank" rel="noopener" title="${esc(a)}"><img src="${esc(attachmentUrl(a))}" alt="Lampiran gambar" loading="lazy"></a>`).join('')}</div>`;
}
const textHtml = (t) => (t ? `<p class="cm-text">${esc(t)}</p>` : '');

function replyHtml(c, r) {
  if (r.options) return questionHtml(c, r);
  if (r.answerTo) {
    return `<div class="cm-reply cm-answer ${r.role === 'agent' ? 'agent' : 'user'}" data-rid="${esc(r.id)}"><b>${esc(r.author)}</b><span>memilih</span>${(r.choices ?? []).map((x) => `<span class="cm-chip">${esc(x)}</span>`).join('')}<span class="cm-meta">${fmtTime(r.createdAt)}</span>${r.text ? `<p class="cm-text">${esc(r.text)}</p>` : ''}</div>`;
  }
  // Balasan pengguna yang belum ditanggapi agent boleh diedit/dihapus (server juga memeriksanya).
  const changeable = EDIT && r.editable && !isWorking(c);
  const editing = changeable && cm.editing === r.id;
  const tools = changeable && !editing ? `<span class="cm-reply-tools">
      <button type="button" class="icon-btn cm-edit-btn" data-act="cm-edit" data-cid="${esc(c.id)}" data-rid="${esc(r.id)}" title="Edit balasan">${ICON.pencil}</button>
      <button type="button" class="icon-btn" data-act="cm-delete-reply" data-cid="${esc(c.id)}" data-rid="${esc(r.id)}" title="Hapus balasan">${ICON.trash}</button>
    </span>` : '';
  const body = editing ? editFormHtml(c.id, r.id, r.text) : `${textHtml(r.text)}${editedHtml(r)}`;
  return `<div class="cm-reply ${r.role === 'agent' ? 'agent' : 'user'}" data-rid="${esc(r.id)}"><b>${r.role === 'agent' ? '<span class="cm-role-ic" aria-hidden="true">✦</span>' : ''}${esc(r.author)}</b><span class="cm-meta">${fmtTime(r.createdAt)}</span>${tools}${body}${attachmentsHtml(r.attachments)}</div>`;
}

const editedHtml = (m) => (m.editedAt ? `<span class="cm-edited" title="Diedit ${esc(fmtTime(m.editedAt))}">(diedit)</span>` : '');
function editFormHtml(cid, rid, text) {
  return `<form class="cm-edit" data-cid="${esc(cid)}"${rid ? ` data-rid="${esc(rid)}"` : ''}>
      <textarea rows="3" aria-label="Teks ${rid ? `balasan ${esc(rid)}` : `komentar ${esc(cid)}`}">${esc(text)}</textarea>
      <div class="cm-q-row"><span class="muted cm-q-hint">Ctrl+Enter simpan · Esc batal</span><span class="spacer"></span>
        <button type="button" class="btn sm ghost" data-act="cm-edit-cancel">Batal</button>
        <button type="submit" class="btn primary sm">Simpan</button></div>
    </form>`;
}

// ---------- Ciutkan / bentangkan percakapan komentar ----------
// Pilihan eksplisit pengguna disimpan per prototype; tanpa pilihan: komentar selesai diciutkan,
// komentar open dibentangkan.
const collapseKey = (id) => `prototyper:cm-collapsed:${id}`;
function collapsedMap() {
  if (cm.collapsedFor !== cm.id) {
    cm.collapsedFor = cm.id;
    try { cm.collapsed = JSON.parse(readPref(collapseKey(cm.id), '{}')) || {}; } catch { cm.collapsed = {}; }
  }
  return cm.collapsed;
}
function saveCollapsed() {
  const m = collapsedMap();
  // Buang id komentar yang sudah tidak ada agar penyimpanan tidak terus membesar.
  const ids = new Set((cm.data?.comments ?? []).map((c) => c.id));
  for (const k of Object.keys(m)) if (cm.data?.comments && !ids.has(k)) delete m[k];
  writePref(collapseKey(cm.id), JSON.stringify(m));
}
function isCollapsed(c) {
  const v = collapsedMap()[c.id];
  return typeof v === 'boolean' ? v : c.status === 'resolved';
}
function setCollapsed(cids, value) {
  const m = collapsedMap();
  for (const cid of cids) m[cid] = value;
  saveCollapsed();
  cm.lastHtml = ''; renderComments();
}
const visibleComments = () => (cm.data?.comments ?? []).filter((c) => cm.filter === 'all' || c.status === cm.filter);
function toggleCollapseAll() {
  const list = visibleComments();
  setCollapsed(list.map((c) => c.id), !list.every(isCollapsed));
}

/** Komentar yang sedang dikerjakan agent: id-nya, atau semua yang menunggu agent bila run tanpa commentIds. */
function isWorking(c) {
  const st = ag.state;
  if (!st?.running) return false;
  const ids = st.run?.commentIds;
  return ids?.length ? ids.includes(c.id) : c.status === 'open' && c.waitingFor === 'agent';
}

const snippet = (t, n = 90) => { const s = String(t ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n)}…` : s; };

function collapsedSummary(c) {
  const n = c.replies.length;
  const last = c.replies[n - 1];
  const lastText = last ? (last.options ? `❓ ${last.text}` : last.answerTo ? `memilih ${(last.choices ?? []).join(', ')}` : last.text || '(gambar)') : '';
  return `<button type="button" class="cm-summary" data-act="cm-toggle" data-cid="${esc(c.id)}" title="Tampilkan percakapan lengkap">
      <span class="cm-sum-n">${n ? `${n} balasan` : 'Tanpa balasan'}</span>
      ${last ? `<span class="cm-sum-last"><b>${esc(last.author)}:</b> ${esc(snippet(lastText))}</span>` : ''}
      <span class="cm-sum-more">Tampilkan</span>
    </button>`;
}

function commentHtml(c) {
  const collapsed = isCollapsed(c);
  const working = isWorking(c);
  const wait = c.waitingFor ? WAIT[c.waitingFor] : null;
  const head = `<header data-act="cm-toggle" data-cid="${esc(c.id)}" title="${collapsed ? 'Bentangkan' : 'Ciutkan'} percakapan">
      <span class="cm-chev" aria-hidden="true">▸</span><code>${esc(c.id)}</code><span class="cm-page">${esc(c.page)}</span>
      ${working ? '<span class="cm-working"><i></i>Sedang dikerjakan</span>' : ''}
      ${wait ? `<span class="cm-wait ${wait[0]}">${wait[1]}</span>` : ''}
      <span class="cm-meta">${esc(c.author)} · ${fmtTime(c.createdAt)}</span></header>`;
  const cls = `cm ${c.status}${collapsed ? ' collapsed' : ''}${working ? ' working' : ''}${cm.replyTo === c.id ? ' replying' : ''}${c.waitingFor === 'user' ? ' needs-you' : ''}`;
  if (collapsed) {
    return `<article class="${cls}" data-cid="${esc(c.id)}">${head}
      ${c.text ? `<p class="cm-text cm-clamp">${esc(c.text)}</p>` : ''}
      ${collapsedSummary(c)}
    </article>`;
  }
  // Edit/hapus hanya untuk komentar yang belum dikerjakan agent (server juga memeriksanya).
  const changeable = c.editable && !working;
  const editing = changeable && cm.editing === c.id;
  const actions = EDIT && !editing ? `<div class="cm-actions">
      ${c.waitingFor === 'agent' && pickedAgent() ? `<button type="button" class="btn sm ghost agent-one" data-act="agent-run-one" data-cid="${esc(c.id)}" title="Minta ${esc(pickedAgent().name)} mengerjakan komentar ini saja" ${ag.state?.running ? 'disabled' : ''}>${ICON.spark}Kerjakan</button>` : ''}
      <button type="button" class="btn sm ghost" data-act="cm-reply" data-cid="${esc(c.id)}">Balas</button>
      ${c.status === 'open'
        ? `<button type="button" class="btn sm ghost" data-act="cm-resolve" data-cid="${esc(c.id)}">✓ Selesai</button>`
        : `<button type="button" class="btn sm ghost" data-act="cm-reopen" data-cid="${esc(c.id)}">Buka lagi</button>`}
      <span class="spacer"></span>
      ${changeable ? `<button type="button" class="icon-btn cm-edit-btn" data-act="cm-edit" data-cid="${esc(c.id)}" title="Edit komentar">${ICON.pencil}</button>
      <button type="button" class="icon-btn" data-act="cm-delete" data-cid="${esc(c.id)}" title="Hapus komentar">${ICON.trash}</button>` : ''}
    </div>` : '';
  const body = editing ? editFormHtml(c.id, null, c.text) : `${textHtml(c.text)}${editedHtml(c)}`;
  return `<article class="${cls}" data-cid="${esc(c.id)}">${head}
    ${c.anchor ? `<button type="button" class="cm-anchor-chip" data-act="cm-focus" data-cid="${esc(c.id)}" title="${esc(c.anchor.selector)}">${ICON.pick}<span>${esc(anchorLabel(c.anchor))}</span></button>` : ''}
    ${body}
    ${attachmentsHtml(c.attachments)}
    ${c.replies.map((r) => replyHtml(c, r)).join('')}
    ${c.status === 'resolved' ? `<div class="cm-res">✓ Selesai${c.resolvedBy ? ` oleh ${esc(c.resolvedBy)}` : ''}${c.resolvedAt ? ` · ${fmtTime(c.resolvedAt)}` : ''}${c.resolution ? `<p class="cm-text">${esc(c.resolution)}</p>` : ''}</div>` : ''}
    ${actions}
  </article>`;
}

// Simpan isian form pertanyaan (pilihan + teks + fokus) agar tidak hilang saat daftar di-render ulang.
function saveQForms() {
  const st = {};
  for (const f of $$('#cm-list form.cm-q')) {
    const ta = f.querySelector('textarea');
    st[f.dataset.qid] = {
      checked: $$('input:checked', f).map((i) => i.value),
      text: ta.value,
      focus: document.activeElement === ta,
      sel: [ta.selectionStart, ta.selectionEnd],
    };
  }
  const ed = $('#cm-list form.cm-edit textarea');
  if (ed) st['edit:' + (ed.form.dataset.rid ?? ed.form.dataset.cid)] = { text: ed.value, focus: document.activeElement === ed, sel: [ed.selectionStart, ed.selectionEnd] };
  return st;
}
function restoreQForms(st) {
  const ed = $('#cm-list form.cm-edit textarea');
  const es = ed && st['edit:' + (ed.form.dataset.rid ?? ed.form.dataset.cid)];
  if (ed && es) {
    ed.value = es.text;
    if (es.focus) { ed.focus(); ed.setSelectionRange(es.sel[0], es.sel[1]); }
  }
  for (const f of $$('#cm-list form.cm-q')) {
    const s = st[f.dataset.qid];
    if (s) {
      for (const i of $$('input', f)) i.checked = s.checked.includes(i.value);
      const ta = f.querySelector('textarea');
      ta.value = s.text;
      if (s.focus) { ta.focus(); ta.setSelectionRange(s.sel[0], s.sel[1]); }
    }
    updateQForm(f);
  }
}
function updateQForm(f) {
  const picked = $$('input:checked', f).length > 0;
  const text = f.querySelector('textarea').value.trim();
  const b = f.querySelector('button[type="submit"]');
  b.disabled = !picked && !text;
  b.textContent = picked ? 'Kirim jawaban' : text ? 'Kirim pertanyaan balik' : 'Kirim';
  f.querySelector('.cm-q-hint').textContent = picked ? (text ? 'Pilihan + catatan' : '') : text ? 'Opsi tetap menunggu dijawab' : 'Pilih opsi, atau tanya balik';
}

function renderComments() {
  const listEl = $('#cm-list');
  if (!listEl) return;
  for (const b of $$('#cm-filter button')) b.setAttribute('aria-pressed', String(b.dataset.f === cm.filter));
  const d = cm.data;
  let html;
  if (!d) html = '<p class="muted cm-empty">Memuat…</p>';
  else if (d.error) html = `<div class="callout err">${esc(d.error)}</div>`;
  else {
    // Yang menunggu Anda di atas, lalu terbaru lebih dulu.
    const rank = (c) => (c.waitingFor === 'user' ? 0 : c.status === 'open' ? 1 : 2);
    const items = d.comments
      .filter((c) => cm.filter === 'all' || c.status === cm.filter)
      .map((c, i) => [c, i])
      .sort(([a, ia], [b, ib]) => rank(a) - rank(b) || ib - ia)
      .map(([c]) => c);
    html = items.length ? items.map(commentHtml).join('')
      : `<p class="muted cm-empty">${cm.filter === 'open' ? (d.counts.resolved ? 'Semua komentar sudah selesai.' : 'Belum ada komentar.') : 'Tidak ada komentar.'}</p>`;
  }
  $('#cm-count').innerHTML = d && !d.error
    ? `${d.counts.open} open${d.counts.waitingUser ? ` · <b class="cm-count-wait">${d.counts.waitingUser} menunggu Anda</b>` : ''} · ${d.counts.resolved} selesai`
    : '';
  const allBtn = $('#cm-collapse-all');
  if (allBtn) {
    const vis = d && !d.error ? visibleComments() : [];
    const allCollapsed = vis.length > 0 && vis.every(isCollapsed);
    allBtn.hidden = vis.length < 2;
    allBtn.textContent = allCollapsed ? '▾ Bentangkan semua' : '▸ Ciutkan semua';
    allBtn.title = allCollapsed ? 'Tampilkan semua percakapan lengkap' : 'Ciutkan semua percakapan menjadi ringkasan satu baris';
  }
  sendPins();
  if (html !== cm.lastHtml) {
    const st = saveQForms();
    listEl.innerHTML = html;
    cm.lastHtml = html;
    restoreQForms(st);
  }
  trackLatest(d && !d.error ? d.comments.filter((c) => cm.filter === 'all' || c.status === cm.filter) : []);
  if (ui.panelHidden) applyPanel(); // perbarui badge jumlah komentar di tombol panel
  updateFabs(); // badge tombol komentar mengambang (mobile)
}

// ---------- Tombol "Terbaru": gulir daftar komentar ke pesan (komentar/balasan) paling baru ----------
/** Pesan paling baru di antara komentar yang tampil. createdAt berformat ISO, jadi bisa dibandingkan sebagai string. */
function trackLatest(items) {
  let best = null;
  for (const c of items) {
    for (const m of [c, ...c.replies]) {
      const at = String(m.createdAt ?? '');
      if (!best || at > best.at) best = { at, cid: c.id, rid: m === c ? null : m.id };
    }
  }
  const key = best ? `${best.cid}/${best.rid ?? ''}` : null;
  // Pesan baru masuk (bukan muat awal / ganti prototype / ganti filter) → tandai tombol.
  if (key && cm.latest?.key && key !== cm.latest.key && cm.latest.for === cm.id && cm.latest.filter === cm.filter && best.at > cm.latest.at) cm.latestNew = true;
  if (!key || cm.latest?.for !== cm.id) cm.latestNew = false;
  cm.latest = best ? { ...best, key, for: cm.id, filter: cm.filter } : null;
  updateLatestBtn();
}

function latestEl() {
  const l = cm.latest;
  if (!l) return null;
  const art = $(`#cm-list article[data-cid="${CSS.escape(l.cid)}"]`);
  return (l.rid && art?.querySelector(`[data-rid="${CSS.escape(l.rid)}"]`)) || art;
}

/** Tampilkan tombol bila pesan terbaru tidak terlihat di area gulir daftar. */
function updateLatestBtn() {
  const btn = $('#cm-latest');
  const list = $('#cm-list');
  if (!btn || !list) return;
  const el = latestEl();
  let hidden = true;
  if (el) {
    const a = el.getBoundingClientRect();
    const b = list.getBoundingClientRect();
    hidden = a.bottom <= b.bottom + 4 && a.bottom >= b.top + 24;
  }
  if (hidden) cm.latestNew = false;
  btn.hidden = hidden;
  btn.classList.toggle('new', !!cm.latestNew);
  btn.querySelector('span').textContent = cm.latestNew ? 'Pesan baru' : 'Terbaru';
}

function scrollToLatest(smooth = true) {
  const l = cm.latest;
  const c = l && cm.data?.comments?.find((x) => x.id === l.cid);
  if (c && isCollapsed(c)) setCollapsed([c.id], false); // bentangkan agar pesannya terlihat
  const el = latestEl();
  const list = $('#cm-list');
  if (!el || !list) return;
  const a = el.getBoundingClientRect();
  const b = list.getBoundingClientRect();
  // Pesan pendek: sejajarkan bagian bawahnya dengan bawah daftar; pesan lebih tinggi dari daftar: tampilkan awalnya.
  const delta = a.height > b.height - 16 ? a.top - b.top - 8 : a.bottom - b.bottom + 8;
  list.scrollTo({ top: list.scrollTop + delta, behavior: smooth ? 'smooth' : 'auto' });
  cm.latestNew = false;
  el.classList.remove('cm-flash');
  void el.offsetWidth; // mulai ulang animasi
  el.classList.add('cm-flash');
  setTimeout(() => el.classList.remove('cm-flash'), 1400);
}

document.addEventListener('scroll', (e) => { if (e.target.id === 'cm-list') updateLatestBtn(); }, true);
window.addEventListener('resize', () => updateLatestBtn());

function startReply(cid) {
  cm.replyTo = cid;
  const box = $('#cm-replying');
  if (!box) return;
  box.hidden = !cid;
  box.querySelector('span').textContent = cid ? `Membalas ${cid}` : '';
  $('#cm-page-field').hidden = !!cid;
  $('#cm-send').textContent = cid ? 'Balas' : 'Kirim';
  $('#cm-text').placeholder = cid ? `Balasan untuk ${cid}…  (Ctrl+Enter untuk kirim)` : 'Tulis komentar untuk prototype ini…  (Ctrl+Enter untuk kirim)';
  cm.lastHtml = ''; renderComments();
  $('#cm-text').focus();
}

async function commentAction(kind, cid) {
  const id = cm.id;
  if (!id || !cid) return;
  const base = `/api/prototypes/${enc(id)}/comments/${enc(cid)}`;
  try {
    if (kind === 'delete') {
      const yes = await confirmDialog({ title: `Hapus komentar ${cid}?`, body: 'Komentar dan balasannya dihapus dari .prototyper/comments.json.', ok: 'Hapus' });
      if (!yes) return;
      await api('DELETE', base);
      if (cm.replyTo === cid) startReply(null);
      if (cm.editing === cid) cm.editing = null;
      toast(`${cid} dihapus`);
    } else {
      await api('POST', `${base}/${kind}`);
      toast(kind === 'resolve' ? `${cid} ditandai selesai` : `${cid} dibuka lagi`);
    }
  } catch (err) {
    toast(err.message, true);
  }
  await loadComments();
  refresh(true);
}

// ---------- Edit/hapus komentar & balasan (hanya yang belum dikerjakan agent) ----------
/** key = id komentar, atau id balasan (mis. "c3-r2"); null = tutup form edit. */
function startEdit(key) {
  cm.editing = key;
  cm.lastHtml = ''; renderComments();
  const ta = key && $('#cm-list form.cm-edit textarea');
  if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
}
async function deleteReply(cid, rid) {
  const id = cm.id;
  if (!id || !cid || !rid) return;
  const yes = await confirmDialog({ title: `Hapus balasan ${rid}?`, body: `Balasan ini dihapus dari komentar ${cid}.`, ok: 'Hapus' });
  if (!yes) return;
  try {
    await api('DELETE', `/api/prototypes/${enc(id)}/comments/${enc(cid)}/replies/${enc(rid)}`);
    if (cm.editing === rid) cm.editing = null;
    toast(`Balasan ${rid} dihapus`);
  } catch (err) {
    toast(err.message, true);
  }
  await loadComments();
  refresh(true);
}
document.addEventListener('submit', async (e) => {
  const f = e.target;
  if (!f.classList?.contains('cm-edit')) return;
  e.preventDefault();
  const id = cm.id;
  const { cid, rid } = f.dataset;
  const c = cm.data?.comments?.find((x) => x.id === cid);
  const m = rid ? c?.replies.find((x) => x.id === rid) : c;
  const text = f.querySelector('textarea').value.trim();
  if (!id || !m) return;
  if (!text && !m.attachments?.length) return toast(`Teks ${rid ? 'balasan' : 'komentar'} tidak boleh kosong`, true);
  if (text === m.text) return startEdit(null);
  const b = f.querySelector('button[type="submit"]');
  b.disabled = true;
  try {
    await api('PATCH', `/api/prototypes/${enc(id)}/comments/${enc(cid)}${rid ? `/replies/${enc(rid)}` : ''}`, { text });
    toast(`${rid ?? cid} diperbarui`);
    cm.editing = null;
    cm.lastHtml = '';
    await loadComments();
    refresh(true);
  } catch (err) {
    toast(err.message, true);
    b.disabled = false;
    await loadComments(); // mis. agent baru saja membalas: tombol edit hilang
  }
});
document.addEventListener('keydown', (e) => {
  const f = e.target.closest?.('form.cm-edit');
  if (!f || e.target.tagName !== 'TEXTAREA') return;
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); f.requestSubmit(); }
  if (e.key === 'Escape') { e.preventDefault(); startEdit(null); }
});

document.addEventListener('input', (e) => { const f = e.target.closest?.('form.cm-q'); if (f) updateQForm(f); });
document.addEventListener('change', (e) => { const f = e.target.closest?.('form.cm-q'); if (f) updateQForm(f); });
document.addEventListener('submit', async (e) => {
  const f = e.target;
  if (!f.classList?.contains('cm-q')) return;
  e.preventDefault();
  const id = cm.id;
  const { cid, qid } = f.dataset;
  const choices = $$('input:checked', f).map((i) => i.value);
  const text = f.querySelector('textarea').value.trim();
  if (!id || (!choices.length && !text)) return;
  const b = f.querySelector('button[type="submit"]');
  b.disabled = true;
  try {
    const body = choices.length ? { answerTo: qid, choices, ...(text ? { text } : {}) } : { text };
    await api('POST', `/api/prototypes/${enc(id)}/comments/${enc(cid)}/replies`, body);
    toast(choices.length ? `Jawaban untuk ${cid} terkirim` : `Pertanyaan balik untuk ${cid} terkirim`);
    cm.lastHtml = ''; // paksa render ulang tanpa memulihkan isian form ini
    for (const i of $$('input', f)) i.checked = false;
    f.querySelector('textarea').value = '';
    await loadComments();
    scrollToLatest();
    refresh(true);
  } catch (err) {
    toast(err.message, true);
    b.disabled = false;
  }
});
document.addEventListener('keydown', (e) => {
  const f = e.target.closest?.('form.cm-q');
  if (f && e.target.tagName === 'TEXTAREA' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); f.requestSubmit(); }
});
document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'cm-form') return;
  e.preventDefault();
  const id = cm.id;
  const text = $('#cm-text').value.trim();
  if (cm.files.some((f) => !f.path)) return toast('Tunggu gambar selesai diunggah', true);
  const attachments = cm.files.map((f) => f.path);
  if (!id || (!text && !attachments.length)) return $('#cm-text').focus();
  const extra = attachments.length ? { attachments } : {};
  const send = $('#cm-send');
  send.disabled = true;
  try {
    if (cm.replyTo) {
      await api('POST', `/api/prototypes/${enc(id)}/comments/${enc(cm.replyTo)}/replies`, { text, ...extra });
      startReply(null);
    } else {
      const page = $('#cm-page').value.trim() || '/';
      cm.pages[id] = page;
      await api('POST', `/api/prototypes/${enc(id)}/comments`, { text, page, ...(cm.anchor ? { anchor: cm.anchor } : {}), ...extra });
      setAnchor(null);
      if (cm.filter === 'resolved') { cm.filter = 'open'; writePref('prototyper:cm-filter', 'open'); }
    }
    $('#cm-text').value = '';
    clearFiles();
    await loadComments();
    scrollToLatest(); // tampilkan pesan yang baru dikirim
    refresh(true);
  } catch (err) {
    toast(err.message, true);
  } finally {
    send.disabled = false;
  }
});

// ---------- Lampiran gambar komentar (tempel / seret / tombol) ----------
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];
/** Tipe file; sebagian OS/browser tidak memberi tipe untuk .svg. */
const fileType = (f) => f.type || (/\.svg$/i.test(f.name ?? '') ? 'image/svg+xml' : '');
const MAX_FILE_MB = 5;
const MAX_FILES = 6;
let fileSeq = 0;

function renderFiles() {
  const box = $('#cm-files');
  if (!box) return;
  box.hidden = !cm.files.length;
  box.innerHTML = cm.files.map((f) => `<span class="cm-file${f.path ? '' : ' uploading'}">
      <img src="${esc(f.preview)}" alt="">
      <button type="button" class="cm-file-x" data-act="cm-rm-file" data-k="${f.key}" title="Hapus lampiran">✕</button>
    </span>`).join('');
}

function clearFiles() {
  for (const f of cm.files) URL.revokeObjectURL(f.preview);
  cm.files = [];
  renderFiles();
}

function removeFile(key) {
  const f = cm.files.find((x) => String(x.key) === String(key));
  if (!f) return;
  URL.revokeObjectURL(f.preview);
  cm.files = cm.files.filter((x) => x !== f);
  renderFiles();
}

const readDataUrl = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error ?? new Error('Gagal membaca file'));
  r.readAsDataURL(file);
});

async function addFiles(files) {
  const id = cm.id;
  if (!id || !EDIT) return;
  for (const file of files) {
    if (!IMAGE_TYPES.includes(fileType(file))) { toast(`${file.name || 'File'}: hanya gambar PNG, JPG, GIF, WebP, atau SVG`, true); continue; }
    if (file.size > MAX_FILE_MB * 1024 * 1024) { toast(`${file.name || 'Gambar'} terlalu besar (maks. ${MAX_FILE_MB} MB)`, true); continue; }
    if (cm.files.length >= MAX_FILES) { toast(`Maksimal ${MAX_FILES} gambar per komentar`, true); break; }
    const f = { key: ++fileSeq, preview: URL.createObjectURL(file), path: null };
    cm.files.push(f);
    renderFiles();
    try {
      const a = await api('POST', `/api/prototypes/${enc(id)}/attachments`, { data: await readDataUrl(file) });
      if (!cm.files.includes(f)) continue; // dihapus / pindah prototype selama mengunggah
      f.path = a.path;
      renderFiles();
    } catch (err) {
      toast(`Gagal mengunggah gambar: ${err.message}`, true);
      removeFile(f.key);
    }
  }
}

const imagesOf = (list) => [...(list ?? [])].filter((f) => f && fileType(f).startsWith('image/'));
document.addEventListener('paste', (e) => {
  if (e.target.id !== 'cm-text') return;
  const files = imagesOf([...(e.clipboardData?.items ?? [])].filter((i) => i.kind === 'file').map((i) => i.getAsFile()));
  if (!files.length) return; // teks biasa: tempel seperti biasa
  e.preventDefault();
  addFiles(files);
});
document.addEventListener('change', (e) => {
  if (e.target.id !== 'cm-file') return;
  addFiles([...e.target.files]);
  e.target.value = '';
});
const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
document.addEventListener('dragover', (e) => {
  const form = e.target.closest?.('#cm-form');
  if (!form || !hasFiles(e)) return;
  e.preventDefault();
  form.classList.add('drop');
});
document.addEventListener('dragleave', (e) => {
  const form = e.target.closest?.('#cm-form');
  if (form && !form.contains(e.relatedTarget)) form.classList.remove('drop');
});
document.addEventListener('drop', (e) => {
  const form = e.target.closest?.('#cm-form');
  if (!form || !hasFiles(e)) return;
  e.preventDefault();
  form.classList.remove('drop');
  const files = imagesOf(e.dataTransfer.files);
  if (files.length) addFiles(files); else toast('Hanya gambar yang bisa dilampirkan', true);
});
document.addEventListener('keydown', (e) => {
  if (e.target.id === 'cm-text' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    $('#cm-form').requestSubmit();
  }
  if (e.target.id === 'cm-text' && e.key === 'Escape' && cm.replyTo) { e.stopPropagation(); startReply(null); }
});
document.addEventListener('click', (e) => {
  const b = e.target.closest('#cm-filter button[data-f]');
  if (!b) return;
  cm.filter = b.dataset.f;
  writePref('prototyper:cm-filter', cm.filter);
  renderComments();
});

// ---------- Agent (Claude Code, Codex, … dijalankan oleh Prototyper) ----------
const ag = { agents: null, defaultId: 'claude', pick: readPref('prototyper:agent', ''), state: null, lastHtml: '', open: false, es: null, esFor: null, loading: null, fresh: new Set() };

const agentById = (id) => ag.agents?.find((a) => a.id === id) ?? null;
const availableAgents = () => (ag.agents ?? []).filter((a) => a.available);
const agentName = (id) => agentById(id)?.name ?? id;
/** Agent terpilih: pilihan tersimpan bila masih tersedia, lalu default, lalu yang pertama tersedia. */
function pickedAgent() {
  const av = availableAgents();
  return av.find((a) => a.id === ag.pick) ?? av.find((a) => a.id === ag.defaultId) ?? av[0] ?? null;
}

function disconnectAgentLog() { ag.es?.close(); ag.es = null; ag.esFor = null; }
function connectAgentLog(id) {
  if (ag.esFor === id) return;
  disconnectAgentLog();
  const pre = $('#agent-log');
  if (!pre) return;
  const src = new EventSource(`/api/prototypes/${enc(id)}/agent/logs/stream?tail=200`);
  ag.es = src; ag.esFor = id;
  src.onopen = () => { pre.textContent = ''; };
  src.onmessage = (ev) => {
    const l = JSON.parse(ev.data);
    const atBottom = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 30;
    const d = new Date(l.ts);
    const span = document.createElement('span');
    span.className = `ln ${l.stream}`;
    span.innerHTML = `<span class="ts">${Number.isNaN(d.getTime()) ? '' : d.toTimeString().slice(0, 8)}</span>`;
    span.append(l.line);
    pre.appendChild(span);
    while (pre.childNodes.length > 1000) pre.removeChild(pre.firstChild);
    if (atBottom) pre.scrollTop = pre.scrollHeight;
  };
}

/** Daftar agent lokal (dicek di daemon). force = cek ulang (mis. setelah install agent baru). */
function loadAgents(force = false) {
  if (ag.loading && !force) return ag.loading;
  ag.loading = api('GET', `/api/agents${force ? '?refresh=1' : ''}`)
    .then((d) => { ag.agents = d.agents; ag.defaultId = d.default; })
    .catch(() => {})
    .finally(() => { ag.loading = null; ag.lastHtml = ''; renderAgent(); cm.lastHtml = ''; renderComments(); if ($('#dlg-agents').open) renderAgentsDialog(); if (!ui.selected) renderMain(); });
  return ag.loading;
}

async function loadAgent() {
  const id = cm.id;
  if (!id) return;
  if (!ag.agents && !ag.loading) loadAgents();
  try {
    const cur = pickedAgent();
    const st = await api('GET', `/api/prototypes/${enc(id)}/agent${cur ? `?agent=${enc(cur.id)}` : ''}`);
    if (cm.id !== id) return;
    const wasRunning = ag.state?.running;
    ag.state = st;
    if (wasRunning && !st.running) agentFinished(st.run);
    else if (!!wasRunning !== !!st.running) { cm.lastHtml = ''; renderComments(); }
  } catch { /* abaikan; dicoba lagi saat polling */ }
  renderAgent();
}

function agentFinished(run) {
  const p = byId(cm.id);
  const name = agentName(run?.agent ?? 'claude');
  if (run?.status === 'done') toast(run.summary ? `${name} selesai: ${run.summary.slice(0, 140)}${run.summary.length > 140 ? '…' : ''}` : `${name} selesai`);
  else if (run?.status === 'stopped') toast(`${name} dihentikan`);
  else toast(`${name} gagal: ${run?.error ?? 'lihat log agent'}`, true);
  if (p && isDs(p) && run?.checkpoint?.changes?.length) {
    // Perubahan di desain sistem: perbarui status pemakai, lalu ingatkan untuk meninjau & menyebarkan.
    loadDesignSystems().then(() => {
      const stale = (ds.list?.find((x) => x.id === p.id)?.consumers ?? []).filter((c) => c.outdated);
      if (stale.length) toast(`Desain sistem berubah. Tinjau katalog, lalu Sebarkan ke ${stale.length} prototype (${stale.map((c) => c.id).join(', ')}).`);
      ag.lastHtml = ''; renderAgent(); render();
    });
  }
  cm.lastHtml = '';
  loadComments();
  refresh(true);
  // Static tanpa live-reload tidak memuat ulang sendiri: muat ulang pratinjau agar perubahan langsung terlihat.
  const live = p?.manifest?.static?.inject !== false && p?.manifest?.static?.liveReload !== false;
  if (p?.type === 'static' && p.status === 'running' && !live) { previewNonce++; render(); }
}

function ago(iso) {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return s < 60 ? `${s} dtk lalu` : s < 3600 ? `${Math.round(s / 60)} mnt lalu` : `${Math.round(s / 3600)} jam lalu`;
}

function renderAgent() {
  const bar = $('#agent-bar');
  const pre = $('#agent-log');
  if (!bar) return;
  const st = ag.state;
  const cur = pickedAgent();
  const gear = `<button type="button" class="icon-btn" data-act="agent-list" title="Agent lokal: cek agent yang tersedia">${ICON.gear}</button>`;
  let html = '';
  if (st?.running) {
    const r = st.run;
    html = `<span class="agent-dot"></span><b>${esc(agentName(r?.agent))} sedang bekerja…</b><span class="muted">${r?.commentIds?.length ? r.commentIds.join(', ') : 'semua komentar'}${r?.resumed ? ' · lanjut sesi' : ''} · ${ago(r.startedAt)}</span>${agentDsHtml(false)}
      <span class="spacer"></span>
      <button type="button" class="btn sm ghost" data-act="agent-log-toggle">${ag.open ? 'Tutup log' : 'Log'}</button>
      <button type="button" class="btn sm" data-act="agent-stop">Stop</button>`;
  } else if (ag.agents && !cur) {
    html = `<span class="muted agent-na">${ICON.spark} Belum ada agent coding yang terdeteksi (Claude Code, Codex, Gemini CLI, Copilot CLI).</span>
      <span class="spacer"></span><button type="button" class="btn sm" data-act="agent-list">Cek agent</button>`;
  } else if (cur) {
    const waiting = cm.data?.counts ? cm.data.counts.open - cm.data.counts.waitingUser : 0;
    const r = st?.run;
    const av = availableAgents();
    const lastTxt = r ? `${r.status === 'done' ? '✓ selesai' : r.status === 'stopped' ? 'dihentikan' : '✗ gagal'} (${esc(agentName(r.agent))}) ${ago(r.endedAt ?? r.startedAt)}` : '';
    const menu = `<div class="agent-menu" id="agent-menu" role="listbox" aria-label="Pilih agent" ${ag.menuOpen ? '' : 'hidden'}>
        <div class="agent-menu-title">Kerjakan dengan</div>
        ${av.map((a) => `<button type="button" role="option" class="agent-opt" data-pick="${esc(a.id)}" aria-selected="${a.id === cur.id}">
          ${agentLogo(a.id)}
          <span class="agent-opt-t"><b>${esc(a.name)}</b><small>${esc(a.version ?? '')}</small></span>
          ${a.support === 'tested' ? '<span class="agent-tested">teruji</span>' : '<span class="agent-exp">eksperimental</span>'}
          <span class="agent-opt-check">${a.id === cur.id ? '✓' : ''}</span>
        </button>`).join('')}
        <button type="button" class="agent-menu-foot" data-act="agent-list">${ICON.gear}Kelola agent lokal…</button>
      </div>`;
    html = `<div class="agent-split ${waiting ? '' : 'idle'}" style="--ac:${AGENT_COLOR[cur.id] ?? 'var(--accent)'}">
        <button type="button" class="agent-split-main" data-act="agent-run" ${waiting ? '' : 'disabled'} title="${waiting ? `Jalankan ${esc(cur.name)} untuk ${waiting} komentar yang menunggu agent` : 'Tidak ada komentar yang menunggu agent'}">${ICON.spark}<span>Kerjakan</span></button>
        <button type="button" class="agent-split-pick" data-act="agent-menu" aria-haspopup="listbox" aria-expanded="${!!ag.menuOpen}" title="Pilih agent">
          ${agentLogo(cur.id)}<span class="agent-split-name">${esc(cur.name)}</span>${ICON.chev}
        </button>
        ${menu}
      </div>
      ${resumeHtml(st, cur)}
      <span class="muted">${waiting ? `${waiting} menunggu agent` : 'tidak ada yang menunggu agent'}${lastTxt ? ` · terakhir: ${lastTxt}` : ''}</span>${agentDsHtml(true)}
      <span class="spacer"></span>
      ${undoHtml(r)}
      ${r ? `<button type="button" class="btn sm ghost" data-act="agent-log-toggle">${ag.open ? 'Tutup log' : 'Log'}</button>` : ''}${gear}`;
  }
  bar.hidden = !html;
  // Jangan render ulang saat menu terbuka (teks "x dtk lalu" berubah tiap polling) agar menu & fokus tidak hilang.
  if (html !== ag.lastHtml && !(ag.menuOpen && bar.contains(document.activeElement))) { bar.innerHTML = html; ag.lastHtml = html; }
  const showLog = ag.open && !!st;
  pre.hidden = !showLog;
  if (showLog) connectAgentLog(cm.id); else disconnectAgentLog();
}

/**
 * Di desain sistem: tunjukkan dampaknya (jumlah pemakai) dan, bila ada salinan yang tertinggal,
 * tombol Sebarkan — alur "agent mengubah token → tinjau katalog → sebarkan".
 */
function agentDsHtml(withSync) {
  const p = byId(cm.id);
  if (!p || !isDs(p)) return '';
  const users = ds.list?.find((x) => x.id === p.id)?.consumers ?? [];
  if (!users.length) return '';
  const stale = users.filter((c) => c.outdated);
  const note = `<span class="agent-ds" title="Perubahan token/komponen sampai ke prototype pemakai setelah disebarkan: ${esc(users.map((c) => c.id).join(', '))}">◇ dipakai ${users.length} prototype</span>`;
  const sync = withSync && stale.length && LOCAL
    ? ` <button type="button" class="btn sm" data-act="ds-sync" data-id="${esc(p.id)}" title="Tinjau katalog dulu, lalu salin ulang ke: ${esc(stale.map((c) => c.id).join(', '))}" ${ui.busy.has(`ds:${p.id}`) ? 'disabled' : ''}>${ICON.restart}Sebarkan ke ${stale.length}</button>` : '';
  return ` ${note}${sync}`;
}

/** Tombol lanjut sesi: tampil bila agent terpilih bisa melanjutkan sesi run sebelumnya. Klik = sesi baru untuk run berikutnya. */
function resumeHtml(st, cur) {
  const rs = st?.resume;
  if (!rs?.resumable || rs.agent !== cur?.id || !rs.session) return '';
  const fresh = ag.fresh.has(cm.id);
  const s = rs.session;
  const title = fresh
    ? 'Run berikutnya memulai sesi baru (agent tidak mengingat run sebelumnya). Klik untuk melanjutkan sesi.'
    : `Run berikutnya melanjutkan sesi sebelumnya (${s.runs} run, terakhir ${ago(s.endedAt)}): agent ingat apa yang sudah dilihat & diubahnya. Klik untuk memulai sesi baru.`;
  return `<button type="button" class="agent-resume${fresh ? ' fresh' : ''}" data-act="agent-resume" aria-pressed="${!fresh}" title="${esc(title)}">${fresh ? '✦ Sesi baru' : `↻ Lanjutkan sesi · ${s.runs} run`}</button>`;
}

async function runAgent(commentIds) {
  const id = cm.id;
  const cur = pickedAgent();
  if (!id || !cur) return;
  const p = byId(id);
  const users = p && isDs(p) ? (ds.list?.find((x) => x.id === id)?.consumers ?? []) : [];
  if (users.length && !ds.warned.has(id)) {
    const yes = await confirmDialog({
      title: `${p.name} adalah desain sistem`,
      body: `Perubahan token/komponen di sini nantinya berdampak ke ${users.length} prototype di bawah. Prototype pemakai tidak berubah sampai Anda menekan Sebarkan, jadi tinjau katalog dulu setelah agent selesai.`,
      list: users.map((c) => `${c.name} (${c.id})`),
      ok: 'Kerjakan',
      tone: 'primary',
    });
    if (!yes) return;
    ds.warned.add(id);
  }
  try {
    const fresh = ag.fresh.has(id);
    const st = await api('POST', `/api/prototypes/${enc(id)}/agent/run`, { agent: cur.id, ...(commentIds ? { commentIds } : {}), ...(fresh ? { resume: false } : {}) });
    ag.fresh.delete(id);
    ag.state = { ...(ag.state ?? {}), running: true, run: st.run };
    ag.open = true;
    toast(`${cur.name} mulai mengerjakan ${commentIds ? commentIds.join(', ') : 'komentar'}`);
    cm.lastHtml = ''; renderComments();
  } catch (err) {
    toast(err.message, true);
  }
  renderAgent();
}

const CHANGE_LABEL = { added: 'baru', modified: 'diubah', deleted: 'dihapus' };
const changeList = (changes) => changes.map((c) => `${c.path}  (${CHANGE_LABEL[c.status] ?? c.status})`);

/** Tombol Batalkan untuk run terakhir yang mengubah file (checkpoint). */
function undoHtml(r) {
  const cp = r?.checkpoint;
  if (!cp?.changes?.length) return '';
  const n = cp.changes.length;
  if (cp.undoneAt) return `<span class="muted agent-undone">perubahan ${n} file dibatalkan</span>`;
  if (!EDIT) return '';
  const tip = changeList(cp.changes.slice(0, 15)).join('\n') + (n > 15 ? `\n… +${n - 15}` : '');
  return `<button type="button" class="btn sm ghost" data-act="agent-undo" title="${esc(`Kembalikan ${n} file ke keadaan sebelum agent bekerja:\n${tip}`)}">${ICON.undo}Batalkan (${n} file)</button>`;
}

async function undoAgent() {
  const id = cm.id;
  const r = ag.state?.run;
  const changes = r?.checkpoint?.changes ?? [];
  if (!id || !changes.length) return;
  const yes = await confirmDialog({
    title: `Batalkan perubahan ${agentName(r.agent)}?`,
    body: `${changes.length} file dikembalikan ke keadaan sebelum agent bekerja; file baru buatan agent dihapus. Komentar yang dikerjakan agent diberi balasan bahwa perubahannya dibatalkan.`,
    list: changeList(changes),
    ok: 'Batalkan perubahan',
  });
  if (!yes) return;
  const send = (force) => api('POST', `/api/prototypes/${enc(id)}/agent/undo`, force ? { force: true } : undefined);
  try {
    let res;
    try {
      res = await send(false);
    } catch (err) {
      if (err.code !== 'CONFLICT' || !err.details?.length) throw err;
      const again = await confirmDialog({
        title: 'File sudah diubah lagi',
        body: 'File berikut sudah berubah setelah agent selesai (mungkin Anda edit). Membatalkan tetap akan menimpa perubahan itu.',
        list: err.details,
        ok: 'Timpa & batalkan',
      });
      if (!again) return;
      res = await send(true);
    }
    toast(`Perubahan dibatalkan: ${res.restored.length} file dikembalikan${res.removed.length ? `, ${res.removed.length} file baru dihapus` : ''}${res.comments?.length ? ` · dicatat di ${res.comments.join(', ')}` : ''}`);
    cm.lastHtml = '';
    loadComments();
    const p = byId(id);
    const live = p?.manifest?.static?.inject !== false && p?.manifest?.static?.liveReload !== false;
    if (p?.type === 'static' && p.status === 'running' && !live) { previewNonce++; render(); }
  } catch (err) {
    toast(err.message, true);
  }
  loadAgent();
}

async function stopAgent() {
  const id = cm.id;
  if (!id) return;
  try { await api('POST', `/api/prototypes/${enc(id)}/agent/stop`); } catch (err) { toast(err.message, true); }
  loadAgent();
}

// Dialog "Agent lokal"
function openAgentsDialog() {
  const d = $('#dlg-agents');
  renderAgentsDialog();
  if (!d.open) d.showModal();
  if (!ag.agents) loadAgents();
}
function renderAgentsDialog() {
  const list = $('#agents-list');
  if (!ag.agents) { list.innerHTML = '<p class="muted">Memeriksa…</p>'; return; }
  const cur = pickedAgent();
  list.innerHTML = ag.agents.map((a) => `
    <div class="agent-row ${a.available ? 'ok' : 'na'}">
      <div class="agent-row-head">
        ${agentLogo(a.id)}
        <b>${esc(a.name)}</b>
        <span class="agent-st">${a.available ? '✓' : ''}</span>
        ${a.support === 'tested' ? '<span class="agent-tested">teruji</span>' : '<span class="agent-exp">eksperimental</span>'}
        ${cur?.id === a.id ? '<span class="agent-cur">dipakai</span>' : ''}
        <span class="spacer"></span>
        ${a.available && EDIT && cur?.id !== a.id ? `<button type="button" class="btn sm ghost" data-pick-agent="${esc(a.id)}">Pakai</button>` : ''}
      </div>
      <div class="agent-row-body">
        ${a.available ? `<span>${esc(a.version ?? '')}</span>` : `<span>${esc(a.error ?? 'tidak tersedia')}</span>`}
        ${a.path ? `<code>${esc(a.path)}</code>` : ''}
        ${a.available ? `<span class="muted">Izin: ${esc(a.permissions)}</span>` : `<span class="muted">Cara install: ${esc(a.install)}</span>`}
      </div>
    </div>`).join('');
}
$('#agents-refresh').addEventListener('click', async (e) => {
  const b = e.currentTarget;
  b.disabled = true;
  $('#agents-list').innerHTML = '<p class="muted">Memeriksa ulang…</p>';
  ag.agents = null;
  await loadAgents(true);
  b.disabled = false;
});
$('#agents-list').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pick-agent]');
  if (!b) return;
  setAgentPick(b.dataset.pickAgent);
  renderAgentsDialog();
});
$$('#dlg-agents [data-close]').forEach((b) => b.addEventListener('click', () => $('#dlg-agents').close()));
function setAgentPick(id) {
  ag.pick = id;
  writePref('prototyper:agent', id);
  ag.lastHtml = '';
  renderAgent();
  cm.lastHtml = ''; renderComments();
}
// Menu pilih agent (split button)
const AGENT_COLOR = { claude: '#d97757', codex: '#10a37f', gemini: '#4285f4', copilot: '#8957e5' };
const AGENT_INITIAL = { claude: 'C', codex: 'X', gemini: 'G', copilot: 'P' };
function agentLogo(id) {
  return `<span class="agent-logo" style="--lc:${AGENT_COLOR[id] ?? 'var(--accent)'}" aria-hidden="true">${AGENT_INITIAL[id] ?? '?'}</span>`;
}
function setMenu(open, focusSel = true) {
  ag.menuOpen = open;
  const m = $('#agent-menu');
  const btn = $('.agent-split-pick');
  if (!m || !btn) return;
  m.hidden = !open;
  btn.setAttribute('aria-expanded', String(open));
  if (open && focusSel) (m.querySelector('[aria-selected="true"]') ?? m.querySelector('.agent-opt'))?.focus();
  if (!open) { ag.lastHtml = ''; renderAgent(); }
}
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-act="agent-menu"]')) { setMenu(!ag.menuOpen); return; }
  const opt = e.target.closest('#agent-menu [data-pick]');
  if (opt) { setAgentPick(opt.dataset.pick); setMenu(false); $('.agent-split-pick')?.focus(); return; }
  if (ag.menuOpen && !e.target.closest('#agent-menu')) setMenu(false, false);
});
document.addEventListener('keydown', (e) => {
  if (!ag.menuOpen) return;
  const m = $('#agent-menu');
  if (!m) return;
  const items = $$('.agent-opt, .agent-menu-foot', m);
  const i = items.indexOf(document.activeElement);
  // Hentikan propagasi: ↑/↓ juga shortcut global untuk pindah prototype di sidebar.
  if (['Escape', 'ArrowDown', 'ArrowUp', 'Enter', ' ', 'j', 'k'].includes(e.key)) e.stopPropagation();
  if (e.key === 'Escape') { e.preventDefault(); setMenu(false); $('.agent-split-pick')?.focus(); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
  else if (e.key === 'Tab') setMenu(false, false);
}, true);

// ---------- Komentar pada elemen (pratinjau) ----------
// Halaman prototype static memuat /__prototyper/embed.js (disisipkan server static). Skrip itu
// berbicara dengan UI lewat postMessage; origin selalu dicek terhadap URL pratinjau.
const embed = { frame: null, origin: null, page: null, mode: false };

function previewOrigin() {
  const p = byId(ui.selected);
  const u = p && openUrl(p);
  try { return u ? new URL(u).origin : null; } catch { return null; }
}
function sendEmbed(type, data = {}) {
  const f = $('#d-view iframe');
  if (f && embed.origin) f.contentWindow.postMessage({ type, ...data }, embed.origin);
}
function patchBar() { delete last['#d-bar-btns']; renderMain(); updateFabs(); }

function anchorLabel(a) {
  if (a.quote) return `“${a.quote.length > 60 ? `${a.quote.slice(0, 60)}…` : a.quote}”`;
  const t = a.text ? ` · ${a.text.length > 40 ? `${a.text.slice(0, 40)}…` : a.text}` : '';
  return `${a.tag || 'elemen'}${t}`;
}

function setAnchor(anchor, page) {
  cm.anchor = anchor;
  const box = $('#cm-anchor');
  if (!box) return;
  box.hidden = !anchor;
  box.querySelector('.cm-anchor-t').textContent = anchor ? anchorLabel(anchor) : '';
  box.title = anchor ? anchor.selector : '';
  if (!anchor) { sendEmbed('prototyper:clear'); return; }
  if (cm.replyTo) startReply(null);
  if (page) { $('#cm-page').value = page; }
  if (isMobile()) setSheet('cm');
  $('#cm-text').focus();
}

function togglePick() {
  if (!embed.origin) {
    const p = byId(ui.selected);
    return toast(p?.type === 'static'
      ? 'Pratinjau belum siap untuk komentar elemen. Coba muat ulang pratinjau.'
      : 'Komentar elemen baru tersedia untuk prototype static. Untuk prototype ini, tulis komentar per halaman di panel Komentar.', true);
  }
  embed.mode = !embed.mode;
  sendEmbed('prototyper:mode', { on: embed.mode });
  patchBar();
}

function sendPins() {
  if (!embed.origin || !cm.data?.comments) return;
  const pins = cm.data.comments
    .filter((c) => c.status === 'open' && c.anchor && c.page === (embed.page ?? '/'))
    .map((c) => ({ id: c.id, label: c.id.replace(/^c/, ''), selector: c.anchor.selector, waiting: c.waitingFor, title: `${c.id}: ${c.text.slice(0, 80)}` }));
  sendEmbed('prototyper:pins', { pins });
}

function focusAnchor(cid) {
  const c = cm.data?.comments?.find((x) => x.id === cid);
  if (!c?.anchor) return;
  if (!embed.origin) return toast('Jalankan prototype dan tampilkan pratinjau untuk melihat elemennya.', true);
  if (embed.page !== null && c.page !== embed.page) return toast(`Komentar ini ada di halaman ${c.page} (pratinjau sedang di ${embed.page}).`, true);
  sendEmbed('prototyper:focus', { selector: c.anchor.selector });
}

function focusComment(cid) {
  const c = cm.data?.comments?.find((x) => x.id === cid);
  if (c && cm.filter !== 'all' && c.status !== cm.filter) { cm.filter = 'all'; renderComments(); }
  const el = $(`#cm-list article[data-cid="${CSS.escape(cid)}"]`);
  if (!el) return;
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
}

window.addEventListener('message', (e) => {
  const d = e.data;
  if (!d || typeof d !== 'object' || typeof d.type !== 'string' || !d.type.startsWith('prototyper:')) return;
  const f = $('#d-view iframe');
  if (!f || e.source !== f.contentWindow || e.origin !== previewOrigin()) return;
  switch (d.type) {
    case 'prototyper:snapshot': {
      const w = snapWaits.get(d.req);
      if (w) { snapWaits.delete(d.req); w(d); }
      return;
    }
    case 'prototyper:ready':
      embed.origin = e.origin;
      embed.page = typeof d.page === 'string' ? d.page : '/';
      sendEmbed('prototyper:hello');
      if (embed.mode) sendEmbed('prototyper:mode', { on: true });
      updateFabs();
      patchBar();
      sendPins();
      break;
    case 'prototyper:page':
      embed.page = typeof d.page === 'string' ? d.page : '/';
      if (EDIT && !cm.anchor && $('#cm-page')) $('#cm-page').value = embed.page;
      sendPins();
      break;
    case 'prototyper:pick':
      embed.mode = false;
      patchBar();
      if (d.anchor && typeof d.anchor.selector === 'string') setAnchor(d.anchor, typeof d.page === 'string' ? d.page : null);
      break;
    case 'prototyper:mode-off':
      embed.mode = false;
      patchBar();
      break;
    case 'prototyper:pin-click':
      if (isMobile()) setSheet('cm');
      focusComment(String(d.id || ''));
      break;
    case 'prototyper:focus-missing':
      toast('Elemen tidak ditemukan lagi di halaman — mungkin sudah diubah atau dihapus.', true);
      break;
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && embed.mode && !$('dialog[open]')) { embed.mode = false; sendEmbed('prototyper:mode', { on: false }); patchBar(); }
});

// ---------- Desain sistem ----------
// Daftar desain sistem + status salinan di tiap pemakai (GET /api/design-systems). Dimuat saat
// dibutuhkan dan berkala bila ada prototype yang memakai/menjadi desain sistem.
const ds = { list: null, locals: null, tick: 0, dlgFor: null, mode: 'shared', warned: new Set() };
async function loadDesignSystems() {
  try {
    const r = await api('GET', '/api/design-systems');
    ds.list = r.designSystems;
    ds.locals = r.locals ?? [];
    ag.lastHtml = ''; // bar agent menampilkan jumlah pemakai desain sistem
  } catch { /* daemon sedang tidak terjangkau */ }
}
function dsRowHtml(p) {
  const d = p.manifest?.designSystem;
  const dis = ui.busy.has(`ds:${p.id}`) ? 'disabled' : '';
  const b = (act, label, title, icon = '') => LOCAL
    ? ` <button type="button" class="btn sm ghost ds-btn" data-act="${act}" data-id="${esc(p.id)}" title="${esc(title)}" ${dis}>${icon}${label}</button>` : '';
  if (d?.source) {
    const info = ds.list?.find((x) => x.id === p.id);
    if (!info) return '<span class="type-tag ds">desain sistem</span>';
    const stale = info.consumers.filter((c) => c.outdated).length;
    const users = info.consumers.length
      ? `dipakai ${info.consumers.length} prototype${stale ? ` · <span class="ds-stale">${stale} perlu sinkron</span>` : ''}`
      : '<span class="muted">belum dipakai prototype lain</span>';
    const missing = info.missing.length ? `<br><span class="ds-stale">File tidak ditemukan: ${esc(info.missing.join(', '))}</span>` : '';
    return `<span class="type-tag ds">desain sistem</span> ${users}${info.consumers.length ? b('ds-sync', 'Sebarkan', `Salin ulang token & komponen ke semua prototype pemakai (prototyper ds sync ${p.id})`, ICON.restart) : ''}${missing}`;
  }
  if (d?.use) {
    const info = ds.list?.find((x) => x.id === d.use);
    const c = info?.consumers.find((x) => x.id === p.id);
    const name = info
      ? `<button type="button" class="ds-link" data-act="select" data-id="${esc(d.use)}" title="Buka desain sistem">${esc(info.name)}</button>`
      : `<code>${esc(d.use)}</code>${ds.list ? ' <span class="ds-stale">tidak terdaftar</span>' : ''}`;
    const state = c ? (c.outdated ? ' · <span class="ds-stale">perlu sinkron</span>' : ' · <span class="muted">terbaru</span>') : '';
    return `${name} <span class="mono muted">${esc(d.dir ?? 'design-system')}/</span>${state}${c ? b('ds-sync', 'Sinkronkan', `Salin ulang file desain sistem ke prototype ini (prototyper ds sync ${p.id})`, ICON.restart) : ''}${b('ds-use', 'Ubah…', 'Ganti desain sistem atau pakai milik sendiri')}${b('ds-detach', 'Lepas', 'Berhenti memakai desain sistem (file salinan dibiarkan)')}`;
  }
  if (d?.local) {
    const info = ds.locals?.find((x) => x.id === p.id);
    const paths = info?.paths ?? d.local.map((x) => ({ path: x, exists: true }));
    return `<span class="muted">sendiri:</span> ${paths.map((x) => `<span class="mono">${esc(x.path)}</span>${x.exists ? '' : ' <span class="ds-stale" title="Belum ada di folder prototype">tidak ditemukan</span>'}`).join(', ')}${b('ds-use', 'Ubah…', 'Ubah lokasi atau pakai desain sistem bersama')}${b('ds-detach', 'Lepas', 'Berhenti mencatat lokasi desain sistem (file tidak disentuh)')}`;
  }
  return `<span class="muted">—</span>${p.valid ? b('ds-use', 'Atur…', 'Pakai desain sistem bersama, atau catat lokasi desain sistem milik prototype ini') : ''}`;
}
async function dsAction(p, fn) {
  const key = `ds:${p.id}`;
  if (ui.busy.has(key)) return;
  ui.busy.add(key);
  render();
  try { await fn(); } catch (err) { toast(err.message, true); } finally {
    ui.busy.delete(key);
    await loadDesignSystems();
    await refresh(true);
  }
}
function dsSync(p) {
  return dsAction(p, async () => {
    const { results } = await api('POST', `/api/prototypes/${enc(p.id)}/design-system/sync`);
    const failed = results.filter((r) => r.error);
    const changed = results.filter((r) => r.files.some((f) => f.action === 'created' || f.action === 'updated'));
    if (failed.length) toast(`Gagal sinkron: ${failed.map((r) => `${r.id} (${r.error})`).join(', ')}`, true);
    else if (!results.length) toast('Belum ada prototype yang memakai desain sistem ini');
    else toast(changed.length ? `Desain sistem disinkronkan ke: ${changed.map((r) => r.id).join(', ')}` : 'Semua salinan sudah terbaru');
  });
}
async function dsDetach(p) {
  const d = p.manifest?.designSystem ?? {};
  const dir = d.dir ?? 'design-system';
  const ok = await confirmDialog({
    title: `Lepas desain sistem dari ${p.name}?`,
    body: d.local
      ? `Lokasi desain sistem sendiri tidak lagi dicatat di prototyper.json dan AGENTS.md. File-nya tidak disentuh.`
      : `"${d.use}" dihapus dari prototyper.json dan aturannya dari AGENTS.md. Folder ${dir}/ dan tautan CSS-nya dibiarkan agar tampilan tidak berubah; hapus manual bila tidak dipakai.`,
    ok: 'Lepas',
  });
  if (!ok) return;
  return dsAction(p, async () => {
    await api('DELETE', `/api/prototypes/${enc(p.id)}/design-system`);
    toast(d.local ? `Lokasi desain sistem ${p.name} tidak lagi dicatat` : `${p.name} tidak lagi memakai "${d.use}"`);
  });
}
async function openDsDialog(p) {
  if (!LOCAL) return toast(RO_TITLE, true);
  await loadDesignSystems();
  const cur = p.manifest?.designSystem ?? {};
  const opts = (ds.list ?? []).filter((d) => d.id !== p.id);
  ds.dlgFor = p.id;
  $('#ds-form').reset();
  $('#ds-err').hidden = true;
  $('#ds-sub').textContent = `Untuk ${p.name}. Bisa diubah atau dilepas lagi kapan saja.`;
  $('#ds-pick').innerHTML = opts.map((d) => `<option value="${esc(d.id)}">${esc(d.name)} (${esc(d.id)})</option>`).join('');
  if (cur.use && opts.some((d) => d.id === cur.use)) $('#ds-pick').value = cur.use;
  $('#ds-dir').value = cur.use && cur.dir ? cur.dir : '';
  $('#ds-none').hidden = opts.length > 0;
  $('#ds-pick-row').hidden = $('#ds-dir-row').hidden = !opts.length;
  $('#ds-paths').value = (cur.local ?? []).join('\n');
  $('#ds-cands').innerHTML = '';
  setDsMode(cur.local || !opts.length ? 'local' : 'shared');
  $('#dlg-ds').showModal();
  // Tebakan lokasi desain sistem sendiri; klik untuk menambah/menghapus dari daftar.
  api('GET', `/api/prototypes/${enc(p.id)}/design-system/candidates`).then((r) => {
    if (ds.dlgFor !== p.id) return;
    ds.cands = r.candidates;
    renderDsCands();
  }).catch(() => {});
}
const dsPaths = () => $('#ds-paths').value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
function renderDsCands() {
  const c = ds.cands ?? [];
  const on = new Set(dsPaths());
  $('#ds-cands').innerHTML = c.length
    ? `<span class="lbl">Terdeteksi di folder prototype — klik untuk menambah:</span>${c.map((x) => `<button type="button" class="ds-cand" data-path="${esc(x)}" aria-pressed="${on.has(x)}">${esc(x)}</button>`).join('')}`
    : '';
}
function setDsMode(m) {
  ds.mode = m;
  for (const b of $$('#ds-mode button')) b.setAttribute('aria-pressed', String(b.dataset.val === m));
  $('#ds-shared').hidden = m !== 'shared';
  $('#ds-local').hidden = m !== 'local';
  $('#ds-go').disabled = m === 'shared' && !(ds.list ?? []).some((d) => d.id !== ds.dlgFor);
}
$('#ds-mode').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-val]');
  if (b) setDsMode(b.dataset.val);
});
$('#ds-cands').addEventListener('click', (e) => {
  const b = e.target.closest('.ds-cand');
  if (!b) return;
  const cur = dsPaths();
  const x = b.dataset.path;
  $('#ds-paths').value = (cur.includes(x) ? cur.filter((y) => y !== x) : [...cur, x]).join('\n');
  renderDsCands();
});
$('#ds-paths').addEventListener('input', renderDsCands);
$('#ds-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const p = byId(ds.dlgFor);
  if (!p) return $('#dlg-ds').close();
  const go = $('#ds-go');
  go.disabled = true;
  $('#ds-err').hidden = true;
  try {
    if (ds.mode === 'local') {
      const paths = dsPaths();
      if (!paths.length) throw new Error('Isi minimal satu lokasi file/folder desain sistem.');
      const r = await api('PUT', `/api/prototypes/${enc(p.id)}/design-system`, { local: paths });
      $('#dlg-ds').close();
      toast(r.missing.length ? `Dicatat. Belum ada di folder: ${r.missing.join(', ')}` : `${p.name} memakai desain sistem sendiri (${r.local.join(', ')})`, r.missing.length > 0);
    } else {
      const body = { id: $('#ds-pick').value };
      const dir = $('#ds-dir').value.trim();
      if (dir) body.dir = dir;
      const r = await api('PUT', `/api/prototypes/${enc(p.id)}/design-system`, body);
      $('#dlg-ds').close();
      if (r.link.action === 'skipped' && r.link.note) toast(`Desain sistem dipasang. ${r.link.note}`, true);
      else toast(`${p.name} memakai "${r.designSystem}" (${r.dir}/)`);
    }
    await loadDesignSystems();
    refresh(true);
  } catch (err) {
    const el = $('#ds-err');
    el.textContent = err.message;
    el.hidden = false;
  } finally {
    go.disabled = false;
  }
});
// ---------- Ekspor halaman (PNG / JPG / PDF) ----------
// Dirender ulang oleh daemon dengan Edge/Chrome headless (GET /api/prototypes/:id/export) pada
// ukuran jendela pratinjau saat ini, jadi hasilnya sama dengan yang tampil tetapi bisa seluruh halaman.
const ex = {
  id: null,
  format: readPref('prototyper:ex-format', 'png'),
  // Area diingat terpisah: desktop = seluruh halaman; tablet/mobile = bingkai perangkat saja (portrait/landscape)
  areas: { desktop: readPref('prototyper:ex-area-desktop', 'full'), device: readPref('prototyper:ex-area-device', 'view') },
  scale: readPref('prototyper:ex-scale', '2'),
  paper: readPref('prototyper:ex-paper', 'screen'),
  busy: false,
};
const exAreaKey = () => (deviceSize() ? 'device' : 'desktop');
const exArea = () => ex.areas[exAreaKey()];
const canCopyImage = () => window.isSecureContext && 'ClipboardItem' in window && !!navigator.clipboard?.write;
/** Ukuran jendela yang dipakai pratinjau sekarang (px CSS, sebelum diperkecil). */
function exportSize() {
  const sz = deviceSize();
  if (sz) return { ...sz, mobile: true, label: `${DEVICES[ui.device].label} ${ui.landscape ? 'landscape' : 'portrait'}` };
  const f = $('#d-view iframe');
  const w = f?.offsetWidth || DESKTOP_W, h = f?.offsetHeight || 800;
  return { w: Math.max(DESKTOP_MIN, w), h: Math.max(480, h), mobile: false, label: 'Desktop' };
}
function openExport(p) {
  if (!p || p.status !== 'running') return toast('Jalankan prototype dulu untuk mengekspor.', true);
  ex.id = p.id;
  $('#ex-page').value = embed.page ?? cm.pages[p.id] ?? '/';
  $('#ex-err').hidden = true;
  applyExport();
  $('#dlg-export').showModal();
}
function applyExport() {
  const pdf = ex.format === 'pdf';
  const p = byId(ex.id);
  const seg = (sel, v) => { for (const b of $$(`${sel} button`)) b.setAttribute('aria-pressed', String(b.dataset.val === v)); };
  const sz = exportSize();
  const area = exArea();
  const a4 = pdf && ex.paper === 'a4';
  const k = pdf ? 1 : Number(ex.scale);
  const result = a4 ? 'kertas A4'
    : area === 'full' ? `${sz.w * k} px × setinggi halaman`
    : `${sz.w * k}×${sz.h * k} px`;
  $('#ex-sub').textContent = `${p?.name ?? ''} · ${sz.label} ${sz.w}×${sz.h} → hasil ${result}. Ubah ukuran/orientasi lewat tombol perangkat di pratinjau.`;
  seg('#ex-format', ex.format); seg('#ex-area', area); seg('#ex-scale', ex.scale); seg('#ex-paper', ex.paper);
  $('#ex-scale-row').hidden = pdf;
  $('#ex-paper-row').hidden = !pdf;
  $('#ex-area-row').hidden = a4;
  $('#ex-copy').hidden = ex.format !== 'png' || !canCopyImage();
  $('#ex-hint').textContent = [
    pdf && ex.paper === 'a4' ? 'A4 memakai gaya cetak halaman (@media print) dan bisa terbagi beberapa lembar.' : '',
    p?.type === 'command' && embed.page === null ? 'Untuk prototype command, isi path halaman yang ingin diekspor.' : '',
    'Tema, gaya, dan status login ikut seperti di pratinjau; isian form atau dialog yang sedang terbuka tidak ikut.',
  ].filter(Boolean).join(' ');
  for (const b of ['#ex-go', '#ex-copy']) $(b).disabled = ex.busy;
  $('#ex-go').textContent = ex.busy ? 'Mengekspor…' : 'Unduh';
}
$('#ex-area').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-val]');
  if (!b) return;
  const key = exAreaKey();
  ex.areas[key] = b.dataset.val;
  writePref(`prototyper:ex-area-${key}`, b.dataset.val);
  applyExport();
});
for (const [sel, key] of [['#ex-format', 'format'], ['#ex-scale', 'scale'], ['#ex-paper', 'paper']]) {
  $(sel).addEventListener('click', (e) => {
    const b = e.target.closest('button[data-val]');
    if (!b) return;
    ex[key] = b.dataset.val;
    writePref(`prototyper:ex-${key}`, ex[key]);
    applyExport();
  });
}
const snapWaits = new Map();
let snapSeq = 0;
/** Keadaan pratinjau (skema warna, atribut tema, local/sessionStorage kecil) dari embed.js; null bila tak ada embed. */
function previewSnapshot() {
  if (!embed.origin) return Promise.resolve(null);
  const req = ++snapSeq;
  return new Promise((resolve) => {
    const t = setTimeout(() => { snapWaits.delete(req); resolve(null); }, 1000);
    snapWaits.set(req, (d) => { clearTimeout(t); resolve(d); });
    sendEmbed('prototyper:snapshot', { req });
  });
}
/** Skema warna yang diterima iframe pratinjau: mengikuti tema Web UI (color-scheme), atau sistem bila otomatis. */
const uiScheme = () => (ui.theme === 'light' || ui.theme === 'dark' ? ui.theme : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
async function fetchExport() {
  const sz = exportSize();
  const snap = await previewSnapshot();
  const state = snap ? { html: snap.html, body: snap.body, storage: snap.storage, session: snap.session } : null;
  const q = new URLSearchParams({
    format: ex.format,
    path: $('#ex-page').value.trim() || '/',
    width: String(sz.w),
    height: String(sz.h),
    mobile: sz.mobile ? '1' : '0',
    full: exArea() === 'full' ? '1' : '0',
    scale: ex.scale,
    paper: ex.paper,
    scheme: snap?.scheme === 'dark' || snap?.scheme === 'light' ? snap.scheme : uiScheme(),
  });
  if (state) q.set('state', JSON.stringify(state));
  const res = await fetch(`/api/prototypes/${enc(ex.id)}/export?${q}`);
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error?.message ?? `HTTP ${res.status}`);
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? `${ex.id}.${ex.format}`;
  return { blob: await res.blob(), name, truncated: res.headers.get('x-prototyper-truncated') === '1' };
}
function saveBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}
async function runExport(copy) {
  if (ex.busy) return;
  ex.busy = true; $('#ex-err').hidden = true; applyExport();
  try {
    const r = await fetchExport();
    if (copy) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': r.blob })]);
      toast('Gambar disalin; tempel dengan Ctrl+V');
    } else {
      saveBlob(r.blob, r.name);
      toast(`Diunduh: ${r.name}`);
    }
    if (r.truncated) toast('Halaman terlalu panjang; bagian bawah dipotong.', true);
    $('#dlg-export').close();
  } catch (err) {
    $('#ex-err').textContent = err.message;
    $('#ex-err').hidden = false;
  } finally {
    ex.busy = false; applyExport();
  }
}
$('#ex-form').addEventListener('submit', (e) => { e.preventDefault(); runExport(false); });
$('#ex-copy').addEventListener('click', () => runExport(true));
$$('#dlg-export [data-close]').forEach((b) => b.addEventListener('click', () => $('#dlg-export').close()));

$$('#dlg-ds [data-close]').forEach((b) => b.addEventListener('click', () => $('#dlg-ds').close()));

// ---------- Pilih file/folder lewat dialog OS ----------
// Browser tidak bisa memberi path lengkap, jadi daemon (di komputer yang sama) yang membuka dialog
// bawaan sistem lewat POST /api/pick. Dialog bisa muncul di belakang browser bila fokus tertahan.
async function pickFromOs(btn, kind, { title, initial, multiple } = {}) {
  if (!LOCAL) { toast(RO_TITLE, true); return null; }
  if (btn) btn.setAttribute('aria-busy', 'true');
  const t = setTimeout(() => toast('Dialog pilih sudah dibuka — bila tidak terlihat, cek taskbar (mungkin di belakang jendela browser).'), 2500);
  try {
    const r = await api('POST', '/api/pick', { kind, ...(title ? { title } : {}), ...(initial ? { initial } : {}), ...(multiple ? { multiple: true } : {}) });
    return r.cancelled ? null : r.paths;
  } catch (err) {
    toast(err.message, true);
    return null;
  } finally {
    clearTimeout(t);
    if (btn) btn.removeAttribute('aria-busy');
  }
}
const winPath = (s) => /^[a-zA-Z]:[\\/]|^\\\\/.test(s);
const sepOf = (s) => (winPath(s) ? '\\' : '/');
/** Path relatif (pakai "/") bila `abs` berada di dalam `base`; '' bila sama; null bila di luar. */
function relInside(base, abs) {
  const norm = (s) => s.replace(/[\\/]+/g, '/').replace(/\/$/, '');
  const ci = winPath(base);
  const b = norm(base), a = norm(abs);
  const eq = (x, y) => (ci ? x.toLowerCase() === y.toLowerCase() : x === y);
  if (eq(a, b)) return '';
  const pre = a.slice(0, b.length + 1);
  return eq(pre, `${b}/`) ? a.slice(b.length + 1) : null;
}

$('#add-browse').addEventListener('click', async (e) => {
  const cur = $('#add-path').value.trim();
  const paths = await pickFromOs(e.currentTarget, 'folder', { title: 'Pilih folder prototype', ...(cur ? { initial: cur } : {}) });
  if (!paths?.length) return;
  $('#add-path').value = paths[0];
  $('#add-form').requestSubmit(); // langsung periksa folder (langkah berikutnya)
});

// Dialog Baru: folder yang dipilih = folder induk; prototype dibuat di <induk>/<id>.
$('#new-browse').addEventListener('click', async (e) => {
  const paths = await pickFromOs(e.currentTarget, 'folder', { title: 'Pilih folder induk — prototype dibuat di subfolder bernama id', ...(nwParent() ? { initial: nwParent() } : {}) });
  if (!paths?.length) return;
  nw.parent = paths[0];
  newDirFromParent();
  if (!$('#new-id').value.trim()) $('#new-id').focus();
});
function newDirFromParent() {
  if (!nw.parent) return;
  const id = $('#new-id').value.trim();
  $('#new-dir').value = id ? `${nw.parent}${sepOf(nw.parent)}${id}` : nw.parent;
}
$('#new-dir').addEventListener('input', () => { nw.parent = null; }); // diketik manual: jangan diubah lagi

/** Tambahkan path hasil dialog ke daftar lokasi desain sistem sendiri (relatif ke folder prototype). */
async function dsAddLocal(btn, kind) {
  const p = byId(ds.dlgFor);
  if (!p) return;
  const paths = await pickFromOs(btn, kind, { title: kind === 'folder' ? 'Pilih folder desain sistem' : 'Pilih file desain sistem', initial: p.path, multiple: kind === 'file' });
  if (!paths?.length) return;
  const rels = paths.map((x) => relInside(p.path, x));
  const outside = paths.filter((_, i) => !rels[i]);
  const add = rels.filter(Boolean);
  if (add.length) {
    const cur = dsPaths();
    $('#ds-paths').value = [...cur, ...add.filter((x) => !cur.includes(x))].join('\n');
    renderDsCands();
  }
  if (outside.length) toast(`Harus di dalam folder prototype (${p.path}): ${outside.join(', ')}`, true);
}
$('#ds-add-file').addEventListener('click', (e) => dsAddLocal(e.currentTarget, 'file'));
$('#ds-add-folder').addEventListener('click', (e) => dsAddLocal(e.currentTarget, 'folder'));
$('#ds-dir-browse').addEventListener('click', async (e) => {
  const p = byId(ds.dlgFor);
  if (!p) return;
  const paths = await pickFromOs(e.currentTarget, 'folder', { title: 'Pilih folder salinan desain sistem (di dalam folder prototype)', initial: p.path });
  if (!paths?.length) return;
  const rel = relInside(p.path, paths[0]);
  if (!rel) return toast(rel === '' ? 'Pilih subfolder di dalam folder prototype, bukan folder prototype itu sendiri.' : `Harus di dalam folder prototype (${p.path}).`, true);
  $('#ds-dir').value = rel;
});

// ---------- Dialog buat prototype baru ----------
const nw = { template: 'static', workspace: '', dsWorkspace: '' };
/** Folder induk default untuk template terpilih: desain sistem dipisah dari prototype. */
const nwParent = () => (nw.template === 'design-system' ? nw.dsWorkspace || nw.workspace : nw.workspace);

function openNew(template = 'static') {
  if (!LOCAL) return toast(RO_TITLE, true);
  $('#new-form').reset();
  $('#new-err').hidden = true;
  nw.parent = null;
  fillNewDs();
  setTemplate(template);
  $('#dlg-new').showModal();
  $('#new-id').focus();
  loadDesignSystems().then(() => { fillNewDs(); setTemplate(nw.template); });
}
/** Pilihan desain sistem di dialog Baru; pilihan yang sedang dipilih dipertahankan. */
function fillNewDs() {
  const sel = $('#new-ds');
  const cur = sel.value;
  sel.innerHTML = '<option value="">Tanpa desain sistem</option>' + (ds.list ?? []).map((d) => `<option value="${esc(d.id)}">${esc(d.name)} (${esc(d.id)})</option>`).join('');
  sel.value = (ds.list ?? []).some((d) => d.id === cur) ? cur : '';
}
function setTemplate(t) {
  nw.template = t;
  for (const b of $$('#new-tpl button')) b.setAttribute('aria-pressed', String(b.dataset.val === t));
  $('#new-html-row').hidden = t !== 'static';
  $('#new-install-row').hidden = !t.startsWith('vite');
  $('#new-ds-row').hidden = t === 'design-system' || !ds.list?.length;
  newHint();
}
function newHint() {
  const id = $('#new-id').value.trim() || '<id>';
  const base = nwParent();
  const sep = base.includes('\\') ? '\\' : '/';
  $('#new-dir').placeholder = base ? `${base}${sep}${id}` : '';
  $('#new-hint').textContent = nw.template === 'design-system'
    ? 'Dibuat tokens.css (token), components.css (komponen), dan katalog index.html. Prototype lain bisa memakainya lewat pilihan Desain sistem saat dibuat, atau tombol Pakai di panel Detail.'
    : nw.template === 'static'
      ? 'Tanpa impor HTML, dibuat contoh index.html + style.css + app.js.'
      : 'Dijalankan dengan npm run dev (Vite, HMR). npm install bisa memakan waktu sekitar satu menit.';
}
function showNewErr(message, details = []) {
  const el = $('#new-err');
  el.innerHTML = esc(message) + (details.length ? `<ul>${details.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '');
  el.hidden = false;
}
$('#new-tpl').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-val]');
  if (b) setTemplate(b.dataset.val);
});
$('#new-id').addEventListener('input', () => { newHint(); newDirFromParent(); });
$('#new-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const go = $('#new-go');
  const id = $('#new-id').value.trim();
  if (!id) return $('#new-id').focus();
  const body = { id, template: nw.template };
  const name = $('#new-name').value.trim();
  const dir = $('#new-dir').value.trim();
  if (name) body.name = name;
  if (dir) body.dir = dir;
  if (nw.template.startsWith('vite')) body.install = $('#new-install').checked;
  const dsId = $('#new-ds').value;
  if (dsId && nw.template !== 'design-system') body.designSystem = dsId;
  const file = nw.template === 'static' ? $('#new-html').files[0] : null;
  $('#new-err').hidden = true;
  go.disabled = true;
  const label = go.textContent;
  try {
    if (file) body.html = await file.text();
    if (body.install) go.textContent = 'Membuat & npm install…';
    const r = await api('POST', '/api/prototypes/new', body);
    $('#dlg-new').close();
    ui.selected = r.id;
    if (r.install && !r.install.ok) toast(`"${r.id}" dibuat, tetapi npm install gagal (kode ${r.install.exitCode}). Lihat log.`, true);
    else if (r.designSystem?.link?.action === 'skipped' && r.designSystem.link.note) toast(`"${r.id}" dibuat. ${r.designSystem.link.note}`, true);
    else toast(`"${r.id}" dibuat di ${r.path}`);
    if (r.designSystem || r.template === 'design-system') await loadDesignSystems();
    refresh(true);
  } catch (err) {
    showNewErr(err.message, err.details);
  } finally {
    go.disabled = false;
    go.textContent = label;
  }
});
$$('#dlg-new [data-close]').forEach((b) => b.addEventListener('click', () => $('#dlg-new').close()));

// ---------- Palet perintah ----------
let cmdItems = [];
let cmdSel = 0;
function commands() {
  const out = [];
  if (LOCAL) {
    out.push({ ic: '⌂', label: 'Beranda', grp: 'Umum', run: () => select('') });
    out.push({ ic: '+', label: 'Buat prototype baru', grp: 'Umum', run: () => openNew() });
    out.push({ ic: '◇', label: 'Buat desain sistem baru', grp: 'Umum', run: () => openNew('design-system') });
    out.push({ ic: '⇲', label: 'Daftarkan folder yang sudah ada', grp: 'Umum', run: () => openAdd() });
  }
  for (const p of list) {
    out.push({ ic: '→', label: `Buka ${p.name}`, grp: p.id, run: () => select(p.id) });
    if (LOCAL && !p.valid) out.push({ ic: '!', label: `Perbaiki manifest ${p.name}`, grp: p.id, run: () => openManifestEditor(p) });
    if (LOCAL && p.manifest?.designSystem) out.push({ ic: '◇', label: p.manifest.designSystem.source ? `Sebarkan desain sistem ${p.name} ke pemakai` : `Sinkronkan desain sistem ${p.name}`, grp: p.id, run: () => dsSync(p) });
    if (EDIT && p.valid) {
      if (isActive(p)) {
        out.push({ ic: '■', label: `Stop ${p.name}`, grp: p.id, run: () => run('stop', p) });
        out.push({ ic: '↻', label: `Restart ${p.name}`, grp: p.id, run: () => run('restart', p) });
      } else out.push({ ic: '▶', label: `Start ${p.name}`, grp: p.id, run: () => run('start', p) });
    }
    if (openUrl(p)) out.push({ ic: '↗', label: `Buka ${p.name} di tab baru`, grp: p.id, run: () => window.open(openUrl(p), '_blank', 'noopener') });
  }
  out.push({ ic: '◐', label: 'Tema: otomatis / terang / gelap', grp: 'Tampilan', run: () => $('#btn-theme').click() });
  out.push({ ic: '⇤', label: ui.sidePinned ? 'Sidebar: sembunyi otomatis' : 'Sidebar: sematkan', grp: 'Tampilan', run: () => setSidePinned(!ui.sidePinned) });
  out.push({ ic: '⇥', label: ui.panelHidden ? 'Panel kanan: tampilkan' : 'Panel kanan: sembunyikan', grp: 'Tampilan', run: () => setPanelHidden(!ui.panelHidden) });
  if (LOCAL) out.push({ ic: '⏻', label: 'Matikan Prototyper', grp: 'Umum', run: () => confirmShutdown() });
  out.push({ ic: '⇡', label: upd.info?.available ? `Pasang pembaruan Prototyper ${upd.info.latest}` : 'Periksa pembaruan Prototyper', grp: 'Umum', run: () => { openUpdateDialog(); if (!upd.info?.available) loadUpdate(true); } });
  out.push({ ic: '✦', label: 'Agent lokal: cek agent yang tersedia', grp: 'Umum', run: () => openAgentsDialog() });
  if (LOCAL) out.push({ ic: '▯', label: 'Hubungkan HP: edit dari perangkat lain lewat jaringan', grp: 'Umum', run: () => openPhoneDialog() });
  if (LOCAL && list.length) out.push({ ic: '↻', label: 'Sinkronkan petunjuk agent (semua prototype)', grp: 'Umum', run: () => syncAllInstructions() });
  for (const [k, d] of Object.entries(DEVICES)) {
    if (k !== ui.device) out.push({ ic: '▭', label: `Pratinjau: ${d.label}${d.w ? ` (${d.w}×${d.h})` : ''}`, grp: 'Tampilan', run: () => setDevice(k) });
  }
  if (deviceSize()) out.push({ ic: '⟳', label: `Pratinjau: putar ke ${ui.landscape ? 'portrait' : 'landscape'}`, grp: 'Tampilan', run: () => setLandscape(!ui.landscape) });
  const sel = byId(ui.selected);
  if (sel?.status === 'running' && openUrl(sel)) out.push({ ic: '⤓', label: `Ekspor halaman ${sel.name} (PNG / JPG / PDF)`, grp: sel.id, run: () => openExport(sel) });
  out.push({ ic: '▢', label: ui.preview ? 'Sembunyikan pratinjau' : 'Tampilkan pratinjau', grp: 'Tampilan', run: togglePreview });
  return out;
}
function openPalette() {
  const d = $('#dlg-cmd');
  if (!d.open) d.showModal();
  $('#cmd-q').value = '';
  cmdSel = 0;
  renderPalette();
  $('#cmd-q').focus();
}
function renderPalette() {
  const q = $('#cmd-q').value.trim().toLowerCase();
  cmdItems = commands().filter((c) => !q || q.split(/\s+/).every((w) => `${c.label} ${c.grp}`.toLowerCase().includes(w)));
  cmdSel = Math.min(cmdSel, Math.max(0, cmdItems.length - 1));
  $('#cmd-list').innerHTML = cmdItems.length
    ? cmdItems.map((c, i) => `<li role="option" data-i="${i}" aria-selected="${i === cmdSel}"><span class="ic">${c.ic}</span>${esc(c.label)}<span class="grp">${esc(c.grp)}</span></li>`).join('')
    : '<li class="none">Tidak ada perintah yang cocok</li>';
  $('#cmd-list [aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
}
function execCmd(i) { const c = cmdItems[i]; if (!c) return; $('#dlg-cmd').close(); c.run(); }
$('#cmd-q').addEventListener('input', () => { cmdSel = 0; renderPalette(); });
$('#cmd-q').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { cmdSel = Math.min(cmdItems.length - 1, cmdSel + 1); renderPalette(); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { cmdSel = Math.max(0, cmdSel - 1); renderPalette(); e.preventDefault(); }
  else if (e.key === 'Enter') { e.preventDefault(); execCmd(cmdSel); }
});
$('#cmd-list').addEventListener('click', (e) => { const li = e.target.closest('li[data-i]'); if (li) execCmd(Number(li.dataset.i)); });
for (const d of $$('dialog')) d.addEventListener('click', (e) => { if (e.target === d) d.close(); });

// ---------- Perangkat lain (HP) pada mode LAN ----------
// Di HP yang belum dipasangkan: layar kode pairing. Di komputer: dialog QR + daftar perangkat.
function showPairScreen() {
  setAccess('none');
  const el = $('#pair-screen');
  if (!el.hidden) return;
  el.hidden = false;
  $('#ws').hidden = true;
  const q = new URLSearchParams(location.search);
  const msg = q.get('pair-error');
  if (msg) {
    $('#pair-err').textContent = msg;
    $('#pair-err').hidden = false;
    history.replaceState(null, '', location.pathname + location.hash);
  }
  $('#pair-code').focus();
}
$('#pair-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = $('#pair-code').value.replace(/\D/g, '');
  const b = $('#pair-submit');
  b.disabled = true;
  try {
    await api('POST', '/api/devices/pair', { code });
    b.textContent = 'Terhubung ✓ Memuat…';
    // replace() ke URL yang hanya beda hash tidak memuat ulang halaman, jadi reload eksplisit.
    history.replaceState(null, '', `/${location.hash}`);
    location.reload();
  } catch (err) {
    $('#pair-err').textContent = err.message;
    $('#pair-err').hidden = false;
    b.disabled = false;
  }
});

const ph = { pairing: null, err: null, sel: 0, devices: [], paired: null, timer: null };
async function openPhoneDialog() {
  if (!LOCAL) return toast(RO_TITLE, true);
  ph.pairing = null; ph.err = null; ph.sel = 0; ph.paired = null;
  $('#dlg-phone').showModal();
  await loadDevices();
  if (daemonLan === 'all') await newPairing(); else renderPhone();
  clearInterval(ph.timer);
  ph.timer = setInterval(phoneTick, 1000);
}
async function newPairing() {
  try {
    ph.pairing = await api('POST', '/api/devices/pairing');
    ph.err = null; ph.paired = null;
  } catch (err) {
    ph.pairing = null; ph.err = err.message;
  }
  renderPhone();
}
async function loadDevices() {
  try {
    const r = await api('GET', '/api/devices');
    const known = new Set(ph.devices.map((d) => d.id));
    // Kode habis terpakai + perangkat baru muncul = pairing berhasil.
    if (ph.pairing && !r.pairing) {
      ph.paired = r.devices.find((d) => !known.has(d.id)) ?? null;
      if (!ph.paired && ph.pairing.expiresAt > Date.now() + 1500) ph.err = 'Kode dibatalkan karena terlalu sering salah ketik. Buat kode baru.';
      if (ph.paired || ph.err) ph.pairing = null;
    }
    ph.devices = r.devices;
    // Perangkat yang baru terhubung sudah dicabut → kembali ke tampilan kode pairing.
    if (ph.paired && !r.devices.some((d) => d.id === ph.paired.id)) {
      ph.paired = null;
      if (daemonLan === 'all' && !ph.pairing && !ph.err) newPairing();
    }
  } catch (err) {
    ph.err = err.message;
  }
}
let phoneTicks = 0;
async function phoneTick() {
  if (!$('#dlg-phone').open) return;
  if (++phoneTicks % 2 === 0) await loadDevices();
  renderPhone();
}
function renderPhone() {
  const p = ph.pairing;
  let body;
  if (daemonLan !== 'all') {
    body = `<div class="callout warn">Web UI belum terbuka ke jaringan. Nyalakan dari tray: <b>Mode LAN → Web UI + prototype</b>, atau jalankan <code>prototyper shutdown</code> lalu <code>prototyper serve --lan</code>.</div>`;
  } else if (ph.paired) {
    body = `<div class="callout info">✓ <b>${esc(ph.paired.name)}</b> terhubung. Bisa langsung dipakai di HP itu.</div>
      <div><button type="button" class="btn" data-ph="new">Hubungkan perangkat lain</button></div>`;
  } else if (ph.err) {
    body = `<div class="callout err">${esc(ph.err)}</div><div><button type="button" class="btn" data-ph="new">Coba lagi</button></div>`;
  } else if (!p) {
    body = '<p class="muted">Membuat kode…</p>';
  } else {
    const left = Math.max(0, Math.round((p.expiresAt - Date.now()) / 1000));
    const t = p.targets[ph.sel] ?? p.targets[0];
    body = left === 0
      ? `<div class="callout warn">Kode kedaluwarsa.</div><div><button type="button" class="btn primary" data-ph="new">Buat kode baru</button></div>`
      : `<div class="phone-pair">
          <div class="phone-qr">${t.qr}</div>
          <div class="phone-info">
            <p>Pindai QR dengan kamera HP (HP harus di Wi-Fi yang sama), atau buka alamat ini lalu ketik kodenya:</p>
            <code class="phone-url">${esc(t.url.replace(/\/pair\?.*$/, ''))}</code>
            <div class="phone-code" aria-label="Kode pairing">${esc(p.code.slice(0, 3))} ${esc(p.code.slice(3))}</div>
            <p class="muted">Berlaku ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} lagi · sekali pakai</p>
            ${p.targets.length > 1 ? `<p class="muted">Tidak bisa dibuka? Coba alamat lain:</p>
              <div class="seg phone-addrs">${p.targets.map((x, i) => `<button type="button" data-ph-addr="${i}" aria-pressed="${i === ph.sel}">${esc(new URL(x.url).hostname)}</button>`).join('')}</div>` : ''}
          </div>
        </div>`;
  }
  patchEl($('#phone-body'), body);
  patchEl($('#phone-devices'), ph.devices.length
    ? ph.devices.map((d) => `<div class="phone-dev"><span><b>${esc(d.name)}</b><small class="muted">terpasang ${fmtTime(d.createdAt)} · terakhir aktif ${fmtTime(d.lastSeenAt)}</small></span>
        <button type="button" class="btn sm ghost danger" data-ph-revoke="${esc(d.id)}">Cabut</button></div>`).join('')
    : '<p class="muted">Belum ada.</p>');
}
function patchEl(el, html) { if (el.dataset.html !== html) { el.dataset.html = html; el.innerHTML = html; } }
$('#dlg-phone').addEventListener('click', async (e) => {
  const t = e.target.closest('[data-ph],[data-ph-addr],[data-ph-revoke],[data-close]');
  if (!t) return;
  if (t.matches('[data-close]')) return $('#dlg-phone').close();
  if (t.dataset.ph === 'new') return newPairing();
  if (t.dataset.phAddr) { ph.sel = Number(t.dataset.phAddr); return renderPhone(); }
  if (t.dataset.phRevoke) {
    const d = ph.devices.find((x) => x.id === t.dataset.phRevoke);
    const yes = await confirmDialog({ title: `Cabut ${d?.name ?? 'perangkat'}?`, body: 'Perangkat ini tidak bisa lagi membuka atau mengubah apa pun di Prototyper sampai dipasangkan ulang.', ok: 'Cabut' });
    if (!yes) return;
    try { await api('DELETE', `/api/devices/${enc(t.dataset.phRevoke)}`); toast('Akses perangkat dicabut'); } catch (err) { toast(err.message, true); }
    await loadDevices();
    renderPhone();
  }
});
$('#dlg-phone').addEventListener('close', () => {
  clearInterval(ph.timer);
  if (ph.pairing) api('DELETE', '/api/devices/pairing').catch(() => undefined);
  ph.pairing = null;
});
$('#btn-phone').addEventListener('click', () => openPhoneDialog());

// ---------- Mulai ----------
applyTheme();
applySide();
applyPanel();
render();
api('GET', '/api/health')
  .then((h) => {
    nw.workspace = h.workspace ?? ''; nw.dsWorkspace = h.dsWorkspace ?? ''; wn.version = h.version;
    const lanMode = h.lanMode ?? (h.lan ? 'all' : 'off');
    daemonLan = lanMode;
    if (setAccess(h.access ?? (LOCAL_HOST ? 'local' : 'none'))) refresh(true);
    if (ACCESS === 'none') return showPairScreen();
    $('#meta').textContent = `v${h.version}${lanMode === 'all' ? ' · LAN' : lanMode === 'prototypes' ? ' · LAN (prototype)' : ''}${ACCESS === 'device' ? ` · ${h.device ?? 'HP'}` : ''}`;
    $('#meta').title = ACCESS === 'device'
      ? 'Perangkat ini terpasang: bisa berkomentar, menjalankan agent, dan start/stop. Operasi lain hanya dari komputer.'
      : 'Yang baru di versi ini';
    wnMark();
    render();
  })
  .catch(() => undefined);
refresh(true);
setInterval(() => { if (ACCESS !== 'none') refresh(); }, 2000);
loadUpdate();
setInterval(() => loadUpdate(), 60 * 60_000);
