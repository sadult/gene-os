# Backup, restore & data management

## Where data lives

| Build | Location |
|---|---|
| Installed (NSIS) | `%APPDATA%\Gene OS\data\` |
| Portable | `GeneOSData\` next to `GeneOS-Portable-x.y.z.exe` |
| Custom | Settings → Data → *Change database location…* (installed build; a consistent copy of the DB is written to the new folder, used after restart) |

Contents: `gene-os.db` (+ `-wal`/`-shm` while running), `library\` (only *managed* copies), `backups\`, `logs\gene-os.log`.

**Linked library files stay where they are.** Gene OS never moves, renames or deletes a linked original. Only *managed* copies (inside `library\`) can be renamed or deleted by the app.

## Backups

- **Manual:** Settings → Data → *Backup now* (to `backups\`) or *Backup to file…* (anywhere). Terminal: `backup`.
- **Automatic:** daily / weekly (default) / monthly; the newest *N* automatic backups are kept (default 10). Checked at start-up and hourly.
- **Reminder:** a notification appears when the last backup is older than 7 days (configurable).
- Backups use SQLite's online backup API, so they are consistent even while the app is running.
- A backup contains the whole database (tasks, projects, proposal text & versions, courses, notes, library metadata, apps, bookmarks, settings, profile). It does **not** contain the library files themselves — back up your document folders (and `library\` for managed copies) with your usual backup tool.

## Restore

Settings → Data → *Restore* (from the list) or *Restore from file…*:

1. The file is validated (must be an SQLite database with Gene OS tables, not from a newer schema).
2. It is staged as `pending-restore.db` and the app restarts.
3. On start-up the current database is saved as `backups\pre-restore-<timestamp>.db`, then replaced. Migrations upgrade older backups automatically.

## Export / import (JSON)

- *Export all data (JSON)* writes every table to a single readable JSON file — useful for archiving or scripting.
- *Import from JSON (replace)* creates a backup first, then replaces all data in one transaction (all-or-nothing) and rebuilds the search index.

## Reset

Settings → Data → *Reset application…* (type `RESET`). A backup is made first; all records are deleted; your profile and every file on disk are kept.

## Upgrading from Gene Terminal 1.x
On first start, Gene OS 2.0 looks for `%APPDATA%\Gene Terminal\data\gene-terminal.db` (portable builds look for `GeneTerminalData\` next to the EXE). If it finds one and no Gene OS database exists yet, it **copies** the whole folder to the new location and renames the file to `gene-os.db`; schema migrations then upgrade it to v2. The old folder is never modified or deleted, so you can remove it yourself once you have checked your data. A relocated data folder (Settings → Data → *Change database location*) keeps its place, and only the file is renamed.

## Moving to a new computer

Copy the whole data folder (or a backup `.db`) to the new machine, install Gene OS, and use *Restore from file…*. Linked library entries point at their original paths — keep the same folder structure/drive letters or re-import.
