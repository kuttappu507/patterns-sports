"use client"

// ============================================================
// PS-AMS :: dedicated splash WINDOW (desktop boot stage)
// The splash lives in its own small OPAQUE frameless window
// (see tauri.conf.json → windows[0], url ?boot=splash) that floats
// dead-center on the desktop — solid background, no transparency,
// so no dim rectangle can ever appear around the boot card. The window BOOTS HIDDEN — it reveals
// itself only after the first painted frame, so the user never
// sees a blank white rectangle before the branded card appears.
// The MAIN window stays hidden until:
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

    // ---- reveal-on-paint ----
    // The window starts HIDDEN (visible:false in tauri.conf.json). Showing
    // it only after two painted frames removes the blank white window the
    // user used to see while the webview booted the JS bundle.
    let shown = false
    let revealT: ReturnType<typeof setTimeout> | null = null
    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window")
        const win = getCurrentWindow()
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            revealT = setTimeout(() => {
              if (shown) return
              shown = true
              void win.show()
              void win.center()
            }, 60)
          })
        )
        // absolute failsafe — never leave nothing on screen
        setTimeout(() => {
          if (!shown) {
            shown = true
            void win.show()
          }
        }, 1500)
      } catch (e) {
        console.warn("splash reveal failed", e)
      }
    })()

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
      if (revealT) clearTimeout(revealT)
      document.documentElement.classList.remove("splash-window")
    }
  }, [])

  return <Splash error={bootError} />
}
