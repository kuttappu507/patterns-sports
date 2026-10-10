// ============================================================
// PS-AMS :: in-app updater — check GitHub releases, download the
// Windows installer with progress events, launch it.
//
// The academy publishes releases by pushing a tag; the CI workflow
// (build-exe.yml) attaches the NSIS/MSI installers to the GitHub
// release. This module reads
//   https://api.github.com/repos/kuttappu507/patterns-sports/releases/latest
// compares the tag with the running app version, downloads the
// Windows asset into the user's Downloads folder while emitting
// "update://progress" events, and can launch the installer.
// No second distribution format is invented — the official CI
// installer is the only artifact this app fetches.
// ============================================================

use serde::Serialize;
use std::io::{Read, Write};
use tauri::Emitter;

const RELEASES_API: &str = "https://api.github.com/repos/kuttappu507/patterns-sports/releases/latest";
const USER_AGENT: &str = "PS-AMS-Updater";

#[derive(Serialize, Clone)]
pub struct UpdateInfo {
    pub current: String,
    pub available: bool,
    pub tag: String,
    pub name: String,
    pub notes: String,
    pub published_at: String,
    pub asset_name: String,
    pub asset_url: String,
    pub asset_size: u64,
}

/// "v1.6.2" / "1.6.2" / "1.6.2-beta.1" → (1, 6, 2)
fn parse_version(v: &str) -> (u64, u64, u64) {
    let core = v.trim().trim_start_matches('v');
    let mut parts = [0u64; 3];
    for (i, chunk) in core.split('.').take(3).enumerate() {
        let digits: String = chunk.chars().take_while(|c| c.is_ascii_digit()).collect();
        parts[i] = digits.parse().unwrap_or(0);
    }
    (parts[0], parts[1], parts[2])
}

/// Choose the best Windows asset: NSIS -setup.exe first, then any .exe, then .msi.
fn pick_asset(v: &serde_json::Value) -> (String, String, u64) {
    let mut picked: Option<(String, String, u64, u8)> = None;
    if let Some(assets) = v["assets"].as_array() {
        for a in assets {
            let asset_name = a["name"].as_str().unwrap_or("").to_string();
            let url = a["browser_download_url"].as_str().unwrap_or("").to_string();
            let size = a["size"].as_u64().unwrap_or(0);
            let lower = asset_name.to_lowercase();
            let rank: u8 = if lower.contains("setup") && lower.ends_with(".exe") {
                3
            } else if lower.ends_with(".exe") {
                2
            } else if lower.ends_with(".msi") {
                1
            } else {
                0
            };
            if rank > 0 && picked.as_ref().map(|p| rank > p.3).unwrap_or(true) {
                picked = Some((asset_name, url, size, rank));
            }
        }
    }
    picked.map(|(n, u, s, _)| (n, u, s)).unwrap_or_default()
}

fn fetch_latest() -> Result<UpdateInfo, String> {
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(std::time::Duration::from_secs(15))
        .build();
    let resp = agent
        .get(RELEASES_API)
        .set("User-Agent", USER_AGENT)
        .set("Accept", "application/vnd.github+json")
        .call()
        .map_err(|e| format!("Could not reach GitHub releases: {e}"))?;
    let body = resp
        .into_string()
        .map_err(|e| format!("Could not read the release info: {e}"))?;
    let v: serde_json::Value =
        serde_json::from_str(&body).map_err(|e| format!("Unexpected release payload: {e}"))?;
    if v["tag_name"].is_null() {
        return Err("No published release was found for this project yet".into());
    }

    let tag = v["tag_name"].as_str().unwrap_or("").to_string();
    let name = v["name"]
        .as_str()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or(&tag)
        .to_string();
    let notes = v["body"].as_str().unwrap_or("").to_string();
    let published_at = v["published_at"].as_str().unwrap_or("").to_string();
    let (asset_name, asset_url, asset_size) = pick_asset(&v);

    let current = env!("CARGO_PKG_VERSION").to_string();
    let available = !tag.is_empty() && parse_version(&tag) > parse_version(&current);

    Ok(UpdateInfo {
        current,
        available,
        tag,
        name,
        notes,
        published_at,
        asset_name,
        asset_url,
        asset_size,
    })
}

/// Compare the running app version against the latest GitHub release tag.
#[tauri::command]
pub async fn check_update() -> Result<UpdateInfo, String> {
    tauri::async_runtime::spawn_blocking(fetch_latest)
        .await
        .map_err(|e| format!("Update check failed: {e}"))?
}

#[derive(Serialize, Clone)]
struct DownloadProgress {
    received: u64,
    total: u64,
}

/// Stream the release asset into the user's Downloads folder, emitting
/// "update://progress" events along the way. Returns the saved path.
#[tauri::command]
pub async fn download_update(app: tauri::AppHandle, url: String, name: String) -> Result<String, String> {
    let lower = name.to_lowercase();
    if !lower.ends_with(".exe") && !lower.ends_with(".msi") {
        return Err("That release asset is not a Windows installer".into());
    }
    // keep the filename, but never trust it blindly
    let safe_name: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || "._- ()".contains(c) {
                c
            } else {
                '_'
            }
        })
        .collect();
    let dest = dirs::download_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join(safe_name);

    tauri::async_runtime::spawn_blocking(move || {
        let agent = ureq::AgentBuilder::new()
            .timeout_connect(std::time::Duration::from_secs(20))
            .build();
        let resp = agent
            .get(&url)
            .set("User-Agent", USER_AGENT)
            .call()
            .map_err(|e| format!("Download failed: {e}"))?;
        let total: u64 = resp
            .header("Content-Length")
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);
        let mut reader = resp.into_reader();
        let mut file = std::fs::File::create(&dest)
            .map_err(|e| format!("Could not create {}: {e}", dest.display()))?;
        let mut buf = [0u8; 64 * 1024];
        let mut received: u64 = 0;
        let mut last_emit: u64 = 0;
        loop {
            let n = reader
                .read(&mut buf)
                .map_err(|e| format!("Download interrupted: {e}"))?;
            if n == 0 {
                break;
            }
            file.write_all(&buf[..n])
                .map_err(|e| format!("Could not write the installer: {e}"))?;
            received += n as u64;
            if total == 0 || received == total || received - last_emit >= 256 * 1024 {
                last_emit = received;
                let _ = app.emit(
                    "update://progress",
                    DownloadProgress { received, total },
                );
            }
        }
        file.flush().ok();
        log_done(&dest);
        Ok(dest.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| format!("Download task failed: {e}"))?
}

fn log_done(dest: &std::path::Path) {
    crate::log_line(&format!("update installer downloaded to {}", dest.display()));
}

/// Launch the downloaded installer. The app stays open; the installer
/// will ask to close PS-AMS when it needs to replace files.
#[tauri::command]
pub fn install_update(path: String) -> Result<String, String> {
    let p = std::path::PathBuf::from(&path);
    if !p.exists() {
        return Err("Installer file not found — download it again".into());
    }
    let ext = p
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    if ext != "exe" && ext != "msi" {
        return Err("That file is not a PS-AMS installer".into());
    }
    std::process::Command::new(&path)
        .spawn()
        .map_err(|e| format!("Could not launch the installer: {e}"))?;
    crate::log_line(&format!("update installer launched: {}", p.display()));
    Ok("Installer launched — follow its steps, then start PS-AMS again".into())
}
