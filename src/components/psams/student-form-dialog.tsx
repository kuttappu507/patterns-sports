"use client"

// ============================================================
// PS-AMS :: Player register / edit — centered POPUP dialog.
// Globally mounted once (see app page) and driven by the app
// store, so "Add New Player" works from the sidebar header, the
// dashboard hero, the roster toolbar and the profile page.
// Live age + BMI computation, sectioned form, field validation.
// ============================================================

import { useMemo, useState } from "react"
import { Loader2, Sparkles } from "lucide-react"
import { createStudent, updateStudent, fetchSettings } from "@/lib/psams/api"
import {
  AGE_CATEGORIES,
  BLOOD_GROUPS,
  GENDERS,
  SPORTS,
  SPORT_POSITIONS,
  TRAINING_BATCHES,
} from "@/lib/psams/types"
import { computeAge, suggestAgeCategory, computeBMI, bmiBand, ageDetailed, phoneDigits, intOnly, decimalOnly } from "@/lib/psams/domain"
import { useAppStore } from "@/lib/psams/store"
import { MediaUpload } from "@/components/psams/media-upload"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"

export function StudentFormDialog() {
  const open = useAppStore((s) => s.studentFormOpen)
  const editing = useAppStore((s) => s.studentFormEditing)
  const onClose = useAppStore((s) => s.closeStudentForm)
  const refresh = useAppStore((s) => s.refresh)
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
    gender: "",
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
    monthlyFee: "",
    photoPath: null as string | null,
    birthCertPath: null as string | null,
    idCardPath: null as string | null,
    status: "Active",
  }

  type FormState = typeof blank

  const [form, setForm] = useState<FormState>(blank)
  // ---- security / UX guard: never lose a half-filled registration ----
  // Snapshot of the form as it stood when the dialog (re)opened. Any drift
  // from it marks the dialog dirty, and a close attempt then asks for
  // confirmation instead of silently discarding the typed data.
  const [baseline, setBaseline] = useState<FormState>(blank)
  const [confirmClose, setConfirmClose] = useState(false)
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(baseline), [form, baseline])

  // Reset the form when the dialog opens (or the edited student changes).
  // Adjusting state during render (guarded by the previous values) instead
  // of in an effect: no post-paint flash of the previous form content.
  const [prevOpenState, setPrevOpenState] = useState({ open, editing })
  if (prevOpenState.open !== open || prevOpenState.editing !== editing) {
    setPrevOpenState({ open, editing })
    if (open) {
      setConfirmClose(false)
      if (editing) {
        const populated: FormState = {
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
          gender: editing.gender || "",
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
        }
        setForm(populated)
        setBaseline(populated)
      } else {
        const fresh = { ...blank, monthlyFee: "" }
        setForm(fresh)
        setBaseline(fresh)
        // prefill the suggested monthly fee from the academy profile —
        // the baseline is pre-filled too so the dialog does not turn "dirty"
        // merely because the suggestion arrived
        fetchSettings()
          .then((st) => {
            const fee = String(st.defaultMonthlyFee ?? 500)
            setForm((f) => (f.monthlyFee === "" ? { ...f, monthlyFee: fee } : f))
            setBaseline((b) => (b.monthlyFee === "" ? { ...b, monthlyFee: fee } : b))
          })
          .catch(() => {
            const fee = "500"
            setForm((f) => (f.monthlyFee === "" ? { ...f, monthlyFee: fee } : f))
            setBaseline((b) => (b.monthlyFee === "" ? { ...b, monthlyFee: fee } : b))
          })
      }
    }
  }

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
    // — field-level sanity guards (mirror the server rules) —
    const dob = new Date(form.dateOfBirth)
    if (Number.isNaN(dob.getTime()) || dob > new Date()) {
      toast({ title: "Invalid date of birth", description: "The date of birth cannot be in the future.", variant: "destructive" })
      return
    }
    const digits = form.mobile.replace(/\D/g, "")
    const mobileOk = digits.length === 10
    if (!mobileOk) {
      toast({ title: "Invalid mobile number", description: "Enter the 10-digit mobile number — the field blocks every extra digit or letter.", variant: "destructive" })
      return
    }
    const fee = Number(form.monthlyFee)
    if (!Number.isFinite(fee) || fee < 0) {
      toast({ title: "Invalid monthly fee", description: "The monthly fee cannot be negative.", variant: "destructive" })
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
        gender: form.gender || "",
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
      refresh()
      onClose()
    } catch (e) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  /** Close attempt: dirty forms ask before discarding (security guard). */
  function requestClose() {
    if (dirty && !saving) {
      setConfirmClose(true)
      return
    }
    onClose()
  }

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => !o && requestClose()}>
      <DialogContent
        className="flex max-h-[92vh] w-[min(58rem,calc(100vw-2rem))] flex-col overflow-hidden gap-0 rounded-2xl border-border p-0 sm:max-w-[min(58rem,calc(100vw-2rem))]"
      >
        {/* header */}
        <DialogHeader className="border-b px-5 py-3.5">
          <DialogTitle className="text-sm font-semibold">
            {editing ? `Edit Player — ${editing.fullName}` : "Register New Player"}
          </DialogTitle>
          <DialogDescription className="text-[15px]">
            {editing ? editing.admissionNo : "Admission number will be generated automatically on save"}
          </DialogDescription>
        </DialogHeader>

        {/* scrollable body */}
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
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
              <Input
                className="h-8 text-xs"
                inputMode="numeric"
                value={form.mobile}
                onChange={(e) => set("mobile", phoneDigits(e.target.value))}
                placeholder="10-digit number"
                maxLength={13}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Emergency contact</Label>
              <Input
                className="h-8 text-xs"
                inputMode="numeric"
                value={form.emergencyContact}
                onChange={(e) => set("emergencyContact", phoneDigits(e.target.value))}
                placeholder="10-digit number"
                maxLength={13}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Blood group</Label>
              <Select value={form.bloodGroup} onValueChange={(v) => set("bloodGroup", v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{BLOOD_GROUPS.map((b) => <SelectItem key={b} value={b} className="text-xs">{b}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Gender</Label>
              <Select value={form.gender} onValueChange={(v) => set("gender", v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {GENDERS.map((g) => <SelectItem key={g} value={g} className="text-xs">{g}</SelectItem>)}
                </SelectContent>
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
              <Input className="h-8 text-xs" inputMode="numeric" value={form.heightCm} onChange={(e) => set("heightCm", intOnly(e.target.value, 3))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Weight (kg)</Label>
              <Input className="h-8 text-xs" inputMode="decimal" value={form.weightKg} onChange={(e) => set("weightKg", decimalOnly(e.target.value, 3))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">BMI — auto</Label>
              <div className="flex h-8 items-center justify-between rounded-md border bg-muted px-2.5 text-xs">
                <span className={`font-bold tabular-nums ${band.color}`}>{bmi !== null ? bmi.toFixed(1) : "—"}</span>
                <span className="text-[15.5px] text-muted-foreground">{band.label}</span>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Standing reach (cm)</Label>
              <Input className="h-8 text-xs" inputMode="numeric" value={form.standingReachCm} onChange={(e) => set("standingReachCm", intOnly(e.target.value, 3))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Spike reach (cm)</Label>
              <Input className="h-8 text-xs" inputMode="numeric" value={form.spikeReachCm} onChange={(e) => set("spikeReachCm", intOnly(e.target.value, 3))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Jump reach (cm)</Label>
              <Input className="h-8 text-xs" inputMode="numeric" value={form.jumpReachCm} onChange={(e) => set("jumpReachCm", intOnly(e.target.value, 3))} />
            </div>
            {jumpGain !== null && jumpGain > 0 && (
              <div className="col-span-3 rounded-md bg-emerald-500/10 px-3 py-1.5 text-[15px] text-emerald-700 dark:text-emerald-300">
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
              <Input className="h-8 text-xs" inputMode="numeric" value={form.monthlyFee} onChange={(e) => set("monthlyFee", intOnly(e.target.value, 5))} placeholder="e.g. 500" />
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
          <p className="pb-1 text-[15px] text-muted-foreground">
            Files are stored on the local application data disk — the database keeps only sanitized relative paths.
          </p>
        </div>

        {/* footer */}
        <div className="flex items-center gap-2 border-t bg-card/60 px-5 py-3">
          <Button onClick={save} disabled={saving} className="h-9 gap-1.5 text-xs">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {editing ? "Save changes" : "Register student"}
          </Button>
          <Button variant="ghost" className="h-9 text-xs" onClick={requestClose}>Cancel</Button>
          <span className="ml-auto text-[15px] text-muted-foreground">* required fields</span>
        </div>
      </DialogContent>
    </Dialog>

    {/* unsaved-changes confirmation — a mis-tap on Esc / overlay / Cancel
        must never silently throw away a half-filled player record */}
    <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
          <AlertDialogDescription>
            The player form has been edited but not saved. Closing now will lose every change typed since the dialog opened.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep editing</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={() => {
              setConfirmClose(false)
              onClose()
            }}
          >
            Discard changes
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <h3 className="text-[15px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</h3>
      <div className="h-px flex-1 bg-border" />
    </div>
  )
}
