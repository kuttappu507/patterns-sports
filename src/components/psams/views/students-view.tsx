"use client"

import { useCallback, useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Search, UserPlus, Phone, GraduationCap, Eye, Pencil, Trash2, Ruler, Loader2 } from "lucide-react"
import { fetchStudents, deleteStudent, mediaUrl } from "@/lib/psams/api"
import { CATEGORY_COLORS, computeAge, formatINR } from "@/lib/psams/domain"
import type { Student } from "@/lib/psams/types"
import { useAppStore } from "@/lib/psams/store"
import { StudentDrawer } from "@/components/psams/student-drawer"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"

const AGE_CATEGORIES = ["Mini", "Sub-Junior", "Junior", "Youth", "Senior"]

export function StudentsView() {
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState("")
  const [category, setCategory] = useState("all")
  const [status, setStatus] = useState("Active")
  const [batch, setBatch] = useState("all")
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<Student | null>(null)
  const [deleting, setDeleting] = useState<Student | null>(null)
  const { navigate, refresh, dataVersion } = useAppStore()
  const { toast } = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await fetchStudents({
        q,
        category: category === "all" ? undefined : category,
        status: status === "all" ? undefined : status,
        batch: batch === "all" ? undefined : batch,
      })
      setStudents(rows)
    } finally {
      setLoading(false)
    }
  }, [q, category, status, batch])

  useEffect(() => {
    const t = setTimeout(load, 180) // debounced live search
    return () => clearTimeout(t)
  }, [load, dataVersion])

  async function confirmDelete() {
    if (!deleting) return
    await deleteStudent(deleting.id)
    toast({ title: "Student removed", description: `${deleting.fullName} and all linked records were deleted.` })
    setDeleting(null)
    refresh()
  }

  return (
    <div className="flex h-full flex-col p-5">
      {/* toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 bg-white/70 pl-8 text-xs"
            placeholder="Search name, admission no. or parent mobile…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-8 w-[140px] bg-white/70 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All categories</SelectItem>
            {AGE_CATEGORIES.map((c) => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={batch} onValueChange={setBatch}>
          <SelectTrigger className="h-8 w-[130px] bg-white/70 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All batches</SelectItem>
            <SelectItem value="Morning" className="text-xs">Morning</SelectItem>
            <SelectItem value="Evening" className="text-xs">Evening</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-8 w-[120px] bg-white/70 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["Active", "Inactive", "Alumni", "all"].map((s) => (
              <SelectItem key={s} value={s} className="text-xs">{s === "all" ? "All statuses" : s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{students.length} record{students.length === 1 ? "" : "s"}</span>
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => {
              setEditing(null)
              setDrawerOpen(true)
            }}
          >
            <UserPlus className="h-3.5 w-3.5" /> Register Student
          </Button>
        </div>
      </div>

      {/* table */}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border bg-white/70 backdrop-blur">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 z-10 border-b bg-secondary/90 text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
            <tr>
              <th className="px-4 py-2.5 font-medium">Student</th>
              <th className="px-3 py-2.5 font-medium">Category</th>
              <th className="px-3 py-2.5 font-medium">Age</th>
              <th className="px-3 py-2.5 font-medium">Sport / Position</th>
              <th className="hidden px-3 py-2.5 font-medium lg:table-cell">Height</th>
              <th className="hidden px-3 py-2.5 font-medium xl:table-cell">School</th>
              <th className="hidden px-3 py-2.5 font-medium xl:table-cell">Monthly fee</th>
              <th className="px-3 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="py-10 text-center text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading roster…</td></tr>
            )}
            {!loading && students.length === 0 && (
              <tr><td colSpan={8} className="py-12 text-center text-muted-foreground">No students match the current filters.</td></tr>
            )}
            <AnimatePresence initial={false}>
              {students.map((s) => (
                <motion.tr
                  key={s.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="border-b/60 border-b border-border/50 transition-colors hover:bg-accent/40"
                >
                  <td className="px-4 py-2.5">
                    <button className="flex items-center gap-2.5 text-left" onClick={() => navigate("student-detail", s.id)}>
                      <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full border bg-secondary">
                        {s.photoPath ? (
                           
                          <img src={mediaUrl(s.photoPath)} alt={s.fullName} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-muted-foreground">
                            {s.fullName.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-foreground">{s.fullName}</div>
                        <div className="text-[10.5px] text-muted-foreground">{s.admissionNo} · {s.mobile}</div>
                      </div>
                    </button>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full border px-2 py-0.5 text-[10.5px] font-medium ${CATEGORY_COLORS[s.ageCategory] || ""}`}>{s.ageCategory}</span>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{computeAge(s.dateOfBirth)} yrs</td>
                  <td className="px-3 py-2.5">
                    <div>{s.primarySport}</div>
                    <div className="text-[10.5px] text-muted-foreground">{s.playingPosition || "—"}</div>
                  </td>
                  <td className="hidden px-3 py-2.5 tabular-nums lg:table-cell">{s.heightCm ? `${s.heightCm} cm` : "—"}</td>
                  <td className="hidden max-w-[160px] truncate px-3 py-2.5 xl:table-cell">
                    {s.schoolName ? (
                      <span className="inline-flex items-center gap-1"><GraduationCap className="h-3 w-3 text-muted-foreground" />{s.schoolName}</span>
                    ) : "—"}
                  </td>
                  <td className="hidden px-3 py-2.5 tabular-nums xl:table-cell">{formatINR(s.monthlyFee)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Open profile" onClick={() => navigate("student-detail", s.id)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Edit" onClick={() => { setEditing(s); setDrawerOpen(true) }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" title="Delete" onClick={() => setDeleting(s)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      <StudentDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        editing={editing}
        onSaved={() => refresh()}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleting?.fullName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the student along with achievements, payment history and attendance records. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-xs text-white hover:bg-destructive/90" onClick={confirmDelete}>
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
