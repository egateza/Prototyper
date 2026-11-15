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
  install: svg('M12 4v11M7 10l5 5 5-5M5 20h14'),
  trash: svg('M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3', 'fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"'),
  copy: svg('M9 9h10v11H9zM5 15V4h10', 'fill="none" stroke="currentColor" stroke-width="2"'),
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
};

// Request yang mengubah state hanya diterima dari mesin lokal (lihat app.ts).
const LOCAL = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const RO_TITLE = 'Hanya bisa dari mesin lokal';

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
    return !q || [p.id, p.name, p.description, p.path, ...p.tags].join(' ').toLowerCase().includes(q);
  });
}

// ---------- Komponen ----------
const statusHtml = (p) => `<span class="status ${st(p)}" title="${LABEL[st(p)]}"><i class="dot"></i>${LABEL[st(p)]}</span>`;
const avatar = (p, cls = '') => `<span class="mono-av ${cls} ${isActive(p) ? '' : 'off'}" style="--h:${hue(p.id)}">${esc(initials(p))}</span>`;
function btn(act, p, { label, icon, cls = '', title = label, mutating = true, disabled = false }) {
  const ro = mutating && !LOCAL;
  const dis = disabled || ro || ui.busy.has(p.id);
  return `<button type="button" class="btn sm ${cls}" data-act="${act}" data-id="${esc(p.id)}" title="${esc(ro ? RO_TITLE : title)}" ${dis ? 'disabled' : ''}>${icon}${label ? esc(label) : ''}</button>`;
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
  const groups = [
    ['Aktif', vis.filter(isActive)],
    ['Bermasalah', vis.filter(isProblem)],
    ['Berhenti', vis.filter((x) => !isActive(x) && !isProblem(x))],
  ].filter(([, xs]) => xs.length);
  const empty = !loaded ? '' : list.length === 0
    ? '<div class="empty"><b>Belum ada prototype</b>Daftarkan folder pertama Anda.</div>'
    : vis.length === 0 ? '<div class="empty"><b>Tidak ada yang cocok</b>Coba kata kunci lain atau ganti filter.</div>' : '';
  const html = groups.map(([g, xs]) => `<div class="ws-group">${g} · ${xs.length}</div>${xs.map((x) => `
    <button type="button" class="ws-item" data-act="select" data-id="${esc(x.id)}" aria-current="${x.id === ui.selected}">
      ${avatar(x, 'sm')}<span class="t"><b>${esc(x.name)}</b><span>${x.url ? `:${x.port}` : esc(x.id)}</span></span>${x.comments?.open ? `<span class="cm-badge${x.comments.waitingUser ? ' wait' : ''}" title="${x.comments.open} komentar open${x.comments.waitingUser ? `, ${x.comments.waitingUser} menunggu jawaban Anda` : ''}">${x.comments.open}</span>` : ''}${statusHtml(x)}
    </button>`).join('')}`).join('') + empty;
  const home = loaded && list.length ? `<button type="button" class="ws-item ws-home" data-act="select" data-id="" aria-current="${!ui.selected}">
      <span class="home-ic">${ICON.home}</span><span class="t"><b>Beranda</b><span>ringkasan semua prototype</span></span>${totalWaitingUser() ? `<span class="cm-badge wait" title="Komentar menunggu jawaban Anda">${totalWaitingUser()}</span>` : ''}
    </button>` : '';
  const fullHtml = home + html;
  if (fullHtml !== lastSide) { $('#side-list').innerHTML = fullHtml; lastSide = fullHtml; }
  for (const b of $$('#filter button')) b.setAttribute('aria-pressed', String(b.dataset.f === ui.filter));
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
    cm.id = p ? p.id : null; cm.data = null; cm.replyTo = null; cm.lastHtml = ''; cm.anchor = null;
    if (p) { renderComments(); loadComments(); }
    disconnectAgentLog(); ag.state = null; ag.lastHtml = ''; ag.open = false;
    if (p && LOCAL) loadAgent();
    if (key === 'none' && !ag.agents && !ag.loading) loadAgents();
  }
  if (key === 'none') return renderHome();
  if (key === 'whatsnew') return renderWhatsNew();
  if (!p) return;

  patch('#d-head', `${avatar(p)}
    <div class="grow"><h2>${esc(p.name)} ${p.type ? `<span class="type-tag">${p.type}</span>` : ''}</h2>
      <p class="meta">${statusHtml(p)}${uptime(p) ? `<span>· ${uptime(p)}</span>` : ''}</p>
      ${p.description ? `<p class="desc" title="${esc(p.description)}">${esc(p.description)}</p>` : ''}</div>
    <div class="actions">${actionsHtml(p)}</div>`);

  const u = openUrl(p);
  patch('#d-addr', u ? esc(u) : 'tidak berjalan');
  patch('#d-bar-btns', `
    ${ui.preview ? `<span class="dev-seg" role="group" aria-label="Ukuran jendela">${Object.entries(DEVICES).map(([k, d]) =>
      deviceBtn(k, d)).join('')}</span>` : ''}
    ${u && ui.preview && LOCAL && p.status === 'running' ? `<button type="button" class="pick-btn${embed.mode ? ' on' : ''}" data-act="cm-pick" title="Komentari elemen: klik elemen atau blok teks di pratinjau (Esc untuk batal)" aria-pressed="${embed.mode}">${ICON.pick}<span>${embed.mode ? 'Pilih elemen…' : 'Komentari'}</span></button>` : ''}
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
}

function skeleton(p) {
  return `<div class="detail-head" id="d-head"></div>
    <div class="ws-body">
      <div class="col">
        <div class="browser">
          <div class="browser-bar"><span class="dots"><i></i><i></i><i></i></span>
            <span class="addr" id="d-addr"></span><span class="bar-btns" id="d-bar-btns"></span></div>
          <div id="d-view"></div>
        </div>
        <div id="d-err"></div>
        <div class="ws-log">
          <div class="log-tools"><h3 class="section-title">Log</h3><span class="live" id="log-live"><i></i>Live</span><span class="spacer"></span>
            <button type="button" class="btn sm ghost" data-act="clear-log">Bersihkan tampilan</button></div>
          <pre class="log" id="log" data-id="${esc(p.id)}"></pre>
        </div>
      </div>
      <div class="col">
        <section class="cm-panel">
          <div class="log-tools"><h3 class="section-title">Komentar</h3><span class="cm-count" id="cm-count"></span><span class="spacer"></span>
            <div class="seg cm-filter" id="cm-filter">
              <button type="button" data-f="open">Open</button><button type="button" data-f="resolved">Selesai</button><button type="button" data-f="all">Semua</button>
            </div></div>
          ${LOCAL ? '<div class="agent-bar" id="agent-bar" hidden></div><pre class="log agent-log" id="agent-log" hidden></pre>' : ''}
          <div class="cm-list" id="cm-list"><p class="muted cm-empty">Memuat…</p></div>
          ${LOCAL ? `<form class="cm-form" id="cm-form">
            <div class="cm-replying" id="cm-replying" hidden><span></span><button type="button" class="btn sm ghost" data-act="cm-cancel-reply">Batal</button></div>
            <div class="cm-anchor" id="cm-anchor" hidden><span class="cm-anchor-ic">${ICON.pick}</span><span class="cm-anchor-t"></span><button type="button" class="icon-btn" data-act="cm-clear-anchor" title="Lepas elemen">✕</button></div>
            <textarea id="cm-text" rows="2" placeholder="Tulis komentar untuk prototype ini…  (Ctrl+Enter untuk kirim)"></textarea>
            <div class="cm-form-row">
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
  ];
  const editBtn = LOCAL
    ? `<button type="button" class="btn sm ${p.valid ? 'ghost' : 'primary'}" data-act="edit-manifest" data-id="${esc(p.id)}">${p.valid ? 'Edit' : 'Perbaiki manifest'}</button>`
    : '';
  return `<h3 class="section-title">Detail</h3>
    <dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    ${p.tags.length ? `<div class="chips">${p.tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join('')}</div>` : ''}
    <div class="callout info">Untuk agent: <code>prototyper info ${esc(p.id)} --json</code></div>
    <div class="log-tools"><h3 class="section-title">prototyper.json</h3><span class="spacer"></span>${editBtn}</div>
    ${p.manifest ? `<pre class="json">${jsonHtml(p.manifest)}</pre>` : '<p class="muted" style="margin:0">Manifest tidak bisa dibaca.</p>'}`;
}

function render() {
  if (ui.selected && ui.selected !== WHATSNEW && !byId(ui.selected) && loaded) ui.selected = null;
  const hash = ui.selected ? `#${enc(ui.selected)}` : '';
  if (location.hash !== hash) history.replaceState(null, '', hash || location.pathname);
  renderSide();
  renderMain();
}

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
    $('#offline').hidden = true;
    if (ui.shutdown) { ui.shutdown = false; $('#offline').textContent = 'Daemon tidak terjangkau. Mencoba lagi…'; }
    const key = JSON.stringify(next);
    loaded = true;
    if (force || key !== lastKey) { lastKey = key; list = next; }
    render();
    if (cm.id && (force || ++cm.tick % 2 === 0)) loadComments();
    if (cm.id && LOCAL && (force || ag.state?.running || cm.tick % 2 === 0)) loadAgent();
  } catch {
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
function confirmDialog({ title, body, ok }) {
  const d = $('#dlg-confirm');
  $('#cf-title').textContent = title;
  $('#cf-body').textContent = body;
  $('#cf-ok').textContent = ok;
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
    case 'start': case 'stop': case 'restart': case 'install': return run(act, p);
    case 'remove': return p && confirmRemove(p);
    case 'select': return select(id);
    case 'copy':
      navigator.clipboard?.writeText(t.dataset.url).then(() => toast('Disalin'), () => toast('Gagal menyalin', true));
      return;
    case 'clear-log': { const pre = $('#log'); if (pre) pre.textContent = ''; return; }
    case 'toggle-preview': return togglePreview();
    case 'reload-preview': previewNonce++; return render();
    case 'device': return setDevice(t.dataset.dev);
    case 'edit-manifest': return p && openManifestEditor(p);
    case 'sync-instr': return p && syncInstructions(p);
    case 'add': return openAdd();
    case 'new': return openNew();
    case 'agent-run': return runAgent();
    case 'agent-run-one': return runAgent([t.dataset.cid]);
    case 'agent-stop': return stopAgent();
    case 'agent-list': return openAgentsDialog();
    case 'agent-log-toggle': ag.open = !ag.open; return renderAgent();
    case 'cm-pick': return togglePick();
    case 'cm-clear-anchor': return setAnchor(null);
    case 'cm-focus': return focusAnchor(t.dataset.cid);
    case 'cm-reply': return startReply(t.dataset.cid);
    case 'cm-cancel-reply': return startReply(null);
    case 'cm-resolve': return commentAction('resolve', t.dataset.cid);
    case 'cm-reopen': return commentAction('reopen', t.dataset.cid);
    case 'cm-delete': return commentAction('delete', t.dataset.cid);
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

// ---------- Toast ----------
function toast(msg, err = false) {
  const el = document.createElement('div');
  el.className = `toast${err ? ' err' : ''}`;
  el.innerHTML = '<i></i>';
  el.append(msg);
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), err ? 7000 : 3000);
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
  const stat = (n, label, cls = '', sub = '') => `<div class="h-stat ${cls}"><b>${n}</b><span>${label}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
  patch('#h-stats', [
    stat(list.length, 'Prototype', '', problems ? `${problems} bermasalah` : ''),
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
  }
  patch('#h-attn', attn.length ? `<div class="log-tools"><h3 class="section-title">Perlu perhatian</h3></div>
    <div class="h-attn">${attn.map((a) => `<button type="button" class="h-attn-item ${a.cls}" data-act="select" data-id="${esc(a.p.id)}">
      ${avatar(a.p, 'sm')}<span class="t"><b>${esc(a.p.name)}</b><span>${esc(a.text)}</span></span><span class="h-go">Buka →</span></button>`).join('')}</div>` : '');

  $('#h-count').textContent = `${list.length} terdaftar`;
  const order = [...list].sort((a, b) => Number(isActive(b)) - Number(isActive(a)) || Number(isProblem(b)) - Number(isProblem(a)));
  patch('#h-cards', order.map((p) => {
    const u = openUrl(p);
    const c = p.comments ?? { open: 0, waitingUser: 0 };
    const act = isActive(p)
      ? btn('stop', p, { label: 'Stop', icon: ICON.stop })
      : btn('start', p, { label: ui.busy.has(p.id) ? 'Memproses…' : 'Start', icon: ICON.play, cls: 'primary', disabled: !p.valid });
    return `<article class="h-card ${isActive(p) ? 'on' : ''}" data-act="select" data-id="${esc(p.id)}" tabindex="0">
      <div class="h-card-top">${avatar(p)}<div class="t"><b>${esc(p.name)}</b><span>${esc(p.id)}${p.type ? ` · ${p.type}` : ''}</span></div>${statusHtml(p)}</div>
      ${p.description ? `<p class="h-desc">${esc(p.description)}</p>` : ''}
      <div class="h-meta">
        ${u ? `<a href="${esc(u)}" target="_blank" rel="noopener" class="h-url">${esc(u.replace(/^https?:\/\//, '').replace(/\/$/, ''))} ${ICON.ext}</a>` : `<span class="muted">${p.valid ? 'tidak berjalan' : 'tidak valid'}</span>`}
        <span class="spacer"></span>
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
const cm = { id: null, data: null, filter: readPref('prototyper:cm-filter', 'open'), replyTo: null, tick: 0, lastHtml: '', pages: {} };

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
  if (r.answer || c.status !== 'open' || !LOCAL) {
    const chosen = r.answer?.choices ?? [];
    return `<div class="cm-question answered">${head}
      <ul class="cm-opts-done">${r.options.map((o) => `<li class="${chosen.includes(o) ? 'on' : ''}">${chosen.includes(o) ? '✓' : '○'} ${esc(o)}</li>`).join('')}</ul>
      ${r.answer ? '' : `<p class="muted cm-q-none">${c.status === 'open' ? 'Belum dijawab.' : 'Tidak dijawab.'}</p>`}
    </div>`;
  }
  const name = `q-${r.id}`;
  return `<form class="cm-question cm-q" data-cid="${esc(c.id)}" data-qid="${esc(r.id)}">${head}
    <div class="cm-opts" role="${r.multi ? 'group' : 'radiogroup'}">
      ${r.options.map((o) => `<label class="cm-opt"><input type="${type}" name="${esc(name)}" value="${esc(o)}"><span>${esc(o)}</span></label>`).join('')}
    </div>
    <textarea rows="2" placeholder="Catatan untuk jawaban — atau tulis pertanyaan balik tanpa memilih opsi"></textarea>
    <div class="cm-q-row"><span class="muted cm-q-hint"></span><span class="spacer"></span><button type="submit" class="btn primary sm" disabled>Kirim</button></div>
  </form>`;
}

function replyHtml(c, r) {
  if (r.options) return questionHtml(c, r);
  if (r.answerTo) {
    return `<div class="cm-reply cm-answer"><b>${esc(r.author)}</b><span>memilih</span>${(r.choices ?? []).map((x) => `<span class="cm-chip">${esc(x)}</span>`).join('')}<span class="cm-meta">${fmtTime(r.createdAt)}</span>${r.text ? `<p class="cm-text">${esc(r.text)}</p>` : ''}</div>`;
  }
  return `<div class="cm-reply ${r.role === 'agent' ? 'agent' : ''}"><b>${esc(r.author)}</b><span class="cm-meta">${fmtTime(r.createdAt)}</span><p class="cm-text">${esc(r.text)}</p></div>`;
}

function commentHtml(c) {
  const actions = LOCAL ? `<div class="cm-actions">
      ${c.waitingFor === 'agent' && pickedAgent() ? `<button type="button" class="btn sm ghost agent-one" data-act="agent-run-one" data-cid="${esc(c.id)}" title="Minta ${esc(pickedAgent().name)} mengerjakan komentar ini saja" ${ag.state?.running ? 'disabled' : ''}>${ICON.spark}Kerjakan</button>` : ''}
      <button type="button" class="btn sm ghost" data-act="cm-reply" data-cid="${esc(c.id)}">Balas</button>
      ${c.status === 'open'
        ? `<button type="button" class="btn sm ghost" data-act="cm-resolve" data-cid="${esc(c.id)}">✓ Selesai</button>`
        : `<button type="button" class="btn sm ghost" data-act="cm-reopen" data-cid="${esc(c.id)}">Buka lagi</button>`}
      <span class="spacer"></span>
      <button type="button" class="icon-btn" data-act="cm-delete" data-cid="${esc(c.id)}" title="Hapus komentar">${ICON.trash}</button>
    </div>` : '';
  const wait = c.waitingFor ? WAIT[c.waitingFor] : null;
  return `<article class="cm ${c.status}${cm.replyTo === c.id ? ' replying' : ''}${c.waitingFor === 'user' ? ' needs-you' : ''}" data-cid="${esc(c.id)}">
    <header><code>${esc(c.id)}</code><span class="cm-page">${esc(c.page)}</span>${wait ? `<span class="cm-wait ${wait[0]}">${wait[1]}</span>` : ''}<span class="cm-meta">${esc(c.author)} · ${fmtTime(c.createdAt)}</span></header>
    ${c.anchor ? `<button type="button" class="cm-anchor-chip" data-act="cm-focus" data-cid="${esc(c.id)}" title="${esc(c.anchor.selector)}">${ICON.pick}<span>${esc(anchorLabel(c.anchor))}</span></button>` : ''}
    <p class="cm-text">${esc(c.text)}</p>
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
  return st;
}
function restoreQForms(st) {
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
  sendPins();
  if (html !== cm.lastHtml) {
    const st = saveQForms();
    listEl.innerHTML = html;
    cm.lastHtml = html;
    restoreQForms(st);
  }
}

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
  if (!id || !text) return $('#cm-text').focus();
  const send = $('#cm-send');
  send.disabled = true;
  try {
    if (cm.replyTo) {
      await api('POST', `/api/prototypes/${enc(id)}/comments/${enc(cm.replyTo)}/replies`, { text });
      startReply(null);
    } else {
      const page = $('#cm-page').value.trim() || '/';
      cm.pages[id] = page;
      await api('POST', `/api/prototypes/${enc(id)}/comments`, { text, page, ...(cm.anchor ? { anchor: cm.anchor } : {}) });
      setAnchor(null);
      if (cm.filter === 'resolved') { cm.filter = 'open'; writePref('prototyper:cm-filter', 'open'); }
    }
    $('#cm-text').value = '';
    await loadComments();
    refresh(true);
  } catch (err) {
    toast(err.message, true);
  } finally {
    send.disabled = false;
  }
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
const ag = { agents: null, defaultId: 'claude', pick: readPref('prototyper:agent', ''), state: null, lastHtml: '', open: false, es: null, esFor: null, loading: null };

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
    const st = await api('GET', `/api/prototypes/${enc(id)}/agent`);
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
    html = `<span class="agent-dot"></span><b>${esc(agentName(r?.agent))} sedang bekerja…</b><span class="muted">${r?.commentIds?.length ? r.commentIds.join(', ') : 'semua komentar'} · ${ago(r.startedAt)}</span>
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
      <span class="muted">${waiting ? `${waiting} menunggu agent` : 'tidak ada yang menunggu agent'}${lastTxt ? ` · terakhir: ${lastTxt}` : ''}</span>
      <span class="spacer"></span>
      ${r ? `<button type="button" class="btn sm ghost" data-act="agent-log-toggle">${ag.open ? 'Tutup log' : 'Log'}</button>` : ''}${gear}`;
  }
  bar.hidden = !html;
  // Jangan render ulang saat menu terbuka (teks "x dtk lalu" berubah tiap polling) agar menu & fokus tidak hilang.
  if (html !== ag.lastHtml && !(ag.menuOpen && bar.contains(document.activeElement))) { bar.innerHTML = html; ag.lastHtml = html; }
  const showLog = ag.open && !!st;
  pre.hidden = !showLog;
  if (showLog) connectAgentLog(cm.id); else disconnectAgentLog();
}

async function runAgent(commentIds) {
  const id = cm.id;
  const cur = pickedAgent();
  if (!id || !cur) return;
  try {
    const st = await api('POST', `/api/prototypes/${enc(id)}/agent/run`, { agent: cur.id, ...(commentIds ? { commentIds } : {}) });
    ag.state = { ...(ag.state ?? {}), running: true, run: st.run };
    ag.open = true;
    toast(`${cur.name} mulai mengerjakan ${commentIds ? commentIds.join(', ') : 'komentar'}`);
    cm.lastHtml = ''; renderComments();
  } catch (err) {
    toast(err.message, true);
  }
  renderAgent();
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
        ${a.available && LOCAL && cur?.id !== a.id ? `<button type="button" class="btn sm ghost" data-pick-agent="${esc(a.id)}">Pakai</button>` : ''}
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
function patchBar() { delete last['#d-bar-btns']; renderMain(); }

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
    case 'prototyper:ready':
      embed.origin = e.origin;
      embed.page = typeof d.page === 'string' ? d.page : '/';
      sendEmbed('prototyper:hello');
      if (embed.mode) sendEmbed('prototyper:mode', { on: true });
      patchBar();
      sendPins();
      break;
    case 'prototyper:page':
      embed.page = typeof d.page === 'string' ? d.page : '/';
      if (LOCAL && !cm.anchor && $('#cm-page')) $('#cm-page').value = embed.page;
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

// ---------- Dialog buat prototype baru ----------
const nw = { template: 'static', workspace: '' };

function openNew() {
  if (!LOCAL) return toast(RO_TITLE, true);
  $('#new-form').reset();
  $('#new-err').hidden = true;
  setTemplate('static');
  $('#dlg-new').showModal();
  $('#new-id').focus();
}
function setTemplate(t) {
  nw.template = t;
  for (const b of $$('#new-tpl button')) b.setAttribute('aria-pressed', String(b.dataset.val === t));
  $('#new-html-row').hidden = t !== 'static';
  $('#new-install-row').hidden = t === 'static';
  newHint();
}
function newHint() {
  const id = $('#new-id').value.trim() || '<id>';
  const sep = nw.workspace.includes('\\') ? '\\' : '/';
  $('#new-dir').placeholder = nw.workspace ? `${nw.workspace}${sep}${id}` : '';
  $('#new-hint').textContent = nw.template === 'static'
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
$('#new-id').addEventListener('input', newHint);
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
  if (nw.template !== 'static') body.install = $('#new-install').checked;
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
    else toast(`"${r.id}" dibuat di ${r.path}`);
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
    out.push({ ic: '⇲', label: 'Daftarkan folder yang sudah ada', grp: 'Umum', run: () => openAdd() });
  }
  for (const p of list) {
    out.push({ ic: '→', label: `Buka ${p.name}`, grp: p.id, run: () => select(p.id) });
    if (LOCAL && !p.valid) out.push({ ic: '!', label: `Perbaiki manifest ${p.name}`, grp: p.id, run: () => openManifestEditor(p) });
    if (LOCAL && p.valid) {
      if (isActive(p)) {
        out.push({ ic: '■', label: `Stop ${p.name}`, grp: p.id, run: () => run('stop', p) });
        out.push({ ic: '↻', label: `Restart ${p.name}`, grp: p.id, run: () => run('restart', p) });
      } else out.push({ ic: '▶', label: `Start ${p.name}`, grp: p.id, run: () => run('start', p) });
    }
    if (openUrl(p)) out.push({ ic: '↗', label: `Buka ${p.name} di tab baru`, grp: p.id, run: () => window.open(openUrl(p), '_blank', 'noopener') });
  }
  out.push({ ic: '◐', label: 'Tema: otomatis / terang / gelap', grp: 'Tampilan', run: () => $('#btn-theme').click() });
  out.push({ ic: '⇤', label: ui.sidePinned ? 'Sidebar: sembunyi otomatis' : 'Sidebar: sematkan', grp: 'Tampilan', run: () => setSidePinned(!ui.sidePinned) });
  if (LOCAL) out.push({ ic: '⏻', label: 'Matikan Prototyper', grp: 'Umum', run: () => confirmShutdown() });
  out.push({ ic: '✦', label: 'Agent lokal: cek agent yang tersedia', grp: 'Umum', run: () => openAgentsDialog() });
  if (LOCAL && list.length) out.push({ ic: '↻', label: 'Sinkronkan petunjuk agent (semua prototype)', grp: 'Umum', run: () => syncAllInstructions() });
  for (const [k, d] of Object.entries(DEVICES)) {
    if (k !== ui.device) out.push({ ic: '▭', label: `Pratinjau: ${d.label}${d.w ? ` (${d.w}×${d.h})` : ''}`, grp: 'Tampilan', run: () => setDevice(k) });
  }
  if (deviceSize()) out.push({ ic: '⟳', label: `Pratinjau: putar ke ${ui.landscape ? 'portrait' : 'landscape'}`, grp: 'Tampilan', run: () => setLandscape(!ui.landscape) });
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

// ---------- Mulai ----------
applyTheme();
applySide();
render();
api('GET', '/api/health')
  .then((h) => {
    nw.workspace = h.workspace ?? ''; wn.version = h.version;
    $('#meta').textContent = `v${h.version}${h.lan ? ' · LAN' : ''}${LOCAL ? '' : ' · baca saja'}`;
    $('#meta').title = 'Yang baru di versi ini';
    wnMark();
    render();
  })
  .catch(() => undefined);
refresh(true);
setInterval(refresh, 2000);
