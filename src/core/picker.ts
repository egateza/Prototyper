import { spawn } from 'node:child_process';
import path from 'node:path';
import { AppError } from './errors.js';

/**
 * Dialog pilih file/folder bawaan OS, dibuka oleh daemon (berjalan di komputer yang sama dengan
 * browser). Browser sendiri tidak bisa memberi path lengkap, jadi Web UI memanggil
 * `POST /api/pick` dan menerima path absolut. Hanya bisa dari mesin lokal (aturan non-GET).
 *
 * - Windows: PowerShell (STA) + IFileOpenDialog — dialog Explorer modern, juga untuk folder.
 * - macOS: osascript `choose folder` / `choose file`.
 * - Linux: zenity, lalu kdialog.
 */

export type PickKind = 'folder' | 'file';

export interface PickOptions {
  kind: PickKind;
  title?: string;
  /** Folder awal yang dibuka dialog (absolut). */
  initial?: string;
  /** Boleh memilih lebih dari satu (file saja; folder selalu satu). */
  multiple?: boolean;
}

export interface PickResult {
  /** Path absolut yang dipilih; kosong bila dibatalkan. */
  paths: string[];
  cancelled: boolean;
}

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  /** Program tidak ditemukan (ENOENT). */
  missing: boolean;
}

export type Runner = (cmd: string, args: string[], env: Record<string, string>) => Promise<RunResult>;

export interface PickerCommand {
  cmd: string;
  args: string[];
  env: Record<string, string>;
  /** Exit code yang berarti "dibatalkan pengguna". */
  cancelCodes: number[];
}

const WIN_CS = String.raw`
using System;
using System.Runtime.InteropServices;
public static class ProtoPicker {
  [ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")] class FileOpenDialogCo {}
  [ComImport, Guid("d57c7288-d4ad-4768-be02-9d969532d960"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IFileOpenDialog {
    [PreserveSig] int Show(IntPtr hwnd);
    void SetFileTypes(uint c, IntPtr f); void SetFileTypeIndex(uint i); void GetFileTypeIndex(out uint i);
    void Advise(IntPtr e, out uint c); void Unadvise(uint c);
    void SetOptions(uint o); void GetOptions(out uint o);
    void SetDefaultFolder(IShellItem i); void SetFolder(IShellItem i);
    void GetFolder(out IShellItem i); void GetCurrentSelection(out IShellItem i);
    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string n); void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string n);
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string t); void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string t);
    void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string t);
    void GetResult(out IShellItem i); void AddPlace(IShellItem i, int a);
    void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string e);
    void Close(int hr); void SetClientGuid(ref Guid g); void ClearClientData(); void SetFilter(IntPtr f);
    void GetResults(out IShellItemArray a); void GetSelectedItems(out IShellItemArray a);
  }
  [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellItem {
    void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
    void GetParent(out IShellItem i);
    void GetDisplayName(uint sigdn, [MarshalAs(UnmanagedType.LPWStr)] out string name);
    void GetAttributes(uint mask, out uint attrs);
    void Compare(IShellItem i, uint hint, out int order);
  }
  [ComImport, Guid("b63ea76d-1f85-456f-a19c-48159efa858b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellItemArray {
    void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
    void GetPropertyStore(int flags, ref Guid riid, out IntPtr ppv);
    void GetPropertyDescriptionList(IntPtr keyType, ref Guid riid, out IntPtr ppv);
    void GetAttributes(int flags, uint mask, out uint attrs);
    void GetCount(out uint n);
    void GetItemAt(uint i, out IShellItem item);
    void EnumItems(out IntPtr e);
  }
  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
  static extern void SHCreateItemFromParsingName(string path, IntPtr pbc, ref Guid riid, out IShellItem item);

  // Mengembalikan null bila dibatalkan.
  public static string[] Pick(IntPtr owner, bool folder, bool multi, string title, string initial) {
    var d = (IFileOpenDialog)new FileOpenDialogCo();
    uint o; d.GetOptions(out o);
    o |= 0x40 | 0x800;              // FORCEFILESYSTEM | PATHMUSTEXIST
    o |= folder ? 0x20u : 0x1000u;  // PICKFOLDERS | FILEMUSTEXIST
    if (multi && !folder) o |= 0x200; // ALLOWMULTISELECT
    d.SetOptions(o);
    if (!String.IsNullOrEmpty(title)) d.SetTitle(title);
    if (!String.IsNullOrEmpty(initial)) {
      try { var g = typeof(IShellItem).GUID; IShellItem it; SHCreateItemFromParsingName(initial, IntPtr.Zero, ref g, out it); d.SetFolder(it); } catch {}
    }
    int hr = d.Show(owner);
    if (hr == unchecked((int)0x800704C7)) return null; // ERROR_CANCELLED
    if (hr != 0) Marshal.ThrowExceptionForHR(hr);
    IShellItemArray arr; d.GetResults(out arr);
    uint n; arr.GetCount(out n);
    var res = new string[n];
    for (uint i = 0; i < n; i++) { IShellItem it; arr.GetItemAt(i, out it); string p; it.GetDisplayName(0x80058000, out p); res[i] = p; }
    return res;
  }
}
`;

// Form kecil TopMost sebagai pemilik dialog, agar dialog muncul di depan browser (daemon berjalan
// di latar dan tidak punya jendela sendiri). Exit 3 = dibatalkan.
const WIN_PS = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition $env:PROTOTYPER_PICK_CS -Language CSharp
$f = New-Object System.Windows.Forms.Form
$f.TopMost = $true; $f.ShowInTaskbar = $false; $f.FormBorderStyle = 'None'; $f.Opacity = 0
$f.StartPosition = 'CenterScreen'; $f.Width = 1; $f.Height = 1
$f.Show(); $f.Activate()
try {
  $r = [ProtoPicker]::Pick($f.Handle, $env:PROTOTYPER_PICK_KIND -eq 'folder', $env:PROTOTYPER_PICK_MULTI -eq '1', $env:PROTOTYPER_PICK_TITLE, $env:PROTOTYPER_PICK_INITIAL)
} finally { $f.Close() }
if ($null -eq $r) { exit 3 }
foreach ($p in $r) { [Console]::Out.WriteLine($p) }
`;

/** AppleScript sebagai string literal yang aman. */
const asStr = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** Perintah yang dicoba berurutan untuk platform ini (Linux: zenity lalu kdialog). */
export function pickerCommands(platform: NodeJS.Platform, o: PickOptions): PickerCommand[] {
  const title = o.title ?? (o.kind === 'folder' ? 'Pilih folder' : 'Pilih file');
  const multi = o.kind === 'file' && !!o.multiple;
  if (platform === 'win32') {
    return [{
      cmd: 'powershell.exe',
      args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-STA', '-EncodedCommand', Buffer.from(WIN_PS, 'utf16le').toString('base64')],
      env: {
        PROTOTYPER_PICK_CS: WIN_CS,
        PROTOTYPER_PICK_KIND: o.kind,
        PROTOTYPER_PICK_MULTI: multi ? '1' : '0',
        PROTOTYPER_PICK_TITLE: title,
        PROTOTYPER_PICK_INITIAL: o.initial ?? '',
      },
      cancelCodes: [3],
    }];
  }
  if (platform === 'darwin') {
    const loc = o.initial ? ` default location (POSIX file ${asStr(o.initial)})` : '';
    const script = o.kind === 'folder'
      ? `POSIX path of (choose folder with prompt ${asStr(title)}${loc})`
      : multi
        ? `set out to ""\nrepeat with f in (choose file with prompt ${asStr(title)}${loc} with multiple selections allowed)\nset out to out & POSIX path of f & linefeed\nend repeat\nreturn out`
        : `POSIX path of (choose file with prompt ${asStr(title)}${loc})`;
    return [{ cmd: 'osascript', args: ['-e', script], env: {}, cancelCodes: [1] }];
  }
  const start = o.initial ? `${o.initial.replace(/\/$/, '')}/` : '';
  return [
    {
      cmd: 'zenity',
      args: ['--file-selection', `--title=${title}`, ...(o.kind === 'folder' ? ['--directory'] : []), ...(multi ? ['--multiple', '--separator=\n'] : []), ...(start ? [`--filename=${start}`] : [])],
      env: {},
      cancelCodes: [1],
    },
    {
      cmd: 'kdialog',
      args: [
        '--title', title,
        ...(o.kind === 'folder' ? ['--getexistingdirectory', start || '.'] : ['--getopenfilename', start || '.', ...(multi ? ['--multiple', '--separate-output'] : [])]),
      ],
      env: {},
      cancelCodes: [1],
    },
  ];
}

export const defaultRunner: Runner = (cmd, args, env) =>
  new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let child;
    try {
      child = spawn(cmd, args, { env: { ...process.env, ...env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      resolve({ code: null, stdout, stderr: (err as Error).message, missing: (err as NodeJS.ErrnoException).code === 'ENOENT' });
      return;
    }
    child.stdout.setEncoding('utf8').on('data', (d: string) => (stdout += d));
    child.stderr.setEncoding('utf8').on('data', (d: string) => (stderr += d));
    child.once('error', (err: NodeJS.ErrnoException) => resolve({ code: null, stdout, stderr: err.message, missing: err.code === 'ENOENT' }));
    child.once('close', (code) => resolve({ code, stdout, stderr, missing: false }));
  });

let busy = false;

/**
 * Buka dialog pilih file/folder dan tunggu pengguna. Satu dialog sekaligus (dialog kedua ditolak
 * CONFLICT). Path hasil dinormalkan dengan `path.resolve`.
 */
export async function pickPath(
  o: PickOptions,
  deps: { platform?: NodeJS.Platform; run?: Runner } = {},
): Promise<PickResult> {
  if (o.kind !== 'folder' && o.kind !== 'file') throw new AppError('BAD_REQUEST', 'kind harus "folder" atau "file"');
  if (busy) throw new AppError('CONFLICT', 'Dialog pilih file/folder sedang terbuka. Selesaikan dulu (mungkin tertutup jendela lain).');
  const platform = deps.platform ?? process.platform;
  const run = deps.run ?? defaultRunner;
  busy = true;
  try {
    const cmds = pickerCommands(platform, o);
    for (const c of cmds) {
      const r = await run(c.cmd, c.args, c.env);
      if (r.missing) continue;
      if (r.code !== null && c.cancelCodes.includes(r.code)) return { paths: [], cancelled: true };
      if (r.code !== 0) {
        throw new AppError('INTERNAL', `Dialog pilih ${o.kind === 'folder' ? 'folder' : 'file'} gagal dibuka (${c.cmd}, exit ${r.code ?? '-'}): ${r.stderr.trim().split(/\r?\n/).slice(-3).join(' ') || 'tanpa pesan'}`);
      }
      const resolve = platform === 'win32' ? path.win32.resolve : path.posix.resolve;
      const paths = r.stdout.split(/\r?\n/).map((x) => x.trim()).filter(Boolean).map((x) => resolve(x));
      return { paths, cancelled: paths.length === 0 };
    }
    throw new AppError(
      'NOT_IMPLEMENTED',
      platform === 'linux'
        ? 'Dialog pilih file/folder butuh zenity atau kdialog. Pasang salah satunya, atau ketik path-nya.'
        : 'Dialog pilih file/folder tidak tersedia di sistem ini. Ketik path-nya.',
    );
  } finally {
    busy = false;
  }
}
