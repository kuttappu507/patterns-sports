// ============================================================
// PS-AMS :: WhatsApp linked-device bridge (native Rust sidecar)
//
// Spawns the bundled `whatsapp-bot` sidecar binary — a ~6 MB native
// Rust engine built on the `whatsapp-rust` crate (the whatmeow/Baileys
// protocol stack ported to Rust, NO Node.js anywhere) — and shuttles
// NDJSON frames over stdio:
//
//   app -> sidecar : {"type":"send","id":"..","to":"9194..","text":".."}
//                    {"type":"send_document","id":"..","to":"..",
//                     "data_base64":"..","file_name":"..","caption":".."}
//                    {"type":"logout"}
//   sidecar -> app : {"type":"status","value":"pairing|reconnecting|.."}
//                    {"type":"qr","value":"<raw qr payload>"}
//                    {"type":"connected","value":"<jid>"}
//                    {"type":"sent"|"send_error","id":"..",..}
//
// The pairing session persists in <data root>/whatsapp-session, so a
// QR scan is a ONE-TIME setup: every later launch reconnects silently
// and receipts go out with a single click — no WhatsApp Web.
// (The sidecar is a SEPARATE binary because the app itself links
// libsqlite3-sys 0.28 via sqlx while the engine links 0.37 via diesel;
// Cargo's `links` rule forbids both in one executable.)
// ============================================================

use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::process::{Command, CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

pub struct WaState {
    child: Mutex<SidecarSlot>,
    status: Mutex<String>,
    qr: Mutex<Option<String>>,
    me: Mutex<Option<String>>,
    /// Set while an explicit unlink (wa_logout) is in flight, so the reader
    /// loop never auto-respawns the sidecar the user just asked to stop.
    unlinking: Mutex<bool>,
    /// Budget of automatic respawns after a `logged_out` termination (a
    /// revoked pairing). Reset whenever a QR is issued or a connection is
    /// established; capped so a pathological wipe→respawn loop cannot spin.
    auto_respawns: Mutex<u32>,
    /// Bumped on every real spawn. Reader loops capture their generation and
    /// ignore the Terminated event of a sidecar they no longer own — without
    /// this, a killed sidecar's stale reader could tear down the fresh one.
    generation: Mutex<u64>,
}

impl Default for WaState {
    fn default() -> Self {
        Self {
            child: Mutex::new(SidecarSlot::None),
            status: Mutex::new("stopped".into()),
            qr: Mutex::new(None),
            me: Mutex::new(None),
            unlinking: Mutex::new(false),
            auto_respawns: Mutex::new(0),
            generation: Mutex::new(0),
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

/// The live sidecar slot (PS-028). `Starting` is a placeholder held across
/// the asynchronous spawn: a concurrent `spawn_sidecar` (autostart racing a
/// user click) sees it and no-ops instead of leaking a second process that
/// would silently hold the academy's WhatsApp session until exit.
enum SidecarSlot {
    None,
    Starting,
    Running(CommandChild),
}

impl SidecarSlot {
    fn running(&mut self) -> Option<&mut CommandChild> {
        match self {
            SidecarSlot::Running(c) => Some(c),
            _ => None,
        }
    }

    /// Take the running child (leaving Starting untouched — a spawn in
    /// flight must not be clobbered by an exit event from a previous run).
    fn take_running(&mut self) -> Option<CommandChild> {
        match std::mem::replace(self, SidecarSlot::None) {
            SidecarSlot::Running(c) => Some(c),
            other => {
                *self = other;
                None
            }
        }
    }
}

/// Spawn the sidecar (no-op when already running or spawning) and start the
/// reader loop.
pub fn spawn_sidecar(app: &AppHandle) -> Result<(), String> {
    {
        let state = app.state::<WaState>();
        let mut guard = state.child.lock().unwrap();
        // PS-028 — the check AND the claim happen under ONE lock hold: the
        // Starting placeholder stays in the slot across the async spawn, so
        // the old check-release-store window (both callers see None, both
        // spawn, the first child leaks) is gone.
        if matches!(*guard, SidecarSlot::Running(_) | SidecarSlot::Starting) {
            return Ok(()); // already connected / pairing / spawning
        }
        *guard = SidecarSlot::Starting;
    }

    let spawned = resolve_command(app).and_then(|cmd| {
        cmd.spawn()
            .map_err(|e| format!("sidecar spawn failed: {e}"))
    });

    let (mut rx, child) = match spawned {
        Ok(pair) => pair,
        Err(e) => {
            // Release the claim so a later retry can spawn.
            let state = app.state::<WaState>();
            let mut guard = state.child.lock().unwrap();
            if matches!(*guard, SidecarSlot::Starting) {
                *guard = SidecarSlot::None;
            }
            return Err(e);
        }
    };
    log_line("whatsapp-bot sidecar spawned");

    let my_gen = {
        let state = app.state::<WaState>();
        *state.unlinking.lock().unwrap() = false; // a new run clears any in-flight unlink
        let mut gen = state.generation.lock().unwrap();
        *gen += 1;
        *gen
    };

    {
        let state = app.state::<WaState>();
        *state.child.lock().unwrap() = SidecarSlot::Running(child);
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
                    // A reader loop that no longer owns the live sidecar (its
                    // child was killed by wa_restart / a newer spawn) must not
                    // tear down the replacement — just exit quietly.
                    if *state.generation.lock().unwrap() != my_gen {
                        break;
                    }
                    if let Some(c) = state.child.lock().unwrap().take_running() {
                        let _ = c.kill();
                    }
                    let was_logged_out = *state.status.lock().unwrap() == "logged_out";
                    let unlinking = *state.unlinking.lock().unwrap();
                    drop(state);
                    log_line("whatsapp-bot sidecar exited");

                    // The pairing was revoked on the phone: the stored session
                    // is dead forever and the sidecar exited without a QR. Wipe
                    // it and respawn once — the fresh sidecar pairs from
                    // scratch, so a new QR appears with no user action.
                    let mut wipe_stale = false;
                    if was_logged_out && !unlinking {
                        let state = handle.state::<WaState>();
                        let mut n = state.auto_respawns.lock().unwrap();
                        if *n < 3 {
                            *n += 1;
                            wipe_stale = true;
                        }
                    }
                    if wipe_stale {
                        let dir = std::path::PathBuf::from(auth_dir(&handle));
                        if dir.exists() {
                            let _ = std::fs::remove_dir_all(&dir);
                        }
                        log_line("stale pairing wiped — respawning for a fresh QR");
                    }

                    set_status(&handle, "stopped");
                    *handle.state::<WaState>().me.lock().unwrap() = None;

                    if wipe_stale {
                        let respawner = handle.clone();
                        std::thread::spawn(move || {
                            std::thread::sleep(std::time::Duration::from_millis(500));
                            if let Err(e) = spawn_sidecar(&respawner) {
                                log_line(&format!("wa auto-respawn failed: {e}"));
                            }
                        });
                    }
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
            *state.auto_respawns.lock().unwrap() = 0; // pairing is progressing — refill the budget
            log_line("whatsapp pairing QR issued");
            let _ = app.emit("wa://event", v);
        }
        "connected" => {
            let jid = v.get("value").and_then(|x| x.as_str()).unwrap_or("").to_string();
            let me = jid.split('@').next().unwrap_or("").to_string();
            *state.me.lock().unwrap() = if me.is_empty() { None } else { Some(me) };
            *state.qr.lock().unwrap() = None;
            *state.status.lock().unwrap() = "connected".into();
            *state.auto_respawns.lock().unwrap() = 0;
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
    let Some(child) = guard.running() else {
        return Err("WhatsApp is not connected".into());
    };
    let digits: String = to.chars().filter(|c| c.is_ascii_digit()).collect();
    let frame_id = id.unwrap_or_else(|| format!("wa-{}", chrono::Local::now().timestamp_millis()));
    let frame = serde_json::json!({ "type": "send", "id": frame_id, "to": digits, "text": text });
    child
        .write(format!("{frame}\n").as_bytes())
        .map_err(|e| format!("failed to dispatch message: {e}"))
}

/// Send a PDF (or any document) — used for fee-receipt dispatch. The
/// receipt is generated in the UI (true A5, jsPDF) and handed over as
/// base64; the sidecar uploads it to the WhatsApp CDN encrypted and
/// delivers it as a document message with an optional caption.
#[tauri::command]
pub async fn wa_send_document(
    app: AppHandle,
    to: String,
    data_base64: String,
    file_name: String,
    caption: Option<String>,
    id: Option<String>,
) -> Result<(), String> {
    let state = app.state::<WaState>();
    let mut guard = state.child.lock().unwrap();
    let Some(child) = guard.running() else {
        return Err("WhatsApp is not connected".into());
    };
    let digits: String = to.chars().filter(|c| c.is_ascii_digit()).collect();
    if digits.len() < 8 || digits.len() > 15 {
        return Err("Invalid WhatsApp number — expected the full mobile number with country code".into());
    }
    if data_base64.len() > 28 * 1024 * 1024 {
        // ~27 MB base64 ≈ 20 MB decoded — reject before hitting the pipe.
        return Err("The receipt PDF exceeds the 20 MB WhatsApp document limit".into());
    }
    let frame_id = id.unwrap_or_else(|| format!("wa-doc-{}", chrono::Local::now().timestamp_millis()));
    let file_name = if file_name.trim().is_empty() {
        "PS-AMS-Receipt.pdf".to_string()
    } else {
        file_name.trim().to_string()
    };
    let frame = serde_json::json!({
        "type": "send_document",
        "id": frame_id,
        "to": digits,
        "data_base64": data_base64,
        "file_name": file_name,
        "caption": caption.unwrap_or_default(),
    });
    child
        .write(format!("{frame}\n").as_bytes())
        .map_err(|e| format!("failed to dispatch document: {e}"))
}

#[tauri::command]
pub async fn wa_logout(app: AppHandle) -> Result<(), String> {
    {
        let state = app.state::<WaState>();
        // Mark the unlink so the reader loop never auto-respawns the sidecar
        // the user just asked to stop (a LoggedOut event may fire while the
        // server-side unpair is processed).
        *state.unlinking.lock().unwrap() = true;
    }
    let running = {
        let state = app.state::<WaState>();
        let mut guard = state.child.lock().unwrap();
        match guard.running() {
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
        let pending = handle.state::<WaState>().child.lock().unwrap().take_running();
        if let Some(c) = pending {
            log_line("wa-bot did not exit after logout — killing");
            let _ = c.kill();
        }
    });
    Ok(())
}

/// Manual restart from the Settings card ("Restart connection"). Kills the
/// running sidecar (if any) and brings up a fresh one; with `force_relink`
/// the saved pairing is wiped too, so the next run pairs from scratch and
/// issues a brand-new QR. The UI stays event-driven: the fresh sidecar emits
/// starting/pairing/qr/connected frames as usual.
#[tauri::command]
pub async fn wa_restart(app: AppHandle, force_relink: Option<bool>) -> Result<WaSnapshot, String> {
    let force = force_relink.unwrap_or(false);
    {
        let state = app.state::<WaState>();
        let mut guard = state.child.lock().unwrap();
        if let Some(c) = guard.take_running() {
            log_line("wa_restart — killing running sidecar");
            let _ = c.kill();
        }
    }
    if force {
        let dir = std::path::PathBuf::from(auth_dir(&app));
        if dir.exists() {
            let _ = std::fs::remove_dir_all(&dir);
        }
        log_line("wa_restart — saved pairing wiped");
    }
    // Give the killed sidecar's reader loop a beat to observe the
    // termination before a fresh process takes the slot.
    let respawner = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(400));
        if let Err(e) = spawn_sidecar(&respawner) {
            log_line(&format!("wa_restart respawn failed: {e}"));
        }
    });
    let state = app.state::<WaState>();
    Ok(snapshot(&*state))
}

/// Kill the sidecar on app exit (no orphaned sockets).
pub fn kill_sidecar(app: &AppHandle) {
    let state = app.state::<WaState>();
    let orphan = state.child.lock().unwrap().take_running();
    if let Some(c) = orphan {
        log_line("killing whatsapp-bot sidecar on exit");
        let _ = c.kill();
    }
    set_status(app, "stopped");
}

fn log_line(msg: &str) {
    crate::log_line(msg);
}
