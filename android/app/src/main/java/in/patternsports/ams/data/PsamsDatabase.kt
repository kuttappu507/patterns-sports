package `in`.patternsports.ams.data

import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import `in`.patternsports.ams.domain.ACADEMY_ADDRESS
import `in`.patternsports.ams.domain.DEFAULT_SETTINGS
import `in`.patternsports.ams.domain.DemoData
import `in`.patternsports.ams.domain.DomainEngine
import `in`.patternsports.ams.domain.FeePayment
import `in`.patternsports.ams.domain.ValidationError
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.time.Instant
import java.util.UUID

// ============================================================
// PS-AMS :: Native Android SQLite Engine (WAL + Foreign Keys)
// 1:1 parity with src-tauri/resources/schema.sql & tauri-api.ts
// ============================================================

private const val DB_NAME = "psams.db"
private const val DB_VERSION = 4

class PsamsDatabase(private val appContext: Context) :
    SQLiteOpenHelper(appContext, DB_NAME, null, DB_VERSION) {

    val mediaRootDir: File
        get() = File(appContext.filesDir, "media").apply { mkdirs() }

    val backupsDir: File
        get() = File(appContext.filesDir, "backups").apply { mkdirs() }

    override fun onConfigure(db: SQLiteDatabase) {
        super.onConfigure(db)
        db.setForeignKeyConstraintsEnabled(true)
        try {
            db.enableWriteAheadLogging()
        } catch (_: Exception) {
            // Ignore if read-only
        }
    }

    override fun onCreate(db: SQLiteDatabase) {
        executeAssetSchema(db)
        runMigrationsAndSeed(db)
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        executeAssetSchema(db)
        runMigrationsAndSeed(db)
    }

    override fun onOpen(db: SQLiteDatabase) {
        super.onOpen(db)
        if (!db.isReadOnly) {
            db.execSQL("PRAGMA foreign_keys = ON;")
            runMigrationsAndSeed(db)
        }
    }

    private fun executeAssetSchema(db: SQLiteDatabase) {
        val sqlText = appContext.assets.open("schema.sql").bufferedReader().use { it.readText() }
        val statements = sqlText
            .lineSequence()
            .filter { !it.trim().startsWith("--") }
            .joinToString("\n")
            .split(";")
            .map { it.trim() }
            .filter { it.isNotEmpty() }

        for (stmt in statements) {
            if (stmt.uppercase().startsWith("PRAGMA")) continue
            db.execSQL("$stmt;")
        }
    }

    private fun runMigrationsAndSeed(db: SQLiteDatabase) {
        val nowIso = Instant.now().toString()

        // 1. Reconcile PaymentMonth allocation ledger with FeePayment JSON months
        val payments = mutableListOf<FeePayment>()
        db.rawQuery(
            "SELECT id, receiptNo, studentId, amount, months, paymentDate, paymentMode, notes, createdAt FROM FeePayment ORDER BY paymentDate ASC, createdAt ASC",
            null
        ).use { c ->
            while (c.moveToNext()) {
                payments.add(
                    FeePayment(
                        id = c.getString(0),
                        receiptNo = c.getString(1),
                        studentId = c.getString(2),
                        amount = c.getDouble(3),
                        months = c.getString(4),
                        paymentDate = c.getString(5),
                        paymentMode = c.getString(6),
                        remarks = c.getNullableString(7),
                        createdAt = c.getString(8),
                    )
                )
            }
        }

        val existingAllocations = mutableListOf<Pair<String, String>>()
        db.rawQuery("SELECT studentId, month FROM PaymentMonth", null).use { c ->
            while (c.moveToNext()) {
                existingAllocations.add(c.getString(0) to c.getString(1))
            }
        }

        val plan = DomainEngine.planLedgerBackfill(payments, existingAllocations)
        for (a in plan.allocations) {
            val cv = ContentValues().apply {
                put("id", a.id)
                put("studentId", a.studentId)
                put("month", a.month)
                put("paymentId", a.paymentId)
            }
            db.insertWithOnConflict("PaymentMonth", null, cv, SQLiteDatabase.CONFLICT_IGNORE)
        }

        // 2. Backfill longitudinal Measurement row for students with height/weight but no Measurement row
        data class UnmeasuredStudent(
            val id: String,
            val regDate: String,
            val heightCm: Double?,
            val weightKg: Double?,
        )
        val unmeasured = mutableListOf<UnmeasuredStudent>()
        db.rawQuery(
            """
            SELECT s.id, s.registrationDate, s.heightCm, s.weightKg
            FROM Student s
            WHERE (s.heightCm IS NOT NULL OR s.weightKg IS NOT NULL)
              AND NOT EXISTS (SELECT 1 FROM Measurement m WHERE m.studentId = s.id)
            """.trimIndent(),
            null
        ).use { c ->
            while (c.moveToNext()) {
                unmeasured.add(
                    UnmeasuredStudent(
                        id = c.getString(0),
                        regDate = c.getString(1),
                        heightCm = c.getNullableDouble(2),
                        weightKg = c.getNullableDouble(3),
                    )
                )
            }
        }
        for (s in unmeasured) {
            val dateStr = s.regDate.take(10).ifBlank { DomainEngine.todayKey() }
            val cv = ContentValues().apply {
                put("id", UUID.randomUUID().toString())
                put("studentId", s.id)
                put("date", dateStr)
                if (s.heightCm != null) put("heightCm", s.heightCm) else putNull("heightCm")
                if (s.weightKg != null) put("weightKg", s.weightKg) else putNull("weightKg")
                put("source", "backfill")
                put("createdAt", nowIso)
            }
            db.insertWithOnConflict("Measurement", null, cv, SQLiteDatabase.CONFLICT_IGNORE)
        }

        // 3. Seed default AcademySettings if empty
        val settingsCount = queryLong(db, "SELECT COUNT(*) FROM Setting")
        if (settingsCount == 0L) {
            val defaults = mapOf(
                "academyName" to DEFAULT_SETTINGS.academyName,
                "tagline" to DEFAULT_SETTINGS.tagline,
                "address" to DEFAULT_SETTINGS.address,
                "phone" to DEFAULT_SETTINGS.phone,
                "email" to DEFAULT_SETTINGS.email,
                "defaultMonthlyFee" to DEFAULT_SETTINGS.defaultMonthlyFee.toInt().toString(),
                "receiptSignatory" to DEFAULT_SETTINGS.receiptSignatory,
            )
            for ((k, v) in defaults) {
                val cv = ContentValues().apply {
                    put("key", k)
                    put("value", v)
                }
                db.insertWithOnConflict("Setting", null, cv, SQLiteDatabase.CONFLICT_IGNORE)
            }
        } else {
            val cv = ContentValues().apply {
                put("value", ACADEMY_ADDRESS)
            }
            db.update(
                "Setting",
                cv,
                "key = 'address' AND value LIKE '%Kochi%'",
                null
            )
        }

        // 4. Seed default CommitteeMember rows if empty
        val committeeCount = queryLong(db, "SELECT COUNT(*) FROM CommitteeMember")
        if (committeeCount == 0L) {
            for (m in DemoData.DEMO_COMMITTEE) {
                val cv = ContentValues().apply {
                    put("id", UUID.randomUUID().toString())
                    put("fullName", m.fullName)
                    put("role", m.role)
                    put("phone", m.phone)
                    put("responsibilities", m.responsibilities)
                    put("displayOrder", m.displayOrder)
                    put("createdAt", nowIso)
                    put("updatedAt", nowIso)
                }
                db.insert("CommitteeMember", null, cv)
            }
        }
    }

    @Synchronized
    fun createVerifiedBackup(targetFile: File): File {
        val db = writableDatabase
        db.rawQuery("PRAGMA wal_checkpoint(TRUNCATE)", null).use { }
        val sourceDbFile = appContext.getDatabasePath(DB_NAME)
        targetFile.parentFile?.mkdirs()
        if (targetFile.exists()) targetFile.delete()
        FileInputStream(sourceDbFile).use { input ->
            FileOutputStream(targetFile).use { output ->
                input.copyTo(output)
                output.fd.sync()
            }
        }
        SQLiteDatabase.openDatabase(targetFile.absolutePath, null, SQLiteDatabase.OPEN_READONLY).use { checkDb ->
            checkDb.rawQuery("PRAGMA quick_check", null).use { c ->
                val ok = if (c.moveToFirst()) c.getString(0) else ""
                if (!ok.equals("ok", ignoreCase = true)) {
                    targetFile.delete()
                    throw ValidationError("Backup integrity check failed: $ok")
                }
            }
        }
        return targetFile
    }

    @Synchronized
    fun restoreFromBackupFile(candidateFile: File): File {
        if (!candidateFile.exists() || candidateFile.length() < 100) {
            throw ValidationError("Selected file is not a valid SQLite database")
        }
        val header = ByteArray(16)
        FileInputStream(candidateFile).use { it.read(header) }
        val magic = String(header, Charsets.US_ASCII)
        if (!magic.startsWith("SQLite format 3")) {
            throw ValidationError("Selected file is not a valid SQLite 3 database")
        }

        val requiredTables = listOf("Student", "FeePayment", "Attendance", "CommitteeMember", "Setting", "Achievement")
        SQLiteDatabase.openDatabase(candidateFile.absolutePath, null, SQLiteDatabase.OPEN_READONLY).use { candidateDb ->
            candidateDb.rawQuery("PRAGMA quick_check", null).use { c ->
                val ok = if (c.moveToFirst()) c.getString(0) else ""
                if (!ok.equals("ok", ignoreCase = true)) {
                    throw ValidationError("Backup file failed SQLite integrity check: $ok")
                }
            }
            for (table in requiredTables) {
                candidateDb.rawQuery(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
                    arrayOf(table)
                ).use { c ->
                    if (!c.moveToFirst()) {
                        throw ValidationError("Backup file is missing required PS-AMS table: $table")
                    }
                }
            }
        }

        val safetyBackup = File(backupsDir, "psams-pre-restore-${System.currentTimeMillis()}.db")
        createVerifiedBackup(safetyBackup)

        close()
        val liveDbFile = appContext.getDatabasePath(DB_NAME)
        val walFile = File("${liveDbFile.absolutePath}-wal")
        val shmFile = File("${liveDbFile.absolutePath}-shm")
        if (walFile.exists()) walFile.delete()
        if (shmFile.exists()) shmFile.delete()

        FileInputStream(candidateFile).use { input ->
            FileOutputStream(liveDbFile).use { output ->
                input.copyTo(output)
                output.fd.sync()
            }
        }

        writableDatabase
        return safetyBackup
    }

    private fun queryLong(db: SQLiteDatabase, sql: String, args: Array<String>? = null): Long {
        db.rawQuery(sql, args).use { c ->
            return if (c.moveToFirst()) c.getLong(0) else 0L
        }
    }
}

fun Cursor.getNullableString(index: Int): String? =
    if (isNull(index)) null else getString(index)

fun Cursor.getNullableDouble(index: Int): Double? =
    if (isNull(index)) null else getDouble(index)
