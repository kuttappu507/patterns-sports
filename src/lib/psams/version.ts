/**
 * PS-AMS app version — single source of truth for the UI (splash card,
 * shell footer, Updates card). Keep in sync with package.json /
 * src-tauri/tauri.conf.json / src-tauri/Cargo.toml; the in-app updater
 * compares this against the latest GitHub release tag.
 */
export const APP_VERSION = "1.6.3"
