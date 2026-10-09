// ============================================================
// PS-AMS :: Prisma CLI config — engine-free operation.
// Wires the CLI's schema engine to the libsql driver adapter so
// `prisma generate` / `prisma db push` run without downloading
// the Rust engine binaries (WASM engine + adapter instead).
// ============================================================

import "dotenv/config" // config-file mode disables .env auto-loading — do it here
import { defineConfig } from "prisma/config"
import { PrismaLibSQL } from "@prisma/adapter-libsql"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

export default defineConfig({
  earlyAccess: true,
  schema: "prisma/schema.prisma",
  migrate: {
    async adapter(env: Record<string, string | undefined>) {
      const raw = env.DATABASE_URL ?? "file:../db/custom.db"
      return new PrismaLibSQL({ url: toLibsqlUrl(raw) })
    },
  },
})

/** Resolve Prisma-style `file:` URLs (relative to prisma/) for libsql. */
function toLibsqlUrl(raw: string): string {
  if (!raw.startsWith("file:")) return raw
  const p = raw.slice("file:".length)
  if (p.startsWith("../")) {
    // Prisma resolves relative URLs against the schema directory (prisma/)
    return pathToFileURL(resolve(process.cwd(), "prisma", p)).href
  }
  if (p.startsWith(".")) {
    return pathToFileURL(resolve(process.cwd(), p)).href
  }
  return raw
}
