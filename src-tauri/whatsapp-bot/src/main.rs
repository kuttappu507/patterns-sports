// ============================================================
// PS-AMS :: whatsapp-bot — NATIVE Rust linked-device sidecar
//
// A tiny (~6 MB, fully static Rust) WhatsApp engine built on the
// `whatsapp-rust` crate — the native port of the whatmeow/Baileys
// protocol stack. It replaced the previous Bun-compiled Baileys
// bundle (~40 MB with the whole Node runtime) so PS-AMS installers
// stay lean while keeping the exact same NDJSON stdio protocol:
//
//   app  -> bot : {"type":"send","id":"..","to":"9194..","text":".."}
//                 {"type":"send_document","id":"..","to":"..",
//                  "data_base64":"..","file_name":"..","caption":".."}
//                 {"type":"logout"}
//   bot  -> app : {"type":"status","value":"pairing|reconnecting|.."}
//                 {"type":"qr","value":"<raw qr payload>"}
//                 {"type":"connected","value":"<jid>"}
//                 {"type":"sent"|"send_error","id":"..","error"?: ".."}
//                 {"type":"log","value":".."}
//
// The pairing session persists in a SQLite store under the
// --auth-dir passed by the app — QR scan is a ONE-TIME setup.
// ============================================================

use base64::Engine as _;
use std::sync::Arc;
use tokio::io::AsyncBufReadExt;
use whatsapp_rust::bot::Bot;
use whatsapp_rust::http::UreqHttpClient;
use whatsapp_rust::media;
use whatsapp_rust::store::SqliteStore;
use whatsapp_rust::transport::TokioWebSocketTransportFactory;
use whatsapp_rust::wacore::download::MediaType;
use whatsapp_rust::wacore::types::events::Event;
use whatsapp_rust::{Jid, TokioRuntime};

const MAX_DOCUMENT_BYTES: usize = 20 * 1024 * 1024;

fn emit(value: serde_json::Value) {
    println!("{value}");
    use std::io::Write;
    let _ = std::io::stdout().flush();
}

fn emit_status(status: &str) {
    emit(serde_json::json!({ "type": "status", "value": status }));
}

/// Strip anything that is not an ASCII digit and validate the length.
fn recipient_jid(to: &str) -> Result<Jid, String> {
    let digits: String = to.chars().filter(|c| c.is_ascii_digit()).collect();
    if digits.len() < 8 || digits.len() > 15 {
        return Err("invalid WhatsApp number".into());
    }
    format!("{digits}@s.whatsapp.net")
        .parse::<Jid>()
        .map_err(|e| format!("invalid JID: {e}"))
}

#[tokio::main]
async fn main() {
    // Resolve --auth-dir <path> (defaults next to the exe).
    let argv: Vec<String> = std::env::args().collect();
    let auth_dir = argv
        .iter()
        .position(|a| a == "--auth-dir")
        .and_then(|i| argv.get(i + 1))
        .cloned()
        .unwrap_or_else(|| ".".into());

    if let Err(e) = std::fs::create_dir_all(&auth_dir) {
        emit(serde_json::json!({ "type": "log", "value": format!("auth dir create failed: {e}") }));
    }
    let store_path = format!("{}/wa-store.db", auth_dir.trim_end_matches(['/', '\\']));

    emit_status("starting");

    let backend = match SqliteStore::new(&store_path).await {
        Ok(b) => b,
        Err(e) => {
            emit(serde_json::json!({ "type": "log", "value": format!("store open failed: {e}") }));
            emit_status("stopped");
            return;
        }
    };

    let bot = match Bot::builder()
        .with_backend(backend)
        .with_transport_factory(TokioWebSocketTransportFactory::new())
        .with_http_client(UreqHttpClient::new())
        .with_runtime(TokioRuntime)
        .on_event(|event, client| async move {
            match &*event {
                Event::PairingQrCode(qr) => {
                    emit(serde_json::json!({ "type": "qr", "value": qr.code }));
                }
                Event::PairSuccess(info) => {
                    emit(serde_json::json!({ "type": "log", "value": format!("paired as {}", info.id) }));
                }
                Event::Connected(_) => {
                    let me = client
                        .pn()
                        .map(|j| format!("{}@s.whatsapp.net", j.user))
                        .unwrap_or_default();
                    emit(serde_json::json!({ "type": "connected", "value": me }));
                }
                Event::Disconnected(_) => emit_status("reconnecting"),
                Event::LoggedOut(_) => emit_status("logged_out"),
                Event::StreamError(e) => {
                    emit(serde_json::json!({ "type": "log", "value": format!("stream error: {e:?}") }));
                }
                Event::ConnectFailure(e) => {
                    emit(serde_json::json!({ "type": "log", "value": format!("connect failure: {e:?}") }));
                }
                _ => {}
            }
        })
        .build()
        .await
    {
        Ok(b) => b,
        Err(e) => {
            emit(serde_json::json!({ "type": "log", "value": format!("bot build failed: {e}") }));
            emit_status("stopped");
            return;
        }
    };

    let client = bot.client();

    // Supervised connection loop (auto-reconnects with backoff).
    tokio::spawn(async move {
        bot.run().await;
    });

    emit_status("pairing");
    if client.is_logged_in() {
        emit(serde_json::json!({ "type": "log", "value": "saved session — reconnecting" }));
    }

    // ---- NDJSON command loop over stdin ----
    let stdin = tokio::io::stdin();
    let mut lines = tokio::io::BufReader::new(stdin).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        let line = line.trim().to_string();
        if line.is_empty() {
            continue;
        }
        let Ok(frame) = serde_json::from_str::<serde_json::Value>(&line) else {
            emit(serde_json::json!({ "type": "log", "value": "unparsable frame" }));
            continue;
        };
        let kind = frame.get("type").and_then(|t| t.as_str()).unwrap_or("");
        let id = frame
            .get("id")
            .and_then(|x| x.as_str())
            .unwrap_or("unknown")
            .to_string();

        match kind {
            "send" => {
                let Some(to) = frame.get("to").and_then(|x| x.as_str()) else { continue };
                let text = frame
                    .get("text")
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .chars()
                    .take(4096)
                    .collect::<String>();
                match recipient_jid(to) {
                    Ok(jid) => match client.send_text(jid, text).await {
                        Ok(_) => emit(serde_json::json!({ "type": "sent", "id": id })),
                        Err(e) => emit(serde_json::json!({ "type": "send_error", "id": id, "error": e.to_string() })),
                    },
                    Err(e) => emit(serde_json::json!({ "type": "send_error", "id": id, "error": e })),
                }
            }
            "send_document" => {
                let Some(to) = frame.get("to").and_then(|x| x.as_str()).map(|s| s.to_string()) else { continue };
                let data = frame
                    .get("data_base64")
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .to_string();
                let file_name = frame
                    .get("file_name")
                    .and_then(|x| x.as_str())
                    .filter(|s| !s.trim().is_empty())
                    .unwrap_or("PS-AMS-Receipt.pdf")
                    .chars()
                    .map(|c| if matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') { '-' } else { c })
                    .collect::<String>();
                let caption = frame
                    .get("caption")
                    .and_then(|x| x.as_str())
                    .filter(|s| !s.is_empty())
                    .map(|s| s.chars().take(1024).collect::<String>());
                dispatch_document(&client, &to, &data, &file_name, caption.as_deref(), &id).await;
            }
            "logout" => {
                let _ = client.logout().await;
                let _ = std::fs::remove_dir_all(&auth_dir);
                emit_status("stopped");
                std::process::exit(0);
            }
            _ => {}
        }
    }
    // stdin closed — parent exited; clean shutdown.
    emit_status("stopped");
}

/// Keep the heavy lifting in one plain async fn (readability over clever chaining).
#[allow(clippy::too_many_arguments)]
async fn dispatch_document(
    client: &Arc<whatsapp_rust::Client>,
    to: &str,
    data: &str,
    file_name: &str,
    caption: Option<&str>,
    id: &str,
) {
    let outcome = async {
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(data.trim())
            .map_err(|e| format!("invalid payload: {e}"))?;
        if bytes.is_empty() {
            return Err("empty document".to_string());
        }
        if bytes.len() > MAX_DOCUMENT_BYTES {
            return Err("document exceeds the 20 MB limit".to_string());
        }
        let jid = recipient_jid(to)?;
        let upload = client
            .upload(bytes, MediaType::Document, Default::default())
            .await
            .map_err(|e| format!("upload failed: {e}"))?;
        let message = media::document_message(
            upload,
            media::DocumentOptions {
                mimetype: Some("application/pdf".into()),
                file_name: Some(file_name.to_string()),
                caption: caption.map(|c| c.to_string()),
                ..Default::default()
            },
        );
        client
            .send_message(jid, message)
            .await
            .map_err(|e| format!("delivery failed: {e}"))
    }
    .await;

    match outcome {
        Ok(_) => emit(serde_json::json!({ "type": "sent", "id": id })),
        Err(e) => emit(serde_json::json!({ "type": "send_error", "id": id, "error": e })),
    }
}

