// Captura SÓ a faixa superior da janela do Dota (onde ficam os 10 retratos), via .NET do Windows.
// Regras fixas: nunca o minimapa, nunca a tela inteira; quem decide quando capturar é o match.js.
import { spawn } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './paths.js';

// Altura da faixa capturada, em fração da altura da janela (a barra de heróis fica no topo).
export const STRIP_FRACTION = 0.09;
export const LAST_CAPTURE_PNG = path.join(DATA_DIR, 'ultima-barra.png');

function runPowerShell(script, env, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
      env: { ...process.env, ...env },
      windowsHide: true,
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out.trim());
      else reject(new Error(err.trim() || `PowerShell saiu com código ${code}`));
    });
  });
}

const NATIVE = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class DmWin {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref POINT p);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  public struct RECT { public int Left, Top, Right, Bottom; }
  public struct POINT { public int X, Y; }
}
'@
[DmWin]::SetProcessDPIAware() | Out-Null
`;

// Saída: bytes RGB da faixa em DM_RAW, PNG em DM_PNG e uma linha JSON com as medidas.
const CAPTURE_SCRIPT = `${NATIVE}
$frac = [double]::Parse($env:DM_FRAC, [Globalization.CultureInfo]::InvariantCulture)
if ($env:DM_FILE) {
  $src = [Drawing.Bitmap]::FromFile($env:DM_FILE)
  $W = $src.Width; $H = $src.Height; $source = 'arquivo'
  $sh = [int][Math]::Ceiling($H * $frac)
  $bmp = $src.Clone((New-Object Drawing.Rectangle 0, 0, $W, $sh), [Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $src.Dispose()
} else {
  $p = Get-Process dota2 -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if ($p -and -not [DmWin]::IsIconic($p.MainWindowHandle)) {
    $r = New-Object DmWin+RECT; [DmWin]::GetClientRect($p.MainWindowHandle, [ref]$r) | Out-Null
    $pt = New-Object DmWin+POINT; [DmWin]::ClientToScreen($p.MainWindowHandle, [ref]$pt) | Out-Null
    $X = $pt.X; $Y = $pt.Y; $W = $r.Right; $H = $r.Bottom; $source = 'janela do Dota'
  } else {
    $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $X = $b.X; $Y = $b.Y; $W = $b.Width; $H = $b.Height; $source = 'tela principal'
  }
  $sh = [int][Math]::Ceiling($H * $frac)
  $bmp = New-Object Drawing.Bitmap $W, $sh, ([Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($X, $Y, 0, 0, $bmp.Size)
  $g.Dispose()
}
$bmp.Save($env:DM_PNG, [Drawing.Imaging.ImageFormat]::Png)
$rect = New-Object Drawing.Rectangle 0, 0, $W, $sh
$data = $bmp.LockBits($rect, [Drawing.Imaging.ImageLockMode]::ReadOnly, [Drawing.Imaging.PixelFormat]::Format24bppRgb)
$bytes = New-Object byte[] ($data.Stride * $sh)
[Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
$bmp.UnlockBits($data); $bmp.Dispose()
[IO.File]::WriteAllBytes($env:DM_RAW, $bytes)
@{ width = $W; height = $sh; windowHeight = $H; stride = $data.Stride; source = $source } | ConvertTo-Json -Compress
`;

// Recorta o centro de cada retrato e reduz para TW x TH (base para o reconhecimento).
const TEMPLATES_SCRIPT = `${NATIVE}
$tw = [int]$env:DM_TW; $th = [int]$env:DM_TH
$c = $env:DM_CROP.Split(',') | ForEach-Object { [double]::Parse($_, [Globalization.CultureInfo]::InvariantCulture) }
$files = Get-ChildItem -Path $env:DM_DIR -Filter *.png | Sort-Object Name
$out = New-Object IO.FileStream($env:DM_OUT, [IO.FileMode]::Create)
$names = @()
foreach ($f in $files) {
  try { $img = [Drawing.Bitmap]::FromFile($f.FullName) } catch { continue }
  $src = New-Object Drawing.RectangleF ($img.Width * $c[0]), ($img.Height * $c[2]), ($img.Width * ($c[1] - $c[0])), ($img.Height * ($c[3] - $c[2]))
  $small = New-Object Drawing.Bitmap $tw, $th, ([Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [Drawing.Graphics]::FromImage($small)
  $g.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($img, (New-Object Drawing.RectangleF 0, 0, $tw, $th), $src, [Drawing.GraphicsUnit]::Pixel)
  $g.Dispose(); $img.Dispose()
  $buf = New-Object byte[] ($tw * $th * 3); $k = 0
  for ($y = 0; $y -lt $th; $y++) { for ($x = 0; $x -lt $tw; $x++) {
    $px = $small.GetPixel($x, $y); $buf[$k] = $px.R; $buf[$k + 1] = $px.G; $buf[$k + 2] = $px.B; $k += 3 } }
  $small.Dispose()
  $out.Write($buf, 0, $buf.Length)
  $names += $f.BaseName
}
$out.Close()
ConvertTo-Json -Compress @($names)
`;

// Captura a faixa (da janela do Dota, ou de um arquivo de imagem para testes/calibração).
export async function captureStrip({ file = process.env.DOTAMOBRAL_TEST_IMAGE } = {}) {
  const raw = path.join(DATA_DIR, 'ultima-barra.raw');
  const meta = JSON.parse(await runPowerShell(CAPTURE_SCRIPT, {
    DM_FRAC: String(STRIP_FRACTION),
    DM_PNG: LAST_CAPTURE_PNG,
    DM_RAW: raw,
    DM_FILE: file ?? '',
  }));
  const bytes = readFileSync(raw);
  rmSync(raw, { force: true });
  // BGR com "stride" (linhas alinhadas) -> RGB contínuo.
  const rgb = new Uint8Array(meta.width * meta.height * 3);
  for (let y = 0; y < meta.height; y++) {
    for (let x = 0; x < meta.width; x++) {
      const s = y * meta.stride + x * 3;
      const d = (y * meta.width + x) * 3;
      rgb[d] = bytes[s + 2];
      rgb[d + 1] = bytes[s + 1];
      rgb[d + 2] = bytes[s];
    }
  }
  return { ...meta, rgb };
}

export async function buildTemplateFile({ dir, out, width, height, crop }) {
  const names = JSON.parse(await runPowerShell(TEMPLATES_SCRIPT, {
    DM_DIR: dir,
    DM_OUT: out,
    DM_TW: String(width),
    DM_TH: String(height),
    DM_CROP: [crop.x0, crop.x1, crop.y0, crop.y1].join(','),
  }, 180000));
  return Array.isArray(names) ? names : [names];
}
