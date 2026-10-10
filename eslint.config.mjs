import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  // Report stale eslint-disable comments (the typescript-eslint rule of the
  // same name was removed; flat config does this via linterOptions).
  linterOptions: {
    reportUnusedDisableDirectives: "error",
  },
  rules: {
    // ---- TypeScript rules (enabled: the codebase is clean under them) ----
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": ["error", {
      argsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
      caughtErrors: "none",
    }],
    // Non-null assertions are used deliberately after explicit guards.
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/ban-ts-comment": "error",
    "@typescript-eslint/prefer-as-const": "error",

    // ---- React rules ----
    // Warn (not error) while the app-level effect graph is being hardened;
    // still visible in every `npm run lint` run.
    "react-hooks/exhaustive-deps": "warn",
    // Impure render defaults (e.g. `new Date()` form seeds) exist on purpose;
    // the stricter set-state/refs rules cover the dangerous cases.
    "react-hooks/purity": "off",
    "react/no-unescaped-entities": "error",
    "react/display-name": "error",
    // TypeScript (strict) already type-checks props; the legacy runtime rule
    // would only duplicate it with false positives on generic components.
    "react/prop-types": "off",
    // The full React Compiler lint preset is opt-in — enable it only after
    // auditing the codebase for its stricter purity requirements.
    "react-compiler/react-compiler": "off",

    // ---- Next.js rules ----
    // Local <img> is deliberate: media is served from /api/media on the same
    // origin with dynamic URLs (next/image optimization adds no value here).
    "@next/next/no-img-element": "warn",
    // App Router only — no pages/ directory for this rule to resolve against.
    "@next/next/no-html-link-for-pages": "off",

    // ---- General JavaScript rules ----
    "prefer-const": "error",
    // Superseded by @typescript-eslint/no-unused-vars (which understands types).
    "no-unused-vars": "off",
    // CLI/telemetry output: warn+error are fine everywhere, info logs only in
    // scripts (see override below).
    "no-console": ["error", { allow: ["warn", "error"] }],
    "no-debugger": "error",
    "no-empty": ["error", { allowEmptyCatch: true }],
    "no-irregular-whitespace": "error",
    "no-case-declarations": "error",
    "no-fallthrough": "error",
    "no-mixed-spaces-and-tabs": "error",
    "no-redeclare": "error",
    // TS files are fully typed by tsc; no-undef only makes sense for plain JS.
    "no-undef": "off",
    "no-unreachable": "error",
    "no-useless-escape": "error",
  },
}, {
  // Node/CLI scripts legitimately print progress to stdout.
  files: ["scripts/**/*.{mjs,js,ts}"],
  rules: {
    "no-console": "off",
  },
}, {
  // no-undef matters for plain JS/MJS that tsc does not check.
  files: ["**/*.{js,mjs,cjs}"],
  rules: {
    "no-undef": "error",
  },
}, {
  ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "examples/**", "skills", "src-tauri/**"]
}];

export default eslintConfig;
