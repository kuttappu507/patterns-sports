package `in`.patternsports.ams.domain

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth
import java.util.Locale

// ============================================================
// PS-AMS :: Demo Dataset (12 Kerala athletes, 7 committee members,
// 8 achievements, multi-month fee payments, and attendance)
// 1:1 parity with src/lib/psams/demo-data.ts
// ============================================================

data class DemoStudentSeed(
    val fullName: String,
    val registeredMonthsAgo: Int,
    val dobYear: Int,
    val dobMonth: Int,
    val dobDay: Int,
    val parentName: String,
    val mobile: String,
    val emergencyContact: String? = null,
    val address: String,
    val schoolName: String,
    val classGrade: String,
    val division: String,
    val bloodGroup: String,
    val gender: String,
    val heightCm: Double? = null,
    val weightKg: Double? = null,
    val standingReachCm: Double? = null,
    val spikeReachCm: Double? = null,
    val jumpReachCm: Double? = null,
    val primarySport: String,
    val playingPosition: String? = null,
    val ageCategory: String,
    val trainingBatch: String,
    val monthlyFee: Double,
    val backlogMonths: Int,
)

data class DemoCommitteeSeed(
    val fullName: String,
    val role: String,
    val phone: String,
    val responsibilities: String,
    val displayOrder: Int,
)

data class DemoAchievementSeed(
    val student: String,
    val tournamentName: String,
    val eventDateMonthsAgo: Int,
    val level: String,
    val medal: String,
    val notes: String? = null,
)

data class DemoPaymentPlan(
    val months: List<String>,
    val paymentDate: LocalDate,
    val amount: Double,
    val paymentMode: String,
)

object DemoData {

    val DEMO_COMMITTEE: List<DemoCommitteeSeed> = listOf(
        DemoCommitteeSeed("Suresh Kumar Pillai", "President", "+91 94470 12345", "Overall academy governance and external liaison", 0),
        DemoCommitteeSeed("Pradeep Varma", "Vice President", "+91 94470 51234", "Event partnerships and academy outreach", 1),
        DemoCommitteeSeed("Anitha Raghavan", "General Secretary", "+91 98470 22334", "Day-to-day administration, tournaments and records", 2),
        DemoCommitteeSeed("Vinod Joseph", "Joint Secretary", "+91 98470 62234", "Attendance registers and member communications", 3),
        DemoCommitteeSeed("Rajesh Menon", "Treasurer", "+91 99461 55667", "Fee oversight, budgets and annual audit", 4),
        DemoCommitteeSeed("Deepa Krishnan", "Executive Member", "+91 94950 33445", "Coaching coordination and camp logistics", 5),
        DemoCommitteeSeed("Vikram Shetty", "Executive Member", "+91 96330 77889", "Equipment, ground maintenance and transport", 6),
    )

    val DEMO_SETTINGS: Map<String, String> = mapOf(
        "academyName" to "Pattern Sports Academy",
        "tagline" to "Building Champions, One Serve at a Time",
        "address" to ACADEMY_ADDRESS,
        "phone" to "+91 484 220 1100",
        "email" to "office@patternsportsacademy.in",
        "defaultMonthlyFee" to "500",
        "receiptSignatory" to "Anitha Raghavan · General Secretary",
    )

    val DEMO_STUDENTS: List<DemoStudentSeed> = listOf(
        DemoStudentSeed("Aravind R Menon", 8, 2011, 5, 14, "Ramesh Menon", "9847012001", "9847012002", "Kaloor, Ernakulam", "Bhavans Vidya Mandir", "9", "A", "O+", "Male", 168.0, 52.0, 216.0, 248.0, 270.0, "Volleyball", "Attacker / Spiker", "Junior", "Evening", 600.0, 0),
        DemoStudentSeed("Nandhana Suresh", 8, 2013, 9, 2, "Suresh Babu", "9847012003", null, "Kadavanthra, Ernakulam", "Rajagiri Christu Jayanthi", "7", "B", "A+", "Female", 155.0, 41.0, 198.0, 228.0, 252.0, "Volleyball", "Setter", "Sub-Junior", "Evening", 500.0, 0),
        DemoStudentSeed("Muhammed Sinan", 7, 2009, 12, 21, "Abdul Nazar", "9847012004", "9946012004", "Aluva", "Chinmaya Vidyalaya", "11", "C", "B+", "Male", 178.0, 63.0, 228.0, 262.0, 285.0, "Volleyball", "Blocker", "Youth", "Morning", 600.0, 1),
        DemoStudentSeed("Diya Krishnan", 6, 2017, 3, 18, "Krishnan Unni", "9847012005", null, "Tripunithura", "Bhavans Vidya Mandir", "3", "A", "AB+", "Female", 124.0, 23.0, null, null, null, "Badminton", "Singles", "Mini", "Morning", 400.0, 0),
        DemoStudentSeed("Joel Thomas", 6, 2006, 7, 8, "Thomas Varghese", "9847012006", null, "Edappally", "St. Alberts HSS", "12", "B", "O-", "Male", 185.0, 71.0, 238.0, 272.0, 296.0, "Volleyball", "Universal", "Senior", "Evening", 700.0, 2),
        DemoStudentSeed("Sneha Prakash", 5, 2012, 1, 25, "Prakash Nair", "9847012007", null, "Vyttila", "Nirmala Public School", "8", "A", "B-", "Female", 158.0, 44.0, 202.0, 234.0, null, "Volleyball", "Libero", "Sub-Junior", "Morning", 500.0, 3),
        DemoStudentSeed("Adithya Raj", 5, 2010, 10, 11, "Rajesh Kumar", "9847012008", null, "Palarivattom", "Bhavans Vidya Mandir", "10", "B", "A-", "Male", 172.0, 58.0, 222.0, 256.0, 278.0, "Basketball", "Power Forward", "Junior", "Evening", 600.0, 0),
        DemoStudentSeed("Fathima Rasheed", 4, 2014, 6, 30, "Rasheed KP", "9847012009", "9744012009", "Mattancherry", "Crescent Public School", "6", "C", "O+", "Female", 147.0, 36.0, null, null, null, "Athletics", "Sprint", "Sub-Junior", "Morning", 450.0, 1),
        DemoStudentSeed("Karthik S Nair", 3, 2008, 2, 9, "Santhosh Nair", "9847012010", null, "Kakkanad", "Rajagiri Christu Jayanthi", "12", "A", "AB-", "Male", 181.0, 66.0, 232.0, 266.0, 288.0, "Volleyball", "Setter", "Youth", "Evening", 600.0, 0),
        DemoStudentSeed("Lakshmi Warrier", 2, 2016, 11, 5, "Ajith Warrier", "9847012011", null, "Fort Kochi", "Sacred Heart CMI", "4", "B", "A+", "Female", 132.0, 27.0, null, null, null, "Badminton", "Doubles", "Mini", "Morning", 400.0, 2),
        DemoStudentSeed("Reuben Jacob", 2, 2007, 4, 27, "Jacob Cherian", "9847012012", null, "Thrikkakara", "Bhavans Vidya Mandir", "11", "B", "B+", "Male", 176.0, 61.0, 226.0, 259.0, null, "Volleyball", "Attacker / Spiker", "Junior", "Evening", 600.0, 0),
        DemoStudentSeed("Ananya Sasi", 1, 2011, 8, 16, "Sasi Kumar", "9847012013", null, "Maradu", "Nirmala Public School", "9", "C", "O+", "Female", 162.0, 47.0, 208.0, 240.0, 262.0, "Volleyball", "Blocker", "Junior", "Morning", 600.0, 0),
    )

    val DEMO_ACHIEVEMENTS: List<DemoAchievementSeed> = listOf(
        DemoAchievementSeed("Aravind R Menon", "Kerala State Inter-School Volleyball Championship", 3, "State", "Silver", "Represented the academy squad"),
        DemoAchievementSeed("Aravind R Menon", "Ernakulam District Youth League", 8, "District", "Bronze"),
        DemoAchievementSeed("Joel Thomas", "Kerala State Inter-School Volleyball Championship", 3, "State", "Gold", "Captained the academy squad"),
        DemoAchievementSeed("Joel Thomas", "Ernakulam District Youth League", 8, "District", "Bronze"),
        DemoAchievementSeed("Nandhana Suresh", "Kerala State Sub-Junior Volleyball Championship", 3, "State", "Silver", "Best setter of the tournament"),
        DemoAchievementSeed("Nandhana Suresh", "Ernakulam District Youth League", 8, "District", "Bronze"),
        DemoAchievementSeed("Karthik S Nair", "Kerala State Youth Volleyball Championship", 3, "State", "Silver", "Represented the academy squad"),
        DemoAchievementSeed("Karthik S Nair", "Ernakulam District Youth League", 8, "District", "Bronze"),
    )

    fun demoDob(s: DemoStudentSeed): String =
        "%04d-%02d-%02d".format(Locale.US, s.dobYear, s.dobMonth, s.dobDay)

    fun demoRegistrationDate(s: DemoStudentSeed, now: LocalDate = LocalDate.now()): LocalDate {
        val ym = YearMonth.of(now.year, now.monthValue).minusMonths(s.registeredMonthsAgo.toLong())
        return LocalDate.of(ym.year, ym.monthValue, 12)
    }

    fun planDemoPayments(s: DemoStudentSeed, now: LocalDate = LocalDate.now()): List<DemoPaymentPlan> {
        val reg = demoRegistrationDate(s, now)
        val start = YearMonth.of(reg.year, reg.monthValue).plusMonths(1)
        val lastPaid = YearMonth.of(now.year, now.monthValue).minusMonths(s.backlogMonths.toLong())

        val months = mutableListOf<String>()
        var cur = start
        while (!cur.isAfter(lastPaid)) {
            months.add("%04d-%02d".format(Locale.US, cur.year, cur.monthValue))
            cur = cur.plusMonths(1)
        }

        val plans = mutableListOf<DemoPaymentPlan>()
        var i = 0
        while (i < months.size) {
            val chunk = months.subList(i, minOf(i + 3, months.size))
            if (chunk.isNotEmpty()) {
                val lastKey = chunk.last().split("-")
                val y = lastKey[0].toInt()
                val m = lastKey[1].toInt()
                plans.add(
                    DemoPaymentPlan(
                        months = chunk,
                        paymentDate = LocalDate.of(y, m, 12),
                        amount = chunk.size * s.monthlyFee,
                        paymentMode = PAYMENT_MODES[(i / 3) % PAYMENT_MODES.size],
                    )
                )
            }
            i += 3
        }
        return plans
    }

    fun planDemoAttendance(
        s: DemoStudentSeed,
        days: Int = 3,
        now: LocalDate = LocalDate.now(),
    ): List<Pair<String, String>> {
        val rows = mutableListOf<Pair<String, String>>()
        var seed = s.fullName.length * 7 + 3
        var taken = 0
        var back = 0L
        while (back < 10L && taken < days) {
            val day = now.minusDays(back)
            back++
            if (day.dayOfWeek == DayOfWeek.SUNDAY) continue
            seed = (seed * 31 + 7) % 100
            val dateStr = "%04d-%02d-%02d".format(Locale.US, day.year, day.monthValue, day.dayOfMonth)
            val status = if (seed > 15) "Present" else "Absent"
            rows.add(dateStr to status)
            taken++
        }
        return rows
    }
}
