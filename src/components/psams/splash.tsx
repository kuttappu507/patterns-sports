"use client"

// ============================================================
// PS-AMS :: branded splash screen — "match night" boot scene.
// Floodlit gradient arena, perspective court floor, glowing net
// band and a bouncing, spinning volleyball over a soft shadow.
// Pure ambience is CSS (.splash); the ball is framer-motion.
// ============================================================

import { useEffect, useState } from "react"
import { motion } from "framer-motion"

const STATUS_LINES = [
  "Warming up the court…",
  "Inflating the ball…",
  "Raising the net…",
  "Squads assembling…",
  "Loading your academy…",
]

/** A regulation-style volleyball drawn as SVG — panels + curved seams. */
function Volleyball({ className, stroke = "#eef2ff" }: { className?: string; stroke?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <radialGradient id="ball-shade" cx="34%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="55%" stopColor="#4f46e5" />
          <stop offset="100%" stopColor="#372fae" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="44" fill="url(#ball-shade)" />
      <g fill="none" stroke={stroke} strokeWidth="3.4" strokeLinecap="round" opacity="0.92">
        <circle cx="50" cy="50" r="44" />
        {/* centre panel swirl */}
        <path d="M50 6c-24 13-33 40-21 66" />
        <path d="M50 6c24 13 33 40 21 66" />
        {/* horizontal seams */}
        <path d="M7.5 42c19 15 66 15 85-6" />
        <path d="M10 68c14-11 28-14 40-10" />
        <path d="M90 68c-14-11-28-14-40-10" />
      </g>
      {/* highlight */}
      <ellipse cx="36" cy="32" rx="12" ry="7" fill="#ffffff" opacity="0.22" transform="rotate(-24 36 32)" />
    </svg>
  )
}

export function Splash({ error }: { error: string | null }) {
  const [statusIdx, setStatusIdx] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setStatusIdx((i) => (i + 1) % STATUS_LINES.length), 700)
    return () => clearInterval(id)
  }, [])

  return (
    <motion.div
      className="splash"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05, filter: "blur(6px)" }}
      transition={{ duration: 0.45, ease: [0.3, 0.6, 0.3, 1] }}
    >
      {/* corner floodlight flares */}
      <div className="splash-glow pointer-events-none absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-[rgba(99,102,241,0.35)] blur-[110px]" />
      <div className="splash-glow pointer-events-none absolute -right-20 bottom-1/4 h-72 w-72 rounded-full bg-[rgba(245,158,11,0.30)] blur-[110px]" style={{ animationDelay: "0.9s" }} />

      <div className="relative flex flex-col items-center px-6 text-center">
        {/* ---------- bouncing volleyball ---------- */}
        <div className="relative flex h-44 w-40 items-end justify-center">
          <motion.div
            animate={{ y: [0, -34, 0] }}
            transition={{ duration: 1.05, repeat: Infinity, ease: [0.28, 0, 0.42, 1], times: [0, 0.55, 1] }}
            className="relative"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
              className="h-24 w-24 drop-shadow-[0_0_28px_rgba(129,140,248,0.65)]"
            >
              <Volleyball className="h-full w-full" />
            </motion.div>
            {/* pulse rings on impact */}
            <span className="splash-ring absolute inset-0 rounded-full border-2 border-indigo-300/50" />
            <span className="splash-ring absolute inset-0 rounded-full border border-amber-300/40" style={{ animationDelay: "0.95s" }} />
          </motion.div>
          {/* ground shadow */}
          <motion.div
            animate={{ scaleX: [1, 0.72, 1], opacity: [0.5, 0.28, 0.5] }}
            transition={{ duration: 1.05, repeat: Infinity, ease: [0.28, 0, 0.42, 1], times: [0, 0.55, 1] }}
            className="splash-ball-shadow absolute -bottom-2 h-4 w-24 rounded-[100%]"
          />
        </div>

        {/* ---------- brand ---------- */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.5, ease: "easeOut" }}
          className="mt-2"
        >
          <div className="splash-chip mx-auto mb-3 inline-flex items-center gap-2 rounded-full px-4 py-1 text-[11px] font-bold uppercase tracking-[0.28em]">
            <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-amber-300" />
            Volleyball Academy
          </div>
          <h1 className="splash-title text-[clamp(2.3rem,6vw,3.6rem)] leading-none">
            PATTERN SPORTS
          </h1>
          <p className="mt-2 text-sm font-medium uppercase tracking-[0.34em] text-indigo-200/80">
            Academy Management Suite
          </p>
        </motion.div>

        {/* ---------- progress ---------- */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.45 }}
          className="mt-8 w-64"
        >
          <div className="splash-progress h-1.5 overflow-hidden rounded-full">
            <motion.span
              initial={{ width: "4%" }}
              animate={{ width: "100%" }}
              transition={{ duration: 2.1, ease: [0.3, 0.5, 0.4, 1] }}
              className="block h-full rounded-full"
            />
          </div>
          <div className="mt-2.5 h-4 text-xs font-medium text-indigo-200/70" aria-live="polite">
            {error ? "Almost there…" : STATUS_LINES[statusIdx]}
          </div>
        </motion.div>

        {/* ---------- boot warning (desktop shell only) ---------- */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-4 w-[min(92vw,540px)] rounded-2xl border border-amber-400/30 bg-amber-400/[0.08] p-4 backdrop-blur"
          >
            <p className="text-sm font-semibold text-amber-300">Offline backend warning</p>
            <p className="mt-1 break-words text-xs leading-relaxed text-amber-100/80">{error}</p>
            <p className="mt-1.5 text-[11px] text-indigo-200/60">
              The interface will still load — data operations may be unavailable.
            </p>
          </motion.div>
        )}
      </div>

      {/* footer strip */}
      <div className="absolute bottom-5 left-0 right-0 flex items-center justify-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-indigo-200/40">
        PS-AMS v1.3 · Offline-first
      </div>
    </motion.div>
  )
}
