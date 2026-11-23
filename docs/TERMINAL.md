# gsh — the Gene OS shell

gsh is a real command interpreter over the same services as the graphical interface. A task added in the terminal appears in Tasks, Home and Status immediately, and the reverse is also true. One session is shared by the Home terminal widget and the Terminal module.

## Prompt

```
╭─ 🧬 GENE OS  mersad@lab-pc  ~/research/msc-thesis  ◆ MSc thesis        ✔ 12ms  23:41:05
╰─❯ task add "Run AIREMLF90" --priority high --due fri
```

- **Styles:** `prompt powerline` (default), `prompt classic` (`[GENE·OS] mersad@lab-pc ~/path 🧬 ❯`) and `prompt minimal` (`❯`). They can also be set in Settings → Terminal.
- **Live syntax highlighting:** known commands are green; unknown ones get a red wavy underline. Sub-commands, `--flags`, `"strings"`, numbers, `key=value` pairs, `~/paths` and the operators `| ; &&` each have their own color.
- **History suggestions:** a grey suffix from your history appears as you type. Press `→` or `End` to accept it.
- **Status:** every echoed command shows `✔`/`✘` and its duration. The arrow turns red after an error.

## Editing keys
| Key | Action |
|---|---|
| `Enter` | Run |
| `Tab` | Complete commands, sub-commands, paths, app names, tool ids, themes… (press twice for a list) |
| `↑` / `↓` | History (or move through the completion list) |
| `→` / `End` | Accept the history suggestion |
| `Ctrl+L` | Clear the screen |
| `Ctrl+C` | Cancel the current line (copies instead if text is selected) |
| `Ctrl+U` | Delete everything before the cursor |

## Shell features
| Feature | Example |
|---|---|
| Quotes | `task add "Read Falconer ch. 8"` |
| Flags | `--priority high`, `--due=fri`, `-l` |
| Chaining | `backup ; gfetch` (always runs) · `task add x && task list` (stops on error) |
| Pipes | `task list --all \| grep thesis \| wc -l` · `history \| tail 5` · `tool hwe AA=298 Aa=489 aa=213 \| grep P` |
| Filters | `grep [-i] [-v] [-c] pat`, `head [-n] N`, `tail N`, `sort [-r] [-n]`, `uniq [-c]`, `wc [-l\|-w\|-c]`, `nl` |
| History expansion | `!!` (last command) · `!12` · `!-2` · `!task` (most recent command starting with "task") |
| Aliases | `alias td="task list --today"` · `unalias td` |

## Filesystem
Your data is exposed as a virtual tree:
```
~
├── tasks/        open tasks           (cat <id-title>)
├── research/     projects → proposal sections
├── courses/      courses → topics, lectures, assignments
├── library/      files and papers     (cat prints text/CSV/Markdown files)
├── notes/        notes and journals
├── apps/         registered programs
├── bookmarks/
└── tools/        categories → tools   (cat shows formula & inputs)
```
`pwd`, `cd <path|..|~>`, `ls [-l] [path]` (`ll`), `tree`, `cat <path>` and `open [module|path]` all work here. Names can be shortened to any unique prefix, and ids work as well (`cat 12`).

## Commands
Run `help` for the full grouped list, or `help <command>` for one command.

| Group | Commands |
|---|---|
| core | `help` `clear` `version` `about` `status` `profile`/`whoami` `date` `echo` `calc` `history` `alias` `unalias` `search` |
| navigate | `home` `home edit` `home layout <preset>` `tasks` `research` `courses` `library` `apps` `bookmarks` `notes` `settings` `profile` `fullscreen` `focus` |
| system | `gfetch` (`neofetch`) `top` (`htop`, `sys`) `uptime` `lock` `reboot` `shutdown` (`exit`) `prompt` `theme` `accent` `backup` `notify` `reindex` `logs` `data` |
| files | `pwd` `cd` `ls` `tree` `cat` `open` |
| tasks | `task list` `task add` `task done` `task reopen` `task status` `task show` `task start` `task stop` `task rm` `task stats` `pomo` |
| research | `research list` `research new` `research open` `research active` `research progress` |
| courses | `course list` `course new` `course open` |
| apps | `apps list` `apps add` `apps launch` (`launch`, `run`) `apps info` `apps open` `apps rm` |
| library | `library search` `library import` `library open` `library recent` `paper add` |
| bookmarks | `bookmark add` `bookmarks list` `bookmark open` |
| notes | `note new` `note list` `journal [--research]` `scratch` `qn <text>` |
| tools | `tools [category]` `tool <id> [key=value …]` |
| science | `dna revcomp\|complement\|gc\|translate\|stats\|orf\|random\|helix` |
| utils | `date` `jdate [date]` `cal [month] [year] [-j]` `timer <90s\|25m\|1h> [label]` `timer list` `tip` `which` `export tasks\|bookmarks\|data\|history` |
| pipes | `grep` `head` `tail` `sort` `uniq` `wc` `nl` |

## gfetch
`gfetch` prints the Gene OS helix logo next to a report of OS and edition, host, kernel, uptime, shell, runtime (Electron, Chromium, Node, V8, SQLite), display, theme, font, CPU, GPU, memory, Gene OS RAM, disk space, locale and time zone, data folder, apps, tools, workspace, tasks and library, followed by the color palette. It runs once per session as the startup command; change or remove that under Settings → Terminal.

## Examples
```sh
gfetch
cd ~/research && ls -l
tool intensity p=0.1 N=100
tool descriptive x="12.1 13.4 11.8 14.2" | grep -i mean
dna translate ATGGCTAGCTTCGGAGCTGA
task list --all | grep -i blup | wc -l
cal 12 2026
cal -j            # Jalali month (week start from Settings)
jdate 1405/09/02  # → 2026-11-23 (Monday)
home layout widgets
timer 25m "Read Mrode ch. 3"
export tasks
```
