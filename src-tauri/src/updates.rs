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
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Emitter;

const RELEASES_API: &str = "https://api.github.com/repos/kuttappu507/patterns-sports/releases/latest";
const USER_AGENT: &str = "PS-AMS-Updater";

/// PS-015: the ONLY download origin the updater accepts. Anything else —
/// whatever URL the webview passes — is refused before a single byte is
/// fetched. The official CI release is the app's only remote-code path.
const DOWNLOAD_BASE: &str = "https://github.com/kuttappu507/patterns-sports/releases/download/";

/// PS-015: provenance — the installer file `install_update` may launch. Only
/// `download_update` writes it, after the sha256 digest verified.
static LAST_INSTALLER: Mutex<Option<PathBuf>> = Mutex::new(None);

/// Strict allowlist check: same scheme+host+prefix, no traversal segments,
/// no query/fragment smuggled in.
fn url_allowed(url: &str) -> bool {
    let Some(rest) = url.strip_prefix(DOWNLOAD_BASE) else {
        return false;
    };
    if rest.is_empty() || rest.starts_with('/') {
        return false;
    }
    // No ".." path segments, no query strings or fragments on release assets.
    !rest.split('/').any(|seg| seg == ".." || seg == ".")
        && !rest.contains('?')
        && !rest.contains('#')
}

fn hex(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{:02x}", b));
    }
    s
}

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
    /// GitHub release digest for the picked asset, e.g. "sha256:abcd…".
    /// Empty when the release carries no digest — the download is then refused.
    pub asset_digest: String,
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
/// Only assets hosted under the official release download origin are eligible
/// (PS-015 defense in depth — the release API response itself is the input).
fn pick_asset(v: &serde_json::Value) -> (String, String, u64, String) {
    let mut picked: Option<(String, String, u64, String, u8)> = None;
    if let Some(assets) = v["assets"].as_array() {
        for a in assets {
            let asset_name = a["name"].as_str().unwrap_or("").to_string();
            let url = a["browser_download_url"].as_str().unwrap_or("").to_string();
            let size = a["size"].as_u64().unwrap_or(0);
            let digest = a["digest"].as_str().unwrap_or("").to_string();
            if !url_allowed(&url) {
                continue;
            }
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
            if rank > 0 && picked.as_ref().map(|p| rank > p.4).unwrap_or(true) {
                picked = Some((asset_name, url, size, digest, rank));
            }
        }
    }
    picked
        .map(|(n, u, s, d, _)| (n, u, s, d))
        .unwrap_or_default()
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
    let (asset_name, asset_url, asset_size, asset_digest) = pick_asset(&v);

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
        asset_digest,
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
///
/// PS-015 hardening:
/// - the URL must match the official release download origin (allowlist),
/// - the release digest (sha256 from the GitHub API) must verify,
/// - `received == Content-Length` must hold when a length was announced,
/// - ANY failure removes the partial file,
/// - only a verified download registers as launchable by `install_update`.
#[tauri::command]
pub async fn download_update(
    app: tauri::AppHandle,
    url: String,
    name: String,
    digest: Option<String>,
) -> Result<String, String> {
    if !url_allowed(&url) {
        return Err(
            "That download does not come from the official PS-AMS releases — update cancelled"
                .into(),
        );
    }
    let expected = match digest.as_deref().map(str::trim).filter(|d| !d.is_empty()) {
        Some(d) => d
            .strip_prefix("sha256:")
            .unwrap_or(d)
            .to_ascii_lowercase(),
        None => {
            return Err(
                "The release metadata carries no checksum — refusing to download an unverifiable installer"
                    .into(),
            )
        }
    };
    if expected.len() != 64 || !expected.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("The release checksum is malformed — update cancelled".into());
    }

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

    tauri::async_runtime::spawn_blocking(move || match download_inner(&app, &url, &dest, &expected)
    {
        Ok(()) => {
            log_done(&dest);
            *LAST_INSTALLER.lock().unwrap() = Some(dest.clone());
            Ok(dest.to_string_lossy().into_owned())
        }
        Err(e) => {
            // Never leave a truncated or tampered installer on disk.
            let _ = std::fs::remove_file(&dest);
            Err(e)
        }
    })
    .await
    .map_err(|e| format!("Download task failed: {e}"))?
}

fn download_inner(
    app: &tauri::AppHandle,
    url: &str,
    dest: &std::path::Path,
    expected_sha256: &str,
) -> Result<(), String> {
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(std::time::Duration::from_secs(20))
        .build();
    let resp = agent
        .get(url)
        .set("User-Agent", USER_AGENT)
        .call()
        .map_err(|e| format!("Download failed: {e}"))?;
    if resp.header("Content-Type").unwrap_or("").contains("text/html") {
        // Release downloads are binary; an HTML body means a redirect/error
        // page (proxy, captive portal, tampered response) — never an installer.
        return Err("The download returned a web page instead of an installer".into());
    }
    let total: u64 = resp
        .header("Content-Length")
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    let mut reader = resp.into_reader();
    let mut file = std::fs::File::create(dest)
        .map_err(|e| format!("Could not create {}: {e}", dest.display()))?;
    let mut hasher = Sha256::new();
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
        hasher.update(&buf[..n]);
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
    file.sync_all()
        .map_err(|e| format!("Could not finish writing the installer: {e}"))?;
    // PS-015: completeness + integrity — both must hold.
    if total > 0 && received != total {
        return Err(format!(
            "Download incomplete ({received} of {total} bytes) — the installer was not saved"
        ));
    }
    let actual = hex(&hasher.finalize());
    if actual != expected_sha256 {
        return Err(
            "The downloaded installer does not match the checksum published with the release — it was removed"
                .into(),
        );
    }
    Ok(())
}

fn log_done(dest: &std::path::Path) {
    crate::log_line(&format!("update installer downloaded to {}", dest.display()));
}

/// Launch the downloaded installer. The app stays open; the installer
/// will ask to close PS-AMS when it needs to replace files.
///
/// PS-015: only a file that `download_update` produced and verified in THIS
/// session may be launched — a webview-supplied path to any .exe/.msi on
/// disk is refused.
#[tauri::command]
pub fn install_update(path: String) -> Result<String, String> {
    let p = std::path::PathBuf::from(&path);
    {
        let last = LAST_INSTALLER.lock().unwrap();
        match last.as_deref() {
            Some(verified) if verified == &p => {}
            _ => {
                return Err(
                    "That file was not downloaded by the updater — use Check for updates, then Download, first"
                        .into(),
                );
            }
        }
    }
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
