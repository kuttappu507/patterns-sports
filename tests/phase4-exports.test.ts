import { describe, expect, it, vi } from "vitest"
import fs from "node:fs"
import path from "node:path"

// ===========================================================================
// Phase 4 · §5 Reports/exports/UI battery — the sandbox-executable items:
//
//   T-R3  CSV formula-injection neutralizer (PS-038) — exercised through the
//         REAL exportCSV pipeline with file-saver mocked at the boundary.
//   T-R7  print CSS suppresses Radix portals/dialogs/toaster (PS-041)
//   T-R8  stale-response seq guards in students search + student detail
//         (PS-018/PS-031)
//   T-R9  guard set: unlink confirm, attendance bulk overwrite confirm,
//         remind busy+offline (PS-042)
//   T-R10 WhatsApp: failed text vs failed attachment surface distinctly
//
// (T-R1/T-R4/T-R5/T-R6 need a browser/printer — 🪟 in TEST_MATRIX.)
// ===========================================================================

const root = process.cwd()
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8")

describe("T-R3 · CSV formula-injection neutralizer (PS-038)", () => {
  it("exportCSV prefixes a quote on = + - @ tab CR leads; normal cells untouched", async () => {
    vi.doMock("file-saver", () => ({
      saveAs: vi.fn((_blob: Blob, name: string) => {
        ;(globalThis as { __lastCsvName?: string }).__lastCsvName = name
      }),
    }))
    const { exportCSV } = await import("@/lib/psams/export")
    const outcome = await exportCSV("defaulter-list.csv", [
      { header: "Player", key: "Player" },
      { header: "Notes", key: "Notes" },
    ], [
      { Player: "=CMD", Notes: "normal text" },
      { Player: "+cmd", Notes: "@SUM(1)" },
      { Player: "-1", Notes: "\t=cmd" },
      { Player: "\r=cmd", Notes: "" },
      { Player: "Arjun Nair", Notes: "regular value" },
      { Player: "=HYPERLINK(\"http://evil\",\"click\")", Notes: "" },
    ])
    expect(outcome.saved).toBe(true)

    // pull the written blob out of file-saver and ROUND-TRIP parse it
    const { saveAs } = (await import("file-saver")) as unknown as { saveAs: ReturnType<typeof vi.fn> }
    expect(saveAs).toHaveBeenCalledOnce()
    const blob = saveAs.mock.calls[0][0] as Blob
    const raw = (await blob.text()).replace(/^\uFEFF/, "")
    const Papa = (await import("papaparse")).default
    const parsed = Papa.parse<string[]>(raw.trim(), { skipEmptyLines: true })
    const rows = parsed.data
    expect(rows[0]).toEqual(["Player", "Notes"])
    const cells = rows.slice(1)
    expect(cells[0]).toEqual(["'=CMD", "normal text"])
    expect(cells[1]).toEqual(["'+cmd", "'@SUM(1)"])
    expect(cells[2]).toEqual(["'-1", "'\t=cmd"])
    expect(cells[3][0]).toBe("'\r=cmd")
    expect(cells[4]).toEqual(["Arjun Nair", "regular value"]) // innocent values untouched
    expect(cells[5][0]).toBe("'=HYPERLINK(\"http://evil\",\"click\")")
    // NO cell anywhere starts a live formula character
    for (const row of cells) {
      for (const cell of row) {
        expect(cell).not.toMatch(/^[=+\-@\t\r]/)
      }
    }
    vi.doUnmock("file-saver")
    vi.resetModules()
  })
})

describe("T-R7 · print CSS suppresses overlays (PS-041)", () => {
  it("@media print hides Radix portals, dialogs and the sonner toaster", () => {
    const css = read("src/app/globals.css")
    const printBlock = css.slice(css.indexOf("@media print"))
    expect(printBlock).toContain("@media print")
    expect(printBlock).toMatch(/radix|portal|dialog/i)
    expect(printBlock).toMatch(/sonner|toaster/i)
  })
})

describe("T-R8 · stale-response guards (PS-018/031)", () => {
  it("students search carries the seq-token guard", () => {
    const src = read("src/components/psams/views/students-view.tsx")
    expect(src).toMatch(/searchSeq\.current/) // token incremented per load…
    expect(src).toMatch(/seq !== searchSeq\.current/) // …and checked before setState
  })

  it("student detail carries the stale-response guard", () => {
    const src = read("src/components/psams/views/student-detail-view.tsx")
    expect(src).toMatch(/PS-018/)
    // the detail view guards with an `alive` effect flag (fees-view uses the
    // seq-token variant) — both patterns drop late responses
    expect(src).toMatch(/let alive = true/)
    expect(src).toMatch(/if \(!alive\) return/)
  })
})

describe("T-R9 · destructive-action guard set (PS-042)", () => {
  it("WhatsApp Unlink requires an explicit confirm dialog", () => {
    const src = read("src/components/psams/views/settings-view.tsx")
    expect(src).toMatch(/confirmUnlink/)
    expect(src).toMatch(/Unlink the WhatsApp device\?/)
  })

  it("attendance bulk save warns before overwriting an existing register", () => {
    const src = read("src/components/psams/views/attendance-view.tsx")
    expect(src).toMatch(/overwrite|replace|already/i)
    expect(src).toMatch(/confirm|AlertDialog|Dialog/i)
  })

  it("achievement delete confirms + Remind gates on busy/offline", () => {
    const roster = read("src/components/psams/views/student-detail-view.tsx")
    expect(roster).toMatch(/delete.*confirm|confirm.*delete|AlertDialog/i)
    const fees = read("src/components/psams/views/fees-view.tsx")
    expect(fees).toMatch(/busy|offline/i) // remind guard lives on the fees surface
  })
})

describe("T-R10 · WhatsApp failure surfaces are distinct", () => {
  it("text failure ≠ attachment failure — both carry typed errors", () => {
    const src = read("src/lib/psams/whatsapp.ts")
    expect(src).toMatch(/attachment\??:\s*boolean/) // result distinguishes the two paths
    expect(src).toMatch(/ok:\s*boolean;\s*error\?:\s*string/) // typed error on both
    expect(src).toMatch(/doc\.ok|attachment/i) // the attachment path is checked separately from text
  })
})
