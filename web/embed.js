// Prototyper embed — disisipkan ke halaman prototype static oleh Prototyper.
// Diam kecuali halaman dibuka di pratinjau Web UI Prototyper (iframe). Komunikasi lewat postMessage:
//   halaman → UI : prototyper:ready {page}, prototyper:page {page}, prototyper:pick {anchor, page},
//                  prototyper:mode-off, prototyper:pin-click {id}
//   UI → halaman : prototyper:hello, prototyper:mode {on}, prototyper:pins {pins}, prototyper:focus {selector},
//                  prototyper:clear
//
// Live-reload (atribut data-livereload pada tag skrip) aktif juga di luar pratinjau: EventSource ke
// /__prototyper/livereload; event "reload" memuat ulang halaman (posisi scroll dipulihkan), event
// "css" hanya mengganti stylesheet.
(() => {
  if (window.__prototyperEmbed) return;
  window.__prototyperEmbed = true;
  const self = document.currentScript;
  if (self && self.hasAttribute('data-livereload')) liveReload(new URL('/__prototyper/livereload', self.src));
  if (window.parent === window) return;

  const P = '__pt-';
  let parentOrigin = null; // diisi saat UI mengirim hello
  let mode = false;
  let pins = [];
  let picked = null; // elemen yang sedang dipilih (disorot sampai komentar dikirim/dibatalkan)

  const pagePath = () => location.pathname + (location.hash.startsWith('#/') ? location.hash : '');
  const post = (type, data = {}, origin = parentOrigin) => {
    if (origin) window.parent.postMessage({ type, ...data }, origin);
  };

  // ---------- Gaya & elemen overlay ----------
  const style = document.createElement('style');
  style.textContent = `
    .${P}box{position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #6d5dfc;background:rgba(109,93,252,.08);border-radius:4px;transition:all .06s ease-out;display:none}
    .${P}box.${P}picked{border-style:solid;background:rgba(109,93,252,.14);box-shadow:0 0 0 4px rgba(109,93,252,.25)}
    .${P}tag{position:absolute;left:-2px;top:-22px;background:#6d5dfc;color:#fff;font:600 11px/18px system-ui,sans-serif;padding:0 6px;border-radius:4px;white-space:nowrap}
    .${P}hint{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:2147483647;background:#17161f;color:#fff;font:500 12.5px/1.4 system-ui,sans-serif;padding:8px 14px;border-radius:999px;box-shadow:0 6px 24px rgba(0,0,0,.25);pointer-events:none}
    .${P}pin{position:fixed;z-index:2147483645;min-width:22px;height:22px;padding:0 6px;border-radius:11px 11px 11px 2px;background:#6d5dfc;color:#fff;font:700 11px/22px system-ui,sans-serif;text-align:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.25);border:2px solid #fff}
    .${P}pin.${P}user{background:#e8930c}
    .${P}pin:hover{transform:scale(1.12)}
    .${P}flash{outline:3px solid #6d5dfc !important;outline-offset:3px !important;transition:outline-color .3s}
    html.${P}mode, html.${P}mode *{cursor:crosshair !important}
  `;
  const box = document.createElement('div');
  box.className = `${P}box`;
  box.innerHTML = `<span class="${P}tag"></span>`;
  const pickedBox = document.createElement('div');
  pickedBox.className = `${P}box ${P}picked`;
  const hint = document.createElement('div');
  hint.className = `${P}hint`;
  hint.textContent = 'Klik elemen atau blok teks untuk dikomentari · Esc untuk batal';
  hint.style.display = 'none';
  const pinLayer = document.createElement('div');
  const ours = (el) => !!el && (el === box || el === pickedBox || el === hint || pinLayer.contains(el));

  function mount() {
    document.head.appendChild(style);
    document.body.append(box, pickedBox, hint, pinLayer);
  }

  // ---------- Selector & deskripsi elemen ----------
  const esc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/[^\w-]/g, '\\$&'));
  const uniqueId = (el) => el.id && document.querySelectorAll(`#${esc(el.id)}`).length === 1;

  function cssPath(el) {
    if (uniqueId(el)) return `#${esc(el.id)}`;
    const parts = [];
    let n = el;
    while (n && n.nodeType === 1 && n !== document.documentElement) {
      if (n !== el && uniqueId(n)) { parts.unshift(`#${esc(n.id)}`); break; }
      if (n === document.body) { parts.unshift('body'); break; }
      let part = n.localName;
      const testId = n.getAttribute('data-testid');
      if (testId) part += `[data-testid="${testId.replace(/"/g, '\\"')}"]`;
      else {
        const sibs = n.parentElement ? [...n.parentElement.children].filter((s) => s.localName === n.localName) : [];
        if (sibs.length > 1) part += `:nth-of-type(${sibs.indexOf(n) + 1})`;
      }
      parts.unshift(part);
      n = n.parentElement;
    }
    return parts.join(' > ');
  }

  const textOf = (el) => {
    const t = el.localName === 'img' ? el.getAttribute('alt') || '' : el.localName === 'input' || el.localName === 'textarea'
      ? el.getAttribute('placeholder') || el.value || '' : el.innerText || el.textContent || '';
    return t.replace(/\s+/g, ' ').trim().slice(0, 300);
  };
  const label = (el) => {
    const t = textOf(el).slice(0, 30);
    return `${el.localName}${t ? ` · ${t}${textOf(el).length > 30 ? '…' : ''}` : ''}`;
  };

  function anchorFor(el, quote) {
    return { selector: cssPath(el), tag: el.localName, text: textOf(el), ...(quote ? { quote } : {}) };
  }

  // ---------- Sorotan ----------
  function place(b, el) {
    if (!el) { b.style.display = 'none'; return; }
    const r = el.getBoundingClientRect();
    Object.assign(b.style, { display: 'block', left: `${r.left - 2}px`, top: `${r.top - 2}px`, width: `${r.width + 4}px`, height: `${r.height + 4}px` });
  }
  let hovered = null;
  function onMove(e) {
    if (!mode) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || ours(el) || el === document.documentElement || el === document.body) { place(box, null); hovered = null; return; }
    hovered = el;
    place(box, el);
    box.firstChild.textContent = label(el);
  }

  function setMode(on) {
    mode = on;
    document.documentElement.classList.toggle(`${P}mode`, on);
    hint.style.display = on ? 'block' : 'none';
    if (!on) { place(box, null); hovered = null; }
  }

  // Seleksi teks: diperiksa saat mouseup; klik biasa (tanpa seleksi) memilih elemen.
  let selectionPicked = false;
  function onMouseUp(e) {
    if (!mode || ours(e.target)) return;
    e.stopPropagation();
    e.stopImmediatePropagation();
    const sel = window.getSelection();
    const quote = sel && !sel.isCollapsed ? sel.toString().replace(/\s+/g, ' ').trim() : '';
    if (!quote) return;
    let node = sel.getRangeAt(0).commonAncestorContainer;
    if (node.nodeType !== 1) node = node.parentElement;
    selectionPicked = true;
    pick(node, quote.slice(0, 1000));
  }
  function onClick(e) {
    const pin = e.target.closest && e.target.closest(`.${P}pin`);
    if (pin) {
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      post('prototyper:pin-click', { id: pin.dataset.id });
      return;
    }
    if (!mode) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    if (selectionPicked) { selectionPicked = false; return; }
    const el = hovered || document.elementFromPoint(e.clientX, e.clientY);
    if (el && !ours(el)) pick(el, '');
  }
  // Selama mode komentar, handler milik prototype tidak boleh jalan (menu terbuka, form terkirim, dsb.).
  // Aksi bawaan pointer/mouse dibiarkan agar teks tetap bisa diblok: preventDefault pada pointerdown
  // akan membatalkan mousedown/mouseup sehingga seleksi teks tidak terjadi.
  const NO_DEFAULT = new Set(['submit', 'auxclick', 'contextmenu']);
  function block(e) {
    if (!mode || ours(e.target)) return;
    if (NO_DEFAULT.has(e.type)) e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }
  function pick(el, quote) {
    picked = el;
    place(pickedBox, el);
    setMode(false);
    post('prototyper:pick', { anchor: anchorFor(el, quote), page: pagePath() });
  }

  // ---------- Pin ----------
  function findEl(selector) {
    try { return document.querySelector(selector); } catch { return null; }
  }
  function renderPins() {
    pinLayer.innerHTML = '';
    for (const p of pins) {
      const el = findEl(p.selector);
      if (!el) continue;
      const d = document.createElement('div');
      d.className = `${P}pin${p.waiting === 'user' ? ` ${P}user` : ''}`;
      d.dataset.id = p.id;
      d.dataset.sel = p.selector;
      d.textContent = p.label;
      d.title = p.title || p.id;
      pinLayer.appendChild(d);
    }
    positionPins();
  }
  function positionPins() {
    for (const d of pinLayer.children) {
      const el = findEl(d.dataset.sel);
      const r = el && el.getBoundingClientRect();
      if (!r || (r.width === 0 && r.height === 0)) { d.style.display = 'none'; continue; }
      d.style.display = 'block';
      d.style.left = `${Math.min(Math.max(r.right - 12, 2), innerWidth - 30)}px`;
      d.style.top = `${Math.min(Math.max(r.top - 12, 2), innerHeight - 26)}px`;
    }
    if (picked) place(pickedBox, picked.isConnected ? picked : null);
  }

  function focus(selector) {
    const el = findEl(selector);
    if (!el) { post('prototyper:focus-missing', { selector }); return; }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add(`${P}flash`);
    setTimeout(() => el.classList.remove(`${P}flash`), 1600);
  }

  // ---------- Pesan dari Web UI ----------
  window.addEventListener('message', (e) => {
    if (e.source !== window.parent) return;
    const d = e.data;
    if (!d || typeof d.type !== 'string' || !d.type.startsWith('prototyper:')) return;
    if (d.type === 'prototyper:hello') { parentOrigin = e.origin; post('prototyper:page', { page: pagePath() }); return; }
    if (e.origin !== parentOrigin) return;
    switch (d.type) {
      case 'prototyper:mode': setMode(!!d.on); break;
      case 'prototyper:pins': pins = Array.isArray(d.pins) ? d.pins : []; renderPins(); break;
      case 'prototyper:focus': focus(String(d.selector || '')); break;
      case 'prototyper:clear': picked = null; place(pickedBox, null); window.getSelection()?.removeAllRanges(); break;
    }
  });

  // ---------- Navigasi (SPA) ----------
  let lastPage = pagePath();
  function checkPage() {
    const p = pagePath();
    if (p === lastPage) return;
    lastPage = p;
    picked = null; place(pickedBox, null);
    post('prototyper:page', { page: p });
  }
  for (const k of ['pushState', 'replaceState']) {
    const orig = history[k];
    history[k] = function (...args) { const r = orig.apply(this, args); setTimeout(checkPage); return r; };
  }
  addEventListener('popstate', checkPage);
  addEventListener('hashchange', checkPage);

  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mode) { e.preventDefault(); setMode(false); post('prototyper:mode-off'); }
  }, true);
  addEventListener('mousemove', onMove, true);
  addEventListener('mouseup', onMouseUp, true);
  addEventListener('click', onClick, true);
  for (const t of ['pointerdown', 'mousedown', 'pointerup', 'dblclick', 'submit', 'auxclick', 'contextmenu']) addEventListener(t, block, true);
  addEventListener('scroll', positionPins, true);
  addEventListener('resize', positionPins);
  setInterval(positionPins, 700); // tata letak bisa berubah tanpa event (animasi, data dimuat)

  // ---------- Live-reload ----------
  function liveReload(url) {
    const KEY = '__pt-scroll';
    const store = (() => { try { return window.sessionStorage; } catch { return null; } })();
    try {
      const saved = store && JSON.parse(store.getItem(KEY) || 'null');
      if (saved && saved.href === location.href) {
        store.removeItem(KEY);
        const restore = () => window.scrollTo(saved.x || 0, saved.y || 0);
        if (document.readyState === 'complete') restore(); else addEventListener('load', restore, { once: true });
      }
    } catch { /* sessionStorage tidak tersedia */ }

    function reload() {
      try { store && store.setItem(KEY, JSON.stringify({ href: location.href, x: scrollX, y: scrollY })); } catch { /* abaikan */ }
      location.reload();
    }
    function swapCss() {
      const links = [...document.querySelectorAll('link[rel~="stylesheet"][href]')];
      const own = links.filter((l) => { try { return new URL(l.href).origin === location.origin; } catch { return false; } });
      if (!own.length) return reload();
      for (const old of own) {
        const u = new URL(old.href);
        u.searchParams.set('__pt', String(Date.now()));
        const next = old.cloneNode();
        next.href = u.href;
        const done = () => old.remove();
        next.addEventListener('load', done, { once: true });
        next.addEventListener('error', done, { once: true });
        old.after(next);
      }
    }
    if (!window.EventSource) return;
    const es = new EventSource(url);
    es.addEventListener('reload', reload);
    es.addEventListener('css', swapCss);
  }

  function start() {
    mount();
    // Siapa pun induknya boleh tahu halaman ini siap (isinya hanya path); data lain hanya ke origin yang mengirim hello.
    window.parent.postMessage({ type: 'prototyper:ready', page: pagePath() }, '*');
  }
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
