param(
    [string]$Token = $env:GITCODE_TOKEN,
    [string]$Owner = 'gcw_YiSvwnI0',
    [string]$Repo = 'NekoRePKG',
    [string]$Source = 'E:\repkg\RePKG-GUI'
)
$ErrorActionPreference = 'Continue'
if (-not $Token) { throw 'GITCODE_TOKEN missing' }
$work = Join-Path $env:TEMP ('nekorepkg-gitcode-' + [guid]::NewGuid().ToString('N').Substring(0, 6))
$remote = "https://oauth2:$Token@gitcode.com/$Owner/$Repo.git"

Write-Host "== clone $Owner/$Repo"
git clone --depth 1 $remote $work 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) {
    Write-Host "clone failed (maybe empty repo), init instead"
    New-Item -ItemType Directory -Force $work | Out-Null
    git -C $work init -b main 2>&1 | Out-Host
    git -C $work remote add origin $remote
}

Write-Host "== copy files"
$excludeDirs = @('.venv', 'dist', '__pycache__', 'work-onefile', 'work-onedir', 'dist-onedir', '_work', 'shots', '.git')
$excludeFiles = @('*.spec', '*.pyc', '*.log')
$xd = $excludeDirs | ForEach-Object { "/XD"; $_ }
$xf = $excludeFiles | ForEach-Object { "/XF"; $_ }
& robocopy $Source $work /E /NFL /NDL /NJH /NJS @xd @xf | Out-Host
if ($LASTEXITCODE -ge 8) { throw "robocopy failed: $LASTEXITCODE" }

Write-Host "== commit & push"
git -C $work config user.name 'NekoShizuku'
git -C $work config user.email 'gcw_YiSvwnI0@noreply.gitcode.com'
git -C $work add -A
git -C $work commit -m "release: NekoRePKG v1.0.0 (source + docs site)" 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) { Write-Host "nothing to commit?" }
git -C $work push origin main 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) { throw "push failed" }
Write-Host "== DONE https://gitcode.com/$Owner/$Repo"
Write-Host "workdir: $work"
