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
  Building2,
  Phone,
  Mail,
  MapPin,
} from "lucide-react"
import {
  fetchCommittee,
  saveCommitteeMember,
  deleteCommitteeMember,
  reorderCommittee,
  fetchSettings,
  saveSettings,
  exportBackup,
  mediaUrl,
} from "@/lib/psams/api"
import { COMMITTEE_ROLES, type CommitteeMember, type AcademySettings } from "@/lib/psams/types"
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
        <DataSafety />
      </div>
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
    setMembers(await fetchCommittee())
    setLoading(false)
  }, [])

  useEffect(() => {
    let alive = true
    fetchCommittee().then((rows) => {
      if (!alive) return
      setMembers(rows)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [])

  async function move(index: number, dir: -1 | 1) {
    const next = [...members]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setMembers(next)
    await reorderCommittee(next.map((m) => m.id))
    refresh()
  }

  return (
    <div className="rounded-xl border bg-white/70 backdrop-blur">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <div className="text-sm font-semibold">Executive Committee</div>
          <div className="text-[11px] text-muted-foreground">Shown live on the dashboard — reorder, edit or remove members</div>
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
                className="flex items-center gap-3 rounded-lg border bg-white/80 px-3 py-2.5"
              >
                <div className="flex flex-col gap-0.5">
                  <Button size="icon" variant="ghost" className="h-5 w-6" disabled={i === 0} onClick={() => move(i, -1)}>
                    <ChevronUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-5 w-6" disabled={i === members.length - 1} onClick={() => move(i, 1)}>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full border bg-secondary">
                  {m.photoPath ? (
                     
                    <img src={mediaUrl(m.photoPath)} alt={m.fullName} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-muted-foreground">{m.fullName.split(" ").map((w) => w[0]).slice(0, 2).join("")}</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-xs font-semibold">{m.fullName}</span>
                    <Badge variant="outline" className="rounded-full text-[10px]">{m.role}</Badge>
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">{m.phone}{m.responsibilities ? ` · ${m.responsibilities}` : ""}</div>
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
                await deleteCommitteeMember(deleting!.id)
                toast({ title: "Member removed" })
                setDeleting(null)
                load()
                refresh()
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

  useEffect(() => {
    if (open) {
      setForm({
        fullName: editing?.fullName || "",
        role: editing?.role || "Executive Member",
        phone: editing?.phone || "",
        responsibilities: editing?.responsibilities || "",
        photoPath: editing?.photoPath || null,
      })
    }
  }, [open, editing])

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
                <Input className="h-8 text-xs" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
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
    fetchSettings().then(setSettings)
  }, [])

  if (!settings) return <div className="h-40 animate-pulse rounded-xl border bg-white/50" />

  function upd<K extends keyof AcademySettings>(k: K, v: AcademySettings[K]) {
    setSettings((s) => (s ? { ...s, [k]: v } : s))
  }

  async function save() {
    if (!settings) return
    setSaving(true)
    try {
      await saveSettings(settings)
      toast({ title: "Academy profile saved", description: "Receipts and reports now use the new details." })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border bg-white/70 p-4 backdrop-blur">
      <div className="mb-3 flex items-center gap-2">
        <Building2 className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Academy Profile</span>
        <span className="text-[11px] text-muted-foreground">— used on letterheads & receipts</span>
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
          <Label className="text-xs"><MapPin className="mr-1 inline h-3 w-3" />Address</Label>
          <Textarea className="min-h-[44px] text-xs" value={settings.address} onChange={(e) => upd("address", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs"><Phone className="mr-1 inline h-3 w-3" />Phone</Label>
          <Input className="h-8 text-xs" value={settings.phone} onChange={(e) => upd("phone", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs"><Mail className="mr-1 inline h-3 w-3" />Email</Label>
          <Input className="h-8 text-xs" value={settings.email} onChange={(e) => upd("email", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Default monthly fee (₹)</Label>
          <Input className="h-8 text-xs" type="number" min="0" value={settings.defaultMonthlyFee} onChange={(e) => upd("defaultMonthlyFee", Number(e.target.value))} />
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

/* ---------------- Data safety ---------------- */

function DataSafety() {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)

  async function downloadBackup() {
    setBusy(true)
    try {
      const blob = await exportBackup()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `PS-AMS-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast({ title: "Backup downloaded", description: "Store it on a USB drive or cloud folder for redundancy." })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border bg-white/70 p-4 backdrop-blur">
      <div className="mb-2 flex items-center gap-2">
        <DatabaseBackup className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Data Safety</span>
      </div>
      <p className="text-[11.5px] leading-relaxed text-muted-foreground">
        The active SQLite database and the media directory are backed up automatically when the desktop app exits (USB target configurable in the Tauri shell). You can also snapshot a portable JSON backup right now:
      </p>
      <div className="mt-3 flex gap-2">
        <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={busy} onClick={downloadBackup}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Backup now
        </Button>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 bg-white/70 text-xs" onClick={() => toast({ title: "Restore from backup", description: "Use the restore command in the Tauri shell or copy the backup file into the database folder while the app is closed." })}>
          <Upload className="h-3.5 w-3.5" /> Restore guide
        </Button>
      </div>
      <div className="mt-3 rounded-lg border bg-secondary/40 p-2.5 text-[10.5px] text-muted-foreground">
        Windows data location: <span className="font-mono">%APPDATA%\PS-AMS\</span> — database <span className="font-mono">ps-ams.db</span>, media in <span className="font-mono">media\</span>.
      </div>
    </div>
  )
}
