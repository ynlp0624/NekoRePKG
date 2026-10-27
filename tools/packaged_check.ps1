param(
    [Parameter(Mandatory = $true)][string]$Exe,
    [string]$Shot = "E:\repkg\shots\app-live.png",
    [int]$WaitSeconds = 20
)

$ErrorActionPreference = "Stop"
$log = Join-Path $env:APPDATA "NekoRePKG\logs\app.log"
$startSize = 0
if (Test-Path $log) { $startSize = (Get-Item $log).Length }

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class Win32Close {
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassNameW(IntPtr hWnd, StringBuilder text, int count);
    public static IntPtr FindMainWindowByTitle(string contains) {
        IntPtr found = IntPtr.Zero;
        EnumWindows(delegate(IntPtr h, IntPtr l) {
            if (!IsWindowVisible(h)) return true;
            StringBuilder sb = new StringBuilder(512);
            GetWindowTextW(h, sb, 512);
            if (sb.ToString().Contains(contains)) { found = h; return false; }
            return true;
        }, IntPtr.Zero);
        return found;
    }
}
"@

Write-Host "== start $Exe"
$t0 = Get-Date
$proc = Start-Process -FilePath $Exe -PassThru
$url = $null
$deadline = (Get-Date).AddSeconds($WaitSeconds + 25)
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 500
    if (Test-Path $log) {
        $content = Get-Content $log -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
        if ($content) {
            $urlMatches = [regex]::Matches([string]$content, 'http://127\.0\.0\.1:\d+/')
            if ($urlMatches.Count -gt 0) { $url = $urlMatches[$urlMatches.Count - 1].Value; break }
        }
    }
    if ($proc.HasExited) { break }
}
Write-Host ("URL={0} alive={1} readyAfter={2:N1}s" -f $url, (-not $proc.HasExited), ((Get-Date) - $t0).TotalSeconds)
if ($proc.HasExited) {
    Write-Host "!! process exited early, exit=$($proc.ExitCode)"
    exit 1
}

# 等待首屏渲染
Start-Sleep -Seconds $WaitSeconds

Write-Host "== API"
try {
    $state = Invoke-RestMethod -Uri ($url + "api/state") -TimeoutSec 20
    Write-Host ("repkg ok={0} version={1}" -f $state.repkg.ok, $state.repkg.version)
    Write-Host ("theme={0} jobs={1}" -f $state.settings.theme, ($state.jobs | ConvertTo-Json -Compress))
    $ws = Invoke-RestMethod -Uri ($url + "api/workshop") -TimeoutSec 60
    Write-Host ("workshop items={0} steam={1}" -f ($ws.items | Measure-Object).Count, $ws.steam_root)
} catch {
    Write-Host "API FAILED: $_"
}

# 截图
Write-Host "== screenshot"
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$gfx.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$bmp.Save($Shot, [System.Drawing.Imaging.ImageFormat]::Png)
$gfx.Dispose(); $bmp.Dispose()
Write-Host "saved $Shot"

# 优雅关闭：给主窗口发 WM_CLOSE（onefile 的窗口属于子进程，按标题找）
$hwnd = [Win32Close]::FindMainWindowByTitle("NekoRePKG")
Write-Host "hwnd=$hwnd"
if ($hwnd -ne [IntPtr]::Zero) {
    [Win32Close]::PostMessage($hwnd, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
}

$exited = $proc.WaitForExit(20000)
Write-Host "window close -> exit=$exited code=$($proc.ExitCode)"
Start-Sleep -Seconds 2
$left = @(Get-Process NekoRePKG -ErrorAction SilentlyContinue)
Write-Host ("leftover NekoRePKG processes: {0}" -f $left.Count)
if ($left.Count -gt 0) { $left | Stop-Process -Force }
