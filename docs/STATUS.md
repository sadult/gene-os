# Feature status, verification & limitations

## How Gene OS 2.0 was verified

| Check | Result |
|---|---|
| Science engine unit tests: distributions vs. reference tables, selection intensity, A and A⁻¹ (with inbreeding), **BLUP reproducing Mrode Example 3.1**, mating F, all 62 calculator examples, and reference values for the 18 new calculators (FST, Nei D, Haldane/Kosambi, LD, Mendel 9:3:3:1 χ² = 0.470, Student t, Wilson CI, Punnett 9/16, gestation date, sequence translation/ORFs …), plus pipes and history expansion | **62/62 passing** in the build sandbox |
| Schema v2 migration, tool-history pruning and settings reset queries run on a real SQLite engine | passing |
| Every renderer `api.service.method()` call (328 call sites) matched against the main-process registry; all imports/exports and all 58 used icon names resolved; all 62 source files parse | passing |
| UI harness (minimal DOM + mocked IPC): boot → desktop, all 14 modules with page headers, every sub-tab, the Home bento widgets, Apps (click → overview, no launch; LAUNCH launches; icon editor), Profile (no inline editing), Settings (7 sections), Tools home, **all 73 tools with examples**, reset-to-defaults, save to history, export → Notes, Status KPIs, **54 gsh commands** including pipes, `!!`, cd/ls/cat, gfetch, input highlighting, completion, and the lock screen | **157/157 passing** |
| **Not run in the build environment:** the Electron main process on Windows (window, dialogs, `.lnk` resolution, icon extraction, launching programs, notifications, GPU/display info, packaging). These use documented Electron and Windows APIs; `npm start` followed by `npm run test:db` on Windows is the acceptance step. |

## Added in 2.1
- **Customizable Home**: 4 layout presets, swapping widgets by drag or slot menu, per-preset memory, reset, and three new widgets (quick note, mini calendar, bookmarks).
- **REML variance components** in the BLUP workspace: a fast profile-likelihood method with SEs and a likelihood plot, plus resumable EM with progress and Stop. Verified against an independent NumPy REML maximization (estimates to 4 decimals, Δlog L to 1e-6, matching SEs).
- **Calendar & region**: Jalali dates via ICU (anchored to known Nowruz dates; daily round trip over 3 years), a choice of week start, Sat–Wed recurrence, `jdate`, `cal -j`, and the Date converter tool.
- **Verification for 2.1**: 67/67 engine checks and 181/181 interface checks in the build sandbox.

## Implemented in 2.0
- OS-style boot (POST, logo, real checks, progress, skippable), login/lock screen with optional PIN, and the Gene OS identity throughout.
- A grouped icon dock, a per-module color identity, page headers with breadcrumbs, and Alt+letter navigation.
- The Home bento desktop with 10 widgets around a live terminal; the former dashboard moved to **Status** with a KPI strip.
- gsh 2.0: powerline prompt, highlighting, history suggestions, completion, pipes and filters, history expansion, virtual filesystem, `gfetch`, `top`, `dna`, `cal`, `timer`, `export`, `lock`/`reboot`/`shutdown`, `which`, `prompt`, `tip`. No more surprise navigation: `about` and `tools` print output instead of switching pages.
- Apps: a multi-strategy icon pipeline, an overview page with a Launch button, an icon editor (file / glyph / re-detect) and Repair icons.
- Tools: a home page, favorites, most used, recent runs, a DB-backed history, reset to defaults (per tool and globally), export to CSV/MD/JSON/Notes, precision and live-calculation preferences, and 18 new calculators.
- Profile editing moved into Settings; new Terminal settings; module-colors toggle.
- Automatic migration of Gene Terminal 1.x data.

## Limitations
- **PIN** is a privacy screen only; the database is not encrypted.
- **PDF** previews open in a separate viewer window. **DOCX/XLSX/PPTX** have no built-in preview and open in their own programs.
- **Math** in Markdown uses a light TeX → Unicode prettifier, not full LaTeX.
- **BLUP / REML workspace:** single-trait, one fixed effect, dense solvers (BLUP ≤ 1,200 animals, profile REML ≤ 2,500, EM ≤ 800). There are no maternal or permanent-environment effects and no multi-trait models. Use BLUPF90/AIREMLF90 for production analyses.
- **Mating planner:** a greedy minimum-F heuristic, not optimal-contribution selection.
- **Sequence toolkit:** works on the forward strand for ORFs; Tm is a rough estimate.
- **Icon extraction & version info** need PowerShell (built into Windows 10/11) for the fallback paths. Without it, Electron's own extractor is used.
- **System overview** reports system-wide CPU and memory from OS counters; GPU names come from Chromium's GPU info and can be generic on some drivers.
- Home widgets can be swapped between the slots of 4 preset layouts, but slots can't be resized freely. The Status page widgets can be reordered and hidden.
- gsh is not a system shell: it runs Gene OS commands, not arbitrary executables. Launch programs through Apps.
- The UI is left-to-right (Persian text and digits are accepted, and Jalali dates are shown in English transliteration plus Persian in `jdate`). Jalali display relies on the ICU data built into Electron.
- There are no automatic updates, and code signing is not configured.
