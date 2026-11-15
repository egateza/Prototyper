// Agent palsu untuk tes: meniru `claude -p … --output-format stream-json`.
// Membaca id prototype dari prompt, memanggil `prototyper comments resolve` lewat PATH (shim Prototyper),
// lalu mencetak event stream-json. Prompt berisi "TUNGGU" → menggantung (untuk tes stop).
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
if (args.includes('--version')) {
  console.log('9.9.9 (Fake Claude)');
  process.exit(0);
}
const prompt = args[args.indexOf('-p') + 1] ?? '';
const out = (ev) => process.stdout.write(`${JSON.stringify(ev)}\n`);
out({ type: 'system', subtype: 'init', model: 'fake-model', cwd: process.cwd() });

if (prompt.includes('TUNGGU')) {
  setInterval(() => {}, 1000);
} else {
  const id = /\(id `([a-z0-9-]+)`\)/.exec(prompt)?.[1];
  const focus = /Fokus hanya pada komentar: ([^.]+)\./.exec(prompt)?.[1]?.split(', ') ?? ['c1'];
  const cmd = `prototyper comments resolve ${id} ${focus[0]} --note "Dikerjakan agent palsu"`;
  out({ type: 'assistant', message: { content: [{ type: 'text', text: 'Saya kerjakan komentarnya.' }, { type: 'tool_use', name: 'Bash', input: { command: cmd } }] } });
  const r = spawnSync(cmd, { shell: true, encoding: 'utf8', env: process.env });
  out({ type: 'user', message: { content: [{ type: 'tool_result', is_error: r.status !== 0, content: (r.stdout || r.stderr || '').trim() }] } });
  out({ type: 'result', subtype: r.status === 0 ? 'success' : 'error_during_execution', is_error: r.status !== 0, result: r.status === 0 ? 'Komentar selesai.' : `gagal: ${r.stderr}`, num_turns: 2, total_cost_usd: 0.01 });
  process.exit(r.status === 0 ? 0 : 1);
}
