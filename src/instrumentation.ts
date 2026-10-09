// ============================================================
// PS-AMS :: Next.js instrumentation hook.
// Runs once when the web/preview server boots: guarantees the
// SQLite schema exists and seeds the demo academy the first time
// the database is empty (see src/lib/psams/bootstrap.ts).
// Skipped in the Tauri desktop build (no server there — the Rust
// shell applies the schema itself) and never throws into boot.
// ============================================================

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  if (process.env.NEXT_PHASE === "phase-production-build") return
  try {
    const { bootstrapDatabase } = await import("@/lib/psams/bootstrap")
    await bootstrapDatabase()
  } catch (e) {
    console.error("[PS-AMS] instrumentation bootstrap error:", e)
  }
}
