// ============================================================
// PS-AMS :: Tauri v2 shell
//  - Registers SQL (SQLite), Dialog, FS and Shell plugins
//  - Creates the local database + media directory on first run
//  - Exposes data_paths / backup_now commands to the frontend
//  - Intercepts app exit to run the automated backup routine
//    (database file + media directory -> backup target folder
//    or a remembered USB drive when present)
// ============================================================

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use tauri::{Manager, RunEvent};

const APP_DIR_NAME: &str = "PS-AMS";
const BACKUP_MARKER: &str = "ps-ams-backup-target.txt";

#[derive(Serialize, Clone)]
struct DataPaths {
    app_data: String,
    database: String,
    media: String,
    backup: String,
}

/// Resolve (and create) the PS-AMS data layout:
///   %APPDATA%/<identifier>/ps-ams.db  — SQLite database (same file the
///                                      SQL plugin opens via sqlite:ps-ams.db)
///   %APPDATA%/<identifier>/media/…    — photos / documents / certificates
///   %APPDATA%/<identifier>/backups/   — automatic exit backups
fn resolve_data_paths(handle: &tauri::AppHandle) -> DataPaths {
    let base: PathBuf = handle
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| dirs::data_dir().unwrap_or_default().join(APP_DIR_NAME));

    let media = base.join("media");
    let backup = base.join("backups");
    for dir in [&base, &media, &media.join("photos"), &media.join("documents"), &media.join("certificates"), &backup] {
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

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![data_paths, backup_now])
        .setup(|_app| Ok(()))
        .build(tauri::generate_context!())
        .expect("error while building PS-AMS");

    app.run(|_app_handle, event| match event {
        // ---- Automated data backup on exit ----
        RunEvent::Exit { .. } => {
            let _ = run_exit_backup(_app_handle);
        }
        RunEvent::ExitRequested { .. } => {}
        _ => {}
    });
}
