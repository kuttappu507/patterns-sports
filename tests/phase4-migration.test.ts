import { describe, expect, it, afterAll } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { createClient, type Client } from "@libsql/client"

// ===========================================================================
// Phase 4 · §6 Migration & parity battery:
//
//   T-M1  legacy-shaped DBs (pre-gender) upgrade on boot — data preserved;
//         manual-push installs (column already present) skip cleanly;
//         a FAILING migration is loud and leaves the version untouched
//         (PS-023) — all against disposable SQLite files.
//   T-M2  parity mutation test (PS-044): removing a FK action or a UNIQUE
//         constraint from the SQLite DDL copy makes `check:parity` exit 1.
//           ⚠ the mutation temporarily edits a TRACKED file — bytes are
//           backed up and restored in finally, and the restore is asserted.
// ===========================================================================

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "psams-phase4-mig-"))
afterAll(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  } catch {
    /* temp best-effort */
  }
})

function openDb(name: string): { client: Client; file: string } {
  const file = path.join(tmpDir, name)
  return { client: createClient({ url: `file:${file}` }), file }
}

/** The minimal MigrationClient surface, over a raw libsql connection. */
function migrationAdapter(client: Client) {
  return {
    execute: async (sql: string) => {
      await client.execute(sql)
    },
    select: async <T>(sql: string): Promise<T[]> => {
      const r = await client.execute(sql)
      return r.rows as unknown as T[]
    },
  }
}

async function userVersion(client: Client): Promise<number> {
  const r = await client.execute("PRAGMA user_version")
  return Number(r.rows[0]?.user_version ?? 0)
}

describe("T-M1 · legacy database upgrade (PS-019/020/MN-2)", () => {
  it("a pre-gender v1.5 database gains Student.gender at boot, rows intact", async () => {
    const { client } = openDb("legacy.db")
    // legacy shape: the columns v1.5.x shipped — NO gender column
    await client.execute(`
      CREATE TABLE Student (
        id TEXT PRIMARY KEY,
        admissionNo TEXT NOT NULL UNIQUE,
        fullName TEXT NOT NULL,
        dateOfBirth TEXT NOT NULL,
        parentName TEXT NOT NULL,
        mobile TEXT NOT NULL,
        ageCategory TEXT NOT NULL,
        monthlyFee REAL NOT NULL DEFAULT 0,
        registrationDate TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Active',
        createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
    await client.execute({
      sql: `INSERT INTO Student (id, admissionNo, fullName, dateOfBirth, parentName, mobile, ageCategory, monthlyFee, registrationDate)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: ["stu-1", "PSA-2025-0001", "Legacy Player", "2012-05-01", "Legacy Parent", "9847000000", "Junior", 500, "2025-04-01"],
    })
    await client.execute({
      sql: `INSERT INTO Student (id, admissionNo, fullName, dateOfBirth, parentName, mobile, ageCategory, monthlyFee, registrationDate)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: ["stu-2", "PSA-2025-0002", "Second Player", "2010-08-15", "Second Parent", "9847000001", "Youth", 650, "2025-06-10"],
    })
    expect(await userVersion(client)).toBe(0)

    const { applyMigrations } = await import("@/lib/psams/migrations")
    const applied = await applyMigrations(migrationAdapter(client), "test-web")
    expect(applied).toContain("v1.6.0: Student.gender")
    expect(await userVersion(client)).toBe(1)

    const cols = await client.execute("PRAGMA table_info(Student)")
    expect(cols.rows.map((r) => String(r.name))).toContain("gender")
    // legacy rows survive with the default gender value
    const rows = await client.execute("SELECT id, fullName, gender FROM Student ORDER BY id")
    expect(rows.rows).toHaveLength(2)
    expect(String(rows.rows[0].fullName)).toBe("Legacy Player")
    expect(String(rows.rows[0].gender)).toBe("")
    // re-running is a no-op (idempotent frontier)
    const again = await applyMigrations(migrationAdapter(client), "test-web")
    expect(again).toEqual([])
  })

  it("a manual-push install (gender already present) skips the ALTER cleanly", async () => {
    const { client } = openDb("manual-push.db")
    await client.execute(`
      CREATE TABLE Student (
        id TEXT PRIMARY KEY,
        admissionNo TEXT NOT NULL UNIQUE,
        fullName TEXT NOT NULL,
        gender TEXT NOT NULL DEFAULT ''
      )
    `)
    const { applyMigrations } = await import("@/lib/psams/migrations")
    const applied = await applyMigrations(migrationAdapter(client), "test-web")
    // the guard marks it applied WITHOUT running the ALTER (no duplicate-column error)
    expect(applied).toContain("v1.6.0: Student.gender")
    expect(await userVersion(client)).toBe(1)
  })

  it("a failing migration is LOUD, names itself, and leaves the frontier untouched (PS-023)", async () => {
    const { client } = openDb("failing.db")
    const { applyMigrations } = await import("@/lib/psams/migrations")
    const doomed = [
      {
        version: 7,
        name: "v9.9.9: boom",
        statements: ["ALTER TABLE DefinitelyMissing ADD COLUMN nope TEXT"],
      },
    ]
    await expect(applyMigrations(migrationAdapter(client), "test-web", doomed)).rejects.toThrow(
      /migration 7 \(v9\.9\.9: boom\) failed/
    )
    expect(await userVersion(client)).toBe(0)
  })
})

describe("T-M2 · parity mutation test (PS-044)", () => {
  const SCHEMA = path.join(root(), "src-tauri/resources/schema.sql")
  let original: Buffer

  function root(): string {
    return process.cwd()
  }

  it("removing the FeePayment RESTRICT action makes check:parity exit 1", () => {
    original = fs.readFileSync(SCHEMA)
    try {
      // replaceAll: the string also appears in a comment above the table —
      // the parity regex only reads the CREATE TABLE body, so BOTH must go
      const mutated = original.toString("utf8").replaceAll("ON DELETE RESTRICT", "ON UPDATE CASCADE")
      expect(mutated).not.toBe(original.toString("utf8"))
      fs.writeFileSync(SCHEMA, mutated)
      const res = spawnSync("node", [path.join(root(), "scripts/check-parity.mjs")], { encoding: "utf8" })
      expect(res.status, `parity must fail on FK-action drift\n${res.stderr}`).not.toBe(0)
      expect(res.stderr).toMatch(/FeePayment|RESTRICT|foreign/i)
    } finally {
      fs.writeFileSync(SCHEMA, original)
    }
    // the tracked file is byte-identical again — no residue
    expect(fs.readFileSync(SCHEMA).equals(original)).toBe(true)
  })

  it("removing the ledger UNIQUE(studentId, month) makes check:parity exit 1", () => {
    original = fs.readFileSync(SCHEMA)
    const mutated = original.toString("utf8").replaceAll("UNIQUE (studentId, month)", "UNIQUE (studentId, paymentId)")
    expect(mutated).not.toBe(original.toString("utf8"))
    try {
      fs.writeFileSync(SCHEMA, mutated)
      const res = spawnSync("node", [path.join(root(), "scripts/check-parity.mjs")], { encoding: "utf8" })
      expect(res.status, `parity must fail on UNIQUE drift\n${res.stderr}`).not.toBe(0)
      expect(res.stderr).toMatch(/PaymentMonth|UNIQUE|unique/i)
    } finally {
      fs.writeFileSync(SCHEMA, original)
    }
    expect(fs.readFileSync(SCHEMA).equals(original)).toBe(true)
  })
})
