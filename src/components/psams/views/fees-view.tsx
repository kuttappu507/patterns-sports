"use client"

// ============================================================
// PS-AMS :: Fee Management — POS collection popup, receipt dispatch,
// defaulters monitoring & export pipelines.
// ============================================================

import { useEffect, useMemo, useState } from "react"
import {
  Receipt,
  AlertTriangle,
  Printer,
  FileSpreadsheet,
  FileText,
  MessageCircle,
  Loader2,
  CheckCircle2,
  BadgeIndianRupee,
  Phone,
  History,
  Search,
} from "lucide-react"
import {
  fetchFeeStatuses,
  fetchPayments,
  fetchSettings,
  fetchStudents,
} from "@/lib/psams/api"
import {
  monthLabel,
  formatINR,
  formatDate,
  parsePaidMonths,
  CATEGORY_COLORS,
} from "@/lib/psams/domain"
import { AGE_CATEGORIES, GENDERS, type FeePayment, type StudentFeeStatus, type AcademySettings } from "@/lib/psams/types"
import { useAppStore } from "@/lib/psams/store"
import { exportExcel, exportPDF, buildReceiptPdfA5, receiptPdfA5 } from "@/lib/psams/export"
import { toIntlPhone, receiptWaMessage, reminderWaMessage, dispatchWa, dispatchWaReceipt } from "@/lib/psams/whatsapp"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

export function FeesView() {
  return (
    <div className="h-full p-5">
      <Tabs defaultValue="collect" className="space-y-4">
        <TabsList className="h-9 border border-border bg-card/60">
          <TabsTrigger value="collect" className="h-7 gap-1.5 text-xs"><Receipt className="h-3.5 w-3.5" /> Collect Fee</TabsTrigger>
          <TabsTrigger value="defaulters" className="h-7 gap-1.5 text-xs"><AlertTriangle className="h-3.5 w-3.5" /> Defaulters Monitor</TabsTrigger>
          <TabsTrigger value="history" className="h-7 gap-1.5 text-xs"><History className="h-3.5 w-3.5" /> Receipt History</TabsTrigger>
        </TabsList>
        <TabsContent value="collect"><CollectTab /></TabsContent>
        <TabsContent value="defaulters"><DefaultersTab /></TabsContent>
        <TabsContent value="history"><HistoryTab /></TabsContent>
      </Tabs>
    </div>
  )
}

/* ============================ COLLECT ============================ */

function CollectTab() {
  const { openCollectFee } = useAppStore()

  return (
    <div className="glass relative overflow-hidden rounded-2xl p-8">
      <div className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 rounded-full bg-primary/[0.06] blur-3xl" />
      <div className="pointer-events-none absolute -bottom-14 right-40 h-44 w-44 rounded-full bg-yellow-400/[0.09] blur-3xl" />

      <div className="relative mx-auto max-w-xl text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-[0_0_28px_-8px_rgba(239,71,111,0.55)] dark:shadow-[0_0_28px_-8px_rgba(255,107,141,0.6)]">
          <BadgeIndianRupee className="h-7 w-7" />
        </div>
        <h3 className="mt-4 font-display text-lg font-extrabold">Fee Collection Counter</h3>
        <p className="mx-auto mt-1.5 max-w-md text-[15px] leading-relaxed text-muted-foreground">
          The POS flow now opens in a focused popup — pick the player, tick the billing months to settle and the amount
          auto-fills. A printable A5 / thermal receipt is generated the moment the payment is recorded.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Button
            size="lg"
            className="btn-sheen h-11 gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-[0_14px_30px_-12px_rgba(239,71,111,0.7)] transition-all hover:brightness-110 active:scale-[0.97] dark:shadow-[0_0_22px_-4px_rgba(255,107,141,0.6)]"
            onClick={() => openCollectFee()}
          >
            <Receipt className="h-4.5 w-4.5" strokeWidth={2.4} /> Start Fee Collection
          </Button>
        </div>
        <div className="mt-6 grid grid-cols-1 gap-2 text-left sm:grid-cols-3">
          {[
            { step: "1", text: "Search & select the player" },
            { step: "2", text: "Tick months — amount auto-fills" },
            { step: "3", text: "Confirm → printable receipt" },
          ].map((s) => (
            <div key={s.step} className="rounded-xl border border-border bg-card/60 px-3 py-2.5">
              <span className="font-display text-sm font-extrabold text-primary">{s.step}</span>
              <span className="ml-2 text-[15px] text-muted-foreground">{s.text}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[15px] text-muted-foreground">
          Tip — the same popup opens straight from the <b className="text-foreground">Collect Fee</b> button in the top bar,
          or from any defaulter row in the monitor tab.
        </p>
      </div>
    </div>
  )
}

/* =================== shared filter bar (search + category + gender) =================== */

export function FeeFilterBar({
  q,
  onQ,
  category,
  onCategory,
  gender,
  onGender,
  placeholder,
}: {
  q: string
  onQ: (v: string) => void
  category: string
  onCategory: (v: string) => void
  gender: string
  onGender: (v: string) => void
  placeholder: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input className="h-8 w-56 pl-8 text-xs" placeholder={placeholder} value={q} onChange={(e) => onQ(e.target.value)} />
      </div>
      <Select value={category} onValueChange={onCategory}>
        <SelectTrigger className="h-8 w-[132px] text-xs"><SelectValue /></SelectTrigger>
        <SelectContent className="border-border bg-popover">
          <SelectItem value="all" className="text-xs">All categories</SelectItem>
          {AGE_CATEGORIES.map((c) => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={gender} onValueChange={onGender}>
        <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue /></SelectTrigger>
        <SelectContent className="border-border bg-popover">
          <SelectItem value="all" className="text-xs">All genders</SelectItem>
          {GENDERS.map((g) => <SelectItem key={g} value={g} className="text-xs">{g}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}

/** Generic matcher: student name / admission no / mobile / parent / receipt no. */
export function feeRowMatches(haystacks: (string | null | undefined)[], needle: string): boolean {
  if (!needle.trim()) return true
  const q = needle.trim().toLowerCase()
  return haystacks.some((h) => (h || "").toLowerCase().includes(q))
}

/* ==================== RECEIPT DIALOG (dual format + WhatsApp) ==================== */

export function ReceiptDialog({
  receipt,
  onClose,
  settings,
}: {
  receipt: (FeePayment & { studentName: string; admissionNo: string; studentMobile?: string }) | null
  onClose: () => void
  settings: AcademySettings | null
}) {
  const { setPrint } = useAppStore()
  const { toast } = useToast()
  const [waBusy, setWaBusy] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)

  async function savePdf() {
    if (!receipt) return
    setPdfBusy(true)
    try {
      await receiptPdfA5(receipt, settings)
      toast({ title: "A5 receipt PDF downloaded", description: `Saved as PS-AMS-Receipt-${receipt.receiptNo}.pdf — true A5 paper size (148 × 210 mm).` })
    } catch (e) {
      toast({ title: "PDF export failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" })
    } finally {
      setPdfBusy(false)
    }
  }

  async function waDispatch() {
    if (!receipt) return
    const months = parsePaidMonths(receipt.months)
    const message = receiptWaMessage(receipt, settings, months.map(monthLabel).join(", "))
    const intl = toIntlPhone(receipt.studentMobile || "")
    if (!intl) {
      toast({ title: "No mobile number on file", description: "Add a mobile number to the player profile to enable one-click WhatsApp dispatch.", variant: "destructive" })
      return
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      toast({ title: "You appear to be offline", description: "WhatsApp dispatch needs connectivity. The receipt is still saved and printable.", variant: "destructive" })
      return
    }
    setWaBusy(true)
    try {
      // The itemised message AND the true A5 PDF receipt travel together —
      // the parent receives the details in chat plus the printable document.
      let pdf: { blob: Blob; fileName: string } | null = null
      try {
        pdf = { blob: await buildReceiptPdfA5(receipt, settings), fileName: `PS-AMS-Receipt-${receipt.receiptNo}.pdf` }
      } catch {
        pdf = null // text-only dispatch is better than no dispatch
      }
      const res = await dispatchWaReceipt(intl, message, pdf)
      if (res.via === "linked") {
        if (res.ok && res.attachment) {
          toast({ title: "Receipt sent on WhatsApp", description: `Message + A5 PDF receipt delivered through the academy's linked device to +${intl} — no chat window needed.` })
        } else if (res.ok) {
          toast({ title: "Message sent — attachment failed", description: res.error ?? "The receipt PDF could not be uploaded. The itemised message was delivered.", variant: "destructive" })
        } else {
          toast({ title: "WhatsApp send failed", description: res.error ?? "Unknown error", variant: "destructive" })
        }
      } else {
        toast({ title: "Opening WhatsApp chat", description: "Tip: link the academy WhatsApp once in Settings → WhatsApp Linked Device to send receipts (with the PDF attached) directly — one click, no chat window." })
      }
    } catch (e) {
      toast({ title: "Could not send via WhatsApp", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" })
    } finally {
      setWaBusy(false)
    }
  }

  if (!receipt) return null
  const months = parsePaidMonths(receipt.months)

  return (
    <Dialog open={!!receipt} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300" /> Payment recorded — {receipt.receiptNo}
          </DialogTitle>
        </DialogHeader>
        <div className="rounded-lg border bg-muted/40 p-3 text-xs">
          <div className="flex justify-between"><span className="text-muted-foreground">Student</span><span className="font-semibold">{receipt.studentName} · {receipt.admissionNo}</span></div>
          <div className="mt-1 flex justify-between"><span className="text-muted-foreground">Period{months.length > 1 ? "s" : ""}</span><span className="font-medium">{months.map(monthLabel).join(", ")}</span></div>
          <div className="mt-1 flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-bold text-emerald-600 dark:text-emerald-300">{formatINR(receipt.amount)}</span></div>
          <div className="mt-1 flex justify-between"><span className="text-muted-foreground">Mode</span><span className="font-medium">{receipt.paymentMode}</span></div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Button
            size="sm"
            className="h-9 gap-1.5 text-xs"
            onClick={() => setPrint({ kind: "receipt-a5", title: `PS-AMS-Receipt-${receipt.receiptNo}`, data: { receipt, settings }, mode: "direct" })}
            title="Straight to the default printer — zero page margins, no headers or footers"
          >
            <Printer className="h-3.5 w-3.5" /> Print A5
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-9 gap-1.5 border-border bg-card text-xs hover:bg-muted"
            disabled={pdfBusy}
            onClick={savePdf}
            title="Downloads a true A5-size PDF (148 × 210 mm) of this receipt"
          >
            {pdfBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} Save PDF
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-9 gap-1.5 border-border bg-card text-xs hover:bg-muted"
            onClick={() => setPrint({ kind: "receipt-thermal", title: `PS-AMS-Slip-${receipt.receiptNo}`, data: { receipt, settings }, mode: "direct" })}
            title="Direct thermal print — 80 mm POS roll"
          >
            <Printer className="h-3.5 w-3.5" /> 80mm Slip
          </Button>
          <Button size="sm" disabled={waBusy} className="h-9 gap-1.5 bg-emerald-600 text-xs font-semibold text-white shadow-[0_8px_18px_-8px_rgba(16,185,129,0.7)] hover:bg-emerald-500 active:scale-[0.97]" onClick={waDispatch} title="Sends through the academy's linked WhatsApp device when connected — no chat window opens">
            {waBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />} WhatsApp
          </Button>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-[15px] text-muted-foreground">
            <b>Print A5 / 80mm Slip</b> go straight to the printer with no automatic headers or time stamps; <b>Save PDF</b> downloads a true A5-size PDF file. The <b>WhatsApp</b> button delivers the itemised message <b>together with the A5 PDF receipt</b> through the academy’s linked WhatsApp device — one click, straight to the parent’s chat.
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 shrink-0 text-[15px] text-muted-foreground hover:text-foreground"
            onClick={() => setPrint({ kind: "receipt-a5", title: `Fee Receipt ${receipt.receiptNo} (A5)`, data: { receipt, settings } })}
          >
            Preview
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ============================ DEFAULTERS ============================ */

function DefaultersTab() {
  const [rows, setRows] = useState<StudentFeeStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<AcademySettings | null>(null)
  // search + filters (junior / male / …) across the whole roster with dues
  const [q, setQ] = useState("")
  const [category, setCategory] = useState("all")
  const [gender, setGender] = useState("all")
  const { setPrint, navigate, openCollectFee, dataVersion } = useAppStore()
  const { toast } = useToast()

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const [d, s] = await Promise.all([fetchFeeStatuses(), fetchSettings()])
        if (!alive) return
        setRows(d.filter((r) => r.student.status === "Active" && r.dueAmount > 0).sort((a, b) => Number(b.isDefaulter) - Number(a.isDefaulter) || b.dueAmount - a.dueAmount))
        setSettings(s)
        setLoading(false)
      } catch (e) {
        if (alive) {
          setLoading(false)
          toast({ title: "Could not load defaulters", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" })
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [toast, dataVersion])

  // Apply the toolbar search + category + gender filters
  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (category === "all" || r.student.ageCategory === category) &&
          (gender === "all" || (r.student.gender || "") === gender) &&
          feeRowMatches([r.student.fullName, r.student.admissionNo, r.student.mobile, r.student.parentName], q),
      ),
    [rows, q, category, gender],
  )
  const filteredDue = filtered.reduce((sum, r) => sum + r.dueAmount, 0)

  // Excel/PDF generation can throw (encoding, layout edge cases) — never leave the user without feedback
  async function runExport(fn: () => Promise<unknown>) {
    try {
      await fn()
    } catch (e) {
      toast({ title: "Export failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" })
    }
  }

  const exportRows = filtered.map((r) => ({
    name: r.student.fullName,
    admission: r.student.admissionNo,
    category: r.student.ageCategory,
    gender: r.student.gender || "—",
    parent: r.student.parentName,
    phone: r.student.mobile,
    overdueMonths: r.overdueMonths.map(monthLabel).join(", ") || "—",
    pendingCount: String(r.pendingMonths.length),
    due: r.dueAmount,
  }))

  const cols = [
    { header: "Student", key: "name", width: 24 },
    { header: "Admission No", key: "admission", width: 16 },
    { header: "Category", key: "category", width: 12 },
    { header: "Gender", key: "gender", width: 10 },
    { header: "Unpaid Months (>1 mo)", key: "overdueMonths", width: 30 },
    { header: "Total Pending", key: "pendingCount", width: 12 },
    { header: "Outstanding (₹)", key: "due", width: 15 },
    { header: "Parent", key: "parent", width: 20 },
    { header: "Contact", key: "phone", width: 14 },
  ]

  function printRoster() {
    const defaulters = filtered.filter((r) => r.isDefaulter)
    setPrint({ kind: "defaulters", title: "Fee Defaulters Roster", data: { rows: defaulters, settings, totalDue: defaulters.reduce((s, r) => s + r.dueAmount, 0) } })
  }

  return (
    <div className="space-y-3">
      <div className="glass flex flex-wrap items-center gap-3 rounded-2xl p-3">
        <div>
          <div className="text-xs font-semibold">Defaulters — overdue by more than one month</div>
          <div className="text-[15px] text-muted-foreground">
            <span className="font-semibold text-rose-600 dark:text-rose-300">{filtered.filter((r) => r.isDefaulter).length}</span> defaulter(s) of {filtered.length} shown · outstanding <b>{formatINR(filteredDue)}</b>
            {(q || category !== "all" || gender !== "all") && <span className="text-foreground"> (filtered from {rows.length})</span>}
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <FeeFilterBar q={q} onQ={setQ} category={category} onCategory={setCategory} gender={gender} onGender={setGender} placeholder="Name / adm. no / mobile / parent…" />
          <Button size="sm" variant="outline" className="h-8 gap-1.5 border-border bg-card text-xs hover:bg-muted" onClick={printRoster}><Printer className="h-3.5 w-3.5" /> Print</Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 border-border bg-card text-xs hover:bg-muted" onClick={() => runExport(() => exportExcel({ sheetName: "Defaulters", fileName: "PS-AMS-defaulters", title: "Fee Defaulters Roster — overdue by more than one month", academy: settings ?? undefined, columns: cols, rows: exportRows, totalsRow: { name: "TOTAL", due: filteredDue } }))}>
            <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 border-border bg-card text-xs hover:bg-muted" onClick={() => runExport(() => exportPDF({ fileName: "PS-AMS-defaulters", title: "Fee Defaulters Roster", subtitle: "Overdue by more than one billing month", academy: settings ?? undefined, columns: cols, rows: exportRows, orientation: "l", totalsRow: { name: "TOTAL", due: filteredDue } }))}>
            <FileText className="h-3.5 w-3.5" /> PDF
          </Button>
        </div>
      </div>

      <div className="overflow-hidden glass rounded-2xl">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-border bg-muted/30 text-[15px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Student</th>
              <th className="px-3 py-2.5 font-medium">Category</th>
              <th className="px-3 py-2.5 font-medium">Unpaid months</th>
              <th className="px-3 py-2.5 font-medium">Outstanding</th>
              <th className="hidden px-3 py-2.5 font-medium md:table-cell">Parent contact</th>
              <th className="px-3 py-2.5 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="py-10 text-center"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Computing ledger…</td></tr>}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={6} className="py-10 text-center text-emerald-600 dark:text-emerald-300">{rows.length === 0 ? "Excellent — no pending dues across the academy." : "No students match the current search / filters."}</td></tr>
            )}
            {filtered.map((r) => (
              <tr key={r.student.id} className={cn("border-b border-border/40", r.isDefaulter && "bg-rose-400/[0.05]")}>
                <td className="px-4 py-2.5">
                  <button className="text-left font-medium hover:text-primary hover:underline" onClick={() => navigate("student-detail", r.student.id)}>
                    {r.student.fullName}
                  </button>
                  <div className="text-[14.5px] text-muted-foreground">{r.student.admissionNo}</div>
                </td>
                <td className="px-3 py-2.5">
                  <span className={cn("rounded-full border px-2 py-0.5 text-[14.5px] font-medium", CATEGORY_COLORS[r.student.ageCategory] || "")}>{r.student.ageCategory}</span>
                </td>
                <td className="px-3 py-2.5">
                  {r.isDefaulter ? (
                    <Badge className="rounded-full border border-rose-500/30 bg-rose-500/10 text-[14.5px] font-semibold text-rose-700 hover:bg-rose-500/20 dark:border-rose-400/25 dark:bg-rose-400/10 dark:text-rose-300">{r.overdueMonths.length} months overdue</Badge>
                  ) : (
                    <Badge variant="secondary" className="rounded-full text-[14.5px]">Current month only</Badge>
                  )}
                  <div className="mt-0.5 text-[14.5px] text-muted-foreground">{r.pendingMonths.map(monthLabel).join(", ")}</div>
                </td>
                <td className="px-3 py-2.5 font-semibold tabular-nums text-rose-600 dark:text-rose-300">{formatINR(r.dueAmount)}</td>
                <td className="hidden px-3 py-2.5 md:table-cell">
                  <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3 text-muted-foreground" />{r.student.parentName} · {r.student.mobile}</span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="outline" className="h-7 border-border bg-card text-[15px] hover:bg-muted" onClick={() => navigate("student-detail", r.student.id)}>Open</Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 border-emerald-500/30 bg-emerald-500/10 text-[15px] text-emerald-700 hover:bg-emerald-500/20 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300"
                      onClick={async () => {
                        const intl = toIntlPhone(r.student.mobile)
                        if (!intl) {
                          toast({ title: "No mobile number on file", description: `${r.student.fullName} has no mobile number in the profile.`, variant: "destructive" })
                          return
                        }
                        const pending = r.overdueMonths.length > 0 ? r.overdueMonths : r.pendingMonths
                        try {
                          const res = await dispatchWa(r.student.mobile, reminderWaMessage({ studentName: r.student.fullName, academyName: settings?.academyName, periodsLabel: pending.map(monthLabel).join(", "), dueAmount: r.dueAmount }))
                          if (res.via === "linked") {
                            if (res.ok) toast({ title: "Reminder sent on WhatsApp", description: `Fee reminder for ${r.student.fullName} delivered via the linked device.` })
                            else toast({ title: "WhatsApp send failed", description: res.error ?? "Unknown error", variant: "destructive" })
                          } else {
                            toast({ title: "Opening WhatsApp chat", description: "Tip: link the academy WhatsApp once in Settings → WhatsApp Linked Device for direct one-click sends." })
                          }
                        } catch (e) {
                          toast({ title: "Could not send reminder", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" })
                        }
                      }}
                    >
                      <MessageCircle className="h-3 w-3" /> Remind
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 gap-1 rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground transition-all hover:brightness-110 active:scale-[0.97]"
                      onClick={() => openCollectFee(r.student.id)}
                    >
                      <BadgeIndianRupee className="h-3 w-3" /> Collect
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ============================ HISTORY ============================ */

function HistoryTab() {
  const [rows, setRows] = useState<(FeePayment & { studentName: string; admissionNo: string })[]>([])
  const [students, setStudents] = useState<Record<string, { mobile: string; ageCategory: string; gender: string }>>({})
  const [settings, setSettings] = useState<AcademySettings | null>(null)
  const [loading, setLoading] = useState(true)
  // search + filters (junior / male / …) across the receipt ledger
  const [q, setQ] = useState("")
  const [category, setCategory] = useState("all")
  const [gender, setGender] = useState("all")
  const [sendingId, setSendingId] = useState<string | null>(null)
  const { setPrint, dataVersion } = useAppStore()
  const { toast } = useToast()

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const [p, s, studentRows] = await Promise.all([fetchPayments({ limit: 200 }), fetchSettings(), fetchStudents()])
        if (!alive) return
        setRows(p)
        setSettings(s)
        const map: Record<string, { mobile: string; ageCategory: string; gender: string }> = {}
        for (const st of studentRows) map[st.id] = { mobile: st.mobile, ageCategory: st.ageCategory, gender: st.gender || "" }
        setStudents(map)
      } catch (e) {
        if (alive) toast({ title: "Could not load receipt history", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" })
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [toast, dataVersion])

  const filtered = useMemo(
    () =>
      rows.filter((p) => {
        const st = students[p.studentId]
        if (category !== "all" && st && st.ageCategory !== category) return false
        if (gender !== "all" && st && st.gender !== gender) return false
        return feeRowMatches([p.receiptNo, p.studentName, p.admissionNo, st?.mobile, p.paymentMode], q)
      }),
    [rows, students, q, category, gender],
  )
  const filteredTotal = filtered.reduce((sum, p) => sum + Number(p.amount || 0), 0)

  /** Reprint straight to the printer — A5 zero-margin paper. */
  function reprint(p: FeePayment & { studentName: string; admissionNo: string }) {
    setPrint({ kind: "receipt-a5", title: `PS-AMS-Receipt-${p.receiptNo}`, data: { receipt: p, settings }, mode: "direct" })
  }

  /** One-click resend: itemised message + A5 PDF receipt through the linked device. */
  async function resend(p: FeePayment & { studentName: string; admissionNo: string }) {
    const info = students[p.studentId]
    const intl = toIntlPhone(info?.mobile || "")
    if (!intl) {
      toast({ title: "No mobile number on file", description: `${p.studentName} has no mobile number in the profile.`, variant: "destructive" })
      return
    }
    setSendingId(p.id)
    try {
      const message = receiptWaMessage(p, settings, parsePaidMonths(p.months).map(monthLabel).join(", "))
      let pdf: { blob: Blob; fileName: string } | null = null
      try {
        pdf = { blob: await buildReceiptPdfA5(p, settings), fileName: `PS-AMS-Receipt-${p.receiptNo}.pdf` }
      } catch {
        pdf = null
      }
      const res = await dispatchWaReceipt(intl, message, pdf)
      if (res.via === "linked") {
        if (res.ok && res.attachment) toast({ title: "Receipt sent on WhatsApp", description: `Message + A5 PDF receipt delivered through the linked device to +${intl}.` })
        else if (res.ok) toast({ title: "Message sent — attachment failed", description: res.error ?? "The receipt PDF could not be uploaded.", variant: "destructive" })
        else toast({ title: "WhatsApp send failed", description: res.error ?? "Unknown error", variant: "destructive" })
      } else {
        toast({ title: "Opening WhatsApp chat", description: "Tip: link the academy WhatsApp once in Settings → WhatsApp Linked Device for direct one-click sends." })
      }
    } catch (e) {
      toast({ title: "Could not send receipt", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" })
    } finally {
      setSendingId(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="glass flex flex-wrap items-center gap-3 rounded-2xl p-3">
        <div>
          <div className="text-xs font-semibold">Receipt ledger</div>
          <div className="text-[15px] text-muted-foreground">
            {filtered.length} receipt{filtered.length === 1 ? "" : "s"} · <b className="text-foreground">{formatINR(filteredTotal)}</b> collected
            {(q || category !== "all" || gender !== "all") && <> (filtered from {rows.length})</>}
          </div>
        </div>
        <div className="ml-auto">
          <FeeFilterBar q={q} onQ={setQ} category={category} onCategory={setCategory} gender={gender} onGender={setGender} placeholder="Receipt no / student / mobile / mode…" />
        </div>
      </div>
      <div className="overflow-hidden glass rounded-2xl">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-border bg-muted/30 text-[15px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Receipt No</th>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Student</th>
              <th className="px-3 py-2 font-medium">Periods</th>
              <th className="px-3 py-2 font-medium">Mode</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
              <th className="px-3 py-2 text-right font-medium">Reprint / Send</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="py-8 text-center"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading…</td></tr>}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">{rows.length === 0 ? "No receipts yet." : "No receipts match the current search / filters."}</td></tr>
            )}
            {filtered.map((p) => (
              <tr key={p.id} className="border-b border-border/40 hover:bg-accent/30">
                <td className="px-4 py-2 font-mono text-[15px]">{p.receiptNo}</td>
                <td className="px-3 py-2">{formatDate(p.paymentDate)}</td>
                <td className="px-3 py-2 font-medium">{p.studentName} <span className="text-[15.5px] text-muted-foreground">{p.admissionNo}</span></td>
                <td className="px-3 py-2">{parsePaidMonths(p.months).map(monthLabel).join(", ")}</td>
                <td className="px-3 py-2">{p.paymentMode}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatINR(p.amount)}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="outline" className="h-6 px-2 text-[14.5px]" title="Straight to the default printer" onClick={() => reprint(p)}>A5</Button>
                    <Button size="sm" variant="outline" className="h-6 px-2 text-[14.5px]" title="Direct thermal print — 80 mm roll" onClick={() => setPrint({ kind: "receipt-thermal", title: `PS-AMS-Slip-${p.receiptNo}`, data: { receipt: p, settings }, mode: "direct" })}>Thermal</Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={sendingId === p.id}
                      className="h-6 gap-1 border-emerald-500/30 bg-emerald-500/10 px-2 text-[14.5px] text-emerald-700 hover:bg-emerald-500/20 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300"
                      title="Sends the itemised message plus the A5 PDF receipt via the linked device"
                      onClick={() => resend(p)}
                    >
                      {sendingId === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageCircle className="h-3 w-3" />} Send
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
