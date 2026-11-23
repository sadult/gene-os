# Contributing to Gene OS

Thanks for helping! Gene OS is a personal research environment, so contributions that make it more useful for animal breeding & genetics research are especially welcome: new validated calculators, gsh commands, importers, fixes and documentation.

## Getting started
```powershell
git clone https://github.com/sadult/gene-os.git
cd gene-os
npm install
npm run dev        # app + DevTools
npm run test:all   # engine unit tests + database smoke test
```
Node.js 22+ on Windows 10/11 is required for the full app; the science engine tests (`npm test`) also run on macOS and Linux.

## Ground rules
- **Keep it local-first.** No telemetry, accounts or network calls for core features.
- **One source of truth.** Business logic belongs in `src/main/services/*` and is exposed through `src/main/ipc.js`. The GUI, palette and gsh must call the same service — never duplicate logic in the renderer.
- **Science must be verifiable.** Every calculator needs `formula`, `assumptions` and a working `example`, and a test against a published or hand-checked reference value in `tests/shared.test.mjs`.
- **No placeholders.** If something is partial, document it in `docs/STATUS.md` instead of shipping a button that does nothing.
- **Schema changes** go in a *new* migration in `src/main/db/migrations.js`; never edit an applied one.
- **Security:** the renderer stays sandboxed; don't add Node access to the preload or bypass the IPC whitelist.

## Style
- Modern JavaScript (ES2022), 2-space indentation, single quotes, semicolons (see `.editorconfig`).
- Small modules with a clear header comment. UI is vanilla DOM via the `h()` helper in `src/renderer/js/ui.js`.
- New UI uses the design tokens in `styles/app.css` / `styles/os.css` and icons from `src/renderer/js/icons.js`.

## Pull requests
1. Create a branch: `feat/<short-name>` or `fix/<short-name>`.
2. Add or update tests and docs (README, `docs/*`, `CHANGELOG.md` under *Unreleased*).
3. Run `npm run test:all` and check the app manually (`npm start`).
4. Open a PR using the template; describe what you changed and how you verified it.

## Reporting bugs
Use the *Bug report* issue template. Include your Windows version, the Gene OS version (`version` in gsh), steps to reproduce, and the relevant lines from `%APPDATA%\Gene OS\data\logs\gene-os.log` (gsh: `logs`).
