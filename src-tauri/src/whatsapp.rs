// ============================================================
// PS-AMS :: WhatsApp linked-device bridge — IN-PROCESS engine
//
// Until v1.8.0 this layer spawned a bundled `whatsapp-bot` sidecar exe and
// shuttled NDJSON frames over stdio. The engine now runs as a tokio task
// inside this process (wa_engine.rs) with the session persisted by our
// JSON-file store (wa_json_store.rs) — no second binary in the install
// folder, no diesel/libsqlite3-sys conflict (the whole reason a sidecar
// existed), and the SAME observable behaviour:
//
//   commands : wa_snapshot / wa_start / wa_send / wa_send_document /
//              wa_logout / wa_restart   (signatures unchanged)
//   events   : wa://event payloads {"type":"status|qr|connected|sent|
//              send_error|log", ...}   (unchanged — tauri-api.ts untouched)
//
// The pairing session persists in <data root>/whatsapp-session, so a QR
// scan is a ONE-TIME setup; a legacy sidecar wa-store.db found there is
// imported automatically, keeping existing pairings.
// ============================================================

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};
use crate::wa_engine::{WaEngine, WaEvents};

pub struct WaState {
    /// The live engine incarnation, when one has fully started.
    engine: Mutex<Option<std::sync::Arc<WaEngine>>>,
    /// Placeholder held across the async engine start: a concurrent start
    /// (autostart racing a user click) sees it and no-ops instead of
    /// building two bots that would both hold the academy's session (the
    /// sidecar-era PS-028 spawn-race guard, in-process).
    starting: AtomicBool,
    status: Mutex<String>,
    qr: Mutex<Option<String>>,
    me: Mutex<Option<String>>,
    /// Set while an explicit unlink (wa_logout) is in flight, so the event
    /// handler never auto-respawns an engine the user just asked to stop.
    unlinking: Mutex<bool>,
    /// Budget of automatic respawns after a `logged_out` (a revoked
    /// pairing). Refilled whenever a QR is issued or a connection lands;
    /// capped so a pathological wipe→respawn loop cannot spin.
    auto_respawns: Mutex<u32>,
    /// The CURRENT engine incarnation's id, bumped whenever an engine
    /// starts or is torn down. Events from a superseded incarnation are
    /// dropped instead of tearing down the replacement (the reader-loop
    /// generation guard from the sidecar era). Bumped at START so the new
    /// engine's early frames (pairing/QR) pass the gate even before the
    /// engine slot is filled.
    generation: Mutex<u64>,
}

impl Default for WaState {
    fn default() -> Self {
        Self {
            engine: Mutex::new(None),
            starting: AtomicBool::new(false),
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

/// The UI event sink: translates engine callbacks into the exact NDJSON
/// payloads the sidecar used to print, gated on the engine generation.
struct UiEvents {
    app: AppHandle,
    generation: u64,
}

impl UiEvents {
    fn is_current_generation(&self) -> bool {
        *self.app.state::<WaState>().generation.lock().unwrap() == self.generation
    }
}

impl WaEvents for UiEvents {
    fn status(&self, value: &str) {
        if !self.is_current_generation() {
            return;
        }
        if value == "logged_out" {
            handle_logged_out(&self.app);
            return;
        }
        let state = self.app.state::<WaState>();
        if !value.is_empty() {
            *state.status.lock().unwrap() = value.to_string();
        }
        let _ = self.app.emit("wa://event", serde_json::json!({ "type": "status", "value": value }));
    }

    fn qr(&self, code: &str) {
        if !self.is_current_generation() {
            return;
        }
        let state = self.app.state::<WaState>();
        *state.qr.lock().unwrap() = Some(code.to_string());
        *state.status.lock().unwrap() = "waiting_scan".into();
        *state.auto_respawns.lock().unwrap() = 0; // pairing is progressing — refill the budget
        log_line("whatsapp pairing QR issued");
        let _ = self.app.emit("wa://event", serde_json::json!({ "type": "qr", "value": code }));
    }

    fn connected(&self, jid: &str) {
        if !self.is_current_generation() {
            return;
        }
        let state = self.app.state::<WaState>();
        let me = jid.split('@').next().unwrap_or("").to_string();
        *state.me.lock().unwrap() = if me.is_empty() { None } else { Some(me) };
        *state.qr.lock().unwrap() = None;
        *state.status.lock().unwrap() = "connected".into();
        *state.auto_respawns.lock().unwrap() = 0;
        log_line(&format!("whatsapp connected: {jid}"));
        let _ = self
            .app
            .emit("wa://event", serde_json::json!({ "type": "connected", "value": jid }));
    }

    fn send_result(&self, id: &str, ok: bool, error: Option<String>) {
        if !self.is_current_generation() {
            return;
        }
        let payload = if ok {
            serde_json::json!({ "type": "sent", "id": id })
        } else {
            serde_json::json!({ "type": "send_error", "id": id, "error": error.unwrap_or_default() })
        };
        let _ = self.app.emit("wa://event", payload);
    }

    fn log(&self, value: &str) {
        log_line(&format!("wa: {value}"));
        if !self.is_current_generation() {
            return;
        }
        let _ = self
            .app
            .emit("wa://event", serde_json::json!({ "type": "log", "value": value }));
    }
}

/// The pairing was revoked on the phone: the stored session is dead forever.
/// Wipe it and respawn once — a fresh engine pairs from scratch, so a new QR
/// appears with no user action (sidecar-era behaviour, budget-capped).
fn handle_logged_out(app: &AppHandle) {
    let state = app.state::<WaState>();
    let mut wipe_stale = false;
    {
        // Tear down the dead engine first (its run loop can never recover)
        // and invalidate its generation so its late events drop.
        if let Some(engine) = state.engine.lock().unwrap().take() {
            engine.shutdown();
        }
        *state.generation.lock().unwrap() += 1;
        let unlinking = *state.unlinking.lock().unwrap();
        let mut n = state.auto_respawns.lock().unwrap();
        if !unlinking && *n < 3 {
            *n += 1;
            wipe_stale = true;
        }
    }
    if wipe_stale {
        let dir = std::path::PathBuf::from(auth_dir(app));
        if dir.exists() {
            let _ = std::fs::remove_dir_all(&dir);
        }
        log_line("stale pairing wiped — respawning for a fresh QR");
    }
    set_status(app, "stopped");
    *app.state::<WaState>().me.lock().unwrap() = None;
    if wipe_stale {
        let respawner = app.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            if let Err(e) = start_engine(&respawner).await {
                log_line(&format!("wa auto-respawn failed: {e}"));
            }
        });
    }
}

/// Start the engine (no-op when already running or starting). Awaitable —
/// `wa_start` awaits it so a failed build surfaces as a command error,
/// exactly like a failed sidecar spawn did.
pub async fn start_engine(app: &AppHandle) -> Result<(), String> {
    {
        let state = app.state::<WaState>();
        // The check AND the claim happen atomically: the Starting placeholder
        // stays set across the async build, so a racing caller no-ops.
        if state.starting.swap(true, Ordering::SeqCst) {
            return Ok(());
        }
        if matches!(*state.engine.lock().unwrap(), Some(_)) {
            state.starting.store(false, Ordering::SeqCst);
            return Ok(()); // already connected / pairing
        }
    }

    // Claim the next incarnation BEFORE the engine exists: from this moment
    // any event of an older generation is dropped while this engine's own
    // early frames (pairing/QR) pass the gate.
    let generation = {
        let state = app.state::<WaState>();
        let mut g = state.generation.lock().unwrap();
        *g += 1;
        *g
    };
    let dir = std::path::PathBuf::from(auth_dir(app));
    let events: std::sync::Arc<dyn WaEvents> = std::sync::Arc::new(UiEvents {
        app: app.clone(),
        generation,
    });

    let result = wa_engine::WaEngine::start(&dir, events, generation).await;

    let state = app.state::<WaState>();
    match result {
        Ok(engine) => {
            *state.engine.lock().unwrap() = Some(engine);
            state.starting.store(false, Ordering::SeqCst);
            *state.unlinking.lock().unwrap() = false; // a new run clears any in-flight unlink
            *state.status.lock().unwrap() = "starting".into();
            let _ = app.emit("wa://event", serde_json::json!({ "type": "status", "value": "starting" }));
            log_line("whatsapp engine started (in-process)");
            Ok(())
        }
        Err(e) => {
            state.starting.store(false, Ordering::SeqCst);
            log_line(&format!("whatsapp engine start failed: {e}"));
            Err(e)
        }
    }
}

/* ---------------- frontend commands ---------------- */

#[tauri::command]
pub fn wa_snapshot(state: State<'_, WaState>) -> WaSnapshot {
    snapshot(&*state)
}

#[tauri::command]
pub async fn wa_start(app: AppHandle) -> Result<WaSnapshot, String> {
    start_engine(&app).await?;
    let state = app.state::<WaState>();
    Ok(snapshot(&*state))
}

#[tauri::command]
pub async fn wa_send(app: AppHandle, to: String, text: String, id: Option<String>) -> Result<(), String> {
    let engine = {
        let state = app.state::<WaState>();
        state
            .engine
            .lock()
            .unwrap()
            .clone()
    };
    let Some(engine) = engine else {
        return Err("WhatsApp is not connected".into());
    };
    let frame_id = id.unwrap_or_else(|| format!("wa-{}", chrono::Local::now().timestamp_millis()));
    engine.send_text(&to, &text, &frame_id)
}

/// Send a PDF (or any document) — used for fee-receipt dispatch. The
/// receipt is generated in the UI (true A5, jsPDF) and handed over as
/// base64; the engine uploads it to the WhatsApp CDN encrypted and
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
    let digits: String = to.chars().filter(|c| c.is_ascii_digit()).collect();
    if digits.len() < 8 || digits.len() > 15 {
        return Err("Invalid WhatsApp number — expected the full mobile number with country code".into());
    }
    if data_base64.len() > 28 * 1024 * 1024 {
        // ~27 MB base64 ≈ 20 MB decoded — reject before decoding.
        return Err("The receipt PDF exceeds the 20 MB WhatsApp document limit".into());
    }
    let engine = {
        let state = app.state::<WaState>();
        state.engine.lock().unwrap().clone()
    };
    let Some(engine) = engine else {
        return Err("WhatsApp is not connected".into());
    };
    let frame_id = id.unwrap_or_else(|| format!("wa-doc-{}", chrono::Local::now().timestamp_millis()));
    engine.send_document(&to, &data_base64, &file_name, caption.as_deref(), &frame_id)
}

#[tauri::command]
pub async fn wa_logout(app: AppHandle) -> Result<(), String> {
    {
        let state = app.state::<WaState>();
        // Mark the unlink so no auto-respawn races the user's intent (a
        // LoggedOut event may fire while the server-side unpair processes).
        *state.unlinking.lock().unwrap() = true;
    }
    let engine = app.state::<WaState>().engine.lock().unwrap().take();
    // Invalidate the old incarnation's events immediately.
    *app.state::<WaState>().generation.lock().unwrap() += 1;
    match engine {
        Some(engine) => {
            engine.logout().await?;
            log_line("whatsapp engine stopped — pairing wiped");
        }
        None => {
            // not running — just clear stale pairing data on disk
            let dir = std::path::PathBuf::from(auth_dir(&app));
            if dir.exists() {
                let _ = std::fs::remove_dir_all(&dir);
            }
        }
    }
    set_status(&app, "stopped");
    *app.state::<WaState>().me.lock().unwrap() = None;
    Ok(())
}

/// Manual restart from the Settings card ("Restart connection"). Tears down
/// the running engine (if any) and brings up a fresh one; with
/// `force_relink` the saved pairing is wiped too, so the next run pairs
/// from scratch and issues a brand-new QR. The UI stays event-driven: the
/// fresh engine emits starting/pairing/qr/connected as usual.
#[tauri::command]
pub async fn wa_restart(app: AppHandle, force_relink: Option<bool>) -> Result<WaSnapshot, String> {
    let force = force_relink.unwrap_or(false);
    {
        let state = app.state::<WaState>();
        if let Some(engine) = state.engine.lock().unwrap().take() {
            log_line("wa_restart — stopping the running engine");
            engine.shutdown();
        }
        // Invalidate the old incarnation's events immediately.
        *state.generation.lock().unwrap() += 1;
    }
    if force {
        let dir = std::path::PathBuf::from(auth_dir(&app));
        if dir.exists() {
            let _ = std::fs::remove_dir_all(&dir);
        }
        log_line("wa_restart — saved pairing wiped");
    }
    // Give the old engine's tasks a beat to unwind before the fresh build
    // takes the slot.
    let respawner = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(400)).await;
        if let Err(e) = start_engine(&respawner).await {
            log_line(&format!("wa_restart respawn failed: {e}"));
        }
    });
    let state = app.state::<WaState>();
    Ok(snapshot(&*state))
}

/// Shut the engine down on app exit (flushes the session store).
pub fn kill_sidecar(app: &AppHandle) {
    let state = app.state::<WaState>();
    if let Some(engine) = state.engine.lock().unwrap().take() {
        log_line("stopping the whatsapp engine on exit");
        engine.shutdown();
    }
    *state.generation.lock().unwrap() += 1;
    set_status(app, "stopped");
}

fn log_line(msg: &str) {
    crate::log_line(msg);
}
