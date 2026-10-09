"use client"

// ============================================================
// PS-AMS :: shared motion & surface primitives
// The design vocabulary used across every module:
//  - Stagger / StaggerItem   orchestrated list entrances
//  - GlassCard               frosted panel with hover lift + glow
//  - PageHeader              gradient-bar section heading
//  - Chip                    status pill
//  - EmptyState              friendly zero-data state
//  - useRevealMouse          pointer-tracked sheen for .reveal-item
// ============================================================

import { motion, type Variants } from "framer-motion"
import { useCallback } from "react"
import { cn } from "@/lib/utils"

/* ---------------- orchestrated entrance ---------------- */

export const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055, delayChildren: 0.04 } },
}

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.985 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring", stiffness: 320, damping: 30 },
  },
}

export function Stagger({
  children,
  className,
  as = "div",
}: {
  children: React.ReactNode
  className?: string
  as?: "div" | "section"
}) {
  const Comp = as === "section" ? motion.section : motion.div
  return (
    <Comp
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className={className}
    >
      {children}
    </Comp>
  )
}

export function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <motion.div variants={staggerItem} className={className}>
      {children}
    </motion.div>
  )
}

/* ---------------- glass surface with hover lift ---------------- */

export function GlassCard({
  children,
  className,
  interactive = true,
  reveal = true,
}: {
  children: React.ReactNode
  className?: string
  interactive?: boolean
  reveal?: boolean
}) {
  return (
    <div
      className={cn(
        "glass rounded-2xl",
        interactive && "hover-lift",
        reveal && "reveal-item",
        className
      )}
    >
      {children}
    </div>
  )
}

/* ---------------- page/section header ---------------- */

export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="flex items-start gap-3">
        <span className="mt-1 h-8 w-1.5 shrink-0 rounded-full bg-gradient-to-b from-primary via-primary to-orange-500 shadow-[0_0_14px_rgba(36,86,230,0.45)] dark:shadow-[0_0_14px_rgba(109,155,255,0.5)]" />
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight text-foreground">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[12.5px] text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/* ---------------- status chip ---------------- */

const CHIP_TONES = {
  blue: "bg-blue-500/10 text-blue-700 border-blue-500/30 dark:bg-blue-400/10 dark:text-blue-300 dark:border-blue-400/25",
  cyan: "bg-cyan-600/10 text-cyan-700 border-cyan-600/25 dark:bg-cyan-400/10 dark:text-cyan-300 dark:border-cyan-400/25",
  rose: "bg-rose-500/10 text-rose-700 border-rose-500/25 dark:bg-rose-400/10 dark:text-rose-300 dark:border-rose-400/25",
  amber: "bg-amber-500/10 text-amber-700 border-amber-500/25 dark:bg-amber-400/10 dark:text-amber-300 dark:border-amber-400/25",
  violet: "bg-violet-500/10 text-violet-700 border-violet-500/25 dark:bg-violet-400/10 dark:text-violet-300 dark:border-violet-400/25",
  slate: "bg-muted text-muted-foreground border-border",
  emerald: "bg-emerald-500/10 text-emerald-700 border-emerald-500/25 dark:bg-emerald-400/10 dark:text-emerald-300 dark:border-emerald-400/25",
} as const

export type ChipTone = keyof typeof CHIP_TONES

export function Chip({
  children,
  tone = "slate",
  className,
}: {
  children: React.ReactNode
  tone?: ChipTone
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold tracking-wide",
        CHIP_TONES[tone],
        className
      )}
    >
      {children}
    </span>
  )
}

/* ---------------- empty state ---------------- */

export function EmptyState({
  icon,
  title,
  hint,
  action,
  className,
}: {
  icon: React.ReactNode
  title: string
  hint?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 py-12 text-center", className)}>
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
        className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-muted text-muted-foreground shadow-inner"
      >
        {icon}
      </motion.div>
      <p className="mt-1 text-sm font-semibold text-foreground/85">{title}</p>
      {hint && <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

/* ---------------- pointer-tracked sheen helper ---------------- */

export function useRevealMouse() {
  return useCallback((e: React.MouseEvent<HTMLElement>) => {
    const el = e.currentTarget
    const r = el.getBoundingClientRect()
    el.style.setProperty("--mx", `${e.clientX - r.left}px`)
    el.style.setProperty("--my", `${e.clientY - r.top}px`)
  }, [])
}

/* ---------------- skeleton ---------------- */

export function Shimmer({ className }: { className?: string }) {
  return <div className={cn("shimmer rounded-xl", className)} />
}
