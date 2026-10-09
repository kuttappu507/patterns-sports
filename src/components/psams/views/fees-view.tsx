"use client"

// ============================================================
// PS-AMS :: Fee Management — collection workflow, receipt dispatch,
// defaulters monitoring & export pipelines.
// ============================================================

import { useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Search,
  Receipt,
  AlertTriangle,
  Printer,
  FileSpreadsheet,
  FileText,
  MessageCircle,
  Loader2,
  CheckCircle2,
  X,
  Phone,
  History,
} from "lucide-react"
import {
  fetchStudents,
  fetchFeeStatuses,
  fetchPayments,
  collectPayment,
  fetchSettings,
  mediaUrl,
} from "@/lib/psams/api"
import {
  computeFeeStatus,
  monthKey,
  monthLabel,
  formatINR,
  formatDate,
  CATEGORY_COLORS,
} from "@/lib/psams/domain"
import { PAYMENT_MODES, type FeePayment, type Student, type StudentFeeStatus, type AcademySettings } from "@/lib/psams/types"
import { useAppStore } from "@/lib/psams/store"
import { exportExcel, exportPDF } from "@/lib/psams/export"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
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
  const { refresh } = useAppStore()
  const { toast } = useToast()
  const [students, setStudents] = useState<Student[]>([])
  const [settings, setSettings] = useState<AcademySettings | null>(null)
  const [q, setQ] = useState("")
  const [selected, setSelected] = useState<Student | null>(null)
  const [pending, setPending] = useState<string[]>([])
  const [chosen, setChosen] = useState<string[]>([])
  const [amount, setAmount] = useState("")
  const [mode, setMode] = useState<string>("Cash")
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const [receipt, setReceipt] = useState<(FeePayment & { studentName: string; admissionNo: string; studentMobile?: string }) | null>(null)

  useEffect(() => {
    fetchStudents({ status: "Active" }).then(setStudents)
    fetchSettings().then(setSettings)
  }, [])

  function computeLocal(s: Student, payments: { months: string; paymentDate: string | Date }[]) {
    const st = computeFeeStatus(s, payments)
    return { pendingMonths: st.pendingMonths, paidMonths: st.paidMonths, overdueMonths: st.overdueMonths }
  }

  async function pick(student: Student) {
    setSelected(student)
    // fetch fresh statuses (latest payments) and compute pending months inline
    const all = await fetchFeeStatuses()
    const st = all.find((s) => s.student.id === student.id)
    const calc = st ?? computeLocal(student, [])
    setPending(calc.pendingMonths)
    setChosen(calc.pendingMonths)
    setAmount(String(calc.pendingMonths.length * student.monthlyFee))
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return students.slice(0, 8)
    return students
      .filter((s) => s.fullName.toLowerCase().includes(needle) || s.admissionNo.toLowerCase().includes(needle) || s.mobile.includes(needle))
      .slice(0, 8)
  }, [q, students])

  function toggleMonth(m: string) {
    setChosen((prev) => {
      const next = prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m].sort()
      if (selected) setAmount(String(next.length * selected.monthlyFee))
      return next
    })
  }

  async function submit() {
    if (!selected) return
    if (chosen.length === 0) {
      toast({ title: "Select at least one billing month", variant: "destructive" })
      return
    }
    const amt = Number(amount)
    if (!amt || amt <= 0) {
      toast({ title: "Enter the collected amount", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const payment = await collectPayment({
        studentId: selected.id,
        months: chosen,
        amount: amt,
        paymentMode: mode,
        paymentDate,
        notes: notes || undefined,
      })
      setReceipt({ ...payment, studentMobile: selected.mobile })
      setQ("")
      const next = students.filter((s) => s.id !== selected.id)
      setStudents(next)
      setSelected(null)
      setPending([])
      setChosen([])
      setAmount("")
      setNotes("")
      refresh()
    } catch (e) {
      toast({ title: "Payment failed", description: e instanceof Error ? e.message : "", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const perMonth = selected?.monthlyFee ?? 0

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
      {/* student picker */}
      <div className="glass rounded-2xl">
        <div className="border-b p-3">
          <div className="text-xs font-semibold">1 · Select Student</div>
          <p className="text-[15px] text-muted-foreground">Pending months are retrieved automatically</p>
          <div className="relative mt-2">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-8 pl-8 text-xs" placeholder="Name / admission no. / mobile…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div className="max-h-[420px] divide-y overflow-y-auto">
          {filtered.map((s) => (
            <button key={s.id} onClick={() => pick(s)} className={cn("flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-accent/50", selected?.id === s.id && "bg-accent")}>
              <div className="h-8 w-8 overflow-hidden rounded-full border border-border bg-gradient-to-br from-primary/15 to-teal-500/10">
                {s.photoPath ? (
                   
                  <img src={mediaUrl(s.photoPath)} alt={s.fullName} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[15.5px] font-semibold text-muted-foreground">{s.fullName.split(" ").map((w) => w[0]).slice(0, 2).join("")}</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium">{s.fullName}</div>
                <div className="text-[14.5px] text-muted-foreground">{s.admissionNo} · {s.mobile}</div>
              </div>
              <span className={cn("rounded-full border px-2 py-0.5 text-[15.5px] font-medium", CATEGORY_COLORS[s.ageCategory] || "")}>{s.ageCategory}</span>
            </button>
          ))}
          {filtered.length === 0 && <div className="p-6 text-center text-xs text-muted-foreground">No active students found.</div>}
        </div>
      </div>

      {/* payment entry */}
      <div className="glass rounded-2xl">
        <div className="border-b p-3">
          <div className="text-xs font-semibold">2 · Payment Entry</div>
          <p className="text-[15px] text-muted-foreground">Multi-month settlement with automatic amount suggestion</p>
        </div>
        <AnimatePresence mode="wait">
          {!selected ? (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex h-[300px] items-center justify-center text-xs text-muted-foreground">
              Pick a student from the left to load their pending billing months.
            </motion.div>
          ) : (
            <motion.div key={selected.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4 p-4">
              <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 p-3">
                <div>
                  <div className="text-sm font-semibold">{selected.fullName}</div>
                  <div className="text-[15px] text-muted-foreground">{selected.admissionNo} · {selected.ageCategory} · fee {formatINR(selected.monthlyFee)}/month</div>
                </div>
                <div className="ml-auto text-right">
                  <div className="text-[15px] text-muted-foreground">Outstanding</div>
                  <div className="text-sm font-bold text-rose-600 dark:text-rose-300">{formatINR(pending.length * selected.monthlyFee)}</div>
                </div>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setSelected(null)}><X className="h-3.5 w-3.5" /></Button>
              </div>

              <div>
                <div className="mb-1.5 text-xs font-medium">Billing periods to settle <span className="font-normal text-muted-foreground">({pending.length} pending)</span></div>
                {pending.length === 0 ? (
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" /> All billing months are settled — no dues.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {pending.map((m) => {
                      const isOverdue = m < monthKey(new Date())
                      const on = chosen.includes(m)
                      return (
                        <label
                          key={m}
                          className={cn(
                            "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-all",
                            on ? "border-primary bg-primary/10 font-medium text-primary shadow-sm" : "bg-muted hover:border-primary/40",
                            isOverdue && !on && "border-rose-400/40"
                          )}
                        >
                          <Checkbox checked={on} onCheckedChange={() => toggleMonth(m)} />
                          <span>{monthLabel(m)}</span>
                          {isOverdue && <span className="rounded bg-rose-400/15 px-1.5 py-0.5 text-[15px] font-semibold text-rose-600 dark:text-rose-300">OVERDUE</span>}
                          <span className="text-[15.5px] text-muted-foreground">{formatINR(perMonth)}</span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">Payment date</div>
                  <Input type="date" className="h-8 text-xs" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">Payment mode</div>
                  <Select value={mode} onValueChange={setMode}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{PAYMENT_MODES.map((m) => <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">Collected amount (₹)</div>
                  <Input className="h-8 text-xs font-semibold" type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">Remarks</div>
                  <Input className="h-8 text-xs" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3">
                <div className="text-xs text-muted-foreground">
                  {chosen.length} month{chosen.length === 1 ? "" : "s"} × {formatINR(perMonth)} = <b className="text-foreground">{formatINR(chosen.length * perMonth)}</b>
                </div>
                <Button className="h-9 gap-1.5 text-xs" disabled={saving || chosen.length === 0} onClick={submit}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Receipt className="h-3.5 w-3.5" />}
                  Confirm & Generate Receipt
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* receipt dialog */}
      <ReceiptDialog receipt={receipt} onClose={() => setReceipt(null)} settings={settings} />
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
    const months = JSON.parse(receipt.months) as string[]
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
  const months = JSON.parse(receipt.months) as string[]

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
  const { setPrint, navigate } = useAppStore()

  useEffect(() => {
    let alive = true
    Promise.all([fetchFeeStatuses(), fetchSettings()]).then(([d, s]) => {
      if (!alive) return
      setRows(d.filter((r) => r.student.status === "Active" && r.dueAmount > 0).sort((a, b) => Number(b.isDefaulter) - Number(a.isDefaulter) || b.dueAmount - a.dueAmount))
      setSettings(s)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [])

  const defaulterCount = rows.filter((r) => r.isDefaulter).length
  const totalDue = rows.reduce((sum, r) => sum + r.dueAmount, 0)

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
          <Button size="sm" variant="outline" className="h-8 gap-1.5 border-border bg-card text-xs hover:bg-muted" onClick={() => exportExcel({ sheetName: "Defaulters", fileName: "PS-AMS-defaulters", title: "Fee Defaulters Roster — overdue by more than one month", academy: settings ?? undefined, columns: cols, rows: exportRows, totalsRow: { name: "TOTAL", due: totalDue } })}>
            <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 border-border bg-card text-xs hover:bg-muted" onClick={() => exportPDF({ fileName: "PS-AMS-defaulters", title: "Fee Defaulters Roster", subtitle: "Overdue by more than one billing month", academy: settings ?? undefined, columns: cols, rows: exportRows, orientation: "l", totalsRow: { name: "TOTAL", due: totalDue } })}>
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
                  <Button size="sm" variant="outline" className="h-7 border-border bg-card text-[15px] hover:bg-muted" onClick={() => navigate("student-detail", r.student.id)}>Open</Button>
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
  const { setPrint } = useAppStore()

  useEffect(() => {
    Promise.all([fetchPayments({ limit: 60 }), fetchSettings()])
      .then(([p, s]) => {
        setRows(p)
        setSettings(s)
      })
      .finally(() => setLoading(false))
  }, [])

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
              <td className="px-3 py-2">{(JSON.parse(p.months) as string[]).map(monthLabel).join(", ")}</td>
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
