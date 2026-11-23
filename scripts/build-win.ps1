# Gene OS — Windows build script (PowerShell)
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\build-win.ps1 [-Clean] [-Portable] [-Installer]
param([switch]$Clean, [switch]$Portable, [switch]$Installer)
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

Write-Host '== Gene OS build ==' -ForegroundColor Cyan
node --version | Out-Null; if ($LASTEXITCODE -ne 0) { throw 'Node.js 22+ is required (https://nodejs.org)' }

if ($Clean) { node scripts/clean.cjs }
if (-not (Test-Path node_modules)) { npm install; if ($LASTEXITCODE -ne 0) { throw 'npm install failed' } }

Write-Host '-- running tests' -ForegroundColor Cyan
npm test; if ($LASTEXITCODE -ne 0) { throw 'Unit tests failed' }
npm run test:db; if ($LASTEXITCODE -ne 0) { throw 'Database smoke test failed' }

Write-Host '-- packaging' -ForegroundColor Cyan
if ($Portable -and -not $Installer) { npm run build:portable }
elseif ($Installer -and -not $Portable) { npm run build:installer }
else { npm run build }
if ($LASTEXITCODE -ne 0) { throw 'Packaging failed' }

Write-Host "`nDone. Output in .\dist" -ForegroundColor Green
Get-ChildItem dist -Filter *.exe | ForEach-Object { Write-Host ('  ' + $_.Name + '  (' + [math]::Round($_.Length / 1MB, 1) + ' MB)') }
