# PS-AMS — Tauri v2 Windows Packaging Guide

This directory contains everything required to compile the Pattern Sports Academy
Management System into a release-ready Windows 10/11 `.exe` installer (NSIS/MSI).

```
tauri/
├── src-tauri/
│   ├── tauri.conf.json      # Tauri v2 configuration (Windows bundle, WebView2 bootstrapper)
│   ├── Cargo.toml           # Rust manifest: sql (sqlite), dialog, fs, shell plugins
│   ├── build.rs             # Tauri build script
│   ├── capabilities/        # Permission scopes for IPC
│   └── src/main.rs          # Shell: data-dir bootstrap + backup-on-exit hook
└── database/
    └── schema.sql           # Canonical SQLite DDL (indexes + FK cascades)
```

## Why the frontend ships as-is

The React UI (src/) is a self-contained desktop-style SPA. All domain logic
(age/BMI, billing ledger, numbering, printing) lives in `src/lib/psams/*` and is
backend-agnostic. The only environment-specific module is **`src/lib/psams/api.ts`**,
which currently talks to the Next.js API routes (`/api/...`).

## Porting `api.ts` to the Tauri SQL plugin (offline target)

1. **Scaffold the desktop project** on a Windows/Linux build machine:

   ```bash
   bun add -D @tauri-apps/cli
   bun add @tauri-apps/plugin-sql @tauri-apps/plugin-dialog @tauri-apps/plugin-fs @tauri-apps/plugin-shell
   # copy tauri/src-tauri into the repo root as src-tauri/
   bun x tauri dev      # smoke test
   bun x tauri build    # release .exe / .msi
   ```

2. **Load the database** once at startup:

   ```ts
   import Database from "@tauri-apps/plugin-sql"
   const db = await Database.load("sqlite:ps-ams.db") // resolves to %APPDATA%/PS-AMS
   ```

   Apply `database/schema.sql` on first run (the Rust shell in `main.rs` also
   bootstraps it) or wire Tauri migrations with the same DDL.

3. **Replace the fetch calls** in `api.ts` with `db.select` / `db.execute`.
   The function signatures stay identical, so **no component changes are needed**:

   ```ts
   export async function fetchStudents(filters: StudentFilters = {}): Promise<Student[]> {
     const rows = await db.select<Student[]>(
       `SELECT * FROM Student
         WHERE ($1 IS NULL OR fullName LIKE '%'||$1||'%' OR admissionNo LIKE '%'||$1||'%' OR mobile LIKE '%'||$1||'%')
           AND ($2 IS NULL OR ageCategory = $2) AND ($3 IS NULL OR status = $3)
         ORDER BY fullName ASC`,
       [filters.q ?? null, filters.category ?? null, filters.status ?? null]
     )
     return rows
   }

   export async function createStudent(input: Partial<StudentInput>): Promise<Student> {
     const id = crypto.randomUUID()
     await db.execute(
       `INSERT INTO Student (id, admissionNo, registrationDate, fullName, dateOfBirth, parentName, mobile, ageCategory, monthlyFee, ...)
        VALUES ($1, $2, $3, ..., ...)`,
       [id, admissionNo, new Date().toISOString(), ...]
     )
     return fetchStudent(id)
   }
   ```

4. **Media uploads**: replace `uploadMedia` with the fs plugin — copy the picked
   file into `%APPDATA%/PS-AMS/media/<folder>/` and keep storing only the
   relative path (`photos/1698-…​.png`) in the database. Serve images through
   the Tauri asset protocol (`convertFileSrc`) instead of `/api/media`.

5. **Backup-on-exit** is already implemented in `src/main.rs`
   (`RunEvent::Exit` → copies `ps-ams.db` + WAL sidecars + the media tree to
   `%APPDATA%/PS-AMS/backups/`, or to a remembered USB drive path — write the
   drive root into `%APPDATA%/PS-AMS/ps-ams-backup-target.txt` to redirect).

6. **Printing**: WebView2 print pipeline honors the `@media print` isolation in
   `globals.css` (`#psams-root` hidden, `#psams-print-root` shown). The A5 and
   80 mm thermal formats use `@page` size rules — pick the paper in the print
   dialog and output is exact. "Save as PDF" works through the same dialog.

## Version notes

- Tauri v2 requires the WebView2 runtime (auto-installed via the embedded
  bootstrapper configured in `tauri.conf.json`).
- Icons: drop `icon.ico` + PNGs into `src-tauri/icons/` (`bun x tauri icon path/to/icon.png`).
- The NSIS installer targets `perMachine` install mode by default.
