// ============================================================
// PS-AMS :: dialog-scoped path picks (PS-014).
//
// The renderer used to hand arbitrary filesystem path strings to
// set_backup_target / restore_backup / print_to_pdf, and the fs
// plugin scope spanned Desktop/Documents/Downloads. A compromised
// webview could therefore delete user files or swap the database.
//
// Now: every file/folder the webview needs to touch is picked by a
// NATIVE dialog that runs on the Rust side. The picked path is
// registered in this session's whitelist and its fs-plugin scope is
// extended in the same step. The commands that act on paths only
// honour (a) paths registered here this session, or (b) paths inside
// the app's own data root. The webview can never originate a
// filesystem path out of thin air.
// ============================================================

use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

/// What the pick was FOR — a path picked to be saved-to cannot be
/// replayed as a restore source, and vice versa.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum PickKind {
    RestoreSource,
    BackupFolder,
    SaveFile,
}

#[derive(Default)]
pub struct PickState {
    picked: Mutex<Vec<(PickKind, PathBuf)>>,
}

impl PickState {
    fn remember(&self, kind: PickKind, path: PathBuf) {
        let mut list = self.picked.lock().unwrap();
        // Keep the list small: drop older entries of the same kind.
        list.retain(|(k, _)| *k != kind);
        list.push((kind, path));
    }

    /// Was this exact path picked for `kind` this session?
    /// Non-consuming: the pick→probe→confirm flow consults it more than once.
    /// Entries only expire when replaced by the next pick of the same kind.
    pub fn contains(&self, kind: PickKind, path: &std::path::Path) -> bool {
        let list = self.picked.lock().unwrap();
        list.iter().any(|(k, p)| *k == kind && p == path)
    }
}

/// `lib.rs`/`printing.rs` helper: may this command act on `path`?
/// Either the webview dialog-picked it this session, or it lives inside the
/// app data root (backups/media/staging — app-managed files).
pub fn may_use_path(app: &tauri::AppHandle, kind: PickKind, path: &std::path::Path) -> bool {
    if app.state::<PickState>().contains(kind, path) {
        return true;
    }
    let data_root = crate::resolve_data_paths(app);
    let root = std::path::PathBuf::from(&data_root.app_data);
    path.starts_with(&root)
}

/// Common tail of every pick command: turn the dialog result into a plain
/// path string, remember it for its kind, and extend the fs-plugin scope so
/// follow-up writes/reads through the fs plugin are allowed.
fn register_pick(
    app: &tauri::AppHandle,
    kind: PickKind,
    picked: Option<tauri_plugin_dialog::FilePath>,
) -> Option<String> {
    use tauri_plugin_fs::FsExt;

    let picked = picked?;
    let path: PathBuf = match picked.simplified() {
        tauri_plugin_dialog::FilePath::Path(p) => p,
        tauri_plugin_dialog::FilePath::Url(_) => return None,
    };

    {
        app.state::<PickState>().remember(kind, path.clone());
    }

    // Extend the fs-plugin scope for exactly this pick (session-scoped).
    let scope = app.fs_scope();
    let ext = match kind {
        PickKind::BackupFolder => scope.allow_directory(&path, true),
        _ => scope.allow_file(&path),
    };
    if let Err(e) = ext {
        crate::log_line(&format!("fs scope extension for pick failed: {e}"));
    }
    crate::log_line(&format!("dialog pick ({kind:?}): {}", path.display()));
    Some(path.to_string_lossy().into_owned())
}

/// Native file dialog → restore source. Registered for PickKind::RestoreSource.
#[tauri::command]
pub async fn pick_restore_source(
    app: tauri::AppHandle,
) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let picked = app
            .dialog()
            .file()
            .set_title("Choose a PS-AMS database backup")
            .add_filter("PS-AMS database backup", &["db", "sqlite", "db3"])
            .blocking_pick_file();
        Ok::<Option<String>, String>(register_pick(&app, PickKind::RestoreSource, picked))
    })
    .await
    .map_err(|e| format!("Dialog failed: {e}"))?
}

/// Native folder dialog → backup target folder. Registered for
/// PickKind::BackupFolder (fs scope extended recursively for mirror writes).
#[tauri::command]
pub async fn pick_backup_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let picked = app
            .dialog()
            .file()
            .set_title("Choose the backup folder (e.g. a USB drive)")
            .blocking_pick_folder();
        Ok::<Option<String>, String>(register_pick(&app, PickKind::BackupFolder, picked))
    })
    .await
    .map_err(|e| format!("Dialog failed: {e}"))?
}

/// Native save dialog → export target (CSV/JSON/PDF/…). Registered for
/// PickKind::SaveFile so the fs-plugin write and print_to_pdf can proceed.
#[tauri::command]
pub async fn pick_save_path(
    app: tauri::AppHandle,
    file_name: Option<String>,
    filter_name: Option<String>,
    extensions: Option<Vec<String>>,
) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut dialog = app.dialog().file().set_title("Save as");
        if let Some(name) = file_name.as_deref() {
            if !name.trim().is_empty() {
                dialog = dialog.set_file_name(name.trim());
            }
        }
        let exts: Vec<String> = extensions.unwrap_or_default();
        if !exts.is_empty() {
            let refs: Vec<&str> = exts.iter().map(String::as_str).collect();
            let label = filter_name.unwrap_or_else(|| exts[0].to_uppercase());
            dialog = dialog.add_filter(&label, &refs);
        }
        let picked = dialog.blocking_save_file();
        Ok::<Option<String>, String>(register_pick(&app, PickKind::SaveFile, picked))
    })
    .await
    .map_err(|e| format!("Dialog failed: {e}"))?
}
