// Behavioural tests for the JSON-file WhatsApp session store.
// These run against the REAL src-tauri module files (#[path]-included).

use std::collections::HashMap;
use std::sync::Arc;
use wa_engine_check::wa_json_store::JsonFileStore;
use wacore::appstate::hash::HashState;
use wacore::appstate::processor::AppStateMutationMAC;
use wacore::store::traits::{
    AppSyncStore, AppStateSyncKey, DeviceListRecord, DeviceStore, LidPnMappingEntry,
    MsgSecretEntry, MsgSecretStore, ProtocolStore, SignalStore, TcTokenEntry,
};

fn tmpdir(name: &str) -> std::path::PathBuf {
    let _ = env_logger::builder().is_test(true).try_init();
    let dir = std::env::temp_dir().join(format!("psams-wa-store-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

#[tokio::test]
async fn roundtrip_persists_every_store_across_reload() {
    let dir = tmpdir("roundtrip");
    let path = dir.clone();

    {
        let store = JsonFileStore::open(&path).await.unwrap();

        // DeviceStore
        assert!(!store.exists().await.unwrap());
        let device = wacore::store::Device::new();
        assert_eq!(store.create().await.unwrap(), 1);
        assert!(store.exists().await.unwrap());
        assert!(store.load().await.unwrap().is_none());
        store.save(&device).await.unwrap();
        assert_eq!(
            store.load().await.unwrap().unwrap().registration_id,
            device.registration_id
        );

        // SignalStore
        store.put_identity("9194@s.whatsapp.net", [7u8; 32]).await.unwrap();
        store
            .put_identity("9194:33@s.whatsapp.net", [9u8; 32])
            .await
            .unwrap();
        store.put_session("9194@s.whatsapp.net", b"session-blob").await.unwrap();
        store.store_prekey(5, b"pk5", false).await.unwrap();
        store.store_prekey(9, b"pk9", false).await.unwrap();
        store.mark_prekeys_uploaded(&[9]).await.unwrap();
        store.store_signed_prekey(3, b"spk3").await.unwrap();
        store.put_sender_key("group@g.us", b"sk").await.unwrap();

        // AppSyncStore
        store
            .set_sync_key(&[1, 2, 3], AppStateSyncKey {
                key_data: vec![7u8; 32],
                fingerprint: vec![9, 8, 7],
                timestamp: 1_700_000_123,
            })
            .await
            .unwrap();
        store
            .set_version(
                "critical_block",
                HashState {
                    version: 42,
                    hash: [3u8; 128],
                    index_value_map: HashMap::new(),
                    mac_mismatch_fatal: true,
                },
            )
            .await
            .unwrap();
        store
            .put_mutation_macs(
                "critical_block",
                7,
                &[AppStateMutationMAC {
                    index_mac: [1u8; 32].to_vec(),
                    value_mac: vec![4, 5, 6],
                }],
            )
            .await
            .unwrap();

        // ProtocolStore
        store
            .set_sender_key_status("group@g.us", &[("9194:33@s.whatsapp.net", true)])
            .await
            .unwrap();
        store
            .put_lid_mapping(&LidPnMappingEntry {
                lid: "1001".into(),
                phone_number: "919400000001".into(),
                created_at: 10,
                learning_source: "usync".into(),
                updated_at: 20,
            })
            .await
            .unwrap();
        store.save_base_key("addr", "mid", b"bk").await.unwrap();
        store
            .update_device_list(DeviceListRecord {
                user: "919400000001".into(),
                devices: vec![wacore::store::traits::DeviceInfo::new(0, Some(3))],
                timestamp: 99,
                phash: Some("p".into()),
                raw_id: Some(11),
            })
            .await
            .unwrap();
        store
            .put_tc_token(
                "1001@lid",
                &TcTokenEntry { token: vec![1, 2], token_timestamp: 5, sender_timestamp: Some(6) },
            )
            .await
            .unwrap();
        store.store_sent_message("chat@s.whatsapp.net", "m1", b"payload").await.unwrap();
        store
            .store_pending_inbound("chat", "sender", "id1", b"msg")
            .await
            .unwrap();

        // MsgSecretStore
        store
            .put_msg_secrets(vec![MsgSecretEntry {
                chat: Arc::from("chat@s.whatsapp.net"),
                sender: Arc::from("chat@s.whatsapp.net"),
                msg_id: Arc::from("m1"),
                secret: [3u8; 32],
                expires_at: 0,
                message_ts: 555,
            }])
            .await
            .unwrap();

        store.flush_now().unwrap();
        store.shutdown();
        // give the flusher task a beat to observe the stop flag
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }

    // Reopen — EVERYTHING must still be there.
    let store = JsonFileStore::open(&path).await.unwrap();
    assert!(store.exists().await.unwrap());
    assert!(store.load().await.unwrap().is_some());
    assert_eq!(store.load_identity("9194@s.whatsapp.net").await.unwrap(), Some([7u8; 32]));
    assert!(store.has_session("9194@s.whatsapp.net").await.unwrap());
    assert_eq!(
        store.get_session("9194@s.whatsapp.net").await.unwrap().unwrap().as_ref(),
        b"session-blob"
    );
    assert_eq!(store.get_max_prekey_id().await.unwrap(), 9);
    assert_eq!(store.load_prekey(5).await.unwrap().unwrap().as_ref(), b"pk5");
    assert_eq!(store.load_signed_prekey(3).await.unwrap().unwrap(), b"spk3");
    assert_eq!(store.get_sender_key("group@g.us").await.unwrap().unwrap(), b"sk");

    let key = store.get_sync_key(&[1, 2, 3]).await.unwrap().unwrap();
    assert_eq!(key.key_data.len(), 32);
    assert_eq!(key.timestamp, 1_700_000_123);
    let v = store.get_version("critical_block").await.unwrap();
    assert_eq!(v.version, 42);
    assert!(v.mac_mismatch_fatal);
    assert_eq!(store.get_latest_sync_key_id().await.unwrap(), Some(vec![1, 2, 3]));
    let macs = store.get_mutation_macs("critical_block", &[[1u8; 32]]).await.unwrap();
    assert_eq!(macs.get(&[1u8; 32]).unwrap(), &vec![4u8, 5, 6]);

    assert_eq!(
        store.get_sender_key_devices("group@g.us").await.unwrap(),
        vec![("9194:33@s.whatsapp.net".to_string(), true)]
    );
    let pn = store.get_pn_mapping("919400000001").await.unwrap().unwrap();
    assert_eq!(pn.lid, "1001");
    assert!(store.has_same_base_key("addr", "mid", b"bk").await.unwrap());
    let dl = store.get_devices("919400000001").await.unwrap().unwrap();
    assert_eq!(dl.raw_id, Some(11));
    assert!(store.get_tc_token("1001@lid").await.unwrap().is_some());
    assert_eq!(
        store.take_sent_message("chat@s.whatsapp.net", "m1").await.unwrap().unwrap(),
        b"payload"
    );
    // take is atomic — a second take is empty
    assert!(store.take_sent_message("chat@s.whatsapp.net", "m1").await.unwrap().is_none());
    assert_eq!(
        store.get_pending_inbound("chat", "sender", "id1").await.unwrap().unwrap(),
        b"msg"
    );
    let secret = store.get_msg_secret_with_ts("chat@s.whatsapp.net", "chat@s.whatsapp.net", "m1")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(secret.0, vec![3u8; 32]);
    assert_eq!(secret.1, 555);

    store.shutdown();
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn prekey_upload_semantics_and_expiry_paths() {
    let dir = tmpdir("semantics");
    let store = JsonFileStore::open(&dir).await.unwrap();

    // UPDATE-only: marking an unknown id must not resurrect it.
    store.store_prekey(1, b"a", false).await.unwrap();
    store.mark_prekeys_uploaded(&[1, 999]).await.unwrap();
    let stored = store.load_prekey(1).await.unwrap().unwrap();
    assert_eq!(stored.as_ref(), b"a"); // record unchanged
    assert!(store.load_prekey(999).await.unwrap().is_none());

    // tc-token expiry: drop only when BOTH buckets are gone
    store.put_tc_token("a@x", &TcTokenEntry {
        token: vec![1], token_timestamp: 100, sender_timestamp: Some(100),
    }).await.unwrap();
    store.put_tc_token("b@x", &TcTokenEntry {
        token: vec![], token_timestamp: 0, sender_timestamp: Some(500),
    }).await.unwrap();
    store.put_tc_token("c@x", &TcTokenEntry {
        token: vec![1], token_timestamp: 10, sender_timestamp: None,
    }).await.unwrap();
    let removed = store.delete_expired_tc_tokens(50, 200).await.unwrap();
    assert_eq!(removed, 1, "only c@x (both buckets expired) is dropped");
    assert!(store.get_tc_token("a@x").await.unwrap().is_some());
    assert!(store.get_tc_token("b@x").await.unwrap().is_some());
    assert!(store.get_tc_token("c@x").await.unwrap().is_none());

    // sent-message expiry
    store.store_sent_message("c", "old", b"1").await.unwrap();
    store.store_sent_message("c", "new", b"2").await.unwrap();
    tokio::time::sleep(std::time::Duration::from_millis(2100)).await;
    store.store_sent_message("c", "newest", b"3").await.unwrap();
    let removed = store
        .delete_expired_sent_messages(std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() as i64
            - 1)
        .await
        .unwrap();
    assert!(removed >= 1);
    assert!(store.take_sent_message("c", "old").await.unwrap().is_none());
    assert!(store.take_sent_message("c", "newest").await.unwrap().is_some());

    // msg-secret merge: a redelivery never shortens the window
    store.put_msg_secrets(vec![MsgSecretEntry {
        chat: Arc::from("c"), sender: Arc::from("s"), msg_id: Arc::from("m"),
        secret: [1u8; 32], expires_at: 100, message_ts: 10,
    }]).await.unwrap();
    store.put_msg_secrets(vec![MsgSecretEntry {
        chat: Arc::from("c"), sender: Arc::from("s"), msg_id: Arc::from("m"),
        secret: [2u8; 32], expires_at: 50, message_ts: 20,
    }]).await.unwrap();
    let entry = store.get_msg_secret_with_ts("c", "s", "m").await.unwrap().unwrap();
    assert_eq!(entry.0, vec![2u8; 32]); // newest secret bytes win
    assert_eq!(entry.1, 20); // later non-zero parent ts wins
    let removed = store.delete_expired_msg_secrets(60).await.unwrap();
    assert_eq!(removed, 0, "expires_at merged to 100 — not deletable at cutoff 60");
    let removed = store.delete_expired_msg_secrets(100).await.unwrap();
    assert_eq!(removed, 1);

    store.shutdown();
    let _ = std::fs::remove_dir_all(&dir);
}

// ---------- legacy sidecar database import ----------

/// Minimal protobuf encoder for the two wire blobs (field-tagged proto3).
fn pb_varint(mut v: u64, out: &mut Vec<u8>) {
    loop {
        let b = (v & 0x7f) as u8;
        v >>= 7;
        if v == 0 {
            out.push(b);
            break;
        }
        out.push(b | 0x80);
    }
}
fn pb_len_field(field: u64, data: &[u8], out: &mut Vec<u8>) {
    pb_varint((field << 3) | 2, out);
    pb_varint(data.len() as u64, out);
    out.extend_from_slice(data);
}
fn pb_varint_field(field: u64, v: u64, out: &mut Vec<u8>) {
    pb_varint((field << 3) | 0, out);
    pb_varint(v, out);
}

fn encode_app_state_sync_key(key: &AppStateSyncKey) -> Vec<u8> {
    let mut out = Vec::new();
    pb_len_field(1, &key.key_data, &mut out);
    pb_len_field(2, &key.fingerprint, &mut out);
    pb_varint_field(3, key.timestamp as u64, &mut out);
    out
}
fn encode_hash_state(s: &HashState) -> Vec<u8> {
    let mut out = Vec::new();
    pb_varint_field(1, s.version, &mut out);
    pb_len_field(2, &s.hash, &mut out);
    for (k, v) in &s.index_value_map {
        let mut entry = Vec::new();
        pb_len_field(1, k.as_bytes(), &mut entry);
        pb_len_field(2, v, &mut entry);
        pb_len_field(3, &entry, &mut out);
    }
    pb_varint_field(4, u64::from(s.mac_mismatch_fatal), &mut out);
    out
}

/// Build a wa-store.db with the sidecar's exact Diesel schema and paired
/// device row, then prove JsonFileStore::open imports and preserves it.
#[tokio::test]
async fn legacy_sqlite_session_is_imported_and_renamed() {
    use sqlx::Connection;

    let dir = tmpdir("import");
    let db = dir.join("wa-store.db");
    let mut conn = sqlx::sqlite::SqliteConnection::connect(&format!("sqlite:{}?mode=rwc", db.display()))
        .await
        .unwrap();

    let ddl = [
        "CREATE TABLE device (id INTEGER PRIMARY KEY, lid TEXT, pn TEXT, registration_id INTEGER, \
         noise_key BLOB, identity_key BLOB, signed_pre_key BLOB, signed_pre_key_id INTEGER, \
         signed_pre_key_signature BLOB, adv_secret_key BLOB, account BLOB, push_name TEXT, \
         app_version_primary INTEGER, app_version_secondary INTEGER, app_version_tertiary BIGINT, \
         app_version_last_fetched_ms BIGINT, edge_routing_info BLOB, props_hash TEXT, \
         next_pre_key_id INTEGER, nct_salt BLOB, server_has_prekeys BOOL, server_cert_chain BLOB, \
         login_counter INTEGER, first_unupload_pre_key_id INTEGER, lid_migrated BOOL, \
         last_signed_pre_key_rotation_ms BIGINT, read_receipts_disabled BOOL)",
        "CREATE TABLE identities (address TEXT, key BLOB, device_id INTEGER)",
        "CREATE TABLE sessions (address TEXT, record BLOB, device_id INTEGER)",
        "CREATE TABLE prekeys (id INTEGER, key BLOB, uploaded BOOL, device_id INTEGER)",
        "CREATE TABLE signed_prekeys (id INTEGER, record BLOB, device_id INTEGER)",
        "CREATE TABLE sender_keys (address TEXT, record BLOB, device_id INTEGER)",
        "CREATE TABLE app_state_keys (key_id BLOB, key_data BLOB, device_id INTEGER)",
        "CREATE TABLE app_state_versions (name TEXT, state_data BLOB, device_id INTEGER)",
        "CREATE TABLE app_state_mutation_macs (name TEXT, version BIGINT, index_mac BLOB, \
         value_mac BLOB, device_id INTEGER)",
        "CREATE TABLE lid_pn_mapping (lid TEXT, phone_number TEXT, created_at BIGINT, \
         learning_source TEXT, updated_at BIGINT, device_id INTEGER)",
        "CREATE TABLE base_keys (address TEXT, message_id TEXT, base_key BLOB, device_id INTEGER, \
         created_at INTEGER)",
        "CREATE TABLE device_registry (user_id TEXT, devices_json TEXT, timestamp INTEGER, \
         phash TEXT, device_id INTEGER, updated_at INTEGER, raw_id INTEGER)",
        "CREATE TABLE group_metadata (group_jid TEXT, info BLOB, device_id INTEGER, updated_at BIGINT)",
        "CREATE TABLE sender_key_devices (group_jid TEXT, device_jid TEXT, has_key INTEGER, \
         device_id INTEGER, updated_at BIGINT)",
        "CREATE TABLE tc_tokens (jid TEXT, token BLOB, token_timestamp BIGINT, \
         sender_timestamp BIGINT, device_id INTEGER, updated_at BIGINT)",
        "CREATE TABLE sent_messages (chat_jid TEXT, message_id TEXT, payload BLOB, \
         device_id INTEGER, created_at BIGINT)",
        "CREATE TABLE pending_inbound_messages (chat TEXT, sender TEXT, id TEXT, message BLOB, \
         device_id INTEGER, inserted_at BIGINT)",
        "CREATE TABLE msg_secrets (chat TEXT, sender TEXT, msg_id TEXT, secret BLOB, \
         device_id INTEGER, created_at BIGINT, expires_at BIGINT, message_ts BIGINT)",
    ];
    for stmt in ddl {
        sqlx::query(stmt).execute(&mut conn).await.unwrap();
    }

    // A 64-byte keypair blob: 32-byte private (secp256k1 scalar) + 33-byte djb public.
    // The scalar must be VALID for PrivateKey::deserialize — use a small known scalar.
    let mut kp = Vec::new();
    kp.extend_from_slice(&hex("0000000000000000000000000000000000000000000000000000000000000001"));
    kp.extend_from_slice(&hex(&"02".repeat(32))); // raw 32-byte public (the sidecar stores it unprefixed)
    sqlx::query(
        "INSERT INTO device (id, lid, pn, registration_id, noise_key, identity_key, signed_pre_key, \
         signed_pre_key_id, signed_pre_key_signature, adv_secret_key, account, push_name, \
         app_version_primary, app_version_secondary, app_version_tertiary, \
         app_version_last_fetched_ms, next_pre_key_id, first_unupload_pre_key_id, \
         server_has_prekeys, login_counter, lid_migrated, last_signed_pre_key_rotation_ms, \
         read_receipts_disabled) VALUES (1, '', '919400000001@s.whatsapp.net', 12345, ?, ?, ?, \
         7, ?, ?, NULL, 'PS-AMS', 2, 30, 11, 1700000000000, 100, 90, 1, 3, 0, 0, 0)",
    )
    .bind(&kp).bind(&kp).bind(&kp)
    .bind(vec![0xAA; 64]).bind(vec![0xBB; 32])
    .execute(&mut conn).await.unwrap();

    sqlx::query("INSERT INTO identities (address, key, device_id) VALUES ('9194@s.whatsapp.net', ?, 1)")
        .bind(vec![7u8; 32]).execute(&mut conn).await.unwrap();
    sqlx::query("INSERT INTO sessions (address, record, device_id) VALUES ('9194@s.whatsapp.net', ?, 1)")
        .bind(b"legacy-session".to_vec()).execute(&mut conn).await.unwrap();
    sqlx::query("INSERT INTO prekeys (id, key, uploaded, device_id) VALUES (4, ?, 0, 1)")
        .bind(b"legacy-pk".to_vec()).execute(&mut conn).await.unwrap();

    let key = AppStateSyncKey {
        key_data: vec![9u8; 32],
        fingerprint: vec![1, 2, 3],
        timestamp: 1_700_000_456,
    };
    sqlx::query("INSERT INTO app_state_keys (key_id, key_data, device_id) VALUES (?, ?, 1)")
        .bind(vec![5u8; 32]).bind(encode_app_state_sync_key(&key))
        .execute(&mut conn).await.unwrap();

    let mut ivm = HashMap::new();
    ivm.insert("idx".to_string(), vec![1u8, 2]);
    let state = HashState {
        version: 33,
        hash: [5u8; 128],
        index_value_map: ivm,
        mac_mismatch_fatal: true,
    };
    sqlx::query("INSERT INTO app_state_versions (name, state_data, device_id) VALUES ('critical_block', ?, 1)")
        .bind(encode_hash_state(&state)).execute(&mut conn).await.unwrap();

    sqlx::query("INSERT INTO app_state_mutation_macs (name, version, index_mac, value_mac, device_id) \
                 VALUES ('critical_block', 33, ?, ?, 1)")
        .bind(vec![7u8; 32]).bind(vec![8u8; 32]).execute(&mut conn).await.unwrap();

    sqlx::query("INSERT INTO lid_pn_mapping (lid, phone_number, created_at, learning_source, updated_at, device_id) \
                 VALUES ('1001', '919400000001', 10, 'usync', 20, 1)")
        .execute(&mut conn).await.unwrap();
    sqlx::query("INSERT INTO sender_key_devices (group_jid, device_jid, has_key, device_id, updated_at) \
                 VALUES ('g@g.us', '9194:33@s.whatsapp.net', 1, 1, 1)")
        .execute(&mut conn).await.unwrap();
    sqlx::query("INSERT INTO msg_secrets (chat, sender, msg_id, secret, device_id, created_at, expires_at, message_ts) \
                 VALUES ('c', 's', 'm', ?, 1, 1, 0, 42)")
        .bind(vec![4u8; 32]).execute(&mut conn).await.unwrap();
    conn.close().await;

    // Opening the store on that directory imports the session.
    let store = JsonFileStore::open(&dir).await.unwrap();
    assert!(store.exists().await.unwrap(), "device row imported");
    let device = store.load().await.unwrap().expect("device imported");
    assert_eq!(device.registration_id, 12345);
    assert_eq!(device.push_name, "PS-AMS");
    assert_eq!(
        device.pn.as_ref().unwrap().to_string(),
        "919400000001@s.whatsapp.net"
    );
    assert_eq!(store.load_identity("9194@s.whatsapp.net").await.unwrap(), Some([7u8; 32]));
    assert_eq!(
        store.get_session("9194@s.whatsapp.net").await.unwrap().unwrap().as_ref(),
        b"legacy-session"
    );
    assert_eq!(store.get_max_prekey_id().await.unwrap(), 4);
    let imported_key = store.get_sync_key(&[5u8; 32]).await.unwrap().expect("sync key decoded");
    assert_eq!(imported_key.key_data, vec![9u8; 32]);
    let v = store.get_version("critical_block").await.unwrap();
    assert_eq!(v.version, 33);
    assert!(v.mac_mismatch_fatal);
    assert_eq!(v.index_value_map.get("idx").unwrap(), &vec![1u8, 2]);
    let macs = store.get_mutation_macs("critical_block", &[[7u8; 32]]).await.unwrap();
    assert_eq!(macs.get(&[7u8; 32]).unwrap(), &vec![8u8; 32]);
    assert!(store.get_pn_mapping("919400000001").await.unwrap().is_some());
    assert_eq!(
        store.get_sender_key_devices("g@g.us").await.unwrap(),
        vec![("9194:33@s.whatsapp.net".to_string(), true)]
    );
    let secret = store.get_msg_secret_with_ts("c", "s", "m").await.unwrap().unwrap();
    assert_eq!(secret.0, vec![4u8; 32]);
    assert_eq!(secret.1, 42);

    // The old database is retired (renamed), so the import runs exactly once.
    assert!(!db.exists(), "wa-store.db renamed after import");
    assert!(dir.join("wa-store.db.migrated").exists());

    store.shutdown();
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn corrupt_session_file_starts_fresh_rather_than_panicking() {
    let dir = tmpdir("corrupt");
    std::fs::write(dir.join("wa-session.json"), b"{not json").unwrap();
    let store = JsonFileStore::open(&dir).await.unwrap();
    assert!(!store.exists().await.unwrap());
    store.shutdown();
    let _ = std::fs::remove_dir_all(&dir);
}

fn hex(s: &str) -> Vec<u8> {
    (0..s.len()).step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap())
        .collect()
}
