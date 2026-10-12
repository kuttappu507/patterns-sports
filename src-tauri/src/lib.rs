// ============================================================
// PS-AMS :: Tauri v2 shell library (hardened boot)
//  - Registers SQL (SQLite), Dialog, FS and Shell plugins
//  - Boots 100% panic-free: every failure is logged to boot.log
//    and never blocks the window from opening
//  - Forces the WebView2 user-data folder into a writable path
//    (classic root cause of "installs but never opens" on Windows)
//  - Portable mode: a portable.flag file next to the exe redirects
//    media + backups into ./PS-AMS-Data (USB / no-install usage)
//  - Embeds schema.sql into the binary (include_str!) and exposes
//    it to the frontend via the `schema_sql` command
//  - Intercepts app exit to run the automated backup routine
//    (database file + media directory -> backup target folder
//    or a remembered USB drive when present)
// ============================================================

mod picks;
mod printing;
mod updates;
mod whatsapp;

use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Manager, RunEvent, WindowEvent};

const APP_DIR_NAME: &str = "PS-AMS";
const BACKUP_MARKER: &str = "ps-ams-backup-target.txt";
const SCHEMA_SQL: &str = include_str!("../resources/schema.sql");

/// Set once the main window has been revealed after the splash window.
static BOOT_REVEALED: AtomicBool = AtomicBool::new(false);

/// Show the main (hidden-at-boot) window, focus it, and dismiss the
/// splash window. Idempotent — safe to call from finish_boot, the
/// failsafe timer and the splash-destroyed handler.
fn reveal_main(app: &tauri::AppHandle) {
    if BOOT_REVEALED.swap(true, Ordering::SeqCst) {
        return;
    }
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
    if let Some(s) = app.get_webview_window("splash") {
        let _ = s.close();
    }
    log_line("main window revealed — boot finished");
}

#[derive(Serialize, Clone)]
struct DataPaths {
    app_data: String,
    database: String,
    media: String,
    backup: String,
    /// Effective backup folder: the remembered external target (ps-ams-backup-target.txt)
    /// when that drive is mounted, otherwise the default local backups folder.
    backup_target: String,
    /// Absolute path of boot.log (shown on the Settings screen).
    log_file: String,
}

/* ---------------- boot diagnostics (never panics) ---------------- */

/// Portable data root when a `portable.flag` sits next to the exe.
fn portable_root() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?.to_path_buf();
    if dir.join("portable.flag").exists() {
        Some(dir.join("PS-AMS-Data"))
    } else {
        None
    }
}

/// Where boot.log lives: portable data dir, else %LOCALAPPDATA%/PS-AMS.
fn log_dir() -> Option<PathBuf> {
    if let Some(root) = portable_root() {
        return Some(root);
    }
    dirs::data_local_dir().map(|d| d.join(APP_DIR_NAME))
}

/// Append a timestamped line to boot.log. Best effort — ignore all errors.
pub(crate) fn log_line(msg: &str) {
    let Some(dir) = log_dir() else { return };
    if fs::create_dir_all(&dir).is_err() {
        return;
    }
    let path = dir.join("boot.log");
    // keep the log small: rewrite once it grows past ~512 KB
    if let Ok(meta) = fs::metadata(&path) {
        if meta.len() > 512 * 1024 {
            let _ = fs::remove_file(&path);
        }
    }
    let stamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
    if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(&path) {
        use std::io::Write;
        let _ = f.write_all(format!("[{stamp}] {msg}\n").as_bytes());
    }
}

/* ---------------- data layout ---------------- */

/// Resolve (and create) the PS-AMS data layout:
///   portable:  <exe dir>/PS-AMS-Data/{media,backups}
///   installed: %APPDATA%/<identifier>/{media,backups}
///              (the SQL plugin opens ps-ams.db in the same folder)
pub(crate) fn resolve_data_paths(handle: &tauri::AppHandle) -> DataPaths {
    let base: PathBuf = match portable_root() {
        Some(p) => p,
        None => handle.path().app_data_dir().unwrap_or_else(|_| {
            dirs::data_dir()
                .unwrap_or_else(|| std::env::temp_dir())
                .join(APP_DIR_NAME)
        }),
    };

    let media = base.join("media");
    let backup = base.join("backups");
    for dir in [
        &base,
        &media,
        &media.join("photos"),
        &media.join("documents"),
        &media.join("certificates"),
        &backup,
    ] {
        let _ = fs::create_dir_all(dir);
    }

    // Effective backup target: remembered external folder if mounted.
    let mut backup_target = backup.clone();
    if let Ok(saved) = fs::read_to_string(base.join(BACKUP_MARKER)) {
        let ext = PathBuf::from(saved.trim());
        if ext.is_dir() {
            backup_target = ext;
        }
    }

    let log_file = log_dir()
        .map(|d| d.join("boot.log").to_string_lossy().into_owned())
        .unwrap_or_default();

    DataPaths {
        app_data: base.to_string_lossy().into_owned(),
        database: base.join("ps-ams.db").to_string_lossy().into_owned(),
        media: media.to_string_lossy().into_owned(),
        backup: backup.to_string_lossy().into_owned(),
        backup_target: backup_target.to_string_lossy().into_owned(),
        log_file,
    }
}

/* ============================================================
   Backup / restore — crash-safe core (PS-002, PS-003, PS-006)

   Backup  = VACUUM INTO a `.partial` snapshot (ONE consistent, self-
             contained file taken under a read transaction — the WAL-mode
             live database keeps serving while it runs), verified with
             PRAGMA quick_check + core-table probe + size sanity, then an
             atomic rename to the final name. A half-written backup can
             never masquerade as a good one. Media is mirrored with per-
             file error counts; retention keeps the newest K databases.
   Restore = the stage command validates the source before any marker is
             written; apply_pending_restore validates again, snapshots the
             live db (WAL checkpointed first), copies the staged file to a
             .tmp, verifies THAT, then atomically renames it over the live
             db. Any failure leaves the live database untouched and writes
             ps-ams-restore-status.txt for the UI.
   SQLite access goes through sqlx (same libsqlite3-sys instance the SQL
   plugin uses) on short-lived connections opened per operation.
   ============================================================ */

/// Backups retained per target folder. Pruning runs ONLY after a successful
/// backup, ONLY matches `ps-ams-*.db` in the target root, and logs every
/// removal — media folders and foreign files are never touched.
const BACKUP_RETENTION: usize = 20;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BackupOutcome {
    ok: bool,
    target: String,
    db_file: Option<String>,
    db_bytes: u64,
    media_copied: u32,
    media_skipped: u32,
    pruned: u32,
    error: Option<String>,
}

/// A healthy PS-AMS database: `PRAGMA quick_check` = ok AND the three core
/// tables present AND a non-trivial size. Returns the file size on success.
/// Opens the file read-write-capable on purpose: VACUUM INTO output (and
/// therefore staged/partial copies) is rollback-journal mode, and connect-
/// time pragmas may need a writable handle; these are files we own or a
/// copy we just made — never the user's live data in a foreign location.
fn validate_pams_db(path: &PathBuf) -> Result<u64, String> {
    use sqlx::{Connection, Row};
    if !path.exists() {
        return Err(format!("file not found: {}", path.display()));
    }
    let size = fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    if size < 4096 {
        return Err("file is too small to be a PS-AMS database".into());
    }
    let probe: Result<(String, i64), String> = tauri::async_runtime::block_on(async move {
        // PS-024 — FK enforcement is explicit on every connection this app
        // opens (sqlx's own default is already ON; pinning it here keeps the
        // guarantee independent of sqlx version changes).
        let opts = sqlx::sqlite::SqliteConnectOptions::new()
            .filename(path)
            .foreign_keys(true)
            .busy_timeout(std::time::Duration::from_secs(15));
        let mut conn = match sqlx::SqliteConnection::connect_with(&opts).await {
            Ok(c) => c,
            Err(e) => return Err(format!("could not open {}: {e}", path.display())),
        };
        let check = match sqlx::query("PRAGMA quick_check").fetch_optional(&mut conn).await {
            Ok(Some(row)) => row
                .try_get::<String, _>(0)
                .map_err(|e| format!("integrity check unreadable: {e}"))?,
            Ok(None) => "no result".to_string(),
            Err(e) => return Err(format!("integrity check failed: {e}")),
        };
        let tables = match sqlx::query(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('Student','FeePayment','Attendance')",
        )
        .fetch_one(&mut conn)
        .await
        {
            Ok(row) => row
                .try_get::<i64, _>(0)
                .map_err(|e| format!("schema probe unreadable: {e}"))?,
            Err(e) => return Err(format!("schema probe failed: {e}")),
        };
        // Clean close — checkpoints and removes any sidecar the connect
        // pragmas created, so verified files stay single-file clean.
        let _ = conn.close().await;
        Ok((check, tables))
    });
    let (check, tables) = probe?;
    if check != "ok" {
        return Err(format!("database integrity check reported: {check}"));
    }
    if tables < 3 {
        return Err("core academy tables missing — this is not a PS-AMS database".into());
    }
    Ok(size)
}

/// Single consistent snapshot of the live WAL-mode database: `VACUUM INTO`
/// writes one self-contained file (no -wal/-shm pair that can tear), read
/// under a transaction while the app keeps serving.
fn vacuum_into(src: &PathBuf, dest: &PathBuf) -> Result<(), String> {
    let mut conn = sqlite_connect(src, false)?;
    let dest_str = dest.to_string_lossy().into_owned();
    tauri::async_runtime::block_on(async {
        sqlx::query("VACUUM INTO ?1")
            .bind(&dest_str)
            .execute(&mut conn)
            .await
            .map_err(|e| format!("VACUUM INTO failed: {e}"))?;
        Ok::<(), String>(())
    })?;
    let written = fs::metadata(dest).map(|m| m.len()).unwrap_or(0);
    if written < 4096 {
        return Err("snapshot was not written".into());
    }
    Ok(())
}

/// Flush the live database's WAL into the main file: the pre-restore
/// snapshot must not miss recent commits (PS-003).
fn checkpoint_wal(db: &PathBuf) -> Result<(), String> {
    let mut conn = sqlite_connect(db, false)?;
    tauri::async_runtime::block_on(async {
        sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
            .fetch_optional(&mut conn)
            .await
            .map_err(|e| format!("wal checkpoint failed: {e}"))?;
        Ok::<(), String>(())
    })?;
    Ok(())
}

/// Open a short-lived SQLite connection (read-write — used only for
/// VACUUM INTO / WAL checkpoint on the app's own live database).
fn sqlite_connect(path: &PathBuf, _read_only: bool) -> Result<sqlx::SqliteConnection, String> {
    use sqlx::Connection;
    // PS-024 — explicit FK enforcement on our own connections (see probe site).
    let opts = sqlx::sqlite::SqliteConnectOptions::new()
        .filename(path)
        .foreign_keys(true)
        .busy_timeout(std::time::Duration::from_secs(15));
    tauri::async_runtime::block_on(sqlx::SqliteConnection::connect_with(&opts))
        .map_err(|e| format!("could not open {}: {e}", path.display()))
}

fn sqlite_header_ok(path: &PathBuf) -> bool {
    use std::io::Read;
    let mut header = [0u8; 16];
    fs::File::open(path)
        .and_then(|mut f| f.read_exact(&mut header))
        .map(|_| &header == b"SQLite format 3\0")
        .unwrap_or(false)
}

/// A `ps-ams-<stamp>.db` backup pairs with a `media-<stamp>/` folder in the
/// same directory. Returns it when it exists.
fn sibling_media_dir(source: &PathBuf) -> Option<PathBuf> {
    let file_name = source.file_name()?.to_string_lossy().into_owned();
    let stamp = file_name.strip_prefix("ps-ams-")?.strip_suffix(".db")?;
    if stamp.is_empty() {
        return None;
    }
    let dir = source.parent()?.join(format!("media-{stamp}"));
    if dir.is_dir() {
        Some(dir)
    } else {
        None
    }
}

/// Mirror a directory tree, counting successes and per-file failures
/// (PS-002: skipped files are REPORTED, never swallowed). Mirror-only —
/// never deletes anything from the destination.
fn mirror_dir_counted(src: &PathBuf, dst: &PathBuf) -> (u32, u32) {
    let mut copied = 0u32;
    let mut skipped = 0u32;
    let Ok(entries) = fs::read_dir(src) else {
        return (0, 1);
    };
    for entry in entries.flatten() {
        let p = entry.path();
        let dest = dst.join(entry.file_name());
        if p.is_dir() {
            if fs::create_dir_all(&dest).is_ok() {
                let (c, s) = mirror_dir_counted(&p, &dest);
                copied += c;
                skipped += s;
            } else {
                skipped += 1;
            }
        } else {
            match fs::copy(&p, &dest) {
                Ok(_) => copied += 1,
                Err(_) => skipped += 1,
            }
        }
    }
    (copied, skipped)
}

/// Keep only the newest `keep` `ps-ams-*.db` files in the target folder.
/// Never touches media-* folders, .partial files or anything else.
fn prune_old_backups(target: &PathBuf, keep: usize) -> u32 {
    let mut backups: Vec<PathBuf> = match fs::read_dir(target) {
        Ok(entries) => entries
            .flatten()
            .map(|e| e.path())
            .filter(|p| {
                p.is_file()
                    && p.file_name()
                        .map(|n| {
                            let n = n.to_string_lossy();
                            n.starts_with("ps-ams-") && n.ends_with(".db")
                        })
                        .unwrap_or(false)
            })
            .collect(),
        Err(_) => return 0,
    };
    if backups.len() <= keep {
        return 0;
    }
    backups.sort();
    let excess = backups.len() - keep;
    let mut pruned = 0u32;
    for old in &backups[..excess] {
        if fs::remove_file(old).is_ok() {
            pruned += 1;
            log_line(&format!("backup retention: removed {}", old.display()));
            for ext in ["-wal", "-shm"] {
                let _ = fs::remove_file(PathBuf::from(format!("{}{}", old.display(), ext)));
            }
        }
    }
    pruned
}

/// The full backup routine — see the crash-safety notes at the top of this
/// section. The outcome is REPORTED: a failed backup can never claim success.
fn run_backup(handle: &tauri::AppHandle) -> BackupOutcome {
    let paths = resolve_data_paths(handle);
    let db_src = PathBuf::from(&paths.database);
    let media_src = PathBuf::from(&paths.media);

    // 1. Resolve target dir: remembered external target if the drive is mounted
    let marker = PathBuf::from(&paths.app_data).join(BACKUP_MARKER);
    let mut target = PathBuf::from(&paths.backup);
    if let Ok(saved) = fs::read_to_string(&marker) {
        let ext = PathBuf::from(saved.trim());
        if ext.is_dir() {
            target = ext;
        }
    }
    let mut out = BackupOutcome {
        ok: false,
        target: target.to_string_lossy().into_owned(),
        db_file: None,
        db_bytes: 0,
        media_copied: 0,
        media_skipped: 0,
        pruned: 0,
        error: None,
    };
    if let Err(e) = fs::create_dir_all(&target) {
        out.error = Some(format!("backup folder not usable: {e}"));
        return out;
    }

    // 2. Consistent DB snapshot + verification — the failure-proof part.
    if !db_src.exists() {
        out.error = Some("live database file not found".into());
        return out;
    }
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S%3f");
    let final_name = format!("ps-ams-{stamp}.db");
    let partial = target.join(format!("ps-ams-{stamp}.db.partial"));
    let final_path = target.join(&final_name);
    match vacuum_into(&db_src, &partial).and_then(|_| validate_pams_db(&partial)) {
        Ok(bytes) => match fs::rename(&partial, &final_path) {
            Ok(_) => {
                out.ok = true;
                // cloned — `final_name` is still logged in the summary below
                out.db_file = Some(final_name.clone());
                out.db_bytes = bytes;
            }
            Err(e) => {
                out.error = Some(format!("could not finalize the snapshot: {e}"));
                let _ = fs::remove_file(&partial);
            }
        },
        Err(e) => {
            out.error = Some(format!("database snapshot failed: {e}"));
            let _ = fs::remove_file(&partial);
            for ext in ["-wal", "-shm"] {
                let _ = fs::remove_file(PathBuf::from(format!("{}{}", partial.display(), ext)));
            }
            // DB backup failed — do NOT half-report a "backup".
            return out;
        }
    }

    // 3. Media mirror with per-file error counts.
    let media_backup = target.join(format!("media-{stamp}"));
    if fs::create_dir_all(&media_backup).is_ok() {
        let (copied, skipped) = mirror_dir_counted(&media_src, &media_backup);
        out.media_copied = copied;
        out.media_skipped = skipped;
        if skipped > 0 {
            log_line(&format!("backup: {skipped} media file(s) could not be copied"));
        }
    } else {
        out.media_skipped += 1;
    }

    // 4. Retention pruning — success only.
    out.pruned = prune_old_backups(&target, BACKUP_RETENTION);

    log_line(&format!(
        "backup written: {} ({} KiB), media +{}/-{}, pruned {}",
        final_name,
        out.db_bytes / 1024,
        out.media_copied,
        out.media_skipped,
        out.pruned
    ));
    out
}

/// Exit-time backup — best effort: never blocks or fails the exit, but the
/// log records the REAL outcome (a failed exit backup is visible there).
fn run_exit_backup(handle: &tauri::AppHandle) -> String {
    let out = run_backup(handle);
    if out.ok {
        log_line(&format!(
            "exit backup OK: {} ({} KiB, media +{}/-{}), target {}",
            out.db_file.clone().unwrap_or_default(),
            out.db_bytes / 1024,
            out.media_copied,
            out.media_skipped,
            out.target
        ));
    } else {
        log_line(&format!(
            "exit backup FAILED: {} — target {}",
            out.error.clone().unwrap_or_else(|| "unknown".into()),
            out.target
        ));
    }
    out.target
}

/* ---------------- frontend commands ---------------- */

/// Frontend command: resolved data layout (database / media / backup folders).
#[tauri::command]
fn data_paths(handle: tauri::AppHandle) -> DataPaths {
    resolve_data_paths(&handle)
}

/// Frontend command: run the backup routine right now (Settings page).
/// Returns the full outcome — the UI renders the real result, including
/// skipped media files, retention pruning, and failures that the old code
/// reported as success (PS-002).
#[tauri::command]
fn backup_now(handle: tauri::AppHandle) -> BackupOutcome {
    run_backup(&handle)
}

/// Frontend command: remember (or clear) the folder backups are written to.
/// Writes/clears ps-ams-backup-target.txt NEXT TO THE DATABASE — the same
/// marker the exit-backup routine reads. `None` resets to the default folder.
/// PS-014: the path must have been picked by the native folder dialog this
/// session (picks::pick_backup_folder) or live inside the app data root —
/// the webview can never supply an arbitrary directory here.
#[tauri::command]
fn set_backup_target(handle: tauri::AppHandle, path: Option<String>) -> Result<String, String> {
    let paths = resolve_data_paths(&handle);
    let marker = PathBuf::from(&paths.app_data).join(BACKUP_MARKER);
    match path {
        Some(p) if !p.trim().is_empty() => {
            let dir = PathBuf::from(p.trim());
            if !dir.is_dir() {
                return Err("Choose an existing folder".into());
            }
            if !picks::may_use_path(&handle, picks::PickKind::BackupFolder, &dir) {
                return Err("That folder was not chosen through the app's folder picker — pick it again in Settings".into());
            }
            fs::write(&marker, dir.to_string_lossy().as_bytes())
                .map_err(|e| format!("Could not write {}: {e}", BACKUP_MARKER))?;
            log_line(&format!("backup target set to {}", dir.display()));
            Ok(format!("Backups will be written to {}", dir.display()))
        }
        _ => {
            let _ = fs::remove_file(&marker);
            log_line("backup target reset to the default folder");
            Ok(format!("Backup target reset to {}", paths.backup))
        }
    }
}

const RESTORE_MARKER: &str = "ps-ams-restore-pending.txt";
const RESTORE_STAGED: &str = "ps-ams.restored.db";
const RESTORE_STATUS: &str = "ps-ams-restore-status.txt";

/// Pre-flight check for the restore dialog (PS-006): is this file a healthy
/// PS-AMS database, and is there a sibling media-<stamp> folder? Validates a
/// TEMP COPY — never the original — so this also works when the backup sits
/// on read-only media, and no marker is written until the user confirms.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RestoreProbe {
    valid: bool,
    error: Option<String>,
    media_dir: Option<String>,
    source_bytes: u64,
}

#[tauri::command]
fn restore_probe(handle: tauri::AppHandle, source: String) -> RestoreProbe {
    let paths = resolve_data_paths(&handle);
    let src = PathBuf::from(&source);
    let mut probe = RestoreProbe {
        valid: false,
        error: None,
        media_dir: None,
        source_bytes: fs::metadata(&src).map(|m| m.len()).unwrap_or(0),
    };
    // PS-014: same path rule as restore_backup — dialog pick or app data root.
    if !picks::may_use_path(&handle, picks::PickKind::RestoreSource, &src) {
        probe.error = Some("That backup was not chosen through the app's file picker — choose it again in Settings".into());
        return probe;
    }
    if !src.exists() {
        probe.error = Some("Backup file not found".into());
        return probe;
    }
    if !sqlite_header_ok(&src) {
        probe.error = Some(
            "That file is not a PS-AMS database (SQLite header missing). Use a ps-ams-*.db backup written by this app.".into(),
        );
        return probe;
    }
    let tmp = PathBuf::from(&paths.app_data).join("ps-ams.probe.tmp");
    let _ = fs::remove_file(&tmp);
    match fs::copy(&src, &tmp) {
        Ok(_) => match validate_pams_db(&tmp) {
            Ok(_) => {
                probe.valid = true;
                probe.media_dir = sibling_media_dir(&src).map(|p| p.to_string_lossy().into_owned());
            }
            Err(e) => probe.error = Some(e),
        },
        Err(e) => probe.error = Some(format!("Could not read the backup: {e}")),
    }
    let _ = fs::remove_file(&tmp);
    probe
}

/// Frontend command: stage a database restore from a backup file.
/// The live SQLite file cannot be replaced while the app has it open, so the
/// copy is staged next to the database and swapped in by apply_pending_restore
/// on the NEXT boot — before the SQL plugin opens the file. The source is
/// fully validated (quick_check + core tables) BEFORE the marker is written
/// (PS-006) — a foreign SQLite file can never reboot the academy empty.
#[tauri::command]
fn restore_backup(
    handle: tauri::AppHandle,
    source: String,
    restore_media: Option<bool>,
) -> Result<String, String> {
    let paths = resolve_data_paths(&handle);
    let src = PathBuf::from(&source);
    if !src.exists() {
        return Err("Backup file not found".into());
    }
    // PS-014: the source must be a dialog pick from this session or a file
    // inside the app data root — the webview can never point this command at
    // an arbitrary file on disk.
    if !picks::may_use_path(&handle, picks::PickKind::RestoreSource, &src) {
        return Err("That backup was not chosen through the app's file picker — choose it again in Settings".into());
    }
    // Accept only a real SQLite database file — never an arbitrary payload.
    if !sqlite_header_ok(&src) {
        return Err("That file is not a PS-AMS database (SQLite header missing). Use a ps-ams-*.db backup.".into());
    }
    // Stage through a .tmp so an interrupted copy can never pass as staged.
    let staged = PathBuf::from(&paths.app_data).join(RESTORE_STAGED);
    let staged_tmp = PathBuf::from(&paths.app_data).join(format!("{}.tmp", RESTORE_STAGED));
    let _ = fs::remove_file(&staged_tmp);
    fs::copy(&src, &staged_tmp).map_err(|e| format!("Could not stage the restore: {e}"))?;
    validate_pams_db(&staged_tmp).map_err(|e| {
        let _ = fs::remove_file(&staged_tmp);
        format!("That backup failed validation: {e}")
    })?;
    fs::rename(&staged_tmp, &staged).map_err(|e| format!("Could not stage the restore: {e}"))?;

    let mut marker = RESTORE_STAGED.to_string();
    let mut media_note = String::new();
    if restore_media.unwrap_or(false) {
        if let Some(media_dir) = sibling_media_dir(&src) {
            marker.push_str(&format!("\nmedia={}", media_dir.display()));
            media_note = format!(" The media library will be restored from {}.", media_dir.display());
        }
    }
    fs::write(PathBuf::from(&paths.app_data).join(RESTORE_MARKER), marker)
        .map_err(|e| format!("Could not write the restore marker: {e}"))?;
    log_line(&format!("restore staged from {}", src.display()));
    Ok(format!("Restore staged — restart the app to apply it.{media_note}"))
}

/// Swap a staged restore into place. Called during setup, BEFORE any webview
/// (and therefore before the SQL plugin) opens the database file.
/// Crash-safety ladder (PS-003/PS-006): validate staged → snapshot the live
/// db (WAL checkpointed first) → copy staged to .tmp and verify → atomic
/// rename over the live db → optional media mirror. ANY failure leaves the
/// live database untouched and is recorded for the UI.
fn apply_pending_restore(paths: &DataPaths) {
    let marker = PathBuf::from(&paths.app_data).join(RESTORE_MARKER);
    let Ok(raw) = fs::read_to_string(&marker) else {
        return;
    };
    let mut lines = raw.lines().map(str::trim).filter(|l| !l.is_empty());
    let staged_name = lines.next().unwrap_or(RESTORE_STAGED).to_string();
    let media_dir = lines.find_map(|l| l.strip_prefix("media=").map(|m| m.to_string()));

    let staged = PathBuf::from(&paths.app_data).join(&staged_name);
    let status_path = PathBuf::from(&paths.app_data).join(RESTORE_STATUS);

    let mut status = serde_json::json!({
        "ok": false,
        "at": chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f").to_string(),
        "error": serde_json::Value::Null,
        "mediaCopied": 0,
        "mediaSkipped": 0,
        "preSnapshot": serde_json::Value::Null,
    });

    match apply_restore_inner(paths, &staged, media_dir.as_deref()) {
        Ok((media_copied, media_skipped, pre)) => {
            status["ok"] = serde_json::Value::Bool(true);
            status["mediaCopied"] = media_copied.into();
            status["mediaSkipped"] = media_skipped.into();
            status["preSnapshot"] = serde_json::Value::String(pre);
            log_line("pending restore applied — database replaced from backup");
        }
        Err(e) => {
            status["error"] = serde_json::Value::String(e.clone());
            log_line(&format!("pending restore FAILED: {e}"));
        }
    }
    if let Err(e) = fs::write(&status_path, serde_json::to_string(&status).unwrap_or_else(|_| "{}".into())) {
        log_line(&format!("could not write the restore status record: {e}"));
    }
    let _ = fs::remove_file(&marker);
    let _ = fs::remove_file(&staged);
}

/// The actual swap. Returns (mediaCopied, mediaSkipped, preSnapshotPath).
fn apply_restore_inner(
    paths: &DataPaths,
    staged: &PathBuf,
    media_dir: Option<&str>,
) -> Result<(u32, u32, String), String> {
    let db = PathBuf::from(&paths.database);

    // 1. Validate the staged backup BEFORE anything is touched.
    validate_pams_db(staged)
        .map_err(|e| format!("staged backup failed validation (the live database was not modified): {e}"))?;

    // 2. Pre-restore snapshot of the live database: checkpoint first so the
    //    main .db holds every commit, then copy the sidecars too as a belt-
    //    and-braces triple. A missing live db (fresh install) needs none.
    let pre = db.with_extension("pre-restore.db");
    if db.exists() {
        if let Err(e) = checkpoint_wal(&db) {
            log_line(&format!("pre-restore checkpoint skipped: {e} — copying the WAL triple instead"));
        }
        fs::copy(&db, &pre).map_err(|e| format!("could not write the pre-restore safety copy: {e}"))?;
        for ext in ["-wal", "-shm"] {
            let side = PathBuf::from(format!("{}{}", db.display(), ext));
            if side.exists() {
                let _ = fs::copy(&side, PathBuf::from(format!("{}{}", pre.display(), ext)));
            }
        }
    }

    // 3. Copy staged → .tmp and verify the COPY (not just the source).
    let tmp = PathBuf::from(&paths.app_data).join("ps-ams.db.tmp");
    let _ = fs::remove_file(&tmp);
    fs::copy(staged, &tmp).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("could not prepare the restored database: {e}")
    })?;
    if let Err(e) = validate_pams_db(&tmp) {
        let _ = fs::remove_file(&tmp);
        return Err(format!("restored copy failed verification: {e}"));
    }

    // 4. Stale WAL/SHM sidecars belong to the OLD database — remove them,
    //    then swap atomically. A failed rename leaves the live db as it was.
    for ext in ["-wal", "-shm"] {
        let _ = fs::remove_file(PathBuf::from(format!("{}{}", db.display(), ext)));
    }
    fs::rename(&tmp, &db).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("could not swap the restored database into place: {e} — the original database was not modified")
    })?;
    log_line("restored database swapped in — pre-restore snapshot kept");

    // 5. Optional media restore — mirror only (never deletes), with counts.
    let mut media_copied = 0u32;
    let mut media_skipped = 0u32;
    if let Some(md) = media_dir {
        let from = PathBuf::from(md);
        if from.is_dir() {
            let live_media = PathBuf::from(&paths.media);
            let _ = fs::create_dir_all(&live_media);
            let (c, s) = mirror_dir_counted(&from, &live_media);
            media_copied = c;
            media_skipped = s;
            log_line(&format!("media restore: {c} file(s) copied, {s} skipped"));
        } else {
            media_skipped += 1;
            log_line("media folder recorded in the marker is missing — media not restored");
        }
    }
    Ok((media_copied, media_skipped, pre.to_string_lossy().into_owned()))
}

/// Frontend command: outcome of the LAST restore attempt (from
/// ps-ams-restore-status.txt) — null when no restore was ever applied.
#[tauri::command]
fn restore_status(handle: tauri::AppHandle) -> Option<serde_json::Value> {
    let paths = resolve_data_paths(&handle);
    let status_path = PathBuf::from(&paths.app_data).join(RESTORE_STATUS);
    let raw = fs::read_to_string(&status_path).ok()?;
    serde_json::from_str(&raw).ok()
}

/// Frontend command: restart the app so a staged restore (or any pending
/// data change) takes effect immediately.
#[tauri::command]
fn restart_app(app: tauri::AppHandle) {
    log_line("restart requested from Settings");
    app.restart();
}

/// Frontend command: the embedded DDL — guarantees the schema exists even
/// with zero runtime resource files (portable exe ships alone).
#[tauri::command]
fn schema_sql() -> String {
    SCHEMA_SQL.to_string()
}

/// Frontend command (splash window): boot completed and the minimum
/// splash time elapsed — reveal the main window and close the splash.
#[tauri::command]
fn finish_boot(app: tauri::AppHandle) {
    reveal_main(&app);
}

/* ---------------- boot ---------------- */

/// Assemble and run the PS-AMS desktop application.
pub fn run() {
    // Panic hook: any crash writes to boot.log instead of dying silently.
    std::panic::set_hook(Box::new(|info| {
        log_line(&format!("PANIC: {info}"));
    }));
    log_line("———— PS-AMS boot start ————");

    // WebView2 user data folder: force a guaranteed-writable location.
    // (Tauri normally handles this, but a bad default here is the classic
    // "installer finished fine, app never opens" Windows failure mode.)
    let webview_data = match portable_root() {
        Some(root) => root.join("WebView2"),
        None => dirs::data_local_dir()
            .unwrap_or_else(|| std::env::temp_dir())
            .join(APP_DIR_NAME)
            .join("WebView2"),
    };
    let _ = fs::create_dir_all(&webview_data);
    std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", &webview_data);
    log_line(&format!(
        "WebView2 user data folder: {}",
        webview_data.display()
    ));

    let app = match tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            data_paths,
            backup_now,
            set_backup_target,
            restore_probe,
            restore_backup,
            restore_status,
            restart_app,
            schema_sql,
            finish_boot,
            picks::pick_restore_source,
            picks::pick_backup_folder,
            picks::pick_save_path,
            printing::print_direct,
            printing::print_to_pdf,
            updates::check_update,
            updates::download_update,
            updates::install_update,
            whatsapp::wa_snapshot,
            whatsapp::wa_start,
            whatsapp::wa_restart,
            whatsapp::wa_send,
            whatsapp::wa_send_document,
            whatsapp::wa_logout
        ])
        .manage(whatsapp::WaState::default())
        .manage(picks::PickState::default())
        .on_window_event(|window, event| {
            // If the splash window dies for ANY reason (crash, Alt+F4) before
            // the boot handshake finished, still reveal the main window.
            if matches!(event, WindowEvent::Destroyed) && window.label() == "splash" {
                reveal_main(window.app_handle());
            }
        })
        .setup(|app| {
            // Create the data layout NOW — before the webview loads — and
            // extend the FS plugin scope to cover it. Portable builds keep
            // data next to the exe (outside the default $APPDATA scope), so
            // media upload/display would be denied without this.
            use tauri_plugin_fs::FsExt;
            let handle = app.handle();
            let paths = resolve_data_paths(handle);
            // Apply a staged database restore BEFORE anything opens the file
            // (the SQL plugin connects only when the webview asks for it).
            apply_pending_restore(&paths);
            if let Err(e) = handle.fs_scope().allow_directory(&paths.app_data, true) {
                log_line(&format!("fs scope extension failed: {e}"));
            }
            log_line(&format!("data root ready: {}", paths.app_data));

            // The main window boots hidden AND not yet maximized — the
            // "maximized" config flag forces a brief blank flash on Windows
            // before the splash can gate it. Maximize it NOW while it is
            // still invisible, so first start appears full screen instantly.
            if let Some(main_win) = app.get_webview_window("main") {
                let _ = main_win.maximize();
            }

            // WhatsApp linked-device sidecar (native Rust engine): auto-
            // connect at boot when a saved pairing session exists (scan-once,
            // send-always). Failure is non-fatal — the Settings page can
            // retry manually.
            let wa_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = whatsapp::spawn_sidecar(&wa_handle) {
                    log_line(&format!("whatsapp sidecar autostart: {e}"));
                }
            });

            // Hard failsafe: if the splash window never completes the boot
            // handshake (webview crash, JS error), reveal the main window
            // after 30s so the user is never left staring at the desktop.
            let fs_handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(30));
                if !BOOT_REVEALED.load(Ordering::SeqCst) {
                    log_line("failsafe: splash did not finish boot in 30s — revealing main");
                    reveal_main(&fs_handle);
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
    {
        Ok(app) => {
            log_line("Tauri builder OK — starting event loop");
            app
        }
        Err(e) => {
            log_line(&format!("FATAL: Tauri builder failed: {e}"));
            return; // window could not exist; nothing else to do
        }
    };

    app.run(|_app_handle, event| match event {
        // ---- Automated data backup on exit ----
        RunEvent::Exit { .. } => {
            log_line("exit — killing whatsapp sidecar + running backup routine");
            whatsapp::kill_sidecar(_app_handle);
            let _ = run_exit_backup(_app_handle);
            log_line("backup routine done");
        }
        RunEvent::ExitRequested { .. } => {}
        _ => {}
    });
}
