"use client"

import { useEffect, useState } from "react"
import { useSpring, useTransform, motion } from "framer-motion"

/** Count-up numeric transition used on dashboard summary cards. */
export function CountUp({
  value,
  duration = 0.9,
  format = (n: number) => String(Math.round(n)),
  className,
}: {
  value: number
  duration?: number
  format?: (n: number) => string
  className?: string
}) {
  const [display, setDisplay] = useState(format(value))
  const spring = useSpring(value, { duration: duration * 1000, bounce: 0 })
  const text = useTransform(spring, (v) => format(v))

  useEffect(() => {
    spring.set(value)
    const unsub = text.on("change", (v) => setDisplay(v))
    return unsub
  }, [value, spring, text])

  return (
    <motion.span className={className} aria-live="polite">
      {display}
    </motion.span>
  )
}
