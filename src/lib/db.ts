import 'dotenv/config' // ensure DATABASE_URL is loaded even outside Next.js (seed scripts etc.)
import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'
import path from 'node:path'

// ============================================================
// PS-AMS :: Prisma client over the libsql driver adapter.
//
// Queries run through @libsql/client (local SQLite file) via
// Prisma's WASM query compiler — no Rust query-engine binary is
// needed at runtime, which keeps the app fully self-contained.
// `engineType = "client"` in prisma/schema.prisma enables this.
// ============================================================

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/** Resolve Prisma-style `file:` URLs (relative to prisma/) for libsql. */
function resolveSqliteUrl(raw: string): string {
  if (!raw.startsWith('file:')) return raw
  const p = raw.slice('file:'.length)
  if (p.startsWith('../')) {
    // Prisma convention: relative to the schema file location (prisma/)
    return 'file:' + path.resolve(process.cwd(), 'prisma', p)
  }
  if (p.startsWith('.')) {
    return 'file:' + path.resolve(process.cwd(), p)
  }
  return raw
}

function createDb(): PrismaClient {
  const url = resolveSqliteUrl(process.env.DATABASE_URL ?? 'file:../db/custom.db')
  const adapter = new PrismaLibSQL({ url })
  return new PrismaClient({
    adapter,
    // Query logging only in development — keep production/standalone output clean.
    log: process.env.NODE_ENV === 'development' ? ['query'] : [],
  })
}

export const db =
  globalForPrisma.prisma ??
  createDb()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
