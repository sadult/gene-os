# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [2.1.0] — 2026-11-24

### Added
- **Customizable Home desktop**: layout presets *Balanced*, *Terminal*, *Widgets* and *Focus*. In customize mode (⊞ button, `home edit`, palette, or Settings) you can swap widgets by dragging headers or with the slot menu, and reset a layout. Arrangements are remembered per preset. The `home layout <preset>` command switches presets.
- New Home widgets: **Quick note** (appends to the scratchpad), **Mini calendar** (deadline dots, Jalali day numbers, configurable week start) and **Bookmarks**.
- **REML variance components** in the BLUP workspace:
  - a profile-likelihood method (Cholesky + golden-section search) with standard errors and a likelihood plot;
  - EM-REML that runs in chunks with live progress and a Stop button;
  - a "Use ĥ² and solve BLUP" action, and simulated example data.
- **Calendar & region** (Settings → Appearance): week start (Saturday / Sunday / Monday) and Jalali (Solar Hijri) dates on Home, the task calendar and the lock screen.
- **Iranian work week (Sat–Wed)** recurrence for tasks.
- gsh: `jdate`, `cal -j`, Jalali dates in `date`, `home edit`, `home layout`.
- Tools: **Date converter (Gregorian ↔ Jalali)** with date differences and adding days (63 calculators).

## [2.0.0] — 2026-11-23 — Gene OS

### Changed
- **Renamed to Gene OS** (product name, executable `GeneOS.exe`, app id `ir.10ck.geneos`, data folder `%APPDATA%\Gene OS`). Gene Terminal 1.x data is migrated automatically on first start; the old folder is left untouched.
- The former dashboard is now the **Status** module (KPI strip + configurable widgets).
- Clicking an application opens its **overview page**; programs start only from **LAUNCH** (or an explicit ▶ / `apps launch`).
- Profile editing moved to **Settings → Profile**; the Profile page is a clean ID card.
- `about` and `tools` print in the terminal instead of switching pages; `exit` asks for confirmation.

### Added
- OS-style boot (POST → logo, helix and real start-up checks with progress → hand-off), a **login / lock screen** with an optional PIN, and `Ctrl+Alt+L`.
- **Home**: a bento desktop with the terminal at its center and widgets for profile, system overview, app launcher, pending tasks, progress, quick shortcuts, recent items, deadlines and focus.
- A grouped icon **dock**, a 75-icon line set, a per-module color identity, page headers with breadcrumbs, and Alt+letter navigation.
- **gsh 2.0**: powerline prompt (3 styles), live highlighting, history suggestions, Tab completion (commands, paths, apps, tools), pipes with `grep/head/tail/sort/uniq/wc/nl`, `!!` history expansion, a virtual filesystem (`pwd/cd/ls/tree/cat/open`), `gfetch`, `top`, `uptime`, `dna`, `cal`, `timer`, `export`, `which`, `prompt`, `tip`, `lock`, `reboot`, `shutdown`, `apps info`, `apps open`.
- **Tools**: a home page (categories, favorites, most used, recent runs), a DB-backed run history (schema v2 `tool_runs`), reset to defaults, export to CSV / Markdown / JSON / Notes, decimal-place and live-calculation preferences, and a new **Genomics & Sequence** category.
- 18 calculators: realized h², heterosis, crossbreeding heterosis retention, F-statistics, Nei distance, selection on allele frequency, Punnett cross, map distance (Haldane/Kosambi), LD (D, D′, r²), DNA sequence toolkit (GC, Tm, translation, ORFs), VanRaden G, milk FCM/ECM, 205-day weaning weight, gestation/incubation calendar, t-tests, χ² tests, Wilson CI and dilution.
- Apps: icon editor (file / glyph / re-detect), **Repair icons**, custom groups list, richer version metadata.
- Settings: Profile, Terminal and Login/PIN sections, and a module-colors toggle.
- GitHub project files: CI, issue/PR templates, contributing guide, code of conduct, security policy and docs (terminal, tools).

### Fixed
- **App icons not shown after adding apps**: shortcut icon locations with environment variables or icon indices, MSI-advertised shortcuts and blank bitmaps returned by the OS are now handled, with a PowerShell fallback; icons are stored as normalized 64 px PNG.
- Conditional UI children no longer render as the text "null"/"false".
- CSS custom properties passed through the DOM builder are applied correctly.

## [1.0.0] — 2026-11-23 — Gene Terminal
- Initial release: fullscreen terminal-style workstation with tasks, research, courses, library, apps, terminal, bookmarks, genetics toolbox (44 calculators + 5 workspaces), profile, notes, settings, backups and Windows packaging.
