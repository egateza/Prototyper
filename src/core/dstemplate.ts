/**
 * Isi awal template `design-system`: token (tokens.css), komponen (components.css), dan halaman
 * katalog (index.html + catalog.css + catalog.js) yang menampilkan semuanya. Katalog membaca token
 * langsung dari tokens.css, jadi token baru otomatis tampil tanpa mengedit index.html.
 */

const LIGHT: Array<[string, string]> = [
  ['--color-bg', '#ffffff'],
  ['--color-surface', '#f6f7f9'],
  ['--color-surface-2', '#eceef2'],
  ['--color-border', '#d9dde3'],
  ['--color-text', '#16181d'],
  ['--color-text-muted', '#5b6270'],
  ['--color-primary', '#4f46e5'],
  ['--color-primary-hover', '#4338ca'],
  ['--color-on-primary', '#ffffff'],
  ['--color-success', '#15803d'],
  ['--color-warning', '#b45309'],
  ['--color-danger', '#dc2626'],
  ['--color-info', '#0369a1'],
  ['--color-focus', '#6366f1'],
  ['--shadow-sm', '0 1px 2px rgb(16 24 40 / .06)'],
  ['--shadow-md', '0 4px 12px rgb(16 24 40 / .08)'],
  ['--shadow-lg', '0 12px 32px rgb(16 24 40 / .12)'],
];

const DARK: Array<[string, string]> = [
  ['--color-bg', '#0f1115'],
  ['--color-surface', '#171a21'],
  ['--color-surface-2', '#20242d'],
  ['--color-border', '#2c313c'],
  ['--color-text', '#e8eaef'],
  ['--color-text-muted', '#9aa1ae'],
  ['--color-primary', '#818cf8'],
  ['--color-primary-hover', '#a5b4fc'],
  ['--color-on-primary', '#11132a'],
  ['--color-success', '#4ade80'],
  ['--color-warning', '#fbbf24'],
  ['--color-danger', '#f87171'],
  ['--color-info', '#38bdf8'],
  ['--color-focus', '#818cf8'],
  ['--shadow-sm', '0 1px 2px rgb(0 0 0 / .4)'],
  ['--shadow-md', '0 4px 12px rgb(0 0 0 / .45)'],
  ['--shadow-lg', '0 12px 32px rgb(0 0 0 / .5)'],
];

const decl = (xs: Array<[string, string]>, pad: string) => xs.map(([k, v]) => `${pad}${k}: ${v};`).join('\n');

const TOKENS_CSS = `/*
 * Token desain sistem — satu-satunya sumber nilai warna, tipografi, jarak, radius, bayangan, dan gerak.
 * Prototype pemakai mendapat salinan file ini (prototyper ds sync), jadi ubah nilainya DI SINI.
 * Penamaan: --<kategori>-<nama>. Token baru otomatis tampil di halaman katalog (index.html).
 */
:root {
  color-scheme: light dark;

  /* Warna & bayangan (tema terang) */
${decl(LIGHT, '  ')}

  /* Tipografi */
  --font-sans: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  --font-mono: ui-monospace, "Cascadia Code", Consolas, "SF Mono", monospace;
  --text-xs: .75rem;
  --text-sm: .875rem;
  --text-md: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.375rem;
  --text-2xl: 1.75rem;
  --text-3xl: 2.25rem;
  --weight-regular: 400;
  --weight-medium: 500;
  --weight-bold: 650;
  --leading-tight: 1.25;
  --leading-normal: 1.5;

  /* Jarak (kelipatan 4px) */
  --space-1: .25rem;
  --space-2: .5rem;
  --space-3: .75rem;
  --space-4: 1rem;
  --space-5: 1.5rem;
  --space-6: 2rem;
  --space-7: 2.5rem;
  --space-8: 3rem;

  /* Radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 999px;

  /* Gerak */
  --duration-fast: 120ms;
  --duration-normal: 200ms;
  --ease-standard: cubic-bezier(.2, 0, 0, 1);
}

/* Tema gelap: mengikuti sistem, atau paksa dengan <html data-theme="dark|light"> */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${decl(DARK, '    ')}
  }
}
:root[data-theme="dark"] {
${decl(DARK, '  ')}
}
:root[data-theme="light"] { color-scheme: light; }
:root[data-theme="dark"] { color-scheme: dark; }
`;

const COMPONENTS_CSS = `/*
 * Komponen dasar desain sistem. Hanya memakai token dari tokens.css (var(--…)), tanpa nilai mentah.
 * Setiap komponen/varian di sini harus punya contoh di halaman katalog (index.html).
 */

/* ---------- Dasar ---------- */
*, *::before, *::after { box-sizing: border-box; }
body {
  margin: 0;
  font-family: var(--font-sans);
  font-size: var(--text-md);
  line-height: var(--leading-normal);
  color: var(--color-text);
  background: var(--color-bg);
}
h1, h2, h3, h4 { line-height: var(--leading-tight); font-weight: var(--weight-bold); margin: 0 0 var(--space-3); }
h1 { font-size: var(--text-3xl); }
h2 { font-size: var(--text-2xl); }
h3 { font-size: var(--text-xl); }
h4 { font-size: var(--text-lg); }
p { margin: 0 0 var(--space-3); }
a { color: var(--color-primary); }
code, kbd, pre { font-family: var(--font-mono); font-size: .9em; }
:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
.text-muted { color: var(--color-text-muted); }

/* ---------- Tombol ---------- */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  font: inherit; font-size: var(--text-sm); font-weight: var(--weight-medium); line-height: var(--leading-tight);
  color: var(--color-text); background: var(--color-surface);
  border: 1px solid var(--color-border); border-radius: var(--radius-md);
  cursor: pointer; text-decoration: none;
  transition: background var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard);
}
.btn:hover { background: var(--color-surface-2); }
.btn:disabled { opacity: .5; cursor: not-allowed; }
.btn-primary { color: var(--color-on-primary); background: var(--color-primary); border-color: var(--color-primary); }
.btn-primary:hover { background: var(--color-primary-hover); border-color: var(--color-primary-hover); }
.btn-ghost { background: transparent; border-color: transparent; }
.btn-ghost:hover { background: var(--color-surface); }
.btn-danger { color: var(--color-danger); border-color: var(--color-danger); background: transparent; }
.btn-sm { padding: var(--space-1) var(--space-3); font-size: var(--text-xs); }
.btn-lg { padding: var(--space-3) var(--space-5); font-size: var(--text-md); }

/* ---------- Formulir ---------- */
.field { display: grid; gap: var(--space-1); margin-bottom: var(--space-4); }
.field > label, .label { font-size: var(--text-sm); font-weight: var(--weight-medium); }
.field .hint { font-size: var(--text-xs); color: var(--color-text-muted); }
.field .error { font-size: var(--text-xs); color: var(--color-danger); }
.input, .select, .textarea {
  width: 100%; padding: var(--space-2) var(--space-3);
  font: inherit; font-size: var(--text-sm); color: var(--color-text);
  background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-md);
}
.input:focus, .select:focus, .textarea:focus { outline: none; border-color: var(--color-focus); box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-focus) 25%, transparent); }
.input[aria-invalid="true"] { border-color: var(--color-danger); }
.check { display: inline-flex; align-items: center; gap: var(--space-2); font-size: var(--text-sm); }

/* ---------- Kartu ---------- */
.card {
  padding: var(--space-5); background: var(--color-bg);
  border: 1px solid var(--color-border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm);
}
.card-title { font-size: var(--text-lg); font-weight: var(--weight-bold); margin: 0 0 var(--space-2); }

/* ---------- Badge ---------- */
.badge {
  display: inline-flex; align-items: center; padding: 0 var(--space-2);
  font-size: var(--text-xs); font-weight: var(--weight-medium); line-height: 1.6;
  color: var(--color-text-muted); background: var(--color-surface-2); border-radius: var(--radius-full);
}
.badge-primary { color: var(--color-primary); background: color-mix(in srgb, var(--color-primary) 14%, transparent); }
.badge-success { color: var(--color-success); background: color-mix(in srgb, var(--color-success) 14%, transparent); }
.badge-warning { color: var(--color-warning); background: color-mix(in srgb, var(--color-warning) 14%, transparent); }
.badge-danger { color: var(--color-danger); background: color-mix(in srgb, var(--color-danger) 14%, transparent); }

/* ---------- Alert ---------- */
.alert {
  padding: var(--space-3) var(--space-4); font-size: var(--text-sm);
  border: 1px solid var(--color-border); border-left-width: 4px; border-radius: var(--radius-md); background: var(--color-surface);
}
.alert-info { border-left-color: var(--color-info); }
.alert-success { border-left-color: var(--color-success); }
.alert-warning { border-left-color: var(--color-warning); }
.alert-danger { border-left-color: var(--color-danger); }

/* ---------- Tabel ---------- */
.table { width: 100%; border-collapse: collapse; font-size: var(--text-sm); }
.table th, .table td { padding: var(--space-2) var(--space-3); text-align: left; border-bottom: 1px solid var(--color-border); }
.table th { font-weight: var(--weight-medium); color: var(--color-text-muted); background: var(--color-surface); }
.table .num { text-align: right; font-variant-numeric: tabular-nums; }
`;

const CATALOG_CSS = `/* Tata letak halaman katalog saja — tidak ikut disalin ke prototype pemakai. */
.cat { max-width: 72rem; margin: 0 auto; padding: var(--space-6) var(--space-4) var(--space-8); }
.cat-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-4); margin-bottom: var(--space-6); }
.cat section { margin-bottom: var(--space-8); }
.cat section > h2 { padding-bottom: var(--space-2); border-bottom: 1px solid var(--color-border); }
.cat h3 { font-size: var(--text-md); color: var(--color-text-muted); margin-top: var(--space-5); }
.cat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr)); gap: var(--space-3); }
.cat-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
.swatch { border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden; font-size: var(--text-xs); }
.swatch i { display: block; height: 3.5rem; border-bottom: 1px solid var(--color-border); }
.swatch b, .swatch span { display: block; padding: 0 var(--space-2); }
.swatch b { padding-top: var(--space-2); font-family: var(--font-mono); font-weight: var(--weight-medium); }
.swatch span { padding-bottom: var(--space-2); color: var(--color-text-muted); }
.tok { display: grid; grid-template-columns: 12rem 1fr; align-items: center; gap: var(--space-3); padding: var(--space-2) 0; border-bottom: 1px dashed var(--color-border); }
.tok code { font-size: var(--text-xs); color: var(--color-text-muted); }
.tok .bar { height: .75rem; background: var(--color-primary); border-radius: var(--radius-sm); }
.tok .box { width: 3rem; height: 3rem; background: var(--color-surface-2); border: 1px solid var(--color-border); }
@media (max-width: 40rem) { .tok { grid-template-columns: 1fr; } }
`;

const CATALOG_JS = `// Tampilkan semua token dari tokens.css. Token baru otomatis muncul; tidak perlu mengedit file ini.
const GROUPS = [
  ['color', 'Warna'], ['font', 'Font'], ['text', 'Ukuran teks'], ['weight', 'Ketebalan'], ['leading', 'Tinggi baris'],
  ['space', 'Jarak'], ['radius', 'Radius'], ['shadow', 'Bayangan'], ['duration', 'Durasi'], ['ease', 'Easing'],
];

function readTokens() {
  const names = new Set();
  for (const sheet of document.styleSheets) {
    if (!sheet.href || !new URL(sheet.href).pathname.endsWith('/tokens.css')) continue; // live-reload menambah ?query
    for (const rule of sheet.cssRules) {
      if (rule.selectorText !== ':root') continue;
      for (const prop of rule.style) if (prop.startsWith('--')) names.add(prop);
    }
  }
  return [...names];
}

function sample(group, name) {
  const v = \`var(\${name})\`;
  switch (group) {
    case 'color': return \`<div class="swatch"><i style="background:\${v}"></i><b>\${name}</b><span data-val="\${name}"></span></div>\`;
    case 'font': return \`<div class="tok"><code>\${name}</code><span style="font-family:\${v}">Pangkas biaya, naikkan margin 0123456789</span></div>\`;
    case 'text': return \`<div class="tok"><code>\${name}</code><span style="font-size:\${v}">Ringkasan penjualan</span></div>\`;
    case 'weight': return \`<div class="tok"><code>\${name}</code><span style="font-weight:\${v}">Ringkasan penjualan</span></div>\`;
    case 'leading': return \`<div class="tok"><code>\${name}</code><span style="line-height:\${v};max-width:24rem">Baris pertama teks contoh yang cukup panjang untuk terbungkus ke baris kedua.</span></div>\`;
    case 'space': return \`<div class="tok"><code>\${name}</code><span class="bar" style="width:\${v}"></span></div>\`;
    case 'radius': return \`<div class="tok"><code>\${name}</code><span class="box" style="border-radius:\${v}"></span></div>\`;
    case 'shadow': return \`<div class="tok"><code>\${name}</code><span class="box" style="box-shadow:\${v};background:var(--color-bg)"></span></div>\`;
    default: return \`<div class="tok"><code>\${name}</code><span data-val="\${name}"></span></div>\`;
  }
}

function render() {
  const tokens = readTokens();
  const used = new Set();
  const html = GROUPS.map(([g, label]) => {
    const xs = tokens.filter((t) => t.startsWith(\`--\${g}-\`));
    xs.forEach((t) => used.add(t));
    if (!xs.length) return '';
    const body = xs.map((t) => sample(g, t)).join('');
    return \`<h3>\${label}</h3>\${g === 'color' ? \`<div class="cat-grid">\${body}</div>\` : body}\`;
  }).join('');
  const rest = tokens.filter((t) => !used.has(t));
  document.querySelector('#tokens').innerHTML = html + (rest.length ? \`<h3>Lainnya</h3>\${rest.map((t) => sample('', t)).join('')}\` : '');
  const cs = getComputedStyle(document.documentElement);
  for (const el of document.querySelectorAll('[data-val]')) el.textContent = cs.getPropertyValue(el.dataset.val).trim();
}

const btn = document.querySelector('#theme');
const THEMES = ['', 'light', 'dark'];
const LABEL = { '': 'Tema: sistem', light: 'Tema: terang', dark: 'Tema: gelap' };
btn.addEventListener('click', () => {
  const now = document.documentElement.dataset.theme ?? '';
  const next = THEMES[(THEMES.indexOf(now) + 1) % THEMES.length];
  if (next) document.documentElement.dataset.theme = next; else delete document.documentElement.dataset.theme;
  btn.textContent = LABEL[next];
  render();
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);
render();
`;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

function indexHtml(name: string): string {
  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(name)} — desain sistem</title>
  <link rel="stylesheet" href="tokens.css">
  <link rel="stylesheet" href="components.css">
  <link rel="stylesheet" href="catalog.css">
</head>
<body>
  <main class="cat">
    <header class="cat-head">
      <div>
        <h1>${esc(name)}</h1>
        <p class="text-muted">Desain sistem: token di <code>tokens.css</code>, komponen di <code>components.css</code>. Halaman ini adalah katalognya.</p>
      </div>
      <button type="button" class="btn btn-sm" id="theme">Tema: sistem</button>
    </header>

    <section id="sec-tokens">
      <h2>Token</h2>
      <div id="tokens"></div>
    </section>

    <section id="sec-typography">
      <h2>Tipografi</h2>
      <h1>Judul 1</h1>
      <h2>Judul 2</h2>
      <h3>Judul 3</h3>
      <h4>Judul 4</h4>
      <p>Paragraf biasa dengan <a href="#">tautan</a> dan <code>kode</code>.</p>
      <p class="text-muted">Teks sekunder (.text-muted).</p>
    </section>

    <section id="sec-buttons">
      <h2>Tombol</h2>
      <div class="cat-row">
        <button type="button" class="btn btn-primary">Simpan</button>
        <button type="button" class="btn">Batal</button>
        <button type="button" class="btn btn-ghost">Lainnya</button>
        <button type="button" class="btn btn-danger">Hapus</button>
        <button type="button" class="btn" disabled>Nonaktif</button>
      </div>
      <h3>Ukuran</h3>
      <div class="cat-row">
        <button type="button" class="btn btn-primary btn-sm">Kecil</button>
        <button type="button" class="btn btn-primary">Normal</button>
        <button type="button" class="btn btn-primary btn-lg">Besar</button>
      </div>
    </section>

    <section id="sec-forms">
      <h2>Formulir</h2>
      <div class="cat-grid" style="grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr))">
        <div class="field">
          <label for="f-name">Nama produk</label>
          <input class="input" id="f-name" placeholder="Beras 5 kg">
          <span class="hint">Nama yang tampil di struk.</span>
        </div>
        <div class="field">
          <label for="f-price">Harga</label>
          <input class="input" id="f-price" value="abc" aria-invalid="true">
          <span class="error">Harga harus berupa angka.</span>
        </div>
        <div class="field">
          <label for="f-cat">Kategori</label>
          <select class="select" id="f-cat"><option>Sembako</option><option>Minuman</option></select>
        </div>
        <div class="field">
          <label for="f-note">Catatan</label>
          <textarea class="textarea" id="f-note" rows="2"></textarea>
        </div>
      </div>
      <label class="check"><input type="checkbox" checked> Tampilkan di kasir</label>
    </section>

    <section id="sec-cards">
      <h2>Kartu, badge &amp; alert</h2>
      <div class="cat-grid" style="grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr))">
        <div class="card">
          <p class="card-title">Penjualan hari ini</p>
          <p class="text-muted">Rp 4.250.000 dari 38 transaksi</p>
          <span class="badge badge-success">+12%</span>
        </div>
        <div class="card">
          <p class="card-title">Stok menipis</p>
          <p class="text-muted">5 produk di bawah batas minimum</p>
          <span class="badge badge-warning">Perlu dicek</span>
        </div>
      </div>
      <h3>Badge</h3>
      <div class="cat-row">
        <span class="badge">Netral</span>
        <span class="badge badge-primary">Baru</span>
        <span class="badge badge-success">Lunas</span>
        <span class="badge badge-warning">Tertunda</span>
        <span class="badge badge-danger">Batal</span>
      </div>
      <h3>Alert</h3>
      <div style="display:grid;gap:var(--space-2)">
        <div class="alert alert-info">Sinkronisasi berjalan di latar.</div>
        <div class="alert alert-success">Transaksi tersimpan.</div>
        <div class="alert alert-warning">Koneksi lambat, data mungkin tertunda.</div>
        <div class="alert alert-danger">Pembayaran gagal diproses.</div>
      </div>
    </section>

    <section id="sec-table">
      <h2>Tabel</h2>
      <table class="table">
        <thead><tr><th>Produk</th><th>Kategori</th><th class="num">Harga</th><th>Status</th></tr></thead>
        <tbody>
          <tr><td>Beras 5 kg</td><td>Sembako</td><td class="num">68.000</td><td><span class="badge badge-success">Tersedia</span></td></tr>
          <tr><td>Minyak 2 L</td><td>Sembako</td><td class="num">36.500</td><td><span class="badge badge-warning">Menipis</span></td></tr>
          <tr><td>Teh botol</td><td>Minuman</td><td class="num">5.000</td><td><span class="badge badge-danger">Habis</span></td></tr>
        </tbody>
      </table>
    </section>
  </main>
  <script src="catalog.js" type="module"></script>
</body>
</html>
`;
}

export function designSystemTemplateFiles(name: string): Record<string, string> {
  return {
    'index.html': indexHtml(name),
    'tokens.css': TOKENS_CSS,
    'components.css': COMPONENTS_CSS,
    'catalog.css': CATALOG_CSS,
    'catalog.js': CATALOG_JS,
  };
}

/** Catatan template untuk AGENTS.md awal desain sistem. */
export const DS_TEMPLATE_NOTES = [
  '- Ini **desain sistem**, bukan prototype fitur. File bersama: `tokens.css` (token) dan `components.css` (komponen); daftar lengkapnya di `designSystem.files` pada `prototyper.json`.',
  '- `index.html` adalah katalog: setiap komponen/varian baru wajib diberi contoh di sana. Token dari `tokens.css` tampil otomatis (`catalog.js`).',
  '- `catalog.css` dan `catalog.js` hanya untuk halaman katalog dan tidak disalin ke prototype pemakai.',
];
