import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { ValidationError } from "./domain"

// ============================================================
// PS-AMS :: shared API error contract (PS-050).
//
// Every /api route maps failures through mapApiError() so clients
// always receive the same JSON shape with a truthful status code:
//
//   ValidationError          → 400  (our shared assertValid* guards)
//   Prisma P2002 (unique)    → 409  (duplicate admissionNo / receiptNo …)
//   Prisma P2025 (not found) → 404  (update/delete of a vanished row)
//   Prisma P2003 (FK)        → 409  (child rows block the delete)
//   anything else            → 500  with a GENERIC message — raw Prisma /
//                                   driver errors never reach the client;
//                                   the real cause is logged server-side.
// ============================================================

export function mapApiError(e: unknown, fallback: string): NextResponse {
  if (e instanceof ValidationError) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") {
      const target = Array.isArray(e.meta?.target) ? (e.meta?.target as string[]).join(", ") : undefined
      return NextResponse.json(
        {
          error: target
            ? `A record with the same ${target} already exists`
            : "A record with the same unique value already exists",
        },
        { status: 409 }
      )
    }
    if (e.code === "P2025") {
      return NextResponse.json({ error: "Record not found — it may have been deleted" }, { status: 404 })
    }
    if (e.code === "P2003") {
      return NextResponse.json(
        { error: "Related records exist — remove them first, or archive instead of deleting" },
        { status: 409 }
      )
    }
  }
  console.error("[PS-AMS] unexpected API error:", e)
  return NextResponse.json({ error: fallback }, { status: 500 })
}
