// ============================================================
// PS-AMS :: WhatsApp linked-device session store — JSON file backend
//
// The engine used to live in a separate `whatsapp-bot` sidecar exe whose
// pairing session persisted in a Diesel/SQLite database (wa-store.db). The
// sidecar existed ONLY because the bot linked diesel → libsqlite3-sys 0.37
// while the app links sqlx → libsqlite3-sys 0.30, and Cargo's `links` rule
// forbids two versions of one -sys crate in a single dependency graph.
//
// The engine is now IN-PROCESS (see whatsapp.rs). Its session store
// implements wacore's `Backend` trait (SignalStore + AppSyncStore +
// ProtocolStore + MsgSecretStore + DeviceStore) over a single JSON file —
// zero libsqlite3-sys in this module, so the graph stays conflict-free.
//
// Design notes, mirroring the semantics of the reference SqliteStore
// (whatsapp-rust-sqlite-storage 0.7.0) method by method:
//   * every mutating call marks the store dirty; a background flusher
//     coalesces writes (history sync can hammer the store) and the file is
//     replaced atomically (tmp + rename), so a crash never truncates it;
//   * binary keys (index MACs, key IDs) are base64-encoded into JSON map
//     keys — the domain values are unchanged;
//   * on first run after this migration, a legacy wa-store.db found next to
//     the JSON file is imported (see `import_legacy_sqlite`) so existing
//     academies KEEP their WhatsApp pairing — no re-scan needed.
// ============================================================

use async_trait::async_trait;
use base64::Engine as _;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use wacore::store::error::{Result, StoreError};
use wacore::store::traits::{
    merge_msg_secret_expiry, merge_msg_secret_message_ts, AppSyncStore, AppStateSyncKey,
    DeviceInfo, DeviceListRecord, DeviceStore, LidPnMappingEntry, MsgSecretEntry, MsgSecretStore,
    PendingInboundKey, PendingInboundRow, ProtocolStore, SignalStore, TcTokenEntry,
};
use wacore::appstate::hash::HashState;
use wacore::appstate::processor::AppStateMutationMAC;
use wacore::store::Device as CoreDevice;

/// The whole persisted session, in one JSON document.
#[derive(Serialize, Deserialize, Default, Clone)]
struct StoreData {
    // --- DeviceStore ---
    /// Whether a device row exists (mirrors the old `device` table row).
    #[serde(default)]
    device_row: bool,
    /// The paired device (identity + noise keys + account). `None` until the
    /// first save after pairing.
    #[serde(default)]
    device: Option<CoreDevice>,

    // --- SignalStore ---
    /// address → 32-byte identity key
    #[serde(default)]
    identities: HashMap<String, Vec<u8>>,
    /// address → encrypted session record
    #[serde(default)]
    sessions: HashMap<String, Vec<u8>>,
    /// prekey id → (record, uploaded)
    #[serde(default)]
    prekeys: HashMap<u32, PrekeyRecord>,
    /// signed prekey id → record
    #[serde(default)]
    signed_prekeys: HashMap<u32, Vec<u8>>,
    /// sender-key address → record
    #[serde(default)]
    sender_keys: HashMap<String, Vec<u8>>,

    // --- AppSyncStore ---
    /// base64(key_id) → sync key
    #[serde(default)]
    sync_keys: HashMap<String, AppStateSyncKey>,
    /// collection name → hash state
    #[serde(default)]
    versions: HashMap<String, HashState>,
    /// collection name → (base64(index_mac) → value_mac)
    #[serde(default)]
    mutation_macs: HashMap<String, HashMap<String, Vec<u8>>>,

    // --- ProtocolStore ---
    /// group jid → (device jid → has_key)
    #[serde(default)]
    sender_key_devices: HashMap<String, HashMap<String, bool>>,
    /// lid → mapping entry (get_pn_mapping scans for the newest phone match)
    #[serde(default)]
    lid_pn: HashMap<String, LidPnMappingEntry>,
    /// "address\x1fmessage_id" → base key
    #[serde(default)]
    base_keys: HashMap<String, Vec<u8>>,
    /// user → device list record
    #[serde(default)]
    device_lists: HashMap<String, DeviceListRecord>,
    /// group jid → serialized GroupInfo blob (perf cache — safe to drop)
    #[serde(default)]
    group_metadata: HashMap<String, Vec<u8>>,
    /// jid → trusted contact token
    #[serde(default)]
    tc_tokens: HashMap<String, TcTokenEntry>,
    /// "chat\x1fmessage_id" → sent payload + timestamp (retry support)
    #[serde(default)]
    sent_messages: HashMap<String, HashMap<String, SentMessageEntry>>,

    // --- pending inbound buffer (inbound durability hook) ---
    /// "chat\x1fsender\x1fid" → (message, inserted_at)
    #[serde(default)]
    pending_inbound: HashMap<String, PendingInboundEntry>,

    // --- MsgSecretStore ---
    /// "chat\x1fsender\x1fmsg_id" → secret entry
    #[serde(default)]
    msg_secrets: HashMap<String, MsgSecretEntry>,
}

#[derive(Serialize, Deserialize, Clone)]
struct PrekeyRecord {
    record: Vec<u8>,
    uploaded: bool,
}

#[derive(Serialize, Deserialize, Clone)]
struct SentMessageEntry {
    payload: Vec<u8>,
    created_at: i64,
}

#[derive(Serialize, Deserialize, Clone)]
struct PendingInboundEntry {
    message: Vec<u8>,
    inserted_at: i64,
}

fn b64(bytes: &[u8]) -> String {
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

fn unkey(chat: &str, sender: &str, id: &str) -> String {
    format!("{chat}\u{1f}{sender}\u{1f}{id}")
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// The JSON-file backend. All mutating methods hold a short std::sync lock,
/// mark the store dirty and notify the flusher — file I/O happens OUTSIDE
/// the lock in the background task (serialize-then-write with the data
/// cloned under the lock; stores are a few MB at most).
pub struct JsonFileStore {
    path: PathBuf,
    inner: Mutex<StoreData>,
    dirty: Arc<AtomicBool>,
    notify: Arc<tokio::sync::Notify>,
    stopped: Arc<AtomicBool>,
}

impl JsonFileStore {
    /// Load (or create) the session store, importing a legacy sidecar
    /// database when present, then start the background flusher.
    pub async fn open(dir: &Path) -> std::result::Result<Arc<Self>, StoreError> {
        std::fs::create_dir_all(dir)?;
        let path = dir.join("wa-session.json");
        let data = if path.exists() {
            let bytes = std::fs::read(&path)?;
            match serde_json::from_slice::<StoreData>(&bytes) {
                Ok(data) => data,
                // A corrupt session file must not brick WhatsApp: retire it
                // and start fresh (the sidecar behaved the same on a corrupt
                // SQLite store) — the user simply re-scans the QR.
                Err(e) => {
                    log::warn!("wa-session.json unreadable ({e}) — retiring it and starting fresh");
                    eprintln!("wa-session.json unreadable: {e} — starting fresh");
                    let _ = std::fs::rename(&path, dir.join("wa-session.json.corrupt"));
                    StoreData::default()
                }
            }
        } else {
            StoreData::default()
        };
        let store = Arc::new(Self {
            path,
            inner: Mutex::new(data),
            dirty: Arc::new(AtomicBool::new(false)),
            notify: Arc::new(tokio::sync::Notify::new()),
            stopped: Arc::new(AtomicBool::new(false)),
        });

        // One-time migration from the removed sidecar's SQLite store.
        let legacy = dir.join("wa-store.db");
        if legacy.exists() {
            match import_legacy_sqlite(&legacy, &store).await {
                Ok(n) => {
                    log::info!("legacy wa-store.db imported ({n} records) — pairing preserved");
                    for suffix in ["", "-wal", "-shm"] {
                        let _ = std::fs::rename(
                            dir.join(format!("wa-store.db{suffix}")),
                            dir.join(format!("wa-store.db{suffix}.migrated")),
                        );
                    }
                    store.mark_dirty();
                    let _ = store.flush_now();
                }
                Err(e) => {
                    // Never block pairing on a failed migration: the store
                    // starts empty and the user simply re-scans the QR.
                    log::warn!("legacy wa-store.db import failed ({e}) — starting fresh");
                    eprintln!("legacy wa-store.db import failed: {e}");
                    let _ = std::fs::rename(&legacy, dir.join("wa-store.db.import-failed"));
                }
            }
        }

        // Background flusher: coalesce writes, flush at most every 400 ms.
        let weak = Arc::downgrade(&store);
        let notify = Arc::clone(&store.notify);
        let stopped = Arc::clone(&store.stopped);
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = notify.notified() => {}
                    _ = tokio::time::sleep(std::time::Duration::from_millis(400)) => {}
                }
                if stopped.load(Ordering::Acquire) {
                    break;
                }
                let Some(store) = weak.upgrade() else { break };
                if store.dirty.swap(false, Ordering::AcqRel) {
                    if let Err(e) = store.flush_now() {
                        log::warn!("wa session save failed: {e}");
                        store.dirty.store(true, Ordering::Release);
                    }
                }
            }
        });
        Ok(store)
    }

    fn mark_dirty(&self) {
        self.dirty.store(true, Ordering::Release);
        self.notify.notify_one();
    }

    /// Serialize the store and replace the file atomically. Safe to call
    /// from the flusher task and from shutdown paths.
    pub fn flush_now(&self) -> std::result::Result<(), StoreError> {
        let bytes = {
            let data = self
                .inner
                .lock()
                .map_err(|_| poisoned())?;
            serde_json::to_vec(&*data)
                .map_err(|e| StoreError::Serialization(Box::new(e)))?
        };
        let tmp = self.path.with_extension("json.tmp");
        std::fs::write(&tmp, &bytes)?;
        // Atomic on both NTFS and POSIX for our purposes: the rename either
        // replaces the old file or fails leaving the old one intact.
        std::fs::rename(&tmp, &self.path)?;
        Ok(())
    }

    /// Stop the flusher after a final flush (app exit / unlink / restart).
    pub fn shutdown(&self) {
        self.stopped.store(true, Ordering::Release);
        self.notify.notify_one();
        let _ = self.flush_now();
    }
}

fn poisoned() -> StoreError {
    StoreError::Connection(Box::new(std::io::Error::new(
        std::io::ErrorKind::Other,
        "wa session store lock poisoned",
    )))
}

/* --------------------------- SignalStore --------------------------- */

#[async_trait]
impl SignalStore for JsonFileStore {
    async fn put_identity(&self, address: &str, key: [u8; 32]) -> Result<()> {
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        d.identities.insert(address.to_string(), key.to_vec());
        drop(d);
        self.mark_dirty();
        Ok(())
    }

    async fn put_identities_batch(&self, identities: &[(Arc<str>, [u8; 32])]) -> Result<()> {
        if identities.is_empty() {
            return Ok(());
        }
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        for (address, key) in identities {
            d.identities.insert(address.to_string(), key.to_vec());
        }
        drop(d);
        self.mark_dirty();
        Ok(())
    }

    async fn load_identity(&self, address: &str) -> Result<Option<[u8; 32]>> {
        let d = self.inner.lock().map_err(|_| poisoned())?;
        Ok(d.identities.get(address).and_then(|k| {
            <[u8; 32]>::try_from(k.as_slice()).ok()
        }))
    }

    async fn delete_identity(&self, address: &str) -> Result<()> {
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        d.identities.remove(address);
        drop(d);
        self.mark_dirty();
        Ok(())
    }

    async fn get_session(&self, address: &str) -> Result<Option<bytes::Bytes>> {
        let d = self.inner.lock().map_err(|_| poisoned())?;
        Ok(d.sessions
            .get(address)
            .map(|s| bytes::Bytes::copy_from_slice(s)))
    }

    async fn put_session(&self, address: &str, session: &[u8]) -> Result<()> {
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        d.sessions.insert(address.to_string(), session.to_vec());
        drop(d);
        self.mark_dirty();
        Ok(())
    }

    async fn put_sessions_batch(&self, sessions: &[(Arc<str>, bytes::Bytes)]) -> Result<()> {
        if sessions.is_empty() {
            return Ok(());
        }
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        for (address, session) in sessions {
            d.sessions.insert(address.to_string(), session.to_vec());
        }
        drop(d);
        self.mark_dirty();
        Ok(())
    }

    async fn delete_session(&self, address: &str) -> Result<()> {
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        d.sessions.remove(address);
        drop(d);
        self.mark_dirty();
        Ok(())
    }

    async fn has_signal_state_for_user(&self, user: &str) -> Result<bool> {
        // Addresses are `user@server` (device 0) or `user:dev@server`.
        let d = self.inner.lock().map_err(|_| poisoned())?;
        let at = format!("{user}@");
        let dev = format!("{user}:");
        Ok(d.sessions
            .keys()
            .chain(d.identities.keys())
            .any(|a| a.starts_with(&at) || a.starts_with(&dev)))
    }

    async fn store_prekey(&self, id: u32, record: &[u8], uploaded: bool) -> Result<()> {
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        d.prekeys.insert(id, PrekeyRecord { record: record.to_vec(), uploaded });
        drop(d);
        self.mark_dirty();
        Ok(())
    }

    async fn store_prekeys_batch(&self, keys: &[(u32, bytes::Bytes)], uploaded: bool) -> Result<()> {
        if keys.is_empty() {
            return Ok(());
        }
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        for (id, record) in keys {
            d.prekeys.insert(*id, PrekeyRecord { record: record.to_vec(), uploaded });
        }
        drop(d);
        self.mark_dirty();
        Ok(())
    }

    async fn load_prekey(&self, id: u32) -> Result<Option<bytes::Bytes>> {
        let d = self.inner.lock().map_err(|_| poisoned())?;
        Ok(d.prekeys
            .get(&id)
            .map(|p| bytes::Bytes::copy_from_slice(&p.record)))
    }

    async fn mark_prekeys_uploaded(&self, ids: &[u32]) -> Result<()> {
        if ids.is_empty() {
            return Ok(());
        }
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        // UPDATE semantics on purpose: a consumed (deleted) prekey must stay
        // deleted — never resurrected by an upsert (matches the reference).
        for id in ids {
            if let Some(p) = d.prekeys.get_mut(id) {
                p.uploaded = true;
            }
        }
        drop(d);
        self.mark_dirty();
        Ok(())
    }

    async fn remove_prekey(&self, id: u32) -> Result<()> {
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        d.prekeys.remove(&id);
        drop(d);
        self.mark_dirty();
        Ok(())
    }

    async fn get_max_prekey_id(&self) -> Result<u32> {
        let d = self.inner.lock().map_err(|_| poisoned())?;
        Ok(d.prekeys.keys().copied().max().unwrap_or(0))
    }

    async fn store_signed_prekey(&self, id: u32, record: &[u8]) -> Result<()> {
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        d.signed_prekeys.insert(id, record.to_vec());
        drop(d);
        self.mark_dirty();
        Ok(())
    }

    async fn load_signed_prekey(&self, id: u32) -> Result<Option<Vec<u8>>> {
        let d = self.inner.lock().map_err(|_| poisoned())?;
        Ok(d.signed_prekeys.get(&id).cloned())
    }

    async fn load_all_signed_prekeys(&self) -> Result<Vec<(u32, Vec<u8>)>> {
        let d = self.inner.lock().map_err(|_| poisoned())?;
        Ok(d.signed_prekeys.iter().map(|(k, v)| (*k, v.clone())).collect())
    }

    async fn remove_signed_prekey(&self, id: u32) -> Result<()> {
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        d.signed_prekeys.remove(&id);
        drop(d);
        self.mark_dirty();
        Ok(())
    }

    async fn put_sender_key(&self, address: &str, record: &[u8]) -> Result<()> {
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        d.sender_keys.insert(address.to_string(), record.to_vec());
        drop(d);
        self.mark_dirty();
        Ok(())
    }

    async fn put_sender_keys_batch(&self, sender_keys: &[(Arc<str>, bytes::Bytes)]) -> Result<()> {
        if sender_keys.is_empty() {
            return Ok(());
        }
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        for (address, record) in sender_keys {
            d.sender_keys.insert(address.to_string(), record.to_vec());
        }
        drop(d);
        self.mark_dirty();
        Ok(())
    }

    async fn get_sender_key(&self, address: &str) -> Result<Option<Vec<u8>>> {
        let d = self.inner.lock().map_err(|_| poisoned())?;
        Ok(d.sender_keys.get(address).cloned())
    }

    async fn delete_sender_key(&self, address: &str) -> Result<()> {
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        d.sender_keys.remove(address);
        drop(d);
        self.mark_dirty();
        Ok(())
    }
}

/* --------------------------- AppSyncStore --------------------------- */

#[async_trait]
impl AppSyncStore for JsonFileStore {
    async fn get_sync_key(&self, key_id: &[u8]) -> Result<Option<AppStateSyncKey>> {
        let d = self.inner.lock().map_err(|_| poisoned())?;
        Ok(d.sync_keys.get(&b64(key_id)).cloned())
    }

    async fn set_sync_key(&self, key_id: &[u8], key: AppStateSyncKey) -> Result<()> {
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        d.sync_keys.insert(b64(key_id), key);
        drop(d);
        self.mark_dirty();
        Ok(())
    }

    async fn get_version(&self, name: &str) -> Result<HashState> {
        let d = self.inner.lock().map_err(|_| poisoned())?;
        Ok(d.versions.get(name).cloned().unwrap_or_default())
    }

    async fn set_version(&self, name: &str, state: HashState) -> Result<()> {
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        d.versions.insert(name.to_string(), state);
        drop(d);
        self.mark_dirty();
        Ok(())
    }

    async fn put_mutation_macs(
        &self,
        name: &str,
        _version: u64,
        mutations: &[AppStateMutationMAC],
    ) -> Result<()> {
        if mutations.is_empty() {
            return Ok(());
        }
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        let bucket = d.mutation_macs.entry(name.to_string()).or_default();
        for m in mutations {
            bucket.insert(b64(&m.index_mac), m.value_mac.clone());
        }
        drop(d);
        self.mark_dirty();
        Ok(())
    }

    async fn get_mutation_mac(&self, name: &str, index_mac: &[u8]) -> Result<Option<Vec<u8>>> {
        let d = self.inner.lock().map_err(|_| poisoned())?;
        Ok(d.mutation_macs
            .get(name)
            .and_then(|b| b.get(&b64(index_mac)))
            .cloned())
    }

    async fn get_mutation_macs(
        &self,
        name: &str,
        index_macs: &[[u8; 32]],
    ) -> Result<HashMap<[u8; 32], Vec<u8>>> {
        let d = self.inner.lock().map_err(|_| poisoned())?;
        let bucket = d.mutation_macs.get(name);
        let mut out = HashMap::with_capacity(index_macs.len());
        for mac in index_macs {
            if let Some(v) = bucket.and_then(|b| b.get(&b64(mac))) {
                out.insert(*mac, v.clone());
            }
        }
        Ok(out)
    }

    async fn delete_mutation_macs(&self, name: &str, index_macs: &[Vec<u8>]) -> Result<()> {
        if index_macs.is_empty() {
            return Ok(());
        }
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        if let Some(bucket) = d.mutation_macs.get_mut(name) {
            for mac in index_macs {
                bucket.remove(&b64(mac));
            }
        }
        drop(d);
        self.mark_dirty();
        Ok(())
    }

    async fn clear_mutation_macs(&self, name: &str) -> Result<()> {
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        d.mutation_macs.remove(name);
        drop(d);
        self.mark_dirty();
        Ok(())
    }

    async fn get_latest_sync_key_id(&self) -> Result<Option<Vec<u8>>> {
        let d = self.inner.lock().map_err(|_| poisoned())?;
        // Latest = lexicographically highest key_id (matches the reference's
        // key_id DESC); our keys decode by construction so no skipping needed.
        Ok(d.sync_keys
            .keys()
            .max_by_key(|k| base64::engine::general_purpose::STANDARD.decode(k).unwrap_or_default())
            .and_then(|k| base64::engine::general_purpose::STANDARD.decode(k).ok()))
    }
}

/* --------------------------- ProtocolStore --------------------------- */

#[async_trait]
impl ProtocolStore for JsonFileStore {
    async fn get_sender_key_devices(&self, group_jid: &str) -> Result<Vec<(String, bool)>> {
        let d = self.inner.lock().map_err(|_| poisoned())?;
        Ok(d.sender_key_devices
            .get(group_jid)
            .map(|m| m.iter().map(|(k, v)| (k.clone(), *v)).collect())
            .unwrap_or_default())
    }

    async fn set_sender_key_status(&self, group_jid: &str, entries: &[(&str, bool)]) -> Result<()> {
        if entries.is_empty() {
            return Ok(());
        }
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        let bucket = d.sender_key_devices.entry(group_jid.to_string()).or_default();
        for (device_jid, has_key) in entries {
            bucket.insert(device_jid.to_string(), *has_key);
        }
        drop(d);
        self.mark_dirty();
        Ok(())
    }

    async fn clear_sender_key_devices(&self, group_jid: &str) -> Result<()> {
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        d.sender_key_devices.remove(group_jid);
        drop(d);
        self.mark_dirty();
        Ok(())
    }

    async fn delete_sender_key_device_rows(&self, device_jids: &[&str]) -> Result<()> {
        if device_jids.is_empty() {
            return Ok(());
        }
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        for bucket in d.sender_key_devices.values_mut() {
            for jid in device_jids {
                bucket.remove(*jid);
            }
        }
        drop(d);
        self.mark_dirty();
        Ok(())
    }

    async fn clear_all_sender_key_devices(&self) -> Result<()> {
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        d.sender_key_devices.clear();
        drop(d);
        self.mark_dirty();
        Ok(())
    }

    async fn get_lid_mapping(&self, lid: &str) -> Result<Option<LidPnMappingEntry>> {
        let d = self.inner.lock().map_err(|_| poisoned())?;
        Ok(d.lid_pn.get(lid).cloned())
    }

    async fn get_pn_mapping(&self, phone: &str) -> Result<Option<LidPnMappingEntry>> {
        let d = self.inner.lock().map_err(|_| poisoned())?;
        // The most recent LID for that phone (max updated_at), like the
        // reference's `ORDER BY updated_at DESC LIMIT 1`.
        Ok(d.lid_pn
            .values()
            .filter(|e| e.phone_number == phone)
            .max_by_key(|e| e.updated_at)
            .cloned())
    }

    async fn put_lid_mapping(&self, entry: &LidPnMappingEntry) -> Result<()> {
        self.put_lid_mappings(std::slice::from_ref(entry)).await
    }

    async fn put_lid_mappings(&self, entries: &[LidPnMappingEntry]) -> Result<()> {
        if entries.is_empty() {
            return Ok(());
        }
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        for e in entries {
            d.lid_pn.insert(e.lid.clone(), e.clone());
        }
        drop(d);
        self.mark_dirty();
        Ok(())
    }

    async fn get_all_lid_mappings(&self) -> Result<Vec<LidPnMappingEntry>> {
        let d = self.inner.lock().map_err(|_| poisoned())?;
        Ok(d.lid_pn.values().cloned().collect())
    }

    async fn save_base_key(&self, address: &str, message_id: &str, base_key: &[u8]) -> Result<()> {
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        d.base_keys
            .insert(format!("{address}\u{1f}{message_id}"), base_key.to_vec());
        drop(d);
        self.mark_dirty();
        Ok(())
    }

    async fn has_same_base_key(
        &self,
        address: &str,
        message_id: &str,
        current_base_key: &[u8],
    ) -> Result<bool> {
        let d = self.inner.lock().map_err(|_| poisoned())?;
        Ok(d.base_keys
            .get(&format!("{address}\u{1f}{message_id}"))
            .map(|k| k.as_slice() == current_base_key)
            .unwrap_or(false))
    }

    async fn delete_base_key(&self, address: &str, message_id: &str) -> Result<()> {
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        d.base_keys.remove(&format!("{address}\u{1f}{message_id}"));
        drop(d);
        self.mark_dirty();
        Ok(())
    }

    async fn update_device_list(&self, record: DeviceListRecord) -> Result<()> {
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        d.device_lists.insert(record.user.clone(), record);
        drop(d);
        self.mark_dirty();
        Ok(())
    }

    async fn update_device_lists(&self, records: Vec<DeviceListRecord>) -> Result<()> {
        if records.is_empty() {
            return Ok(());
        }
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        for record in records {
            d.device_lists.insert(record.user.clone(), record);
        }
        drop(d);
        self.mark_dirty();
        Ok(())
    }

    async fn get_devices(&self, user: &str) -> Result<Option<DeviceListRecord>> {
        let d = self.inner.lock().map_err(|_| poisoned())?;
        Ok(d.device_lists.get(user).cloned())
    }

    async fn delete_devices(&self, user: &str) -> Result<()> {
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        d.device_lists.remove(user);
        drop(d);
        self.mark_dirty();
        Ok(())
    }

    async fn get_group_metadata(&self, group_jid: &str) -> Result<Option<Vec<u8>>> {
        let d = self.inner.lock().map_err(|_| poisoned())?;
        Ok(d.group_metadata.get(group_jid).cloned())
    }

    async fn put_group_metadata(&self, group_jid: &str, blob: &[u8]) -> Result<()> {
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        d.group_metadata.insert(group_jid.to_string(), blob.to_vec());
        drop(d);
        self.mark_dirty();
        Ok(())
    }

    async fn delete_group_metadata(&self, group_jid: &str) -> Result<()> {
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        d.group_metadata.remove(group_jid);
        drop(d);
        self.mark_dirty();
        Ok(())
    }

    async fn get_tc_token(&self, jid: &str) -> Result<Option<TcTokenEntry>> {
        let d = self.inner.lock().map_err(|_| poisoned())?;
        Ok(d.tc_tokens.get(jid).cloned())
    }

    async fn put_tc_token(&self, jid: &str, entry: &TcTokenEntry) -> Result<()> {
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        d.tc_tokens.insert(jid.to_string(), entry.clone());
        drop(d);
        self.mark_dirty();
        Ok(())
    }

    async fn delete_tc_token(&self, jid: &str) -> Result<()> {
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        d.tc_tokens.remove(jid);
        drop(d);
        self.mark_dirty();
        Ok(())
    }

    async fn get_all_tc_token_jids(&self) -> Result<Vec<String>> {
        let d = self.inner.lock().map_err(|_| poisoned())?;
        Ok(d.tc_tokens.keys().cloned().collect())
    }

    async fn delete_expired_tc_tokens(&self, token_cutoff: i64, sender_cutoff: i64) -> Result<u32> {
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        let before = d.tc_tokens.len();
        // Drop a row only when BOTH the received token is expired-or-absent
        // AND the sender bucket is expired-or-absent (matches the reference).
        d.tc_tokens.retain(|_, e| {
            let token_alive =
                !e.token.is_empty() && e.token_timestamp >= token_cutoff;
            let sender_alive = matches!(e.sender_timestamp, Some(ts) if ts >= sender_cutoff);
            token_alive || sender_alive
        });
        let removed = (before - d.tc_tokens.len()) as u32;
        drop(d);
        if removed > 0 {
            self.mark_dirty();
        }
        Ok(removed)
    }

    async fn touch_tc_token_sender_timestamp(
        &self,
        jid: &str,
        sender_timestamp: i64,
    ) -> Result<()> {
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        let entry = d.tc_tokens.entry(jid.to_string()).or_insert(TcTokenEntry {
            token: Vec::new(),
            token_timestamp: sender_timestamp,
            sender_timestamp: None,
        });
        entry.sender_timestamp = Some(match entry.sender_timestamp {
            Some(existing) => existing.max(sender_timestamp),
            None => sender_timestamp,
        });
        drop(d);
        self.mark_dirty();
        Ok(())
    }

    async fn store_received_tc_token(
        &self,
        jid: &str,
        token: &[u8],
        token_timestamp: i64,
    ) -> Result<()> {
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        let entry = d.tc_tokens.entry(jid.to_string()).or_insert(TcTokenEntry {
            token: Vec::new(),
            token_timestamp: 0,
            sender_timestamp: None,
        });
        // Newer-wins: a stale token write must not clobber a fresher real
        // token; a placeholder (empty) never blocks the first real one.
        if !entry.token.is_empty() && token_timestamp < entry.token_timestamp {
            return Ok(());
        }
        entry.token = token.to_vec();
        entry.token_timestamp = token_timestamp;
        drop(d);
        self.mark_dirty();
        Ok(())
    }

    async fn store_sent_message(
        &self,
        chat_jid: &str,
        message_id: &str,
        payload: &[u8],
    ) -> Result<()> {
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        d.sent_messages
            .entry(chat_jid.to_string())
            .or_default()
            .insert(
                message_id.to_string(),
                SentMessageEntry { payload: payload.to_vec(), created_at: now_secs() },
            );
        drop(d);
        self.mark_dirty();
        Ok(())
    }

    async fn take_sent_message(&self, chat_jid: &str, message_id: &str) -> Result<Option<Vec<u8>>> {
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        let taken = d
            .sent_messages
            .get_mut(chat_jid)
            .and_then(|m| m.remove(message_id))
            .map(|e| e.payload);
        drop(d);
        if taken.is_some() {
            self.mark_dirty();
        }
        Ok(taken)
    }

    async fn delete_expired_sent_messages(&self, cutoff_timestamp: i64) -> Result<u32> {
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        let before: usize = d.sent_messages.values().map(|m| m.len()).sum();
        for m in d.sent_messages.values_mut() {
            m.retain(|_, e| e.created_at >= cutoff_timestamp);
        }
        d.sent_messages.retain(|_, m| !m.is_empty());
        let removed = (before - d.sent_messages.values().map(|m| m.len()).sum::<usize>()) as u32;
        drop(d);
        if removed > 0 {
            self.mark_dirty();
        }
        Ok(removed)
    }

    async fn store_pending_inbound(
        &self,
        chat: &str,
        sender: &str,
        id: &str,
        message: &[u8],
    ) -> Result<()> {
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        d.pending_inbound.insert(
            unkey(chat, sender, id),
            PendingInboundEntry { message: message.to_vec(), inserted_at: now_secs() },
        );
        drop(d);
        self.mark_dirty();
        Ok(())
    }

    async fn get_pending_inbound(
        &self,
        chat: &str,
        sender: &str,
        id: &str,
    ) -> Result<Option<Vec<u8>>> {
        let d = self.inner.lock().map_err(|_| poisoned())?;
        Ok(d.pending_inbound.get(&unkey(chat, sender, id)).map(|e| e.message.clone()))
    }

    async fn delete_pending_inbound(&self, chat: &str, sender: &str, id: &str) -> Result<()> {
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        d.pending_inbound.remove(&unkey(chat, sender, id));
        drop(d);
        self.mark_dirty();
        Ok(())
    }

    async fn delete_expired_pending_inbound(&self, cutoff_timestamp: i64) -> Result<u32> {
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        let before = d.pending_inbound.len();
        d.pending_inbound.retain(|_, e| e.inserted_at >= cutoff_timestamp);
        let removed = (before - d.pending_inbound.len()) as u32;
        drop(d);
        if removed > 0 {
            self.mark_dirty();
        }
        Ok(removed)
    }

    async fn store_pending_inbound_batch(&self, rows: &[PendingInboundRow<'_>]) -> Result<()> {
        if rows.is_empty() {
            return Ok(());
        }
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        let now = now_secs();
        for row in rows {
            d.pending_inbound.insert(
                unkey(row.chat, row.sender, row.id),
                PendingInboundEntry { message: row.message.to_vec(), inserted_at: now },
            );
        }
        drop(d);
        self.mark_dirty();
        Ok(())
    }

    async fn delete_pending_inbound_batch(&self, keys: &[PendingInboundKey<'_>]) -> Result<()> {
        if keys.is_empty() {
            return Ok(());
        }
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        for key in keys {
            d.pending_inbound.remove(&unkey(key.chat, key.sender, key.id));
        }
        drop(d);
        self.mark_dirty();
        Ok(())
    }
}

/* --------------------------- MsgSecretStore --------------------------- */

#[async_trait]
impl MsgSecretStore for JsonFileStore {
    async fn put_msg_secrets(&self, entries: Vec<MsgSecretEntry>) -> Result<usize> {
        if entries.is_empty() {
            return Ok(0);
        }
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        for e in entries {
            let key = unkey(&e.chat, &e.sender, &e.msg_id);
            match d.msg_secrets.get_mut(&key) {
                Some(existing) => {
                    existing.expires_at =
                        merge_msg_secret_expiry(existing.expires_at, e.expires_at);
                    existing.message_ts =
                        merge_msg_secret_message_ts(existing.message_ts, e.message_ts);
                    existing.secret = e.secret;
                }
                None => {
                    d.msg_secrets.insert(key, e);
                }
            }
        }
        let written = d.msg_secrets.len();
        drop(d);
        self.mark_dirty();
        Ok(written)
    }

    async fn get_msg_secret(
        &self,
        chat: &str,
        sender: &str,
        msg_id: &str,
    ) -> Result<Option<Vec<u8>>> {
        let d = self.inner.lock().map_err(|_| poisoned())?;
        Ok(d.msg_secrets.get(&unkey(chat, sender, msg_id)).map(|e| e.secret.to_vec()))
    }

    async fn get_msg_secret_with_ts(
        &self,
        chat: &str,
        sender: &str,
        msg_id: &str,
    ) -> Result<Option<(Vec<u8>, i64)>> {
        let d = self.inner.lock().map_err(|_| poisoned())?;
        Ok(d.msg_secrets
            .get(&unkey(chat, sender, msg_id))
            .map(|e| (e.secret.to_vec(), e.message_ts)))
    }

    async fn delete_expired_msg_secrets(&self, cutoff_timestamp: i64) -> Result<u32> {
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        let before = d.msg_secrets.len();
        // Rows with expires_at = 0 never expire (matches the reference).
        d.msg_secrets
            .retain(|_, e| e.expires_at == 0 || e.expires_at > cutoff_timestamp);
        let removed = (before - d.msg_secrets.len()) as u32;
        drop(d);
        if removed > 0 {
            self.mark_dirty();
        }
        Ok(removed)
    }
}

/* ---------------------------- DeviceStore ---------------------------- */

#[async_trait]
impl DeviceStore for JsonFileStore {
    async fn save(&self, device: &CoreDevice) -> Result<()> {
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        d.device_row = true;
        d.device = Some(device.clone());
        drop(d);
        self.mark_dirty();
        Ok(())
    }

    async fn load(&self) -> Result<Option<CoreDevice>> {
        let d = self.inner.lock().map_err(|_| poisoned())?;
        Ok(d.device.clone())
    }

    async fn exists(&self) -> Result<bool> {
        let d = self.inner.lock().map_err(|_| poisoned())?;
        Ok(d.device_row)
    }

    async fn create(&self) -> Result<i32> {
        let mut d = self.inner.lock().map_err(|_| poisoned())?;
        d.device_row = true;
        drop(d);
        self.mark_dirty();
        Ok(1)
    }
}

/* ------------------- legacy sidecar session import ------------------- */
//
// Reads the REMOVED sidecar's Diesel/SQLite store (wa-store.db) and fills
// this store so existing academies keep their WhatsApp pairing after the
// update — no QR re-scan. The sidecar was diesel(sqlite)-based with these
// exact tables (whatsapp-rust-sqlite-storage 0.7.0 schema.rs); the blobs
// for app-state keys/versions use a small protobuf framing that is decoded
// by the minimal reader below. The server cert chain cache is intentionally
// NOT imported (a perf cache only — its absence just makes the next connect
// pay one XX handshake, exactly like the reference does on a corrupt blob).

use sqlx::Row;

async fn import_legacy_sqlite(
    db_path: &Path,
    store: &JsonFileStore,
) -> std::result::Result<usize, String> {
    use wacore::libsignal::protocol::{KeyPair, PrivateKey, PublicKey};
    use wacore_binary::Jid;

    let url = format!("sqlite:{}?mode=ro", db_path.display());
    let mut conn = sqlx::Connection::connect(&url)
        .await
        .map_err(|e| format!("open legacy db: {e}"))?;

    let mut imported = 0usize;

    // Older sidecar builds may predate some tables — the diesel migrations
    // ran incrementally. A missing table is SKIPPED (its data simply did
    // not exist), not an import failure; only real read/decode errors are.
    async fn table_exists(conn: &mut sqlx::sqlite::SqliteConnection, name: &str) -> bool {
        sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = $1",
        )
        .bind(name)
        .fetch_one(conn)
        .await
        .map(|n| n > 0)
        .unwrap_or(false)
    }

    async fn read_rows(
        conn: &mut sqlx::sqlite::SqliteConnection,
        sql: &str,
    ) -> std::result::Result<Vec<sqlx::sqlite::SqliteRow>, String> {
        match sqlx::query(sql).fetch_all(conn).await {
            Ok(rows) => Ok(rows),
            // A table the sidecar build never created carries no data — skip it.
            Err(e) if e.to_string().contains("no such table") => Ok(Vec::new()),
            Err(e) => Err(e.to_string()),
        }
    }

    // ---- device (the pairing identity itself) ----
    let device_row = if table_exists(&mut conn, "device").await {
        sqlx::query(
            "SELECT lid, pn, registration_id, noise_key, identity_key, signed_pre_key, \
             signed_pre_key_id, signed_pre_key_signature, adv_secret_key, account, push_name, \
             app_version_primary, app_version_secondary, app_version_tertiary, \
             app_version_last_fetched_ms, edge_routing_info, props_hash, next_pre_key_id, \
             first_unupload_pre_key_id, server_has_prekeys, nct_salt, login_counter, \
             lid_migrated, last_signed_pre_key_rotation_ms, read_receipts_disabled \
             FROM device LIMIT 1",
        )
        .fetch_optional(&mut conn)
        .await
        .map_err(|e| format!("read device: {e}"))?
    } else {
        None
    };

    if let Some(row) = device_row {
        fn keypair(col: &[u8]) -> std::result::Result<KeyPair, String> {
            if col.len() != 64 {
                return Err(format!("keypair length {} != 64", col.len()));
            }
            let private = PrivateKey::deserialize(&col[0..32])
                .map_err(|e| format!("private key: {e}"))?;
            let public = PublicKey::from_djb_public_key_bytes(&col[32..64])
                .map_err(|e| format!("public key: {e}"))?;
            Ok(KeyPair::new(public, private))
        }
        let parse_jid = |s: &str| -> Option<Jid> { if s.is_empty() { None } else { s.parse().ok() } };

        let noise_key = keypair(row.get("noise_key"))?;
        let identity_key = keypair(row.get("identity_key"))?;
        let signed_pre_key = keypair(row.get("signed_pre_key"))?;
        let sig: Vec<u8> = row.get("signed_pre_key_signature");
        let sig: [u8; 64] = sig
            .try_into()
            .map_err(|_| "signed_pre_key_signature length".to_string())?;
        let adv: Vec<u8> = row.get("adv_secret_key");
        let adv: [u8; 32] = adv.try_into().map_err(|_| "adv_secret_key length".to_string())?;
        let account: Option<Vec<u8>> = row.get("account");
        let account = match account {
            Some(bytes) => Some(
                wacore::store::device::account_serde::from_bytes(&bytes)
                    .map(Arc::new)
                    .map_err(|e| format!("account blob: {e}"))?,
            ),
            None => None,
        };

        let device = CoreDevice {
            pn: parse_jid(row.get::<String, _>("pn").as_str()),
            lid: parse_jid(row.get::<String, _>("lid").as_str()),
            registration_id: row.get::<i32, _>("registration_id") as u32,
            noise_key,
            identity_key,
            signed_pre_key,
            signed_pre_key_id: row.get::<i32, _>("signed_pre_key_id") as u32,
            signed_pre_key_signature: sig,
            adv_secret_key: adv,
            account,
            push_name: row.get("push_name"),
            app_version_primary: row.get::<i32, _>("app_version_primary") as u32,
            app_version_secondary: row.get::<i32, _>("app_version_secondary") as u32,
            app_version_tertiary: row.get::<i64, _>("app_version_tertiary") as u32,
            app_version_last_fetched_ms: row.get("app_version_last_fetched_ms"),
            device_props: Arc::new(wacore::store::device::DEVICE_PROPS.clone()),
            client_profile: wacore::client_profile::ClientProfile::web(),
            edge_routing_info: row.get("edge_routing_info"),
            props_hash: row.get("props_hash"),
            next_pre_key_id: row.get::<i32, _>("next_pre_key_id") as u32,
            first_unupload_pre_key_id: row.get::<i32, _>("first_unupload_pre_key_id") as u32,
            server_has_prekeys: row.get("server_has_prekeys"),
            nct_salt: row.get("nct_salt"),
            nct_salt_sync_seen: false,
            server_cert_chain: None,
            login_counter: row.get("login_counter"),
            lid_migrated: row.get("lid_migrated"),
            last_signed_pre_key_rotation_ms: row.get("last_signed_pre_key_rotation_ms"),
            read_receipts_disabled: row.get("read_receipts_disabled"),
        };
        {
            let mut d = store.inner.lock().map_err(|_| "store lock".to_string())?;
            d.device_row = true;
            d.device = Some(device);
        }
        imported += 1;
    }

    // ---- signal stores ----
    for row in read_rows(&mut conn, "SELECT address, key FROM identities").await?
    {
        let address: String = row.get("address");
        let key: Vec<u8> = row.get("key");
        if key.len() == 32 {
            let mut d = store.inner.lock().map_err(|_| "store lock".to_string())?;
            d.identities.insert(address, key);
            imported += 1;
        }
    }
    for row in read_rows(&mut conn, "SELECT address, record FROM sessions").await?
    {
        let address: String = row.get("address");
        let record: Vec<u8> = row.get("record");
        let mut d = store.inner.lock().map_err(|_| "store lock".to_string())?;
        d.sessions.insert(address, record);
        imported += 1;
    }
    for row in read_rows(&mut conn, "SELECT id, key, uploaded FROM prekeys").await?
    {
        let id: i64 = row.get("id");
        let record: Vec<u8> = row.get("key");
        let uploaded: bool = row.get("uploaded");
        let mut d = store.inner.lock().map_err(|_| "store lock".to_string())?;
        d.prekeys.insert(id as u32, PrekeyRecord { record, uploaded });
        imported += 1;
    }
    for row in read_rows(&mut conn, "SELECT id, record FROM signed_prekeys").await?
    {
        let id: i64 = row.get("id");
        let record: Vec<u8> = row.get("record");
        let mut d = store.inner.lock().map_err(|_| "store lock".to_string())?;
        d.signed_prekeys.insert(id as u32, record);
        imported += 1;
    }
    for row in read_rows(&mut conn, "SELECT address, record FROM sender_keys").await?
    {
        let address: String = row.get("address");
        let record: Vec<u8> = row.get("record");
        let mut d = store.inner.lock().map_err(|_| "store lock".to_string())?;
        d.sender_keys.insert(address, record);
        imported += 1;
    }

    // ---- app state ----
    for row in read_rows(&mut conn, "SELECT key_id, key_data FROM app_state_keys").await?
    {
        let key_id: Vec<u8> = row.get("key_id");
        let key_data: Vec<u8> = row.get("key_data");
        if let Some(key) = pb_decode_app_state_sync_key(&key_data) {
            let mut d = store.inner.lock().map_err(|_| "store lock".to_string())?;
            d.sync_keys.insert(b64(&key_id), key);
            imported += 1;
        }
    }
    for row in read_rows(&mut conn, "SELECT name, state_data FROM app_state_versions").await?
    {
        let name: String = row.get("name");
        let state_data: Vec<u8> = row.get("state_data");
        if let Some(state) = pb_decode_hash_state(&state_data) {
            let mut d = store.inner.lock().map_err(|_| "store lock".to_string())?;
            d.versions.insert(name, state);
            imported += 1;
        }
    }
    for row in read_rows(&mut conn, "SELECT name, index_mac, value_mac FROM app_state_mutation_macs").await?
    {
        let name: String = row.get("name");
        let index_mac: Vec<u8> = row.get("index_mac");
        let value_mac: Vec<u8> = row.get("value_mac");
        let mut d = store.inner.lock().map_err(|_| "store lock".to_string())?;
        d.mutation_macs.entry(name).or_default().insert(b64(&index_mac), value_mac);
        imported += 1;
    }

    // ---- protocol stores ----
    for row in read_rows(&mut conn, "SELECT group_jid, device_jid, has_key FROM sender_key_devices").await?
    {
        let group_jid: String = row.get("group_jid");
        let device_jid: String = row.get("device_jid");
        let has_key: i64 = row.get("has_key");
        let mut d = store.inner.lock().map_err(|_| "store lock".to_string())?;
        d.sender_key_devices
            .entry(group_jid)
            .or_default()
            .insert(device_jid, has_key != 0);
        imported += 1;
    }
    for row in read_rows(&mut conn, "SELECT lid, phone_number, created_at, learning_source, updated_at FROM lid_pn_mapping",).await?
    {
        let entry = LidPnMappingEntry {
            lid: row.get("lid"),
            phone_number: row.get("phone_number"),
            created_at: row.get::<i64, _>("created_at"),
            learning_source: row.get("learning_source"),
            updated_at: row.get::<i64, _>("updated_at"),
        };
        let mut d = store.inner.lock().map_err(|_| "store lock".to_string())?;
        d.lid_pn.insert(entry.lid.clone(), entry);
        imported += 1;
    }
    for row in read_rows(&mut conn, "SELECT address, message_id, base_key FROM base_keys").await?
    {
        let address: String = row.get("address");
        let message_id: String = row.get("message_id");
        let base_key: Vec<u8> = row.get("base_key");
        let mut d = store.inner.lock().map_err(|_| "store lock".to_string())?;
        d.base_keys.insert(format!("{address}\u{1f}{message_id}"), base_key);
        imported += 1;
    }
    for row in read_rows(&mut conn, "SELECT user_id, devices_json, timestamp, phash, raw_id FROM device_registry",).await?
    {
        // devices_json is the JSON array of DeviceInfo (serde) in the reference.
        let devices_json: String = row.get("devices_json");
        let devices: Vec<DeviceInfo> = match serde_json::from_str(&devices_json) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let record = DeviceListRecord {
            user: row.get("user_id"),
            devices,
            timestamp: row.get::<i32, _>("timestamp") as i64,
            phash: row.get("phash"),
            raw_id: row.get::<Option<i32>, _>("raw_id").map(|v| v as u32),
        };
        let mut d = store.inner.lock().map_err(|_| "store lock".to_string())?;
        d.device_lists.insert(record.user.clone(), record);
        imported += 1;
    }
    for row in read_rows(&mut conn, "SELECT group_jid, info FROM group_metadata").await?
    {
        let group_jid: String = row.get("group_jid");
        let info: Vec<u8> = row.get("info");
        let mut d = store.inner.lock().map_err(|_| "store lock".to_string())?;
        d.group_metadata.insert(group_jid, info);
        imported += 1;
    }
    for row in read_rows(&mut conn, "SELECT jid, token, token_timestamp, sender_timestamp FROM tc_tokens").await?
    {
        let entry = TcTokenEntry {
            token: row.get("token"),
            token_timestamp: row.get::<i64, _>("token_timestamp"),
            sender_timestamp: row.get("sender_timestamp"),
        };
        let jid: String = row.get("jid");
        let mut d = store.inner.lock().map_err(|_| "store lock".to_string())?;
        d.tc_tokens.insert(jid, entry);
        imported += 1;
    }
    for row in read_rows(&mut conn, "SELECT chat_jid, message_id, payload, created_at FROM sent_messages").await?
    {
        let chat_jid: String = row.get("chat_jid");
        let message_id: String = row.get("message_id");
        let payload: Vec<u8> = row.get("payload");
        let created_at: i64 = row.get("created_at");
        let mut d = store.inner.lock().map_err(|_| "store lock".to_string())?;
        d.sent_messages.entry(chat_jid).or_default().insert(
            message_id,
            SentMessageEntry { payload, created_at },
        );
        imported += 1;
    }
    for row in read_rows(&mut conn, "SELECT chat, sender, id, message, inserted_at FROM pending_inbound_messages",).await?
    {
        let entry = PendingInboundEntry {
            message: row.get("message"),
            inserted_at: row.get::<i64, _>("inserted_at"),
        };
        let key = unkey(
            row.get::<String, _>("chat").as_str(),
            row.get::<String, _>("sender").as_str(),
            row.get::<String, _>("id").as_str(),
        );
        let mut d = store.inner.lock().map_err(|_| "store lock".to_string())?;
        d.pending_inbound.insert(key, entry);
        imported += 1;
    }
    for row in read_rows(&mut conn, "SELECT chat, sender, msg_id, secret, created_at, expires_at, message_ts FROM msg_secrets",).await?
    {
        let secret: Vec<u8> = row.get("secret");
        let Ok(secret_arr): std::result::Result<[u8; 32], _> = secret.try_into() else { continue };
        let entry = MsgSecretEntry {
            chat: std::sync::Arc::from(row.get::<String, _>("chat").as_str()),
            sender: std::sync::Arc::from(row.get::<String, _>("sender").as_str()),
            msg_id: std::sync::Arc::from(row.get::<String, _>("msg_id").as_str()),
            secret: secret_arr,
            expires_at: row.get::<i64, _>("expires_at"),
            message_ts: row.get::<i64, _>("message_ts"),
        };
        let mut d = store.inner.lock().map_err(|_| "store lock".to_string())?;
        d.msg_secrets
            .insert(unkey(&entry.chat, &entry.sender, &entry.msg_id), entry);
        imported += 1;
    }

    Ok(imported)
}

/* --------- minimal protobuf reader for the two wire blobs ---------- */
//
// wire.proto shapes (whatsapp-rust-sqlite-storage 0.7.0):
//   AppStateSyncKeyWire { bytes key_data = 1; bytes fingerprint = 2; int64 timestamp = 3; }
//   HashStateWire { uint64 version = 1; bytes hash = 2;
//                   map<string, bytes> index_value_map = 3; bool mac_mismatch_fatal = 4; }

struct PbReader<'a> {
    buf: &'a [u8],
    pos: usize,
}

impl<'a> PbReader<'a> {
    fn new(buf: &'a [u8]) -> Self {
        Self { buf, pos: 0 }
    }

    fn varint(&mut self) -> Option<u64> {
        let mut result = 0u64;
        let mut shift = 0;
        while shift < 64 {
            let b = *self.buf.get(self.pos)?;
            self.pos += 1;
            result |= ((b & 0x7f) as u64) << shift;
            if b & 0x80 == 0 {
                return Some(result);
            }
            shift += 7;
        }
        None
    }

    fn bytes(&mut self) -> Option<&'a [u8]> {
        let len = self.varint()? as usize;
        let end = self.pos.checked_add(len)?;
        if end > self.buf.len() {
            return None;
        }
        let out = &self.buf[self.pos..end];
        self.pos = end;
        Some(out)
    }

    /// Advance through every field, invoking `f(tag, wire_type, payload)`.
    fn each_field(
        buf: &'a [u8],
        mut f: impl FnMut(u64, u64, FieldData<'a>),
    ) {
        let mut r = PbReader::new(buf);
        while r.pos < r.buf.len() {
            let tag = match r.varint() {
                Some(t) => t,
                None => return,
            };
            let field = tag >> 3;
            let wire = tag & 0x7;
            match wire {
                0 => {
                    let v = match r.varint() {
                        Some(v) => v,
                        None => return,
                    };
                    f(field, wire, FieldData::Varint(v));
                }
                1 => {
                    // 64-bit
                    let end = match r.pos.checked_add(8) {
                        Some(e) if e <= r.buf.len() => e,
                        _ => return,
                    };
                    f(field, wire, FieldData::Fixed(&r.buf[r.pos..end]));
                    r.pos = end;
                }
                2 => {
                    let b = match r.bytes() {
                        Some(b) => b,
                        None => return,
                    };
                    f(field, wire, FieldData::Len(b));
                }
                5 => {
                    let end = match r.pos.checked_add(4) {
                        Some(e) if e <= r.buf.len() => e,
                        _ => return,
                    };
                    f(field, wire, FieldData::Fixed(&r.buf[r.pos..end]));
                    r.pos = end;
                }
                _ => return, // groups (3/4) are not used by these messages
            }
        }
    }
}

enum FieldData<'a> {
    Varint(u64),
    /// 32/64-bit fixed fields are skipped by the two wire messages we decode;
    /// the payload is carried for completeness of the reader.
    #[allow(dead_code)]
    Fixed(&'a [u8]),
    Len(&'a [u8]),
}

fn pb_decode_app_state_sync_key(bytes: &[u8]) -> Option<AppStateSyncKey> {
    let mut key = AppStateSyncKey::default();
    PbReader::each_field(bytes, |field, wire, data| match (field, wire, data) {
        (1, 2, FieldData::Len(b)) => key.key_data = b.to_vec(),
        (2, 2, FieldData::Len(b)) => key.fingerprint = b.to_vec(),
        (3, 0, FieldData::Varint(v)) => key.timestamp = v as i64,
        _ => {}
    });
    // The reference rejects non-32-byte master keys as corrupt/legacy.
    if key.key_data.len() != 32 {
        return None;
    }
    Some(key)
}

fn pb_decode_hash_state(bytes: &[u8]) -> Option<HashState> {
    let mut version = 0u64;
    let mut hash: Option<[u8; 128]> = None;
    let mut index_value_map: std::collections::HashMap<String, Vec<u8>> =
        std::collections::HashMap::new();
    let mut mac_mismatch_fatal = false;
    PbReader::each_field(bytes, |field, wire, data| match (field, wire, data) {
        (1, 0, FieldData::Varint(v)) => version = v,
        (2, 2, FieldData::Len(b)) => {
            if let Ok(arr) = <[u8; 128]>::try_from(b) {
                hash = Some(arr);
            }
        }
        (3, 2, FieldData::Len(entry)) => {
            // map entry: 1 = key (string), 2 = value (bytes)
            let mut k: Option<String> = None;
            let mut v: Option<Vec<u8>> = None;
            PbReader::each_field(entry, |ef, ew, ed| match (ef, ew, ed) {
                (1, 2, FieldData::Len(b)) => k = Some(String::from_utf8_lossy(b).into_owned()),
                (2, 2, FieldData::Len(b)) => v = Some(b.to_vec()),
                _ => {}
            });
            if let (Some(k), Some(v)) = (k, v) {
                index_value_map.insert(k, v);
            }
        }
        (4, 0, FieldData::Varint(v)) => mac_mismatch_fatal = v != 0,
        _ => {}
    });
    Some(HashState {
        version,
        hash: hash?,
        index_value_map,
        mac_mismatch_fatal,
    })
}
