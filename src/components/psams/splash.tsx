"use client"

// ============================================================
// PS-AMS :: branded splash screen — compact borderless boot card.
// A small floating "match night" card (dimmed, blurred app behind
// it): floodlit gradient, perspective court floor, glowing net
// band and a bouncing, spinning volleyball. Pure ambience is CSS
// (.splash); the ball is framer-motion.
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
    /* boot overlay — dims + blurs the app behind the card; the whole
       overlay fades on exit while the card additionally shrinks away */
    <motion.div
      className="splash-overlay"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <motion.div
        className="splash"
        initial={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9, filter: "blur(6px)" }}
        transition={{ duration: 0.42, ease: [0.3, 0.6, 0.3, 1] }}
      >
        {/* corner floodlight flares (clipped by the card) */}
        <div className="splash-glow pointer-events-none absolute -left-14 top-1/4 h-36 w-36 rounded-full bg-[rgba(99,102,241,0.35)] blur-[70px]" />
        <div
          className="splash-glow pointer-events-none absolute -right-10 bottom-[16%] h-36 w-36 rounded-full bg-[rgba(245,158,11,0.30)] blur-[70px]"
          style={{ animationDelay: "0.9s" }}
        />

        {/* ---------- bouncing volleyball ---------- */}
        <div className="relative flex h-28 w-28 items-end justify-center">
          <motion.div
            animate={{ y: [0, -22, 0] }}
            transition={{ duration: 1.05, repeat: Infinity, ease: [0.28, 0, 0.42, 1], times: [0, 0.55, 1] }}
            className="relative"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
              className="h-16 w-16 drop-shadow-[0_0_18px_rgba(129,140,248,0.65)]"
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
            className="splash-ball-shadow absolute -bottom-1.5 h-3 w-16 rounded-[100%]"
          />
        </div>

        {/* ---------- brand ---------- */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.5, ease: "easeOut" }}
          className="relative z-10 mt-2"
        >
          <div className="splash-chip mx-auto mb-2.5 inline-flex items-center gap-2 rounded-full px-3.5 py-1 text-[9.5px] font-bold uppercase tracking-[0.28em]">
            <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-amber-300" />
            Volleyball Academy
          </div>
          <h1 className="splash-title text-[27px] leading-none">PATTERN SPORTS</h1>
          <p className="mt-1.5 text-[10.5px] font-medium uppercase tracking-[0.34em] text-indigo-200/80">
            Academy Management Suite
          </p>
        </motion.div>

        {/* ---------- progress ---------- */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.45 }}
          className="relative z-10 mt-6 w-56"
        >
          <div className="splash-progress h-1.5 overflow-hidden rounded-full">
            <motion.span
              initial={{ width: "4%" }}
              animate={{ width: "100%" }}
              transition={{ duration: 2.1, ease: [0.3, 0.5, 0.4, 1] }}
              className="block h-full rounded-full"
            />
          </div>
          <div className="mt-2 h-4 text-[11px] font-medium text-indigo-200/70" aria-live="polite">
            {error ? "Almost there…" : STATUS_LINES[statusIdx]}
          </div>
        </motion.div>

        {/* ---------- boot warning (desktop shell only) ---------- */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="relative z-10 mt-3 w-full rounded-xl border border-amber-400/30 bg-amber-400/[0.08] p-3"
          >
            <p className="text-[12px] font-semibold text-amber-300">Offline backend warning</p>
            <p className="mt-1 break-words text-[11px] leading-relaxed text-amber-100/80">{error}</p>
            <p className="mt-1 text-[10.5px] text-indigo-200/60">
              The interface will still load — data operations may be unavailable.
            </p>
          </motion.div>
        )}

        {/* footer line */}
        <div className="relative z-10 mt-5 text-[9.5px] font-semibold uppercase tracking-[0.24em] text-indigo-200/40">
          PS-AMS v1.4 · Offline-first
        </div>
      </motion.div>
    </motion.div>
  )
}
