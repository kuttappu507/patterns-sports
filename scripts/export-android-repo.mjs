#!/usr/bin/env node
// ============================================================
// PS-AMS :: Standalone Android Repository Exporter
// Creates a self-contained Git repository from ./android with
// its own root Gradle configuration and GitHub Actions APK
// workflow, and optionally pushes to a target GitHub remote URL.
//
// Usage:
//   node scripts/export-android-repo.mjs [target-dir] [remote-git-url]
// ============================================================

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const androidSrc = path.join(root, "android");
const targetDir = path.resolve(process.argv[2] || "/tmp/patterns-sports-android");
const remoteUrl = process.argv[3] || "";

if (!fs.existsSync(androidSrc)) {
  console.error("ERROR: ./android directory not found");
  process.exit(1);
}

fs.rmSync(targetDir, { recursive: true, force: true });
fs.mkdirSync(targetDir, { recursive: true });
fs.cpSync(androidSrc, targetDir, {
  recursive: true,
  filter: (src) => {
    const rel = path.relative(androidSrc, src).split(path.sep);
    return !rel.includes(".gradle") && !rel.includes("build") && !rel.includes(".idea");
  },
});

// Write standalone .gitignore
fs.writeFileSync(
  path.join(targetDir, ".gitignore"),
  [
    ".gradle/",
    "build/",
    "app/build/",
    "local.properties",
    ".idea/",
    "*.iml",
    "*.jks",
    "*.keystore",
    ".DS_Store",
  ].join("\n") + "\n",
  "utf8"
);

const workflowYaml = `name: Build Android APK (PS-AMS)

on:
  push:
    branches: [main, master]
    tags: ["v*"]
  pull_request:
    branches: [main, master]
  workflow_dispatch: {}

permissions:
  contents: write

jobs:
  build-apk:
    name: Test & Build Signed Android APKs
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup JDK 17
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: "17"

      - name: Setup Gradle
        uses: gradle/actions/setup-gradle@v4
        with:
          gradle-version: "8.9"

      - name: Run Domain & WHO 2007 BMI JUnit Parity Tests
        run: gradle testDebugUnitTest --stacktrace --no-daemon

      - name: Assemble Signed Debug & Release APKs
        run: gradle assembleDebug assembleRelease --stacktrace --no-daemon

      - name: Stage APK Deliverables
        run: |
          mkdir -p dist
          cp app/build/outputs/apk/release/*.apk dist/PS-AMS_1.9.1_android_release.apk
          cp app/build/outputs/apk/debug/*.apk dist/PS-AMS_1.9.1_android_debug.apk
          (cd dist && sha256sum *.apk > SHA256SUMS.txt)
          ls -lh dist/

      - name: Upload PS-AMS-Android-APK Artifact
        uses: actions/upload-artifact@v4
        with:
          name: PS-AMS-Android-APK
          if-no-files-found: error
          path: dist/*

      - name: Publish GitHub Release (on v* tags)
        if: startsWith(github.ref, 'refs/tags/v')
        uses: softprops/action-gh-release@v2
        with:
          files: dist/*
          generate_release_notes: true
`;

// Always include ci/build-apk.yml and .github/workflows/build-apk.yml
const ciDir = path.join(targetDir, "ci");
fs.mkdirSync(ciDir, { recursive: true });
fs.writeFileSync(path.join(ciDir, "build-apk.yml"), workflowYaml, "utf8");

const workflowDir = path.join(targetDir, ".github", "workflows");
fs.mkdirSync(workflowDir, { recursive: true });
fs.writeFileSync(path.join(workflowDir, "build-apk.yml"), workflowYaml, "utf8");

execSync("git init -b main", { cwd: targetDir, stdio: "inherit" });
execSync("git add -A", { cwd: targetDir, stdio: "inherit" });
execSync(
  'git -c user.name="PS-AMS Builder" -c user.email="noreply@patternsports.in" commit -m "feat: PS-AMS Native Android Suite (Kotlin + Jetpack Compose, Zero-Material, Poppins)"',
  { cwd: targetDir, stdio: "inherit" }
);

console.log(`[export-android-repo] Standalone Android repo initialized at: ${targetDir}`);

if (remoteUrl) {
  console.log(`[export-android-repo] Pushing to remote: ${remoteUrl}`);
  execSync(`git remote add origin ${JSON.stringify(remoteUrl)}`, { cwd: targetDir, stdio: "inherit" });
  try {
    execSync("git push -u origin main --force", { cwd: targetDir, stdio: "inherit" });
  } catch {
    console.log("[export-android-repo] Token lacks 'workflows' scope; pushing with workflow at ci/build-apk.yml...");
    fs.rmSync(path.join(targetDir, ".github"), { recursive: true, force: true });
    execSync("git add -A", { cwd: targetDir, stdio: "inherit" });
    execSync(
      'git -c user.name="PS-AMS Builder" -c user.email="noreply@patternsports.in" commit --amend -m "feat: PS-AMS Native Android Suite (Kotlin + Jetpack Compose, Zero-Material, Poppins)"',
      { cwd: targetDir, stdio: "inherit" }
    );
    execSync("git push -u origin main --force", { cwd: targetDir, stdio: "inherit" });
  }
}
