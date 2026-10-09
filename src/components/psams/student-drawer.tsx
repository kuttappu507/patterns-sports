"use client"

// ============================================================
// PS-AMS :: Student registration / edit slide-over drawer.
// Spring-animated, live age + BMI computation, sectioned form.
// ============================================================

import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { X, Loader2, Sparkles } from "lucide-react"
import { createStudent, updateStudent } from "@/lib/psams/api"
import {
  AGE_CATEGORIES,
  BLOOD_GROUPS,
  SPORTS,
  SPORT_POSITIONS,
  TRAINING_BATCHES,
  type Student,
} from "@/lib/psams/types"
import { computeAge, suggestAgeCategory, computeBMI, bmiBand, ageDetailed } from "@/lib/psams/domain"
import { MediaUpload } from "@/components/psams/media-upload"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { useToast } from "@/hooks/use-toast"

export interface StudentFormDefaults {
  defaultMonthlyFee?: number
}

export function StudentDrawer({
  open,
  onClose,
  editing,
  defaults,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  editing?: Student | null
  defaults?: StudentFormDefaults
  onSaved?: (s: Student) => void
}) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)

  const blank = {
    fullName: "",
    dateOfBirth: "",
    registrationDate: new Date().toISOString().slice(0, 10),
    parentName: "",
    mobile: "",
    emergencyContact: "",
    address: "",
    schoolName: "",
    classGrade: "",
    division: "",
    bloodGroup: "",
    heightCm: "",
    weightKg: "",
    standingReachCm: "",
    spikeReachCm: "",
    jumpReachCm: "",
    primarySport: "Volleyball",
    playingPosition: "",
    ageCategory: "",
    ageCategoryTouched: false,
    trainingBatch: "",
    monthlyFee: String(defaults?.defaultMonthlyFee ?? 500),
    photoPath: null as string | null,
    birthCertPath: null as string | null,
    idCardPath: null as string | null,
    status: "Active",
  }

  type FormState = typeof blank

  const [form, setForm] = useState<FormState>(blank)

  useEffect(() => {
    if (!open) return
    if (editing) {
      setForm({
        fullName: editing.fullName,
        dateOfBirth: editing.dateOfBirth.slice(0, 10),
        registrationDate: editing.registrationDate.slice(0, 10),
        parentName: editing.parentName,
        mobile: editing.mobile,
        emergencyContact: editing.emergencyContact || "",
        address: editing.address || "",
        schoolName: editing.schoolName || "",
        classGrade: editing.classGrade || "",
        division: editing.division || "",
        bloodGroup: editing.bloodGroup || "",
        heightCm: editing.heightCm != null ? String(editing.heightCm) : "",
        weightKg: editing.weightKg != null ? String(editing.weightKg) : "",
        standingReachCm: editing.standingReachCm != null ? String(editing.standingReachCm) : "",
        spikeReachCm: editing.spikeReachCm != null ? String(editing.spikeReachCm) : "",
        jumpReachCm: editing.jumpReachCm != null ? String(editing.jumpReachCm) : "",
        primarySport: editing.primarySport || "Volleyball",
        playingPosition: editing.playingPosition || "",
        ageCategory: editing.ageCategory || "",
        ageCategoryTouched: true,
        trainingBatch: editing.trainingBatch || "",
        monthlyFee: String(editing.monthlyFee ?? 500),
        photoPath: editing.photoPath || null,
        birthCertPath: editing.birthCertPath || null,
        idCardPath: editing.idCardPath || null,
        status: editing.status || "Active",
      })
    } else {
      setForm({ ...blank, monthlyFee: String(defaults?.defaultMonthlyFee ?? 500) })
    }
     
  }, [open, editing])

  const set = <K extends keyof FormState>(key: K, val: FormState[K]) => setForm((f) => ({ ...f, [key]: val }))

  // ---- live computed metrics ----
  const age = useMemo(() => (form.dateOfBirth ? computeAge(form.dateOfBirth) : null), [form.dateOfBirth])
  const ageText = useMemo(() => (form.dateOfBirth ? ageDetailed(form.dateOfBirth) : "—"), [form.dateOfBirth])
  const suggestedCategory = useMemo(() => (age !== null ? suggestAgeCategory(age) : ""), [age])
  const effectiveCategory = form.ageCategoryTouched && form.ageCategory ? form.ageCategory : suggestedCategory
  const bmi = useMemo(
    () => computeBMI(Number(form.weightKg) || null, Number(form.heightCm) || null),
    [form.weightKg, form.heightCm]
  )
  const band = bmiBand(bmi)
  const jumpGain = useMemo(() => {
    const s = Number(form.spikeReachCm), st = Number(form.standingReachCm)
    return s > 0 && st > 0 ? s - st : null
  }, [form.spikeReachCm, form.standingReachCm])

  const valid = form.fullName.trim() && form.dateOfBirth && form.parentName.trim() && form.mobile.trim() && effectiveCategory

  async function save() {
    if (!valid) {
      toast({ title: "Missing information", description: "Name, date of birth, parent, mobile and age category are required.", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const payload = {
        fullName: form.fullName.trim(),
        dateOfBirth: form.dateOfBirth,
        registrationDate: form.registrationDate,
        parentName: form.parentName.trim(),
        mobile: form.mobile.trim(),
        emergencyContact: form.emergencyContact || null,
        address: form.address || null,
        schoolName: form.schoolName || null,
        classGrade: form.classGrade || null,
        division: form.division || null,
        bloodGroup: form.bloodGroup || null,
        heightCm: form.heightCm ? Number(form.heightCm) : null,
        weightKg: form.weightKg ? Number(form.weightKg) : null,
        standingReachCm: form.standingReachCm ? Number(form.standingReachCm) : null,
        spikeReachCm: form.spikeReachCm ? Number(form.spikeReachCm) : null,
        jumpReachCm: form.jumpReachCm ? Number(form.jumpReachCm) : null,
        primarySport: form.primarySport,
        playingPosition: form.playingPosition || null,
        ageCategory: effectiveCategory,
        trainingBatch: form.trainingBatch || null,
        monthlyFee: Number(form.monthlyFee) || 0,
        photoPath: form.photoPath,
        birthCertPath: form.birthCertPath,
        idCardPath: form.idCardPath,
        status: form.status,
      }
      const saved = editing ? await updateStudent(editing.id, payload) : await createStudent(payload)
      toast({ title: editing ? "Student updated" : "Student registered", description: `${saved.fullName} · ${saved.admissionNo}` })
      onSaved?.(saved)
      onClose()
    } catch (e) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      initial={false}
      animate={{ opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none" }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <motion.aside
        initial={false}
        animate={{ x: open ? 0 : "100%" }}
        transition={{ type: "spring", stiffness: 320, damping: 34 }}
        onClick={(e) => e.stopPropagation()}
        className="absolute right-0 top-0 flex h-full w-full max-w-[640px] flex-col bg-background/95 shadow-2xl backdrop-blur-xl"
      >
        {/* header */}
        <div className="flex items-center gap-3 border-b px-5 py-3.5">
          <div>
            <h2 className="text-sm font-semibold">{editing ? `Edit — ${editing.fullName}` : "Register New Student"}</h2>
            <p className="text-[11px] text-muted-foreground">
              {editing ? editing.admissionNo : "Admission number will be generated automatically on save"}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="ml-auto h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* body */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* photo + identity */}
          <section className="flex gap-4">
            <div className="shrink-0">
              <MediaUpload
                folder="photos"
                value={form.photoPath}
                onChange={(p) => set("photoPath", p)}
                label="Passport photo"
                previewShape="portrait"
                hint="Upload photo"
              />
            </div>
            <div className="grid flex-1 grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Full name *</Label>
                <Input className="h-8 text-xs" value={form.fullName} onChange={(e) => set("fullName", e.target.value)} placeholder="e.g. Aravind R Menon" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Date of birth *</Label>
                <Input type="date" className="h-8 text-xs" value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Registration date</Label>
                <Input type="date" className="h-8 text-xs" value={form.registrationDate} onChange={(e) => set("registrationDate", e.target.value)} />
              </div>
              <div className="col-span-2 rounded-lg border bg-accent/40 px-3 py-2">
                <div className="flex items-center gap-2 text-xs">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span className="font-medium">Live age:</span>
                  <span className="font-semibold text-primary">{age !== null ? `${age} years` : "select DOB"}</span>
                  <span className="text-muted-foreground">({ageText})</span>
                </div>
              </div>
            </div>
          </section>

          <SectionTitle>Parent / Guardian & Contact</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Parent / guardian name *</Label>
              <Input className="h-8 text-xs" value={form.parentName} onChange={(e) => set("parentName", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Primary mobile *</Label>
              <Input className="h-8 text-xs" inputMode="tel" value={form.mobile} onChange={(e) => set("mobile", e.target.value)} placeholder="10-digit number" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Emergency contact</Label>
              <Input className="h-8 text-xs" inputMode="tel" value={form.emergencyContact} onChange={(e) => set("emergencyContact", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Blood group</Label>
              <Select value={form.bloodGroup} onValueChange={(v) => set("bloodGroup", v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{BLOOD_GROUPS.map((b) => <SelectItem key={b} value={b} className="text-xs">{b}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Residential address</Label>
              <Textarea className="min-h-[52px] text-xs" value={form.address} onChange={(e) => set("address", e.target.value)} />
            </div>
          </div>

          <SectionTitle>Academic</SectionTitle>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">School / institution</Label>
              <Input className="h-8 text-xs" value={form.schoolName} onChange={(e) => set("schoolName", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Class / grade</Label>
              <Input className="h-8 text-xs" value={form.classGrade} onChange={(e) => set("classGrade", e.target.value)} placeholder="e.g. 8" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Division</Label>
              <Input className="h-8 text-xs" value={form.division} onChange={(e) => set("division", e.target.value)} placeholder="e.g. B" />
            </div>
          </div>

          <SectionTitle>Athletic & Biometric Parameters</SectionTitle>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Height (cm)</Label>
              <Input className="h-8 text-xs" type="number" min="0" value={form.heightCm} onChange={(e) => set("heightCm", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Weight (kg)</Label>
              <Input className="h-8 text-xs" type="number" min="0" value={form.weightKg} onChange={(e) => set("weightKg", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">BMI — auto</Label>
              <div className="flex h-8 items-center justify-between rounded-md border bg-white/[0.05] px-2.5 text-xs">
                <span className={`font-bold tabular-nums ${band.color}`}>{bmi !== null ? bmi.toFixed(1) : "—"}</span>
                <span className="text-[10px] text-muted-foreground">{band.label}</span>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Standing reach (cm)</Label>
              <Input className="h-8 text-xs" type="number" min="0" value={form.standingReachCm} onChange={(e) => set("standingReachCm", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Spike reach (cm)</Label>
              <Input className="h-8 text-xs" type="number" min="0" value={form.spikeReachCm} onChange={(e) => set("spikeReachCm", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Jump reach (cm)</Label>
              <Input className="h-8 text-xs" type="number" min="0" value={form.jumpReachCm} onChange={(e) => set("jumpReachCm", e.target.value)} />
            </div>
            {jumpGain !== null && jumpGain > 0 && (
              <div className="col-span-3 rounded-md bg-emerald-400/10 px-3 py-1.5 text-[11px] text-emerald-300">
                Vertical gain (standing → spike): <b>+{jumpGain} cm</b>
              </div>
            )}
          </div>

          <SectionTitle>Sport & Category</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Primary sport</Label>
              <Select value={form.primarySport} onValueChange={(v) => { set("primarySport", v); set("playingPosition", "") }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{SPORTS.map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Playing position</Label>
              <Select value={form.playingPosition} onValueChange={(v) => set("playingPosition", v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {(SPORT_POSITIONS[form.primarySport] || []).map((p) => (
                    <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Age category — {suggestedCategory && !form.ageCategoryTouched ? `auto (${suggestedCategory})` : "manual"}</Label>
              <Select
                value={effectiveCategory}
                onValueChange={(v) => setForm((f) => ({ ...f, ageCategory: v, ageCategoryTouched: true }))}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {AGE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="text-xs">
                      {c}{c === suggestedCategory ? " · suggested" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Training batch</Label>
              <Select value={form.trainingBatch} onValueChange={(v) => set("trainingBatch", v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {TRAINING_BATCHES.map((b) => <SelectItem key={b} value={b} className="text-xs">{b} Batch</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Monthly fee (₹)</Label>
              <Input className="h-8 text-xs" type="number" min="0" value={form.monthlyFee} onChange={(e) => set("monthlyFee", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Active", "Inactive", "Alumni"].map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <SectionTitle>Documents</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <MediaUpload folder="documents" value={form.birthCertPath} onChange={(p) => set("birthCertPath", p)} label="Birth certificate (PDF / PNG / JPG)" hint="Upload certificate" previewShape="wide" />
            <MediaUpload folder="documents" value={form.idCardPath} onChange={(p) => set("idCardPath", p)} label="Govt / School ID card (PDF / PNG / JPG)" hint="Upload ID card" previewShape="wide" />
          </div>
          <Separator />
          <p className="pb-2 text-[11px] text-muted-foreground">
            Files are stored on the local application data disk — the database keeps only sanitized relative paths.
          </p>
        </div>

        {/* footer */}
        <div className="flex items-center gap-2 border-t bg-white/[0.04] px-5 py-3">
          <Button onClick={save} disabled={saving} className="h-9 gap-1.5 text-xs">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {editing ? "Save changes" : "Register student"}
          </Button>
          <Button variant="ghost" className="h-9 text-xs" onClick={onClose}>Cancel</Button>
          <span className="ml-auto text-[11px] text-muted-foreground">* required fields</span>
        </div>
      </motion.aside>
    </motion.div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</h3>
      <div className="h-px flex-1 bg-border" />
    </div>
  )
}
