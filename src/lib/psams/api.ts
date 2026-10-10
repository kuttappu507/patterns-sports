// ============================================================
// PS-AMS :: Typed client-side API access layer (dual-mode)
//  - Web/preview: talks to the Next.js API routes (/api/...)
//  - Desktop (Tauri): delegates to the offline SQLite backend in
//    tauri-api.ts (plugin-sql / plugin-fs) — signatures stay equal.
// ============================================================

import { convertFileSrc } from "@tauri-apps/api/core"
import { isSafeMediaPath } from "./domain"
import type {
  Achievement,
  AttendanceRecord,
  CommitteeMember,
  DashboardStats,
  FeePaymentWithStudent,
  Student,
  StudentWithRelations,
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

async function ensureOk(res: Response): Promise<Response> {
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
  return res
}

async function json<T>(res: Response): Promise<T> {
  return (await ensureOk(res)).json() as Promise<T>
}

/**
 * Web-mode fetch wrapper: routes every /api call through one place so the
 * optional API token (see README “Security”) is attached automatically.
 * No-op when PSAMS auth is not configured.
 */
async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)
  const token = process.env.NEXT_PUBLIC_PSAMS_API_TOKEN
  if (token) headers.set("x-psams-token", token)
  return fetch(path, { ...init, headers })
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
  const res = await apiFetch(`/api/students${qs(filters as Record<string, string | number>)}`)
  return json(res)
}

export async function fetchStudent(id: string): Promise<StudentWithRelations> {
  if (isTauri()) return native.fetchStudent(id)
  return json(await apiFetch(`/api/students/${id}`))
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
    await apiFetch(`/api/students`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  )
}

export async function updateStudent(id: string, input: Partial<StudentInput>): Promise<Student> {
  if (isTauri()) return native.updateStudent(id, input)
  return json(
    await apiFetch(`/api/students/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  )
}

export async function deleteStudent(id: string): Promise<void> {
  if (isTauri()) return native.deleteStudent(id)
  await ensureOk(await apiFetch(`/api/students/${id}`, { method: "DELETE" }))
}

// ---------- Achievements ----------

export async function fetchAchievements(studentId: string): Promise<Achievement[]> {
  if (isTauri()) return native.fetchAchievements(studentId)
  return json(await apiFetch(`/api/students/${studentId}/achievements`))
}

export async function createAchievement(
  studentId: string,
  input: Partial<Achievement> & { tournamentName: string }
): Promise<Achievement> {
  if (isTauri()) return native.createAchievement(studentId, input)
  return json(
    await apiFetch(`/api/students/${studentId}/achievements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  )
}

export async function deleteAchievement(id: string): Promise<void> {
  if (isTauri()) return native.deleteAchievement(id)
  await ensureOk(await apiFetch(`/api/achievements/${id}`, { method: "DELETE" }))
}

// ---------- Fees ----------

export async function fetchFeeStatuses(): Promise<StudentFeeStatus[]> {
  if (isTauri()) return native.fetchFeeStatuses()
  return json(await apiFetch(`/api/fees/statuses`))
}

export async function collectPayment(input: {
  studentId: string
  months: string[]
  amount: number
  paymentMode: string
  paymentDate?: string
  notes?: string
  collectedBy?: string
}): Promise<FeePaymentWithStudent> {
  if (isTauri()) return native.collectPayment(input)
  return json(
    await apiFetch(`/api/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  )
}

export async function fetchPayments(params: { studentId?: string; month?: string; limit?: number } = {}): Promise<
  FeePaymentWithStudent[]
> {
  if (isTauri()) return native.fetchPayments(params)
  return json(await apiFetch(`/api/payments${qs(params as Record<string, string | number>)}`))
}

export async function fetchDefaulters(): Promise<StudentFeeStatus[]> {
  if (isTauri()) return native.fetchDefaulters()
  return json(await apiFetch(`/api/fees/defaulters`))
}

// ---------- Dashboard ----------

export async function fetchDashboard(): Promise<DashboardStats> {
  if (isTauri()) return native.fetchDashboard()
  return json(await apiFetch(`/api/dashboard`))
}

// ---------- Committee ----------

export async function fetchCommittee(): Promise<CommitteeMember[]> {
  if (isTauri()) return native.fetchCommittee()
  return json(await apiFetch(`/api/committee`))
}

export async function saveCommitteeMember(
  input: Partial<CommitteeMember> & { fullName: string; role: string; phone: string }
): Promise<CommitteeMember> {
  if (isTauri()) return native.saveCommitteeMember(input)
  return json(
    await apiFetch(input.id ? `/api/committee/${input.id}` : `/api/committee`, {
      method: input.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  )
}

export async function deleteCommitteeMember(id: string): Promise<void> {
  if (isTauri()) return native.deleteCommitteeMember(id)
  await ensureOk(await apiFetch(`/api/committee/${id}`, { method: "DELETE" }))
}

export async function reorderCommittee(ids: string[]): Promise<void> {
  if (isTauri()) return native.reorderCommittee(ids)
  await ensureOk(
    await apiFetch(`/api/committee/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    })
  )
}

// ---------- Attendance ----------

export async function fetchAttendance(date: string, batch?: string): Promise<AttendanceRecord[]> {
  if (isTauri()) return native.fetchAttendance(date, batch)
  return json(await apiFetch(`/api/attendance${qs({ date, batch })}`))
}

export async function markAttendance(
  records: { studentId: string; date: string; batch: string; status: string }[]
): Promise<void> {
  if (isTauri()) return native.markAttendance(records)
  await ensureOk(
    await apiFetch(`/api/attendance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records }),
    })
  )
}

// ---------- Settings / Backup ----------

export async function fetchSettings(): Promise<AcademySettings> {
  if (isTauri()) return native.fetchSettings()
  return json(await apiFetch(`/api/settings`))
}

export async function saveSettings(settings: AcademySettings): Promise<AcademySettings> {
  if (isTauri()) return native.saveSettings(settings)
  return json(
    await apiFetch(`/api/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    })
  )
}

export interface BackupSnapshot {
  blob: Blob
  /** Absolute path when the file was written on disk — null when nothing was saved. */
  savedPath: string | null
}

/** JSON snapshot (label it as a snapshot — the DATABASE backup is backup_now on desktop). */
export async function exportBackup(): Promise<BackupSnapshot> {
  if (isTauri()) return native.exportBackup()
  const res = await apiFetch(`/api/backup`)
  return { blob: await (await ensureOk(res)).blob(), savedPath: null }
}

// ---------- Data location ----------

export interface DataLocationInfo {
  mode: "desktop" | "web"
  appData: string
  database: string
  media: string
  backup: string
  backupTarget: string
  logFile: string
}

/**
 * Where the data actually lives. Desktop asks the Rust `data_paths` command;
 * web reports the SQLite file behind DATABASE_URL (bootstrap resolves it).
 */
export async function dataInfo(): Promise<DataLocationInfo> {
  if (isTauri()) return native.dataInfo()
  const info = await json<{ database: string }>(await apiFetch(`/api/data-info`))
  return {
    mode: "web",
    appData: "",
    database: info.database,
    media: "",
    backup: "",
    backupTarget: "",
    logFile: "",
  }
}

// ---------- Demo data ----------

export interface DemoStatus {
  loaded: boolean
  students: number
  committee: number
}

export async function demoStatus(): Promise<DemoStatus> {
  if (isTauri()) return native.demoStatus()
  return json(await apiFetch(`/api/demo`))
}

export async function loadDemoData(): Promise<{ students: number; committee: number }> {
  if (isTauri()) return native.loadDemoData()
  return json(await apiFetch(`/api/demo`, { method: "POST" }))
}

export async function removeDemoData(): Promise<void> {
  if (isTauri()) return native.removeDemoData()
  await ensureOk(await apiFetch(`/api/demo`, { method: "DELETE" }))
}

// ---------- Media upload ----------

export type UploadFolder = "photos" | "documents" | "certificates"

export async function uploadMedia(file: File, folder: UploadFolder): Promise<{ path: string }> {
  if (isTauri()) return native.uploadMedia(file, folder)
  const fd = new FormData()
  fd.append("file", file)
  fd.append("folder", folder)
  return json(await apiFetch(`/api/upload`, { method: "POST", body: fd }))
}

export function mediaUrl(path?: string | null): string {
  if (!path) return ""
  // Same traversal guard as the web /api/media route: a tampered photoPath in
  // the database must never resolve to a file outside the media folders.
  if (!isSafeMediaPath(path)) return ""
  if (isTauri()) {
    const base = native.getMediaBase()
    if (!base) return ""
    return convertFileSrc(`${base}/${path}`)
  }
  const token = process.env.NEXT_PUBLIC_PSAMS_API_TOKEN
  const tokenQs = token ? `&token=${encodeURIComponent(token)}` : ""
  return `/api/media?path=${encodeURIComponent(path)}${tokenQs}`
}
