package `in`.patternsports.ams.domain

import java.time.LocalDate
import java.time.temporal.ChronoUnit
import java.util.Locale
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sqrt

// ============================================================
// PS-AMS :: Authoritative WHO 2007 BMI-for-Age & Adult BMI Engine
// 1:1 parity with src/lib/psams/bmi.ts
// ============================================================

const val WHO_BFA_MIN_MONTHS = 60.0
const val WHO_BFA_MAX_MONTHS_EXCLUSIVE = 229.0
const val DAYS_PER_MONTH = 30.4375 // 365.25 / 12 (WHO AnthroPlus convention)

const val BMI_SCREENING_NOTE =
    "BMI is a screening measure, not a diagnosis — in muscular athletes it can overestimate body fat."

enum class WhoSex(val label: String) {
    BOYS("boys"),
    GIRLS("girls"),
}

enum class BmiMethod {
    WHO_5_19,
    ADULT_20PLUS,
    UNDER_5_UNSUPPORTED,
    SEX_UNKNOWN,
}

enum class BmiIssue(val description: String) {
    MISSING_WEIGHT("weight is missing"),
    MISSING_HEIGHT("height is missing"),
    INVALID_WEIGHT("weight must be a positive number"),
    INVALID_HEIGHT("height must be a positive number"),
    IMPLAUSIBLE_WEIGHT("weight is outside the plausible range 2–300 kg"),
    IMPLAUSIBLE_HEIGHT("height is outside the plausible range 40–272 cm"),
    MISSING_DOB("date of birth is missing"),
    INVALID_DOB("date of birth is not a valid date"),
    DOB_AFTER_MEASUREMENT("date of birth is after the measurement date"),
    MISSING_MEASUREMENT_DATE("measurement date is missing"),
}

data class LmsTriple(
    val l: Double,
    val m: Double,
    val s: Double,
)

sealed class BmiAssessment {
    data class Ok(
        val bmi: Double,
        val bmiRounded: Double,
        val method: BmiMethod,
        val ageMonths: Double,
        val ageLabel: String,
        val classification: String?,
        val classificationKind: String?,
        val zScore: Double?,
        val percentile: Double?,
        val flagged: Boolean,
        val referenceStandard: String,
        val referenceVersion: String,
        val disclaimer: String,
    ) : BmiAssessment()

    data class Failure(
        val issues: List<BmiIssue>,
        val message: String,
    ) : BmiAssessment()
}

data class BmiPresentation(
    val value: String,
    val label: String,
    val tone: String, // "emerald" | "amber" | "rose" | "slate"
    val hint: String,
)

data class WeightBand(
    val lo: Int,
    val hi: Int,
    val note: String,
)

data class BmiReportFields(
    val value: String,
    val classification: String,
    val combined: String,
)

object BmiEngine {

    private val Z_EPS = 1e-9

    fun normalizeSex(gender: String?): WhoSex? {
        return when (gender?.trim()?.lowercase(Locale.ROOT)) {
            "male", "m", "boys", "boy", "1" -> WhoSex.BOYS
            "female", "f", "girls", "girl", "2" -> WhoSex.GIRLS
            else -> null
        }
    }

    fun ageMonthsLabel(months: Double): String {
        val y = floor(months / 12.0).toInt()
        val m = (months - y * 12.0).roundToInt()
        return if (m == 0) "$y y" else "$y y $m m"
    }

    fun interpolateLms(sex: WhoSex, ageMonths: Double): LmsTriple? {
        val table = if (sex == WhoSex.BOYS) WHO2007_BMI_BOYS else WHO2007_BMI_GIRLS
        val low = ageMonths.toInt()
        val diff = ageMonths - low
        val baseMonth = table.first().month
        val idxA = low - baseMonth
        val idxB = idxA + 1
        if (idxA < 0 || idxB >= table.size) return null
        val a = table[idxA]
        val b = table[idxB]
        fun mix(x: Double, y: Double) = x + diff * (y - x)
        return LmsTriple(
            l = mix(a.l, b.l),
            m = mix(a.m, b.m),
            s = mix(a.s, b.s),
        )
    }

    fun bmiAtZ(lms: LmsTriple, z: Double): Double {
        val (l, m, s) = lms
        return if (abs(l) < 1e-9) {
            m * exp(s * z)
        } else {
            m * (1.0 + l * s * z).pow(1.0 / l)
        }
    }

    /**
     * WHO BMI-for-age z-score (BAZ) — LMS with WHO restricted adjustment beyond ±3 SD.
     */
    fun bmiForAgeZScore(sex: WhoSex, ageMonths: Double, bmi: Double): Pair<Double, LmsTriple>? {
        if (ageMonths < WHO_BFA_MIN_MONTHS || ageMonths >= WHO_BFA_MAX_MONTHS_EXCLUSIVE) return null
        val lms = interpolateLms(sex, ageMonths) ?: return null
        if (!bmi.isFinite() || bmi <= 0.0) return null
        val (l, m, s) = lms
        fun sd(k: Double): Double =
            if (abs(l) < 1e-9) m * exp(s * k) else m * (1.0 + l * s * k).pow(1.0 / l)

        var z = if (abs(l) < 1e-9) {
            ln(bmi / m) / s
        } else {
            ((bmi / m).pow(l) - 1.0) / (s * l)
        }
        if (z > 3.0) {
            val sd3 = sd(3.0)
            z = 3.0 + (bmi - sd3) / (sd3 - sd(2.0))
        } else if (z < -3.0) {
            val sd3n = sd(-3.0)
            z = -3.0 + (bmi - sd3n) / (sd(-2.0) - sd3n)
        }
        return z to lms
    }

    /**
     * Standard-normal CDF Φ(z) → percentile 0–100 (Abramowitz & Stegun 7.1.26).
     */
    fun zToPercentile(z: Double): Double {
        val x = -z / sqrt(2.0)
        val ax = abs(x)
        val t = 1.0 / (1.0 + 0.5 * ax)
        val erfcPos = t * exp(
            -ax * ax - 1.26551223 +
                t * (1.00002368 +
                    t * (0.37409196 +
                        t * (0.09678418 +
                            t * (-0.18628806 +
                                t * (0.27886807 +
                                    t * (-1.13520398 +
                                        t * (1.48851587 +
                                            t * (-0.82215223 + t * 0.17087277))))))))
        )
        val erfc = if (x < 0.0) 2.0 - erfcPos else erfcPos
        val phi = 0.5 * erfc
        return min(100.0, max(0.0, phi * 100.0))
    }

    fun classifyAdultBmi(bmi: Double): Pair<String, String> = when {
        bmi < 18.5 -> "underweight" to "Underweight"
        bmi < 25.0 -> "healthy" to "Healthy-weight range"
        bmi < 30.0 -> "overweight" to "Overweight"
        else -> "obesity" to "Obesity range"
    }

    fun classifyBfaZ(z: Double): Pair<String, String> = when {
        z < -3.0 - Z_EPS -> "severe-thinness" to "Severe thinness"
        z < -2.0 - Z_EPS -> "thinness" to "Thinness"
        z > 2.0 + Z_EPS -> "obesity" to "Obesity"
        z > 1.0 + Z_EPS -> "overweight" to "Overweight"
        else -> "normal-weight" to "Normal weight"
    }

    fun assessBmi(
        weightKg: Double?,
        heightCm: Double?,
        dateOfBirth: String?,
        gender: String? = null,
        measurementDate: String? = DomainEngine.todayKey(),
    ): BmiAssessment {
        val ageIssues = mutableListOf<BmiIssue>()
        if (dateOfBirth.isNullOrBlank()) ageIssues.add(BmiIssue.MISSING_DOB)
        if (measurementDate.isNullOrBlank()) ageIssues.add(BmiIssue.MISSING_MEASUREMENT_DATE)
        if (ageIssues.isNotEmpty()) return fail(ageIssues)

        val dob = DomainEngine.parseLocalDate(dateOfBirth)
        val md = DomainEngine.parseLocalDate(measurementDate)
        if (dob == null) ageIssues.add(BmiIssue.INVALID_DOB)
        if (md == null) ageIssues.add(BmiIssue.MISSING_MEASUREMENT_DATE)
        if (ageIssues.isNotEmpty()) return fail(ageIssues)

        val days = ChronoUnit.DAYS.between(dob!!, md!!)
        if (days < 0) return fail(listOf(BmiIssue.DOB_AFTER_MEASUREMENT))
        val ageMonths = days / DAYS_PER_MONTH

        val measureIssues = mutableListOf<BmiIssue>()
        when {
            weightKg == null -> measureIssues.add(BmiIssue.MISSING_WEIGHT)
            !weightKg.isFinite() || weightKg <= 0.0 -> measureIssues.add(BmiIssue.INVALID_WEIGHT)
            weightKg < 2.0 || weightKg > 300.0 -> measureIssues.add(BmiIssue.IMPLAUSIBLE_WEIGHT)
        }
        when {
            heightCm == null -> measureIssues.add(BmiIssue.MISSING_HEIGHT)
            !heightCm.isFinite() || heightCm <= 0.0 -> measureIssues.add(BmiIssue.INVALID_HEIGHT)
            heightCm < 40.0 || heightCm > 272.0 -> measureIssues.add(BmiIssue.IMPLAUSIBLE_HEIGHT)
        }
        if (measureIssues.isNotEmpty()) return fail(measureIssues)

        val metres = heightCm!! / 100.0
        val bmi = weightKg!! / (metres * metres)
        if (!bmi.isFinite() || bmi <= 0.0) {
            return fail(listOf(BmiIssue.INVALID_WEIGHT, BmiIssue.INVALID_HEIGHT))
        }
        val bmiRounded = (bmi * 10.0).roundToInt() / 10.0
        val ageLabel = ageMonthsLabel(ageMonths)

        if (ageMonths < WHO_BFA_MIN_MONTHS) {
            return BmiAssessment.Ok(
                bmi = bmi,
                bmiRounded = bmiRounded,
                method = BmiMethod.UNDER_5_UNSUPPORTED,
                ageMonths = ageMonths,
                ageLabel = ageLabel,
                classification = null,
                classificationKind = null,
                zScore = null,
                percentile = null,
                flagged = false,
                referenceStandard = "— (no WHO 0–5 reference bundled)",
                referenceVersion = "—",
                disclaimer = "The athlete is under 5 years old. WHO's Child Growth Standards (0–5 y) are not configured, so the BMI value is shown without a growth category — it must not be judged with adult or 5–19-year thresholds. $BMI_SCREENING_NOTE",
            )
        }

        val sex = normalizeSex(gender)
        if (ageMonths < WHO_BFA_MAX_MONTHS_EXCLUSIVE) {
            if (sex == null) {
                return BmiAssessment.Ok(
                    bmi = bmi,
                    bmiRounded = bmiRounded,
                    method = BmiMethod.SEX_UNKNOWN,
                    ageMonths = ageMonths,
                    ageLabel = ageLabel,
                    classification = null,
                    classificationKind = null,
                    zScore = null,
                    percentile = null,
                    flagged = false,
                    referenceStandard = "WHO 2007 BMI-for-age (5–19 years)",
                    referenceVersion = WHO2007_BMI_DATA_VERSION,
                    disclaimer = "BMI-for-age is sex-specific — record the athlete's sex (Male/Female) on the profile to get the WHO 5–19-year classification. $BMI_SCREENING_NOTE",
                )
            }
            val res = bmiForAgeZScore(sex, ageMonths, bmi)
            if (res != null) {
                val (z, _) = res
                val (kind, label) = classifyBfaZ(z)
                return BmiAssessment.Ok(
                    bmi = bmi,
                    bmiRounded = bmiRounded,
                    method = BmiMethod.WHO_5_19,
                    ageMonths = ageMonths,
                    ageLabel = ageLabel,
                    classification = label,
                    classificationKind = kind,
                    zScore = z,
                    percentile = zToPercentile(z),
                    flagged = abs(z) > 5.0,
                    referenceStandard = "WHO 2007 BMI-for-age (5–19 years) — ${sex.label}",
                    referenceVersion = WHO2007_BMI_DATA_VERSION,
                    disclaimer = "Age-specific WHO 2007 BMI-for-age (${sex.label}, 5–19 y). $BMI_SCREENING_NOTE",
                )
            }
        }

        val (kind, label) = classifyAdultBmi(bmi)
        return BmiAssessment.Ok(
            bmi = bmi,
            bmiRounded = bmiRounded,
            method = BmiMethod.ADULT_20PLUS,
            ageMonths = ageMonths,
            ageLabel = ageLabel,
            classification = label,
            classificationKind = kind,
            zScore = null,
            percentile = null,
            flagged = false,
            referenceStandard = "WHO adult BMI classification",
            referenceVersion = "WHO adult BMI cut-offs (18.5 / 25 / 30), current WHO guidance",
            disclaimer = "Adult WHO BMI screening bands (applied from 19 y 1 m, where the WHO 5–19-year reference ends). $BMI_SCREENING_NOTE",
        )
    }

    fun assessStudentBmi(student: Student, measurementDate: String = DomainEngine.todayKey()): BmiAssessment =
        assessBmi(
            weightKg = student.weightKg,
            heightCm = student.heightCm,
            dateOfBirth = student.dateOfBirth,
            gender = student.gender,
            measurementDate = measurementDate,
        )

    fun latestUsableMeasurement(rows: List<Measurement>): Measurement? =
        rows.sortedByDescending { it.date }.firstOrNull { it.heightCm != null && it.weightKg != null }

    fun assessCurrentBmi(student: Student, history: List<Measurement>): BmiAssessment {
        val latest = latestUsableMeasurement(history)
        return if (latest != null) {
            assessBmi(
                weightKg = latest.weightKg,
                heightCm = latest.heightCm,
                dateOfBirth = student.dateOfBirth,
                gender = student.gender,
                measurementDate = latest.date,
            )
        } else {
            assessStudentBmi(student, DomainEngine.todayKey())
        }
    }

    fun weightBandFor(
        heightCm: Double?,
        dateOfBirth: String?,
        gender: String?,
        measurementDate: String = DomainEngine.todayKey(),
    ): WeightBand? {
        if (heightCm == null || !heightCm.isFinite() || heightCm <= 0.0) return null
        val dob = DomainEngine.parseLocalDate(dateOfBirth) ?: return null
        val md = DomainEngine.parseLocalDate(measurementDate) ?: LocalDate.now()
        val days = ChronoUnit.DAYS.between(dob, md)
        if (days < 0) return null
        val ageMonths = days / DAYS_PER_MONTH
        val m2 = (heightCm / 100.0).pow(2)

        if (ageMonths >= WHO_BFA_MAX_MONTHS_EXCLUSIVE) {
            return WeightBand(
                lo = (18.5 * m2).roundToInt(),
                hi = (24.9 * m2).roundToInt(),
                note = "adult BMI 18.5–24.9 scale",
            )
        }
        if (ageMonths < WHO_BFA_MIN_MONTHS) return null
        val sex = normalizeSex(gender) ?: return null
        val lms = interpolateLms(sex, ageMonths) ?: return null
        return WeightBand(
            lo = (bmiAtZ(lms, -2.0) * m2).roundToInt(),
            hi = (bmiAtZ(lms, 1.0) * m2).roundToInt(),
            note = "BMI-for-age −2 SD to +1 SD (WHO 2007)",
        )
    }

    fun formatPercentile(p: Double): String {
        val v = p.roundToInt()
        if (v <= 0) return "<1st"
        if (v >= 100) return ">99th"
        val rem10 = v % 10
        val rem100 = v % 100
        val suffix = when {
            rem10 == 1 && rem100 != 11 -> "st"
            rem10 == 2 && rem100 != 12 -> "nd"
            rem10 == 3 && rem100 != 13 -> "rd"
            else -> "th"
        }
        return "$v$suffix"
    }

    fun presentBmi(assessment: BmiAssessment): BmiPresentation {
        if (assessment is BmiAssessment.Failure) {
            if (assessment.issues.all { it == BmiIssue.MISSING_WEIGHT || it == BmiIssue.MISSING_HEIGHT }) {
                return BmiPresentation("—", "enter height & weight", "slate", assessment.message)
            }
            if (assessment.issues.any { it == BmiIssue.MISSING_DOB || it == BmiIssue.INVALID_DOB || it == BmiIssue.MISSING_MEASUREMENT_DATE }) {
                return BmiPresentation("—", "add date of birth", "slate", assessment.message)
            }
            return BmiPresentation("—", "check measurements", "slate", assessment.message)
        }
        val a = assessment as BmiAssessment.Ok
        val value = "%.1f".format(Locale.US, a.bmiRounded)
        val tone = when (a.classificationKind) {
            "healthy", "healthy-weight", "normal-weight" -> "emerald"
            "underweight", "overweight", "thinness" -> "amber"
            "obesity", "severe-thinness" -> "rose"
            else -> "slate"
        }
        if (a.method == BmiMethod.WHO_5_19 && a.classification != null) {
            val pct = a.percentile?.let { formatPercentile(it) } ?: "—"
            val z = a.zScore?.let { "%.1f".format(Locale.US, it) } ?: "—"
            val flagText = if (a.flagged) " · IMPLAUSIBLE (|z|>5)" else ""
            return BmiPresentation(
                value = value,
                label = a.classification,
                tone = tone,
                hint = "WHO 5–19 BMI-for-age · BAZ $z · $pct percentile · age ${a.ageLabel}$flagText",
            )
        }
        if (a.method == BmiMethod.ADULT_20PLUS && a.classification != null) {
            return BmiPresentation(
                value = value,
                label = a.classification,
                tone = tone,
                hint = "Adult WHO bands · age ${a.ageLabel}",
            )
        }
        return BmiPresentation(
            value = value,
            label = "no category",
            tone = "slate",
            hint = a.disclaimer,
        )
    }

    fun bmiReportFields(student: Student): BmiReportFields {
        val a = assessStudentBmi(student)
        if (a !is BmiAssessment.Ok) return BmiReportFields("—", "—", "—")
        val value = "%.1f".format(Locale.US, a.bmiRounded)
        val classification = a.classification ?: "—"
        val combined = if (classification == "—") value else "$value ($classification)"
        return BmiReportFields(value, classification, combined)
    }

    private fun fail(issues: List<BmiIssue>): BmiAssessment.Failure = BmiAssessment.Failure(
        issues = issues,
        message = "BMI cannot be assessed — ${issues.joinToString("; ") { it.description }}.",
    )
}
