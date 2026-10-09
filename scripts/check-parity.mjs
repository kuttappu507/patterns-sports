#!/usr/bin/env node
// ============================================================
// PS-AMS backend parity check (zero dependencies).
//
// The app ships two interchangeable backends:
//   1. Web    — Next.js API routes over Prisma (prisma/schema.prisma)
//   2. Tauri  — raw SQLite (src-tauri/resources/schema.sql + tauri-api.ts)
//
// `src/lib/psams/api.ts` switches between them at runtime, so drift in any
// of these three layers silently breaks one mode. This script fails when:
//   a) a Prisma model/table/column/type/nullability/unique differs from
//      the SQLite DDL, or
//   b) api.ts delegates to a `native.*` function that tauri-api.ts does
//      not export (or a public api.ts endpoint lacks a Tauri counterpart).
//
// Run: npm run check:parity
// ============================================================

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const errors = []

// ---------------- 1. Schema parity ----------------

const prismaSrc = readFileSync(join(root, "prisma/schema.prisma"), "utf8")
const sqlSrc = readFileSync(join(root, "src-tauri/resources/schema.sql"), "utf8")

/** Prisma scalar type → expected SQLite column type. */
const TYPE_MAP = {
  String: "TEXT",
  DateTime: "TEXT",
  Float: "REAL",
  Int: "INTEGER",
  Boolean: "BOOLEAN",
  Json: "TEXT",
  Decimal: "REAL",
  Bytes: "BLOB",
}

// -- parse prisma models --
const modelNames = new Set([...prismaSrc.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]))
const models = new Map()
for (const m of prismaSrc.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
  const [, name, body] = m
  const columns = new Map() // name -> { type, optional, unique, primary }
  for (const raw of body.split("\n")) {
    const line = raw.trim()
    if (!line || line.startsWith("//") || line.startsWith("@@")) continue
    // `name Type? ...` — the `?` (if any) sits directly after the type token.
    const fm = line.match(/^(\w+)\s+([A-Z]\w*)(\[\])?(\?)?/)
    if (!fm) continue
    const [, fieldName, fieldType, isArray, optionalMark] = fm
    if (isArray) continue // relation back-arrays have no column
    if (modelNames.has(fieldType)) continue // relation object — FK scalar has its own line
    if (!TYPE_MAP[fieldType]) {
      errors.push(`prisma: model ${name}.${fieldName} has unknown type "${fieldType}" (add it to TYPE_MAP)`)
      continue
    }
    columns.set(fieldName, {
      type: TYPE_MAP[fieldType],
      optional: Boolean(optionalMark),
      unique: /@unique\b/.test(line),
      primary: /@id\b/.test(line),
    })
  }
  models.set(name, columns)
}

// -- parse SQLite DDL --
const tables = new Map()
for (const m of sqlSrc.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)\s*\(([\s\S]*?)\n\);/g)) {
  const [, name, body] = m
  const columns = new Map()
  for (const raw of body.split("\n")) {
    const line = raw.split("--")[0].trim()
    if (!line) continue
    const cm = line.match(/^(\w+)\s+(TEXT|INTEGER|REAL|NUMERIC|BLOB|BOOLEAN|DOUBLE|FLOAT|VARCHAR\w*)(.*)$/i)
    if (!cm) continue // table-level constraints e.g. UNIQUE (a, b)
    const [, colName, colType, rest] = cm
    columns.set(colName, {
      type: colType.toUpperCase().replace(/\(\d+\)$/, ""),
      notNull: /\bNOT NULL\b/i.test(rest),
      unique: /\bUNIQUE\b/i.test(rest),
      primary: /\bPRIMARY KEY\b/i.test(rest),
    })
  }
  tables.set(name, columns)
}

// -- diff models ↔ tables --
for (const [model, cols] of models) {
  const table = tables.get(model)
  if (!table) {
    errors.push(`schema: model ${model} has no CREATE TABLE in schema.sql`)
    continue
  }
  for (const [col, meta] of cols) {
    const tcol = table.get(col)
    if (!tcol) {
      errors.push(`schema: ${model}.${col} missing from schema.sql table ${model}`)
      continue
    }
    if (tcol.type !== meta.type) {
      errors.push(`schema: ${model}.${col} type mismatch — prisma ${meta.type} vs sqlite ${tcol.type}`)
    }
    // Nullability: required prisma field must be NOT NULL (PRIMARY KEY implies NOT NULL);
    // optional prisma field must not be NOT NULL.
    const required = !meta.optional
    if (required && !tcol.notNull && !tcol.primary) {
      errors.push(`schema: ${model}.${col} is required in prisma but nullable in schema.sql`)
    }
    if (!required && tcol.notNull && !tcol.primary) {
      errors.push(`schema: ${model}.${col} is optional in prisma but NOT NULL in schema.sql`)
    }
    if (meta.unique && !tcol.unique) {
      errors.push(`schema: ${model}.${col} is @unique in prisma but has no UNIQUE in schema.sql`)
    }
    if (meta.primary && !tcol.primary) {
      errors.push(`schema: ${model}.${col} is @id in prisma but not PRIMARY KEY in schema.sql`)
    }
  }
  for (const col of table.keys()) {
    if (!cols.has(col)) {
      errors.push(`schema: table ${model}.${col} exists in schema.sql but not in prisma model ${model}`)
    }
  }
}
for (const table of tables.keys()) {
  if (!models.has(table)) {
    errors.push(`schema: table ${table} exists in schema.sql but has no prisma model`)
  }
}

// ---------------- 2. API surface parity ----------------

const apiSrc = readFileSync(join(root, "src/lib/psams/api.ts"), "utf8")
const tauriSrc = readFileSync(join(root, "src/lib/psams/tauri-api.ts"), "utf8")

const tauriExports = new Set(
  [...tauriSrc.matchAll(/^export\s+(?:async\s+)?(?:function|const)\s+(\w+)/gm)].map((m) => m[1])
)
const nativeCalls = new Set([...apiSrc.matchAll(/\bnative\.(\w+)/g)].map((m) => m[1]))
// api.ts functions that are platform plumbing rather than a backend endpoint
const PLATFORM_ONLY = new Set(["isTauri", "mediaUrl"])
const apiExports = new Set(
  [...apiSrc.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)].map((m) => m[1])
)

for (const fn of nativeCalls) {
  if (!tauriExports.has(fn)) {
    errors.push(`api: api.ts calls native.${fn} but src/lib/psams/tauri-api.ts does not export it`)
  }
}
for (const fn of apiExports) {
  if (PLATFORM_ONLY.has(fn)) continue
  if (!tauriExports.has(fn)) {
    errors.push(`api: public api.${fn}() has no counterpart in tauri-api.ts (Tauri mode would break)`)
  }
}

// ---------------- report ----------------

if (errors.length > 0) {
  console.error(`✖ backend parity check failed with ${errors.length} problem(s):\n`)
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}

const columnCount = [...models.values()].reduce((n, cols) => n + cols.size, 0)
console.log(
  `✓ backend parity OK — ${models.size} models ↔ ${tables.size} tables (${columnCount} columns), ` +
    `${nativeCalls.size} native delegations ↔ ${tauriExports.size} tauri exports`
)
