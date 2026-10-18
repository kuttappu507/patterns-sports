package `in`.patternsports.ams.domain

// ============================================================
// PS-AMS :: Shared Domain Models & Constants
// 1:1 parity with src/lib/psams/types.ts and prisma/schema.prisma
// ============================================================

val AGE_CATEGORIES = listOf("Mini", "Sub-Junior", "Junior", "Youth", "Senior")

val PAYMENT_MODES = listOf("Cash", "UPI / GPay", "Bank Transfer")

val MEDAL_TYPES = listOf("Gold", "Silver", "Bronze", "Participation", "None")

val ACHIEVEMENT_LEVELS = listOf("School", "District", "State", "National")

val COMMITTEE_ROLES = listOf(
    "President",
    "Vice President",
    "General Secretary",
    "Joint Secretary",
    "Treasurer",
    "Executive Member",
)

val TRAINING_BATCHES = listOf("Morning", "Evening")

val SPORT_POSITIONS: Map<String, List<String>> = linkedMapOf(
    "Volleyball" to listOf("Setter", "Attacker / Spiker", "Libero", "Blocker", "Universal"),
    "Basketball" to listOf("Point Guard", "Shooting Guard", "Small Forward", "Power Forward", "Center"),
    "Football" to listOf("Goalkeeper", "Defender", "Midfielder", "Winger", "Striker"),
    "Athletics" to listOf("Sprint", "Middle Distance", "Long Distance", "Jumps", "Throws"),
    "Kabaddi" to listOf("Raider", "Defender", "All-Rounder"),
    "Badminton" to listOf("Singles", "Doubles", "Mixed Doubles"),
    "Cricket" to listOf("Batter", "Bowler", "All-Rounder", "Wicket-Keeper"),
    "Table Tennis" to listOf("Attacker", "Defender", "All-Rounder"),
)

val PRIMARY_SPORTS: List<String> = SPORT_POSITIONS.keys.toList()

val PLAYING_POSITIONS: List<String> = SPORT_POSITIONS.values.flatten().distinct()

val BLOOD_GROUPS = listOf("A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-")

val GENDERS = listOf("Male", "Female", "Other")

val STUDENT_STATUSES = listOf("Active", "Inactive", "Alumni")

enum class NavView {
    DASHBOARD,
    STUDENTS,
    STUDENT_DETAIL,
    FEES,
    ATTENDANCE,
    REPORTS,
    SETTINGS,
}

data class Student(
    val id: String,
    val admissionNo: String,
    val fullName: String,
    val dateOfBirth: String,
    val registrationDate: String,
    val parentName: String,
    val mobile: String,
    val emergencyContact: String? = null,
    val address: String = "",
    val schoolName: String = "",
    val classGrade: String = "",
    val division: String = "",
    val bloodGroup: String = "",
    val gender: String = "",
    val heightCm: Double? = null,
    val weightKg: Double? = null,
    val standingReachCm: Double? = null,
    val spikeReachCm: Double? = null,
    val jumpReachCm: Double? = null,
    val primarySport: String = "Volleyball",
    val playingPosition: String? = null,
    val ageCategory: String,
    val trainingBatch: String = "Evening",
    val monthlyFee: Double = 0.0,
    val photoPath: String? = null,
    val birthCertPath: String? = null,
    val idCardPath: String? = null,
    val status: String = "Active",
    val notes: String? = null,
    val createdAt: String,
    val updatedAt: String,
)

data class StudentInput(
    val admissionNo: String? = null,
    val fullName: String,
    val dateOfBirth: String,
    val registrationDate: String? = null,
    val parentName: String,
    val mobile: String,
    val emergencyContact: String? = null,
    val address: String = "",
    val schoolName: String = "",
    val classGrade: String = "",
    val division: String = "",
    val bloodGroup: String = "",
    val gender: String = "Male",
    val heightCm: Double? = null,
    val weightKg: Double? = null,
    val standingReachCm: Double? = null,
    val spikeReachCm: Double? = null,
    val jumpReachCm: Double? = null,
    val primarySport: String = "Volleyball",
    val playingPosition: String? = null,
    val ageCategory: String,
    val trainingBatch: String = "Evening",
    val monthlyFee: Double = 500.0,
    val photoPath: String? = null,
    val birthCertPath: String? = null,
    val idCardPath: String? = null,
    val status: String = "Active",
    val notes: String? = null,
)

data class StudentFilters(
    val q: String? = null,
    val category: String? = null,
    val gender: String? = null,
    val batch: String? = null,
    val sport: String? = null,
    val position: String? = null,
    val school: String? = null,
    val status: String? = null,
    val minHeight: Double? = null,
    val minAge: Int? = null,
    val maxAge: Int? = null,
)

data class Achievement(
    val id: String,
    val studentId: String,
    val tournamentName: String,
    val eventDate: String,
    val level: String = "School",
    val medal: String = "None",
    val certificatePath: String? = null,
    val notes: String? = null,
    val createdAt: String,
)

data class AchievementInput(
    val tournamentName: String,
    val eventDate: String,
    val level: String = "District",
    val medal: String = "Gold",
    val certificatePath: String? = null,
    val notes: String? = null,
)

data class RecentAchievement(
    val id: String,
    val studentId: String,
    val tournamentName: String,
    val eventDate: String,
    val level: String,
    val medal: String,
    val certificatePath: String? = null,
    val notes: String? = null,
    val studentName: String,
    val ageCategory: String,
)

data class Measurement(
    val id: String,
    val studentId: String,
    val date: String,
    val heightCm: Double? = null,
    val weightKg: Double? = null,
    val standingReachCm: Double? = null,
    val spikeReachCm: Double? = null,
    val jumpReachCm: Double? = null,
    val notes: String? = null,
    val createdAt: String,
)

data class MeasurementInput(
    val date: String,
    val heightCm: Double? = null,
    val weightKg: Double? = null,
    val standingReachCm: Double? = null,
    val spikeReachCm: Double? = null,
    val jumpReachCm: Double? = null,
    val notes: String? = null,
)

data class FeePayment(
    val id: String,
    val receiptNo: String,
    val studentId: String,
    val amount: Double,
    val months: String, // JSON array of "YYYY-MM"
    val paymentDate: String,
    val paymentMode: String = "Cash",
    val remarks: String? = null,
    val createdAt: String,
    val studentName: String? = null,
    val admissionNo: String? = null,
    val ageCategory: String? = null,
    val gender: String? = null,
)

data class PaymentMonth(
    val id: String,
    val studentId: String,
    val month: String,
    val paymentId: String,
)

data class StudentFeeStatus(
    val student: Student,
    val paidMonths: List<String>,
    val pendingMonths: List<String>,
    val overdueMonths: List<String>,
    val dueAmount: Double,
    val isDefaulter: Boolean,
    val lastPayment: FeePayment? = null,
)

data class StudentDetail(
    val student: Student,
    val achievements: List<Achievement>,
    val payments: List<FeePayment>,
    val measurements: List<Measurement>,
    val paidMonths: List<String>,
    val pendingMonths: List<String>,
    val overdueMonths: List<String>,
    val dueAmount: Double,
    val isDefaulter: Boolean,
    val lastPayment: FeePayment? = null,
)

data class FeeOverview(
    val statuses: List<StudentFeeStatus>,
    val payments: List<FeePayment>,
    val summary: Summary,
) {
    data class Summary(
        val monthlyRevenue: Double,
        val todayCollection: Double,
        val totalOutstanding: Double,
        val defaultersCount: Int,
    )
}

data class CommitteeMember(
    val id: String,
    val fullName: String,
    val role: String,
    val phone: String,
    val email: String? = null,
    val responsibilities: String? = null,
    val displayOrder: Int = 0,
    val createdAt: String,
)

data class CommitteeMemberInput(
    val fullName: String,
    val role: String,
    val phone: String,
    val email: String? = null,
    val responsibilities: String? = null,
    val displayOrder: Int = 0,
)

data class AttendanceRecord(
    val studentId: String,
    val date: String,
    val batch: String,
    val status: String, // "Present" | "Absent"
    val remarks: String? = null,
)

data class AttendanceRow(
    val student: Student,
    val status: String, // "Present" | "Absent" | "Unmarked"
    val remarks: String = "",
)

data class AttendanceData(
    val date: String,
    val rows: List<AttendanceRow>,
)

data class AcademySettings(
    val academyName: String,
    val tagline: String,
    val address: String,
    val phone: String,
    val email: String,
    val defaultMonthlyFee: Double,
    val receiptSignatory: String,
)

data class CategoryCount(
    val category: String,
    val count: Int,
)

data class BirthdayItem(
    val id: String,
    val fullName: String,
    val ageCategory: String,
    val dateOfBirth: String,
    val inDays: Int,
    val turningAge: Int,
)

data class DashboardData(
    val totals: Totals,
    val categoryBreakdown: List<CategoryCount>,
    val recentPayments: List<FeePayment>,
    val recentAchievements: List<RecentAchievement>,
    val committee: List<CommitteeMember>,
    val upcomingBirthdays: List<BirthdayItem>,
    val settings: AcademySettings,
    val hasDemoData: Boolean = false,
) {
    data class Totals(
        val totalStudents: Int,
        val activeStudents: Int,
        val inactiveStudents: Int,
        val monthlyRevenue: Double,
        val todayCollection: Double,
        val paidThisMonthCount: Int,
        val dueCount: Int,
        val defaultersCount: Int,
        val totalOutstandingAmount: Double,
        val presentToday: Int,
        val absentToday: Int,
    )
}

sealed class PrintPayload {
    data class ProfileCard(val detail: StudentDetail) : PrintPayload()
    data class FormalReceipt(val payment: FeePayment, val student: Student) : PrintPayload()
    data class PosReceipt(val payment: FeePayment, val student: Student) : PrintPayload()
    data class DefaultersReport(val rows: List<StudentFeeStatus>) : PrintPayload()
    data class FilteredReport(
        val students: List<Student>,
        val title: String,
        val subtitle: String,
    ) : PrintPayload()
    data class BlankAttendanceSheet(
        val students: List<Student>,
        val batch: String,
        val category: String,
        val monthLabel: String,
    ) : PrintPayload()
    data class PaymentHistoryReport(
        val payments: List<FeePayment>,
        val title: String,
        val subtitle: String,
    ) : PrintPayload()
}
