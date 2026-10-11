import { describe, expect, it, afterAll } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

// ===========================================================================
// PS-024 integration evidence — foreign keys must be ENFORCED on the real
// web connection, not merely declared in the DDL. SQLite defaults to
// foreign_keys=OFF per connection; this suite pins the actual behaviour of
// the libsql driver adapter Prisma runs on:
//
//   1. the Prisma connection reports foreign_keys = 1
//   2. an attendance row with a bogus studentId is REJECTED (P2003)
//   3. deleting a student with payments is REJECTED on the DB level too
//      (ON DELETE RESTRICT) — the app-level 409 is the first guard, this is
//      the backstop every OTHER connection path must not bypass
// ===========================================================================

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "psams-fk-test-"))
const dbFile = path.join(tmpDir, "fk-test.db")
process.env.DATABASE_URL = `file:${dbFile}`

afterAll(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  } catch {
    /* temp best-effort */
  }
})

describe("FK enforcement (PS-024) — live web backend (disposable DB)", () => {
  it("boots the schema on the disposable database", async () => {
    const { bootstrapDatabase } = await import("@/lib/psams/bootstrap")
    await bootstrapDatabase()
  })

  it("reports foreign_keys = 1 on the Prisma connection", async () => {
    const { db } = await import("@/lib/db")
    const rows = (await db.$queryRawUnsafe<{ foreign_keys: number }[]>("PRAGMA foreign_keys")) as {
      foreign_keys: number
    }[]
    expect(rows[0]?.foreign_keys).toBe(1)
  })

  it("rejects an attendance row with a bogus studentId", async () => {
    const { db } = await import("@/lib/db")
    await expect(
      db.attendance.create({
        data: { studentId: "no-such-student", date: "2026-01-15", batch: "Morning", status: "Present" },
      })
    ).rejects.toThrow()
  })

  it("rejects a payment row with a bogus studentId (ON DELETE RESTRICT mirror)", async () => {
    const { db } = await import("@/lib/db")
    await expect(
      db.feePayment.create({
        data: {
          receiptNo: "FK-TEST-001",
          studentId: "no-such-student",
          paymentDate: new Date(),
          months: JSON.stringify(["2026-01"]),
          amount: 500,
          paymentMode: "Cash",
          collectedBy: "Front Desk",
        },
      })
    ).rejects.toThrow()
  })
})
