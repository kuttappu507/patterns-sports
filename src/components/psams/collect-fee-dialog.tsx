"use client"

// ============================================================
// PS-AMS :: Fee collection — centered POPUP dialog (POS flow).
// Globally mounted once and driven by the app store, so
// "Collect Fee" works from the sidebar header, the dashboard
// hero, the Fees module and the defaulters roster (pre-targeted
// at that student). Multi-month settlement with automatic
// amount suggestion, then the printable receipt hand-off.
// ============================================================

import { useMemo, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Search, Receipt, Loader2, CheckCircle2, X, UserRoundSearch } from "lucide-react"
import {
  fetchStudents,
  fetchFeeStatuses,
  collectPayment,
  fetchSettings,
  mediaUrl,
} from "@/lib/psams/api"
import {
  monthKey,
  monthLabel,
  formatINR,
  parsePaidMonths,
  CATEGORY_COLORS,
} from "@/lib/psams/domain"
import { PAYMENT_MODES, type FeePayment, type Student, type AcademySettings } from "@/lib/psams/types"
import { useAppStore } from "@/lib/psams/store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { ReceiptDialog } from "@/components/psams/views/fees-view"

export function CollectFeeDialog() {
  const open = useAppStore((s) => s.collectFeeOpen)
  const presetStudentId = useAppStore((s) => s.collectFeeStudentId)
  const onClose = useAppStore((s) => s.closeCollectFee)
  const refresh = useAppStore((s) => s.refresh)
  const { toast } = useToast()

  const [students, setStudents] = useState<Student[]>([])
  const [settings, setSettings] = useState<AcademySettings | null>(null)
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState("")
  const [selected, setSelected] = useState<Student | null>(null)
  const [pending, setPending] = useState<string[]>([])
  const [chosen, setChosen] = useState<string[]>([])
  const [amount, setAmount] = useState("")
  const [mode, setMode] = useState<string>("Cash")
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const pickSeq = useRef(0)
  const [receipt, setReceipt] = useState<(FeePayment & { studentName: string; admissionNo: string; studentMobile?: string }) | null>(null)

  // Load fresh data every time the popup opens (and honour a pre-targeted student)
  const [prevOpen, setPrevOpen] = useState(open)
  if (prevOpen !== open) {
    setPrevOpen(open)
    if (open) {
      setQ("")
      setSelected(null)
      setPending([])
      setChosen([])
      setAmount("")
      setNotes("")
      setMode("Cash")
      setPaymentDate(new Date().toISOString().slice(0, 10))
      setReceipt(null)
      setLoading(true)
      Promise.all([fetchStudents({ status: "Active" }), fetchSettings()])
        .then(([s, st]) => {
          setStudents(s)
          setSettings(st)
          const preset = presetStudentId ? s.find((x) => x.id === presetStudentId) : undefined
          if (preset) void pick(preset)
        })
        .catch((e) => toast({ title: "Could not load fee data", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" }))
        .finally(() => setLoading(false))
    }
  }

  // (receipt state is cleared on the next open — after a successful payment
  // the printable receipt stays on screen while the form dialog closes)

  async function pick(student: Student) {
    setSelected(student)
    // sequence token — a slow response for a previously picked student must
    // never overwrite the pending months of the one just selected
    const seq = ++pickSeq.current
    try {
      const all = await fetchFeeStatuses()
      if (seq !== pickSeq.current) return
      const st = all.find((s) => s.student.id === student.id)
      const calc = st ?? { pendingMonths: [], paidMonths: [], overdueMonths: [], dueAmount: 0, isDefaulter: false }
      setPending(calc.pendingMonths)
      setChosen(calc.pendingMonths)
      setAmount(String(calc.pendingMonths.length * student.monthlyFee))
    } catch (e) {
      if (seq !== pickSeq.current) return
      toast({ title: "Could not load fee status", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" })
    }
  }

  const filtered = useMemo(() => {
    // The FULL active roster — the picker column scrolls, so every student
    // is reachable (previously capped at 8 which hid most of the academy).
    const needle = q.trim().toLowerCase()
    if (!needle) return students
    return students.filter(
      (s) => s.fullName.toLowerCase().includes(needle) || s.admissionNo.toLowerCase().includes(needle) || s.mobile.includes(needle)
    )
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
    if (!Number.isFinite(amt) || amt <= 0) {
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
      refresh()
      onClose() // close the form; the printable receipt stays on screen
    } catch (e) {
      toast({ title: "Payment failed", description: e instanceof Error ? e.message : "", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const perMonth = selected?.monthlyFee ?? 0

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="flex max-h-[92vh] w-[min(66rem,calc(100vw-2rem))] flex-col overflow-hidden gap-0 rounded-2xl border-border p-0 sm:max-w-[min(66rem,calc(100vw-2rem))]">
          <DialogHeader className="border-b px-5 py-3.5">
            <DialogTitle className="text-sm font-semibold">Collect Fee — Point of Sale</DialogTitle>
            <DialogDescription className="text-[15px]">
              Multi-month settlement with automatic amount suggestion and an instant printable receipt
            </DialogDescription>
          </DialogHeader>

          {/* grid-rows constraint: on desktop the single row is capped to the
              dialog height (minmax(0,1fr)) so BOTH columns scroll internally
              instead of the content being clipped with no scrollbar */}
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-y-auto lg:grid-cols-[340px_1fr] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
            {/* student picker */}
            <div className="flex min-h-0 flex-col border-b lg:border-b-0 lg:border-r">
              <div className="border-b p-3">
                <div className="text-xs font-semibold">1 · Select Student</div>
                <p className="text-[15px] text-muted-foreground">Pending months are retrieved automatically</p>
                <div className="relative mt-2">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input className="h-8 pl-8 text-xs" placeholder="Name / admission no. / mobile…" value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
              </div>
              <div className="min-h-0 flex-1 divide-y overflow-y-auto">
                {loading && (
                  <div className="p-8 text-center text-xs text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading roster…</div>
                )}
                {!loading && filtered.map((s) => (
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
                {!loading && filtered.length === 0 && (
                  <div className="p-8 text-center text-xs text-muted-foreground">
                    <UserRoundSearch className="mx-auto mb-2 h-5 w-5 opacity-50" />
                    No active students found.
                  </div>
                )}
              </div>
            </div>

            {/* payment entry */}
            <div className="flex min-h-0 flex-col">
              <div className="border-b p-3">
                <div className="text-xs font-semibold">2 · Payment Entry</div>
                <p className="text-[15px] text-muted-foreground">Pick the billing months to settle — the amount auto-fills</p>
              </div>
              <AnimatePresence mode="wait">
                {!selected ? (
                  <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex min-h-[280px] flex-1 items-center justify-center p-6 text-center text-xs text-muted-foreground">
                    Pick a student from the left to load their pending billing months.
                  </motion.div>
                ) : (
                  <motion.div key={selected.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
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

                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 p-3">
                      <div className="text-xs text-muted-foreground">
                        {chosen.length} month{chosen.length === 1 ? "" : "s"} × {formatINR(perMonth)} = <b className="text-foreground">{formatINR(chosen.length * perMonth)}</b>
                        {chosen.length > 0 && (
                          <span className="mt-0.5 block text-[15px]">{parsePaidMonths(JSON.stringify(chosen)).map(monthLabel).join(", ")}</span>
                        )}
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
          </div>
        </DialogContent>
      </Dialog>

      <ReceiptDialog receipt={receipt} onClose={() => setReceipt(null)} settings={settings} />
    </>
  )
}
