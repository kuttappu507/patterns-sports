"use client"

// ============================================================
// PS-AMS :: dedicated splash WINDOW (desktop boot stage)
// The splash lives in its own small transparent frameless window
// (see tauri.conf.json → windows[0], url ?boot=splash) that floats
// dead-center on the desktop. The MAIN window stays hidden until:
//   1. the splash has been on screen for at least 2.2 s, AND
//   2. the main window reports the offline backend booted
//      (event "psams://booted"), or a 25 s failsafe fires.
// Then it invokes the Rust `finish_boot` command which reveals the
// main window (full screen / maximized) and closes this window.
// The user therefore NEVER sees the app together with the splash.
// ============================================================

import { useEffect, useState } from "react"
import { Splash } from "@/components/psams/splash"
import { isTauri } from "@/lib/psams/api"

export function SplashWindow() {
  const [bootError, setBootError] = useState<string | null>(null)

  useEffect(() => {
    // page background must be see-through so the desktop shows around the card
    document.documentElement.classList.add("splash-window")
    if (!isTauri()) return

    let minDone = false // minimum splash time elapsed
    let booted = false // main window reported backend ready
    let finished = false
    let unlisten: (() => void) | null = null

    const finish = async () => {
      if (finished) return
      finished = true
      try {
        const { invoke } = await import("@tauri-apps/api/core")
        await invoke("finish_boot")
      } catch (e) {
        console.warn("finish_boot failed", e)
      }
    }

    const maybeFinish = () => {
      if (minDone && booted) void finish()
    }

    let disposed = false
    void (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event")
        const stop = await listen<{ ok: boolean; error: string | null }>("psams://booted", (e) => {
          booted = true
          setBootError(e.payload?.error ?? null)
          maybeFinish()
        })
        if (disposed) stop()
        else unlisten = stop
      } catch (e) {
        console.warn("splash listen failed", e)
      }
    })()

    const minT = setTimeout(() => {
      minDone = true
      maybeFinish()
    }, 2200)

    // hard failsafe — never leave the user staring at the desktop
    const failsafe = setTimeout(() => void finish(), 25000)

    return () => {
      disposed = true
      unlisten?.()
      clearTimeout(minT)
      clearTimeout(failsafe)
      document.documentElement.classList.remove("splash-window")
    }
  }, [])

  return <Splash error={bootError} />
}
