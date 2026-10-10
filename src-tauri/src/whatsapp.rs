// ============================================================
// PS-AMS :: WhatsApp linked-device engine — 100 % native Rust
//
// Powered by the `whatsapp-rust` crate (a native port of the
// whatmeow / Baileys protocol stack). This replaces the previous
// Bun-compiled Baileys sidecar that added ~40 MB to every
// installer and slowed the app down: everything now runs
// IN-PROCESS on a dedicated tokio runtime.
//
//  - Scan-once pairing: the engine connects at boot; when the
//    academy WhatsApp is not yet linked it emits a raw QR string
//    that the Settings page renders (WhatsApp → Linked devices).
//  - Session persistence: the pairing lives in a SQLite store
//    under <data root>/whatsapp-session — every later launch
//    reconnects silently, no re-scan, no WhatsApp Web.
//  - One-click sends: text (`wa_send`) and PDF documents
//    (`wa_send_document`) go straight to the recipient's chat.
//
// The IPC contract with the frontend (src/lib/psams/whatsapp.ts)
// is unchanged from the sidecar era:
//
//   commands : wa_snapshot / wa_start / wa_send / wa_logout
//              (+ new wa_send_document for PDF receipts)
//   events   : wa://event {type: status|qr|connected|sent|send_error}
// ============================================================

use base64::Engine as _;
use serde::Serialize;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};
use whatsapp_rust::bot::Bot;
use whatsapp_rust::http::UreqHttpClient;
use whatsapp_rust::media;
use whatsapp_rust::store::SqliteStore;
use whatsapp_rust::transport::TokioWebSocketTransportFactory;
use whatsapp_rust::wacore::download::MediaType;
use whatsapp_rust::wacore::types::events::Event;
use whatsapp_rust::{Client, Jid, TokioRuntime};

/// 20 MB cap on receipt/document uploads — receipts are ~50 KB.
const MAX_DOCUMENT_BYTES: usize = 20 * 1024 * 1024;

pub struct WaState {
    /// Dedicated tokio runtime for the WhatsApp engine. The engine is
    /// fully self-contained (its own reconnect loop, storage saver and
    /// callback workers) and must never block or destabilise the UI.
    rt: Mutex<Option<Arc<tokio::runtime::Runtime>>>,
    /// Live client once the engine is running.
    client: Mutex<Option<Arc<Client>>>,
    /// Supervision handle — abort() tears the engine down.
    handle: Mutex<Option<whatsapp_rust::bot::BotHandle>>,
    status: Mutex<String>,
    qr: Mutex<Option<String>>,
    me: Mutex<Option<String>>,
}

impl Default for WaState {
    fn default() -> Self {
        Self {
            rt: Mutex::new(None),
            client: Mutex::new(None),
            handle: Mutex::new(None),
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
    drop(state);
    let _ = app.emit("wa://event", serde_json::json!({ "type": "status", "value": status }));
}

/// Where the pairing session lives (survives updates + restarts).
fn auth_dir(app: &AppHandle) -> String {
    let base = crate::resolve_data_paths(app).app_data;
    format!("{}/whatsapp-session", base.trim_end_matches('/'))
}

fn emit_wa(app: &AppHandle, value: serde_json::Value) {
    let _ = app.emit("wa://event", value);
}

/* ---------------- engine lifecycle ---------------- */

/// Start the in-process WhatsApp engine (no-op when already running).
/// Called automatically at boot; `wa_start` invokes it from Settings.
pub fn start_engine(app: &AppHandle) -> Result<(), String> {
    {
        let state = app.state::<WaState>();
        if state.client.lock().unwrap().is_some() {
            return Ok(()); // engine already live
        }
        // Guard against double-spawn while a boot attempt is in flight.
        let busy = matches!(
            state.status.lock().unwrap().as_str(),
            "starting" | "pairing" | "waiting_scan" | "connected" | "reconnecting"
        );
        let live = state.rt.lock().unwrap().is_some();
        if live && busy {
            return Ok(());
        }
    }

    let rt = {
        let mut guard = app.state::<WaState>().rt.lock().unwrap();
        if guard.is_none() {
            let runtime = tokio::runtime::Runtime::new()
                .map_err(|e| format!("whatsapp runtime: {e}"))?;
            *guard = Some(Arc::new(runtime));
        }
        guard.as_ref().unwrap().clone()
    };

    set_status(app, "starting");
    log_line("whatsapp engine starting (native, in-process)");

    let app_for_task = app.clone();
    rt.spawn(async move {
        if let Err(e) = boot_bot(app_for_task).await {
            log_line(&format!("whatsapp engine failed: {e}"));
            set_status(&app_for_task, "stopped");
        }
    });
    Ok(())
}

/// Build the bot on the dedicated runtime and keep its handle in state.
/// The SQLite session store makes the QR scan a ONE-TIME setup.
async fn boot_bot(app: AppHandle) -> Result<(), String> {
    let dir = auth_dir(&app);
    std::fs::create_dir_all(&dir).map_err(|e| format!("session dir: {e}"))?;
    let store_path = format!("{}/wa-store.db", dir.trim_end_matches('/'));

    let backend = SqliteStore::new(&store_path)
        .await
        .map_err(|e| format!("session store: {e}"))?;

    let app_for_events = app.clone();
    let bot = Bot::builder()
        .with_backend(backend)
        .with_transport_factory(TokioWebSocketTransportFactory::new())
        .with_http_client(UreqHttpClient::new())
        .with_runtime(TokioRuntime)
        .on_event(move |event, client| {
            let app = app_for_events.clone();
            async move { handle_event(&app, &event, &client).await }
        })
        .build()
        .await
        .map_err(|e| format!("bot build: {e}"))?;

    let handle = bot.spawn();
    let client = handle.client();
    {
        let state = app.state::<WaState>();
        *state.client.lock().unwrap() = Some(client.clone());
        *state.handle.lock().unwrap() = Some(handle);
    }

    // If a saved session exists the Connected event fires on its own;
    // otherwise the server sends pairing refs → PairingQrCode event.
    if client.is_logged_in() {
        set_status(&app, "pairing");
        log_line("whatsapp engine running — saved session reconnecting");
    } else {
        log_line("whatsapp engine running — waiting for pairing (QR)");
    }
    Ok(())
}

/// Forward engine events to the UI (same payloads the old sidecar sent).
async fn handle_event(app: &AppHandle, event: &Event, client: &Arc<Client>) {
    match event {
        Event::PairingQrCode(qr) => {
            {
                let state = app.state::<WaState>();
                *state.qr.lock().unwrap() = Some(qr.code.clone());
                *state.status.lock().unwrap() = "waiting_scan".into();
            }
            log_line("whatsapp pairing QR issued");
            emit_wa(app, serde_json::json!({ "type": "qr", "value": qr.code }));
        }
        Event::PairSuccess(info) => {
            log_line(&format!("whatsapp paired as {}", info.id));
        }
        Event::Connected(_) => {
            let me = client
                .pn()
                .map(|j| j.user.to_string())
                .unwrap_or_default();
            {
                let state = app.state::<WaState>();
                *state.me.lock().unwrap() = if me.is_empty() { None } else { Some(me.clone()) };
                *state.qr.lock().unwrap() = None;
                *state.status.lock().unwrap() = "connected".into();
            }
            log_line(&format!("whatsapp connected: {me}"));
            emit_wa(app, serde_json::json!({ "type": "connected", "value": format!("{me}@s.whatsapp.net") }));
            emit_wa(app, serde_json::json!({ "type": "status", "value": "connected" }));
        }
        Event::Disconnected(_) => {
            // The client auto-reconnects with backoff; the saved session
            // survives, so this is transient unless the phone unlinks us.
            set_status(app, "reconnecting");
        }
        Event::LoggedOut(_) => {
            {
                let state = app.state::<WaState>();
                *state.me.lock().unwrap() = None;
                *state.status.lock().unwrap() = "logged_out".into();
            }
            // Session is invalid — wipe it so the next start re-pairs cleanly.
            let _ = std::fs::remove_dir_all(auth_dir(app));
            log_line("whatsapp logged out on the phone — session wiped");
        }
        Event::StreamError(e) => {
            log_line(&format!("whatsapp stream error: {e:?}"));
        }
        Event::ConnectFailure(e) => {
            log_line(&format!("whatsapp connect failure: {e:?}"));
        }
        _ => {}
    }
}

/// Tear the engine down (app exit). Abort is intentional: the session
/// saver persists continuously, so nothing is lost by not awaiting.
pub fn shutdown_engine(app: &AppHandle) {
    let state = app.state::<WaState>();
    let handle = state.handle.lock().unwrap().take();
    drop(state.client.lock().unwrap().take());
    drop(state);
    if let Some(h) = handle {
        h.abort();
    }
    set_status(app, "stopped");
    log_line("whatsapp engine stopped");
}

/* ---------------- frontend commands ---------------- */

#[tauri::command]
pub fn wa_snapshot(state: State<'_, WaState>) -> WaSnapshot {
    snapshot(&*state)
}

#[tauri::command]
pub async fn wa_start(app: AppHandle) -> Result<WaSnapshot, String> {
    start_engine(&app)?;
    let state = app.state::<WaState>();
    Ok(snapshot(&*state))
}

/// Normalise and validate a recipient: digits only, E.164-ish length.
fn recipient_jid(to: &str) -> Result<Jid, String> {
    let digits: String = to.chars().filter(|c| c.is_ascii_digit()).collect();
    if digits.len() < 8 || digits.len() > 15 {
        return Err("Invalid WhatsApp number — expected the full mobile number with country code".into());
    }
    format!("{digits}@s.whatsapp.net")
        .parse::<Jid>()
        .map_err(|e| format!("invalid JID: {e}"))
}

fn runtime(app: &AppHandle) -> Result<Arc<tokio::runtime::Runtime>, String> {
    {
        let state = app.state::<WaState>();
        if let Some(rt) = state.rt.lock().unwrap().as_ref() {
            return Ok(rt.clone());
        }
    }
    // Engine never started — spin the runtime up so commands still work.
    start_engine(app)?;
    app.state::<WaState>()
        .rt
        .lock()
        .unwrap()
        .as_ref()
        .cloned()
        .ok_or_else(|| "whatsapp runtime unavailable".into())
}

#[tauri::command]
pub async fn wa_send(app: AppHandle, to: String, text: String, id: Option<String>) -> Result<(), String> {
    let client = {
        let state = app.state::<WaState>();
        state.client.lock().unwrap().clone()
    };
    let Some(client) = client else {
        return Err("WhatsApp is not connected — link the academy WhatsApp in Settings first".into());
    };
    let jid = recipient_jid(&to)?;
    // Hard cap the payload; WhatsApp itself rejects >65k chars.
    let text: String = text.chars().take(4096).collect();
    let frame_id = id.unwrap_or_else(|| format!("wa-{}", chrono::Local::now().timestamp_millis()));
    let rt = runtime(&app)?;

    let app_for_task = app.clone();
    rt.spawn(async move {
        match client.send_text(jid, text).await {
            Ok(_) => {
                log_line("whatsapp message sent");
                emit_wa(&app_for_task, serde_json::json!({ "type": "sent", "id": frame_id }));
            }
            Err(e) => {
                log_line(&format!("whatsapp send failed: {e}"));
                emit_wa(
                    &app_for_task,
                    serde_json::json!({ "type": "send_error", "id": frame_id, "error": e.to_string() }),
                );
            }
        }
    });
    Ok(())
}

/// Send a PDF (or any document) — used for fee-receipt dispatch.
/// The receipt is generated in the UI (A5, jsPDF) and handed over as
/// base64; the engine uploads it to the WhatsApp CDN encrypted and
/// delivers it as a document message, optionally with a caption.
#[tauri::command]
pub async fn wa_send_document(
    app: AppHandle,
    to: String,
    data_base64: String,
    file_name: String,
    caption: Option<String>,
    id: Option<String>,
) -> Result<(), String> {
    let client = {
        let state = app.state::<WaState>();
        state.client.lock().unwrap().clone()
    };
    let Some(client) = client else {
        return Err("WhatsApp is not connected — link the academy WhatsApp in Settings first".into());
    };
    let jid = recipient_jid(&to)?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_base64.trim())
        .map_err(|e| format!("invalid document payload: {e}"))?;
    if bytes.is_empty() {
        return Err("The receipt PDF is empty — generate it again".into());
    }
    if bytes.len() > MAX_DOCUMENT_BYTES {
        return Err("The receipt PDF exceeds the 20 MB WhatsApp document limit".into());
    }
    let file_name = if file_name.trim().is_empty() {
        "PS-AMS-Receipt.pdf".to_string()
    } else {
        // Sanitise: keep the recipient-side filename path-free.
        file_name
            .trim()
            .chars()
            .map(|c| if c in ['/', '\\', ':', '*', '?', '"', '<', '>', '|'] { '-' } else { c })
            .collect()
    };
    let caption = caption
        .unwrap_or_default()
        .chars()
        .take(1024)
        .collect::<String>();
    let caption = if caption.is_empty() { None } else { Some(caption) };
    let frame_id = id.unwrap_or_else(|| format!("wa-doc-{}", chrono::Local::now().timestamp_millis()));
    let rt = runtime(&app)?;

    let app_for_task = app.clone();
    rt.spawn(async move {
        let result = (async {
            let upload = client
                .upload(bytes, MediaType::Document, Default::default())
                .await
                .map_err(|e| format!("receipt upload failed: {e}"))?;
            let message = media::document_message(
                upload,
                media::DocumentOptions {
                    mimetype: Some("application/pdf".into()),
                    file_name: Some(file_name),
                    caption,
                    ..Default::default()
                },
            );
            client
                .send_message(jid, message)
                .await
                .map_err(|e| format!("receipt delivery failed: {e}"))
        })
        .await;
        match result {
            Ok(_) => {
                log_line("whatsapp receipt document sent");
                emit_wa(&app_for_task, serde_json::json!({ "type": "sent", "id": frame_id }));
            }
            Err(e) => {
                log_line(&format!("whatsapp document send failed: {e}"));
                emit_wa(
                    &app_for_task,
                    serde_json::json!({ "type": "send_error", "id": frame_id, "error": e }),
                );
            }
        }
    });
    Ok(())
}

#[tauri::command]
pub async fn wa_logout(app: AppHandle) -> Result<(), String> {
    let client = {
        let state = app.state::<WaState>();
        state.client.lock().unwrap().take()
    };
    if let Some(client) = client {
        // Graceful deregistration with a hard timeout — never hang the UI.
        let _ = tokio::time::timeout(std::time::Duration::from_secs(8), client.logout()).await;
    }
    if let Some(h) = app.state::<WaState>().handle.lock().unwrap().take() {
        h.abort();
    }
    let _ = std::fs::remove_dir_all(auth_dir(&app));
    {
        let state = app.state::<WaState>();
        *state.me.lock().unwrap() = None;
    }
    set_status(&app, "stopped");
    log_line("whatsapp unlinked — pairing session wiped");
    Ok(())
}

fn log_line(msg: &str) {
    crate::log_line(msg);
}
