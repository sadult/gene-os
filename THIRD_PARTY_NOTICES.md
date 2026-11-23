# Third-party notices

Gene OS itself is MIT-licensed (see `LICENSE`). It depends on the following third-party software. Licenses are stated as published by each project; consult the license files shipped inside `node_modules/<package>/` and the packaged application for the authoritative texts.

| Package | Used for | Shipped in the EXE | License |
|---|---|---|---|
| [Electron](https://github.com/electron/electron) | Desktop runtime | yes | MIT |
| Chromium (inside Electron) | Rendering engine | yes | BSD-3-Clause and additional licenses — see `LICENSES.chromium.html` in the application folder |
| Node.js (inside Electron) | JavaScript runtime | yes | MIT (plus bundled-dependency licenses) |
| [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | SQLite driver | yes | MIT |
| [SQLite](https://sqlite.org) (inside better-sqlite3) | Database engine | yes | Public domain |
| [node-addon-api](https://github.com/nodejs/node-addon-api) | better-sqlite3 dependency | yes | MIT |
| [electron-builder](https://github.com/electron-userland/electron-builder) | Packaging | no (build-time only) | MIT |

No fonts, icon packs or UI libraries are bundled. The application icon and DNA artwork were created for this project.

Algorithms implemented from the scientific literature (original code, no third-party source copied): regularized incomplete gamma/beta functions (Press et al., *Numerical Recipes*), inverse normal CDF (P. J. Acklam), exact HWE test (Wigginton, Cutler & Abecasis 2005), tabular A-matrix and Henderson's (1976) rules for A⁻¹, Hazel (1943) selection index, Burrows (1972) finite-population selection intensity. Test data: Mrode, *Linear Models for the Prediction of Animal Breeding Values*, Example 3.1.
