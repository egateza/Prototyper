// Tampilkan semua token dari tokens.css. Token baru otomatis muncul; tidak perlu mengedit file ini.
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
  const v = `var(${name})`;
  switch (group) {
    case 'color': return `<div class="swatch"><i style="background:${v}"></i><b>${name}</b><span data-val="${name}"></span></div>`;
    case 'font': return `<div class="tok"><code>${name}</code><span style="font-family:${v}">Pangkas biaya, naikkan margin 0123456789</span></div>`;
    case 'text': return `<div class="tok"><code>${name}</code><span style="font-size:${v}">Ringkasan penjualan</span></div>`;
    case 'weight': return `<div class="tok"><code>${name}</code><span style="font-weight:${v}">Ringkasan penjualan</span></div>`;
    case 'leading': return `<div class="tok"><code>${name}</code><span style="line-height:${v};max-width:24rem">Baris pertama teks contoh yang cukup panjang untuk terbungkus ke baris kedua.</span></div>`;
    case 'space': return `<div class="tok"><code>${name}</code><span class="bar" style="width:${v}"></span></div>`;
    case 'radius': return `<div class="tok"><code>${name}</code><span class="box" style="border-radius:${v}"></span></div>`;
    case 'shadow': return `<div class="tok"><code>${name}</code><span class="box" style="box-shadow:${v};background:var(--color-bg)"></span></div>`;
    default: return `<div class="tok"><code>${name}</code><span data-val="${name}"></span></div>`;
  }
}

function render() {
  const tokens = readTokens();
  const used = new Set();
  const html = GROUPS.map(([g, label]) => {
    const xs = tokens.filter((t) => t.startsWith(`--${g}-`));
    xs.forEach((t) => used.add(t));
    if (!xs.length) return '';
    const body = xs.map((t) => sample(g, t)).join('');
    return `<h3>${label}</h3>${g === 'color' ? `<div class="cat-grid">${body}</div>` : body}`;
  }).join('');
  const rest = tokens.filter((t) => !used.has(t));
  document.querySelector('#tokens').innerHTML = html + (rest.length ? `<h3>Lainnya</h3>${rest.map((t) => sample('', t)).join('')}` : '');
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
