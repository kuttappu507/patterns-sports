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
  },
})
