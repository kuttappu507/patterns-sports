package `in`.patternsports.ams.data

import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.net.Uri
import android.provider.OpenableColumns
import `in`.patternsports.ams.domain.AGE_CATEGORIES
import `in`.patternsports.ams.domain.AcademySettings
import `in`.patternsports.ams.domain.Achievement
import `in`.patternsports.ams.domain.AchievementInput
import `in`.patternsports.ams.domain.AttendanceData
import `in`.patternsports.ams.domain.AttendanceRecord
import `in`.patternsports.ams.domain.AttendanceRow
import `in`.patternsports.ams.domain.BirthdayItem
import `in`.patternsports.ams.domain.CategoryCount
import `in`.patternsports.ams.domain.CommitteeMember
import `in`.patternsports.ams.domain.CommitteeMemberInput
import `in`.patternsports.ams.domain.DEFAULT_SETTINGS
import `in`.patternsports.ams.domain.DashboardData
import `in`.patternsports.ams.domain.DemoData
import `in`.patternsports.ams.domain.DomainEngine
import `in`.patternsports.ams.domain.FeeCycleBucket
import `in`.patternsports.ams.domain.FeeOverview
import `in`.patternsports.ams.domain.FeePayment
import `in`.patternsports.ams.domain.Measurement
import `in`.patternsports.ams.domain.MeasurementInput
import `in`.patternsports.ams.domain.RecentAchievement
import `in`.patternsports.ams.domain.Student
import `in`.patternsports.ams.domain.StudentDetail
import `in`.patternsports.ams.domain.StudentFeeStatus
import `in`.patternsports.ams.domain.StudentFilters
import `in`.patternsports.ams.domain.StudentInput
import `in`.patternsports.ams.domain.ValidationError
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth
import java.time.temporal.ChronoUnit
import java.util.Locale
import java.util.UUID

// ============================================================
// PS-AMS :: Complete Native Offline Repository + State Store
// 100% parity with src/lib/psams/tauri-api.ts & store.ts
// ============================================================

data class PsamsSnapshot(
    val dashboard: DashboardData? = null,
    val students: List<Student> = emptyList(),
    val feeOverview: FeeOverview? = null,
    val committee: List<CommitteeMember> = emptyList(),
    val settings: AcademySettings = DEFAULT_SETTINGS,
    val loading: Boolean = true,
)

class PsamsRepository(
    private val appContext: Context,
    val database: PsamsDatabase = PsamsDatabase(appContext),
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _snapshot = MutableStateFlow(PsamsSnapshot())
    val snapshot: StateFlow<PsamsSnapshot> = _snapshot.asStateFlow()

    init {
        scope.launch {
            refreshAll()
        }
    }

    suspend fun refreshAll() = withContext(Dispatchers.IO) {
        val settings = fetchSettingsSync()
        val students = fetchStudentsSync()
        val feeOverview = fetchFeeOverviewSync()
        val committee = fetchCommitteeSync()
        val dashboard = fetchDashboardSync()
        _snapshot.value = PsamsSnapshot(
            dashboard = dashboard,
            students = students,
            feeOverview = feeOverview,
            committee = committee,
            settings = settings,
            loading = false,
        )
    }

    // ---------- Mappers ----------

    private fun mapStudent(c: Cursor): Student = Student(
        id = c.getString(c.getColumnIndexOrThrow("id")),
        admissionNo = c.getString(c.getColumnIndexOrThrow("admissionNo")),
        fullName = c.getString(c.getColumnIndexOrThrow("fullName")),
        dateOfBirth = c.getString(c.getColumnIndexOrThrow("dateOfBirth")),
        registrationDate = c.getString(c.getColumnIndexOrThrow("registrationDate")),
        parentName = c.getString(c.getColumnIndexOrThrow("parentName")),
        mobile = c.getString(c.getColumnIndexOrThrow("mobile")),
        emergencyContact = c.getNullableString(c.getColumnIndexOrThrow("emergencyContact")),
        address = c.getNullableString(c.getColumnIndexOrThrow("address")) ?: "",
        schoolName = c.getNullableString(c.getColumnIndexOrThrow("schoolName")) ?: "",
        classGrade = c.getNullableString(c.getColumnIndexOrThrow("classGrade")) ?: "",
        division = c.getNullableString(c.getColumnIndexOrThrow("division")) ?: "",
        bloodGroup = c.getNullableString(c.getColumnIndexOrThrow("bloodGroup")) ?: "",
        gender = c.getNullableString(c.getColumnIndexOrThrow("gender")) ?: "",
        heightCm = c.getNullableDouble(c.getColumnIndexOrThrow("heightCm")),
        weightKg = c.getNullableDouble(c.getColumnIndexOrThrow("weightKg")),
        standingReachCm = c.getNullableDouble(c.getColumnIndexOrThrow("standingReachCm")),
        spikeReachCm = c.getNullableDouble(c.getColumnIndexOrThrow("spikeReachCm")),
        jumpReachCm = c.getNullableDouble(c.getColumnIndexOrThrow("jumpReachCm")),
        primarySport = c.getNullableString(c.getColumnIndexOrThrow("primarySport")) ?: "Volleyball",
        playingPosition = c.getNullableString(c.getColumnIndexOrThrow("playingPosition")),
        ageCategory = c.getString(c.getColumnIndexOrThrow("ageCategory")),
        trainingBatch = c.getNullableString(c.getColumnIndexOrThrow("trainingBatch")) ?: "Evening",
        monthlyFee = c.getDouble(c.getColumnIndexOrThrow("monthlyFee")),
        photoPath = c.getNullableString(c.getColumnIndexOrThrow("photoPath")),
        birthCertPath = c.getNullableString(c.getColumnIndexOrThrow("birthCertPath")),
        idCardPath = c.getNullableString(c.getColumnIndexOrThrow("idCardPath")),
        status = c.getNullableString(c.getColumnIndexOrThrow("status")) ?: "Active",
        notes = null,
        createdAt = c.getString(c.getColumnIndexOrThrow("createdAt")),
        updatedAt = c.getString(c.getColumnIndexOrThrow("updatedAt")),
    )

    private fun mapAchievement(c: Cursor): Achievement = Achievement(
        id = c.getString(c.getColumnIndexOrThrow("id")),
        studentId = c.getString(c.getColumnIndexOrThrow("studentId")),
        tournamentName = c.getString(c.getColumnIndexOrThrow("tournamentName")),
        eventDate = c.getNullableString(c.getColumnIndexOrThrow("eventDate")) ?: "",
        level = c.getNullableString(c.getColumnIndexOrThrow("level")) ?: "School",
        medal = c.getNullableString(c.getColumnIndexOrThrow("medal")) ?: "None",
        certificatePath = c.getNullableString(c.getColumnIndexOrThrow("certificatePath")),
        notes = c.getNullableString(c.getColumnIndexOrThrow("notes")),
        createdAt = c.getString(c.getColumnIndexOrThrow("createdAt")),
    )

    private fun mapPayment(c: Cursor): FeePayment = FeePayment(
        id = c.getString(c.getColumnIndexOrThrow("id")),
        receiptNo = c.getString(c.getColumnIndexOrThrow("receiptNo")),
        studentId = c.getString(c.getColumnIndexOrThrow("studentId")),
        amount = c.getDouble(c.getColumnIndexOrThrow("amount")),
        months = c.getString(c.getColumnIndexOrThrow("months")),
        paymentDate = c.getString(c.getColumnIndexOrThrow("paymentDate")),
        paymentMode = c.getNullableString(c.getColumnIndexOrThrow("paymentMode")) ?: "Cash",
        remarks = c.getNullableString(c.getColumnIndexOrThrow("notes")),
        createdAt = c.getString(c.getColumnIndexOrThrow("createdAt")),
    )

    private fun mapMeasurement(c: Cursor): Measurement = Measurement(
        id = c.getString(c.getColumnIndexOrThrow("id")),
        studentId = c.getString(c.getColumnIndexOrThrow("studentId")),
        date = c.getString(c.getColumnIndexOrThrow("date")),
        heightCm = c.getNullableDouble(c.getColumnIndexOrThrow("heightCm")),
        weightKg = c.getNullableDouble(c.getColumnIndexOrThrow("weightKg")),
        standingReachCm = null,
        spikeReachCm = null,
        jumpReachCm = null,
        notes = c.getNullableString(c.getColumnIndexOrThrow("source")),
        createdAt = c.getString(c.getColumnIndexOrThrow("createdAt")),
    )

    private fun mapCommittee(c: Cursor): CommitteeMember = CommitteeMember(
        id = c.getString(c.getColumnIndexOrThrow("id")),
        fullName = c.getString(c.getColumnIndexOrThrow("fullName")),
        role = c.getString(c.getColumnIndexOrThrow("role")),
        phone = c.getString(c.getColumnIndexOrThrow("phone")),
        email = null,
        responsibilities = c.getNullableString(c.getColumnIndexOrThrow("responsibilities")),
        displayOrder = c.getInt(c.getColumnIndexOrThrow("displayOrder")),
        createdAt = c.getString(c.getColumnIndexOrThrow("createdAt")),
    )

    // ---------- Students ----------

    suspend fun fetchStudents(filters: StudentFilters = StudentFilters()): List<Student> =
        withContext(Dispatchers.IO) { fetchStudentsSync(filters) }

    fun fetchStudentsSync(filters: StudentFilters = StudentFilters()): List<Student> {
        val db = database.readableDatabase
        val all = mutableListOf<Student>()
        db.rawQuery("SELECT * FROM Student ORDER BY fullName ASC", null).use { c ->
            while (c.moveToNext()) {
                all.add(mapStudent(c))
            }
        }
        val q = filters.q?.trim()?.lowercase(Locale.ROOT).orEmpty()
        val school = filters.school?.trim()?.lowercase(Locale.ROOT).orEmpty()

        return all.filter { s ->
            if (!filters.status.isNullOrBlank() && filters.status != "ALL" && s.status != filters.status) return@filter false
            if (!filters.category.isNullOrBlank() && filters.category != "ALL" && s.ageCategory != filters.category) return@filter false
            if (!filters.gender.isNullOrBlank() && filters.gender != "ALL" && s.gender != filters.gender) return@filter false
            if (!filters.batch.isNullOrBlank() && filters.batch != "ALL" && s.trainingBatch != filters.batch) return@filter false
            if (!filters.sport.isNullOrBlank() && filters.sport != "ALL" && s.primarySport != filters.sport) return@filter false
            if (!filters.position.isNullOrBlank() && filters.position != "ALL" && (s.playingPosition ?: "") != filters.position) return@filter false
            if (school.isNotEmpty() && !s.schoolName.lowercase(Locale.ROOT).contains(school)) return@filter false
            if (filters.minHeight != null && (s.heightCm ?: 0.0) < filters.minHeight) return@filter false
            if (filters.minAge != null || filters.maxAge != null) {
                val age = DomainEngine.computeAge(s.dateOfBirth)
                if (filters.minAge != null && age < filters.minAge) return@filter false
                if (filters.maxAge != null && age > filters.maxAge) return@filter false
            }
            if (q.isNotEmpty()) {
                val hay = listOf(
                    s.fullName,
                    s.admissionNo,
                    s.parentName,
                    s.mobile,
                    s.schoolName,
                    s.ageCategory,
                    s.playingPosition ?: "",
                ).joinToString(" ").lowercase(Locale.ROOT)
                if (!hay.contains(q)) return@filter false
            }
            true
        }
    }

    suspend fun fetchStudentDetail(id: String): StudentDetail = withContext(Dispatchers.IO) {
        fetchStudentDetailSync(id)
    }

    fun fetchStudentDetailSync(id: String): StudentDetail {
        val db = database.readableDatabase
        val student = db.rawQuery("SELECT * FROM Student WHERE id = ?", arrayOf(id)).use { c ->
            if (c.moveToFirst()) mapStudent(c) else throw ValidationError("Student not found")
        }
        val achievements = mutableListOf<Achievement>()
        db.rawQuery("SELECT * FROM Achievement WHERE studentId = ? ORDER BY eventDate DESC", arrayOf(id)).use { c ->
            while (c.moveToNext()) achievements.add(mapAchievement(c))
        }
        val payments = mutableListOf<FeePayment>()
        db.rawQuery("SELECT * FROM FeePayment WHERE studentId = ? ORDER BY paymentDate DESC", arrayOf(id)).use { c ->
            while (c.moveToNext()) payments.add(mapPayment(c))
        }
        val measurements = mutableListOf<Measurement>()
        db.rawQuery("SELECT * FROM Measurement WHERE studentId = ? ORDER BY date DESC, createdAt DESC", arrayOf(id)).use { c ->
            while (c.moveToNext()) measurements.add(mapMeasurement(c))
        }
        val feeStatus = DomainEngine.computeFeeStatus(student, payments)
        return StudentDetail(
            student = student,
            achievements = achievements,
            payments = payments,
            measurements = measurements,
            paidMonths = feeStatus.paidMonths,
            pendingMonths = feeStatus.pendingMonths,
            overdueMonths = feeStatus.overdueMonths,
            dueAmount = feeStatus.dueAmount,
            isDefaulter = feeStatus.isDefaulter,
            lastPayment = feeStatus.lastPayment,
        )
    }

    suspend fun createStudent(input: StudentInput): Student = withContext(Dispatchers.IO) {
        DomainEngine.assertValidStudentInput(input)
        val db = database.writableDatabase
        val existingNos = mutableListOf<String>()
        db.rawQuery("SELECT admissionNo FROM Student", null).use { c ->
            while (c.moveToNext()) existingNos.add(c.getString(0))
        }
        val admissionNo = if (!input.admissionNo.isNullOrBlank()) {
            val trimmed = input.admissionNo.trim()
            if (existingNos.contains(trimmed)) {
                throw ValidationError("Admission number $trimmed is already assigned to another student")
            }
            trimmed
        } else {
            DomainEngine.nextAdmissionNo(existingNos)
        }

        val id = UUID.randomUUID().toString()
        val nowIso = Instant.now().toString()
        val regDate = if (!input.registrationDate.isNullOrBlank()) input.registrationDate else nowIso

        db.beginTransaction()
        try {
            val cv = studentContentValues(id, admissionNo, input, regDate, nowIso, nowIso)
            db.insertOrThrow("Student", null, cv)

            if (input.heightCm != null || input.weightKg != null) {
                val mDate = regDate.take(10).ifBlank { DomainEngine.todayKey() }
                upsertMeasurementRow(
                    db = db,
                    studentId = id,
                    input = MeasurementInput(
                        date = mDate,
                        heightCm = input.heightCm,
                        weightKg = input.weightKg,
                        standingReachCm = input.standingReachCm,
                        spikeReachCm = input.spikeReachCm,
                        jumpReachCm = input.jumpReachCm,
                        notes = "create",
                    ),
                    nowIso = nowIso,
                )
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }

        refreshAll()
        db.rawQuery("SELECT * FROM Student WHERE id = ?", arrayOf(id)).use { c ->
            c.moveToFirst()
            mapStudent(c)
        }
    }

    suspend fun updateStudent(id: String, input: StudentInput): Student = withContext(Dispatchers.IO) {
        DomainEngine.assertValidStudentInput(input)
        val db = database.writableDatabase
        val existing = db.rawQuery("SELECT * FROM Student WHERE id = ?", arrayOf(id)).use { c ->
            if (c.moveToFirst()) mapStudent(c) else throw ValidationError("Student not found")
        }
        val nowIso = Instant.now().toString()
        val regDate = if (!input.registrationDate.isNullOrBlank()) input.registrationDate else existing.registrationDate

        db.beginTransaction()
        try {
            val cv = studentContentValues(
                id = id,
                admissionNo = input.admissionNo?.takeIf { it.isNotBlank() } ?: existing.admissionNo,
                input = input,
                registrationDate = regDate,
                createdAt = existing.createdAt,
                updatedAt = nowIso,
            )
            db.update("Student", cv, "id = ?", arrayOf(id))

            val metricsChanged = input.heightCm != existing.heightCm ||
                input.weightKg != existing.weightKg

            if (metricsChanged && (input.heightCm != null || input.weightKg != null)) {
                upsertMeasurementRow(
                    db = db,
                    studentId = id,
                    input = MeasurementInput(
                        date = DomainEngine.todayKey(),
                        heightCm = input.heightCm,
                        weightKg = input.weightKg,
                        standingReachCm = input.standingReachCm,
                        spikeReachCm = input.spikeReachCm,
                        jumpReachCm = input.jumpReachCm,
                        notes = "edit",
                    ),
                    nowIso = nowIso,
                )
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }

        for (oldPath in listOf(existing.photoPath, existing.birthCertPath, existing.idCardPath)) {
            if (!oldPath.isNullOrBlank() &&
                oldPath != input.photoPath &&
                oldPath != input.birthCertPath &&
                oldPath != input.idCardPath
            ) {
                removeMediaIfOrphaned(db, oldPath)
            }
        }

        refreshAll()
        db.rawQuery("SELECT * FROM Student WHERE id = ?", arrayOf(id)).use { c ->
            c.moveToFirst()
            mapStudent(c)
        }
    }

    suspend fun deleteStudent(id: String) = withContext(Dispatchers.IO) {
        val db = database.writableDatabase
        val existing = db.rawQuery("SELECT * FROM Student WHERE id = ?", arrayOf(id)).use { c ->
            if (c.moveToFirst()) mapStudent(c) else throw ValidationError("Student not found")
        }
        val receiptCount = db.rawQuery("SELECT COUNT(*) FROM FeePayment WHERE studentId = ?", arrayOf(id)).use { c ->
            if (c.moveToFirst()) c.getLong(0) else 0L
        }
        if (receiptCount > 0L) {
            throw ValidationError(
                "Cannot delete ${existing.fullName} — $receiptCount fee receipt${if (receiptCount == 1L) "" else "s"} on file. Mark the student as Inactive / Alumni to preserve the audit trail."
            )
        }
        val certPaths = mutableListOf<String>()
        db.rawQuery("SELECT certificatePath FROM Achievement WHERE studentId = ?", arrayOf(id)).use { c ->
            while (c.moveToNext()) {
                c.getNullableString(0)?.let { certPaths.add(it) }
            }
        }

        db.delete("Student", "id = ?", arrayOf(id))

        for (p in listOfNotNull(existing.photoPath, existing.birthCertPath, existing.idCardPath) + certPaths) {
            removeMediaIfOrphaned(db, p)
        }
        refreshAll()
    }

    private fun studentContentValues(
        id: String,
        admissionNo: String,
        input: StudentInput,
        registrationDate: String,
        createdAt: String,
        updatedAt: String,
    ): ContentValues = ContentValues().apply {
        put("id", id)
        put("admissionNo", admissionNo)
        put("fullName", input.fullName.trim())
        put("dateOfBirth", input.dateOfBirth.trim())
        put("registrationDate", registrationDate)
        put("parentName", input.parentName.trim())
        put("mobile", input.mobile.trim())
        if (!input.emergencyContact.isNullOrBlank()) put("emergencyContact", input.emergencyContact.trim()) else putNull("emergencyContact")
        put("address", input.address.trim())
        put("schoolName", input.schoolName.trim())
        put("classGrade", input.classGrade.trim())
        put("division", input.division.trim())
        put("bloodGroup", input.bloodGroup.trim())
        put("gender", input.gender.trim())
        if (input.heightCm != null) put("heightCm", input.heightCm) else putNull("heightCm")
        if (input.weightKg != null) put("weightKg", input.weightKg) else putNull("weightKg")
        if (input.standingReachCm != null) put("standingReachCm", input.standingReachCm) else putNull("standingReachCm")
        if (input.spikeReachCm != null) put("spikeReachCm", input.spikeReachCm) else putNull("spikeReachCm")
        if (input.jumpReachCm != null) put("jumpReachCm", input.jumpReachCm) else putNull("jumpReachCm")
        put("primarySport", input.primarySport.ifBlank { "Volleyball" })
        if (!input.playingPosition.isNullOrBlank()) put("playingPosition", input.playingPosition.trim()) else putNull("playingPosition")
        put("ageCategory", input.ageCategory.trim())
        put("trainingBatch", input.trainingBatch.ifBlank { "Evening" })
        put("monthlyFee", input.monthlyFee)
        if (!input.photoPath.isNullOrBlank()) put("photoPath", input.photoPath) else putNull("photoPath")
        if (!input.birthCertPath.isNullOrBlank()) put("birthCertPath", input.birthCertPath) else putNull("birthCertPath")
        if (!input.idCardPath.isNullOrBlank()) put("idCardPath", input.idCardPath) else putNull("idCardPath")
        put("status", input.status.ifBlank { "Active" })
        put("createdAt", createdAt)
        put("updatedAt", updatedAt)
    }

    // ---------- Measurements ----------

    suspend fun recordMeasurement(studentId: String, input: MeasurementInput): Measurement =
        withContext(Dispatchers.IO) {
            val db = database.writableDatabase
            val student = db.rawQuery("SELECT * FROM Student WHERE id = ?", arrayOf(studentId)).use { c ->
                if (c.moveToFirst()) mapStudent(c) else throw ValidationError("Student not found")
            }
            val d = DomainEngine.parseLocalDate(input.date)
                ?: throw ValidationError("Measurement date must be a real calendar date in YYYY-MM-DD format")
            if (d.isAfter(LocalDate.now())) {
                throw ValidationError("Measurement date cannot be in the future")
            }
            val dob = DomainEngine.parseLocalDate(student.dateOfBirth)
            if (dob != null && d.isBefore(dob)) {
                throw ValidationError("Measurement date cannot be before the student's date of birth")
            }
            if (input.heightCm == null && input.weightKg == null &&
                input.standingReachCm == null && input.spikeReachCm == null && input.jumpReachCm == null
            ) {
                throw ValidationError("Enter at least one measurement (height, weight, or reach)")
            }
            if (input.heightCm != null && (input.heightCm < 40.0 || input.heightCm > 272.0)) {
                throw ValidationError("Height must be between 40 and 272 cm")
            }
            if (input.weightKg != null && (input.weightKg < 2.0 || input.weightKg > 300.0)) {
                throw ValidationError("Weight must be between 2 and 300 kg")
            }

            val nowIso = Instant.now().toString()
            db.beginTransaction()
            val row: Measurement
            try {
                row = upsertMeasurementRow(db, studentId, input, nowIso)
                // Also update reach values on Student if provided
                val sCv = ContentValues().apply {
                    if (input.heightCm != null) put("heightCm", input.heightCm)
                    if (input.weightKg != null) put("weightKg", input.weightKg)
                    if (input.standingReachCm != null) put("standingReachCm", input.standingReachCm)
                    if (input.spikeReachCm != null) put("spikeReachCm", input.spikeReachCm)
                    if (input.jumpReachCm != null) put("jumpReachCm", input.jumpReachCm)
                    put("updatedAt", nowIso)
                }
                db.update("Student", sCv, "id = ?", arrayOf(studentId))
                syncLatestMeasurementToStudent(db, studentId, nowIso)
                db.setTransactionSuccessful()
            } finally {
                db.endTransaction()
            }
            refreshAll()
            row
        }

    suspend fun deleteMeasurement(id: String) = withContext(Dispatchers.IO) {
        val db = database.writableDatabase
        val existing = db.rawQuery("SELECT * FROM Measurement WHERE id = ?", arrayOf(id)).use { c ->
            if (c.moveToFirst()) mapMeasurement(c) else return@withContext
        }
        val nowIso = Instant.now().toString()
        db.beginTransaction()
        try {
            db.delete("Measurement", "id = ?", arrayOf(id))
            syncLatestMeasurementToStudent(db, existing.studentId, nowIso)
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
        refreshAll()
    }

    private fun upsertMeasurementRow(
        db: SQLiteDatabase,
        studentId: String,
        input: MeasurementInput,
        nowIso: String,
    ): Measurement {
        val dateStr = input.date.take(10)
        val existingId = db.rawQuery(
            "SELECT id FROM Measurement WHERE studentId = ? AND date = ?",
            arrayOf(studentId, dateStr)
        ).use { c -> if (c.moveToFirst()) c.getString(0) else null }

        val id = existingId ?: UUID.randomUUID().toString()
        val cv = ContentValues().apply {
            put("id", id)
            put("studentId", studentId)
            put("date", dateStr)
            if (input.heightCm != null) put("heightCm", input.heightCm) else putNull("heightCm")
            if (input.weightKg != null) put("weightKg", input.weightKg) else putNull("weightKg")
            put("source", input.notes?.takeIf { it.isNotBlank() } ?: "edit")
            put("createdAt", nowIso)
        }
        if (existingId != null) {
            db.update("Measurement", cv, "id = ?", arrayOf(id))
        } else {
            db.insertOrThrow("Measurement", null, cv)
        }
        return Measurement(
            id = id,
            studentId = studentId,
            date = dateStr,
            heightCm = input.heightCm,
            weightKg = input.weightKg,
            standingReachCm = input.standingReachCm,
            spikeReachCm = input.spikeReachCm,
            jumpReachCm = input.jumpReachCm,
            notes = input.notes,
            createdAt = nowIso,
        )
    }

    private fun syncLatestMeasurementToStudent(db: SQLiteDatabase, studentId: String, nowIso: String) {
        val latest = db.rawQuery(
            "SELECT * FROM Measurement WHERE studentId = ? ORDER BY date DESC, createdAt DESC LIMIT 1",
            arrayOf(studentId)
        ).use { c -> if (c.moveToFirst()) mapMeasurement(c) else null }

        if (latest != null) {
            val cv = ContentValues().apply {
                if (latest.heightCm != null) put("heightCm", latest.heightCm) else putNull("heightCm")
                if (latest.weightKg != null) put("weightKg", latest.weightKg) else putNull("weightKg")
                put("updatedAt", nowIso)
            }
            db.update("Student", cv, "id = ?", arrayOf(studentId))
        }
    }

    // ---------- Achievements ----------

    suspend fun createAchievement(studentId: String, input: AchievementInput): Achievement =
        withContext(Dispatchers.IO) {
            if (input.tournamentName.isBlank()) throw ValidationError("Tournament name is required")
            if (input.eventDate.isBlank()) throw ValidationError("Event date is required")
            val db = database.writableDatabase
            val id = UUID.randomUUID().toString()
            val nowIso = Instant.now().toString()
            val cv = ContentValues().apply {
                put("id", id)
                put("studentId", studentId)
                put("tournamentName", input.tournamentName.trim())
                put("eventDate", input.eventDate.trim())
                put("level", input.level.ifBlank { "District" })
                put("medal", input.medal.ifBlank { "Participation" })
                if (!input.certificatePath.isNullOrBlank()) put("certificatePath", input.certificatePath) else putNull("certificatePath")
                if (!input.notes.isNullOrBlank()) put("notes", input.notes.trim()) else putNull("notes")
                put("createdAt", nowIso)
            }
            db.insertOrThrow("Achievement", null, cv)
            refreshAll()
            Achievement(
                id = id,
                studentId = studentId,
                tournamentName = input.tournamentName.trim(),
                eventDate = input.eventDate.trim(),
                level = input.level.ifBlank { "District" },
                medal = input.medal.ifBlank { "Participation" },
                certificatePath = input.certificatePath,
                notes = input.notes,
                createdAt = nowIso,
            )
        }

    suspend fun deleteAchievement(id: String) = withContext(Dispatchers.IO) {
        val db = database.writableDatabase
        val certPath = db.rawQuery("SELECT certificatePath FROM Achievement WHERE id = ?", arrayOf(id)).use { c ->
            if (c.moveToFirst()) c.getNullableString(0) else null
        }
        db.delete("Achievement", "id = ?", arrayOf(id))
        if (!certPath.isNullOrBlank()) {
            removeMediaIfOrphaned(db, certPath)
        }
        refreshAll()
    }

    // ---------- Fees & Receipts ----------

    suspend fun fetchFeeOverview(): FeeOverview = withContext(Dispatchers.IO) {
        fetchFeeOverviewSync()
    }

    fun fetchFeeOverviewSync(): FeeOverview {
        val db = database.readableDatabase
        val students = mutableListOf<Student>()
        db.rawQuery("SELECT * FROM Student ORDER BY fullName ASC", null).use { c ->
            while (c.moveToNext()) students.add(mapStudent(c))
        }
        val studentMap = students.associateBy { it.id }

        val rawPayments = mutableListOf<FeePayment>()
        db.rawQuery("SELECT * FROM FeePayment ORDER BY paymentDate DESC, createdAt DESC", null).use { c ->
            while (c.moveToNext()) rawPayments.add(mapPayment(c))
        }
        val payments = rawPayments.map { p ->
            val st = studentMap[p.studentId]
            p.copy(
                studentName = st?.fullName ?: "—",
                admissionNo = st?.admissionNo ?: "—",
                ageCategory = st?.ageCategory ?: "—",
                gender = st?.gender ?: "—",
            )
        }

        val byStudent = payments.groupBy { it.studentId }
        val statuses = students
            .filter { it.status == "Active" }
            .map { s ->
                val list = byStudent[s.id].orEmpty()
                val fs = DomainEngine.computeFeeStatus(s, list)
                StudentFeeStatus(
                    student = s,
                    paidMonths = fs.paidMonths,
                    pendingMonths = fs.pendingMonths,
                    overdueMonths = fs.overdueMonths,
                    dueAmount = fs.dueAmount,
                    isDefaulter = fs.isDefaulter,
                    lastPayment = fs.lastPayment,
                )
            }

        val now = LocalDate.now()
        val monthPrefix = DomainEngine.monthKey(now)
        val todayPrefix = DomainEngine.todayKey(now)
        var monthlyRevenue = 0.0
        var todayCollection = 0.0

        for (p in payments) {
            val dStr = p.paymentDate.take(10)
            if (dStr.startsWith(monthPrefix)) monthlyRevenue += p.amount
            if (dStr == todayPrefix) todayCollection += p.amount
        }

        val totalOutstanding = statuses.sumOf { it.dueAmount }
        val defaultersCount = statuses.count { it.isDefaulter }

        return FeeOverview(
            statuses = statuses,
            payments = payments,
            summary = FeeOverview.Summary(
                monthlyRevenue = monthlyRevenue,
                todayCollection = todayCollection,
                totalOutstanding = totalOutstanding,
                defaultersCount = defaultersCount,
            ),
        )
    }

    suspend fun collectFee(
        studentId: String,
        months: List<String>,
        amount: Double,
        paymentMode: String = "Cash",
        remarks: String? = null,
        paymentDate: String? = null,
    ): FeePayment = withContext(Dispatchers.IO) {
        val db = database.writableDatabase
        val student = db.rawQuery("SELECT * FROM Student WHERE id = ?", arrayOf(studentId)).use { c ->
            if (c.moveToFirst()) mapStudent(c) else throw ValidationError("Student not found")
        }
        val existingPayments = mutableListOf<FeePayment>()
        db.rawQuery("SELECT * FROM FeePayment WHERE studentId = ?", arrayOf(studentId)).use { c ->
            while (c.moveToNext()) existingPayments.add(mapPayment(c))
        }
        val existingAllocMonths = mutableListOf<String>()
        db.rawQuery("SELECT month FROM PaymentMonth WHERE studentId = ?", arrayOf(studentId)).use { c ->
            while (c.moveToNext()) existingAllocMonths.add(c.getString(0))
        }

        val alreadyPaid = (
            existingPayments.flatMap { DomainEngine.parsePaidMonths(it.months) } +
                existingAllocMonths
            ).distinct()

        val sortedMonths = months.sorted()
        DomainEngine.assertValidPayment(
            months = sortedMonths,
            amount = amount,
            monthlyFee = student.monthlyFee,
            alreadyPaidMonths = alreadyPaid,
            registrationDate = student.registrationDate,
            paymentDate = paymentDate,
            paymentMode = paymentMode,
        )

        val pDateLocal = if (!paymentDate.isNullOrBlank()) {
            DomainEngine.parseLocalDate(paymentDate) ?: LocalDate.now()
        } else {
            LocalDate.now()
        }
        val pDateStr = paymentDate?.takeIf { it.isNotBlank() } ?: DomainEngine.todayKey(pDateLocal)
        val nowIso = Instant.now().toString()
        val monthsJson = DomainEngine.encodePaidMonths(sortedMonths)

        var createdPayment: FeePayment? = null
        var lastErr: Exception? = null

        for (attempt in 0 until 5) {
            val allReceipts = mutableListOf<String>()
            db.rawQuery("SELECT receiptNo FROM FeePayment", null).use { c ->
                while (c.moveToNext()) allReceipts.add(c.getString(0))
            }
            val receiptNo = DomainEngine.nextReceiptNo(allReceipts, pDateLocal)
            val id = UUID.randomUUID().toString()

            db.beginTransaction()
            try {
                val cv = ContentValues().apply {
                    put("id", id)
                    put("receiptNo", receiptNo)
                    put("studentId", studentId)
                    put("amount", DomainEngine.roundMoney(amount))
                    put("months", monthsJson)
                    put("paymentDate", pDateStr)
                    put("paymentMode", paymentMode)
                    if (!remarks.isNullOrBlank()) put("notes", remarks.trim()) else putNull("notes")
                    put("createdAt", nowIso)
                }
                db.insertOrThrow("FeePayment", null, cv)

                for (m in sortedMonths) {
                    val pmCv = ContentValues().apply {
                        put("id", "pm-$id-$m")
                        put("studentId", studentId)
                        put("month", m)
                        put("paymentId", id)
                    }
                    db.insertOrThrow("PaymentMonth", null, pmCv)
                }
                db.setTransactionSuccessful()
                createdPayment = FeePayment(
                    id = id,
                    receiptNo = receiptNo,
                    studentId = studentId,
                    amount = DomainEngine.roundMoney(amount),
                    months = monthsJson,
                    paymentDate = pDateStr,
                    paymentMode = paymentMode,
                    remarks = remarks,
                    createdAt = nowIso,
                    studentName = student.fullName,
                    admissionNo = student.admissionNo,
                    ageCategory = student.ageCategory,
                    gender = student.gender,
                )
                break
            } catch (e: Exception) {
                lastErr = e
                val msg = e.message.orEmpty()
                if (msg.contains("PaymentMonth.studentId, PaymentMonth.month")) {
                    throw ValidationError("One or more selected billing months were already settled on another receipt")
                }
                if (!msg.contains("FeePayment.receiptNo")) {
                    throw e
                }
            } finally {
                db.endTransaction()
            }
        }

        val result = createdPayment ?: throw (lastErr ?: ValidationError("Could not allocate unique receipt number"))
        refreshAll()
        result
    }

    // ---------- Attendance ----------

    suspend fun fetchAttendance(
        date: String,
        batch: String = "ALL",
        category: String = "ALL",
    ): AttendanceData = withContext(Dispatchers.IO) {
        val db = database.readableDatabase
        val students = fetchStudentsSync(
            StudentFilters(
                status = "Active",
                batch = batch,
                category = category,
            )
        )
        val dayKey = date.take(10)
        val recordMap = mutableMapOf<String, String>()
        db.rawQuery(
            "SELECT studentId, status FROM Attendance WHERE substr(date, 1, 10) = ?",
            arrayOf(dayKey)
        ).use { c ->
            while (c.moveToNext()) {
                recordMap[c.getString(0)] = c.getString(1)
            }
        }
        val rows = students.map { s ->
            AttendanceRow(
                student = s,
                status = recordMap[s.id] ?: "Unmarked",
                remarks = "",
            )
        }
        AttendanceData(date = dayKey, rows = rows)
    }

    suspend fun saveAttendance(records: List<AttendanceRecord>) = withContext(Dispatchers.IO) {
        DomainEngine.assertValidAttendanceRecords(records)
        val db = database.writableDatabase
        val nowIso = Instant.now().toString()
        db.beginTransaction()
        try {
            for (r in records) {
                val dayKey = r.date.take(10)
                val existingId = db.rawQuery(
                    "SELECT id FROM Attendance WHERE studentId = ? AND substr(date, 1, 10) = ?",
                    arrayOf(r.studentId, dayKey)
                ).use { c -> if (c.moveToFirst()) c.getString(0) else null }

                val id = existingId ?: UUID.randomUUID().toString()
                val cv = ContentValues().apply {
                    put("id", id)
                    put("studentId", r.studentId)
                    put("date", dayKey)
                    put("batch", r.batch.trim())
                    put("status", r.status)
                    put("createdAt", nowIso)
                }
                if (existingId != null) {
                    db.update("Attendance", cv, "id = ?", arrayOf(id))
                } else {
                    db.insertOrThrow("Attendance", null, cv)
                }
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
        refreshAll()
    }

    // ---------- Dashboard ----------

    suspend fun fetchDashboard(): DashboardData = withContext(Dispatchers.IO) {
        fetchDashboardSync()
    }

    fun fetchDashboardSync(): DashboardData {
        val db = database.readableDatabase
        val students = fetchStudentsSync()
        val active = students.filter { it.status == "Active" }
        val studentMap = students.associateBy { it.id }

        val rawPayments = mutableListOf<FeePayment>()
        db.rawQuery("SELECT * FROM FeePayment ORDER BY paymentDate DESC, createdAt DESC", null).use { c ->
            while (c.moveToNext()) rawPayments.add(mapPayment(c))
        }
        val payments = rawPayments.map { p ->
            val st = studentMap[p.studentId]
            p.copy(
                studentName = st?.fullName ?: "—",
                admissionNo = st?.admissionNo ?: "—",
            )
        }
        val byStudent = payments.groupBy { it.studentId }

        var paidThisMonthCount = 0
        var dueCount = 0
        var defaultersCount = 0
        var totalOutstandingAmount = 0.0

        for (s in active) {
            val fs = DomainEngine.computeFeeStatus(s, byStudent[s.id].orEmpty())
            when (DomainEngine.classifyFeeCycle(fs)) {
                FeeCycleBucket.DEFAULTER -> defaultersCount++
                FeeCycleBucket.DUE -> dueCount++
                FeeCycleBucket.PAID -> paidThisMonthCount++
            }
            totalOutstandingAmount += fs.dueAmount
        }

        val now = LocalDate.now()
        val monthPrefix = DomainEngine.monthKey(now)
        val todayPrefix = DomainEngine.todayKey(now)

        val monthlyRevenue = payments
            .filter { it.paymentDate.take(10).startsWith(monthPrefix) }
            .sumOf { it.amount }
        val todayCollection = payments
            .filter { it.paymentDate.take(10) == todayPrefix }
            .sumOf { it.amount }

        val categoryBreakdown = AGE_CATEGORIES.map { cat ->
            CategoryCount(
                category = cat,
                count = active.count { it.ageCategory == cat },
            )
        }

        val recentAchievements = mutableListOf<RecentAchievement>()
        db.rawQuery(
            """
            SELECT a.*, s.fullName AS studentName, s.ageCategory AS ageCategory
            FROM Achievement a
            JOIN Student s ON s.id = a.studentId
            ORDER BY a.eventDate DESC
            LIMIT 6
            """.trimIndent(),
            null
        ).use { c ->
            while (c.moveToNext()) {
                recentAchievements.add(
                    RecentAchievement(
                        id = c.getString(c.getColumnIndexOrThrow("id")),
                        studentId = c.getString(c.getColumnIndexOrThrow("studentId")),
                        tournamentName = c.getString(c.getColumnIndexOrThrow("tournamentName")),
                        eventDate = c.getNullableString(c.getColumnIndexOrThrow("eventDate")) ?: "",
                        level = c.getNullableString(c.getColumnIndexOrThrow("level")) ?: "School",
                        medal = c.getNullableString(c.getColumnIndexOrThrow("medal")) ?: "None",
                        certificatePath = c.getNullableString(c.getColumnIndexOrThrow("certificatePath")),
                        notes = c.getNullableString(c.getColumnIndexOrThrow("notes")),
                        studentName = c.getString(c.getColumnIndexOrThrow("studentName")),
                        ageCategory = c.getString(c.getColumnIndexOrThrow("ageCategory")),
                    )
                )
            }
        }

        val committee = fetchCommitteeSync()

        val upcomingBirthdays = active.mapNotNull { s ->
            val dob = DomainEngine.parseLocalDate(s.dateOfBirth) ?: return@mapNotNull null
            var next = try {
                LocalDate.of(now.year, dob.monthValue, dob.dayOfMonth)
            } catch (_: Exception) {
                LocalDate.of(now.year, dob.monthValue, 28)
            }
            if (next.isBefore(now)) {
                next = try {
                    LocalDate.of(now.year + 1, dob.monthValue, dob.dayOfMonth)
                } catch (_: Exception) {
                    LocalDate.of(now.year + 1, dob.monthValue, 28)
                }
            }
            val inDays = ChronoUnit.DAYS.between(now, next).toInt()
            if (inDays <= 30) {
                BirthdayItem(
                    id = s.id,
                    fullName = s.fullName,
                    ageCategory = s.ageCategory,
                    dateOfBirth = s.dateOfBirth,
                    inDays = inDays,
                    turningAge = next.year - dob.year,
                )
            } else {
                null
            }
        }.sortedBy { it.inDays }.take(6)

        var presentToday = 0
        var absentToday = 0
        db.rawQuery(
            "SELECT status FROM Attendance WHERE substr(date, 1, 10) = ?",
            arrayOf(todayPrefix)
        ).use { c ->
            while (c.moveToNext()) {
                when (c.getString(0)) {
                    "Present" -> presentToday++
                    "Absent" -> absentToday++
                }
            }
        }

        val settings = fetchSettingsSync()
        val hasDemoData = isDemoLoadedSync(db)

        return DashboardData(
            totals = DashboardData.Totals(
                totalStudents = students.size,
                activeStudents = active.size,
                inactiveStudents = students.size - active.size,
                monthlyRevenue = monthlyRevenue,
                todayCollection = todayCollection,
                paidThisMonthCount = paidThisMonthCount,
                dueCount = dueCount,
                defaultersCount = defaultersCount,
                totalOutstandingAmount = totalOutstandingAmount,
                presentToday = presentToday,
                absentToday = absentToday,
            ),
            categoryBreakdown = categoryBreakdown,
            recentPayments = payments.take(6),
            recentAchievements = recentAchievements,
            committee = committee,
            upcomingBirthdays = upcomingBirthdays,
            settings = settings,
            hasDemoData = hasDemoData,
        )
    }

    // ---------- Committee ----------

    suspend fun fetchCommittee(): List<CommitteeMember> = withContext(Dispatchers.IO) {
        fetchCommitteeSync()
    }

    fun fetchCommitteeSync(): List<CommitteeMember> {
        val db = database.readableDatabase
        val list = mutableListOf<CommitteeMember>()
        db.rawQuery("SELECT * FROM CommitteeMember ORDER BY displayOrder ASC, createdAt ASC", null).use { c ->
            while (c.moveToNext()) list.add(mapCommittee(c))
        }
        return list
    }

    suspend fun createCommitteeMember(input: CommitteeMemberInput): CommitteeMember =
        withContext(Dispatchers.IO) {
            if (input.fullName.isBlank()) throw ValidationError("Member name is required")
            val db = database.writableDatabase
            val id = UUID.randomUUID().toString()
            val nowIso = Instant.now().toString()
            val cv = ContentValues().apply {
                put("id", id)
                put("fullName", input.fullName.trim())
                put("role", input.role.trim())
                put("phone", input.phone.trim())
                if (!input.responsibilities.isNullOrBlank()) put("responsibilities", input.responsibilities.trim()) else putNull("responsibilities")
                put("displayOrder", input.displayOrder)
                put("createdAt", nowIso)
                put("updatedAt", nowIso)
            }
            db.insertOrThrow("CommitteeMember", null, cv)
            refreshAll()
            CommitteeMember(
                id = id,
                fullName = input.fullName.trim(),
                role = input.role.trim(),
                phone = input.phone.trim(),
                email = input.email,
                responsibilities = input.responsibilities,
                displayOrder = input.displayOrder,
                createdAt = nowIso,
            )
        }

    suspend fun updateCommitteeMember(id: String, input: CommitteeMemberInput): CommitteeMember =
        withContext(Dispatchers.IO) {
            val db = database.writableDatabase
            val nowIso = Instant.now().toString()
            val cv = ContentValues().apply {
                put("fullName", input.fullName.trim())
                put("role", input.role.trim())
                put("phone", input.phone.trim())
                if (!input.responsibilities.isNullOrBlank()) put("responsibilities", input.responsibilities.trim()) else putNull("responsibilities")
                put("displayOrder", input.displayOrder)
                put("updatedAt", nowIso)
            }
            db.update("CommitteeMember", cv, "id = ?", arrayOf(id))
            refreshAll()
            db.rawQuery("SELECT * FROM CommitteeMember WHERE id = ?", arrayOf(id)).use { c ->
                c.moveToFirst()
                mapCommittee(c)
            }
        }

    suspend fun deleteCommitteeMember(id: String) = withContext(Dispatchers.IO) {
        val db = database.writableDatabase
        db.delete("CommitteeMember", "id = ?", arrayOf(id))
        refreshAll()
    }

    // ---------- Settings ----------

    suspend fun fetchSettings(): AcademySettings = withContext(Dispatchers.IO) {
        fetchSettingsSync()
    }

    fun fetchSettingsSync(): AcademySettings {
        val db = database.readableDatabase
        val map = mutableMapOf<String, String>()
        db.rawQuery("SELECT key, value FROM Setting", null).use { c ->
            while (c.moveToNext()) {
                map[c.getString(0)] = c.getString(1)
            }
        }
        return AcademySettings(
            academyName = map["academyName"] ?: DEFAULT_SETTINGS.academyName,
            tagline = map["tagline"] ?: DEFAULT_SETTINGS.tagline,
            address = map["address"] ?: DEFAULT_SETTINGS.address,
            phone = map["phone"] ?: DEFAULT_SETTINGS.phone,
            email = map["email"] ?: DEFAULT_SETTINGS.email,
            defaultMonthlyFee = map["defaultMonthlyFee"]?.toDoubleOrNull() ?: DEFAULT_SETTINGS.defaultMonthlyFee,
            receiptSignatory = map["receiptSignatory"] ?: DEFAULT_SETTINGS.receiptSignatory,
        )
    }

    suspend fun saveSettings(settings: AcademySettings): AcademySettings = withContext(Dispatchers.IO) {
        val db = database.writableDatabase
        val entries = mapOf(
            "academyName" to settings.academyName.trim(),
            "tagline" to settings.tagline.trim(),
            "address" to settings.address.trim(),
            "phone" to settings.phone.trim(),
            "email" to settings.email.trim(),
            "defaultMonthlyFee" to settings.defaultMonthlyFee.toString(),
            "receiptSignatory" to settings.receiptSignatory.trim(),
        )
        db.beginTransaction()
        try {
            for ((k, v) in entries) {
                val cv = ContentValues().apply {
                    put("key", k)
                    put("value", v)
                }
                db.insertWithOnConflict("Setting", null, cv, SQLiteDatabase.CONFLICT_REPLACE)
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
        refreshAll()
        fetchSettingsSync()
    }

    // ---------- Demo Dataset Load & Surgical Clear ----------

    private fun isDemoLoadedSync(db: SQLiteDatabase): Boolean {
        val raw = db.rawQuery("SELECT value FROM Setting WHERE key = 'demoRecordIds'", null).use { c ->
            if (c.moveToFirst()) c.getString(0) else null
        } ?: return false
        return try {
            val obj = JSONObject(raw)
            val students = obj.optJSONArray("students")
            students != null && students.length() > 0
        } catch (_: Exception) {
            false
        }
    }

    suspend fun loadDemoData(): Int = withContext(Dispatchers.IO) {
        val db = database.writableDatabase
        val existingCount = db.rawQuery("SELECT COUNT(*) FROM Student", null).use { c ->
            if (c.moveToFirst()) c.getInt(0) else 0
        }
        if (existingCount > 0) {
            refreshAll()
            return@withContext existingCount
        }

        val now = LocalDate.now()
        val nowIso = Instant.now().toString()
        val demoStudentIds = mutableListOf<String>()
        val demoCommitteeIds = mutableListOf<String>()

        db.beginTransaction()
        try {
            for ((k, v) in DemoData.DEMO_SETTINGS) {
                val cv = ContentValues().apply {
                    put("key", k)
                    put("value", v)
                }
                db.insertWithOnConflict("Setting", null, cv, SQLiteDatabase.CONFLICT_REPLACE)
            }

            val commCount = db.rawQuery("SELECT COUNT(*) FROM CommitteeMember", null).use { c ->
                if (c.moveToFirst()) c.getInt(0) else 0
            }
            if (commCount == 0) {
                for (m in DemoData.DEMO_COMMITTEE) {
                    val cid = UUID.randomUUID().toString()
                    demoCommitteeIds.add(cid)
                    val cv = ContentValues().apply {
                        put("id", cid)
                        put("fullName", m.fullName)
                        put("role", m.role)
                        put("phone", m.phone)
                        put("responsibilities", m.responsibilities)
                        put("displayOrder", m.displayOrder)
                        put("createdAt", nowIso)
                        put("updatedAt", nowIso)
                    }
                    db.insertOrThrow("CommitteeMember", null, cv)
                }
            }

            var receiptSeq = 1
            val createdByName = mutableMapOf<String, String>()

            for ((idx, s) in DemoData.DEMO_STUDENTS.withIndex()) {
                val regDate = DemoData.demoRegistrationDate(s, now)
                val regDateStr = DomainEngine.todayKey(regDate)
                val admissionNo = "PSA-${regDate.year}-%04d".format(Locale.US, idx + 1)
                val sid = UUID.randomUUID().toString()
                demoStudentIds.add(sid)
                createdByName[s.fullName] = sid

                val cv = studentContentValues(
                    id = sid,
                    admissionNo = admissionNo,
                    input = StudentInput(
                        admissionNo = admissionNo,
                        fullName = s.fullName,
                        dateOfBirth = DemoData.demoDob(s),
                        registrationDate = regDateStr,
                        parentName = s.parentName,
                        mobile = s.mobile,
                        emergencyContact = s.emergencyContact,
                        address = s.address,
                        schoolName = s.schoolName,
                        classGrade = s.classGrade,
                        division = s.division,
                        bloodGroup = s.bloodGroup,
                        gender = s.gender,
                        heightCm = s.heightCm,
                        weightKg = s.weightKg,
                        standingReachCm = s.standingReachCm,
                        spikeReachCm = s.spikeReachCm,
                        jumpReachCm = s.jumpReachCm,
                        primarySport = s.primarySport,
                        playingPosition = s.playingPosition,
                        ageCategory = s.ageCategory,
                        trainingBatch = s.trainingBatch,
                        monthlyFee = s.monthlyFee,
                        status = "Active",
                    ),
                    registrationDate = regDateStr,
                    createdAt = nowIso,
                    updatedAt = nowIso,
                )
                db.insertOrThrow("Student", null, cv)

                if (s.heightCm != null || s.weightKg != null) {
                    upsertMeasurementRow(
                        db = db,
                        studentId = sid,
                        input = MeasurementInput(
                            date = regDateStr,
                            heightCm = s.heightCm,
                            weightKg = s.weightKg,
                            standingReachCm = s.standingReachCm,
                            spikeReachCm = s.spikeReachCm,
                            jumpReachCm = s.jumpReachCm,
                            notes = "demo",
                        ),
                        nowIso = nowIso,
                    )
                }

                for (plan in DemoData.planDemoPayments(s, now)) {
                    val pid = UUID.randomUUID().toString()
                    val rNo = "RC-%04d%02d-%05d".format(
                        Locale.US,
                        plan.paymentDate.year,
                        plan.paymentDate.monthValue,
                        receiptSeq++
                    )
                    val pDateStr = DomainEngine.todayKey(plan.paymentDate)
                    val pCv = ContentValues().apply {
                        put("id", pid)
                        put("receiptNo", rNo)
                        put("studentId", sid)
                        put("amount", plan.amount)
                        put("months", DomainEngine.encodePaidMonths(plan.months))
                        put("paymentDate", pDateStr)
                        put("paymentMode", plan.paymentMode)
                        put("notes", "Demo seed payment")
                        put("createdAt", nowIso)
                    }
                    db.insertOrThrow("FeePayment", null, pCv)

                    for (m in plan.months) {
                        val pmCv = ContentValues().apply {
                            put("id", "pm-$pid-$m")
                            put("studentId", sid)
                            put("month", m)
                            put("paymentId", pid)
                        }
                        db.insertOrThrow("PaymentMonth", null, pmCv)
                    }
                }

                for ((attDate, attStatus) in DemoData.planDemoAttendance(s, 3, now)) {
                    val attCv = ContentValues().apply {
                        put("id", UUID.randomUUID().toString())
                        put("studentId", sid)
                        put("date", attDate)
                        put("batch", s.trainingBatch)
                        put("status", attStatus)
                        put("createdAt", nowIso)
                    }
                    db.insertWithOnConflict("Attendance", null, attCv, SQLiteDatabase.CONFLICT_IGNORE)
                }
            }

            for (a in DemoData.DEMO_ACHIEVEMENTS) {
                val sid = createdByName[a.student] ?: continue
                val evYm = YearMonth.of(now.year, now.monthValue).minusMonths(a.eventDateMonthsAgo.toLong())
                val evDate = DomainEngine.todayKey(LocalDate.of(evYm.year, evYm.monthValue, 18))
                val aCv = ContentValues().apply {
                    put("id", UUID.randomUUID().toString())
                    put("studentId", sid)
                    put("tournamentName", a.tournamentName)
                    put("eventDate", evDate)
                    put("level", a.level)
                    put("medal", a.medal)
                    if (!a.notes.isNullOrBlank()) put("notes", a.notes) else putNull("notes")
                    put("createdAt", nowIso)
                }
                db.insertOrThrow("Achievement", null, aCv)
            }

            val tagObj = JSONObject().apply {
                put("students", JSONArray(demoStudentIds))
                put("committee", JSONArray(demoCommitteeIds))
            }
            val tagCv = ContentValues().apply {
                put("key", "demoRecordIds")
                put("value", tagObj.toString())
            }
            db.insertWithOnConflict("Setting", null, tagCv, SQLiteDatabase.CONFLICT_REPLACE)

            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }

        refreshAll()
        demoStudentIds.size
    }

    suspend fun clearDemoData(scopeMode: String = "demo"): Int = withContext(Dispatchers.IO) {
        val db = database.writableDatabase
        var removedCount = 0

        db.beginTransaction()
        try {
            if (scopeMode == "all") {
                removedCount = db.rawQuery("SELECT COUNT(*) FROM Student", null).use { c ->
                    if (c.moveToFirst()) c.getInt(0) else 0
                }
                db.delete("PaymentMonth", null, null)
                db.delete("FeePayment", null, null)
                db.delete("Attendance", null, null)
                db.delete("Achievement", null, null)
                db.delete("Measurement", null, null)
                db.delete("Student", null, null)
                db.delete("Setting", "key = 'demoRecordIds'", null)
            } else {
                val raw = db.rawQuery("SELECT value FROM Setting WHERE key = 'demoRecordIds'", null).use { c ->
                    if (c.moveToFirst()) c.getString(0) else null
                }
                val demoIds = mutableListOf<String>()
                val committeeIds = mutableListOf<String>()
                if (!raw.isNullOrBlank()) {
                    try {
                        val obj = JSONObject(raw)
                        val sArr = obj.optJSONArray("students")
                        if (sArr != null) {
                            for (i in 0 until sArr.length()) demoIds.add(sArr.getString(i))
                        }
                        val cArr = obj.optJSONArray("committee")
                        if (cArr != null) {
                            for (i in 0 until cArr.length()) committeeIds.add(cArr.getString(i))
                        }
                    } catch (_: Exception) {
                    }
                }
                for (sid in demoIds) {
                    db.delete("PaymentMonth", "studentId = ?", arrayOf(sid))
                    db.delete("FeePayment", "studentId = ?", arrayOf(sid))
                    db.delete("Attendance", "studentId = ?", arrayOf(sid))
                    db.delete("Achievement", "studentId = ?", arrayOf(sid))
                    db.delete("Measurement", "studentId = ?", arrayOf(sid))
                    removedCount += db.delete("Student", "id = ?", arrayOf(sid))
                }
                for (cid in committeeIds) {
                    db.delete("CommitteeMember", "id = ?", arrayOf(cid))
                }
                db.delete("Setting", "key = 'demoRecordIds'", null)
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }

        refreshAll()
        removedCount
    }

    // ---------- Media Upload & Safe Cleanup ----------

    suspend fun uploadMediaUri(uri: Uri, kind: String = "photo"): String = withContext(Dispatchers.IO) {
        val resolver = appContext.contentResolver
        val mimeType = resolver.getType(uri)
        var displayName = "upload.jpg"
        var sizeBytes = 0L

        resolver.query(uri, null, null, null, null)?.use { c ->
            if (c.moveToFirst()) {
                val nameIdx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                val sizeIdx = c.getColumnIndex(OpenableColumns.SIZE)
                if (nameIdx >= 0 && !c.isNull(nameIdx)) displayName = c.getString(nameIdx)
                if (sizeIdx >= 0 && !c.isNull(sizeIdx)) sizeBytes = c.getLong(sizeIdx)
            }
        }

        DomainEngine.assertValidUpload(displayName, mimeType, sizeBytes)

        val folder = when (kind) {
            "certificate" -> "certificates"
            "document" -> "documents"
            else -> "photos"
        }
        val safeName = "${System.currentTimeMillis()}-${UUID.randomUUID().toString().take(8)}-${DomainEngine.sanitizeFileName(displayName)}"
        val relativePath = "$folder/$safeName"
        val destFile = File(database.mediaRootDir, relativePath)
        destFile.parentFile?.mkdirs()

        resolver.openInputStream(uri)?.use { input ->
            FileOutputStream(destFile).use { output ->
                input.copyTo(output)
            }
        } ?: throw ValidationError("Unable to read selected file")

        relativePath
    }

    fun resolveMediaFile(relativePath: String?): File? {
        if (!DomainEngine.isSafeMediaPath(relativePath)) return null
        val file = File(database.mediaRootDir, relativePath!!)
        return if (file.exists()) file else null
    }

    private fun removeMediaIfOrphaned(db: SQLiteDatabase, relativePath: String) {
        if (!DomainEngine.isSafeMediaPath(relativePath)) return
        val inStudent = db.rawQuery(
            "SELECT COUNT(*) FROM Student WHERE photoPath = ? OR birthCertPath = ? OR idCardPath = ?",
            arrayOf(relativePath, relativePath, relativePath)
        ).use { c -> if (c.moveToFirst()) c.getLong(0) else 0L }
        val inAchievement = db.rawQuery(
            "SELECT COUNT(*) FROM Achievement WHERE certificatePath = ?",
            arrayOf(relativePath)
        ).use { c -> if (c.moveToFirst()) c.getLong(0) else 0L }

        if (inStudent == 0L && inAchievement == 0L) {
            File(database.mediaRootDir, relativePath).delete()
        }
    }

    // ---------- Database Backup, Restore & JSON Snapshot ----------

    suspend fun createDatabaseBackupFile(): File = withContext(Dispatchers.IO) {
        val fileName = "PS-AMS-Backup-${DomainEngine.todayKey()}.db"
        val target = File(database.backupsDir, fileName)
        database.createVerifiedBackup(target)
    }

    suspend fun restoreDatabaseFromUri(uri: Uri): File = withContext(Dispatchers.IO) {
        val tempFile = File(appContext.cacheDir, "restore-candidate-${System.currentTimeMillis()}.db")
        appContext.contentResolver.openInputStream(uri)?.use { input ->
            FileOutputStream(tempFile).use { output ->
                input.copyTo(output)
            }
        } ?: throw ValidationError("Could not read selected backup file")

        try {
            val safety = database.restoreFromBackupFile(tempFile)
            refreshAll()
            safety
        } finally {
            tempFile.delete()
        }
    }

    suspend fun exportJsonSnapshotFile(): File = withContext(Dispatchers.IO) {
        val students = fetchStudentsSync()
        val feeOverview = fetchFeeOverviewSync()
        val committee = fetchCommitteeSync()
        val settings = fetchSettingsSync()

        val root = JSONObject().apply {
            put("app", "PS-AMS Android")
            put("version", `in`.patternsports.ams.domain.APP_VERSION)
            put("exportedAt", Instant.now().toString())
            put("studentsCount", students.size)
            put("paymentsCount", feeOverview.payments.size)
            put("committeeCount", committee.size)
            put(
                "settings",
                JSONObject().apply {
                    put("academyName", settings.academyName)
                    put("tagline", settings.tagline)
                    put("address", settings.address)
                    put("phone", settings.phone)
                    put("email", settings.email)
                    put("defaultMonthlyFee", settings.defaultMonthlyFee)
                    put("receiptSignatory", settings.receiptSignatory)
                }
            )
        }
        val outDir = File(appContext.cacheDir, "exports").apply { mkdirs() }
        val file = File(outDir, "PS-AMS-Snapshot-${DomainEngine.todayKey()}.json")
        file.writeText(root.toString(2))
        file
    }
}
