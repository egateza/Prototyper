// Agent palsu untuk tes: meniru `claude -p … --output-format stream-json`.
// Membaca id prototype dari prompt, memanggil `prototyper comments resolve` lewat PATH (shim Prototyper),
// lalu mencetak event stream-json. Prompt berisi "TUNGGU" → menggantung (untuk tes stop).
// Sesi: `--session-id X` mencatat sesi X; `--resume X` gagal seperti Claude asli bila X tidak dikenal.
// Argumen & prompt setiap run ditulis ke <PROTOTYPER_HOME>/fake-claude-runs.jsonl untuk diperiksa tes.
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
// `--fake-old`: meniru Claude Code lama yang belum punya --permission-prompts.
const old = args.includes('--fake-old');
if (args.includes('--version')) {
  console.log(old ? '1.0.0 (Fake Claude)' : '9.9.9 (Fake Claude)');
  process.exit(0);
}
if (args.includes('--help')) {
  console.log('Usage: claude [options]\n\nOptions:\n  -p, --print  Print response\n  --permission-mode <mode>  Permission mode');
  if (!old) console.log('  --permission-prompts <target>  Who answers permission prompts');
  process.exit(0);
}
if (old && args.includes('--permission-prompts')) {
  process.stderr.write("error: unknown option '--permission-prompts'\n");
  process.exit(1);
}
const prompt = args[args.indexOf('-p') + 1] ?? '';
const out = (ev) => process.stdout.write(`${JSON.stringify(ev)}\n`);
const home = process.env.PROTOTYPER_HOME ?? process.cwd();
const sessDir = path.join(home, 'fake-claude-sessions');
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const resume = flag('--resume');
const session = resume ?? flag('--session-id') ?? 'tanpa-sesi';
appendFileSync(path.join(home, 'fake-claude-runs.jsonl'), `${JSON.stringify({ args, prompt })}\n`);
if (resume && !existsSync(path.join(sessDir, resume))) {
  process.stderr.write(`No conversation found with session ID: ${resume}\n`);
  // seperti Claude Code asli: tetap ada event result ber-session_id, tanpa event init
  out({ type: 'result', subtype: 'error_during_execution', is_error: true, num_turns: 0, session_id: resume, errors: [`No conversation found with session ID: ${resume}`] });
  process.exit(1);
}
mkdirSync(sessDir, { recursive: true });
writeFileSync(path.join(sessDir, session), 'x');
out({ type: 'system', subtype: 'init', model: 'fake-model', cwd: process.cwd(), session_id: session });

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
