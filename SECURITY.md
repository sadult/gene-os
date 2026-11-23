# Security policy

## Supported versions
| Version | Supported |
|---|---|
| 2.x (Gene OS) | ✅ |
| 1.x (Gene Terminal) | ❌ — please upgrade; data migrates automatically |

## Reporting a vulnerability
Please **do not open a public issue** for security problems. Report privately to the maintainer on Telegram at **@Bitologist** or through [10ck.ir](https://10ck.ir). Include the affected version, steps to reproduce and the potential impact. You should get a reply within a few days.

## Security model
- **Local data:** stored in a local SQLite database under `%APPDATA%\Gene OS\data` (or next to the portable EXE). It is not encrypted; protect it with Windows account security or BitLocker.
- **Lock screen PIN:** a privacy screen. The PIN is stored as a salted SHA-256 hash and checked in the main process. It does **not** encrypt data and does not protect against someone with file access.
- **Renderer:** runs with `sandbox`, `contextIsolation` and a strict Content-Security-Policy. It can only call functions on the explicit IPC whitelist (`src/main/ipc.js`) and cannot read `security.*` settings.
- **External links** open in the default browser, and only `http`, `https`, `mailto` and `tg` schemes are allowed.
- **Application launching** runs only programs the user registered, and only when they explicitly launch them.
- **Library:** imported files are never executed by Gene OS. Opening a file passes it to its default Windows application.
