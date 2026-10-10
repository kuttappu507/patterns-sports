"use client"

// ============================================================
// PS-AMS :: Administration — executive committee CRUD with
// reorder, academy profile settings, and data safety (backup).
// ============================================================

import { useCallback, useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Plus,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  Loader2,
  DatabaseBackup,
  Download,
  Upload,
  FolderOpen,
  Building2,
  Phone,
  Mail,
  MapPin,
  Volleyball,
  MessageCircle,
  QrCode,
  Unlink,
  RefreshCw,
  Search,
  CheckCircle2,
  ArrowDownToLine,
  Rocket,
} from "lucide-react"
import {
  fetchCommittee,
  saveCommitteeMember,
  deleteCommitteeMember,
  reorderCommittee,
  fetchSettings,
  saveSettings,
  exportBackup,
  dataInfo,
  isTauri,
  mediaUrl,
  demoStatus,
  loadDemoData,
  removeDemoData,
  type DemoStatus as DemoStatusT,
  type DataLocationInfo,
} from "@/lib/psams/api"
import { COMMITTEE_ROLES, type CommitteeMember, type AcademySettings } from "@/lib/psams/types"
import { ACADEMY_MAPS_URL, phoneDigits, intOnly } from "@/lib/psams/domain"
import { APP_VERSION } from "@/lib/psams/version"
import { openExternal, useWaStore, renderQrDataUrl, type WaStatus } from "@/lib/psams/whatsapp"
import { useAppStore } from "@/lib/psams/store"
import { MediaUpload } from "@/components/psams/media-upload"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"

export function SettingsView() {
  return (
    <div className="grid grid-cols-1 gap-5 p-5 xl:grid-cols-[1fr_420px]">
      <CommitteeManager />
      <div className="space-y-5">
        <AcademyProfile />
        <WhatsAppCard />
        <UpdatesCard />
        <DataSafety />
        <DemoDataCard />
      </div>
    </div>
  )
}

/* ---------------- WhatsApp Linked Device ---------------- */

const WA_STATUS_META: Record<WaStatus, { label: string; tone: string }> = {
  unsupported: { label: "Desktop only", tone: "text-muted-foreground border-border bg-muted" },
  stopped: { label: "Not linked", tone: "text-muted-foreground border-border bg-muted" },
  starting: { label: "Starting…", tone: "text-sky-700 dark:text-sky-300 border-sky-500/30 bg-sky-500/10" },
  pairing: { label: "Connecting…", tone: "text-sky-700 dark:text-sky-300 border-sky-500/30 bg-sky-500/10" },
  waiting_scan: { label: "Waiting for scan", tone: "text-yellow-700 dark:text-yellow-300 border-yellow-500/40 bg-yellow-500/10" },
  connected: { label: "Linked", tone: "text-emerald-700 dark:text-emerald-300 border-emerald-500/30 bg-emerald-500/10" },
  reconnecting: { label: "Reconnecting…", tone: "text-amber-700 dark:text-amber-300 border-amber-500/40 bg-amber-500/10" },
  logged_out: { label: "Unlinked", tone: "text-rose-700 dark:text-rose-300 border-rose-500/30 bg-rose-500/10" },
}

function WhatsAppCard() {
  const { toast } = useToast()
  const { status, qr, me, connect, disconnect } = useWaStore()
  const [qrImg, setQrImg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    if (qr) {
      renderQrDataUrl(qr)
        .then((d) => {
          if (alive) setQrImg(d)
        })
        .catch(() => {})
    } else {
      setQrImg(null)
    }
    return () => {
      alive = false
    }
  }, [qr])

  async function link() {
    setBusy(true)
    try {
      await connect()
    } catch (e) {
      toast({ title: "Could not start WhatsApp bridge", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }

  async function unlink() {
    setBusy(true)
    try {
      await disconnect()
      toast({ title: "WhatsApp unlinked", description: "The paired device was removed from this computer and the saved session wiped." })
    } catch (e) {
      toast({ title: "Could not unlink", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }

  const meta = WA_STATUS_META[status]

  return (
    <div className="glass rounded-2xl p-4">
      <div className="mb-2 flex items-center gap-2">
        <MessageCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
        <span className="text-sm font-semibold">WhatsApp Linked Device</span>
        <span className={`ml-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.tone}`}>
          {status === "connected" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
          {meta.label}
        </span>
      </div>

      {status === "connected" ? (
        <>
          <p className="text-[15.5px] leading-relaxed text-muted-foreground">
            The academy WhatsApp is linked to this computer. Receipts and reminders now go out with a single click — straight from this app to the parent’s chat. No WhatsApp Web, no phone handling.
          </p>
          {me && (
            <p className="mt-1 text-[15.5px] font-medium">
              Linked number: <span className="font-semibold">+{me}</span>
            </p>
          )}
          <div className="mt-3">
            <Button size="sm" variant="outline" className="h-8 gap-1.5 border-rose-500/30 text-xs text-rose-600 hover:bg-rose-500/10 dark:text-rose-300" disabled={busy} onClick={unlink}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />} Unlink device
            </Button>
          </div>
        </>
      ) : status === "waiting_scan" && qrImg ? (
        <>
          <p className="text-[15.5px] leading-relaxed text-muted-foreground">
            On the academy phone open <b>WhatsApp → Settings → Linked devices → Link a device</b> and scan this code. One-time setup — afterwards the app reconnects silently on every launch.
          </p>
          <div className="mt-3 flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrImg} alt="WhatsApp pairing QR code" className="h-40 w-40 rounded-xl border-4 border-white shadow-md" />
            <div className="text-[12px] leading-relaxed text-muted-foreground">
              <p className="font-semibold text-foreground">QR refreshes automatically</p>
              <p className="mt-1">Each code is valid for a few seconds; a fresh one appears until the scan succeeds.</p>
            </div>
          </div>
        </>
      ) : status === "unsupported" ? (
        <p className="text-[15.5px] leading-relaxed text-muted-foreground">
          Linked-device sending works in the Windows desktop app. Link the device there once, and receipts will go out from the app itself — one click, no WhatsApp Web.
        </p>
      ) : (
        <>
          <p className="text-[15.5px] leading-relaxed text-muted-foreground">
            {status === "waiting_scan"
              ? "Generating pairing QR…"
              : status === "starting" || status === "pairing"
                ? "Connecting to WhatsApp…"
                : status === "reconnecting"
                  ? "Connection dropped — reconnecting automatically. The saved pairing survives."
                  : "Link the academy’s WhatsApp once — scan a QR with the academy phone — and after that every receipt and reminder goes out with a single click, straight from this app. No WhatsApp Web."}
          </p>
          {(status === "stopped" || status === "logged_out") && (
            <div className="mt-3">
              <Button size="sm" className="h-8 gap-1.5 bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-500" disabled={busy} onClick={link}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <QrCode className="h-3.5 w-3.5" />} {status === "logged_out" ? "Scan again to relink" : "Link a device (scan QR)"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ---------------- Committee ---------------- */

function CommitteeManager() {
  const [members, setMembers] = useState<CommitteeMember[]>([])
  const [loading, setLoading] = useState(true)
  const [dlgOpen, setDlgOpen] = useState(false)
  const [editing, setEditing] = useState<CommitteeMember | null>(null)
  const [deleting, setDeleting] = useState<CommitteeMember | null>(null)
  const { refresh } = useAppStore()
  const { toast } = useToast()

  const load = useCallback(async () => {
    try {
      setMembers(await fetchCommittee())
      setLoading(false)
    } catch (e) {
      setLoading(false)
      toast({ title: "Could not load committee", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" })
    }
  }, [toast])

  useEffect(() => {
    let alive = true
    fetchCommittee()
      .then((rows) => {
        if (!alive) return
        setMembers(rows)
        setLoading(false)
      })
      .catch((e) => {
        if (!alive) return
        setLoading(false)
        toast({ title: "Could not load committee", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" })
      })
    return () => {
      alive = false
    }
  }, [toast])

  async function move(index: number, dir: -1 | 1) {
    const next = [...members]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    const snapshot = members
    ;[next[index], next[target]] = [next[target], next[index]]
    setMembers(next)
    try {
      await reorderCommittee(next.map((m) => m.id))
      refresh()
    } catch (e) {
      setMembers(snapshot) // restore the on-screen order if the save failed
      toast({ title: "Reorder failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" })
    }
  }

  return (
    <div className="glass rounded-2xl">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <div className="text-sm font-semibold">Executive Committee</div>
          <div className="text-[15px] text-muted-foreground">Shown live on the dashboard — reorder, edit or remove members</div>
        </div>
        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => { setEditing(null); setDlgOpen(true) }}>
          <Plus className="h-3.5 w-3.5" /> Add member
        </Button>
      </div>
      <div className="p-3">
        {loading && <div className="py-10 text-center text-xs text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading…</div>}
        {!loading && members.length === 0 && (
          <div className="py-10 text-center text-xs text-muted-foreground">No committee members yet. Add the President, General Secretary and Treasurer to showcase them on the dashboard.</div>
        )}
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {members.map((m, i) => (
              <motion.div
                key={m.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="row-hover flex items-center gap-3 rounded-xl border border-border bg-card/60 px-3 py-2.5"
              >
                <div className="flex flex-col gap-0.5">
                  <Button size="icon" variant="ghost" className="h-5 w-6" disabled={i === 0} onClick={() => move(i, -1)}>
                    <ChevronUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-5 w-6" disabled={i === members.length - 1} onClick={() => move(i, 1)}>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full border bg-muted">
                  {m.photoPath ? (
                     
                    <img src={mediaUrl(m.photoPath)} alt={m.fullName} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-muted-foreground">{m.fullName.split(" ").map((w) => w[0]).slice(0, 2).join("")}</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-xs font-semibold">{m.fullName}</span>
                    <Badge variant="outline" className="rounded-full text-[15.5px]">{m.role}</Badge>
                  </div>
                  <div className="truncate text-[15px] text-muted-foreground">{m.phone}{m.responsibilities ? ` · ${m.responsibilities}` : ""}</div>
                </div>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditing(m); setDlgOpen(true) }}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleting(m)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      <CommitteeDialog open={dlgOpen} onClose={() => setDlgOpen(false)} editing={editing} onSaved={() => { load(); refresh() }} />
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleting?.fullName}?</AlertDialogTitle>
            <AlertDialogDescription>The member will no longer appear on the dashboard showcase.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-xs text-white hover:bg-destructive/90"
              onClick={async () => {
                try {
                  await deleteCommitteeMember(deleting!.id)
                  toast({ title: "Member removed" })
                  setDeleting(null)
                  load()
                  refresh()
                } catch (e) {
                  toast({ title: "Remove failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" })
                }
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function CommitteeDialog({ open, onClose, editing, onSaved }: { open: boolean; onClose: () => void; editing: CommitteeMember | null; onSaved: () => void }) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ fullName: "", role: "Executive Member", phone: "", responsibilities: "", photoPath: null as string | null })

  // Reset the form when the dialog opens (or the edited member changes) by
  // adjusting state during render — guarded comparison, no effect cascade.
  const [prevDialog, setPrevDialog] = useState({ open, editing })
  if (prevDialog.open !== open || prevDialog.editing !== editing) {
    setPrevDialog({ open, editing })
    if (open) {
      setForm({
        fullName: editing?.fullName || "",
        role: editing?.role || "Executive Member",
        phone: editing?.phone || "",
        responsibilities: editing?.responsibilities || "",
        photoPath: editing?.photoPath || null,
      })
    }
  }

  async function save() {
    if (!form.fullName.trim() || !form.phone.trim()) {
      toast({ title: "Name and phone are required", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      await saveCommitteeMember({
        id: editing?.id,
        fullName: form.fullName.trim(),
        role: form.role,
        phone: form.phone.trim(),
        responsibilities: form.responsibilities || null,
        photoPath: form.photoPath,
      })
      toast({ title: editing ? "Member updated" : "Member added", description: "Dashboard showcase is synced in real time." })
      onSaved()
      onClose()
    } catch (e) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">{editing ? "Edit Committee Member" : "Add Committee Member"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-4">
            <MediaUpload folder="photos" value={form.photoPath} onChange={(p) => setForm({ ...form, photoPath: p })} label="Portrait" previewShape="portrait" hint="Photo" />
            <div className="flex-1 space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Full name *</Label>
                <Input className="h-8 text-xs" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Designation</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{COMMITTEE_ROLES.map((r) => <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Phone number *</Label>
                <Input className="h-8 text-xs" inputMode="numeric" value={form.phone} onChange={(e) => setForm({ ...form, phone: phoneDigits(e.target.value) })} placeholder="10-digit number" />
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Responsibilities</Label>
            <Textarea className="min-h-[48px] text-xs" value={form.responsibilities} onChange={(e) => setForm({ ...form, responsibilities: e.target.value })} placeholder="e.g. Oversees tournament scheduling and venue management" />
          </div>
        </div>
        <DialogFooter>
          <Button size="sm" variant="ghost" className="text-xs" onClick={onClose}>Cancel</Button>
          <Button size="sm" className="text-xs" disabled={saving} onClick={save}>
            {saving && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />} Save member
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ---------------- Academy profile ---------------- */

function AcademyProfile() {
  const { toast } = useToast()
  const [settings, setSettings] = useState<AcademySettings | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    fetchSettings()
      .then((s) => {
        if (alive) setSettings(s)
      })
      .catch((e) => {
        if (alive) toast({ title: "Could not load academy profile", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" })
      })
    return () => {
      alive = false
    }
  }, [toast])

  if (!settings) return <div className="shimmer h-40 rounded-2xl" />

  function upd<K extends keyof AcademySettings>(k: K, v: AcademySettings[K]) {
    setSettings((s) => (s ? { ...s, [k]: v } : s))
  }

  async function save() {
    if (!settings) return
    setSaving(true)
    try {
      await saveSettings(settings)
      toast({ title: "Academy profile saved", description: "Receipts and reports now use the new details." })
    } catch (e) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="glass rounded-2xl p-4">
      <div className="mb-3 flex items-center gap-2">
        <Building2 className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Academy Profile</span>
        <span className="text-[15px] text-muted-foreground">— used on letterheads & receipts</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Academy name</Label>
          <Input className="h-8 text-xs" value={settings.academyName} onChange={(e) => upd("academyName", e.target.value)} />
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Tagline</Label>
          <Input className="h-8 text-xs" value={settings.tagline} onChange={(e) => upd("tagline", e.target.value)} />
        </div>
        <div className="col-span-2 space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-xs"><MapPin className="mr-1 inline h-3 w-3" />Address</Label>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-border bg-card/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              title="Open the academy location in Google Maps"
              onClick={() => {
                void openExternal(ACADEMY_MAPS_URL).catch(() => window.open(ACADEMY_MAPS_URL, "_blank", "noopener,noreferrer"))
              }}
            >
              <MapPin className="h-3 w-3 text-primary/80" /> Open in Google Maps
            </button>
          </div>
          <Textarea className="min-h-[44px] text-xs" value={settings.address} onChange={(e) => upd("address", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs"><Phone className="mr-1 inline h-3 w-3" />Phone</Label>
          <Input className="h-8 text-xs" inputMode="numeric" value={settings.phone} onChange={(e) => upd("phone", phoneDigits(e.target.value))} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs"><Mail className="mr-1 inline h-3 w-3" />Email</Label>
          <Input className="h-8 text-xs" value={settings.email} onChange={(e) => upd("email", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Default monthly fee (₹)</Label>
          <Input className="h-8 text-xs" inputMode="numeric" value={String(settings.defaultMonthlyFee)} onChange={(e) => {
            const digits = intOnly(e.target.value, 5)
            upd("defaultMonthlyFee", digits === "" ? 0 : Number(digits)) // never persist NaN
          }} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Receipt signatory</Label>
          <Input className="h-8 text-xs" value={settings.receiptSignatory} onChange={(e) => upd("receiptSignatory", e.target.value)} />
        </div>
      </div>
      <Button size="sm" className="mt-3 h-8 text-xs" disabled={saving} onClick={save}>
        {saving && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />} Save profile
      </Button>
    </div>
  )
}

/* ---------------- Demo data ---------------- */

function DemoDataCard() {
  const { toast } = useToast()
  const { refresh } = useAppStore()
  const [status, setStatus] = useState<DemoStatusT | null>(null)
  const [busy, setBusy] = useState<"load" | "remove" | null>(null)
  const [confirm, setConfirm] = useState<"load" | "remove" | null>(null)

  useEffect(() => {
    let alive = true
    demoStatus()
      .then((s) => {
        if (alive) setStatus(s)
      })
      .catch(() => {
        /* card degrades to hidden — non-critical */
      })
    return () => {
      alive = false
    }
  }, [])

  async function run(action: "load" | "remove") {
    setBusy(action)
    setConfirm(null)
    try {
      if (action === "load") {
        const res = await loadDemoData()
        toast({ title: "Demo data loaded", description: `${res.students} players, ${res.committee} committee members, fee history and attendance.` })
      } else {
        await removeDemoData()
        toast({ title: "Demo data removed", description: "All demo players and their records were deleted." })
      }
      setStatus(await demoStatus())
      refresh()
    } catch (e) {
      toast({ title: action === "load" ? "Could not load demo data" : "Could not remove demo data", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  if (!status) return null

  return (
    <>
      <div className="glass rounded-2xl p-4">
        <div className="mb-2 flex items-center gap-2">
          <Volleyball className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Demo Data</span>
          {status.loaded && (
            <Badge variant="outline" className="rounded-full text-[15px] text-emerald-700 dark:text-emerald-300">loaded · {status.students} players</Badge>
          )}
        </div>
        <p className="text-[15.5px] leading-relaxed text-muted-foreground">
          Populates a realistic sample academy — 12 players across all age categories, committee members, months of fee history with live defaulters, achievements and attendance. Great for exploring every module before real records exist.
        </p>
        <div className="mt-3 flex gap-2">
          {!status.loaded ? (
            <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={busy !== null} onClick={() => setConfirm("load")}>
              {busy === "load" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Volleyball className="h-3.5 w-3.5" />} Load demo data
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="h-8 gap-1.5 border-rose-500/30 text-xs text-rose-600 hover:bg-rose-500/10 dark:text-rose-300" disabled={busy !== null} onClick={() => setConfirm("remove")}>
              {busy === "remove" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Remove demo data
            </Button>
          )}
        </div>
      </div>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "load" ? "Load demo data?" : "Remove demo data?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "load"
                ? status.students > 0
                  ? `The database already has ${status.students} student record(s). Demo players will be added alongside them with new admission numbers and receipts.`
                  : "12 sample players, committee members, fee history, achievements and attendance will be created. You can remove them anytime."
                : "Every demo player and their fee payments, attendance and achievements will be permanently deleted. Records you created yourself are not touched."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={`${confirm === "remove" ? "bg-destructive" : "bg-primary"} text-xs text-white hover:bg-destructive/90`}
              onClick={() => confirm && run(confirm)}
            >
              {confirm === "load" ? "Load demo data" : "Remove demo data"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/* ---------------- Updates ---------------- */

interface ReleaseInfo {
  current: string
  available: boolean
  tag: string
  name: string
  notes: string
  published_at: string
  asset_name: string
  asset_url: string
  asset_size: number
}

function UpdatesCard() {
  const { toast } = useToast()
  const desktop = isTauri()
  const [checking, setChecking] = useState(false)
  const [info, setInfo] = useState<ReleaseInfo | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState<{ received: number; total: number } | null>(null)
  const [installerPath, setInstallerPath] = useState<string | null>(null)

  // listen to download progress emitted by the Rust side
  useEffect(() => {
    if (!desktop) return
    let stop: (() => void) | null = null
    void (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event")
        const un = await listen<{ received: number; total: number }>("update://progress", (e) => {
          setProgress(e.payload)
        })
        stop = un
      } catch {
        /* progress simply won't stream */
      }
    })()
    return () => {
      stop?.()
    }
  }, [desktop])

  async function check() {
    setChecking(true)
    setInfo(null)
    setInstallerPath(null)
    setProgress(null)
    try {
      const { invoke } = await import("@tauri-apps/api/core")
      const res = await invoke<ReleaseInfo>("check_update")
      setInfo(res)
    } catch (e) {
      toast({ title: "Update check failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" })
    } finally {
      setChecking(false)
    }
  }

  async function download() {
    if (!info?.asset_url || !info?.asset_name) return
    setDownloading(true)
    setProgress({ received: 0, total: info.asset_size || 0 })
    try {
      const { invoke } = await import("@tauri-apps/api/core")
      const path = await invoke<string>("download_update", { url: info.asset_url, name: info.asset_name })
      setInstallerPath(path)
      toast({ title: "Installer downloaded", description: path })
    } catch (e) {
      toast({ title: "Download failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" })
    } finally {
      setDownloading(false)
    }
  }

  async function install() {
    if (!installerPath) return
    try {
      const { invoke } = await import("@tauri-apps/api/core")
      const msg = await invoke<string>("install_update", { path: installerPath })
      toast({ title: "Update starting", description: msg })
    } catch (e) {
      toast({ title: "Could not launch the installer", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" })
    }
  }

  const pct = progress && progress.total > 0 ? Math.min(100, Math.round((progress.received / progress.total) * 100)) : null

  return (
    <div className="glass rounded-2xl p-4">
      <div className="mb-2 flex items-center gap-2">
        <RefreshCw className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Updates</span>
      </div>
      {desktop ? (
        <>
          <p className="text-[15.5px] leading-relaxed text-muted-foreground">
            Running <b className="text-foreground">v{APP_VERSION}</b>. Check the academy&apos;s GitHub releases for a newer version — if one exists you can download the official installer and update without leaving the app.
          </p>
          {!info && (
            <Button size="sm" className="mt-3 h-8 gap-1.5 text-xs" disabled={checking} onClick={check}>
              {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />} Check for updates
            </Button>
          )}
          {info && !info.available && (
            <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
              You are on the latest release{info.tag ? ` (v${info.tag.replace(/^v/, "")})` : ""} — nothing to update.
            </div>
          )}
          {info?.available && (
            <div className="mt-3 space-y-2 rounded-lg border border-primary/30 bg-primary/[0.06] p-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <ArrowDownToLine className="h-3.5 w-3.5 text-primary" />
                PS-AMS v{info.tag.replace(/^v/, "")} is available — you are on v{info.current}
              </div>
              {info.notes && (
                <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-md border bg-card/70 p-2 text-[11.5px] leading-relaxed text-muted-foreground">{info.notes.slice(0, 2000)}</pre>
              )}
              {!installerPath ? (
                <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={downloading} onClick={download}>
                  {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  {downloading ? (pct !== null ? `Downloading… ${pct}%` : "Downloading…") : "Download update"}
                </Button>
              ) : (
                <div className="space-y-1.5">
                  <Button size="sm" className="h-8 gap-1.5 bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-500" onClick={install}>
                    <Rocket className="h-3.5 w-3.5" /> Run installer
                  </Button>
                  <div className="break-all font-mono text-[10.5px] text-muted-foreground">{installerPath}</div>
                  <div className="text-[11px] text-muted-foreground">The installer closes PS-AMS when it needs to — reopen the app after it finishes.</div>
                </div>
              )}
              {downloading && pct !== null && (
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <p className="text-[15.5px] leading-relaxed text-muted-foreground">
          Running the web preview (v{APP_VERSION}). Updates ship with the desktop app — it checks GitHub releases right from this screen.
        </p>
      )}
    </div>
  )
}

/* ---------------- Data safety ---------------- */

function DataSafety() {
  const { toast } = useToast()
  const [busy, setBusy] = useState<null | "db" | "json" | "restore" | "target">(null)
  const [paths, setPaths] = useState<DataLocationInfo | null>(null)
  const [restorePath, setRestorePath] = useState<string | null>(null)
  const [restartAsk, setRestartAsk] = useState(false)
  const desktop = isTauri()

  useEffect(() => {
    let alive = true
    dataInfo()
      .then((p) => {
        if (alive) setPaths(p)
      })
      .catch(() => {
        /* the location box simply stays generic */
      })
    return () => {
      alive = false
    }
  }, [])

  // DESKTOP — the real database backup: copies ps-ams.db (with WAL sidecars)
  // and the whole media tree via the Rust `backup_now` command, then names
  // the folder it wrote.
  async function backupNow() {
    setBusy("db")
    try {
      const { invoke } = await import("@tauri-apps/api/core")
      const folder = await invoke<string>("backup_now")
      toast({
        title: "Database backup written",
        description: `A full copy of ps-ams.db and the media library was written to ${folder}`,
      })
    } catch (e) {
      toast({ title: "Backup failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  // JSON snapshot (both runtimes) — on desktop the success toast fires only
  // after the file was REALLY written; cancelling the save dialog never
  // claims success (and no second browser download fires).
  async function downloadSnapshot() {
    setBusy("json")
    try {
      const { blob, savedPath } = await exportBackup()
      if (desktop) {
        if (savedPath) {
          toast({ title: "JSON snapshot saved", description: savedPath })
        } else {
          toast({ title: "Snapshot not saved", description: "The save dialog was closed without choosing a file." })
        }
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `PS-AMS-snapshot-${new Date().toISOString().slice(0, 10)}.json`
        a.click()
        URL.revokeObjectURL(url)
        toast({ title: "JSON snapshot download started", description: "Check your downloads folder — this is a data snapshot, not the database file." })
      }
    } catch (e) {
      toast({ title: "Snapshot failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  async function pickRestoreFile() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog")
      const sel = await open({
        multiple: false,
        title: "Choose a PS-AMS database backup",
        filters: [{ name: "PS-AMS database backup", extensions: ["db", "sqlite", "db3"] }],
      })
      if (typeof sel === "string") setRestorePath(sel)
    } catch (e) {
      toast({ title: "Could not open the file picker", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" })
    }
  }

  async function confirmRestore() {
    const source = restorePath
    setRestorePath(null)
    if (!source) return
    setBusy("restore")
    try {
      const { invoke } = await import("@tauri-apps/api/core")
      await invoke("restore_backup", { source })
      setRestartAsk(true)
    } catch (e) {
      toast({ title: "Restore failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  async function restartNow() {
    try {
      const { invoke } = await import("@tauri-apps/api/core")
      await invoke("restart_app")
    } catch {
      /* the webview dies mid-restart — nothing to handle */
    }
  }

  async function pickBackupTarget() {
    setBusy("target")
    try {
      const { open } = await import("@tauri-apps/plugin-dialog")
      const dir = await open({ directory: true, title: "Choose the backup folder (e.g. a USB drive)" })
      if (typeof dir !== "string") return
      const { invoke } = await import("@tauri-apps/api/core")
      const msg = await invoke<string>("set_backup_target", { path: dir })
      toast({ title: "Backup folder set", description: msg })
      setPaths(await dataInfo())
    } catch (e) {
      toast({ title: "Could not set the backup folder", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  async function resetBackupTarget() {
    setBusy("target")
    try {
      const { invoke } = await import("@tauri-apps/api/core")
      const msg = await invoke<string>("set_backup_target", { path: null })
      toast({ title: "Backup folder reset", description: msg })
      setPaths(await dataInfo())
    } catch (e) {
      toast({ title: "Could not reset the backup folder", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  const targetIsExternal = !!paths && paths.backupTarget !== paths.backup

  return (
    <div className="glass rounded-2xl p-4">
      <div className="mb-2 flex items-center gap-2">
        <DatabaseBackup className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Data Safety</span>
      </div>
      <p className="text-[15.5px] leading-relaxed text-muted-foreground">
        {desktop
          ? "The active SQLite database and the media directory are backed up automatically every time the desktop app exits — into the folder below, or onto a remembered USB drive. Backup now writes that same full copy immediately."
          : "Download a JSON snapshot of every record for archiving. The full database backup (database file + media) is a desktop-app feature."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {desktop && (
          <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={busy !== null} onClick={backupNow}>
            {busy === "db" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DatabaseBackup className="h-3.5 w-3.5" />} Backup now
          </Button>
        )}
        <Button size="sm" variant="outline" className="h-8 gap-1.5 border-border bg-card text-xs hover:bg-muted" disabled={busy !== null} onClick={downloadSnapshot}>
          {busy === "json" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Download JSON snapshot
        </Button>
        {desktop && (
          <>
            <Button size="sm" variant="outline" className="h-8 gap-1.5 border-border bg-card text-xs hover:bg-muted" disabled={busy !== null} onClick={pickRestoreFile}>
              {busy === "restore" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Restore from backup…
            </Button>
            <Button size="sm" variant="outline" className="h-8 gap-1.5 border-border bg-card text-xs hover:bg-muted" disabled={busy !== null} onClick={pickBackupTarget} title="Choose where automatic and manual backups are written">
              {busy === "target" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderOpen className="h-3.5 w-3.5" />} Backup folder…
            </Button>
            {targetIsExternal && (
              <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-muted-foreground" disabled={busy !== null} onClick={resetBackupTarget}>
                Use default folder
              </Button>
            )}
          </>
        )}
      </div>
      <div className="mt-3 space-y-0.5 rounded-lg border bg-muted/40 p-2.5 text-[14.5px] text-muted-foreground">
        {paths ? (
          paths.mode === "desktop" ? (
            <>
              <div>Data folder: <span className="font-mono">{paths.appData}</span></div>
              <div>Database: <span className="font-mono">{paths.database}</span></div>
              <div>Media: <span className="font-mono">{paths.media}</span></div>
              <div>Backups → <span className="font-mono">{paths.backupTarget}</span></div>
              {paths.logFile && <div>Boot log: <span className="font-mono">{paths.logFile}</span></div>}
            </>
          ) : (
            <div>Web preview database: <span className="font-mono">{paths.database}</span> — desktop builds store data in the app data folder instead.</div>
          )
        ) : (
          <div>Resolving the data location…</div>
        )}
      </div>

      {/* restore confirmation */}
      <AlertDialog open={!!restorePath} onOpenChange={(o) => !o && setRestorePath(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore the database from this backup?</AlertDialogTitle>
            <AlertDialogDescription>
              {restorePath}
              {"\n"}
              The current database will be REPLACED by the selected file the next time the app starts (a safety copy is kept as ps-ams.pre-restore.db). JSON snapshots cannot be restored here — choose a ps-ams-*.db backup written by this app.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-xs text-white hover:bg-destructive/90" onClick={confirmRestore}>
              Stage restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* restart prompt after a staged restore */}
      <AlertDialog open={restartAsk} onOpenChange={setRestartAsk}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore staged</AlertDialogTitle>
            <AlertDialogDescription>
              The backup will replace the active database the next time the app starts. Restart now to apply it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs">Later</AlertDialogCancel>
            <AlertDialogAction className="bg-primary text-xs text-white hover:bg-primary/90" onClick={restartNow}>
              Restart now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
