// ============================================================
// PS-AMS :: WhatsApp linked-device bridge (Baileys sidecar)
//
// Spawns the bundled `whatsapp-bot` sidecar binary (a Bun-compiled
// Baileys client) and shuttles NDJSON frames over stdio:
//
//   app -> sidecar : {"type":"send","id":"..","to":"9194..","text":".."}
//                    {"type":"logout"}
//   sidecar -> app : {"type":"status","value":"pairing|reconnecting|.."}
//                    {"type":"qr","value":"<raw qr payload>"}
//                    {"type":"connected","value":"<jid>"}
//                    {"type":"sent"|"send_error","id":"..",..}
//
// The pairing session persists in <data root>/whatsapp-session, so a
// QR scan is a ONE-TIME setup: every later launch reconnects silently
// and receipts go out with a single click — no WhatsApp Web.
// ============================================================

use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::process::{Command, CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

pub struct WaState {
    child: Mutex<Option<CommandChild>>,
    status: Mutex<String>,
    qr: Mutex<Option<String>>,
    me: Mutex<Option<String>>,
}

impl Default for WaState {
    fn default() -> Self {
        Self {
            child: Mutex::new(None),
            status: Mutex::new("stopped".into()),
            qr: Mutex::new(None),
            me: Mutex::new(None),
        }
    }
}

#[derive(Serialize, Clone)]
pub struct WaSnapshot {
    pub status: String,
    pub qr: Option<String>,
    pub me: Option<String>,
}

fn snapshot(state: &WaState) -> WaSnapshot {
    WaSnapshot {
        status: state.status.lock().unwrap().clone(),
        qr: state.qr.lock().unwrap().clone(),
        me: state.me.lock().unwrap().clone(),
    }
}

fn set_status(app: &AppHandle, status: &str) {
    let state = app.state::<WaState>();
    *state.status.lock().unwrap() = status.to_string();
    if status != "waiting_scan" {
        *state.qr.lock().unwrap() = None;
    }
    let _ = app.emit("wa://event", serde_json::json!({ "type": "status", "value": status }));
}

/// Where the pairing session lives (survives updates + restarts).
fn auth_dir(app: &AppHandle) -> String {
    let base = crate::resolve_data_paths(app).app_data;
    format!("{}/whatsapp-session", base.trim_end_matches('/'))
}

/// Resolve the sidecar: shell-plugin resolution first (handles dev vs
/// installed layouts), plain exe-dir fallback second.
fn resolve_command(app: &AppHandle) -> Result<Command, String> {
    if let Ok(cmd) = app.shell().sidecar("whatsapp-bot") {
        return Ok(cmd.args(["--auth-dir", &auth_dir(app)]));
    }
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let dir = exe.parent().ok_or("no exe dir")?;
    let path = dir.join(if cfg!(windows) { "whatsapp-bot.exe" } else { "whatsapp-bot" });
    if !path.exists() {
        return Err(format!("whatsapp-bot sidecar not found at {}", path.display()));
    }
    Ok(app
        .shell()
        .command(path.to_string_lossy().into_owned())
        .args(["--auth-dir", &auth_dir(app)]))
}

/// Spawn the sidecar (no-op when already running) and start the reader loop.
pub fn spawn_sidecar(app: &AppHandle) -> Result<(), String> {
    {
        let state = app.state::<WaState>();
        let mut guard = state.child.lock().unwrap();
        if guard.is_some() {
            return Ok(()); // already connected / pairing
        }
    }

    let cmd = resolve_command(app)?;
    let (mut rx, child) = cmd.spawn().map_err(|e| format!("sidecar spawn failed: {e}"))?;
    log_line("whatsapp-bot sidecar spawned");

    {
        let state = app.state::<WaState>();
        *state.child.lock().unwrap() = Some(child);
        *state.status.lock().unwrap() = "starting".into();
        let _ = app.emit("wa://event", serde_json::json!({ "type": "status", "value": "starting" }));
    }

    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => handle_sidecar_line(&handle, &line),
                CommandEvent::Stderr(line) => {
                    let text = String::from_utf8_lossy(&line);
                    log_line(&format!("wa-bot stderr: {}", text.trim()));
                }
                CommandEvent::Terminated(status) => {
                    let _ = status;
                    let state = handle.state::<WaState>();
                    if let Some(mut c) = state.child.lock().unwrap().take() {
                        let _ = c.kill();
                    }
                    drop(state);
                    log_line("whatsapp-bot sidecar exited");
                    set_status(&handle, "stopped");
                    *handle.state::<WaState>().me.lock().unwrap() = None;
                    break;
                }
                CommandEvent::Error(err) => {
                    log_line(&format!("wa-bot error: {err}"));
                }
                _ => {}
            }
        }
    });

    Ok(())
}

/// Parse one NDJSON frame from the sidecar, update state and forward to UI.
fn handle_sidecar_line(app: &AppHandle, raw: &[u8]) {
    let text = String::from_utf8_lossy(raw).trim().to_string();
    if text.is_empty() {
        return;
    }
    let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) else {
        log_line(&format!("wa-bot unparsed: {}", &text[..text.len().min(160)]));
        return;
    };
    let kind = v.get("type").and_then(|t| t.as_str()).unwrap_or("").to_string();
    let state = app.state::<WaState>();
    match kind.as_str() {
        "status" => {
            let s = v.get("value").and_then(|x| x.as_str()).unwrap_or("").to_string();
            if !s.is_empty() {
                *state.status.lock().unwrap() = s;
            }
            let _ = app.emit("wa://event", v);
        }
        "qr" => {
            let qr = v.get("value").and_then(|x| x.as_str()).map(|s| s.to_string());
            *state.qr.lock().unwrap() = qr;
            *state.status.lock().unwrap() = "waiting_scan".into();
            log_line("whatsapp pairing QR issued");
            let _ = app.emit("wa://event", v);
        }
        "connected" => {
            let jid = v.get("value").and_then(|x| x.as_str()).unwrap_or("").to_string();
            let me = jid.split('@').next().unwrap_or("").to_string();
            *state.me.lock().unwrap() = if me.is_empty() { None } else { Some(me) };
            *state.qr.lock().unwrap() = None;
            *state.status.lock().unwrap() = "connected".into();
            log_line(&format!("whatsapp connected: {jid}"));
            let _ = app.emit("wa://event", v);
        }
        "sent" | "send_error" => {
            let _ = app.emit("wa://event", v);
        }
        "log" => {
            let msg = v.get("value").and_then(|x| x.as_str()).unwrap_or("");
            log_line(&format!("wa-bot: {msg}"));
        }
        _ => {}
    }
}

/* ---------------- frontend commands ---------------- */

#[tauri::command]
pub fn wa_snapshot(state: State<'_, WaState>) -> WaSnapshot {
    snapshot(&*state)
}

#[tauri::command]
pub async fn wa_start(app: AppHandle) -> Result<WaSnapshot, String> {
    spawn_sidecar(&app)?;
    let state = app.state::<WaState>();
    Ok(snapshot(&*state))
}

#[tauri::command]
pub async fn wa_send(app: AppHandle, to: String, text: String, id: Option<String>) -> Result<(), String> {
    let state = app.state::<WaState>();
    let mut guard = state.child.lock().unwrap();
    let Some(child) = guard.as_mut() else {
        return Err("WhatsApp is not connected".into());
    };
    let digits: String = to.chars().filter(|c| c.is_ascii_digit()).collect();
    let frame_id = id.unwrap_or_else(|| format!("wa-{}", chrono::Local::now().timestamp_millis()));
    let frame = serde_json::json!({ "type": "send", "id": frame_id, "to": digits, "text": text });
    child
        .write(format!("{frame}\n").as_bytes())
        .map_err(|e| format!("failed to dispatch message: {e}"))
}

#[tauri::command]
pub async fn wa_logout(app: AppHandle) -> Result<(), String> {
    let running = {
        let state = app.state::<WaState>();
        let mut guard = state.child.lock().unwrap();
        match guard.as_mut() {
            Some(child) => {
                let _ = child.write(b"{\"type\":\"logout\"}\n");
                true
            }
            None => false,
        }
    };
    if !running {
        // not running — just clear stale pairing data on disk
        let dir = std::path::PathBuf::from(auth_dir(&app));
        if dir.exists() {
            let _ = std::fs::remove_dir_all(&dir);
        }
        return Ok(());
    }
    // give the sidecar a moment to clean up, then make sure it is gone
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(2500));
        let state = handle.state::<WaState>();
        if let Some(mut c) = state.child.lock().unwrap().take() {
            log_line("wa-bot did not exit after logout — killing");
            let _ = c.kill();
        }
    });
    Ok(())
}

/// Kill the sidecar on app exit (no orphaned sockets).
pub fn kill_sidecar(app: &AppHandle) {
    let state = app.state::<WaState>();
    if let Some(mut c) = state.child.lock().unwrap().take() {
        log_line("killing whatsapp-bot sidecar on exit");
        let _ = c.kill();
    }
    set_status(app, "stopped");
}

fn log_line(msg: &str) {
    crate::log_line(msg);
}
