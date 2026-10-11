"use client"

import { useState } from "react"

/**
 * PS-043 — a restored database without the media files used to show broken
 * image glyphs on screen AND blank boxes on the printed A4 profiles: none
 * of the <img> call sites had an onError fallback. SafeImg renders the
 * caller's fallback (monogram box / placeholder) the moment the image fails
 * to load, and never renders a broken glyph.
 */
export function SafeImg({
  src,
  alt,
  className,
  fallback,
}: {
  src?: string | null
  alt: string
  className?: string
  fallback: React.ReactNode
}) {
  const [failed, setFailed] = useState(false)
  const [prevSrc, setPrevSrc] = useState(src)
  // a changed src (new photo uploaded) must retry the load — adjusted during
  // render (React's recommended pattern) instead of a cascading setState effect
  if (prevSrc !== src) {
    setPrevSrc(src)
    setFailed(false)
  }
  if (!src || failed) return <>{fallback}</>
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} loading="lazy" />
}
