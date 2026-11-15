import { existsSync } from 'node:fs';
import path from 'node:path';
import { countComments, type CommentCounts } from './comments.js';
import type { Manifest } from './manifest.js';
import type { ResolvedPrototype } from './registry.js';
import type { RunInfo, RunStatus } from './runtime.js';

/** Bentuk prototype yang dikirim ke API, CLI --json, dan UI. */
export interface PrototypeView {
  id: string;
  name: string;
  description: string | null;
  type: 'static' | 'command' | null;
  path: string;
  tags: string[];
  valid: boolean;
  error: string | null;
  status: RunStatus;
  port: number | null;
  pid: number | null;
  url: string | null;
  lanUrls: string[];
  startedAt: string | null;
  exitCode: number | null;
  instructions: { path: string; exists: boolean };
  /** Jumlah komentar di .prototyper/comments.json. */
  comments: CommentCounts;
  manifest: Manifest | null;
}

export interface ViewOptions {
  lan: boolean;
  lanAddrs: string[];
}

export function toView(p: ResolvedPrototype, info: RunInfo, opts: ViewOptions): PrototypeView {
  const m = p.manifest;
  const live = info.port !== null && (info.status === 'running' || info.status === 'starting');
  const instrPath = path.join(p.path, m?.agent?.instructions ?? 'AGENTS.md');
  return {
    id: p.id,
    name: m?.name ?? p.id,
    description: m?.description ?? null,
    type: m?.type ?? null,
    path: p.path,
    tags: m?.tags ?? [],
    valid: !!m,
    error: p.error ?? info.error,
    status: info.status,
    port: info.port,
    pid: info.pid,
    url: live ? `http://localhost:${info.port}` : null,
    lanUrls: live && opts.lan ? opts.lanAddrs.map((a) => `http://${a}:${info.port}`) : [],
    startedAt: info.startedAt,
    exitCode: info.exitCode,
    instructions: { path: instrPath, exists: existsSync(instrPath) },
    comments: countComments(p.path),
    manifest: m,
  };
}
