# Architecture

## Stack

| Layer | Choice | Why |
|---|---|---|
| Desktop runtime | **Electron 45** | Native Windows integration: `.lnk` resolution, icon extraction, native dialogs, drag-and-drop paths, frameless fullscreen window, toast notifications, robust packaging. |
| Database | **SQLite via better-sqlite3 13** (N-API) | Embedded and transactional, with WAL, FTS5 full-text search and an online backup API. N-API means no native rebuild per Electron version. |
| UI | **Vanilla ES modules + CSS** | No framework and no bundler: zero build step, fast cold start, and modules are lazy-loaded per page. |
| Science engine | **Pure JS** (`src/shared/*.mjs`) | Deterministic and unit-tested with `node --test`; shared by the GUI, gsh and the tests. |
| Packaging | **electron-builder 26** | NSIS installer, portable EXE, version resource and icon. |

## Process model & security

```
┌──────────────── main process (Node) ─────────────────┐        ┌──────────── renderer (Chromium, sandboxed) ─────────────┐
│ main.js     window, lifecycle, single instance       │        │ app.js      boot → login → desktop, router, dock, keys  │
│ paths.js    data dirs, portable mode, 1.x migration  │  IPC   │ api.js      Proxy: api.tasks.create(...)                │
│ ipc.js      whitelisted service registry  ◄──────────┼────────┼─ modules/*  home, status, tasks, research, apps, tools… │
│ services/*  business logic (single source of truth)  │ invoke │ terminal/*  gsh engine, view, builtins, virtual FS      │
│ db/*        connection, migrations, generic repo     │        │ commands.js command registry (gsh + palette)            │
│ scheduler   notifications, automatic backups         │        │ shared/*    science engine, parsers, markdown           │
└──────────────────────────────────────────────────────┘        └─────────────────────────────────────────────────────────┘
```

- **Isolation:** `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`. The preload exposes only `invoke`, `pathForFile`, `setZoom` and two event channels.
- **IPC:** a single channel, `gos:invoke(service, method, args)`. Only functions registered in `ipc.js` can be called, and `security.*` settings can't be read or written from the renderer.
- **Content loading:** UI files are served from the privileged scheme `app://geneos/…`, which checks for path traversal and sets explicit MIME types. Library previews use `gosfile://file/<id>`, which resolves record ids to paths, so the renderer never gets arbitrary file access. A strict CSP is applied, and navigation away from the app is blocked.
- **No duplicated logic:** GUI buttons, palette actions and gsh commands all call the same `api.<service>.<method>`.

## Renderer composition

- **Shell (`app.js`)**: defines `MODULES` (id, label, icon, color, group, digit, Alt-key, description). `nav()` unmounts the current module, sets `--mod` (the module accent), renders the page header and mounts the module into `.page-body`. Every module exports `{ id, mount(el, params, ctx), unmount() }`.
- **Boot (`boot.js`)**: POST → logo + helix + real start-up checks with a progress bar → an `onReady` hand-off that builds the desktop and the login screen *underneath* the boot overlay, so the transition reveals a finished screen.
- **Lock (`lock.js`)**: login and lock overlay. The PIN is verified by `security.verifyPin` in the main process.
- **Terminal**
  - `terminal/shell.js`: a single session (scrollback DOM nodes, history, aliases, cwd). It handles tokenizing, aliases, history expansion, chaining, pipelines into text filters, a screen IO and a capture IO (for pipes), highlighting and completion.
  - `terminal/view.js`: window chrome, powerline prompt, an input overlay for highlighting and history suggestions, and the completion popup. It can be mounted anywhere (Home widget, Terminal module).
  - `terminal/vfs.js`: maps `~/research/<project>/<section>` and similar paths onto services.
  - `terminal/builtins.js`: gfetch, filesystem, system, science, utilities and pipe filters. These are merged into `commands.js`.
- **Design layers**: `styles/app.css` holds the base tokens and components; `styles/os.css` holds the Gene OS layer (dock, page frame, bento, terminal, boot, lock, apps, tools).
- **Home (`modules/home.js`)**: a `WIDGETS` registry (render function, icon, color, link) and `PRESETS` (CSS grid columns, rows and `grid-template-areas` with slots `s1…sN` plus `term`). The slot → widget assignment per preset is stored in the `home.slots` setting; tiles get `--area` and the grid gets `--cols/--rows/--areas`.
- **Calendar (`calendar.js`, `shared/jalali.mjs`)**: week start, Jalali display and month grids. Jalali conversion uses ICU's `persian` calendar via `Intl`; Jalali → Gregorian searches around an arithmetic estimate and verifies every candidate with ICU.
- **Icons**: `icons.js` is an original 24×24 line-icon set (75 icons) rendered as inline SVG. `appicon.js` renders application icons stored as PNG data URLs or `glyph:<text>|<color>`.

## Data model (SQLite)

- **Schema v1:** `settings` · `tasks` · `task_templates` · `projects` · `proposal_sections` → `section_versions` · `milestones` · `courses` → `course_topics`, `flashcards` · `notes` · `collections` · `files` · `apps` · `bookmarks` · `activity` · `notifications` · `clipboard` · `command_history` · `aliases` · `time_logs` · `search_fts` (FTS5)
- **Schema v2:** adds `tool_runs` (the saved calculation history of the Tools module)
- **Migrations** live in an append-only list in `src/main/db/migrations.js`. Each runs in its own transaction and bumps `PRAGMA user_version`. On first start, `paths.js` copies a Gene Terminal 1.x data folder into the Gene OS location and renames the database file; it never deletes the old folder.

## App icon pipeline

`services/apps.js` tries, in order:
1. the shortcut's icon location (env vars expanded, `file,index` honoured via `ExtractIconEx`),
2. the resolved target executable,
3. the registered file itself.

For each candidate it uses `nativeImage` for image files and `app.getFileIcon` (rejecting empty or fully transparent bitmaps), then falls back to a PowerShell/.NET extractor. Results are normalised to 64×64 PNG data URLs. `repairIcons()` re-runs the pipeline for every app without a custom icon.

## Extending

- **Calculator:** add an object to `EXTRA_CALCULATORS` in `src/shared/calc_extra.mjs` (`inputs`, `compute`, `formula`, `assumptions`, `example`). It automatically appears in Tools, the palette, gsh (`tool <id> k=v`) and the virtual FS, and the "every example runs" test covers it.
- **gsh command:** add an entry to `BUILTINS` in `terminal/builtins.js` (or `commands` in `commands.js`). Set `palette: 'Label'` to list it in `Ctrl+K`, `filter(lines, args, flags)` to make it a pipe filter, and `completePath` / `complete()` for Tab completion.
- **Backend method:** implement it in a service, register it in `src/main/ipc.js`, and call it as `api.<service>.<method>()`.
- **Module:** create `src/renderer/js/modules/<id>.js` and add it to `MODULES` (icon, color, group, keys).

## Performance
- Modules are imported on first use and preloaded in idle time.
- The Home metrics poll is cheap (`os` counters, every 2 s, only while Home is visible).
- The dashboard uses one aggregated query.
- The terminal appends DOM nodes incrementally with a capped scrollback and rAF-batched scrolling, and has no artificial delays.
- The boot pacing collapses to zero on any key press.
- Dense BLUP and A-matrix computations are capped (1,200 and 3,000 animals).
