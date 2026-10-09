// ============================================================
// PS-AMS :: regression test for the desktop ensureSchema() parser.
// Simulates OLD vs NEW statement extraction against the real
// src-tauri/resources/schema.sql and asserts the fix keeps every
// CREATE TABLE / CREATE INDEX / PRAGMA runnable.
// Run: bun scripts/verify-schema-parse.ts
// ============================================================
import { readFileSync } from "node:fs"

const sql = readFileSync(new URL("../src-tauri/resources/schema.sql", import.meta.url), "utf8")

// ---- OLD (buggy) logic — what shipped in v1.3.0 ----
const oldStatements = sql
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && !s.startsWith("--"))

// ---- NEW (fixed) logic — mirrors tauri-api.ts ensureSchema ----
const cleaned = sql
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n")
const newStatements = cleaned
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0)

// NOTE: no /g flag — RegExp.test is stateful with /g (lastIndex advances
// across calls) and would silently undercount.
const count = (arr: string[], re: RegExp) => arr.filter((s) => re.test(s)).length

const tables = count(newStatements, /CREATE TABLE IF NOT EXISTS/)
const oldTables = count(oldStatements, /CREATE TABLE IF NOT EXISTS/)
const indexes = count(newStatements, /CREATE INDEX IF NOT EXISTS/)
const pragmas = count(newStatements, /PRAGMA/)

const expectedTables = (sql.match(/CREATE TABLE IF NOT EXISTS/g) ?? []).length
const expectedIndexes = (sql.match(/CREATE INDEX IF NOT EXISTS/g) ?? []).length

console.log(`OLD logic → CREATE TABLE kept: ${oldTables} / ${expectedTables}`)
console.log(`OLD logic → CREATE INDEX kept: ${count(oldStatements, /CREATE INDEX/g)} / ${expectedIndexes}`)
console.log(`NEW logic → statements: ${newStatements.length}, tables: ${tables}, indexes: ${indexes}, pragmas: ${pragmas}`)

let failed = false
if (oldTables !== 0) {
  console.error("⚠ test premise broken — expected OLD logic to drop ALL tables")
  failed = true
}
if (tables !== expectedTables) {
  console.error(`✗ NEW logic lost tables: ${tables}/${expectedTables}`)
  failed = true
}
if (indexes !== expectedIndexes) {
  console.error(`✗ NEW logic lost indexes: ${indexes}/${expectedIndexes}`)
  failed = true
}
if (pragmas < 2) {
  console.error(`✗ NEW logic lost PRAGMA statements: ${pragmas}`)
  failed = true
}
// every surviving statement must not start with a comment
if (newStatements.some((s) => s.startsWith("--"))) {
  console.error("✗ NEW logic still emits comment-only statements")
  failed = true
}
// no statement may contain a leftover comment-only line inside
if (newStatements.some((s) => s.split("\n").some((l) => l.trim().startsWith("--")))) {
  console.error("✗ NEW logic leaves comment lines inside statements (inline trailing comments are fine, banner lines are not)")
  failed = true
}

if (failed) process.exit(1)
console.log(`✓ schema parser OK — all ${tables} tables + ${indexes} indexes + ${pragmas} pragmas survive`)
