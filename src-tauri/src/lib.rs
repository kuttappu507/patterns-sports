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
/// Copies ps-ams.db (+ WAL sidecars) and the whole media tree into the
/// effective target folder and returns that folder so the UI can name it.
#[tauri::command]
fn backup_now(handle: tauri::AppHandle) -> Result<String, String> {
    Ok(run_exit_backup(&handle))
}

/// Frontend command: remember (or clear) the folder backups are written to.
/// Writes/clears ps-ams-backup-target.txt NEXT TO THE DATABASE — the same
/// marker the exit-backup routine reads. `None` resets to the default folder.
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

/// Frontend command: stage a database restore from a backup file.
/// The live SQLite file cannot be replaced while the app has it open, so the
/// copy is staged next to the database and swapped in by apply_pending_restore
/// on the NEXT boot — before the SQL plugin opens the file.
#[tauri::command]
fn restore_backup(handle: tauri::AppHandle, source: String) -> Result<String, String> {
    let paths = resolve_data_paths(&handle);
    let src = PathBuf::from(&source);
    if !src.exists() {
        return Err("Backup file not found".into());
    }
    // Accept only a real SQLite database file — never an arbitrary payload.
    use std::io::Read;
    let mut header = [0u8; 16];
    let header_ok = fs::File::open(&src)
        .and_then(|mut f| f.read_exact(&mut header))
        .map(|_| &header == b"SQLite format 3\0")
        .unwrap_or(false);
    if !header_ok {
        return Err("That file is not a PS-AMS database (SQLite header missing). Use a ps-ams-*.db backup.".into());
    }
    let staged = PathBuf::from(&paths.app_data).join(RESTORE_STAGED);
    fs::copy(&src, &staged).map_err(|e| format!("Could not stage the restore: {e}"))?;
    fs::write(PathBuf::from(&paths.app_data).join(RESTORE_MARKER), RESTORE_STAGED)
        .map_err(|e| format!("Could not write the restore marker: {e}"))?;
    log_line(&format!("restore staged from {}", src.display()));
    Ok("Restore staged — restart the app to apply it".into())
}

/// Swap a staged restore into place. Called during setup, BEFORE any webview
/// (and therefore before the SQL plugin) opens the database file.
fn apply_pending_restore(paths: &DataPaths) {
    let marker = PathBuf::from(&paths.app_data).join(RESTORE_MARKER);
    let Ok(staged_name) = fs::read_to_string(&marker) else {
        return;
    };
    let staged = PathBuf::from(&paths.app_data).join(staged_name.trim());
    if staged.exists() {
        let db = PathBuf::from(&paths.database);
        // Safety net: keep one copy of the database being replaced.
        let pre = db.with_extension("pre-restore.db");
        let _ = fs::copy(&db, &pre);
        // Stale WAL/SHM sidecars belong to the OLD database — remove them.
        for ext in ["-wal", "-shm"] {
            let _ = fs::remove_file(PathBuf::from(format!("{}{}", db.display(), ext)));
        }
        match fs::copy(&staged, &db) {
            Ok(_) => log_line("pending restore applied — database replaced from backup"),
            Err(e) => log_line(&format!("pending restore FAILED: {e}")),
        }
    } else {
        log_line("restore marker found but the staged file is missing — skipped");
    }
    let _ = fs::remove_file(&marker);
    let _ = fs::remove_file(&staged);
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
            restore_backup,
            restart_app,
            schema_sql,
            finish_boot,
            printing::print_direct,
            printing::print_to_pdf,
            updates::check_update,
            updates::download_update,
            updates::install_update,
            whatsapp::wa_snapshot,
            whatsapp::wa_start,
            whatsapp::wa_send,
            whatsapp::wa_send_document,
            whatsapp::wa_logout
        ])
        .manage(whatsapp::WaState::default())
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
