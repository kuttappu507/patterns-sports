// ============================================================
// PS-AMS :: versioned schema migration runner (MN-2, PS-019/020/023).
//
// CREATE TABLE IF NOT EXISTS cannot evolve an existing database, and the
// `gender` episode (a column added to the schema; old installs only got it
// through a manual push) demonstrated the failure mode this module closes:
// every release with a schema change adds ONE entry to MIGRATIONS here and
// BOTH backends apply it at boot —
//
//   web     → bootstrap.ts runs applyMigrations() after the DDL pass
//   desktop → tauri-api.ts runMigrations() feeds the same list
//
// The applied frontier is `PRAGMA user_version` (a SQLite file-level
// integer, transactional with the statements it gates). Each migration may
// carry a guard (typically "column already added by a manual push") so the
// guarded ALTER is skipped instead of failing on "duplicate column".
//
// Rules for adding a migration:
//   1. version = an increasing integer (one per release that changes schema)
//   2. statements = raw SQLite DDL, idempotent where possible
//   3. NEVER rewrite or delete an applied entry — append only
//   4. destructive changes need the migration-safety protocol in FIX_PLAN
//      (fixture DBs, before/after reconciliation, verified backup first)
// ============================================================

export interface Migration {
  /** Monotonic version — stored in PRAGMA user_version after applying. */
  version: number
  /** Human-readable name surfaced in boot logs and boot errors. */
  name: string
  /** Raw SQLite statements, applied in order. */
  statements: string[]
  /**
   * Skip switch — when true the migration is marked applied WITHOUT
   * running (e.g. the column already exists because an earlier release
   * added it through a manual push).
   */
  skipWhen?: (client: MigrationClient) => Promise<boolean> | boolean
}

/** The minimal DB surface both backends provide. */
export interface MigrationClient {
  execute(sql: string): Promise<void>
  select<T>(sql: string): Promise<T[]>
}

export async function tableColumns(client: MigrationClient, table: string): Promise<Set<string>> {
  const rows = await client.select<{ name: string }>(`PRAGMA table_info(${table})`)
  return new Set(rows.map((r) => r.name))
}

// ---- applied migrations (append only) -------------------------------

export const MIGRATIONS: Migration[] = [
  {
    // v1.6.0 — gender selection on the player profile. The column shipped
    // mid-cycle via a manual `db push` on some installs, so the ALTER is
    // guarded: installs that already have it skip straight to the version.
    version: 1,
    name: "v1.6.0: Student.gender",
    statements: ["ALTER TABLE Student ADD COLUMN gender TEXT NOT NULL DEFAULT ''"],
    skipWhen: async (client) => (await tableColumns(client, "Student")).has("gender"),
  },
]

// ---- runner ----------------------------------------------------------

/** Read the applied frontier (0 = fresh database). */
export async function currentVersion(client: MigrationClient): Promise<number> {
  const rows = await client.select<{ user_version: number }>("PRAGMA user_version")
  return Number(rows[0]?.user_version ?? 0)
}

async function setVersion(client: MigrationClient, version: number): Promise<void> {
  await client.execute(`PRAGMA user_version = ${Number(version)}`)
}

/**
 * Apply every migration newer than the stored user_version, in order.
 * Returns the names actually applied (empty = already current).
 * A failing statement aborts with the migration NAME in the error and the
 * version stays at the last successful entry (PS-023: loud, never swallowed).
 */
export async function applyMigrations(
  client: MigrationClient,
  backend: string,
  list: Migration[] = MIGRATIONS
): Promise<string[]> {
  const applied: string[] = []
  let version = await currentVersion(client)
  for (const m of list) {
    if (m.version <= version) continue
    try {
      // guard: a column that already exists (manual push, older repair)
      // marks the migration applied without touching the table.
      const skip = m.skipWhen ? await m.skipWhen(client) : false
      if (!skip) {
        for (const stmt of m.statements) {
          await client.execute(stmt)
        }
      }
      await setVersion(client, m.version)
      version = m.version
      applied.push(m.name)
      console.warn(`[PS-AMS] ${backend} migration applied: ${m.name}`)
    } catch (e) {
      throw new Error(
        `migration ${m.version} (${m.name}) failed on ${backend}: ${e instanceof Error ? e.message : e}`
      )
    }
  }
  return applied
}
