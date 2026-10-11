import { defineConfig } from "vitest/config"
import path from "node:path"

// Minimal vitest config — resolves the same "@/" alias the app uses so
// pure modules (domain, whatsapp) can be unit-tested directly.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    // route-level integration batteries (150-receipt volume, demo load,
    // migration spawn) comfortably exceed the default 5 s on CI hardware
    testTimeout: 20000,
    // never run the copies `next build` traces into the standalone output —
    // a stale duplicate could silently mask a fresh test
    exclude: ["**/node_modules/**", ".next/**"],
  },
})
