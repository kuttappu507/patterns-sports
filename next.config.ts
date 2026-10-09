import type { NextConfig } from "next";

// TAURI_STATIC=1 switches the build to a fully static export consumed by the
// Tauri shell (src-tauri/tauri.conf.json -> frontendDist "../out").
// The normal web/standalone build is untouched.
const tauriStatic = process.env.TAURI_STATIC === "1";

const nextConfig: NextConfig = {
  ...(tauriStatic
    ? { output: "export" as const, images: { unoptimized: true } }
    : { output: "standalone" as const }),
  // Type errors fail the build — never skip type checking.
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
};

export default nextConfig;
