#!/usr/bin/env node
// ===========================================================================
// PS-016 mitigation — "the gates are blind to a deleted tracked file".
//
// The hosting workspace intermittently drops tracked files between sessions
// (the upload route vanished TWICE — once caught by the Phase-1 audit, once
// it slipped into a commit; worklog.md and .secrets were dropped too). lint,
// tsc, vitest, parity, client-audit and even `next build` all passed while
// the file was gone, because nothing imports a standalone API route.
//
// This gate is not blind: every path listed by `git ls-files` MUST exist on
// disk. Wired into `npm run verify` (which CI runs) BEFORE anything else.
// ===========================================================================
import { execSync } from "node:child_process"
import { existsSync } from "node:fs"

const raw = execSync("git ls-files -z", { encoding: "buffer" })
const files = raw.toString().split("\0").filter(Boolean)

const missing = files.filter((f) => !existsSync(f))
if (missing.length > 0) {
  console.error(`\nTRACKED FILES MISSING FROM THE WORKING TREE (${missing.length}):`)
  for (const f of missing) console.error(`  - ${f}`)
  console.error("\nRestore with: git checkout HEAD -- <path>   (then re-run the gates)")
  console.error("If the file was committed missing, restore from the last good commit:")
  console.error("  git checkout <good-sha> -- <path>")
  process.exit(1)
}
console.log(`✓ tracked-files gate OK — all ${files.length} tracked files present`)
