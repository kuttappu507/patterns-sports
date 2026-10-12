// Standalone type-check harness for the PS-AMS in-process WhatsApp engine.
// #[path]-includes the REAL src-tauri module files so `cargo check` validates
// them without needing the GTK/Tauri system libraries.

#[path = "../../../src-tauri/src/wa_json_store.rs"]
pub mod wa_json_store;

#[path = "../../../src-tauri/src/wa_engine.rs"]
pub mod wa_engine;
