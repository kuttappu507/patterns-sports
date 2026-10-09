"use client"

import { useCallback, useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  ArrowLeft,
  Printer,
  Pencil,
  Phone,
  ShieldAlert,
  GraduationCap,
  Ruler,
  Weight,
  FileText,
  Trophy,
  Plus,
  Trash2,
  Medal,
  Receipt,
  Loader2,
  Download,
} from "lucide-react"
import {
  fetchStudent,
  fetchAchievements,
  createAchievement,
  deleteAchievement,
  fetchSettings,
  mediaUrl,
  type AcademySettings,
} from "@/lib/psams/api"
import {
  computeAge,
  ageDetailed,
  computeBMI,
  bmiBand,
  computeFeeStatus,
  formatINR,
  formatDate,
  parsePaidMonths,
  monthLabel,
  MEDAL_ICONS,
  CATEGORY_COLORS,
} from "@/lib/psams/domain"
import type { Student, Achievement, FeePayment } from "@/lib/psams/types"
import { useAppStore } from "@/lib/psams/store"
import { StudentDrawer } from "@/components/psams/student-drawer"
import { MediaUpload } from "@/components/psams/media-upload"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { SELECTION_LEVELS, MEDAL_OPTIONS } from "@/lib/psams/types"

interface FullStudent extends Student {
  achievements: Achievement[]
  payments: FeePayment[]
}

export function StudentDetailView({ studentId }: { studentId: string }) {
  const [student, setStudent] = useState<FullStudent | null>(null)
  const [settings, setSettings] = useState<AcademySettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [achOpen, setAchOpen] = useState(false)
  const { navigate, setPrint, refresh, dataVersion } = useAppStore()
  const { toast } = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, st] = await Promise.all([fetchStudent(studentId), fetchSettings()])
      setStudent(s)
      setSettings(st)
    } catch {
      setStudent(null)
    } finally {
      setLoading(false)
    }
  }, [studentId])

  useEffect(() => {
    load()
  }, [load, dataVersion])

  if (loading && !student) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading player profile…
      </div>
    )
  }
  if (!student) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        Student not found.
        <Button size="sm" variant="outline" onClick={() => navigate("students")}>Back to roster</Button>
      </div>
    )
  }

  const age = computeAge(student.dateOfBirth)
  const bmi = computeBMI(student.weightKg, student.heightCm)
  const band = bmiBand(bmi)
  const jumpGain = student.spikeReachCm && student.standingReachCm ? student.spikeReachCm - student.standingReachCm : null
  const fee = computeFeeStatus(student, student.payments)

  function printProfile() {
    setPrint({ kind: "profile-a4", title: "Player Profile Card", data: { student, achievements: student.achievements, settings } })
  }

  return (
    <div className="space-y-4 p-5">
      {/* hero */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border acrylic p-4">
        <div className="flex flex-wrap items-start gap-4">
          <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => navigate("students")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="h-24 w-20 shrink-0 overflow-hidden rounded-lg border-2 border-white bg-secondary shadow-md">
            {student.photoPath ? (
               
              <img src={mediaUrl(student.photoPath)} alt={student.fullName} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xl font-bold text-muted-foreground">
                {student.fullName.split(" ").map((w) => w[0]).slice(0, 2).join("")}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold">{student.fullName}</h2>
              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${CATEGORY_COLORS[student.ageCategory] || ""}`}>
                {student.ageCategory}
              </span>
              <Badge variant={student.status === "Active" ? "default" : "secondary"} className="rounded-full text-[11px]">
                {student.status}
              </Badge>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="font-mono">{student.admissionNo}</span>
              <span className="inline-flex items-center gap-1"><GraduationCap className="h-3 w-3" />{student.schoolName || "School not set"}</span>
              <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{student.parentName} · {student.mobile}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
              <Chip label="Age" value={`${age} yrs (${ageDetailed(student.dateOfBirth)})`} />
              <Chip label="Sport" value={`${student.primarySport}${student.playingPosition ? " · " + student.playingPosition : ""}`} />
              <Chip label="Batch" value={student.trainingBatch ? `${student.trainingBatch} batch` : "—"} />
              <Chip label="Blood" value={student.bloodGroup || "—"} />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={printProfile}>
              <Printer className="h-3.5 w-3.5" /> Print A4 Profile
            </Button>
            <Button size="sm" variant="outline" className="h-8 gap-1.5 bg-white/70 text-xs" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5" /> Edit profile
            </Button>
          </div>
        </div>
      </motion.div>

      {/* metrics strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile icon={<Ruler className="h-3.5 w-3.5" />} label="Height" value={student.heightCm ? `${student.heightCm} cm` : "—"} />
        <StatTile icon={<Weight className="h-3.5 w-3.5" />} label="Weight" value={student.weightKg ? `${student.weightKg} kg` : "—"} />
        <StatTile icon={<ShieldAlert className="h-3.5 w-3.5" />} label="BMI" value={bmi !== null ? bmi.toFixed(1) : "—"} sub={band.label} tone={band.color} />
        <StatTile icon={<Ruler className="h-3.5 w-3.5" />} label="Spike reach" value={student.spikeReachCm ? `${student.spikeReachCm} cm` : "—"} sub={jumpGain ? `+${jumpGain} cm over standing` : undefined} />
        <StatTile icon={<Receipt className="h-3.5 w-3.5" />} label="Fee dues" value={formatINR(fee.dueAmount)} sub={fee.pendingMonths.length ? `${fee.pendingMonths.length} month(s) pending` : "All settled"} tone={fee.isDefaulter ? "text-rose-600" : fee.dueAmount > 0 ? "text-amber-600" : "text-emerald-600"} />
      </div>

      <Tabs defaultValue="achievements" className="space-y-3">
        <TabsList className="h-8 bg-white/70 backdrop-blur">
          <TabsTrigger value="achievements" className="h-6 gap-1.5 text-xs"><Trophy className="h-3 w-3" /> Achievements ({student.achievements.length})</TabsTrigger>
          <TabsTrigger value="fee" className="h-6 gap-1.5 text-xs"><Receipt className="h-3 w-3" /> Fee history ({student.payments.length})</TabsTrigger>
          <TabsTrigger value="documents" className="h-6 gap-1.5 text-xs"><FileText className="h-3 w-3" /> Documents</TabsTrigger>
        </TabsList>

        {/* achievements */}
        <TabsContent value="achievements">
          <div className="rounded-xl border bg-white/70 backdrop-blur">
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <div>
                <div className="text-xs font-semibold">Tournaments, Medals & Selections</div>
                <div className="text-[11px] text-muted-foreground">Career milestones log with certificate attachments</div>
              </div>
              <Button size="sm" className="h-7 gap-1 text-[11px]" onClick={() => setAchOpen(true)}>
                <Plus className="h-3 w-3" /> Log achievement
              </Button>
            </div>
            <div className="divide-y">
              {student.achievements.length === 0 && (
                <div className="py-10 text-center text-xs text-muted-foreground">No achievements logged yet.</div>
              )}
              <AnimatePresence initial={false}>
                {student.achievements.map((a) => (
                  <motion.div key={a.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-3 px-4 py-3">
                    <span className="text-xl" title={a.medal}>{MEDAL_ICONS[a.medal] || "•"}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold">{a.tournamentName}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {a.eventDate ? formatDate(a.eventDate) : "Date not set"} · {a.notes || ""}
                      </div>
                    </div>
                    <Badge variant="outline" className="rounded-full text-[10.5px]">{a.level} level</Badge>
                    {a.medal !== "None" && (
                      <Badge className="rounded-full bg-amber-100 text-[10.5px] text-amber-800 hover:bg-amber-100">{a.medal}</Badge>
                    )}
                    {a.certificatePath && (
                      <a href={mediaUrl(a.certificatePath)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                        <Download className="h-3 w-3" /> Certificate
                      </a>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={async () => {
                        await deleteAchievement(a.id)
                        toast({ title: "Achievement removed" })
                        refresh()
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </TabsContent>

        {/* fee history */}
        <TabsContent value="fee">
          <div className="rounded-xl border bg-white/70 backdrop-blur">
            <div className="border-b px-4 py-2.5">
              <div className="text-xs font-semibold">Payment ledger</div>
              <div className="text-[11px] text-muted-foreground">
                Settled months: {fee.paidMonths.length ? fee.paidMonths.map(monthLabel).join(", ") : "none yet"}
                {fee.pendingMonths.length > 0 && `  ·  Pending: ${fee.pendingMonths.map(monthLabel).join(", ")}`}
              </div>
            </div>
            <table className="w-full text-left text-xs">
              <thead className="border-b bg-secondary/60 text-[11px] text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Receipt</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Billing periods</th>
                  <th className="px-3 py-2 font-medium">Mode</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {student.payments.length === 0 && (
                  <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">No payments recorded.</td></tr>
                )}
                {student.payments.map((p) => (
                  <tr key={p.id} className="border-b border-border/40">
                    <td className="px-4 py-2 font-mono text-[11px]">{p.receiptNo}</td>
                    <td className="px-3 py-2">{formatDate(p.paymentDate)}</td>
                    <td className="px-3 py-2">{parsePaidMonths(p.months).map(monthLabel).join(", ")}</td>
                    <td className="px-3 py-2">{p.paymentMode}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatINR(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* documents */}
        <TabsContent value="documents">
          <div className="grid grid-cols-1 gap-4 rounded-xl border bg-white/70 p-4 backdrop-blur md:grid-cols-2">
            <MediaUpload
              folder="documents"
              value={student.birthCertPath}
              onChange={async (p) => {
                await fetch(`/api/students/${student.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ birthCertPath: p || "" }) })
                toast({ title: p ? "Birth certificate attached" : "Birth certificate removed" })
                refresh()
              }}
              label="Birth certificate"
              hint="Upload PDF / PNG / JPG"
              previewShape="wide"
            />
            <MediaUpload
              folder="documents"
              value={student.idCardPath}
              onChange={async (p) => {
                await fetch(`/api/students/${student.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idCardPath: p || "" }) })
                toast({ title: p ? "ID card attached" : "ID card removed" })
                refresh()
              }}
              label="Government / School ID card"
              hint="Upload PDF / PNG / JPG"
              previewShape="wide"
            />
            <p className="col-span-full text-[11px] text-muted-foreground">
              Stored locally on disk under the application data directory — the database only records sanitized relative paths.
            </p>
          </div>
        </TabsContent>
      </Tabs>

      <StudentDrawer open={editOpen} onClose={() => setEditOpen(false)} editing={student} onSaved={() => refresh()} />

      <AchievementDialog
        open={achOpen}
        onClose={() => setAchOpen(false)}
        studentId={student.id}
        onSaved={() => {
          setAchOpen(false)
          refresh()
        }}
      />
    </div>
  )
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-md border bg-white/60 px-2 py-1">
      <span className="text-muted-foreground">{label}: </span>
      <span className="font-medium">{value}</span>
    </span>
  )
}

function StatTile({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl border bg-white/70 p-3 backdrop-blur">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {icon} {label}
      </div>
      <div className={`mt-1 text-lg font-bold leading-none ${tone || ""}`}>{value}</div>
      {sub && <div className="mt-1 text-[10.5px] text-muted-foreground">{sub}</div>}
    </div>
  )
}

function AchievementDialog({ open, onClose, studentId, onSaved }: { open: boolean; onClose: () => void; studentId: string; onSaved: () => void }) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ tournamentName: "", eventDate: "", level: "School", medal: "None", notes: "", certificatePath: null as string | null })

  async function save() {
    if (!form.tournamentName.trim()) {
      toast({ title: "Tournament name is required", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      await createAchievement(studentId, {
        tournamentName: form.tournamentName.trim(),
        eventDate: form.eventDate || null,
        level: form.level,
        medal: form.medal,
        notes: form.notes || null,
        certificatePath: form.certificatePath,
      })
      toast({ title: "Achievement logged" })
      setForm({ tournamentName: "", eventDate: "", level: "School", medal: "None", notes: "", certificatePath: null })
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Log Achievement</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Tournament / milestone *</Label>
            <Input className="h-8 text-xs" value={form.tournamentName} onChange={(e) => setForm({ ...form, tournamentName: e.target.value })} placeholder="e.g. State Volleyball Championship 2026" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <Input type="date" className="h-8 text-xs" value={form.eventDate} onChange={(e) => setForm({ ...form, eventDate: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Selection level</Label>
              <Select value={form.level} onValueChange={(v) => setForm({ ...form, level: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{SELECTION_LEVELS.map((l) => <SelectItem key={l} value={l} className="text-xs">{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Medal</Label>
            <Select value={form.medal} onValueChange={(v) => setForm({ ...form, medal: v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{MEDAL_OPTIONS.map((m) => <SelectItem key={m} value={m} className="text-xs">{MEDAL_ICONS[m]} {m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notes</Label>
            <Textarea className="min-h-[48px] text-xs" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="e.g. Selected as captain of district team" />
          </div>
          <MediaUpload folder="certificates" value={form.certificatePath} onChange={(p) => setForm({ ...form, certificatePath: p })} label="Certificate image (PDF / PNG / JPG)" hint="Upload certificate" previewShape="wide" />
        </div>
        <DialogFooter>
          <Button size="sm" variant="ghost" className="text-xs" onClick={onClose}>Cancel</Button>
          <Button size="sm" className="text-xs" disabled={saving} onClick={save}>
            {saving && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />} Save achievement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
