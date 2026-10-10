"use client"

// ============================================================
// PS-AMS :: Print pipeline — an isolated DOM layer (#psams-print-root)
// that ONLY renders during window.print(). Screen shows a compact,
// modern preview overlay (toolbar + centered paper); paper output is
// governed by @media print in globals.css.
// ============================================================

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { FileText, Loader2, Printer, X } from "lucide-react"
import { useAppStore } from "@/lib/psams/store"
import { isTauri } from "@/lib/psams/api"
import {
  desktopDirectPrint,
  desktopSavePdf,
  paperForKind,
  paperLabel,
  setReceiptPaper,
  type PrintPaper,
} from "@/lib/psams/print-desktop"
import type { AcademySettings, Achievement, FeePayment, PrintPayload, Student } from "@/lib/psams/types"
import { computeAge, ageDetailed, computeBMI, formatDate, formatINR, monthLabel, parsePaidMonths, categoryBracket, ACADEMY_MAPS_URL } from "@/lib/psams/domain"
import { mediaUrl } from "@/lib/psams/api"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"

const KIND_LABEL: Record<string, string> = {
  "profile-a4": "A4 portrait · 210 × 297 mm",
  "receipt-a5": "A5 receipt · 148 × 210 mm",
  "receipt-thermal": "Thermal POS roll · 80 mm",
  defaulters: "A4 roster",
  report: "A4 roster",
  "attendance-sheet": "A4 session sheet",
}

/** CSS named-page binding per document kind — selects the right paper size. */
const PAGE_CLASS: Record<string, string> = {
  "profile-a4": "print-page-a4",
  "receipt-a5": "print-page-a5",
  "receipt-thermal": "print-page-thermal",
  defaulters: "print-page-a4",
  report: "print-page-a4",
  "attendance-sheet": "print-page-a4",
}

/** Render the paper document for a payload (used by both the print layer and the preview).
 *  Non-preview output is wrapped in the kind's named-page class so the OS print
 *  pipeline picks the right paper size. `paperOverride` swaps the named page
 *  (e.g. A6 receipt preset) so the CSS page box agrees with the native print
 *  settings. */
function PaperFor({ payload, preview, paperOverride }: { payload: PrintPayload; preview?: boolean; paperOverride?: string }) {
  let paper: React.ReactNode
  switch (payload.kind) {
    case "profile-a4":
      paper = <ProfileA4 data={payload.data as ProfileData} preview={preview} />
      break
    case "receipt-a5":
      paper = <ReceiptA5 data={payload.data as ReceiptData} preview={preview} />
      break
    case "receipt-thermal":
      paper = <ReceiptThermal data={payload.data as ReceiptData} preview={preview} />
      break
    case "defaulters":
    case "report":
      paper = <RosterPrint payload={payload} preview={preview} />
      break
    case "attendance-sheet":
      paper = <AttendancePrint data={payload.data as AttendanceData} preview={preview} />
      break
    default:
      paper = null
  }
  if (preview || !paper) return paper
  return <div className={paperOverride ?? PAGE_CLASS[payload.kind] ?? ""}>{paper}</div>
}

export function PrintRoot() {
  const { printPayload, setPrint } = useAppStore()
  const { toast } = useToast()
  const open = !!printPayload && printPayload.mode !== "direct" && printPayload.mode !== "pdf"
  const desktop = isTauri()

  // Paper preset is DERIVED from the payload kind on every render (receipts
  // follow the saved academy preset, A6 by default) — never stale, and the
  // print-root wrapper always agrees with the native print settings.
  const [, bump] = useState(0)
  const paper: PrintPaper = printPayload ? paperForKind(printPayload.kind) : "A4"
  const [busy, setBusy] = useState<null | "print" | "pdf">(null)

  function changeReceiptPaper(p: "A6" | "A5") {
    setReceiptPaper(p)
    bump((t) => t + 1)
  }

  /** Print — on the desktop this drives the NATIVE WebView2 print pipeline
   *  (silent, default printer, exact preset size, zero margins — no dialog).
   *  The browser preview keeps the regular window.print() flow. */
  function printNow() {
    if (!printPayload) return
    if (desktop) {
      setBusy("print")
      void (async () => {
        const res = await desktopDirectPrint(paper)
        setBusy(null)
        if (res.ok) toast({ title: "Sent to printer", description: `${res.message} — ${paperLabel(paper)}.` })
        else toast({ title: "Print failed", description: res.message, variant: "destructive" })
      })()
      return
    }
    const prev = document.title
    if (printPayload.title) document.title = printPayload.title
    try {
      window.print()
    } finally {
      document.title = prev
    }
  }

  /** Save PDF — desktop writes a TRUE single-page PDF at the preset size via
   *  the WebView2 print engine; the browser offers print-to-PDF instead. */
  function savePdfNow() {
    if (!printPayload) return
    if (desktop) {
      setBusy("pdf")
      void (async () => {
        const res = await desktopSavePdf(paper, printPayload.title || "PS-AMS-document")
        setBusy(null)
        if (res.saved && res.path) toast({ title: "PDF saved", description: `${paperLabel(paper)} document written to ${res.path}` })
        else if (res.message) toast({ title: "PDF export failed", description: res.message, variant: "destructive" })
        else toast({ title: "PDF not saved", description: "The save dialog was closed without choosing a file." })
      })()
      return
    }
    printNow()
  }

  return (
    <>
      {/* ---------- Isolated print layer (invisible on screen, only paper) ---------- */}
      <div id="psams-print-root" aria-hidden>
        {printPayload && (
          <PaperFor
            payload={printPayload}
            paperOverride={printPayload.kind === "receipt-a5" && paper === "A6" ? "print-page-a6" : undefined}
          />
        )}
      </div>

      {/* ---------- On-screen preview overlay (never prints; direct/pdf modes skip it) ---------- */}
      <AnimatePresence>
        {open && printPayload && (
          <motion.div
            key="print-preview"
            className="no-print fixed inset-0 z-[70] flex flex-col bg-slate-950/75"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
            {/* toolbar */}
            <div className="flex items-center gap-3 border-b border-white/10 bg-slate-900/95 px-4 py-2.5 text-slate-100 shadow-lg">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-500/20 text-rose-300">
                <FileText className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-[13.5px] font-semibold">{printPayload.title || "Print preview"}</div>
                <div className="text-[11px] text-slate-400">
                  {printPayload.kind === "receipt-a5" ? `Receipt · ${paperLabel(paper)}` : KIND_LABEL[printPayload.kind] ?? "Document"} · zero margins — no headers or footers on paper
                </div>
              </div>
              <div className="ml-auto flex items-center gap-2">
                {desktop && printPayload.kind === "receipt-a5" && (
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    Paper
                    <select
                      value={paper}
                      onChange={(e) => changeReceiptPaper(e.target.value as "A6" | "A5")}
                      className="h-8 rounded-md border border-white/15 bg-slate-800 px-2 text-xs text-slate-100 outline-none"
                      title="Receipt paper preset — saved for every future receipt print"
                    >
                      <option value="A6">A6 · 105×148</option>
                      <option value="A5">A5 · 148×210</option>
                    </select>
                  </label>
                )}
                <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={printNow} disabled={busy !== null} title={desktop ? "Send straight to the default printer at the preset size — no dialog, no headers or footers" : "Open the browser print dialog"}>
                  {busy === "print" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />} Print
                </Button>
                <Button size="sm" variant="outline" className="h-8 gap-1.5 border-white/20 bg-white/5 text-xs text-slate-100 hover:bg-white/10" onClick={savePdfNow} disabled={busy !== null} title={desktop ? "Save a true single-page PDF at the preset size" : "Choose 'Save as PDF' as the printer destination"}>
                  {busy === "pdf" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} Save PDF
                </Button>
                <button
                  aria-label="Close preview"
                  title="Close (Esc)"
                  onClick={() => setPrint(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* centered paper on a dark desk */}
            <div className="flex-1 overflow-auto p-6">
              <motion.div
                initial={{ opacity: 0, y: 12, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="mx-auto w-fit origin-top rounded-[3px] bg-white shadow-[0_34px_90px_-24px_rgba(0,0,0,0.85)] ring-1 ring-black/25"
              >
                <div style={printPayload.kind === "receipt-a5" && paper === "A6" ? { width: "105mm" } : undefined}>
                  <PaperFor payload={printPayload} preview />
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

/* =================== shared letterhead =================== */

function Letterhead({ settings, docTitle }: { settings?: Partial<AcademySettings> | null; docTitle: string }) {
  return (
    <div className="border-b-2 border-[#ef476f] pb-2 text-center">
      <div className="text-[22px] font-bold leading-tight text-[#073b4c]">{settings?.academyName || "Pattern Sports Academy"}</div>
      {settings?.tagline && <div className="text-[10px] italic text-neutral-600">{settings.tagline}</div>}
      <div className="mt-0.5 text-[10px] text-neutral-600">
        {[settings?.address, settings?.phone && `Ph: ${settings.phone}`, settings?.email].filter(Boolean).join("  ·  ")}
      </div>
      <div className="mt-1.5 inline-block rounded bg-[#ef476f] px-3 py-0.5 text-[12px] font-bold uppercase tracking-wide text-white">
        {docTitle}
      </div>
    </div>
  )
}

function SigLine({ name, role }: { name?: string; role: string }) {
  return (
    <div className="mt-6 flex justify-end">
      <div className="text-center">
        <div className="w-44 border-t border-neutral-500 pt-1 text-[10px] font-semibold">{name || role}</div>
        <div className="text-[9px] text-neutral-500">{role}</div>
      </div>
    </div>
  )
}

/* =================== A4 Player Profile Card =================== */

interface ProfileData {
  student: Student
  achievements: Achievement[]
  settings: AcademySettings | null
}

function ProfileA4({ data, preview }: { data: ProfileData; preview?: boolean }) {
  const { student: s, achievements, settings } = data
  const bmi = computeBMI(s.weightKg, s.heightCm)

  return (
    <div className={`print-a4-preview ${preview ? "" : "print-page"} p-[10mm] text-[12px] leading-snug text-black`} style={preview ? { zoom: 0.72 } : undefined}>
      <Letterhead settings={settings} docTitle="Player Profile Card" />

      {/* identity row */}
      <div className="mt-4 flex gap-4">
        <div className="shrink-0 text-center">
          <div className="h-[120px] w-[95px] overflow-hidden rounded-md border-2 border-neutral-300 bg-neutral-50">
            {s.photoPath ? (
               
              <img src={mediaUrl(s.photoPath)} alt={s.fullName} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-neutral-300">{s.fullName.split(" ").map((w) => w[0]).slice(0, 2).join("")}</div>
            )}
          </div>
          <div className="mt-1 font-mono text-[10px] font-bold">{s.admissionNo}</div>
        </div>
        <div className="flex-1">
          <table className="w-full border-collapse text-[11px]">
            <tbody>
              <Row label="Full Name" value={s.fullName} bold />
              <Row label="Date of Birth" value={`${formatDate(s.dateOfBirth)}  (${ageDetailed(s.dateOfBirth)})`} />
              <Row label="Age Category" value={`${s.ageCategory} — ${categoryBracket(s.ageCategory)}`} />
              <Row label="Parent / Guardian" value={s.parentName} />
              <Row label="Contact" value={`${s.mobile}${s.emergencyContact ? "  ·  Emergency: " + s.emergencyContact : ""}`} />
              <Row label="Address" value={s.address || "—"} />
              <Row label="School / Class" value={`${s.schoolName || "—"}${s.classGrade ? "  ·  Class " + s.classGrade : ""}${s.division ? " · Div " + s.division : ""}`} />
              <Row label="Blood Group" value={s.bloodGroup || "—"} />
            </tbody>
          </table>
        </div>
      </div>

      {/* athletic metrics */}
      <SectionHead>Athletic & Biometric Parameters</SectionHead>
      <div className="grid grid-cols-6 gap-2 text-center">
        <Metric label="Height" value={s.heightCm ? `${s.heightCm} cm` : "—"} />
        <Metric label="Weight" value={s.weightKg ? `${s.weightKg} kg` : "—"} />
        <Metric label="BMI" value={bmi !== null ? bmi.toFixed(1) : "—"} />
        <Metric label="Standing Reach" value={s.standingReachCm ? `${s.standingReachCm} cm` : "—"} />
        <Metric label="Spike Reach" value={s.spikeReachCm ? `${s.spikeReachCm} cm` : "—"} />
        <Metric label="Jump Reach" value={s.jumpReachCm ? `${s.jumpReachCm} cm` : "—"} />
      </div>

      <div className="mt-2 flex gap-2">
        <span className="rounded border border-neutral-300 bg-neutral-50 px-2 py-0.5 text-[10.5px]">
          Primary Sport: <b>{s.primarySport}</b>
        </span>
        <span className="rounded border border-neutral-300 bg-neutral-50 px-2 py-0.5 text-[10.5px]">
          Position: <b>{s.playingPosition || "—"}</b>
        </span>
        <span className="rounded border border-neutral-300 bg-neutral-50 px-2 py-0.5 text-[10.5px]">
          Training Batch: <b>{s.trainingBatch || "—"}</b>
        </span>
        <span className="rounded border border-neutral-300 bg-neutral-50 px-2 py-0.5 text-[10.5px]">
          Registered: <b>{formatDate(s.registrationDate)}</b>
        </span>
      </div>

      {/* achievements */}
      <SectionHead>Achievements & Career Milestones</SectionHead>
      <table className="w-full border-collapse text-[10.5px]">
        <thead>
          <tr className="bg-[#fdeef2]">
            <th className="border border-neutral-300 px-2 py-1 text-left">#</th>
            <th className="border border-neutral-300 px-2 py-1 text-left">Tournament / Milestone</th>
            <th className="border border-neutral-300 px-2 py-1 text-left">Date</th>
            <th className="border border-neutral-300 px-2 py-1 text-left">Level</th>
            <th className="border border-neutral-300 px-2 py-1 text-left">Medal</th>
          </tr>
        </thead>
        <tbody>
          {achievements.length === 0 && (
            <tr><td colSpan={5} className="border border-neutral-300 px-2 py-2 text-center text-neutral-400">No achievements recorded</td></tr>
          )}
          {achievements.map((a, i) => (
            <tr key={a.id}>
              <td className="border border-neutral-300 px-2 py-1">{i + 1}</td>
              <td className="border border-neutral-300 px-2 py-1">{a.tournamentName}{a.notes ? ` — ${a.notes}` : ""}</td>
              <td className="border border-neutral-300 px-2 py-1">{formatDate(a.eventDate)}</td>
              <td className="border border-neutral-300 px-2 py-1">{a.level}</td>
              <td className="border border-neutral-300 px-2 py-1">{a.medal}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <SigLine role={settings?.receiptSignatory || "General Secretary"} />
      <div className="mt-2 border-t border-dashed border-neutral-300 pt-1 text-center text-[8.5px] text-neutral-400">
        Generated by PS-AMS · Pattern Sports Academy Management System · {formatDate(new Date())}
        <br />
        Find us on Google Maps: {ACADEMY_MAPS_URL.replace("https://", "")}
      </div>
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <tr>
      <td className="w-[120px] border border-neutral-300 bg-neutral-50 px-2 py-[3px] align-top text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{label}</td>
      <td className={`border border-neutral-300 px-2 py-[3px] ${bold ? "text-[13px] font-bold" : ""}`}>{value}</td>
    </tr>
  )
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 mt-3 flex items-center gap-2">
      <span className="bg-[#ef476f] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-white">{children}</span>
      <div className="h-px flex-1 bg-neutral-300" />
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-neutral-300 bg-neutral-50 px-1 py-1.5">
      <div className="text-[8.5px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="text-[13px] font-bold">{value}</div>
    </div>
  )
}

/* =================== A5 Receipt =================== */

interface ReceiptData {
  receipt: FeePayment & { studentName?: string; admissionNo?: string }
  settings: AcademySettings | null
}

function ReceiptA5({ data, preview }: { data: ReceiptData; preview?: boolean }) {
  const { receipt: r, settings } = data
  const months = parsePaidMonths(r.months || "[]")
  return (
    <div className={`print-a5-preview ${preview ? "" : "print-page"} p-[9mm] text-[12px] text-black`} style={preview ? { zoom: 0.95 } : undefined}>
      <Letterhead settings={settings} docTitle="Fee Payment Receipt" />
      <div className="mt-3 flex justify-between text-[11px]">
        <div><span className="text-neutral-500">Receipt No: </span><b className="font-mono">{r.receiptNo}</b></div>
        <div><span className="text-neutral-500">Date: </span><b>{formatDate(r.paymentDate)}</b></div>
      </div>

      <table className="mt-3 w-full border-collapse text-[11px]">
        <tbody>
          <Row label="Received From" value={`${r.studentName || ""}  (${r.admissionNo || ""})`} bold />
          <Row label="Towards" value={`Academy fee${months.length > 1 ? "s" : ""} for ${months.map(monthLabel).join(", ")}`} />
          <Row label="Payment Mode" value={r.paymentMode} />
          {r.notes && <Row label="Remarks" value={r.notes} />}
        </tbody>
      </table>

      <div className="mt-3 flex items-center justify-between rounded border-2 border-neutral-800 bg-neutral-100 px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide">Total Amount Paid</span>
        <span className="text-[20px] font-bold">{formatINR(r.amount)}</span>
      </div>

      <div className="mt-2 text-[9.5px] text-neutral-500">
        Fees once paid are non-refundable. Please retain this receipt for future reference.
      </div>
      <SigLine role={settings?.receiptSignatory || "Authorized Signatory"} />
    </div>
  )
}

/* =================== 80mm POS Thermal =================== */

function ReceiptThermal({ data, preview }: { data: ReceiptData; preview?: boolean }) {
  const { receipt: r, settings } = data
  const months = parsePaidMonths(r.months || "[]")
  const dash = "--------------------------------"

  return (
    <div className={`print-thermal-preview thermal ${preview ? "" : "print-page"} px-[4mm] py-[3mm]`} style={preview ? { zoom: 1.35 } : undefined}>
      <div className="text-center">
        <div className="text-[14px] font-bold">{settings?.academyName || "Pattern Sports Academy"}</div>
        {settings?.address && <div>{settings.address}</div>}
        {settings?.phone && <div>Ph: {settings.phone}</div>}
        <div className="my-1">{dash}</div>
        <div className="font-bold">FEE RECEIPT</div>
      </div>
      <div className="my-1">{dash}</div>
      <div>Receipt : {r.receiptNo}</div>
      <div>Date    : {formatDate(r.paymentDate)}</div>
      <div>Student : {r.studentName || ""}</div>
      <div>Adm No  : {r.admissionNo || ""}</div>
      <div className="my-1">{dash}</div>
      <div className="font-bold">PERIODS PAID:</div>
      {months.map((m) => (
        <div key={m}>  - {monthLabel(m)}</div>
      ))}
      <div className="my-1">{dash}</div>
      <div>Mode    : {r.paymentMode}</div>
      <div className="text-[15px] font-bold">TOTAL   : {formatINR(r.amount)}</div>
      <div className="my-1">{dash}</div>
      <div className="text-center">
        <div>Thank you! Keep training hard.</div>
        <div>{settings?.receiptSignatory || "Authorized Signatory"}</div>
        <div className="mt-1 text-[9px]">Powered by PS-AMS</div>
      </div>
    </div>
  )
}

/* =================== Letterhead roster (defaulters / reports) =================== */

function RosterPrint({ payload, preview }: { payload: PrintPayload; preview?: boolean }) {
  const isDefaulters = payload.kind === "defaulters"
  const data = payload.data as {
    rows: (Student & { overdueMonths?: string[]; pendingMonths?: string[]; dueAmount?: number })[]
    settings: AcademySettings | null
    filters?: Record<string, string>
    totalDue?: number
  }
  const { rows, settings } = data

  return (
    <div className={`print-a4-preview ${preview ? "" : "print-page"} p-[10mm] text-[11px] text-black`} style={preview ? { zoom: 0.78 } : undefined}>
      <Letterhead settings={settings} docTitle={payload.title || "Report"} />
      <div className="mt-2 flex justify-between text-[10px] text-neutral-600">
        <span>Generated: {formatDate(new Date())}</span>
        <span>{rows.length} record{rows.length === 1 ? "" : "s"}</span>
      </div>
      <table className="mt-2 w-full border-collapse text-[10px]">
        <thead>
          <tr className="bg-[#ef476f] text-white">
            <th className="border border-neutral-400 px-1.5 py-1 text-left">#</th>
            <th className="border border-neutral-400 px-1.5 py-1 text-left">Admission</th>
            <th className="border border-neutral-400 px-1.5 py-1 text-left">Student</th>
            <th className="border border-neutral-400 px-1.5 py-1 text-left">Cat.</th>
            {isDefaulters ? (
              <>
                <th className="border border-neutral-400 px-1.5 py-1 text-left">Unpaid Months</th>
                <th className="border border-neutral-400 px-1.5 py-1 text-left">Outstanding</th>
                <th className="border border-neutral-400 px-1.5 py-1 text-left">Parent</th>
                <th className="border border-neutral-400 px-1.5 py-1 text-left">Contact</th>
              </>
            ) : (
              <>
                <th className="border border-neutral-400 px-1.5 py-1 text-left">Age</th>
                <th className="border border-neutral-400 px-1.5 py-1 text-left">Ht (cm)</th>
                <th className="border border-neutral-400 px-1.5 py-1 text-left">Wt (kg)</th>
                <th className="border border-neutral-400 px-1.5 py-1 text-left">BMI</th>
                <th className="border border-neutral-400 px-1.5 py-1 text-left">Sport / Position</th>
                <th className="border border-neutral-400 px-1.5 py-1 text-left">School</th>
                <th className="border border-neutral-400 px-1.5 py-1 text-left">Mobile</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((s, i) => (
            <tr key={s.id} className={i % 2 ? "bg-[#fdf4f2]" : ""}>
              <td className="border border-neutral-400 px-1.5 py-1">{i + 1}</td>
              <td className="border border-neutral-400 px-1.5 py-1 font-mono">{s.admissionNo}</td>
              <td className="border border-neutral-400 px-1.5 py-1 font-semibold">{s.fullName}</td>
              <td className="border border-neutral-400 px-1.5 py-1">{s.ageCategory}</td>
              {isDefaulters ? (
                <>
                  <td className="border border-neutral-400 px-1.5 py-1">{(s.overdueMonths || []).map(monthLabel).join(", ") || "—"}</td>
                  <td className="border border-neutral-400 px-1.5 py-1 font-bold">{formatINR(s.dueAmount ?? 0)}</td>
                  <td className="border border-neutral-400 px-1.5 py-1">{s.parentName}</td>
                  <td className="border border-neutral-400 px-1.5 py-1">{s.mobile}</td>
                </>
              ) : (
                <>
                  <td className="border border-neutral-400 px-1.5 py-1">{computeAge(s.dateOfBirth)}</td>
                  <td className="border border-neutral-400 px-1.5 py-1">{s.heightCm ?? "—"}</td>
                  <td className="border border-neutral-400 px-1.5 py-1">{s.weightKg ?? "—"}</td>
                  <td className="border border-neutral-400 px-1.5 py-1">{computeBMI(s.weightKg, s.heightCm)?.toFixed(1) ?? "—"}</td>
                  <td className="border border-neutral-400 px-1.5 py-1">{s.primarySport}{s.playingPosition ? " / " + s.playingPosition : ""}</td>
                  <td className="border border-neutral-400 px-1.5 py-1">{s.schoolName || "—"}</td>
                  <td className="border border-neutral-400 px-1.5 py-1">{s.mobile}</td>
                </>
              )}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={9} className="border border-neutral-400 px-2 py-3 text-center text-neutral-400">No records</td></tr>
          )}
        </tbody>
        {isDefaulters && data.totalDue ? (
          <tfoot>
            <tr>
              <td colSpan={5} className="border border-neutral-400 px-1.5 py-1 text-right font-bold">TOTAL OUTSTANDING</td>
              <td colSpan={4} className="border border-neutral-400 px-1.5 py-1 font-bold">{formatINR(data.totalDue)}</td>
            </tr>
          </tfoot>
        ) : null}
      </table>
      <SigLine role={settings?.receiptSignatory || "General Secretary"} />
    </div>
  )
}

/* =================== Attendance sheet =================== */

interface AttendanceData {
  date: string
  roster: Student[]
  records: Record<string, string>
  present: number
  absent: number
  total: number
  settings: AcademySettings | null
}

function AttendancePrint({ data, preview }: { data: AttendanceData; preview?: boolean }) {
  const { date, roster, records, present, absent, total, settings } = data
  return (
    <div className={`print-a4-preview ${preview ? "" : "print-page"} p-[10mm] text-[11px] text-black`} style={preview ? { zoom: 0.8 } : undefined}>
      <Letterhead settings={settings} docTitle="Daily Attendance Sheet" />
      <div className="mt-2 flex justify-between text-[10.5px]">
        <span><b>Session date:</b> {formatDate(date)}</span>
        <span><b>Present:</b> {present} · <b>Absent:</b> {absent} · <b>Roster:</b> {total}</span>
      </div>
      <table className="mt-2 w-full border-collapse text-[10px]">
        <thead>
          <tr className="bg-[#ef476f] text-white">
            <th className="border border-neutral-400 px-1.5 py-1 text-left">#</th>
            <th className="border border-neutral-400 px-1.5 py-1 text-left">Admission</th>
            <th className="border border-neutral-400 px-1.5 py-1 text-left">Student</th>
            <th className="border border-neutral-400 px-1.5 py-1 text-left">Category</th>
            <th className="border border-neutral-400 px-1.5 py-1 text-left">Batch</th>
            <th className="border border-neutral-400 px-1.5 py-1 text-left">Status</th>
            <th className="border border-neutral-400 px-1.5 py-1 text-left">Signature</th>
          </tr>
        </thead>
        <tbody>
          {roster.map((s, i) => (
            <tr key={s.id} className={i % 2 ? "bg-[#fdf4f2]" : ""}>
              <td className="border border-neutral-400 px-1.5 py-1">{i + 1}</td>
              <td className="border border-neutral-400 px-1.5 py-1 font-mono">{s.admissionNo}</td>
              <td className="border border-neutral-400 px-1.5 py-1">{s.fullName}</td>
              <td className="border border-neutral-400 px-1.5 py-1">{s.ageCategory}</td>
              <td className="border border-neutral-400 px-1.5 py-1">{s.trainingBatch || "—"}</td>
              <td className="border border-neutral-400 px-1.5 py-1 font-semibold">{records[s.id] || "—"}</td>
              <td className="border border-neutral-400 px-1.5 py-3" />
            </tr>
          ))}
        </tbody>
      </table>
      <SigLine role="Coach / Session In-charge" />
    </div>
  )
}
