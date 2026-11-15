import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import type { Popup } from './popup.js';

/**
 * Ikon tray Windows tanpa modul native: `powershell.exe` menjalankan NotifyIcon (WinForms) dan
 * hanya menggambar apa yang dikirim Node. Semua logika ada di sisi Node (controller.ts), tata letak
 * popup & menu di popup.ts.
 *
 * Protokol: satu objek JSON per baris.
 *   Node → host: {t:'popup', ...Popup} · {t:'menu', ...Popup} · {t:'icon', badge, dot, paused, tooltip}
 *                · {t:'balloon', title, text} · {t:'exit'}
 *                · untuk tes: {t:'show', what} · {t:'clickAt', what, x, y} · {t:'snapshot', what, path}
 *   host → Node: {t:'ready'} · {t:'click', id} · {t:'open'} (klik dua kali ikon) · {t:'snapshot', path}
 * Klik kiri ikon membuka/menutup popup; klik kanan membuka menu. Keduanya jendela tanpa bingkai
 * yang digambar dari daftar bentuk (`Popup`). Popup tetap terbuka sampai ✕ / Esc / klik ikon;
 * menu tertutup setelah dipilih atau saat kehilangan fokus.
 */

export interface IconState {
  /** Jumlah prototype berjalan, tampil di badge kanan atas (abu-abu bila 0). */
  badge: number;
  /** Titik oranye di kanan bawah: ada pembaruan. */
  dot: boolean;
  /** Logo abu-abu & pudar: daemon dijeda. */
  paused: boolean;
  tooltip: string;
}

export type Surface = 'popup' | 'menu';

export type HostEvent = { t: 'ready' } | { t: 'click'; id: string } | { t: 'open' } | { t: 'snapshot'; path: string };

/** Antarmuka yang dipakai controller; diganti tiruan di tes. */
export interface TrayHostLike {
  on(event: 'event', fn: (e: HostEvent) => void): unknown;
  on(event: 'exit', fn: (code: number | null) => void): unknown;
  setPopup(popup: Popup): void;
  setMenu(menu: Popup): void;
  setIcon(icon: IconState): void;
  balloon(title: string, text: string): void;
  close(): void;
}

/** JSON satu baris dengan karakter non-ASCII di-escape: aman apa pun code page konsol PowerShell. */
export function asciiJson(value: unknown): string {
  return JSON.stringify(value).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

export function parseHostLine(line: string): HostEvent | null {
  try {
    const e = JSON.parse(line) as { t?: unknown; id?: unknown; path?: unknown };
    if (e.t === 'ready' || e.t === 'open') return { t: e.t };
    if (e.t === 'click' && typeof e.id === 'string') return { t: 'click', id: e.id };
    if (e.t === 'snapshot' && typeof e.path === 'string') return { t: 'snapshot', path: e.path };
  } catch {
    /* baris lain (mis. error PowerShell) diabaikan */
  }
  return null;
}

export class TrayHost extends EventEmitter implements TrayHostLike {
  private child: ChildProcess | null = null;
  private closed = false;

  /** `dir`: folder untuk menulis skrip host; `iconDir`: folder berisi `tray-<px>.png`. */
  start(dir: string, iconDir: string): void {
    mkdirSync(dir, { recursive: true });
    const script = path.join(dir, 'tray-host.ps1');
    writeFileSync(script, `﻿${HOST_SCRIPT}`); // BOM: PowerShell 5.1 membaca skrip tanpa BOM sebagai ANSI
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-STA', '-File', script, '-IconDir', iconDir],
      { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
    );
    this.child = child;
    createInterface({ input: child.stdout! }).on('line', (line) => {
      const e = parseHostLine(line);
      if (e) this.emit('event', e);
    });
    createInterface({ input: child.stderr! }).on('line', (line) => {
      if (line.trim()) console.error(`[tray-host] ${line}`);
    });
    child.stdin!.on('error', () => undefined);
    child.once('error', (err) => {
      console.error(`Gagal menjalankan powershell.exe untuk ikon tray: ${err.message}`);
      this.emit('exit', null);
    });
    child.once('exit', (code) => {
      this.child = null;
      this.emit('exit', code);
    });
  }

  private send(msg: unknown): void {
    if (this.closed || !this.child?.stdin?.writable) return;
    this.child.stdin.write(`${asciiJson(msg)}\n`);
  }

  setPopup(popup: Popup): void {
    this.send({ t: 'popup', ...popup });
  }

  setMenu(menu: Popup): void {
    this.send({ t: 'menu', ...menu });
  }

  setIcon(icon: IconState): void {
    this.send({ t: 'icon', ...icon });
  }

  balloon(title: string, text: string): void {
    this.send({ t: 'balloon', title, text });
  }

  /** Untuk tes: tampilkan popup/menu tanpa klik ikon. */
  show(what: Surface): void {
    this.send({ t: 'show', what });
  }

  /** Untuk tes: klik di koordinat logis (px 96 DPI) lewat jalur yang sama dengan klik mouse. */
  clickAt(what: Surface, x: number, y: number): void {
    this.send({ t: 'clickAt', what, x, y });
  }

  /** Gambar popup/menu/ikon terakhir ke PNG (tes & pengecekan visual); event `snapshot` setelah selesai. */
  snapshot(what: Surface | 'icon', file: string): void {
    this.send({ t: 'snapshot', what, path: file });
  }

  close(): void {
    this.send({ t: 'exit' });
    this.closed = true;
    this.child?.stdin?.end();
  }
}

/** Skrip host. Membaca stdin secara asinkron (StreamReader + timer) agar UI tetap responsif. */
export const HOST_SCRIPT = String.raw`param([string]$IconDir)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# DPI-aware (tajam di layar 125%/150%) + sudut membulat Windows 11; gagal = tetap jalan tanpa keduanya
$script:native = $false
try {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class PrototyperNative {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("dwmapi.dll")] public static extern int DwmSetWindowAttribute(IntPtr h, int attr, ref int val, int size);
}
'@
  [void][PrototyperNative]::SetProcessDPIAware()
  $script:native = $true
} catch { }
[System.Windows.Forms.Application]::EnableVisualStyles()

function Send($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress -Depth 3))
  [Console]::Out.Flush()
}
function Err($rec) { [Console]::Error.WriteLine([string]$rec.Exception.Message) }

# Logo: PNG per ukuran (tray-<px>.png). Bukan .ico: System.Drawing salah membaca ikon berisi PNG saat diubah ukurannya.
$script:logos = @{}
foreach ($file in Get-ChildItem -LiteralPath $IconDir -Filter 'tray-*.png') {
  $script:logos[[int]($file.BaseName.Substring(5))] = [System.Drawing.Image]::FromFile($file.FullName)
}
if ($script:logos.Count -eq 0) { throw "Logo tray tidak ditemukan di $IconDir" }
function Get-Logo([int]$px) {
  $best = $null
  foreach ($k in ($script:logos.Keys | Sort-Object)) { $best = $script:logos[$k]; if ($k -ge $px) { break } }
  return $best
}
function Draw-Logo($g, $rect, $attrs) {
  $img = Get-Logo $rect.Width
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  if ($null -ne $attrs) { $g.DrawImage($img, $rect, 0, 0, $img.Width, $img.Height, [System.Drawing.GraphicsUnit]::Pixel, $attrs) }
  else { $g.DrawImage($img, $rect) }
}

$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Text = 'Prototyper'

# ===== Warna, huruf, bentuk =====
$script:colors = @{}
function Col([string]$hex) {
  if ($script:colors.ContainsKey($hex)) { return $script:colors[$hex] }
  $h = $hex.TrimStart('#')
  $a = 255
  if ($h.Length -ge 8) { $a = [Convert]::ToInt32($h.Substring(6, 2), 16) }
  $c = [System.Drawing.Color]::FromArgb($a, [Convert]::ToInt32($h.Substring(0, 2), 16), [Convert]::ToInt32($h.Substring(2, 2), 16), [Convert]::ToInt32($h.Substring(4, 2), 16))
  $script:colors[$hex] = $c
  return $c
}
$script:fonts = @{}
function Get-Font($size, $bold, $symbol) {
  $key = "$size|$bold|$symbol"
  if ($script:fonts.ContainsKey($key)) { return $script:fonts[$key] }
  $family = 'Segoe UI'
  if ($symbol) { $family = 'Segoe UI Symbol' } elseif ($bold) { $family = 'Segoe UI Semibold' }
  $style = [System.Drawing.FontStyle]::Regular
  if ($bold -and $symbol) { $style = [System.Drawing.FontStyle]::Bold }
  $f = New-Object System.Drawing.Font($family, [single]($size * $script:scale), $style, [System.Drawing.GraphicsUnit]::Pixel)
  $script:fonts[$key] = $f
  return $f
}
function RoundPath([double]$x, [double]$y, [double]$w, [double]$h, [double]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  if ($r -le 0) { $p.AddRectangle((New-Object System.Drawing.RectangleF($x, $y, $w, $h))); return $p }
  $d = [Math]::Min($r * 2, [Math]::Min($w, $h))
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

$probe = New-Object System.Windows.Forms.Form
$gfx = $probe.CreateGraphics()
$script:scale = $gfx.DpiX / 96.0
$gfx.Dispose(); $probe.Dispose()
# Teks lewat GDI+ (ClearType di atas latar buram). TextRenderer (GDI) membuat teks gelap tebal & bergerigi
# di buffer 32-bit, terlihat jelas pada menu tema terang.
$textFmt = [System.Drawing.StringFormat]::GenericTypographic.Clone()
$textFmt.FormatFlags = [System.Drawing.StringFormatFlags]'NoWrap, MeasureTrailingSpaces'
$textFmt.Trimming = [System.Drawing.StringTrimming]::EllipsisCharacter
$textFmt.LineAlignment = [System.Drawing.StringAlignment]::Center
$script:brushes = @{}
function Get-Brush([string]$hex) {
  if (-not $script:brushes.ContainsKey($hex)) { $script:brushes[$hex] = New-Object System.Drawing.SolidBrush((Col $hex)) }
  return $script:brushes[$hex]
}

function Draw-Text($g, $it) {
  $s = $script:scale
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
  $runs = @($it.runs)
  $sizes = @()
  $total = 0
  foreach ($r in $runs) {
    $w = [Math]::Ceiling($g.MeasureString([string]$r.text, (Get-Font $r.size $r.bold $r.symbol), (New-Object System.Drawing.PointF(0, 0)), $textFmt).Width)
    $sizes += $w
    $total += $w
  }
  $left = [int]($it.x * $s)
  $right = [int](($it.x + $it.w) * $s)
  $x = $left
  if ($it.align -eq 'center') { $x = [int]($left + [Math]::Max(0, ($right - $left - $total) / 2)) }
  elseif ($it.align -eq 'right') { $x = [int]([Math]::Max($left, $right - $total)) }
  for ($i = 0; $i -lt $runs.Count; $i++) {
    $avail = $right - $x
    if ($avail -le 0) { break }
    $r = $runs[$i]
    $rect = New-Object System.Drawing.RectangleF([single]$x, [single]($it.y * $s), [single]$avail, [single]($it.h * $s))
    $g.DrawString([string]$r.text, (Get-Font $r.size $r.bold $r.symbol), (Get-Brush ([string]$r.color)), $rect, $textFmt)
    $x += [Math]::Min($sizes[$i], $avail)
  }
}

function Draw-Surface($g, $sf) {
  $p = $sf.model
  if ($null -eq $p) { return }
  $s = $script:scale
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $items = @($p.items)
  $spin = $false
  for ($i = 0; $i -lt $items.Count; $i++) {
    $it = $items[$i]
    $x = $it.x * $s; $y = $it.y * $s
    switch ($it.k) {
      'rect' {
        $w = $it.w * $s; $h = $it.h * $s; $r = [double]$it.r * $s
        if ($it.fill) {
          $path = RoundPath $x $y $w $h $r
          if ($it.fill2) {
            $br = New-Object System.Drawing.Drawing2D.LinearGradientBrush((New-Object System.Drawing.RectangleF($x, $y, [Math]::Max(1, $w), [Math]::Max(1, $h))), (Col $it.fill), (Col $it.fill2), [single]35)
          } else { $br = New-Object System.Drawing.SolidBrush((Col $it.fill)) }
          $g.FillPath($br, $path); $br.Dispose(); $path.Dispose()
        }
        if ($it.stroke) {
          $path = RoundPath ($x + $s / 2) ($y + $s / 2) ($w - $s) ($h - $s) $r
          $pen = New-Object System.Drawing.Pen((Col $it.stroke), [single]$s)
          $g.DrawPath($pen, $path); $pen.Dispose(); $path.Dispose()
        }
      }
      'hit' {
        if ($it.hover -and ($sf.hovered -contains $i)) {
          $path = RoundPath $x $y ($it.w * $s) ($it.h * $s) ([double]$it.r * $s)
          $br = New-Object System.Drawing.SolidBrush((Col $it.hover))
          $g.FillPath($br, $path); $br.Dispose(); $path.Dispose()
        }
      }
      'circle' {
        $d = $it.d * $s
        if ($it.ring) {
          $rw = $it.ringW * $s
          $br = New-Object System.Drawing.SolidBrush((Col $it.ring))
          $g.FillEllipse($br, [single]($x - $rw), [single]($y - $rw), [single]($d + 2 * $rw), [single]($d + 2 * $rw)); $br.Dispose()
        }
        $br = New-Object System.Drawing.SolidBrush((Col $it.fill))
        $g.FillEllipse($br, [single]$x, [single]$y, [single]$d, [single]$d); $br.Dispose()
      }
      'toggle' {
        $w = $it.w * $s; $h = $it.h * $s
        $bgc = '#4b4f5c'
        if ($it.on) { $bgc = '#16a34a' }
        $path = RoundPath $x $y $w $h ($h / 2)
        $br = New-Object System.Drawing.SolidBrush((Col $bgc))
        $g.FillPath($br, $path); $br.Dispose(); $path.Dispose()
        $kd = $h - 4 * $s
        $kx = $x + 2 * $s
        if ($it.on) { $kx = $x + $w - 2 * $s - $kd }
        $g.FillEllipse([System.Drawing.Brushes]::White, [single]$kx, [single]($y + 2 * $s), [single]$kd, [single]$kd)
      }
      'text' { Draw-Text $g $it }
      'icon' {
        $sz = [int]($it.size * $s)
        Draw-Logo $g (New-Object System.Drawing.Rectangle([int]$x, [int]$y, $sz, $sz)) $null
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Default
      }
      'spinner' {
        $spin = $true
        $d = $it.d * $s
        $pen = New-Object System.Drawing.Pen((Col $it.color), [single](2 * $s))
        $angle = ([Environment]::TickCount -band 0x7fffffff) % 800 / 800.0 * 360
        $g.DrawArc($pen, [single]($x + $s), [single]($y + $s), [single]($d - 2 * $s), [single]($d - 2 * $s), [single]$angle, [single]270); $pen.Dispose()
      }
      'progress' {
        $w = $it.w * $s; $h = $it.h * $s
        $path = RoundPath $x $y $w $h ($h / 2)
        $br = New-Object System.Drawing.SolidBrush((Col $it.track)); $g.FillPath($br, $path); $br.Dispose(); $path.Dispose()
        $fw = $w * [Math]::Min(1, [Math]::Max(0, [double]$it.value))
        if ($fw -ge 1) {
          $path = RoundPath $x $y $fw $h ($h / 2)
          $br = New-Object System.Drawing.SolidBrush((Col $it.fill)); $g.FillPath($br, $path); $br.Dispose(); $path.Dispose()
        }
      }
    }
  }
  $sf.spinner = $spin
}

# Indeks area klik di titik logis (px 96 DPI). Dikembalikan sebagai SATU array (pakai tanpa @()).
function Hits-At($sf, [double]$lx, [double]$ly) {
  $res = New-Object System.Collections.Generic.List[int]
  if ($null -ne $sf.model) {
    $items = @($sf.model.items)
    for ($i = 0; $i -lt $items.Count; $i++) {
      $it = $items[$i]
      if ($it.k -eq 'hit' -and $lx -ge $it.x -and $lx -lt ($it.x + $it.w) -and $ly -ge $it.y -and $ly -lt ($it.y + $it.h)) { $res.Add($i) }
    }
  }
  return , $res.ToArray()
}

function Hover-At($sf, $pt) {
  $s = $script:scale
  $h = Hits-At $sf ($pt.X / $s) ($pt.Y / $s)
  if (($h -join ',') -ne (@($sf.hovered) -join ',')) { $sf.hovered = $h; $sf.form.Invalidate() }
  $clickable = $false
  $items = @($sf.model.items)
  foreach ($i in $h) { $hi = $items[$i]; if ($hi.id -or $hi.close) { $clickable = $true } }
  if ($clickable) { $sf.form.Cursor = [System.Windows.Forms.Cursors]::Hand } else { $sf.form.Cursor = [System.Windows.Forms.Cursors]::Default }
}

# Klik: area paling atas (terakhir digambar) yang punya id/close menang.
function Click-At($sf, [double]$lx, [double]$ly) {
  $h = Hits-At $sf $lx $ly
  $items = @($sf.model.items)
  for ($j = $h.Count - 1; $j -ge 0; $j--) {
    $it = $items[$h[$j]]
    if ($it.id -or $it.close) {
      if ($it.id) { Send @{ t = 'click'; id = [string]$it.id } }
      if ($it.close) { Hide-Surface $sf }
      return
    }
  }
}

# ===== Jendela popup & menu =====
$script:surfaces = @{}
function New-Surface([string]$name, [bool]$autoClose) {
  $f = New-Object System.Windows.Forms.Form
  $f.FormBorderStyle = 'None'
  $f.ShowInTaskbar = $false
  $f.TopMost = $true
  $f.StartPosition = 'Manual'
  $f.KeyPreview = $true
  $f.Tag = $name
  [System.Windows.Forms.Control].GetProperty('DoubleBuffered', [System.Reflection.BindingFlags]'Instance,NonPublic').SetValue($f, $true, $null)
  $script:surfaces[$name] = @{ name = $name; form = $f; model = $null; hovered = @(); spinner = $false; rounded = $false; anchor = [System.Drawing.Point]::Empty }
  $f.add_Paint({ param($s, $e) try { Draw-Surface $e.Graphics $script:surfaces[[string]$s.Tag] } catch { Err $_ } })
  $f.add_MouseMove({ param($s, $e) try { Hover-At $script:surfaces[[string]$s.Tag] $e.Location } catch { Err $_ } })
  $f.add_MouseLeave({ param($s, $e) try { $script:surfaces[[string]$s.Tag].hovered = @(); $s.Invalidate() } catch { Err $_ } })
  $f.add_MouseClick({
    param($s, $e)
    if ($e.Button -ne [System.Windows.Forms.MouseButtons]::Left) { return }
    try { Click-At $script:surfaces[[string]$s.Tag] ($e.X / $script:scale) ($e.Y / $script:scale) } catch { Err $_ }
  })
  $f.add_KeyDown({ param($s, $e) if ($e.KeyCode -eq [System.Windows.Forms.Keys]::Escape) { Hide-Surface $script:surfaces[[string]$s.Tag] } })
  # Menu tertutup saat kehilangan fokus; popup sengaja tidak (tutup lewat ✕, Esc, atau klik ikon tray).
  if ($autoClose) { $f.add_Deactivate({ param($s, $e) Hide-Surface $script:surfaces[[string]$s.Tag] }) }
}

function Place-Surface($sf) {
  $s = $script:scale
  $f = $sf.form
  $w = [int]($sf.model.w * $s); $h = [int]($sf.model.h * $s)
  $cur = $sf.anchor
  $wa = [System.Windows.Forms.Screen]::FromPoint($cur).WorkingArea
  if ($sf.name -eq 'popup') {
    # seperti prototype: pojok kanan bawah, 12px dari tepi
    $m = [int](12 * $s)
    $x = $wa.Right - $w - $m
    $y = $wa.Bottom - $h - $m
    if ($cur.Y -lt $wa.Top) { $y = $wa.Top + $m }  # taskbar di atas
    if ($cur.X -lt $wa.Left) { $x = $wa.Left + $m }  # taskbar di kiri
  } else {
    # menu: di atas ikon tray, rata kiri dengan kursor
    $m = [int](6 * $s)
    $x = [Math]::Max($wa.Left + $m, [Math]::Min($cur.X, $wa.Right - $w - $m))
    if ($cur.Y -ge $wa.Bottom) { $y = $wa.Bottom - $h - $m }
    elseif ($cur.Y -lt $wa.Top) { $y = $wa.Top + $m }
    else { $y = [Math]::Max($wa.Top + $m, [Math]::Min($cur.Y - $h, $wa.Bottom - $h - $m)) }
  }
  $f.SetBounds($x, $y, $w, $h)
  if (-not $sf.rounded) { $f.Region = New-Object System.Drawing.Region((RoundPath 0 0 $w $h ([double]$sf.model.r * $s))) }
}

function Show-Surface($sf) {
  if ($null -eq $sf.model) { return }
  $f = $sf.form
  $sf.anchor = [System.Windows.Forms.Cursor]::Position
  $sf.hovered = @()
  Place-Surface $sf
  $f.Show()
  if ($script:native -and -not $sf.rounded) {
    $pref = 2  # DWMWCP_ROUND
    if ([double]$sf.model.r -le 8) { $pref = 3 }  # DWMWCP_ROUNDSMALL (menu)
    if ([PrototyperNative]::DwmSetWindowAttribute($f.Handle, 33, [ref]$pref, 4) -eq 0) {
      $c = Col ([string]$sf.model.border)
      $cr = [int]$c.R + ([int]$c.G -shl 8) + ([int]$c.B -shl 16)
      [void][PrototyperNative]::DwmSetWindowAttribute($f.Handle, 34, [ref]$cr, 4)
      $sf.rounded = $true
      $f.Region = $null
    }
  }
  $f.Activate()
  if ($script:native) { [void][PrototyperNative]::SetForegroundWindow($f.Handle) }
}

function Hide-Surface($sf) {
  if ($sf.form.Visible) { $sf.form.Hide() }
}

function Set-Model([string]$name, $msg) {
  $sf = $script:surfaces[$name]
  $sf.model = $msg
  $sf.form.BackColor = Col ([string]$msg.bg)
  if ($sf.form.Visible) { Place-Surface $sf; $sf.form.Invalidate() }
}

New-Surface 'popup' $false
New-Surface 'menu' $true
$popupSf = $script:surfaces['popup']
$menuSf = $script:surfaces['menu']

# ===== Ikon tray: seperti prototype — logo, badge jumlah di kanan atas, titik pembaruan kanan bawah =====
$script:iconBmp = $null
function Set-Icon($st) {
  $size = [System.Windows.Forms.SystemInformation]::SmallIconSize.Width
  if ($size -lt 16) { $size = 16 }
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.TextRenderingHint = 'AntiAliasGridFit'
  # logo sedikit diperkecil ke kiri bawah agar badge menumpang di pojoknya (di prototype badge keluar dari logo)
  $L = [int][Math]::Round($size * 0.82)
  $dst = New-Object System.Drawing.Rectangle(0, ($size - $L), $L, $L)
  $ia = $null
  if ($st.paused) {
    $cm = New-Object System.Drawing.Imaging.ColorMatrix
    $cm.Matrix00 = 0.3; $cm.Matrix01 = 0.3; $cm.Matrix02 = 0.3
    $cm.Matrix10 = 0.59; $cm.Matrix11 = 0.59; $cm.Matrix12 = 0.59
    $cm.Matrix20 = 0.11; $cm.Matrix21 = 0.11; $cm.Matrix22 = 0.11
    $cm.Matrix33 = 0.6
    $ia = New-Object System.Drawing.Imaging.ImageAttributes
    $ia.SetColorMatrix($cm)
  }
  Draw-Logo $g $dst $ia
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Default
  # badge: hijau bila ada yang berjalan, abu-abu "0" bila tidak (seperti .badge.zero)
  $txt = if ($st.badge -gt 9) { '9+' } else { [string]$st.badge }
  $bd = [int][Math]::Round($size * 0.56)
  $bc = '#6b7280'
  if ($st.badge -gt 0) { $bc = '#16a34a' }
  $ring = New-Object System.Drawing.SolidBrush((Col '#202128'))
  $g.FillEllipse($ring, ($size - $bd - 1), -1, ($bd + 1), ($bd + 1))
  $g.FillEllipse((New-Object System.Drawing.SolidBrush((Col $bc))), ($size - $bd), 0, ($bd - 1), ($bd - 1))
  $font = New-Object System.Drawing.Font('Segoe UI', [single]($bd * 0.66), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = 'Center'; $fmt.LineAlignment = 'Center'
  $g.DrawString($txt, $font, [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF(($size - $bd), 0, ($bd - 1), ($bd - 1))), $fmt)
  if ($st.dot) {
    $d = [int][Math]::Round($size * 0.42)
    $g.FillEllipse($ring, ($size - $d - 1), ($size - $d - 1), ($d + 1), ($d + 1))
    $g.FillEllipse((New-Object System.Drawing.SolidBrush((Col '#d97706'))), ($size - $d), ($size - $d), ($d - 1), ($d - 1))
  }
  $g.Dispose()
  $old = $notify.Icon
  $notify.Icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
  if ($null -ne $old) { $old.Dispose() }
  if ($null -ne $script:iconBmp) { $script:iconBmp.Dispose() }
  $script:iconBmp = $bmp
  $tip = [string]$st.tooltip
  if ($tip.Length -gt 63) { $tip = $tip.Substring(0, 62) + [char]0x2026 } # batas NotifyIcon.Text di .NET Framework
  $notify.Text = $tip
}

# Untuk tes/pengecekan visual: gambar ke PNG tanpa menampilkan
function Save-Snapshot([string]$what, [string]$path) {
  if ($what -eq 'icon') {
    $z = 8
    $out = New-Object System.Drawing.Bitmap(($script:iconBmp.Width * $z), ($script:iconBmp.Height * $z))
    $g = [System.Drawing.Graphics]::FromImage($out)
    $g.Clear((Col '#202128'))
    $g.InterpolationMode = 'NearestNeighbor'; $g.PixelOffsetMode = 'Half'
    $g.DrawImage($script:iconBmp, 0, 0, $out.Width, $out.Height)
  } else {
    $sf = $script:surfaces[$what]
    $s = $script:scale
    $out = New-Object System.Drawing.Bitmap([int]($sf.model.w * $s), [int]($sf.model.h * $s), [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $g = [System.Drawing.Graphics]::FromImage($out)
    $g.Clear((Col ([string]$sf.model.bg)))
    Draw-Surface $g $sf
  }
  $g.Dispose()
  $out.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $out.Dispose()
  Send @{ t = 'snapshot'; path = $path }
}

function Quit {
  $script:quitting = $true
  $timer.Stop()
  foreach ($sf in $script:surfaces.Values) { $sf.form.Hide() }
  $notify.Visible = $false
  $notify.Dispose()
  [System.Windows.Forms.Application]::Exit()
}

function Handle($line) {
  $msg = $line | ConvertFrom-Json
  switch ($msg.t) {
    'popup' { Set-Model 'popup' $msg }
    'menu' { Set-Model 'menu' $msg }
    'icon' { Set-Icon $msg }
    'balloon' { $notify.ShowBalloonTip(5000, [string]$msg.title, [string]$msg.text, [System.Windows.Forms.ToolTipIcon]::None) }
    'exit' { Quit }
    'show' { Show-Surface $script:surfaces[[string]$msg.what] }
    'clickAt' { Click-At $script:surfaces[[string]$msg.what] ([double]$msg.x) ([double]$msg.y) }
    'snapshot' { Save-Snapshot ([string]$msg.what) ([string]$msg.path) }
  }
}

# Klik kiri ditunda sebentar agar klik dua kali tidak ikut membuka popup. Klik saat popup terbuka = tutup.
$clickTimer = New-Object System.Windows.Forms.Timer
$clickTimer.Interval = [Math]::Max(200, [System.Windows.Forms.SystemInformation]::DoubleClickTime)
$clickTimer.add_Tick({
  $clickTimer.Stop()
  try { if ($script:wasOpen) { Hide-Surface $popupSf } else { Show-Surface $popupSf } } catch { Err $_ }
})
$script:wasOpen = $false
$notify.add_MouseUp({
  param($s, $e)
  try {
    if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left) {
      $script:wasOpen = $popupSf.form.Visible
      $clickTimer.Stop(); $clickTimer.Start()
    } elseif ($e.Button -eq [System.Windows.Forms.MouseButtons]::Right) {
      Hide-Surface $popupSf
      Show-Surface $menuSf
    }
  } catch { Err $_ }
})
$notify.add_MouseDoubleClick({
  param($s, $e)
  if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left) { $clickTimer.Stop(); Send @{ t = 'open' } }
})

# [Console]::In.ReadLineAsync() memblokir di .NET Framework; StreamReader atas stream stdin benar-benar asinkron
$stdin = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), (New-Object System.Text.UTF8Encoding($false)))
$script:quitting = $false
$script:readTask = $stdin.ReadLineAsync()
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 50
$timer.add_Tick({
  try {
    foreach ($sf in $script:surfaces.Values) { if ($sf.form.Visible -and $sf.spinner) { $sf.form.Invalidate() } }
  } catch { Err $_ }
  while (-not $script:quitting -and $script:readTask.IsCompleted) {
    $line = $script:readTask.Result
    if ($null -eq $line) { Quit; return }
    $script:readTask = $stdin.ReadLineAsync()
    # pesan yang gagal diproses dilaporkan lalu dilewati, tidak diulang
    try { if ($line.Trim()) { Handle $line } } catch { Err $_ }
  }
})
$timer.Start()
Set-Icon @{ badge = 0; dot = $false; paused = $true; tooltip = 'Prototyper' }
$notify.Visible = $true
Send @{ t = 'ready' }
[System.Windows.Forms.Application]::Run()
`;
