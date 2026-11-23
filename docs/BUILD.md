# Build, packaging & debugging

## Prerequisites
- Windows 10/11 x64, **Node.js ≥ 22** (LTS recommended), PowerShell.
- No Visual Studio / Python needed: better-sqlite3 13 ships prebuilt N-API binaries. (If a prebuilt binary is unavailable for your platform, npm falls back to compiling, which needs "Desktop development with C++" build tools.)

## Development
```powershell
npm install
npm start          # run
npm run dev        # run + DevTools
npm test           # engine unit tests
npm run test:db    # database/services smoke test
```
Set `GENEOS_DEBUG=1` to mirror log lines to the console: `$env:GENEOS_DEBUG=1; npm start`.

## Production build
```powershell
npm run build              # NSIS installer + portable EXE in .\dist
npm run build:installer
npm run build:portable
npm run build:dir          # unpacked .\dist\win-unpacked\GeneOS.exe (quickest smoke test)
powershell -ExecutionPolicy Bypass -File scripts\build-win.ps1 -Clean   # clean + install + test + package
```
Outputs: `dist\GeneOS-Setup-2.1.0.exe` (per-user installer, optional install folder, Start-menu + desktop shortcuts, uninstaller keeps data) and `dist\GeneOS-Portable-2.1.0.exe` (single file, data next to it).

## Metadata & version
- Product name, version, author, copyright and app id come from `package.json` and `electron-builder.yml` and are embedded in the EXE's version resource.
- Bump `version` in `package.json` for each release and add a CHANGELOG entry; the About screen reads the version at runtime.

## Replacing the icon
1. Create a square PNG ≥ 512 px.
2. Convert to a multi-size `.ico` (16, 24, 32, 48, 64, 128, 256) — e.g. with ImageMagick: `magick icon.png -define icon:auto-resize=256,128,64,48,32,24,16 build\icon.ico`.
3. Replace `build\icon.ico` (EXE, installer, window, taskbar) and optionally `build\icon.png`, `src\renderer\assets\icon-128.png`.
4. Rebuild. Windows caches icons — if the old one persists, sign out/in or run `ie4uinit.exe -show`.

## Code signing (optional)
Unsigned EXEs trigger a SmartScreen warning on first launch ("More info → Run anyway"). To sign, set `CSC_LINK` (path/URL to a .pfx) and `CSC_KEY_PASSWORD` before `npm run build`; electron-builder signs automatically.

## Debugging
- **Logs:** `%APPDATA%\Gene OS\data\logs\gene-os.log` (Settings → Data → Open logs; terminal: `logs`). Main-process errors, failed service calls and renderer errors are all written there.
- **DevTools:** `F12` or `Ctrl+Shift+I` in the app (also in packaged builds). `window.__os.nav('tools')` etc. works in the console.
- **Startup failure:** an error dialog shows the message and log path. Typical causes: the data folder is not writable, or the DB is locked by another process (only one instance runs; a second launch focuses the first).
- **App won't launch a program:** check *Edit → Detected* in the Apps module; elevation-required programs fall back to the Windows shell (UAC prompt); MSI "advertised" shortcuts are always launched through the shell.
- **Search returns nothing:** Settings → Data → *Rebuild search index* (terminal: `reindex`).

## Clean rebuild
```powershell
npm run clean            # removes dist/
node scripts/clean.cjs --all   # also removes node_modules
npm install
npm run build
```
