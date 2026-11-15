import { promises as fs } from 'node:fs';
import path from 'node:path';
import { devRunFor } from './detect.js';
import { syncAgentFiles, type AgentFileResult } from './agentfiles.js';
import { AppError } from './errors.js';
import { isDirectory } from './fsutil.js';
import { parseManifest, SCHEMA_URL, writeManifest, type ManifestInput } from './manifest.js';
import type { Registry, ResolvedPrototype } from './registry.js';

export const TEMPLATES = ['static', 'vite-vanilla', 'vite-react'] as const;
export type TemplateName = (typeof TEMPLATES)[number];

export const TEMPLATE_INFO: Record<TemplateName, string> = {
  static: 'HTML + CSS + JS biasa, tanpa build (bisa dari HTML artifact)',
  'vite-vanilla': 'Vite + JavaScript, dengan HMR',
  'vite-react': 'Vite + React 19 (JSX), dengan HMR',
};

export function isTemplate(v: unknown): v is TemplateName {
  return typeof v === 'string' && (TEMPLATES as readonly string[]).includes(v);
}

export interface NewPrototypeOptions {
  id: string;
  name?: string;
  description?: string;
  template?: TemplateName;
  /** Folder tujuan persis. Default: `<workspace>/<id>`. */
  dir?: string;
  /** Folder induk bila `dir` tidak diisi. */
  workspace: string;
  /** Isi HTML (mis. artifact Claude) untuk dijadikan index.html. Hanya template static. */
  html?: string;
}

export interface NewPrototypeResult {
  prototype: ResolvedPrototype;
  template: TemplateName;
  /** File yang dibuat, relatif ke folder prototype. */
  files: string[];
  /** Hasil pemasangan petunjuk agent (AGENTS.md / CLAUDE.md). */
  agentFiles: AgentFileResult[];
}

type Files = Record<string, string>;

const VERSIONS = {
  vite: '^8.3.0',
  pluginReact: '^6.3.0',
  react: '^19.3.0',
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

/** AGENTS.md awal: tujuan + catatan template. Bagian Prototyper ditambahkan oleh syncAgentFiles. */
function agentsMd(name: string, template: TemplateName, imported: boolean): string {
  const notes =
    template === 'static'
      ? imported
        ? ['- `index.html` diimpor dari HTML yang sudah ada (mis. artifact Claude). Boleh dipecah ke file CSS/JS terpisah.']
        : ['- Titik masuk: `index.html`, gaya di `style.css`, logika di `app.js`.']
      : [
          template === 'vite-react' ? '- Titik masuk: `src/main.jsx`, komponen utama `src/App.jsx`.' : '- Titik masuk: `src/main.js`.',
          '- Dependensi baru: `npm install <paket>` di folder ini.',
        ];
  return [
    `# ${name}`,
    '',
    '## Tujuan',
    '',
    '_(tuliskan apa yang ingin divalidasi dengan prototype ini)_',
    '',
    `## Catatan template (${template})`,
    '',
    ...notes,
    '',
  ].join('\n');
}

// .prototyper/comments.json sengaja tidak diabaikan: komentar boleh ikut di-commit.
const GITIGNORE = 'node_modules\ndist\n';

function staticFiles(name: string): Files {
  return {
    'index.html': `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(name)}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <main>
    <h1>${esc(name)}</h1>
    <p>Prototype baru. Edit <code>index.html</code>, <code>style.css</code>, dan <code>app.js</code>, lalu refresh.</p>
    <button type="button" id="btn">Klik</button>
    <p id="out"></p>
  </main>
  <script src="app.js" type="module"></script>
</body>
</html>
`,
    'style.css': `:root { color-scheme: light dark; font-family: system-ui, sans-serif; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; }
main { max-width: 40rem; padding: 2rem 1rem; }
button { font: inherit; padding: .5rem 1rem; cursor: pointer; }
`,
    'app.js': `let n = 0;
document.querySelector('#btn').addEventListener('click', () => {
  n += 1;
  document.querySelector('#out').textContent = \`Diklik \${n} kali\`;
});
`,
  };
}

function viteIndex(name: string, entry: string): string {
  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(name)}</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="${entry}"></script>
</body>
</html>
`;
}

function packageJson(id: string, deps: Record<string, string>, devDeps: Record<string, string>): string {
  const pkg = {
    name: id,
    private: true,
    version: '0.0.0',
    type: 'module',
    scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
    ...(Object.keys(deps).length ? { dependencies: deps } : {}),
    devDependencies: devDeps,
  };
  return `${JSON.stringify(pkg, null, 2)}\n`;
}

const BASE_CSS = `:root { color-scheme: light dark; font-family: system-ui, sans-serif; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; }
#app { max-width: 40rem; padding: 2rem 1rem; }
button { font: inherit; padding: .5rem 1rem; cursor: pointer; }
`;

function viteVanillaFiles(id: string, name: string): Files {
  return {
    'package.json': packageJson(id, {}, { vite: VERSIONS.vite }),
    'index.html': viteIndex(name, '/src/main.js'),
    'src/style.css': BASE_CSS,
    'src/main.js': `import './style.css';

const app = document.querySelector('#app');
app.innerHTML = \`
  <h1>${esc(name).replace(/[`$\\]/g, '\\$&')}</h1>
  <p>Prototype baru (Vite). Edit <code>src/main.js</code> — perubahan tampil otomatis.</p>
  <button type="button" id="btn">Klik</button>
  <p id="out"></p>
\`;

let n = 0;
app.querySelector('#btn').addEventListener('click', () => {
  n += 1;
  app.querySelector('#out').textContent = \`Diklik \${n} kali\`;
});
`,
    '.gitignore': GITIGNORE,
  };
}

function viteReactFiles(id: string, name: string): Files {
  return {
    'package.json': packageJson(
      id,
      { react: VERSIONS.react, 'react-dom': VERSIONS.react },
      { vite: VERSIONS.vite, '@vitejs/plugin-react': VERSIONS.pluginReact },
    ),
    'vite.config.js': `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
`,
    'index.html': viteIndex(name, '/src/main.jsx'),
    'src/index.css': BASE_CSS,
    'src/main.jsx': `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

createRoot(document.getElementById('app')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`,
    'src/App.jsx': `import { useState } from 'react';

export default function App() {
  const [n, setN] = useState(0);
  return (
    <>
      <h1>{${JSON.stringify(name)}}</h1>
      <p>
        Prototype baru (Vite + React). Edit <code>src/App.jsx</code> — perubahan tampil otomatis.
      </p>
      <button type="button" onClick={() => setN((x) => x + 1)}>
        Klik
      </button>
      {n > 0 && <p>Diklik {n} kali</p>}
    </>
  );
}
`,
    '.gitignore': GITIGNORE,
  };
}

/** Isi prototyper.json dan file awal untuk sebuah template. */
export function renderTemplate(
  template: TemplateName,
  { id, name, description, html }: { id: string; name: string; description?: string; html?: string },
): { manifest: ManifestInput; files: Files } {
  const head = { $schema: SCHEMA_URL, id, name, ...(description ? { description } : {}) };
  if (template === 'static') {
    const files = html !== undefined ? { 'index.html': html } : staticFiles(name);
    return {
      manifest: { ...head, type: 'static', static: { root: '.', index: 'index.html' } },
      files: { ...files, 'AGENTS.md': agentsMd(name, template, html !== undefined) },
    };
  }
  const files = template === 'vite-react' ? viteReactFiles(id, name) : viteVanillaFiles(id, name);
  return {
    manifest: { ...head, type: 'command', command: { run: devRunFor('vite'), install: 'npm install' } },
    files: { ...files, 'AGENTS.md': agentsMd(name, template, false) },
  };
}

/**
 * Buat folder prototype baru dari template, tulis prototyper.json + AGENTS.md, lalu daftarkan.
 * Folder tujuan harus belum ada atau kosong. Bila gagal, folder yang baru dibuat dihapus lagi.
 */
export async function createPrototype(registry: Registry, opts: NewPrototypeOptions): Promise<NewPrototypeResult> {
  const template = opts.template ?? 'static';
  if (!isTemplate(template)) {
    throw new AppError('BAD_REQUEST', `Template tidak dikenal: "${String(template)}". Pilihan: ${TEMPLATES.join(', ')}`);
  }
  if (opts.html !== undefined && template !== 'static') {
    throw new AppError('BAD_REQUEST', 'Impor HTML hanya untuk template static');
  }
  if (opts.html !== undefined && !opts.html.trim()) throw new AppError('BAD_REQUEST', 'File HTML kosong');

  const id = (opts.id ?? '').trim();
  const name = opts.name?.trim() || id;
  const { manifest, files } = renderTemplate(template, {
    id,
    name,
    ...(opts.description?.trim() ? { description: opts.description.trim() } : {}),
    ...(opts.html !== undefined ? { html: opts.html } : {}),
  });
  parseManifest(manifest); // validasi id/nama sebelum menyentuh disk

  const dir = path.resolve(opts.dir?.trim() ? opts.dir.trim() : path.join(opts.workspace, id));
  await registry.assertCanAdd(dir, id);

  let created = false;
  if (await isDirectory(dir)) {
    if ((await fs.readdir(dir)).length > 0) {
      throw new AppError('CONFLICT', `Folder ${dir} sudah ada dan tidak kosong. Pilih folder lain atau daftarkan dengan: prototyper add "${dir}"`);
    }
  } else {
    await fs.mkdir(dir, { recursive: true });
    created = true;
  }

  try {
    for (const [rel, content] of Object.entries(files)) {
      const file = path.join(dir, ...rel.split('/'));
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, content, 'utf8');
    }
    await writeManifest(dir, manifest);
    const prototype = await registry.add(dir);
    const agentFiles = prototype.manifest ? await syncAgentFiles(dir, prototype.manifest) : [];
    const extra = agentFiles.filter((f) => f.action === 'created' && !(f.file in files)).map((f) => f.file);
    return { prototype, template, files: ['prototyper.json', ...Object.keys(files), ...extra].sort(), agentFiles };
  } catch (err) {
    if (created) await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}
