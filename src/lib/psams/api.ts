// ============================================================
// PS-AMS :: Typed client-side API access layer (dual-mode)
//  - Web/preview: talks to the Next.js API routes (/api/...)
//  - Desktop (Tauri): delegates to the offline SQLite backend in
//    tauri-api.ts (plugin-sql / plugin-fs) — signatures stay equal.
// ============================================================

import { convertFileSrc } from "@tauri-apps/api/core"
import type {
  Achievement,
  AttendanceRecord,
  CommitteeMember,
  DashboardStats,
  FeePayment,
  Student,
  StudentFeeStatus,
  AcademySettings,
} from "./types"
import * as native from "./tauri-api"

/** True when running inside the Tauri desktop shell. */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

/** Boot the offline backend (DB + media dirs). No-op in web mode. */
export function initBackend(): Promise<void> {
  return isTauri() ? native.initBackend() : Promise.resolve()
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const body = await res.json()
      if (body?.error) message = body.error
    } catch {
      /* ignore */
    }
    throw new Error(message)
  }
  return res.json() as Promise<T>
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ""
}

// ---------- Students ----------

export interface StudentFilters {
  q?: string
  category?: string
  status?: string
  school?: string
  position?: string
  batch?: string
  minAge?: number
  maxAge?: number
  minHeight?: number
}

export async function fetchStudents(filters: StudentFilters = {}): Promise<Student[]> {
  if (isTauri()) return native.fetchStudents(filters)
  const res = await fetch(`/api/students${qs(filters as Record<string, string | number>)}`)
  return json(res)
}

export async function fetchStudent(id: string): Promise<Student> {
  if (isTauri()) return native.fetchStudent(id)
  return json(await fetch(`/api/students/${id}`))
}

export type StudentInput = Partial<Omit<Student, "id" | "createdAt" | "updatedAt">> & {
  fullName: string
  dateOfBirth: string
  parentName: string
  mobile: string
  ageCategory: string
}

export async function createStudent(input: Partial<StudentInput>): Promise<Student> {
  if (isTauri()) return native.createStudent(input)
  return json(
    await fetch(`/api/students`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  )
}

export async function updateStudent(id: string, input: Partial<StudentInput>): Promise<Student> {
  if (isTauri()) return native.updateStudent(id, input)
  return json(
    await fetch(`/api/students/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  )
}

export async function deleteStudent(id: string): Promise<void> {
  if (isTauri()) return native.deleteStudent(id)
  await fetch(`/api/students/${id}`, { method: "DELETE" })
}

// ---------- Achievements ----------

export async function fetchAchievements(studentId: string): Promise<Achievement[]> {
  if (isTauri()) return native.fetchAchievements(studentId)
  return json(await fetch(`/api/students/${studentId}/achievements`))
}

export async function createAchievement(
  studentId: string,
  input: Partial<Achievement> & { tournamentName: string }
): Promise<Achievement> {
  if (isTauri()) return native.createAchievement(studentId, input)
  return json(
    await fetch(`/api/students/${studentId}/achievements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  )
}

export async function deleteAchievement(id: string): Promise<void> {
  if (isTauri()) return native.deleteAchievement(id)
  await fetch(`/api/achievements/${id}`, { method: "DELETE" })
}

// ---------- Fees ----------

export async function fetchFeeStatuses(): Promise<StudentFeeStatus[]> {
  if (isTauri()) return native.fetchFeeStatuses()
  return json(await fetch(`/api/fees/statuses`))
}

export async function collectPayment(input: {
  studentId: string
  months: string[]
  amount: number
  paymentMode: string
  paymentDate?: string
  notes?: string
  collectedBy?: string
}): Promise<FeePayment> {
  if (isTauri()) return native.collectPayment(input)
  return json(
    await fetch(`/api/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  )
}

export async function fetchPayments(params: { studentId?: string; month?: string; limit?: number } = {}): Promise<
  (FeePayment & { studentName: string; admissionNo: string })[]
> {
  if (isTauri()) return native.fetchPayments(params)
  return json(await fetch(`/api/payments${qs(params as Record<string, string | number>)}`))
}

export async function fetchDefaulters(): Promise<StudentFeeStatus[]> {
  if (isTauri()) return native.fetchDefaulters()
  return json(await fetch(`/api/fees/defaulters`))
}

// ---------- Dashboard ----------

export async function fetchDashboard(): Promise<DashboardStats> {
  if (isTauri()) return native.fetchDashboard()
  return json(await fetch(`/api/dashboard`))
}

// ---------- Committee ----------

export async function fetchCommittee(): Promise<CommitteeMember[]> {
  if (isTauri()) return native.fetchCommittee()
  return json(await fetch(`/api/committee`))
}

export async function saveCommitteeMember(
  input: Partial<CommitteeMember> & { fullName: string; role: string; phone: string }
): Promise<CommitteeMember> {
  if (isTauri()) return native.saveCommitteeMember(input)
  return json(
    await fetch(input.id ? `/api/committee/${input.id}` : `/api/committee`, {
      method: input.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  )
}

export async function deleteCommitteeMember(id: string): Promise<void> {
  if (isTauri()) return native.deleteCommitteeMember(id)
  await fetch(`/api/committee/${id}`, { method: "DELETE" })
}

export async function reorderCommittee(ids: string[]): Promise<void> {
  if (isTauri()) return native.reorderCommittee(ids)
  await fetch(`/api/committee/reorder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  })
}

// ---------- Attendance ----------

export async function fetchAttendance(date: string, batch?: string): Promise<AttendanceRecord[]> {
  if (isTauri()) return native.fetchAttendance(date, batch)
  return json(await fetch(`/api/attendance${qs({ date, batch })}`))
}

export async function markAttendance(
  records: { studentId: string; date: string; batch: string; status: string }[]
): Promise<void> {
  if (isTauri()) return native.markAttendance(records)
  await fetch(`/api/attendance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ records }),
  })
}

// ---------- Settings / Backup ----------

export async function fetchSettings(): Promise<AcademySettings> {
  if (isTauri()) return native.fetchSettings()
  return json(await fetch(`/api/settings`))
}

export async function saveSettings(settings: AcademySettings): Promise<AcademySettings> {
  if (isTauri()) return native.saveSettings(settings)
  return json(
    await fetch(`/api/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    })
  )
}

export async function exportBackup(): Promise<Blob> {
  if (isTauri()) return native.exportBackup()
  return fetch(`/api/backup`).then((r) => r.blob())
}

// ---------- Media upload ----------

export type UploadFolder = "photos" | "documents" | "certificates"

export async function uploadMedia(file: File, folder: UploadFolder): Promise<{ path: string }> {
  if (isTauri()) return native.uploadMedia(file, folder)
  const fd = new FormData()
  fd.append("file", file)
  fd.append("folder", folder)
  return json(await fetch(`/api/upload`, { method: "POST", body: fd }))
}

export function mediaUrl(path?: string | null): string {
  if (!path) return ""
  if (isTauri()) {
    const base = native.getMediaBase()
    if (!base) return ""
    return convertFileSrc(`${base}/${path}`)
  }
  return `/api/media?path=${encodeURIComponent(path)}`
}
