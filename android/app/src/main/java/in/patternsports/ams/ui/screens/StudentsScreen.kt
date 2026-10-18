package `in`.patternsports.ams.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import `in`.patternsports.ams.domain.AGE_CATEGORIES
import `in`.patternsports.ams.domain.BmiEngine
import `in`.patternsports.ams.domain.DomainEngine
import `in`.patternsports.ams.domain.Student
import `in`.patternsports.ams.domain.StudentFeeStatus
import `in`.patternsports.ams.domain.TRAINING_BATCHES
import `in`.patternsports.ams.ui.components.FluidConfirmDialog
import `in`.patternsports.ams.ui.components.FluidDropdownSelect
import `in`.patternsports.ams.ui.components.FluidGlassCard
import `in`.patternsports.ams.ui.components.FluidIconOrbButton
import `in`.patternsports.ams.ui.components.FluidPrimaryButton
import `in`.patternsports.ams.ui.components.FluidSearchBar
import `in`.patternsports.ams.ui.components.FluidToneBadge
import `in`.patternsports.ams.ui.motion.StaggeredFluidEntrance
import `in`.patternsports.ams.ui.motion.StopMotionStampBadge
import `in`.patternsports.ams.ui.theme.CourtIcon
import `in`.patternsports.ams.ui.theme.SorbetTheme
import java.util.Locale

// ============================================================
// PS-AMS :: Athlete Roster Screen
// 1:1 parity with src/components/psams/views/students-view.tsx
// ============================================================

@Composable
fun StudentsScreen(
    students: List<Student>,
    feeStatusByStudentId: Map<String, StudentFeeStatus>,
    initialCategoryFilter: String,
    onCategoryFilterChange: (String) -> Unit,
    onSelectStudent: (String) -> Unit,
    onAddStudent: () -> Unit,
    onEditStudent: (Student) -> Unit,
    onCollectFee: (String) -> Unit,
    onDeleteStudent: (Student) -> Unit = {},
) {
    val colors = SorbetTheme.colors
    val typo = SorbetTheme.typography

    var searchQuery by remember { mutableStateOf("") }
    var statusFilter by remember { mutableStateOf("Active") }
    var batchFilter by remember { mutableStateOf("ALL") }
    var pendingDeleteStudent by remember { mutableStateOf<Student?>(null) }

    val filtered = remember(students, searchQuery, initialCategoryFilter, statusFilter, batchFilter) {
        val q = searchQuery.trim().lowercase(Locale.ROOT)
        students.filter { s ->
            if (statusFilter != "ALL" && s.status != statusFilter) return@filter false
            if (initialCategoryFilter != "ALL" && s.ageCategory != initialCategoryFilter) return@filter false
            if (batchFilter != "ALL" && s.trainingBatch != batchFilter) return@filter false
            if (q.isNotEmpty()) {
                val hay = "${s.fullName} ${s.admissionNo} ${s.parentName} ${s.mobile} ${s.schoolName} ${s.playingPosition ?: ""}"
                    .lowercase(Locale.ROOT)
                if (!hay.contains(q)) return@filter false
            }
            true
        }
    }

    val categoryOptions = remember {
        listOf("ALL" to "All Categories") + AGE_CATEGORIES.map { it to it }
    }
    val batchOptions = remember {
        listOf("ALL" to "All Batches") + TRAINING_BATCHES.map { it to "$it Batch" }
    }
    val statusOptions = remember {
        listOf(
            "Active" to "Active",
            "Inactive" to "Inactive",
            "Alumni" to "Alumni",
            "ALL" to "All Status",
        )
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 14.dp, vertical = 6.dp),
    ) {
        // Search Bar
        FluidSearchBar(
            query = searchQuery,
            onQueryChange = { searchQuery = it },
            placeholder = "Search name, PSA admission no, mobile, school…",
        )
        Spacer(modifier = Modifier.height(8.dp))

        // Executive 3-Column Dropdown Filter Row
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            FluidDropdownSelect(
                options = categoryOptions,
                selectedKey = initialCategoryFilter,
                onSelect = onCategoryFilterChange,
                modifier = Modifier.weight(1.1f),
            )
            FluidDropdownSelect(
                options = batchOptions,
                selectedKey = batchFilter,
                onSelect = { batchFilter = it },
                modifier = Modifier.weight(1f),
            )
            FluidDropdownSelect(
                options = statusOptions,
                selectedKey = statusFilter,
                onSelect = { statusFilter = it },
                modifier = Modifier.weight(0.95f),
            )
        }

        Spacer(modifier = Modifier.height(8.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            BasicText(
                text = "${filtered.size} athlete${if (filtered.size == 1) "" else "s"} shown",
                style = typo.caption.copy(
                    color = colors.inkSecondary,
                    fontWeight = FontWeight.Medium,
                ),
            )
            if (initialCategoryFilter != "ALL" || batchFilter != "ALL" || statusFilter != "Active" || searchQuery.isNotBlank()) {
                BasicText(
                    text = "Filtered view",
                    style = typo.caption.copy(color = colors.primaryRose, fontWeight = FontWeight.SemiBold),
                )
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        if (filtered.isEmpty()) {
            FluidGlassCard(
                modifier = Modifier.fillMaxWidth(),
                accentStripeColor = colors.primaryRose,
            ) {
                BasicText("No matching athletes found", style = typo.h2.copy(color = colors.inkPrimary))
                Spacer(modifier = Modifier.height(4.dp))
                BasicText(
                    "Adjust the category/status filter or register a new athlete into the academy.",
                    style = typo.body.copy(color = colors.inkSecondary),
                )
                Spacer(modifier = Modifier.height(12.dp))
                FluidPrimaryButton(
                    text = "Register Athlete",
                    icon = CourtIcon.PLUS,
                    onClick = onAddStudent,
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                itemsIndexed(filtered, key = { _, s -> s.id }) { idx, student ->
                    val feeStatus = feeStatusByStudentId[student.id]
                    StaggeredFluidEntrance(index = idx) {
                        AthleteRosterCard(
                            student = student,
                            feeStatus = feeStatus,
                            onSelect = { onSelectStudent(student.id) },
                            onEdit = { onEditStudent(student) },
                            onCollectFee = { onCollectFee(student.id) },
                            onDelete = { pendingDeleteStudent = student },
                        )
                    }
                }
            }
        }
    }

    val targetDeleteStudent = pendingDeleteStudent
    if (targetDeleteStudent != null) {
        FluidConfirmDialog(
            title = "Remove ${targetDeleteStudent.fullName}?",
            message = "This permanently deletes ${targetDeleteStudent.fullName} (${targetDeleteStudent.admissionNo}) along with achievements, biometric growth logs, and attendance records. This action cannot be undone.",
            confirmText = "Delete Athlete",
            onConfirm = {
                pendingDeleteStudent = null
                onDeleteStudent(targetDeleteStudent)
            },
            onDismiss = { pendingDeleteStudent = null },
        )
    }
}

@Composable
private fun AthleteRosterCard(
    student: Student,
    feeStatus: StudentFeeStatus?,
    onSelect: () -> Unit,
    onEdit: () -> Unit,
    onCollectFee: () -> Unit,
    onDelete: () -> Unit,
) {
    val colors = SorbetTheme.colors
    val typo = SorbetTheme.typography
    val age = DomainEngine.computeAge(student.dateOfBirth)
    val bmiPres = BmiEngine.presentBmi(BmiEngine.assessStudentBmi(student))
    val jumpGain = DomainEngine.jumpDelta(student.spikeReachCm, student.standingReachCm)

    val initials = student.fullName
        .split(" ")
        .filter { it.isNotBlank() }
        .take(2)
        .joinToString("") { it.first().uppercase() }
        .ifEmpty { "PS" }

    FluidGlassCard(
        onClick = onSelect,
        contentPadding = 14.dp,
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Avatar Monogram Squircle
            Box(
                modifier = Modifier
                    .size(46.dp)
                    .clip(RoundedCornerShape(13.dp))
                    .background(
                        Brush.linearGradient(
                            listOf(colors.primaryRose, colors.primaryRoseDeep)
                        )
                    ),
                contentAlignment = Alignment.Center,
            ) {
                BasicText(
                    text = initials,
                    style = typo.h2.copy(color = Color.White, fontWeight = FontWeight.Bold),
                    maxLines = 1,
                )
            }

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    BasicText(
                        text = student.fullName,
                        style = typo.h3.copy(color = colors.inkPrimary),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false),
                    )
                    FluidToneBadge(text = student.ageCategory, tone = "rose")
                }
                Spacer(modifier = Modifier.height(3.dp))
                BasicText(
                    text = "${student.admissionNo} · $age yrs · ${student.trainingBatch} · ${student.playingPosition ?: student.primarySport}",
                    style = typo.caption.copy(color = colors.inkSecondary),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            // Fee Status Pill
            if (feeStatus != null) {
                Spacer(modifier = Modifier.width(8.dp))
                val isDef = feeStatus.isDefaulter
                val hasPending = feeStatus.pendingMonths.isNotEmpty()
                StopMotionStampBadge(
                    label = when {
                        isDef -> "DEFAULTER"
                        hasPending -> "DUE ${DomainEngine.formatINR(feeStatus.dueAmount)}"
                        else -> "PAID"
                    },
                    color = when {
                        isDef -> colors.dangerRed
                        hasPending -> colors.accentAmber
                        else -> colors.accentTeal
                    },
                    backgroundColor = when {
                        isDef -> colors.dangerSoft
                        hasPending -> colors.accentAmberSoft
                        else -> colors.accentTealSoft
                    },
                    stampKey = "${student.id}-${feeStatus.dueAmount}",
                )
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        // Biometrics & Action Footer Strip (Weighted so text never crumbles)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(10.dp))
                .background(colors.bgSubtle.copy(alpha = 0.65f))
                .padding(horizontal = 10.dp, vertical = 7.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(
                modifier = Modifier.weight(1f),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                MetricPill("HT", student.heightCm?.let { "${it.toInt()}cm" } ?: "—")
                MetricPill("WT", student.weightKg?.let { "${it.toInt()}kg" } ?: "—")
                MetricPill("BMI", bmiPres.value)
                if (jumpGain != null) {
                    MetricPill("JUMP", "+${jumpGain.toInt()}cm")
                }
            }

            Spacer(modifier = Modifier.width(8.dp))

            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                FluidIconOrbButton(
                    icon = CourtIcon.FEES_RUPEE,
                    tint = colors.accentTeal,
                    size = 30.dp,
                    onClick = onCollectFee,
                )
                FluidIconOrbButton(
                    icon = CourtIcon.EDIT,
                    tint = colors.inkSecondary,
                    size = 30.dp,
                    onClick = onEdit,
                )
                FluidIconOrbButton(
                    icon = CourtIcon.TRASH,
                    tint = colors.dangerRed,
                    size = 30.dp,
                    onClick = onDelete,
                )
            }
        }
    }
}

@Composable
private fun MetricPill(label: String, value: String) {
    val colors = SorbetTheme.colors
    val typo = SorbetTheme.typography
    Column {
        BasicText(
            text = label,
            style = typo.microCaps.copy(color = colors.inkMuted),
            maxLines = 1,
        )
        BasicText(
            text = value,
            style = typo.caption.copy(color = colors.inkPrimary, fontWeight = FontWeight.SemiBold),
            maxLines = 1,
        )
    }
}
