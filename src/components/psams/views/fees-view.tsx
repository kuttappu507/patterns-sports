"use client"

// ============================================================
// PS-AMS :: Fee Management — POS collection popup, receipt dispatch,
// defaulters monitoring & export pipelines.
// ============================================================

import { useEffect, useState } from "react"
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
} from "lucide-react"
import {
  fetchFeeStatuses,
  fetchPayments,
  fetchSettings,
} from "@/lib/psams/api"
import {
  monthLabel,
  formatINR,
  formatDate,
  parsePaidMonths,
  CATEGORY_COLORS,
} from "@/lib/psams/domain"
import { type FeePayment, type StudentFeeStatus, type AcademySettings } from "@/lib/psams/types"
import { useAppStore } from "@/lib/psams/store"
import { exportExcel, exportPDF } from "@/lib/psams/export"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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
      <div className="pointer-events-none absolute -bottom-14 right-40 h-44 w-44 rounded-full bg-amber-500/[0.07] blur-3xl" />

      <div className="relative mx-auto max-w-xl text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-[0_0_28px_-8px_rgba(99,102,241,0.55)] dark:shadow-[0_0_28px_-8px_rgba(129,140,248,0.6)]">
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
            className="btn-sheen h-11 gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-[0_14px_30px_-12px_rgba(99,102,241,0.7)] transition-all hover:brightness-110 active:scale-[0.97] dark:shadow-[0_0_22px_-4px_rgba(129,140,248,0.6)]"
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

  function waDispatch() {
    if (!receipt) return
    const months = parsePaidMonths(receipt.months)
    const lines = [
      `*${settings?.academyName || "Pattern Sports Academy"}*`,
      `Fee Receipt`,
      ``,
      `Receipt No: ${receipt.receiptNo}`,
      `Date: ${formatDate(receipt.paymentDate)}`,
      `Student: ${receipt.studentName} (${receipt.admissionNo})`,
      `Period${months.length > 1 ? "s" : ""}: ${months.map(monthLabel).join(", ")}`,
      `Amount Paid: ${formatINR(receipt.amount)}`,
      `Mode: ${receipt.paymentMode}`,
      ``,
      `Thank you! Keep supporting our champions. 🏐`,
    ]
    const phone = (receipt.studentMobile || "").replace(/\D/g, "")
    const intl = phone.length === 10 ? `91${phone}` : phone
    const url = `https://web.whatsapp.com/send?phone=${intl}&text=${encodeURIComponent(lines.join("\n"))}`
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      toast({ title: "You appear to be offline", description: "WhatsApp Web dispatch needs connectivity. The receipt is still saved and printable.", variant: "destructive" })
      return
    }
    window.open(url, "_blank", "noopener")
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
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Button size="sm" className="h-9 gap-1.5 text-xs" onClick={() => setPrint({ kind: "receipt-a5", title: "Fee Receipt (A5)", data: { receipt, settings } })}>
            <Printer className="h-3.5 w-3.5" /> Print A5
          </Button>
          <Button size="sm" variant="outline" className="h-9 gap-1.5 border-border bg-card text-xs hover:bg-muted" onClick={() => setPrint({ kind: "receipt-thermal", title: "POS Slip (80mm)", data: { receipt, settings } })}>
            <Printer className="h-3.5 w-3.5" /> 80mm Slip
          </Button>
          <Button size="sm" variant="outline" className="h-9 gap-1.5 border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-700 hover:bg-emerald-500/20 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300" onClick={waDispatch}>
            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
          </Button>
        </div>
        <p className="text-[15px] text-muted-foreground">
          A5 renders for standard printers; the 80 mm slip is sized for thermal POS rolls. WhatsApp opens the itemized receipt via WhatsApp Web when connectivity is present.
        </p>
      </DialogContent>
    </Dialog>
  )
}

/* ============================ DEFAULTERS ============================ */

function DefaultersTab() {
  const [rows, setRows] = useState<StudentFeeStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<AcademySettings | null>(null)
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

  const defaulterCount = rows.filter((r) => r.isDefaulter).length
  const totalDue = rows.reduce((sum, r) => sum + r.dueAmount, 0)

  // Excel/PDF generation can throw (encoding, layout edge cases) — never leave the user without feedback
  async function runExport(fn: () => Promise<unknown>) {
    try {
      await fn()
    } catch (e) {
      toast({ title: "Export failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" })
    }
  }

  const exportRows = rows.map((r) => ({
    name: r.student.fullName,
    admission: r.student.admissionNo,
    category: r.student.ageCategory,
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
    { header: "Unpaid Months (>1 mo)", key: "overdueMonths", width: 30 },
    { header: "Total Pending", key: "pendingCount", width: 12 },
    { header: "Outstanding (₹)", key: "due", width: 15 },
    { header: "Parent", key: "parent", width: 20 },
    { header: "Contact", key: "phone", width: 14 },
  ]

  function printRoster() {
    setPrint({ kind: "defaulters", title: "Fee Defaulters Roster", data: { rows: rows.filter((r) => r.isDefaulter), settings, totalDue: rows.filter((r) => r.isDefaulter).reduce((s, r) => s + r.dueAmount, 0) } })
  }

  return (
    <div className="space-y-3">
      <div className="glass flex flex-wrap items-center gap-3 rounded-2xl p-3">
        <div>
          <div className="text-xs font-semibold">Defaulters — overdue by more than one month</div>
          <div className="text-[15px] text-muted-foreground">
            <span className="font-semibold text-rose-600 dark:text-rose-300">{defaulterCount}</span> defaulter(s) of {rows.length} with any dues · total outstanding <b>{formatINR(totalDue)}</b>
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" className="h-8 gap-1.5 border-border bg-card text-xs hover:bg-muted" onClick={printRoster}><Printer className="h-3.5 w-3.5" /> Print</Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 border-border bg-card text-xs hover:bg-muted" onClick={() => runExport(() => exportExcel({ sheetName: "Defaulters", fileName: "PS-AMS-defaulters", title: "Fee Defaulters Roster — overdue by more than one month", academy: settings ?? undefined, columns: cols, rows: exportRows, totalsRow: { name: "TOTAL", due: totalDue } }))}>
            <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 border-border bg-card text-xs hover:bg-muted" onClick={() => runExport(() => exportPDF({ fileName: "PS-AMS-defaulters", title: "Fee Defaulters Roster", subtitle: "Overdue by more than one billing month", academy: settings ?? undefined, columns: cols, rows: exportRows, orientation: "l", totalsRow: { name: "TOTAL", due: totalDue } }))}>
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
            {!loading && rows.length === 0 && (
              <tr><td colSpan={6} className="py-10 text-center text-emerald-600 dark:text-emerald-300">Excellent — no pending dues across the academy.</td></tr>
            )}
            {rows.map((r) => (
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
  const [settings, setSettings] = useState<AcademySettings | null>(null)
  const [loading, setLoading] = useState(true)
  const { setPrint, dataVersion } = useAppStore()
  const { toast } = useToast()

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const [p, s] = await Promise.all([fetchPayments({ limit: 60 }), fetchSettings()])
        if (!alive) return
        setRows(p)
        setSettings(s)
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

  return (
    <div className="overflow-hidden glass rounded-2xl">
      <div className="border-b px-4 py-2.5 text-xs font-semibold">Recent receipts (latest 60)</div>
      <table className="w-full text-left text-xs">
        <thead className="border-b border-border bg-muted/30 text-[15px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">Receipt No</th>
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Student</th>
            <th className="px-3 py-2 font-medium">Periods</th>
            <th className="px-3 py-2 font-medium">Mode</th>
            <th className="px-3 py-2 text-right font-medium">Amount</th>
            <th className="px-3 py-2 text-right font-medium">Reprint</th>
          </tr>
        </thead>
        <tbody>
          {loading && <tr><td colSpan={7} className="py-8 text-center"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading…</td></tr>}
          {!loading && rows.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">No receipts yet.</td></tr>}
          {rows.map((p) => (
            <tr key={p.id} className="border-b border-border/40 hover:bg-accent/30">
              <td className="px-4 py-2 font-mono text-[15px]">{p.receiptNo}</td>
              <td className="px-3 py-2">{formatDate(p.paymentDate)}</td>
              <td className="px-3 py-2 font-medium">{p.studentName} <span className="text-[15.5px] text-muted-foreground">{p.admissionNo}</span></td>
              <td className="px-3 py-2">{parsePaidMonths(p.months).map(monthLabel).join(", ")}</td>
              <td className="px-3 py-2">{p.paymentMode}</td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatINR(p.amount)}</td>
              <td className="px-3 py-2">
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="outline" className="h-6 px-2 text-[14.5px]" onClick={() => setPrint({ kind: "receipt-a5", title: "Fee Receipt (A5)", data: { receipt: p, settings } })}>A5</Button>
                  <Button size="sm" variant="outline" className="h-6 px-2 text-[14.5px]" onClick={() => setPrint({ kind: "receipt-thermal", title: "POS Slip (80mm)", data: { receipt: p, settings } })}>Thermal</Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
