// About / developer / version / licenses / changelog.
import { api } from '../api.js';
import { h, clear, kv, toastError } from '../ui.js';
import { render } from '../../../shared/markdown.mjs';

import { logoNode } from '../boot.js';

const CHANGELOG = `### 2.1.0
- Customizable Home desktop: 4 layout presets, swap widgets, new Quick note / Calendar / Bookmarks widgets
- REML variance components in the BLUP workspace (profile likelihood with SEs, EM with progress)
- Calendar & region: Jalali dates, week start, Iranian work-week recurrence, \`jdate\`, \`cal -j\`, Date converter

### 2.0.0 — Gene OS
- Renamed to **Gene OS**; data from Gene Terminal 1.x is migrated automatically
- OS-style boot (POST → logo & module loading → hand-off) and login / lock screen with optional PIN
- New Home desktop: bento grid with the gsh terminal at its center, app launcher, system overview, tasks, progress, quick shortcuts, recent items, deadlines and focus timer
- Former dashboard moved to **Status** (KPI strip + configurable widgets)
- Grouped dock with icons and a distinct color identity per module; page headers with breadcrumbs
- gsh 2.0: powerline prompt, live syntax highlighting, history suggestions, Tab completion, pipes (grep/head/tail/sort/uniq/wc/nl), !! history expansion, virtual filesystem (cd/ls/cat/tree/open), gfetch, top, dna, cal, timer, export
- Apps: reliable icon extraction (shortcut icon locations, env vars, icon indices, blank-icon detection, PowerShell fallback), app overview page with Launch button, icon editor (file / glyph / re-detect), repair icons
- Tools: tools home with categories, favorites and recent runs, run history (DB), reset to defaults, export to CSV / Markdown / JSON / Notes, decimal-place and live-calculation preferences, 18 new calculators (genomics, F-statistics, Nei distance, selection on allele frequency, heterosis, crossbreeding, t-test, χ², Wilson CI, milk ECM, weaning weight, gestation calendar, dilution, …)
- Profile editing moved to Settings → Profile; new Terminal settings section

### 1.0.0 — initial release (Gene Terminal)
- Fullscreen terminal-style shell with DNA boot sequence, module tabs, command palette (Ctrl+K) and global full-text search
- Tasks (list, kanban, calendar, today/upcoming/overdue/completed, priority matrix, subtasks, recurrence, templates, timer, pomodoro)
- Research workspace (16-section proposal editor with autosave & version history, Gantt timeline, thesis checklist, literature matrix)
- Courses with independent workspaces, Leitner flashcards and reading lists
- Scientific library (linked or managed storage, SHA-256 duplicate detection, previews, reviews)
- Windows application manager (.exe/.lnk, icon & version detection, launch arguments)
- Genetics toolbox: 44 calculators + BLUP, pedigree/A-matrix, selection index, mating planner and selection workspaces
- Integrated command shell sharing the GUI services; notes, journals, snippets; backups, export/import`;

const LICENSES = `**Gene OS** — © 2026 Mersad (Bitologist). Released under the **MIT License** (see \`LICENSE\` in the project). The author may change the project license; third-party licenses below are unaffected.

| Component | Role | License |
|---|---|---|
| Electron | desktop runtime (bundles Chromium and Node.js) | MIT |
| Chromium | rendering engine inside Electron | BSD-3-Clause and others — full text in \`LICENSES.chromium.html\` next to the executable |
| Node.js | runtime inside Electron | MIT |
| better-sqlite3 | SQLite driver | MIT |
| SQLite | embedded database engine | Public domain |
| electron-builder | packaging (build-time only, not shipped) | MIT |

No other third-party code is bundled. Fonts are not bundled: the UI uses installed fonts (JetBrains Mono / Cascadia Code / Consolas). If you add JetBrains Mono to \`src/renderer/assets/fonts\`, include its SIL Open Font License 1.1.

Numerical methods are original implementations of published algorithms: incomplete gamma/beta (Numerical Recipes), inverse normal (Acklam), HWE exact test (Wigginton et al. 2005), A-matrix tabular method and A⁻¹ rules (Henderson 1976), selection index (Hazel 1943), finite-population selection intensity (Burrows 1972).`;

let root = null;
export default {
  id: 'about',
  async mount(el) {
    root = el;
    let info = {};
    try { info = await api.system.info(); } catch (e) { toastError(e); }
    const link = (label, url) => h('a', { onclick: () => api.system.openExternal(url).catch(toastError) }, label);
    clear(root).append(h('div.grid.g2',
      h('div.col',
        logoNode(),
        h('div.muted.upper', 'Research Operating Environment'),
        h('div.panel', h('div.panel-h', h('span.t', 'Developer')), h('div.panel-b', kv([['Developed by', 'Mersad'], ['GitHub', link('https://github.com/sadult', 'https://github.com/sadult')], ['Website', link('https://10ck.ir', 'https://10ck.ir')], ['Telegram', link('@Bitologist', 'https://t.me/Bitologist')]]))),
        h('div.panel', h('div.panel-h', h('span.t', 'Version & build')), h('div.panel-b', kv([['Version', info.version], ['Build', info.packaged ? 'production (packaged)' : 'development'], ['Electron', info.electron], ['Chromium', info.chrome], ['Node.js', info.node], ['Database schema', `v${info.schema}`], ['Platform', `${info.platform}-${info.arch}`], ['Uptime', `${info.uptimeSec}s`]]))),
        h('div.panel', h('div.panel-h', h('span.t', 'Updates')), h('div.panel-b.muted.small', 'Automatic updates are not implemented (Gene OS is offline-first). Check ', link('github.com/sadult', 'https://github.com/sadult'), ' for new releases; installing a newer version keeps your data — run a backup first.'))),
      h('div.col',
        h('div.panel', h('div.panel-h', h('span.t', 'Licenses & acknowledgements')), h('div.panel-b.md', { html: render(LICENSES) })),
        h('div.panel', h('div.panel-h', h('span.t', 'Changelog')), h('div.panel-b.md', { html: render(CHANGELOG) })),
        h('div.panel', h('div.panel-h', h('span.t', 'Credits')), h('div.panel-b.small.muted', 'Designed and built for graduate research in animal breeding & genetics at Tarbiat Modares University. Reference example data: Mrode, R.A. — Linear Models for the Prediction of Animal Breeding Values (Example 3.1).')))));
  },
  unmount() { root = null; },
};
