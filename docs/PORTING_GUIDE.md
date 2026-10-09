# PS-AMS — Windows Desktop Build Guide (Tauri v2)

The repository ships with the standard Tauri layout:

```
src-tauri/
├── tauri.conf.json       # Tauri v2 config (static export frontend, NSIS+MSI bundle)
├── Cargo.toml            # Rust manifest: sql (sqlite), dialog, fs, shell plugins
├── build.rs
├── capabilities/         # IPC permission scopes (SQL, FS, dialog, asset protocol)
├── resources/schema.sql  # Canonical SQLite DDL (applied on first app start)
├── icons/                # App icons (PNG + ICO)
└── src/main.rs           # Shell: data-dir bootstrap, backup-on-exit, commands
```

## How the offline desktop app works

The React UI is a dual-mode SPA. Every data call goes through
`src/lib/psams/api.ts`, which dispatches at runtime:

| Environment | Backend |
|---|---|
| Browser / preview (`npm run dev`) | Next.js API routes (`src/app/api/**`) + Prisma/SQLite on the server |
| Tauri desktop window | `src/lib/psams/tauri-api.ts` — direct SQLite via `@tauri-apps/plugin-sql`, media via `@tauri-apps/plugin-fs`, native save dialogs via `@tauri-apps/plugin-dialog` |

No component changes are needed to switch between the two. The desktop build
consumes a **static export** (`out/`) — `npm run build:tauri` stashes the API
routes for the duration of the build and restores them afterwards.

Data lives in `%APPDATA%/<identifier>/` (`ps-ams.db` + `media/`), and
`src/main.rs` mirrors the database and media tree to `%APPDATA%/<identifier>/backups/`
(or a remembered USB target — write the drive root into
`ps-ams-backup-target.txt` next to the database) every time the app exits.

## Build the EXE locally (Windows 10/11)

Prerequisites: Bun or Node 18+, Rust toolchain (`rustup`), WebView2 runtime
(auto-installed by the embedded bootstrapper in the NSIS installer).

```bash
bun install          # or: npm install
bun run tauri dev    # smoke test in a native window
bun run tauri build  # release NSIS installer + MSI
```

Installers land in `src-tauri/target/release/bundle/{nsis,msi}/`.

## Build the EXE with GitHub Actions (recommended)

`.github/workflows/build-exe.yml` builds the installers on
`windows-latest` automatically:

- **Triggers**: every push to `main`, version tags (`v*`), and manual
  `workflow_dispatch` runs from the Actions tab.
- **Artifacts**: each run publishes `PS-AMS-windows-installers`
  (NSIS `.exe` + MSI).
- **Releases**: pushing a tag (`git tag v1.0.0 && git push origin v1.0.0`)
  additionally creates a GitHub Release with the installers attached.

## Frontend build chain (desktop)

1. `tauri build` runs `npm run build:tauri` (see `tauri.conf.json → build.beforeBuildCommand`).
2. `scripts/build-tauri-frontend.mjs` stashes `src/app/api`, runs
   `next build` with `TAURI_STATIC=1` (static export to `out/`), then
   restores the API routes.
3. Tauri bundles `out/` (`frontendDist: "../out"`) with the Rust shell into
   the NSIS/MSI installers.

## Version notes

- Tauri v2 requires the WebView2 runtime; the NSIS installer embeds the
  bootstrapper (`bundle.windows.webviewInstallMode`).
- Regenerate icons with `python3 scripts/gen_icons.py` (writes `src-tauri/icons/`).
- The NSIS installer targets `perMachine` install mode by default.
- The SQL plugin opens `sqlite:ps-ams.db`, which resolves to the same
  `%APPDATA%/<identifier>/` folder the Rust shell bootstraps; the schema
  (`resources/schema.sql`, bundled as a Tauri resource) is applied
  idempotently on every start from `tauri-api.ts → ensureSchema()`.
