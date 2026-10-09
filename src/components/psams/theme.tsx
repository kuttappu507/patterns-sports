"use client"

// ============================================================
// PS-AMS :: theme system — light "Clean Court" default with an
// opt-in "Dark Court" mode. Choice persists in localStorage and
// syncs the native window chrome (title bar) in the desktop app.
// A tiny pre-paint script in layout.tsx applies the saved class
// before first paint, so there is never a flash of wrong theme.
// ============================================================

import { useCallback, useSyncExternalStore } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Moon, Sun } from "lucide-react"
import { cn } from "@/lib/utils"

export type Theme = "light" | "dark"

const STORAGE_KEY = "psams-theme"

/** Read the active theme from the DOM class (source of truth post-paint). */
export function currentTheme(): Theme {
  if (typeof document !== "undefined" && document.documentElement.classList.contains("dark")) {
    return "dark"
  }
  return "light"
}

/** Apply a theme everywhere: DOM class, storage, native title bar. */
export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark")
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* storage unavailable — theme just won't persist */
  }
  // notify subscribers (and other app windows)
  window.dispatchEvent(new Event("psams-theme-change"))
  // Sync native window chrome (desktop shell only, best effort)
  ;(async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window")
      await getCurrentWindow().setTheme(theme)
    } catch {
      /* web preview or permission missing — cosmetic only */
    }
  })()
}

function subscribeTheme(onChange: () => void) {
  window.addEventListener("psams-theme-change", onChange)
  window.addEventListener("storage", onChange)
  return () => {
    window.removeEventListener("psams-theme-change", onChange)
    window.removeEventListener("storage", onChange)
  }
}

/** Reactive theme state for the running app (hydration-safe). */
export function useTheme() {
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, () => "light" as Theme)

  const toggle = useCallback(() => {
    applyTheme(currentTheme() === "dark" ? "light" : "dark")
  }, [])

  return { theme, toggle }
}

/** Header toggle — sun/moon crossfade with a springy rotate. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme()
  const dark = theme === "dark"

  return (
    <button
      type="button"
      onClick={toggle}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "group relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg border border-border bg-card text-muted-foreground transition-all duration-200",
        "hover:-translate-y-px hover:border-primary/40 hover:text-primary hover:shadow-[0_6px_16px_-8px_rgba(5,150,105,0.45)] active:scale-95",
        className,
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
          animate={{ rotate: 0, opacity: 1, scale: 1 }}
          exit={{ rotate: 90, opacity: 0, scale: 0.6 }}
          transition={{ type: "spring", stiffness: 380, damping: 24 }}
          className="flex items-center justify-center"
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </motion.span>
      </AnimatePresence>
    </button>
  )
}
