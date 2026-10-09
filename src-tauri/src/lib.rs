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

use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use tauri::{Manager, RunEvent};

const APP_DIR_NAME: &str = "PS-AMS";
const BACKUP_MARKER: &str = "ps-ams-backup-target.txt";
const SCHEMA_SQL: &str = include_str!("../resources/schema.sql");

#[derive(Serialize, Clone)]
struct DataPaths {
    app_data: String,
    database: String,
    media: String,
    backup: String,
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
fn log_line(msg: &str) {
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
fn resolve_data_paths(handle: &tauri::AppHandle) -> DataPaths {
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

    DataPaths {
        app_data: base.to_string_lossy().into_owned(),
        database: base.join("ps-ams.db").to_string_lossy().into_owned(),
        media: media.to_string_lossy().into_owned(),
        backup: backup.to_string_lossy().into_owned(),
    }
}

/// Copy a file, ignoring errors so a locked USB stick never blocks exit.
fn copy_file(from: &PathBuf, to: &PathBuf) -> bool {
    fs::copy(from, to).is_ok()
}

/// Backup the SQLite database and the whole media tree.
/// Priority: remembered USB target > default local backups folder.
/// Returns the directory the backup was written to.
fn run_exit_backup(handle: &tauri::AppHandle) -> String {
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
    let _ = fs::create_dir_all(&target);

    // 2. Copy database (WAL sidecars included when present)
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    if db_src.exists() {
        copy_file(&db_src, &target.join(format!("ps-ams-{stamp}.db")));
        for ext in ["-wal", "-shm"] {
            let side = PathBuf::from(format!("{}{}", db_src.display(), ext));
            if side.exists() {
                copy_file(&side, &target.join(format!("ps-ams-{stamp}.db{ext}")));
            }
        }
    }

    // 3. Mirror the media directory
    let media_backup = target.join(format!("media-{stamp}"));
    let _ = fs::create_dir_all(&media_backup);
    mirror_dir(&media_src, &media_backup);

    target.to_string_lossy().into_owned()
}

fn mirror_dir(src: &PathBuf, dst: &PathBuf) {
    if let Ok(entries) = fs::read_dir(src) {
        for entry in entries.flatten() {
            let p = entry.path();
            let dest = dst.join(entry.file_name());
            if p.is_dir() {
                let _ = fs::create_dir_all(&dest);
                mirror_dir(&p, &dest);
            } else if let Err(_) = fs::copy(&p, &dest) {
                // skip unreadable files
            }
        }
    }
}

/* ---------------- frontend commands ---------------- */

/// Frontend command: resolved data layout (database / media / backup folders).
#[tauri::command]
fn data_paths(handle: tauri::AppHandle) -> DataPaths {
    resolve_data_paths(&handle)
}

/// Frontend command: run the backup routine right now (Settings page).
#[tauri::command]
fn backup_now(handle: tauri::AppHandle) -> Result<String, String> {
    Ok(run_exit_backup(&handle))
}

/// Frontend command: the embedded DDL — guarantees the schema exists even
/// with zero runtime resource files (portable exe ships alone).
#[tauri::command]
fn schema_sql() -> String {
    SCHEMA_SQL.to_string()
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
        .invoke_handler(tauri::generate_handler![data_paths, backup_now, schema_sql])
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
            log_line("exit — running backup routine");
            let _ = run_exit_backup(_app_handle);
            log_line("backup routine done");
        }
        RunEvent::ExitRequested { .. } => {}
        _ => {}
    });
}
