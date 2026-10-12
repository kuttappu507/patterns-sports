// ============================================================
// PS-AMS :: WhatsApp linked-device engine — IN-PROCESS (no sidecar)
//
// Until v1.8.0 the engine was a separate `whatsapp-bot` exe shipped next
// to the app and driven over NDJSON stdin/stdout. It is now a plain tokio
// task inside this process, built on the same `whatsapp-rust` crate with
// the session persisted by our JSON-file backend (see wa_json_store.rs).
//
// This module is tauri-free so it can be type-checked standalone
// (scripts/wa-engine-check #[path]-includes it); the tauri command layer
// lives in whatsapp.rs and only translates state → UI events.
//
// The UI-visible behaviour is unchanged from the sidecar era:
//   status:  starting → pairing → (qr →) waiting_scan → connected
//            (reconnecting while the supervised loop retries; logged_out
//            when the pairing was revoked — the parent wipes + respawns)
//   sends:   fire-and-forget with a per-request id; the outcome arrives
//            as a sent / send_error event carrying that id.
// ============================================================

use base64::Engine as _;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use crate::wa_json_store::JsonFileStore;
use whatsapp_rust::bot::Bot;
use whatsapp_rust::http::UreqHttpClient;
use whatsapp_rust::media;
use whatsapp_rust::transport::TokioWebSocketTransportFactory;
use whatsapp_rust::wacore::download::MediaType;
use whatsapp_rust::wacore::store::DevicePropsOverride;
use whatsapp_rust::wacore::types::events::Event;
use whatsapp_rust::{Client, Jid, TokioRuntime};

/// The academy-branded device name shown on the phone's "Linked devices"
/// screen (the crate default is the anonymous "rust").
const DEVICE_OS: &str = "Pattern Sports AMS";

const MAX_DOCUMENT_BYTES: usize = 20 * 1024 * 1024;

/// UI sink implemented by the tauri layer. Every method maps 1:1 to the
/// old NDJSON frame the sidecar printed, so the frontend contract is
/// byte-for-byte identical.
pub trait WaEvents: Send + Sync {
    fn status(&self, value: &str);
    fn qr(&self, code: &str);
    fn connected(&self, jid: &str);
    fn send_result(&self, id: &str, ok: bool, error: Option<String>);
    fn log(&self, value: &str);
}

pub struct WaEngine {
    store: Arc<JsonFileStore>,
    client: Mutex<Option<Arc<Client>>>,
    events: Arc<dyn WaEvents>,
    /// Bumped per engine incarnation; the tauri layer drops events from a
    /// superseded engine (the reader-loop generation guard, in-process).
    pub generation: u64,
    run_task: Mutex<Option<tokio::task::JoinHandle<()>>>,
    stopped: Arc<AtomicBool>,
}

impl WaEngine {
    /// Build the bot with the JSON session store and start the supervised
    /// connection loop. Returns the live engine with a connected client
    /// handle as soon as the handshake machinery is up (exactly when the
    /// sidecar would have printed `starting`).
    pub async fn start(
        session_dir: &std::path::Path,
        events: Arc<dyn WaEvents>,
        generation: u64,
    ) -> Result<Arc<Self>, String> {
        let store = JsonFileStore::open(session_dir)
            .await
            .map_err(|e| format!("session store: {e}"))?;

        let builder = Bot::builder()
            .with_backend_arc(store.clone() as Arc<dyn whatsapp_rust::store::Backend>)
            .with_transport_factory(TokioWebSocketTransportFactory::new())
            .with_http_client(UreqHttpClient::new())
            .with_runtime(TokioRuntime)
            .with_device_props(DevicePropsOverride::new().with_os(DEVICE_OS));

        // Event sink: same frames as the sidecar, gated on our generation
        // by the caller-supplied events implementation.
        let ev_for_cb = Arc::clone(&events);
        let builder = builder.on_event(move |event, client| {
            let ev = Arc::clone(&ev_for_cb);
            async move { handle_event(&ev, &event, &client) }
        });

        let bot = builder.build().await.map_err(|e| format!("bot build: {e}"))?;
        let client = bot.client();

        let engine = Arc::new(Self {
            store,
            client: Mutex::new(Some(Arc::clone(&client))),
            events,
            generation,
            run_task: Mutex::new(None),
            stopped: Arc::new(AtomicBool::new(false)),
        });

        // Supervised connection loop (auto-reconnects with backoff).
        let handle = tokio::spawn(async move {
            bot.run().await;
        });
        *engine.run_task.lock().unwrap() = Some(handle);

        engine.events.status("pairing");
        if client.is_logged_in() {
            engine.events.log("saved session — reconnecting");
        }
        Ok(engine)
    }

    /// Live client handle, if this engine incarnation is current.
    pub fn client(&self) -> Option<Arc<Client>> {
        self.client.lock().unwrap().clone()
    }

    /// Fire-and-forget text send with the sidecar's per-request id
    /// semantics: returns Ok once dispatched into the engine; the outcome
    /// arrives later as a sent/send_error event for that id.
    pub fn send_text(self: &Arc<Self>, to: &str, text: &str, id: &str) -> Result<(), String> {
        let Some(client) = self.client() else {
            return Err("WhatsApp is not connected".into());
        };
        let jid = recipient_jid(to)?;
        let text = text.chars().take(4096).collect::<String>();
        let id = id.to_string();
        let engine = Arc::clone(self);
        tokio::spawn(async move {
            let outcome = client.send_text(jid, text).await;
            engine.report_send(&id, outcome.is_ok(), outcome.err());
        });
        Ok(())
    }

    /// Upload + deliver a document (the fee receipt PDF). Same fire-and-
    /// forget id semantics as send_text.
    pub fn send_document(
        self: &Arc<Self>,
        to: &str,
        data_base64: &str,
        file_name: &str,
        caption: Option<&str>,
        id: &str,
    ) -> Result<(), String> {
        let Some(client) = self.client() else {
            return Err("WhatsApp is not connected".into());
        };
        let jid = recipient_jid(to)?;
        let data = base64::engine::general_purpose::STANDARD
            .decode(data_base64.trim())
            .map_err(|e| format!("invalid payload: {e}"))?;
        if data.is_empty() {
            return Err("empty document".into());
        }
        if data.len() > MAX_DOCUMENT_BYTES {
            return Err("document exceeds the 20 MB limit".into());
        }
        let file_name: String = if file_name.trim().is_empty() {
            "PS-AMS-Receipt.pdf".to_string()
        } else {
            file_name.trim().to_string()
        };
        let file_name: String = file_name
            .chars()
            .map(|c| {
                if matches!(
                    c,
                    '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'
                ) {
                    '-'
                } else {
                    c
                }
            })
            .collect();
        let caption = caption
            .filter(|s| !s.is_empty())
            .map(|s| s.chars().take(1024).collect::<String>());
        let id = id.to_string();
        let engine = Arc::clone(self);
        tokio::spawn(async move {
            let outcome = async {
                let upload = client
                    .upload(data, MediaType::Document, Default::default())
                    .await
                    .map_err(|e| format!("upload failed: {e}"))?;
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
                    .map_err(|e| format!("delivery failed: {e}"))
            }
            .await;
            engine.report_send(&id, outcome.is_ok(), outcome.err());
        });
        Ok(())
    }

    /// Unlink the device: server-side logout, wipe the stored pairing.
    pub async fn logout(&self) -> Result<(), String> {
        if let Some(client) = self.client() {
            client.logout().await;
        }
        self.shutdown();
        Ok(())
    }

    /// Stop the engine: abort the supervised loop, disconnect, flush the
    /// session store. Safe to call twice; used by restart/exit paths.
    pub fn shutdown(&self) {
        if self.stopped.swap(true, Ordering::SeqCst) {
            return;
        }
        *self.client.lock().unwrap() = None;
        if let Some(handle) = self.run_task.lock().unwrap().take() {
            handle.abort();
        }
        self.store.shutdown();
    }

    fn report_send(&self, id: &str, ok: bool, err: Option<impl std::fmt::Display>) {
        if self.stopped.load(Ordering::Acquire) {
            return; // a superseded engine no longer reports
        }
        if ok {
            self.events.send_result(id, true, None);
        } else {
            let msg = err
                .map(|e| e.to_string())
                .unwrap_or_else(|| "unknown error".into());
            self.events.send_result(id, false, Some(msg));
        }
    }
}

/// Strip anything that is not an ASCII digit and validate the length.
pub fn recipient_jid(to: &str) -> Result<Jid, String> {
    let digits: String = to.chars().filter(|c| c.is_ascii_digit()).collect();
    if digits.len() < 8 || digits.len() > 15 {
        return Err("invalid WhatsApp number".into());
    }
    format!("{digits}@s.whatsapp.net")
        .parse::<Jid>()
        .map_err(|e| format!("invalid JID: {e}"))
}

fn handle_event(events: &Arc<dyn WaEvents>, event: &Event, client: &Arc<Client>) {
    match event {
        Event::PairingQrCode(qr) => events.qr(&qr.code),
        Event::PairSuccess(info) => events.log(&format!("paired as {}", info.id)),
        Event::Connected(_) => {
            let me = client
                .pn()
                .map(|j| format!("{}@s.whatsapp.net", j.user))
                .unwrap_or_default();
            events.connected(&me);
        }
        Event::Disconnected(_) => events.status("reconnecting"),
        Event::LoggedOut(_) => {
            // The pairing was revoked on the phone: reconnecting can NEVER
            // succeed. The parent wipes the session and respawns so a fresh
            // QR appears without user action (same as the sidecar exiting).
            events.status("logged_out");
        }
        Event::StreamError(e) => events.log(&format!("stream error: {e:?}")),
        Event::ConnectFailure(e) => events.log(&format!("connect failure: {e:?}")),
        _ => {}
    }
}

/// Monotonic engine generation counter (per app process).
#[derive(Default)]
pub struct Generation(AtomicU64);

impl Generation {
    pub fn next(&self) -> u64 {
        self.0.fetch_add(1, Ordering::SeqCst) + 1
    }
}
