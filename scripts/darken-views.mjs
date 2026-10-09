// One-shot dark-theme class migration for PS-AMS views.
// Maps light-theme utility classes to the "Dark Court" equivalents.
// Excludes print surfaces (they must stay paper-white).
import fs from "node:fs"

const FILES = [
  "src/components/psams/views/fees-view.tsx",
  "src/components/psams/views/student-detail-view.tsx",
  "src/components/psams/views/reports-view.tsx",
  "src/components/psams/views/attendance-view.tsx",
  "src/components/psams/views/settings-view.tsx",
  "src/components/psams/student-drawer.tsx",
  "src/components/psams/media-upload.tsx",
]

// ordered replacements — order matters
const RULES = [
  // solid sticky headers -> dark opaque
  [/bg-secondary\/90/g, "bg-[#0b0f18]/95"],
  [/bg-secondary\/70/g, "bg-white/[0.03]"],
  [/bg-secondary\/60/g, "bg-white/[0.03]"],
  [/bg-secondary\/50/g, "bg-white/[0.05]"],
  [/bg-secondary\/40/g, "bg-white/[0.04]"],
  [/bg-secondary(?![/\w-])/g, "bg-white/[0.05]"],
  // tinted chips / badges -> dark tints
  [/bg-emerald-100/g, "bg-emerald-400/10"],
  [/bg-emerald-50/g, "bg-emerald-400/10"],
  [/text-emerald-700/g, "text-emerald-300"],
  [/text-emerald-600/g, "text-emerald-300"],
  [/bg-rose-100/g, "bg-rose-400/10"],
  [/bg-rose-50/g, "bg-rose-400/10"],
  [/text-rose-700/g, "text-rose-300"],
  [/text-rose-600(?![\w-])/g, "text-rose-300"],
  [/bg-amber-100/g, "bg-amber-400/10"],
  [/bg-amber-50/g, "bg-amber-400/10"],
  [/text-amber-800/g, "text-amber-300"],
  [/text-amber-700/g, "text-amber-300"],
  [/bg-sky-100/g, "bg-sky-400/10"],
  [/text-sky-700/g, "text-sky-300"],
  [/bg-violet-100/g, "bg-violet-400/10"],
  [/text-violet-700/g, "text-violet-300"],
  [/bg-lime-100/g, "bg-lime-400/10"],
  [/text-lime-700/g, "text-lime-300"],
  // light borders -> tinted dark borders
  [/border-emerald-200/g, "border-emerald-400/25"],
  [/border-rose-200/g, "border-rose-400/30"],
  [/border-amber-200/g, "border-amber-400/25"],
  [/border-sky-200/g, "border-sky-400/25"],
  [/border-violet-200/g, "border-violet-400/25"],
  // translucent white surfaces -> faint glass tints
  [/bg-white\/80/g, "bg-white/[0.05]"],
  [/bg-white\/70/g, "bg-white/[0.04]"],
  [/bg-white\/60/g, "bg-white/[0.04]"],
  [/bg-white\/50/g, "bg-white/[0.04]"],
  // attendance status buttons
  [/"bg-white text-/g, '"bg-white/[0.07] text-'],
  // drawer overlay a bit deeper for dark app
  [/bg-black\/35/g, "bg-black/55"],
]

let total = 0
for (const f of FILES) {
  let src = fs.readFileSync(f, "utf8")
  let count = 0
  for (const [re, to] of RULES) {
    src = src.replace(re, (m) => (count++, m === to ? m : to))
  }
  if (count) {
    fs.writeFileSync(f, src)
    console.log(`${f}: ${count} replacements`)
    total += count
  }
}
console.log(`total: ${total}`)
