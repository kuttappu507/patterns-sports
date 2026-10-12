#!/usr/bin/env python3
"""Generate src/lib/psams/who2007-bmi-data.ts from the validated WHO reference data.

Source: WHO anthroplus 1.1.0 R package bfa_growth_standards (months 60-229,
sexes 1=boys 2=girls), cross-validated byte-identical (<=5e-5) against the
official published expanded XLSX tables on cdn.who.int (months 61-228).
"""
import csv

with open("/tmp/who_bfa_package.csv") as f:
    rows = list(csv.DictReader(f))

boys = sorted([(int(r["month"]), float(r["l"]), float(r["m"]), float(r["s"])) for r in rows if r["sex"] == "1"])
girls = sorted([(int(r["month"]), float(r["l"]), float(r["m"]), float(r["s"])) for r in rows if r["sex"] == "2"])

def fmt(vals):
    return "[\n    " + ",\n    ".join(vals) + ",\n  ]"

def row(month, l, m, s):
    return f"[{month}, {l}, {m}, {s}]"

boys_rows = [row(*t) for t in boys]
girls_rows = [row(*t) for t in girls]

header = """\
// ============================================================
// PS-AMS :: WHO 2007 BMI-for-age reference data (5-19 years),
// sex-specific LMS triplets, bundled for OFFLINE use.
//
// >>> GENERATED FILE — do not hand-edit. <<<
// Regenerate with: scripts/who-validate.py + scripts/who-generate-data.py
//
// Source of truth (both official WHO distributions, cross-validated):
//  1. WHO AnthroPlus R package 1.1.0 (WHO-maintained, CRAN),
//     dataset `bfa_growth_standards` — months 60..229 per sex.
//     https://cran.r-project.org/package=anthroplus
//  2. WHO expanded tables "BMI-for-age (5-19 years)" z-scores,
//     published on cdn.who.int (months 61..228) — LMS values match
//     source 1 exactly (max abs diff 0.000000, verified 2026-10-12):
//     https://cdn.who.int/media/docs/default-source/child-growth/
//       growth-reference-5-19-years/bmi-for-age-(5-19-years)/
//       bmi-boys-z-who-2007-exp.xlsx   (sfvrsn=a84bca93_2)
//       bmi-girls-z-who-2007-exp.xlsx  (sfvrsn=79222875_2)
//
// Reference: WHO Growth reference data for 5-19 years (2007),
// https://www.who.int/tools/growth-reference-data-for-5to19-years
// Method: LMS (Cole) with WHO restricted z-scores beyond +/-3 SD —
// identical to WHO anthro/anthroplus R implementations.
// WHO data (c) World Health Organization; embedded for offline
// clinical screening use with attribution per WHO terms.
// ============================================================

export const WHO2007_BMI_DATA_VERSION = "WHO 2007 expanded tables (anthroplus 1.1.0 + cdn.who.int, retrieved 2026-10-12)"

/**
 * One LMS row per exact month of age: [month, L, M, S].
 * M is the median BMI at that month (the 50th percentile).
 */
export type WhoLms = readonly [month: number, l: number, m: number, s: number]

/** Boys (sex = 1 in the WHO reference), months 60..229. */
export const WHO2007_BMI_BOYS: readonly WhoLms[] = %s

/** Girls (sex = 2 in the WHO reference), months 60..229. */
export const WHO2007_BMI_GIRLS: readonly WhoLms[] = %s
"""

out = header % (fmt(boys_rows), fmt(girls_rows))
with open("src/lib/psams/who2007-bmi-data.ts", "w") as f:
    f.write(out)
print(f"wrote src/lib/psams/who2007-bmi-data.ts: {len(boys_rows)} boys rows, {len(girls_rows)} girls rows")
