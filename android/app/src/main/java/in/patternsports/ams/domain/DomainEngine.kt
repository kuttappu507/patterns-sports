package `in`.patternsports.ams.domain

import java.text.NumberFormat
import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.roundToInt
import kotlin.math.roundToLong

// ============================================================
// PS-AMS :: Domain Logic Engine
// 1:1 parity with src/lib/psams/domain.ts & src/lib/psams/ledger.ts
// ============================================================

class ValidationError(message: String) : IllegalArgumentException(message)

const val APP_VERSION = "1.9.1"

/** The academy's real address — single shared letterhead default. */
const val ACADEMY_ADDRESS = "Markaz Colony, Karanthur, Kunnamangalam, Kozhikode, Kerala 673571"

val DEFAULT_SETTINGS = AcademySettings(
    academyName = "Pattern Sports Academy",
    tagline = "Building Champions, One Serve at a Time",
    address = ACADEMY_ADDRESS,
    phone = "+91 98470 00000",
    email = "office@patternsportsacademy.in",
    defaultMonthlyFee = 500.0,
    receiptSignatory = "General Secretary",
)

val NET_HEIGHT_M: Map<String, Double> = mapOf(
    "Mini" to 2.00,
    "Sub-Junior" to 2.15,
    "Junior" to 2.20,
    "Youth" to 2.35,
    "Senior" to 2.43,
)

private val DATE_ONLY_RE = Regex("""^\d{4}-\d{2}-\d{2}$""")
val MONTH_KEY_RE = Regex("""^\d{4}-(0[1-9]|1[0-2])$""")
val MOBILE_DIGITS_RE = Regex("""^(\d{10}|0\d{10}|91\d{10})$""")
private val SAFE_MEDIA_RE = Regex("""^(photos|documents|certificates)/[a-zA-Z0-9._-]+$""")

val ALLOWED_UPLOAD_EXT = setOf(".png", ".jpg", ".jpeg", ".webp", ".pdf")
val ALLOWED_UPLOAD_MIME = setOf("image/png", "image/jpeg", "image/webp", "application/pdf")
const val MAX_UPLOAD_BYTES = 10L * 1024L * 1024L

enum class FeeCycleBucket { PAID, DUE, DEFAULTER }

data class VerticalJumpRating(val label: String, val tone: String)

data class ComputedFeeStatus(
    val paidMonths: List<String>,
    val pendingMonths: List<String>,
    val overdueMonths: List<String>,
    val dueAmount: Double,
    val isDefaulter: Boolean,
    val lastPayment: FeePayment? = null,
)

data class LedgerAllocationPlan(
    val allocations: List<PaymentMonth>,
    val clashes: List<String>,
)

object DomainEngine {

    /**
     * Parse a date-only string ("YYYY-MM-DD") strictly as a real calendar day
     * (rejecting Feb-30, Feb-29 on non-leap years) or an ISO-8601 instant into
     * a LocalDate in the system's local timezone (PS-034).
     */
    fun parseLocalDate(raw: String?): LocalDate? {
        if (raw.isNullOrBlank()) return null
        val s = raw.trim()
        if (DATE_ONLY_RE.matches(s)) {
            val parts = s.split("-")
            val y = parts[0].toIntOrNull() ?: return null
            val m = parts[1].toIntOrNull() ?: return null
            val d = parts[2].toIntOrNull() ?: return null
            return try {
                val ym = YearMonth.of(y, m)
                if (d < 1 || d > ym.lengthOfMonth()) null else LocalDate.of(y, m, d)
            } catch (_: Exception) {
                null
            }
        }
        return try {
            Instant.parse(s).atZone(ZoneId.systemDefault()).toLocalDate()
        } catch (_: Exception) {
            try {
                if (s.length >= 10 && DATE_ONLY_RE.matches(s.substring(0, 10))) {
                    parseLocalDate(s.substring(0, 10))
                } else {
                    null
                }
            } catch (_: Exception) {
                null
            }
        }
    }

    /** Compute precise age in whole years from dateOfBirth at reference date `at`. */
    fun computeAge(dateOfBirth: String?, at: LocalDate = LocalDate.now()): Int {
        val dob = parseLocalDate(dateOfBirth) ?: return 0
        var age = at.year - dob.year
        val m = at.monthValue - dob.monthValue
        if (m < 0 || (m == 0 && at.dayOfMonth < dob.dayOfMonth)) {
            age--
        }
        return max(age, 0)
    }

    /** Detailed age like "14 yrs 3 mos". */
    fun ageDetailed(dateOfBirth: String?, at: LocalDate = LocalDate.now()): String {
        val dob = parseLocalDate(dateOfBirth) ?: return "—"
        var years = at.year - dob.year
        var months = at.monthValue - dob.monthValue
        if (at.dayOfMonth < dob.dayOfMonth) months--
        if (months < 0) {
            years--
            months += 12
        }
        if (years < 0) return "—"
        val y = "$years yr${if (years == 1) "" else "s"}"
        val mo = "$months mo${if (months == 1) "" else "s"}"
        return if (years > 0) "$y $mo" else mo
    }

    /** Suggest an age category from an age: Mini ≤9 · Sub-Junior 10–12 · Junior 13–15 · Youth 16–18 · Senior 19+ */
    fun suggestAgeCategory(age: Int): String = when {
        age <= 9 -> "Mini"
        age <= 12 -> "Sub-Junior"
        age <= 15 -> "Junior"
        age <= 18 -> "Youth"
        else -> "Senior"
    }

    /** Category bracket label e.g. "Sub-Junior (10–12)" */
    fun categoryBracket(category: String): String = when (category) {
        "Mini" -> "Mini (U-10)"
        "Sub-Junior" -> "Sub-Junior (10–12)"
        "Junior" -> "Junior (13–15)"
        "Youth" -> "Youth (16–18)"
        "Senior" -> "Senior (19+)"
        else -> category
    }

    // ---------- Vertical jump / reach & Sports Science ----------

    fun jumpDelta(spikeReachCm: Double?, standingReachCm: Double?): Double? {
        if (spikeReachCm == null || standingReachCm == null || spikeReachCm <= 0 || standingReachCm <= 0) return null
        return spikeReachCm - standingReachCm
    }

    fun spikeClearance(spikeReachCm: Double?, ageCategory: String?): Int? {
        if (spikeReachCm == null || spikeReachCm <= 0) return null
        val netM = NET_HEIGHT_M[ageCategory ?: ""] ?: NET_HEIGHT_M.getValue("Senior")
        return (spikeReachCm - netM * 100.0).roundToInt()
    }

    fun verticalJumpRating(gainCm: Double?): VerticalJumpRating {
        if (gainCm == null) return VerticalJumpRating("—", "slate")
        return when {
            gainCm < 40 -> VerticalJumpRating("Developing", "amber")
            gainCm < 50 -> VerticalJumpRating("Average", "blue")
            gainCm < 60 -> VerticalJumpRating("Good", "emerald")
            gainCm < 70 -> VerticalJumpRating("Excellent", "emerald")
            else -> VerticalJumpRating("Elite", "cyan")
        }
    }

    fun reachRatio(standingReachCm: Double?, heightCm: Double?): Double? {
        if (standingReachCm == null || heightCm == null || standingReachCm <= 0 || heightCm <= 0) return null
        return standingReachCm / heightCm
    }

    fun trainingAge(registrationDate: String?, at: LocalDate = LocalDate.now()): Int? {
        val reg = parseLocalDate(registrationDate) ?: return null
        val months = (at.year - reg.year) * 12 + (at.monthValue - reg.monthValue)
        return max(0, months)
    }

    // ---------- Billing months (YYYY-MM keys) ----------

    fun monthKey(date: LocalDate = LocalDate.now()): String =
        "%04d-%02d".format(Locale.US, date.year, date.monthValue)

    fun monthLabel(key: String): String {
        val parts = key.split("-")
        if (parts.size != 2) return key
        val y = parts[0].toIntOrNull() ?: return key
        val m = parts[1].toIntOrNull() ?: return key
        return try {
            val ym = YearMonth.of(y, m)
            ym.format(DateTimeFormatter.ofPattern("MMM yyyy", Locale.ENGLISH))
        } catch (_: Exception) {
            key
        }
    }

    fun monthsBetween(start: YearMonth, end: YearMonth = YearMonth.now()): List<String> {
        val keys = mutableListOf<String>()
        var cur = start
        while (!cur.isAfter(end)) {
            keys.add("%04d-%02d".format(Locale.US, cur.year, cur.monthValue))
            cur = cur.plusMonths(1)
        }
        return keys
    }

    fun parsePaidMonths(monthsJson: String?): List<String> {
        if (monthsJson.isNullOrBlank()) return emptyList()
        val trimmed = monthsJson.trim()
        if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return emptyList()
        val inner = trimmed.substring(1, trimmed.length - 1).trim()
        if (inner.isEmpty()) return emptyList()
        return inner.split(",")
            .map { it.trim().removeSurrounding("\"") }
            .filter { MONTH_KEY_RE.matches(it) }
    }

    fun encodePaidMonths(months: List<String>): String =
        months.joinToString(prefix = "[", postfix = "]", separator = ",") { "\"$it\"" }

    fun roundMoney(n: Double): Double =
        ((n + 1e-9) * 100.0).roundToLong() / 100.0

    /**
     * Compute the fee status of a student: billing starts the month AFTER the
     * registration month (joining month is complimentary), up to current month.
     * Zero-fee / fee-waiver students (monthlyFee <= 0) are always settled.
     */
    fun computeFeeStatus(
        student: Student,
        payments: List<FeePayment>,
        now: LocalDate = LocalDate.now(),
    ): ComputedFeeStatus {
        val regDate = parseLocalDate(student.registrationDate) ?: now
        val billingStart = YearMonth.of(regDate.year, regDate.monthValue).plusMonths(1)
        val currentYm = YearMonth.of(now.year, now.monthValue)
        val paidSet = linkedSetOf<String>()
        var lastPayment: FeePayment? = null
        var lastEpoch = Long.MIN_VALUE

        for (p in payments) {
            for (m in parsePaidMonths(p.months)) {
                paidSet.add(m)
            }
            val pDate = parseLocalDate(p.paymentDate)?.toEpochDay() ?: 0L
            if (lastPayment == null || pDate >= lastEpoch) {
                lastPayment = p
                lastEpoch = pDate
            }
        }

        if (student.monthlyFee <= 0.0) {
            return ComputedFeeStatus(
                paidMonths = paidSet.sorted(),
                pendingMonths = emptyList(),
                overdueMonths = emptyList(),
                dueAmount = 0.0,
                isDefaulter = false,
                lastPayment = lastPayment,
            )
        }

        val allBillable = monthsBetween(billingStart, currentYm).filter { !paidSet.contains(it) }
        val currentKey = monthKey(now)
        val pendingMonths = allBillable
        val overdueMonths = pendingMonths.filter { it < currentKey }
        val dueAmount = roundMoney(pendingMonths.size * student.monthlyFee)
        val isDefaulter = overdueMonths.size > 1

        return ComputedFeeStatus(
            paidMonths = paidSet.sorted(),
            pendingMonths = pendingMonths,
            overdueMonths = overdueMonths,
            dueAmount = dueAmount,
            isDefaulter = isDefaulter,
            lastPayment = lastPayment,
        )
    }

    fun hasPaidCurrentMonth(paidMonths: List<String>, now: LocalDate = LocalDate.now()): Boolean =
        paidMonths.contains(monthKey(now))

    fun classifyFeeCycle(status: ComputedFeeStatus): FeeCycleBucket = when {
        status.overdueMonths.size > 1 -> FeeCycleBucket.DEFAULTER
        status.pendingMonths.isNotEmpty() -> FeeCycleBucket.DUE
        else -> FeeCycleBucket.PAID
    }

    fun classifyFeeCycle(status: StudentFeeStatus): FeeCycleBucket = when {
        status.overdueMonths.size > 1 -> FeeCycleBucket.DEFAULTER
        status.pendingMonths.isNotEmpty() -> FeeCycleBucket.DUE
        else -> FeeCycleBucket.PAID
    }

    // ---------- Input Sanitizers & Validators ----------

    /** Normalize any phone keystroke/paste into at most 10 local Indian mobile digits (PS-033). */
    fun phoneDigits(value: String): String {
        var d = value.filter { it.isDigit() }
        while (d.length > 10) {
            d = when {
                d.startsWith("91") -> d.substring(2)
                d.startsWith("0") -> d.substring(1)
                else -> break
            }
        }
        return d.take(10)
    }

    fun intOnly(value: String, maxDigits: Int = 6): String =
        value.filter { it.isDigit() }.take(maxDigits)

    fun decimalOnly(value: String, maxDigits: Int = 5): String {
        val cleaned = value.filter { it.isDigit() || it == '.' }
        val dot = cleaned.indexOf('.')
        if (dot == -1) return cleaned.take(maxDigits)
        val intPart = cleaned.substring(0, dot).take(maxDigits)
        val fracPart = cleaned.substring(dot + 1).replace(".", "").take(2)
        return "$intPart.$fracPart"
    }

    fun assertValidStudentInput(input: StudentInput, now: LocalDate = LocalDate.now()) {
        if (input.fullName.isBlank()) throw ValidationError("Missing required field: fullName")
        if (input.dateOfBirth.isBlank()) throw ValidationError("Missing required field: dateOfBirth")
        if (input.parentName.isBlank()) throw ValidationError("Missing required field: parentName")
        if (input.mobile.isBlank()) throw ValidationError("Missing required field: mobile")
        if (input.ageCategory.isBlank()) throw ValidationError("Missing required field: ageCategory")

        val dob = parseLocalDate(input.dateOfBirth)
            ?: throw ValidationError("Date of birth is invalid or in the future")
        if (dob.isAfter(now)) {
            throw ValidationError("Date of birth is invalid or in the future")
        }
        val cleanMobile = input.mobile.filter { it.isDigit() }
        if (!MOBILE_DIGITS_RE.matches(cleanMobile)) {
            throw ValidationError("Mobile number must be 10 digits (country code / leading 0 accepted)")
        }
        if (!input.monthlyFee.isFinite() || input.monthlyFee < 0.0) {
            throw ValidationError("Monthly fee cannot be negative")
        }
        if (!input.registrationDate.isNullOrBlank()) {
            val reg = parseLocalDate(input.registrationDate)
                ?: throw ValidationError("Registration date is invalid")
            if (reg.isAfter(now)) {
                throw ValidationError("Registration date cannot be in the future")
            }
            if (reg.isBefore(dob)) {
                throw ValidationError("Registration date cannot be before the date of birth")
            }
        }
        val measures = listOf(
            input.heightCm,
            input.weightKg,
            input.standingReachCm,
            input.spikeReachCm,
            input.jumpReachCm
        )
        for (m in measures) {
            if (m != null && (!m.isFinite() || m <= 0.0 || m > 500.0)) {
                throw ValidationError("Height, weight and reach measurements must be positive numbers")
            }
        }
    }

    fun assertValidPayment(
        months: List<String>,
        amount: Double,
        monthlyFee: Double,
        alreadyPaidMonths: List<String> = emptyList(),
        registrationDate: String? = null,
        paymentDate: String? = null,
        paymentMode: String? = null,
        now: LocalDate = LocalDate.now(),
    ) {
        if (months.isEmpty()) {
            throw ValidationError("studentId and at least one billing month are required")
        }
        if (!months.all { MONTH_KEY_RE.matches(it) }) {
            throw ValidationError("Billing months must be in YYYY-MM format")
        }
        if (months.toSet().size != months.size) {
            throw ValidationError("Duplicate billing months in one payment are not allowed")
        }
        val currentKey = monthKey(now)
        if (!registrationDate.isNullOrBlank()) {
            val reg = parseLocalDate(registrationDate)
            if (reg != null) {
                val billingStartYm = YearMonth.of(reg.year, reg.monthValue).plusMonths(1)
                val billingStartKey = "%04d-%02d".format(Locale.US, billingStartYm.year, billingStartYm.monthValue)
                val tooEarly = months.filter { it < billingStartKey }
                if (tooEarly.isNotEmpty()) {
                    throw ValidationError(
                        "Billing starts ${monthLabel(billingStartKey)} (the joining month is complimentary) — cannot collect for ${tooEarly.joinToString(", ") { monthLabel(it) }}"
                    )
                }
                val future = months.filter { it > currentKey }
                if (future.isNotEmpty()) {
                    throw ValidationError(
                        "Cannot collect a future billing month — ${future.joinToString(", ") { monthLabel(it) }} has not started yet"
                    )
                }
            }
        }
        val paidSet = alreadyPaidMonths.toSet()
        val already = months.filter { paidSet.contains(it) }
        if (already.isNotEmpty()) {
            throw ValidationError(
                "Month already settled — a receipt exists for ${already.joinToString(", ") { monthLabel(it) }}"
            )
        }
        if (!amount.isFinite() || amount <= 0.0) {
            throw ValidationError("Collected amount must be greater than zero")
        }
        if (!paymentMode.isNullOrBlank() && !PAYMENT_MODES.contains(paymentMode)) {
            throw ValidationError("Payment mode must be one of: ${PAYMENT_MODES.joinToString(" | ")}")
        }
        if (!paymentDate.isNullOrBlank()) {
            val pd = parseLocalDate(paymentDate)
                ?: throw ValidationError("Receipt date must be a real calendar date in YYYY-MM-DD format")
            if (pd.isAfter(now)) {
                throw ValidationError("Receipt date cannot be in the future")
            }
            if (!registrationDate.isNullOrBlank()) {
                val reg = parseLocalDate(registrationDate)
                if (reg != null && pd.isBefore(reg)) {
                    throw ValidationError("Receipt date cannot be before the student's registration date")
                }
            }
        }
        val expected = roundMoney(months.size * monthlyFee)
        if (expected <= 0.0) {
            throw ValidationError("This student has no monthly fee to collect")
        }
        if (abs(roundMoney(amount) - expected) > 0.005) {
            throw ValidationError(
                "Amount must match the selected months — ${months.size} month${if (months.size == 1) "" else "s"} × ${formatINR(monthlyFee)} = ${formatINR(expected)}"
            )
        }
    }

    fun assertValidAttendanceRecords(
        records: List<AttendanceRecord>,
        now: LocalDate = LocalDate.now(),
    ) {
        if (records.size > 500) {
            throw ValidationError("Too many attendance records in one save (max 500)")
        }
        for (r in records) {
            if (r.studentId.isBlank()) throw ValidationError("Each attendance record needs a student")
            if (!DATE_ONLY_RE.matches(r.date)) {
                throw ValidationError("Attendance date must be a real calendar date in YYYY-MM-DD format")
            }
            val d = parseLocalDate(r.date)
                ?: throw ValidationError("Attendance date must be a real calendar date in YYYY-MM-DD format")
            if (d.isAfter(now)) {
                throw ValidationError("Attendance date cannot be in the future")
            }
            val b = r.batch.trim()
            if (b.isEmpty() || b.length > 40 || r.batch.any { it.code in 0..31 }) {
                throw ValidationError("Attendance batch must be a training batch name (max 40 characters)")
            }
            if (r.status != "Present" && r.status != "Absent") {
                throw ValidationError("Attendance status must be Present or Absent")
            }
        }
    }

    fun assertValidUpload(fileName: String, mimeType: String?, sizeBytes: Long) {
        if (sizeBytes > MAX_UPLOAD_BYTES) {
            throw ValidationError("File exceeds the 10 MB limit")
        }
        val safe = sanitizeFileName(fileName.ifBlank { "upload" })
        val dot = safe.lastIndexOf('.')
        val ext = if (dot >= 0) safe.substring(dot).lowercase(Locale.ROOT) else ""
        if (!ALLOWED_UPLOAD_EXT.contains(ext) || (!mimeType.isNullOrBlank() && !ALLOWED_UPLOAD_MIME.contains(mimeType))) {
            throw ValidationError("Unsupported file type — allowed: PNG, JPG, WEBP or PDF")
        }
    }

    // ---------- Numbering & Sequences ----------

    private fun maxSuffix(values: List<String>): Int {
        var maxVal = 0
        for (v in values) {
            val tail = v.substringAfterLast('-', "").toIntOrNull()
            if (tail != null && tail > maxVal) maxVal = tail
        }
        return maxVal
    }

    /** Next free admission number: PSA-<year>-NNNN */
    fun nextAdmissionNo(existing: List<String>, year: Int = LocalDate.now().year): String {
        val used = existing.toHashSet()
        var seq = maxSuffix(existing) + 1
        var candidate = "PSA-$year-%04d".format(Locale.US, seq)
        while (used.contains(candidate)) {
            seq++
            candidate = "PSA-$year-%04d".format(Locale.US, seq)
        }
        return candidate
    }

    /** Next free receipt number: RC-<YYYYMM>-NNNNN */
    fun nextReceiptNo(existing: List<String>, date: LocalDate = LocalDate.now()): String {
        val used = existing.toHashSet()
        val prefix = "RC-%04d%02d".format(Locale.US, date.year, date.monthValue)
        var seq = maxSuffix(existing) + 1
        var candidate = "$prefix-%05d".format(Locale.US, seq)
        while (used.contains(candidate)) {
            seq++
            candidate = "$prefix-%05d".format(Locale.US, seq)
        }
        return candidate
    }

    // ---------- Formatting ----------

    fun formatINR(amount: Double?): String {
        if (amount == null || !amount.isFinite()) return "₹0"
        val rounded = roundMoney(amount)
        val isWhole = abs(rounded - rounded.roundToLong()) < 0.005
        return if (isWhole) {
            "₹" + formatIndianInteger(rounded.roundToLong())
        } else {
            val nf = NumberFormat.getNumberInstance(Locale("en", "IN")).apply {
                maximumFractionDigits = 2
                minimumFractionDigits = 2
            }
            "₹" + nf.format(rounded)
        }
    }

    private fun formatIndianInteger(n: Long): String {
        val neg = n < 0
        val s = abs(n).toString()
        if (s.length <= 3) return (if (neg) "-" else "") + s
        val lastThree = s.substring(s.length - 3)
        val rest = s.substring(0, s.length - 3)
        val groups = mutableListOf<String>()
        var i = rest.length
        while (i > 0) {
            val start = max(0, i - 2)
            groups.add(0, rest.substring(start, i))
            i = start
        }
        return (if (neg) "-" else "") + groups.joinToString(",") + "," + lastThree
    }

    fun formatDate(raw: String?): String {
        val dt = parseLocalDate(raw) ?: return "—"
        return dt.format(DateTimeFormatter.ofPattern("dd MMM yyyy", Locale.ENGLISH))
    }

    fun todayKey(date: LocalDate = LocalDate.now()): String =
        "%04d-%02d-%02d".format(Locale.US, date.year, date.monthValue, date.dayOfMonth)

    /** Indian numbering — rupees in words for the formal receipt total. */
    fun inWords(n: Double): String {
        val ones = arrayOf(
            "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
            "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
            "Seventeen", "Eighteen", "Nineteen"
        )
        val tens = arrayOf(
            "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"
        )
        fun two(x: Int): String =
            if (x < 20) ones[x] else "${tens[x / 10]}${if (x % 10 != 0) " " + ones[x % 10] else ""}"
        fun three(x: Int): String =
            if (x >= 100) "${ones[x / 100]} Hundred${if (x % 100 != 0) " " + two(x % 100) else ""}" else two(x)

        val num = abs(n).roundToInt()
        if (num == 0) return "Zero Rupees Only"
        val parts = mutableListOf<String>()
        val crore = num / 10_000_000
        val lakh = (num % 10_000_000) / 100_000
        val thousand = (num % 100_000) / 1_000
        val rest = num % 1_000
        if (crore > 0) parts.add("${three(crore)} Crore")
        if (lakh > 0) parts.add("${three(lakh)} Lakh")
        if (thousand > 0) parts.add("${three(thousand)} Thousand")
        if (rest > 0) parts.add(three(rest))
        return "${parts.joinToString(" ")} Rupees Only"
    }

    fun sanitizeFileName(name: String): String {
        val replaced = name.replace(Regex("""[^a-zA-Z0-9._-]"""), "_")
            .replace(Regex("""_{2,}"""), "_")
        return if (replaced.length > 80) replaced.takeLast(80) else replaced
    }

    fun isSafeMediaPath(path: String?): Boolean {
        if (path.isNullOrBlank()) return false
        return SAFE_MEDIA_RE.matches(path)
    }

    /** Reconcile PaymentMonth allocation rows with FeePayment JSON months (PS-001). */
    fun planLedgerBackfill(
        payments: List<FeePayment>,
        existingAllocations: List<Pair<String, String>>, // (studentId, month)
    ): LedgerAllocationPlan {
        val booked = existingAllocations.map { "${it.first}::${it.second}" }.toMutableSet()
        val allocations = mutableListOf<PaymentMonth>()
        val clashes = mutableListOf<String>()

        for (p in payments) {
            for (m in parsePaidMonths(p.months)) {
                val key = "${p.studentId}::$m"
                if (booked.contains(key)) {
                    clashes.add(key)
                    continue
                }
                booked.add(key)
                allocations.add(
                    PaymentMonth(
                        id = "pm-${p.id}-$m",
                        studentId = p.studentId,
                        month = m,
                        paymentId = p.id,
                    )
                )
            }
        }
        return LedgerAllocationPlan(allocations = allocations, clashes = clashes)
    }
}
