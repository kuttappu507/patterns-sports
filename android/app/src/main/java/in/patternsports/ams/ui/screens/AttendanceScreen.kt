package `in`.patternsports.ams.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import `in`.patternsports.ams.domain.AGE_CATEGORIES
import `in`.patternsports.ams.domain.AttendanceData
import `in`.patternsports.ams.domain.AttendanceRecord
import `in`.patternsports.ams.domain.DomainEngine
import `in`.patternsports.ams.domain.PrintPayload
import `in`.patternsports.ams.domain.TRAINING_BATCHES
import `in`.patternsports.ams.ui.components.FluidDropdownSelect
import `in`.patternsports.ams.ui.components.FluidGlassCard
import `in`.patternsports.ams.ui.components.FluidIconOrbButton
import `in`.patternsports.ams.ui.components.FluidPrimaryButton
import `in`.patternsports.ams.ui.components.FluidSecondaryButton
import `in`.patternsports.ams.ui.motion.StaggeredFluidEntrance
import `in`.patternsports.ams.ui.motion.fluidPressable
import `in`.patternsports.ams.ui.theme.CourtIcon
import `in`.patternsports.ams.ui.theme.SorbetTheme
import java.time.LocalDate

// ============================================================
// PS-AMS :: Daily Batch Roll Call & Attendance Register
// 1:1 parity with src/components/psams/views/attendance-view.tsx
// ============================================================

@Composable
fun AttendanceScreen(
    attendanceData: AttendanceData?,
    selectedDate: String,
    selectedBatch: String,
    selectedCategory: String,
    onDateChange: (String) -> Unit,
    onBatchChange: (String) -> Unit,
    onCategoryChange: (String) -> Unit,
    onSaveRecords: (List<AttendanceRecord>) -> Unit,
    onOpenPrintPreview: (PrintPayload) -> Unit,
) {
    val colors = SorbetTheme.colors
    val typo = SorbetTheme.typography

    val draftStatuses = remember(attendanceData?.date, selectedBatch, selectedCategory) {
        mutableStateMapOf<String, String>()
    }

    LaunchedEffect(attendanceData) {
        draftStatuses.clear()
        attendanceData?.rows?.forEach { row ->
            if (row.status == "Present" || row.status == "Absent") {
                draftStatuses[row.student.id] = row.status
            }
        }
    }

    val rows = attendanceData?.rows.orEmpty()
    val presentCount = rows.count { draftStatuses[it.student.id] == "Present" }
    val absentCount = rows.count { draftStatuses[it.student.id] == "Absent" }
    val unmarkedCount = rows.size - presentCount - absentCount

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 14.dp, vertical = 6.dp),
    ) {
        // Date Navigation + Print Blank Sheet
        FluidGlassCard(
            accentStripeColor = colors.accentCyan,
            contentPadding = 12.dp,
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    modifier = Modifier.weight(1f),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    FluidIconOrbButton(
                        icon = CourtIcon.CHEVRON_LEFT,
                        size = 32.dp,
                        onClick = {
                            val d = DomainEngine.parseLocalDate(selectedDate) ?: LocalDate.now()
                            onDateChange(DomainEngine.todayKey(d.minusDays(1)))
                        },
                    )
                    Column(modifier = Modifier.weight(1f)) {
                        BasicText(
                            text = DomainEngine.formatDate(selectedDate),
                            style = typo.h3.copy(color = colors.inkPrimary),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        BasicText(
                            text = "$presentCount Present · $absentCount Absent · $unmarkedCount Unmarked",
                            style = typo.caption.copy(color = colors.inkSecondary),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    FluidIconOrbButton(
                        icon = CourtIcon.CHEVRON_RIGHT,
                        size = 32.dp,
                        onClick = {
                            val d = DomainEngine.parseLocalDate(selectedDate) ?: LocalDate.now()
                            val next = d.plusDays(1)
                            if (!next.isAfter(LocalDate.now())) {
                                onDateChange(DomainEngine.todayKey(next))
                            }
                        },
                    )
                }

                Spacer(modifier = Modifier.width(8.dp))

                FluidSecondaryButton(
                    text = "Sheet",
                    icon = CourtIcon.PRINTER,
                    onClick = {
                        val ym = DomainEngine.monthKey(DomainEngine.parseLocalDate(selectedDate) ?: LocalDate.now())
                        onOpenPrintPreview(
                            PrintPayload.BlankAttendanceSheet(
                                students = rows.map { it.student },
                                batch = selectedBatch,
                                category = selectedCategory,
                                monthLabel = DomainEngine.monthLabel(ym),
                            )
                        )
                    },
                )
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Bulk Mark All Present / Absent + Save
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                FluidSecondaryButton(
                    text = "All Present",
                    tintColor = colors.accentTeal,
                    modifier = Modifier.weight(1f),
                    onClick = {
                        rows.forEach { draftStatuses[it.student.id] = "Present" }
                    },
                )
                FluidSecondaryButton(
                    text = "All Absent",
                    tintColor = colors.dangerRed,
                    modifier = Modifier.weight(1f),
                    onClick = {
                        rows.forEach { draftStatuses[it.student.id] = "Absent" }
                    },
                )
                FluidPrimaryButton(
                    text = "Save (${presentCount + absentCount})",
                    icon = CourtIcon.CHECK,
                    modifier = Modifier.weight(1.15f),
                    onClick = {
                        val toSave = rows.mapNotNull { row ->
                            val st = draftStatuses[row.student.id] ?: return@mapNotNull null
                            AttendanceRecord(
                                studentId = row.student.id,
                                date = selectedDate,
                                batch = row.student.trainingBatch,
                                status = st,
                            )
                        }
                        if (toSave.isNotEmpty()) {
                            onSaveRecords(toSave)
                        }
                    },
                )
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        // Executive 2-Column Dropdown Filters: Batch & Category
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            FluidDropdownSelect(
                options = listOf("ALL" to "All Batches") + TRAINING_BATCHES.map { it to "$it Batch" },
                selectedKey = selectedBatch,
                onSelect = onBatchChange,
                modifier = Modifier.weight(1f),
            )
            FluidDropdownSelect(
                options = listOf("ALL" to "All Categories") + AGE_CATEGORIES.map { it to it },
                selectedKey = selectedCategory,
                onSelect = onCategoryChange,
                modifier = Modifier.weight(1f),
            )
        }

        Spacer(modifier = Modifier.height(10.dp))

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            itemsIndexed(rows, key = { _, r -> r.student.id }) { idx, row ->
                val currentStatus = draftStatuses[row.student.id] ?: "Unmarked"
                StaggeredFluidEntrance(index = idx) {
                    FluidGlassCard(contentPadding = 12.dp) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                BasicText(
                                    text = row.student.fullName,
                                    style = typo.h3.copy(color = colors.inkPrimary),
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                BasicText(
                                    text = "${row.student.admissionNo} · ${row.student.ageCategory} · ${row.student.trainingBatch}",
                                    style = typo.caption.copy(color = colors.inkSecondary),
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }

                            Spacer(modifier = Modifier.width(8.dp))

                            Row(
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                // Present Toggle Pill
                                val isPresent = currentStatus == "Present"
                                Box(
                                    modifier = Modifier
                                        .fluidPressable(scaleDown = 0.94f, onClick = {
                                            draftStatuses[row.student.id] = "Present"
                                        })
                                        .clip(RoundedCornerShape(9.dp))
                                        .background(if (isPresent) colors.accentTeal else colors.bgSubtle)
                                        .border(1.dp, if (isPresent) colors.accentTeal else colors.borderSubtle, RoundedCornerShape(9.dp))
                                        .padding(horizontal = 12.dp, vertical = 7.dp),
                                ) {
                                    BasicText(
                                        text = "PRESENT",
                                        style = typo.microCaps.copy(
                                            color = if (isPresent) Color.White else colors.inkSecondary,
                                            fontWeight = FontWeight.Bold,
                                        ),
                                        maxLines = 1,
                                    )
                                }

                                // Absent Toggle Pill
                                val isAbsent = currentStatus == "Absent"
                                Box(
                                    modifier = Modifier
                                        .fluidPressable(scaleDown = 0.94f, onClick = {
                                            draftStatuses[row.student.id] = "Absent"
                                        })
                                        .clip(RoundedCornerShape(9.dp))
                                        .background(if (isAbsent) colors.dangerRed else colors.bgSubtle)
                                        .border(1.dp, if (isAbsent) colors.dangerRed else colors.borderSubtle, RoundedCornerShape(9.dp))
                                        .padding(horizontal = 12.dp, vertical = 7.dp),
                                ) {
                                    BasicText(
                                        text = "ABSENT",
                                        style = typo.microCaps.copy(
                                            color = if (isAbsent) Color.White else colors.inkSecondary,
                                            fontWeight = FontWeight.Bold,
                                        ),
                                        maxLines = 1,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
