// ============================================================
// PS-AMS :: Wire serializers for the web (Prisma) API routes.
//
// Prisma rows carry Date objects; the shared wire types in ./types.ts
// use ISO strings — which is exactly what the Tauri/SQLite backend
// returns natively. NextResponse.json would stringify Dates anyway;
// converting explicitly keeps the route return types honest and the
// two backends byte-compatible on the wire.
// ============================================================

import type { FeePayment, Student } from "./types"

type WireDate = string | Date

/** A Prisma Student row: wire Student, but with Date timestamps. */
export type StudentRow = Omit<Student, "registrationDate" | "dateOfBirth" | "createdAt" | "updatedAt"> & {
  registrationDate: WireDate
  dateOfBirth: WireDate
  createdAt: WireDate
  updatedAt: WireDate
}

/** A Prisma FeePayment row: wire FeePayment, but with Date timestamps. */
export type FeePaymentRow = Omit<FeePayment, "paymentDate" | "createdAt"> & {
  paymentDate: WireDate
  createdAt: WireDate
}

const iso = (d: WireDate): string => (d instanceof Date ? d.toISOString() : d)

export function toWireStudent(s: StudentRow): Student {
  return {
    ...s,
    registrationDate: iso(s.registrationDate),
    dateOfBirth: iso(s.dateOfBirth),
    createdAt: iso(s.createdAt),
    updatedAt: iso(s.updatedAt),
  }
}

export function toWirePayment(p: FeePaymentRow): FeePayment {
  return {
    ...p,
    paymentDate: iso(p.paymentDate),
    createdAt: iso(p.createdAt),
  }
}
