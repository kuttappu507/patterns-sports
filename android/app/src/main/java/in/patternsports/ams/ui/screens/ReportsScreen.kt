package `in`.patternsports.ams.ui.screens

import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import `in`.patternsports.ams.data.DocumentExporter
import `in`.patternsports.ams.domain.AGE_CATEGORIES
import `in`.patternsports.ams.domain.BmiEngine
import `in`.patternsports.ams.domain.DomainEngine
import `in`.patternsports.ams.domain.GENDERS
import `in`.patternsports.ams.domain.PLAYING_POSITIONS
import `in`.patternsports.ams.domain.PrintPayload
import `in`.patternsports.ams.domain.Student
import `in`.patternsports.ams.domain.TRAINING_BATCHES
import `in`.patternsports.ams.ui.components.FluidDropdownSelect
import `in`.patternsports.ams.ui.components.FluidGlassCard
import `in`.patternsports.ams.ui.components.FluidPrimaryButton
import `in`.patternsports.ams.ui.components.FluidSearchBar
import `in`.patternsports.ams.ui.components.FluidSecondaryButton
import `in`.patternsports.ams.ui.components.FluidTextField
import `in`.patternsports.ams.ui.components.FluidToneBadge
import `in`.patternsports.ams.ui.motion.StaggeredFluidEntrance
import `in`.patternsports.ams.ui.theme.CourtIcon
import `in`.patternsports.ams.ui.theme.CourtVectorIcon
import `in`.patternsports.ams.ui.theme.SorbetTheme
import java.util.Locale

// ============================================================
// PS-AMS :: Smart Search, Multi-Parameter Dropdown Filters & Reports
// 1:1 parity with src/components/psams/views/reports-view.tsx
// ============================================================

@Composable
fun ReportsScreen(
    students: List<Student>,
    onSelectStudent: (String) -> Unit,
    onOpenPrintPreview: (PrintPayload) -> Unit,
) {
    val colors = SorbetTheme.colors
    val typo = SorbetTheme.typography
    val context = LocalContext.current

    var q by remember { mutableStateOf("") }
    var category by remember { mutableStateOf("ALL") }
    var gender by remember { mutableStateOf("ALL") }
    var batch by remember { mutableStateOf("ALL") }
    var position by remember { mutableStateOf("ALL") }
    var school by remember { mutableStateOf("ALL") }
    var minHeightStr by remember { mutableStateOf("") }
    var minAgeStr by remember { mutableStateOf("") }
    var maxAgeStr by remember { mutableStateOf("") }

    val schoolOptions = remember(students) {
        val schools = students.map { it.schoolName.trim() }.filter { it.isNotEmpty() }.distinct().sorted()
        listOf("ALL" to "All Schools") + schools.map { it to it }
    }

    val filtered = remember(students, q, category, gender, batch, position, school, minHeightStr, minAgeStr, maxAgeStr) {
        val query = q.trim().lowercase(Locale.ROOT)
        val minH = minHeightStr.toDoubleOrNull()
        val minA = minAgeStr.toIntOrNull()
        val maxA = maxAgeStr.toIntOrNull()

        students.filter { s ->
            if (category != "ALL" && s.ageCategory != category) return@filter false
            if (gender != "ALL" && s.gender != gender) return@filter false
            if (batch != "ALL" && s.trainingBatch != batch) return@filter false
            if (position != "ALL" && (s.playingPosition ?: "") != position) return@filter false
            if (school != "ALL" && s.schoolName.trim() != school) return@filter false
            if (minH != null && (s.heightCm ?: 0.0) < minH) return@filter false
            val age = DomainEngine.computeAge(s.dateOfBirth)
            if (minA != null && age < minA) return@filter false
            if (maxA != null && age > maxA) return@filter false
            if (query.isNotEmpty()) {
                val hay = "${s.fullName} ${s.admissionNo} ${s.schoolName} ${s.parentName} ${s.mobile}".lowercase(Locale.ROOT)
                if (!hay.contains(query)) return@filter false
            }
            true
        }
    }

    val activeFilterCount = remember(category, gender, batch, position, school, minHeightStr, minAgeStr, maxAgeStr) {
        var c = 0
        if (category != "ALL") c++
        if (gender != "ALL") c++
        if (batch != "ALL") c++
        if (position != "ALL") c++
        if (school != "ALL") c++
        if (minHeightStr.isNotBlank()) c++
        if (minAgeStr.isNotBlank()) c++
        if (maxAgeStr.isNotBlank()) c++
        c
    }

    val avgHeight = remember(filtered) {
        val heights = filtered.mapNotNull { it.heightCm }
        if (heights.isEmpty()) null else heights.average()
    }

    val filterSummarySubtitle = buildString {
        append("Category: $category · Gender: $gender · Batch: $batch")
        if (position != "ALL") append(" · Position: $position")
        if (school != "ALL") append(" · School: $school")
        if (minHeightStr.isNotBlank()) append(" · Min Height: ${minHeightStr}cm")
        if (minAgeStr.isNotBlank() || maxAgeStr.isNotBlank()) {
            append(" · Age: ${minAgeStr.ifBlank { "0" }}–${maxAgeStr.ifBlank { "99" }}")
        }
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 14.dp),
        contentPadding = PaddingValues(top = 6.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        // 1. Multi-Parameter Dropdown Filter Deck (Matches PC app reports-view.tsx)
        item {
            FluidGlassCard(
                accentStripeColor = colors.primaryRose,
                contentPadding = 14.dp,
            ) {
                // Header Row
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.weight(1f),
                    ) {
                        CourtVectorIcon(
                            icon = CourtIcon.FILTER,
                            tint = colors.primaryRose,
                            size = 15.dp,
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        BasicText(
                            text = "Multi-Parameter Filtering Engine",
                            style = typo.h3.copy(color = colors.inkPrimary),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    if (activeFilterCount > 0 || q.isNotBlank()) {
                        Spacer(modifier = Modifier.width(8.dp))
                        FluidSecondaryButton(
                            text = "Reset ($activeFilterCount)",
                            onClick = {
                                q = ""
                                category = "ALL"
                                gender = "ALL"
                                batch = "ALL"
                                position = "ALL"
                                school = "ALL"
                                minHeightStr = ""
                                minAgeStr = ""
                                maxAgeStr = ""
                            },
                        )
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                // Real-time search bar
                FluidSearchBar(
                    query = q,
                    onQueryChange = { q = it },
                    placeholder = "Search name, admission no, parent mobile…",
                )

                Spacer(modifier = Modifier.height(10.dp))

                // Dropdown Row 1: Category & Batch
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    FluidDropdownSelect(
                        label = "Age Category",
                        options = listOf("ALL" to "All Categories") + AGE_CATEGORIES.map { it to it },
                        selectedKey = category,
                        onSelect = { category = it },
                        modifier = Modifier.weight(1f),
                    )
                    FluidDropdownSelect(
                        label = "Training Batch",
                        options = listOf("ALL" to "All Batches") + TRAINING_BATCHES.map { it to "$it Batch" },
                        selectedKey = batch,
                        onSelect = { batch = it },
                        modifier = Modifier.weight(1f),
                    )
                }

                Spacer(modifier = Modifier.height(8.dp))

                // Dropdown Row 2: Playing Position & Gender
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    FluidDropdownSelect(
                        label = "Playing Position",
                        options = listOf("ALL" to "All Positions") + PLAYING_POSITIONS.map { it to it },
                        selectedKey = position,
                        onSelect = { position = it },
                        modifier = Modifier.weight(1f),
                    )
                    FluidDropdownSelect(
                        label = "Gender",
                        options = listOf("ALL" to "All Genders") + GENDERS.map { it to it },
                        selectedKey = gender,
                        onSelect = { gender = it },
                        modifier = Modifier.weight(1f),
                    )
                }

                Spacer(modifier = Modifier.height(8.dp))

                // Dropdown Row 3: School
                FluidDropdownSelect(
                    label = "School / Institution",
                    options = schoolOptions,
                    selectedKey = school,
                    onSelect = { school = it },
                    modifier = Modifier.fillMaxWidth(),
                )

                Spacer(modifier = Modifier.height(8.dp))

                // Numeric Range Row: Min Height, Min Age, Max Age
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    FluidTextField(
                        value = minHeightStr,
                        onValueChange = { minHeightStr = DomainEngine.decimalOnly(it, 3) },
                        label = "Height > (cm)",
                        placeholder = "165",
                        keyboardType = KeyboardType.Number,
                        modifier = Modifier.weight(1f),
                    )
                    FluidTextField(
                        value = minAgeStr,
                        onValueChange = { minAgeStr = DomainEngine.intOnly(it, 2) },
                        label = "Min Age",
                        placeholder = "10",
                        keyboardType = KeyboardType.Number,
                        modifier = Modifier.weight(1f),
                    )
                    FluidTextField(
                        value = maxAgeStr,
                        onValueChange = { maxAgeStr = DomainEngine.intOnly(it, 2) },
                        label = "Max Age",
                        placeholder = "18",
                        keyboardType = KeyboardType.Number,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }

        // 2. Result Summary & Clean Export Action Bar (No overriding buttons)
        item {
            FluidGlassCard(
                contentPadding = 12.dp,
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    BasicText(
                        text = "${filtered.size} student${if (filtered.size == 1) "" else "s"} matched",
                        style = typo.bodyBold.copy(color = colors.inkPrimary),
                    )
                    if (avgHeight != null) {
                        FluidToneBadge(
                            text = "Avg Ht: ${"%.1f".format(Locale.US, avgHeight)} cm",
                            tone = "cyan",
                        )
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    FluidPrimaryButton(
                        text = "Print / PDF",
                        icon = CourtIcon.PRINTER,
                        modifier = Modifier.weight(1.25f),
                        onClick = {
                            onOpenPrintPreview(
                                PrintPayload.FilteredReport(
                                    students = filtered,
                                    title = "Student Registry Report",
                                    subtitle = filterSummarySubtitle,
                                )
                            )
                        },
                    )
                    FluidSecondaryButton(
                        text = "Excel",
                        icon = CourtIcon.DOWNLOAD,
                        tintColor = colors.accentTeal,
                        modifier = Modifier.weight(1f),
                        onClick = {
                            val file = DocumentExporter.exportStudentsToXlsx(context, filtered)
                            DocumentExporter.shareExportedFile(
                                context,
                                file,
                                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                                "Export Student Report (.xlsx)"
                            )
                        },
                    )
                    FluidSecondaryButton(
                        text = "CSV",
                        icon = CourtIcon.DOWNLOAD,
                        modifier = Modifier.weight(0.9f),
                        onClick = {
                            val file = DocumentExporter.exportStudentsToCsv(context, filtered)
                            DocumentExporter.shareExportedFile(
                                context,
                                file,
                                "text/csv",
                                "Export Student Report (.csv)"
                            )
                        },
                    )
                }
            }
        }

        // 3. Matching Student Registry Cards
        itemsIndexed(filtered, key = { _, s -> s.id }) { idx, s ->
            val age = DomainEngine.computeAge(s.dateOfBirth)
            val bmi = BmiEngine.bmiReportFields(s)
            StaggeredFluidEntrance(index = idx) {
                FluidGlassCard(
                    onClick = { onSelectStudent(s.id) },
                    contentPadding = 13.dp,
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                BasicText(
                                    text = s.fullName,
                                    style = typo.h3.copy(color = colors.inkPrimary),
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier.weight(1f, fill = false),
                                )
                                FluidToneBadge(text = s.ageCategory, tone = "rose")
                            }
                            Spacer(modifier = Modifier.height(2.dp))
                            BasicText(
                                text = "${s.admissionNo} · $age yrs · ${s.primarySport}${s.playingPosition?.let { " ($it)" } ?: ""}",
                                style = typo.caption.copy(color = colors.inkSecondary),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            if (s.schoolName.isNotBlank()) {
                                BasicText(
                                    text = s.schoolName,
                                    style = typo.caption.copy(color = colors.inkMuted),
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                        Column(horizontalAlignment = Alignment.End) {
                            BasicText(
                                text = DomainEngine.formatINR(s.monthlyFee),
                                style = typo.bodyBold.copy(
                                    color = colors.inkPrimary,
                                    fontWeight = FontWeight.Bold,
                                ),
                                maxLines = 1,
                            )
                            Spacer(modifier = Modifier.height(2.dp))
                            FluidToneBadge(
                                text = "${s.heightCm?.toInt() ?: "—"}cm · ${s.weightKg?.toInt() ?: "—"}kg",
                                tone = "cyan",
                            )
                            Spacer(modifier = Modifier.height(2.dp))
                            BasicText(
                                text = "BMI ${bmi.value}",
                                style = typo.caption.copy(color = colors.inkMuted),
                                maxLines = 1,
                            )
                        }
                    }
                }
            }
        }
    }
}
