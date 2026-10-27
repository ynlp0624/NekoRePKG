param(
    [string]$Python = "E:\repkg\.venv\Scripts\python.exe",
    [switch]$SkipOneFile,
    [switch]$SkipDir,
    [switch]$NoSign,
    [string]$SignProfile = "demo",
    [string]$CodesignScript = "D:\sing\codesign\codesign.ps1"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
Write-Host "== root: $root" -ForegroundColor Cyan

if (-not (Test-Path $Python)) { throw "python not found: $Python (use -Python)" }
if (-not (Test-Path "resources\RePKG.exe")) { throw "missing resources\RePKG.exe" }
if (-not (Test-Path "build\icon.ico")) {
    Write-Host "== generating icon" -ForegroundColor Cyan
    & $Python "build\make_icon.py"
}

$env:PYTHONIOENCODING = "utf-8"

$webArg = (Join-Path $root "app\web") + ";app\web"
$resArg = (Join-Path $root "resources") + ";resources"
$iconArg = Join-Path $root "build\icon.ico"
$verArg = Join-Path $root "build\version_info.txt"
$distOne = Join-Path $root "dist"
$workOne = Join-Path $root "build\work-onefile"
$specDir = Join-Path $root "build"
$distDir = Join-Path $root "build\dist-onedir"
$workDir = Join-Path $root "build\work-onedir"
$oneExe = Join-Path $distOne "NekoRePKG.exe"
$dirTarget = Join-Path $root "dist\NekoRePKG-win64"
$dirExe = Join-Path $dirTarget "NekoRePKG.exe"

$common = @(
    "--noconfirm", "--clean", "--windowed",
    "--name", "NekoRePKG",
    "--icon", $iconArg,
    "--version-file", $verArg,
    "--add-data", $webArg,
    "--add-data", $resArg,
    "--hidden-import", "webview.platforms.winforms",
    "--hidden-import", "webview.platforms.edgechromium",
    "--log-level", "WARN",
    (Join-Path $root "run_app.py")
)

if (-not $SkipOneFile) {
    Write-Host "== build onefile" -ForegroundColor Cyan
    & $Python -m PyInstaller @common --onefile --distpath $distOne --workpath $workOne --specpath $specDir
    if ($LASTEXITCODE -ne 0) { throw "onefile build failed" }
}

if (-not $SkipDir) {
    Write-Host "== build onedir" -ForegroundColor Cyan
    & $Python -m PyInstaller @common --onedir --distpath $distDir --workpath $workDir --specpath $specDir
    if ($LASTEXITCODE -ne 0) { throw "onedir build failed" }
    if (Test-Path $dirTarget) { Remove-Item $dirTarget -Recurse -Force }
    Move-Item (Join-Path $distDir "NekoRePKG") $dirTarget
}

# ------------------------------------------------------------------ 数字签名
if (-not $NoSign) {
    if (-not (Test-Path $CodesignScript)) {
        Write-Host "!! codesign script not found, skip signing: $CodesignScript" -ForegroundColor Yellow
    } else {
        $signTargets = @()
        if (-not $SkipOneFile) { $signTargets += $oneExe }
        if (-not $SkipDir) { $signTargets += $dirExe }
        foreach ($exe in $signTargets) {
            if (-not (Test-Path $exe)) { continue }
            Write-Host "== sign: $exe (profile=$SignProfile)" -ForegroundColor Cyan
            & $CodesignScript sign $exe -Profile $SignProfile -Timestamp
            $sig = Get-AuthenticodeSignature -FilePath $exe
            if ($sig.Status -ne 'Valid') {
                Write-Host ("!! signature status: {0} {1}" -f $sig.Status, $sig.StatusMessage) -ForegroundColor Yellow
            } else {
                Write-Host ("   ok: {0}" -f $sig.SignerCertificate.Subject)
            }
        }
    }
}

if (-not $SkipDir) {
    Copy-Item (Join-Path $root "README.md") (Join-Path $dirTarget "README.md") -ErrorAction SilentlyContinue
    Copy-Item (Join-Path $root "resources\THIRD-PARTY-NOTICES.txt") $dirTarget -ErrorAction SilentlyContinue
    $zip = Join-Path $root "dist\NekoRePKG-win64.zip"
    if (Test-Path $zip) { Remove-Item $zip -Force }
    Compress-Archive -Path $dirTarget -DestinationPath $zip -CompressionLevel Optimal
    Write-Host "== zip: $zip" -ForegroundColor Green
}

Write-Host "== done" -ForegroundColor Green
Get-ChildItem (Join-Path $root "dist") | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize
