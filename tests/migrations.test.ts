import { describe, expect, it } from "vitest"

// ===========================================================================
// MN-2 / PS-019 / PS-020 — the versioned migration runner must be:
//   - driven by PRAGMA user_version (applies each pending migration once)
//   - guarded: a legacy DB that already carries a column skips its ALTER
//   - loud: a failing statement aborts with the migration NAME
//   - identical on both backends (the same list feeds web and desktop)
// These tests run the runner against a raw libsql client — the same SQL the
// web bootstrapper executes.
// ===========================================================================

import { createClient } from "@libsql/client"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { MIGRATIONS, currentVersion, applyMigrations, type MigrationClient } from "../src/lib/psams/migrations"

function makeClient(): ReturnType<typeof createClient> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "psams-mig-test-"))
  return createClient({ url: `file:${path.join(dir, "mig-test.db")}` })
}

/** libsql client → the tiny runner interface (same shape web bootstrap uses). */
function adapt(c: ReturnType<typeof createClient>): MigrationClient {
  return {
    async execute(sql: string) {
      await c.execute(sql)
    },
    async select<T>(sql: string): Promise<T[]> {
      const r = await c.execute(sql)
      return r.rows as unknown as T[]
    },
  }
}

/** The v1-shaped Student table (pre-gender) a v1.5 install would have. */
const LEGACY_STUDENT_DDL = `
CREATE TABLE IF NOT EXISTS Student (
  id               TEXT PRIMARY KEY,
  admissionNo      TEXT NOT NULL UNIQUE,
  registrationDate TEXT NOT NULL,
  fullName         TEXT NOT NULL,
  dateOfBirth      TEXT NOT NULL,
  parentName       TEXT NOT NULL,
  mobile           TEXT NOT NULL,
  primarySport     TEXT NOT NULL DEFAULT 'Volleyball',
  ageCategory      TEXT NOT NULL,
  monthlyFee       REAL NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'Active',
  createdAt        TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt        TEXT NOT NULL DEFAULT (datetime('now'))
);
`

describe("migration runner (MN-2)", () => {
  it("exposes an ordered, uniquely-versioned list", () => {
    const versions = MIGRATIONS.map((m) => m.version)
    expect([...versions].sort((a, b) => a - b)).toEqual(versions) // ascending
    expect(new Set(versions).size).toBe(versions.length) // unique
    for (const m of MIGRATIONS) {
      expect(m.name.length, `migration ${m.version} needs a name`).toBeGreaterThan(3)
      expect(m.statements.length, `migration ${m.version} needs statements`).toBeGreaterThan(0)
    }
  })

  it("applies pending migrations and latches user_version", async () => {
    const c = makeClient()
    await c.execute(LEGACY_STUDENT_DDL)
    const client = adapt(c)
    expect(await currentVersion(client)).toBe(0)

    const applied = await applyMigrations(client, "test")
    expect(applied.length).toBe(MIGRATIONS.length)
    expect(await currentVersion(client)).toBe(MIGRATIONS[MIGRATIONS.length - 1].version)

    // the legacy table gained the gender column
    const cols = (await c.execute("PRAGMA table_info(Student)")).rows as unknown as { name: string }[]
    expect(cols.map((r) => r.name)).toContain("gender")

    // a row's data survived the ALTER
    await c.execute(
      "INSERT INTO Student (id, admissionNo, registrationDate, fullName, dateOfBirth, parentName, mobile, ageCategory) VALUES ('s1','PSA-2026-0001','2026-01-01','Legacy Kid','2012-05-01','Parent','9847012345','Junior')"
    )
    const rows = (await c.execute("SELECT gender FROM Student WHERE id = 's1'")).rows as unknown as {
      gender: string
    }[]
    expect(rows[0].gender).toBe("")
    c.close()
  })

  it("is idempotent — a second run applies nothing", async () => {
    const c = makeClient()
    await c.execute(LEGACY_STUDENT_DDL)
    const client = adapt(c)
    await applyMigrations(client, "test")
    const again = await applyMigrations(client, "test")
    expect(again).toEqual([])
    expect(await currentVersion(client)).toBe(MIGRATIONS[MIGRATIONS.length - 1].version)
    c.close()
  })

  it("skips a guarded ALTER when the column already exists", async () => {
    const c = makeClient()
    // a DB that already went through the manual v1.6 push carries gender
    await c.execute(LEGACY_STUDENT_DDL)
    await c.execute("ALTER TABLE Student ADD COLUMN gender TEXT NOT NULL DEFAULT ''")
    const client = adapt(c)
    // must NOT throw (the guarded ALTER would fail with "duplicate column")
    await applyMigrations(client, "test")
    const cols = (await c.execute("PRAGMA table_info(Student)")).rows as unknown as { name: string }[]
    expect(cols.filter((r) => r.name === "gender").length).toBe(1)
    c.close()
  })

  it("fails LOUDLY with the migration name when a statement breaks", async () => {
    const c = makeClient()
    await c.execute(LEGACY_STUDENT_DDL)
    // sabotage: block the gender migration's target by renaming its guard
    const client = adapt(c)
    // create a version ABOVE the last one so nothing is pending… instead,
    // verify the error path directly with a broken list
    const broken = [
      {
        version: 99,
        name: "test-broken-migration",
        statements: ["CREATE TABLE Definitely_Broken_Syntax_Here"],
      },
    ]
    await expect(applyMigrations(client, "test", broken)).rejects.toThrow(/test-broken-migration/)
    // and the version did NOT advance past the failure
    expect(await currentVersion(client)).toBe(0)
    c.close()
  })
})
