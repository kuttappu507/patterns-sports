package `in`.patternsports.ams

import android.content.Context
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import `in`.patternsports.ams.data.DocumentExporter
import `in`.patternsports.ams.data.PsamsRepository
import `in`.patternsports.ams.domain.AttendanceData
import `in`.patternsports.ams.domain.DomainEngine
import `in`.patternsports.ams.domain.NavView
import `in`.patternsports.ams.domain.PrintPayload
import `in`.patternsports.ams.domain.Student
import `in`.patternsports.ams.domain.StudentDetail
import `in`.patternsports.ams.domain.StudentInput
import `in`.patternsports.ams.ui.components.PsamsAppShell
import `in`.patternsports.ams.ui.components.SplashOverlay
import `in`.patternsports.ams.ui.modals.CollectFeeModal
import `in`.patternsports.ams.ui.modals.PrintPreviewModal
import `in`.patternsports.ams.ui.modals.StudentFormModal
import `in`.patternsports.ams.ui.motion.CelebrationBurstOverlay
import `in`.patternsports.ams.ui.screens.AttendanceScreen
import `in`.patternsports.ams.ui.screens.DashboardScreen
import `in`.patternsports.ams.ui.screens.FeesScreen
import `in`.patternsports.ams.ui.screens.ReportsScreen
import `in`.patternsports.ams.ui.screens.SettingsScreen
import `in`.patternsports.ams.ui.screens.StudentDetailScreen
import `in`.patternsports.ams.ui.screens.StudentsScreen
import `in`.patternsports.ams.ui.theme.PsamsSorbetTheme
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

// ============================================================
// PS-AMS :: MainActivity & Root Coordinator
// Zero Material Design — Pure Jetpack Compose Foundation + UI
// ============================================================

class MainActivity : ComponentActivity() {

    private var backHandlerAction: (() -> Boolean)? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val app = application as PsamsApplication
        val prefs = getSharedPreferences("psams_ui_prefs", Context.MODE_PRIVATE)
        val initialDark = prefs.getBoolean("dark_theme", false)

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    val consumed = backHandlerAction?.invoke() ?: false
                    if (!consumed) {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                        isEnabled = true
                    }
                }
            }
        )

        setContent {
            PsamsRootApp(
                repository = app.repository,
                initialDarkTheme = initialDark,
                onPersistTheme = { isDark ->
                    prefs.edit().putBoolean("dark_theme", isDark).apply()
                },
                registerBackHandler = { handler ->
                    backHandlerAction = handler
                },
            )
        }
    }
}

@Composable
fun PsamsRootApp(
    repository: PsamsRepository,
    initialDarkTheme: Boolean,
    onPersistTheme: (Boolean) -> Unit,
    registerBackHandler: ((() -> Boolean) -> Unit),
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val snapshot by repository.snapshot.collectAsState()

    var darkTheme by remember { mutableStateOf(initialDarkTheme) }
    var showSplash by remember { mutableStateOf(true) }
    var currentView by remember { mutableStateOf(NavView.DASHBOARD) }
    var selectedCategoryFilter by remember { mutableStateOf("ALL") }

    var selectedStudentId by remember { mutableStateOf<String?>(null) }
    var activeStudentDetail by remember { mutableStateOf<StudentDetail?>(null) }

    // Attendance state
    var attDate by remember { mutableStateOf(DomainEngine.todayKey()) }
    var attBatch by remember { mutableStateOf("ALL") }
    var attCategory by remember { mutableStateOf("ALL") }
    var attendanceData by remember { mutableStateOf<AttendanceData?>(null) }

    // Modals & Celebration state
    var showStudentForm by remember { mutableStateOf(false) }
    var editingStudent by remember { mutableStateOf<Student?>(null) }
    var showCollectFeeModal by remember { mutableStateOf(false) }
    var collectFeeStudentId by remember { mutableStateOf<String?>(null) }
    var activePrintPayload by remember { mutableStateOf<PrintPayload?>(null) }

    var toastMessage by remember { mutableStateOf<String?>(null) }
    var celebrationCount by remember { mutableIntStateOf(0) }

    fun showToast(msg: String, celebrate: Boolean = false) {
        toastMessage = msg
        if (celebrate) celebrationCount++
        scope.launch {
            delay(3200)
            if (toastMessage == msg) toastMessage = null
        }
    }

    // Load student detail when selectedStudentId changes
    LaunchedEffect(selectedStudentId, snapshot) {
        val sid = selectedStudentId
        if (sid != null) {
            try {
                activeStudentDetail = repository.fetchStudentDetail(sid)
            } catch (_: Exception) {
                activeStudentDetail = null
            }
        }
    }

    // Load attendance sheet when date/batch/category changes
    LaunchedEffect(attDate, attBatch, attCategory, snapshot) {
        try {
            attendanceData = repository.fetchAttendance(attDate, attBatch, attCategory)
        } catch (_: Exception) {
        }
    }

    // Register system back handler
    LaunchedEffect(currentView, showStudentForm, showCollectFeeModal, activePrintPayload) {
        registerBackHandler {
            when {
                activePrintPayload != null -> {
                    activePrintPayload = null
                    true
                }
                showCollectFeeModal -> {
                    showCollectFeeModal = false
                    true
                }
                showStudentForm -> {
                    showStudentForm = false
                    true
                }
                currentView == NavView.STUDENT_DETAIL -> {
                    currentView = NavView.STUDENTS
                    true
                }
                currentView != NavView.DASHBOARD -> {
                    currentView = NavView.DASHBOARD
                    true
                }
                else -> false
            }
        }
    }

    val feeStatusByStudentId = remember(snapshot.feeOverview) {
        snapshot.feeOverview?.statuses?.associateBy { it.student.id }.orEmpty()
    }

    PsamsSorbetTheme(darkTheme = darkTheme) {
        Box(modifier = Modifier.fillMaxSize()) {
            PsamsAppShell(
                currentView = currentView,
                settings = snapshot.settings,
                defaultersCount = snapshot.feeOverview?.summary?.defaultersCount ?: 0,
                darkTheme = darkTheme,
                toastMessage = toastMessage,
                onSelectView = { view ->
                    currentView = view
                },
                onQuickAddStudent = {
                    editingStudent = null
                    showStudentForm = true
                },
                onQuickCollectFee = {
                    collectFeeStudentId = if (currentView == NavView.STUDENT_DETAIL) selectedStudentId else null
                    showCollectFeeModal = true
                },
                onToggleTheme = {
                    darkTheme = !darkTheme
                    onPersistTheme(darkTheme)
                },
                onDismissToast = { toastMessage = null },
            ) {
                AnimatedContent(
                    targetState = currentView,
                    transitionSpec = {
                        fadeIn(animationSpec = tween(220)) togetherWith fadeOut(animationSpec = tween(180))
                    },
                    label = "screenTransition",
                ) { view ->
                    when (view) {
                        NavView.DASHBOARD -> DashboardScreen(
                            data = snapshot.dashboard,
                            onNavigate = { currentView = it },
                            onFilterCategory = { cat ->
                                selectedCategoryFilter = cat
                                currentView = NavView.STUDENTS
                            },
                            onSelectStudent = { sid ->
                                selectedStudentId = sid
                                currentView = NavView.STUDENT_DETAIL
                            },
                            onAddStudent = {
                                editingStudent = null
                                showStudentForm = true
                            },
                            onCollectFee = { sid ->
                                collectFeeStudentId = sid
                                showCollectFeeModal = true
                            },
                            onPrintReceipt = { payment ->
                                val st = snapshot.students.firstOrNull { it.id == payment.studentId }
                                if (st != null) {
                                    activePrintPayload = PrintPayload.FormalReceipt(payment, st)
                                }
                            },
                            onLoadDemoData = {
                                scope.launch {
                                    val count = repository.loadDemoData()
                                    showToast("Loaded $count Kerala demo athletes & receipts!", celebrate = true)
                                }
                            },
                            onClearDemoData = {
                                scope.launch {
                                    val removed = repository.clearDemoData("demo")
                                    showToast("Cleared $removed demo athlete records.")
                                }
                            },
                        )

                        NavView.STUDENTS -> StudentsScreen(
                            students = snapshot.students,
                            feeStatusByStudentId = feeStatusByStudentId,
                            initialCategoryFilter = selectedCategoryFilter,
                            onCategoryFilterChange = { selectedCategoryFilter = it },
                            onSelectStudent = { sid ->
                                selectedStudentId = sid
                                currentView = NavView.STUDENT_DETAIL
                            },
                            onAddStudent = {
                                editingStudent = null
                                showStudentForm = true
                            },
                            onEditStudent = { st ->
                                editingStudent = st
                                showStudentForm = true
                            },
                            onCollectFee = { sid ->
                                collectFeeStudentId = sid
                                showCollectFeeModal = true
                            },
                        )

                        NavView.STUDENT_DETAIL -> {
                            val detail = activeStudentDetail
                            if (detail != null) {
                                StudentDetailScreen(
                                    detail = detail,
                                    settings = snapshot.settings,
                                    onBack = { currentView = NavView.STUDENTS },
                                    onEdit = {
                                        editingStudent = detail.student
                                        showStudentForm = true
                                    },
                                    onDelete = {
                                        scope.launch {
                                            try {
                                                repository.deleteStudent(detail.student.id)
                                                currentView = NavView.STUDENTS
                                                showToast("Removed ${detail.student.fullName}.")
                                            } catch (e: Exception) {
                                                showToast(e.message ?: "Cannot delete athlete")
                                            }
                                        }
                                    },
                                    onCollectFee = {
                                        collectFeeStudentId = detail.student.id
                                        showCollectFeeModal = true
                                    },
                                    onRecordMeasurement = { input ->
                                        scope.launch {
                                            try {
                                                repository.recordMeasurement(detail.student.id, input)
                                                activeStudentDetail = repository.fetchStudentDetail(detail.student.id)
                                                showToast("Biometric check saved!", celebrate = true)
                                            } catch (e: Exception) {
                                                showToast(e.message ?: "Invalid measurement")
                                            }
                                        }
                                    },
                                    onDeleteMeasurement = { mid ->
                                        scope.launch {
                                            repository.deleteMeasurement(mid)
                                            activeStudentDetail = repository.fetchStudentDetail(detail.student.id)
                                            showToast("Measurement entry deleted.")
                                        }
                                    },
                                    onAddAchievement = { input ->
                                        scope.launch {
                                            try {
                                                repository.createAchievement(detail.student.id, input)
                                                activeStudentDetail = repository.fetchStudentDetail(detail.student.id)
                                                showToast("Tournament achievement added!", celebrate = true)
                                            } catch (e: Exception) {
                                                showToast(e.message ?: "Could not add achievement")
                                            }
                                        }
                                    },
                                    onDeleteAchievement = { aid ->
                                        scope.launch {
                                            repository.deleteAchievement(aid)
                                            activeStudentDetail = repository.fetchStudentDetail(detail.student.id)
                                            showToast("Achievement removed.")
                                        }
                                    },
                                    onUploadDocument = { uri, target ->
                                        scope.launch {
                                            try {
                                                val kind = if (target == "photo") "photo" else "document"
                                                val path = repository.uploadMediaUri(uri, kind)
                                                val s = detail.student
                                                val updatedInput = StudentInput(
                                                    admissionNo = s.admissionNo,
                                                    fullName = s.fullName,
                                                    dateOfBirth = s.dateOfBirth,
                                                    registrationDate = s.registrationDate,
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
                                                    photoPath = if (target == "photo") path else s.photoPath,
                                                    birthCertPath = if (target == "birthCert") path else s.birthCertPath,
                                                    idCardPath = if (target == "idCard") path else s.idCardPath,
                                                    status = s.status,
                                                    notes = s.notes,
                                                )
                                                repository.updateStudent(s.id, updatedInput)
                                                activeStudentDetail = repository.fetchStudentDetail(s.id)
                                                showToast("Document saved to offline vault!")
                                            } catch (e: Exception) {
                                                showToast(e.message ?: "Upload failed")
                                            }
                                        }
                                    },
                                    onOpenPrintPreview = { payload ->
                                        activePrintPayload = payload
                                    },
                                    onPrintReceipt = { payment ->
                                        activePrintPayload = PrintPayload.FormalReceipt(payment, detail.student)
                                    },
                                )
                            }
                        }

                        NavView.FEES -> FeesScreen(
                            overview = snapshot.feeOverview,
                            settings = snapshot.settings,
                            onCollectFee = { sid ->
                                collectFeeStudentId = sid
                                showCollectFeeModal = true
                            },
                            onSelectStudent = { sid ->
                                selectedStudentId = sid
                                currentView = NavView.STUDENT_DETAIL
                            },
                            onPrintReceipt = { payment ->
                                val st = snapshot.students.firstOrNull { it.id == payment.studentId }
                                if (st != null) {
                                    activePrintPayload = PrintPayload.FormalReceipt(payment, st)
                                }
                            },
                            onOpenPrintPreview = { payload ->
                                activePrintPayload = payload
                            },
                        )

                        NavView.ATTENDANCE -> AttendanceScreen(
                            attendanceData = attendanceData,
                            selectedDate = attDate,
                            selectedBatch = attBatch,
                            selectedCategory = attCategory,
                            onDateChange = { attDate = it },
                            onBatchChange = { attBatch = it },
                            onCategoryChange = { attCategory = it },
                            onSaveRecords = { records ->
                                scope.launch {
                                    try {
                                        repository.saveAttendance(records)
                                        attendanceData = repository.fetchAttendance(attDate, attBatch, attCategory)
                                        showToast("Saved ${records.size} roll call entries!", celebrate = true)
                                    } catch (e: Exception) {
                                        showToast(e.message ?: "Attendance save failed")
                                    }
                                }
                            },
                            onOpenPrintPreview = { payload ->
                                activePrintPayload = payload
                            },
                        )

                        NavView.REPORTS -> ReportsScreen(
                            students = snapshot.students,
                            onSelectStudent = { sid ->
                                selectedStudentId = sid
                                currentView = NavView.STUDENT_DETAIL
                            },
                            onOpenPrintPreview = { payload ->
                                activePrintPayload = payload
                            },
                        )

                        NavView.SETTINGS -> SettingsScreen(
                            settings = snapshot.settings,
                            committee = snapshot.committee,
                            hasDemoData = snapshot.dashboard?.hasDemoData == true,
                            onSaveSettings = { newSettings ->
                                scope.launch {
                                    repository.saveSettings(newSettings)
                                    showToast("Academy letterhead settings saved!", celebrate = true)
                                }
                            },
                            onCreateCommittee = { input ->
                                scope.launch {
                                    repository.createCommitteeMember(input)
                                    showToast("Committee member added!")
                                }
                            },
                            onUpdateCommittee = { id, input ->
                                scope.launch {
                                    repository.updateCommitteeMember(id, input)
                                    showToast("Committee member updated!")
                                }
                            },
                            onDeleteCommittee = { id ->
                                scope.launch {
                                    repository.deleteCommitteeMember(id)
                                    showToast("Committee member removed.")
                                }
                            },
                            onBackupDatabase = {
                                scope.launch {
                                    try {
                                        val dbFile = repository.createDatabaseBackupFile()
                                        DocumentExporter.shareExportedFile(
                                            context,
                                            dbFile,
                                            "application/octet-stream",
                                            "Save Verified SQLite Backup (.db)"
                                        )
                                        showToast("Verified SQLite backup ready!", celebrate = true)
                                    } catch (e: Exception) {
                                        showToast(e.message ?: "Backup failed")
                                    }
                                }
                            },
                            onRestoreDatabase = { uri ->
                                scope.launch {
                                    try {
                                        repository.restoreDatabaseFromUri(uri)
                                        showToast("Database restored atomically!", celebrate = true)
                                    } catch (e: Exception) {
                                        showToast(e.message ?: "Restore failed")
                                    }
                                }
                            },
                            onExportJsonSnapshot = {
                                scope.launch {
                                    val jsonFile = repository.exportJsonSnapshotFile()
                                    DocumentExporter.shareExportedFile(
                                        context,
                                        jsonFile,
                                        "application/json",
                                        "Export PS-AMS JSON Snapshot"
                                    )
                                }
                            },
                            onLoadDemoData = {
                                scope.launch {
                                    val count = repository.loadDemoData()
                                    showToast("Seeded $count Kerala demo athletes!", celebrate = true)
                                }
                            },
                            onClearDemoData = { scopeMode ->
                                scope.launch {
                                    val removed = repository.clearDemoData(scopeMode)
                                    showToast("Cleared $removed athlete record(s).")
                                }
                            },
                        )
                    }
                }
            }

            // Global Modals
            if (showStudentForm) {
                StudentFormModal(
                    initialStudent = editingStudent,
                    defaultMonthlyFee = snapshot.settings.defaultMonthlyFee,
                    onDismiss = { showStudentForm = false },
                    onSubmit = { input ->
                        scope.launch {
                            try {
                                val target = editingStudent
                                val saved = if (target == null) {
                                    repository.createStudent(input)
                                } else {
                                    repository.updateStudent(target.id, input)
                                }
                                showStudentForm = false
                                selectedStudentId = saved.id
                                activeStudentDetail = repository.fetchStudentDetail(saved.id)
                                currentView = NavView.STUDENT_DETAIL
                                showToast("Saved ${saved.fullName} (${saved.admissionNo})!", celebrate = true)
                            } catch (e: Exception) {
                                showToast(e.message ?: "Could not save athlete")
                            }
                        }
                    },
                )
            }

            if (showCollectFeeModal) {
                CollectFeeModal(
                    statuses = snapshot.feeOverview?.statuses.orEmpty(),
                    preselectedStudentId = collectFeeStudentId,
                    onDismiss = { showCollectFeeModal = false },
                    onCollect = { studentId, months, amount, mode, remarks, paymentDate ->
                        scope.launch {
                            try {
                                val receipt = repository.collectFee(
                                    studentId = studentId,
                                    months = months,
                                    amount = amount,
                                    paymentMode = mode,
                                    remarks = remarks,
                                    paymentDate = paymentDate,
                                )
                                showCollectFeeModal = false
                                if (selectedStudentId == studentId) {
                                    activeStudentDetail = repository.fetchStudentDetail(studentId)
                                }
                                val student = snapshot.students.firstOrNull { it.id == studentId }
                                if (student != null) {
                                    activePrintPayload = PrintPayload.FormalReceipt(receipt, student)
                                }
                                showToast("Issued Receipt ${receipt.receiptNo}!", celebrate = true)
                            } catch (e: Exception) {
                                showToast(e.message ?: "Fee collection failed")
                            }
                        }
                    },
                )
            }

            if (activePrintPayload != null) {
                PrintPreviewModal(
                    payload = activePrintPayload!!,
                    settings = snapshot.settings,
                    onDismiss = { activePrintPayload = null },
                )
            }

            // Celebratory Stop-Motion Confetti Burst
            CelebrationBurstOverlay(triggerCount = celebrationCount)

            // Launch Splash Overlay
            SplashOverlay(
                visible = showSplash,
                academyName = snapshot.settings.academyName,
                tagline = snapshot.settings.tagline,
                onFinished = { showSplash = false },
            )
        }
    }
}
