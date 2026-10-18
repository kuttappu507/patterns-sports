package `in`.patternsports.ams.ui.modals

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import `in`.patternsports.ams.domain.AGE_CATEGORIES
import `in`.patternsports.ams.domain.BLOOD_GROUPS
import `in`.patternsports.ams.domain.BmiEngine
import `in`.patternsports.ams.domain.DomainEngine
import `in`.patternsports.ams.domain.GENDERS
import `in`.patternsports.ams.domain.PLAYING_POSITIONS
import `in`.patternsports.ams.domain.PRIMARY_SPORTS
import `in`.patternsports.ams.domain.STUDENT_STATUSES
import `in`.patternsports.ams.domain.Student
import `in`.patternsports.ams.domain.StudentInput
import `in`.patternsports.ams.domain.TRAINING_BATCHES
import `in`.patternsports.ams.ui.components.FluidDropdownSelect
import `in`.patternsports.ams.ui.components.FluidModalSheet
import `in`.patternsports.ams.ui.components.FluidPrimaryButton
import `in`.patternsports.ams.ui.components.FluidTextField
import `in`.patternsports.ams.ui.components.FluidToneBadge
import `in`.patternsports.ams.ui.theme.CourtIcon
import `in`.patternsports.ams.ui.theme.SorbetTheme

// ============================================================
// PS-AMS :: Register / Edit Athlete Modal Dialog
// 1:1 parity with src/components/psams/student-form-dialog.tsx
// ============================================================

@Composable
fun StudentFormModal(
    initialStudent: Student?,
    defaultMonthlyFee: Double,
    onDismiss: () -> Unit,
    onSubmit: (StudentInput) -> Unit,
) {
    val colors = SorbetTheme.colors
    val typo = SorbetTheme.typography

    var fullName by remember(initialStudent) { mutableStateOf(initialStudent?.fullName ?: "") }
    var dateOfBirth by remember(initialStudent) { mutableStateOf(initialStudent?.dateOfBirth?.take(10) ?: "2012-06-15") }
    var registrationDate by remember(initialStudent) {
        mutableStateOf(initialStudent?.registrationDate?.take(10) ?: DomainEngine.todayKey())
    }
    var gender by remember(initialStudent) { mutableStateOf(initialStudent?.gender ?: "Male") }
    var bloodGroup by remember(initialStudent) { mutableStateOf(initialStudent?.bloodGroup ?: "O+") }
    var parentName by remember(initialStudent) { mutableStateOf(initialStudent?.parentName ?: "") }
    var mobile by remember(initialStudent) { mutableStateOf(initialStudent?.mobile ?: "") }
    var emergencyContact by remember(initialStudent) { mutableStateOf(initialStudent?.emergencyContact ?: "") }
    var address by remember(initialStudent) { mutableStateOf(initialStudent?.address ?: "") }
    var schoolName by remember(initialStudent) { mutableStateOf(initialStudent?.schoolName ?: "") }
    var classGrade by remember(initialStudent) { mutableStateOf(initialStudent?.classGrade ?: "") }
    var division by remember(initialStudent) { mutableStateOf(initialStudent?.division ?: "") }

    val computedAge = DomainEngine.computeAge(dateOfBirth)
    val suggestedCategory = DomainEngine.suggestAgeCategory(computedAge)

    var ageCategory by remember(initialStudent) {
        mutableStateOf(initialStudent?.ageCategory ?: suggestedCategory)
    }
    var trainingBatch by remember(initialStudent) { mutableStateOf(initialStudent?.trainingBatch ?: "Evening") }
    var primarySport by remember(initialStudent) { mutableStateOf(initialStudent?.primarySport ?: "Volleyball") }
    var playingPosition by remember(initialStudent) { mutableStateOf(initialStudent?.playingPosition ?: "Attacker / Spiker") }
    var monthlyFeeStr by remember(initialStudent) {
        mutableStateOf((initialStudent?.monthlyFee ?: defaultMonthlyFee).toInt().toString())
    }
    var status by remember(initialStudent) { mutableStateOf(initialStudent?.status ?: "Active") }

    var heightStr by remember(initialStudent) { mutableStateOf(initialStudent?.heightCm?.toString() ?: "") }
    var weightStr by remember(initialStudent) { mutableStateOf(initialStudent?.weightKg?.toString() ?: "") }
    var standingStr by remember(initialStudent) { mutableStateOf(initialStudent?.standingReachCm?.toString() ?: "") }
    var spikeStr by remember(initialStudent) { mutableStateOf(initialStudent?.spikeReachCm?.toString() ?: "") }
    var jumpStr by remember(initialStudent) { mutableStateOf(initialStudent?.jumpReachCm?.toString() ?: "") }
    var notes by remember(initialStudent) { mutableStateOf(initialStudent?.notes ?: "") }
    var errorMsg by remember { mutableStateOf<String?>(null) }

    // Live WHO 2007 BMI-for-Age & Vertical Jump Preview
    val liveBmi = BmiEngine.presentBmi(
        BmiEngine.assessBmi(
            weightKg = weightStr.toDoubleOrNull(),
            heightCm = heightStr.toDoubleOrNull(),
            dateOfBirth = dateOfBirth,
            gender = gender,
        )
    )
    val liveJumpGain = DomainEngine.jumpDelta(spikeStr.toDoubleOrNull(), standingStr.toDoubleOrNull())

    FluidModalSheet(
        title = if (initialStudent == null) "Register New Athlete" else "Edit ${initialStudent.fullName}",
        subtitle = if (initialStudent == null) {
            "Auto-assigns PSA-YYYY-NNNN admission number"
        } else {
            "Admission No: ${initialStudent.admissionNo}"
        },
        onDismiss = onDismiss,
    ) {
        if (!errorMsg.isNullOrBlank()) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(colors.dangerSoft)
                    .padding(10.dp)
            ) {
                BasicText(errorMsg!!, style = typo.bodyBold.copy(color = colors.dangerRed))
            }
        }

        FluidTextField(
            value = fullName,
            onValueChange = { fullName = it },
            label = "Athlete Full Name *",
            placeholder = "e.g., Aravind R Menon",
        )

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FluidTextField(
                value = dateOfBirth,
                onValueChange = {
                    dateOfBirth = it
                    val newAge = DomainEngine.computeAge(it)
                    if (newAge > 0 && initialStudent == null) {
                        ageCategory = DomainEngine.suggestAgeCategory(newAge)
                    }
                },
                label = "DOB (YYYY-MM-DD) *",
                modifier = Modifier.weight(1f),
            )
            FluidTextField(
                value = registrationDate,
                onValueChange = { registrationDate = it },
                label = "Joining Date",
                modifier = Modifier.weight(1f),
            )
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            FluidToneBadge(text = "Age: ${DomainEngine.ageDetailed(dateOfBirth)}", tone = "cyan")
            FluidToneBadge(text = "Suggested: $suggestedCategory", tone = "amber")
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FluidDropdownSelect(
                label = "Gender",
                options = GENDERS.map { it to it },
                selectedKey = gender,
                onSelect = { gender = it },
                modifier = Modifier.weight(1f),
            )
            FluidDropdownSelect(
                label = "Blood Group",
                options = BLOOD_GROUPS.map { it to it },
                selectedKey = bloodGroup,
                onSelect = { bloodGroup = it },
                modifier = Modifier.weight(1f),
            )
        }

        BasicText("GUARDIAN & CONTACT", style = typo.microCaps.copy(color = colors.inkSecondary))
        FluidTextField(
            value = parentName,
            onValueChange = { parentName = it },
            label = "Parent / Guardian Name *",
            placeholder = "e.g., Ramesh Menon",
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FluidTextField(
                value = mobile,
                onValueChange = { mobile = DomainEngine.phoneDigits(it) },
                label = "10-Digit Mobile *",
                keyboardType = KeyboardType.Phone,
                modifier = Modifier.weight(1f),
            )
            FluidTextField(
                value = emergencyContact,
                onValueChange = { emergencyContact = DomainEngine.phoneDigits(it) },
                label = "Emergency Phone",
                keyboardType = KeyboardType.Phone,
                modifier = Modifier.weight(1f),
            )
        }
        FluidTextField(
            value = address,
            onValueChange = { address = it },
            label = "Residential Address",
        )

        BasicText("ACADEMIC DETAILS", style = typo.microCaps.copy(color = colors.inkSecondary))
        FluidTextField(
            value = schoolName,
            onValueChange = { schoolName = it },
            label = "School / College Name",
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FluidTextField(
                value = classGrade,
                onValueChange = { classGrade = it },
                label = "Class / Grade",
                modifier = Modifier.weight(1f),
            )
            FluidTextField(
                value = division,
                onValueChange = { division = it },
                label = "Division",
                modifier = Modifier.weight(1f),
            )
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FluidDropdownSelect(
                label = "Age Category",
                options = AGE_CATEGORIES.map { it to DomainEngine.categoryBracket(it) },
                selectedKey = ageCategory,
                onSelect = { ageCategory = it },
                modifier = Modifier.weight(1f),
            )
            FluidDropdownSelect(
                label = "Training Batch",
                options = TRAINING_BATCHES.map { it to "$it Batch" },
                selectedKey = trainingBatch,
                onSelect = { trainingBatch = it },
                modifier = Modifier.weight(1f),
            )
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FluidDropdownSelect(
                label = "Primary Sport",
                options = PRIMARY_SPORTS.map { it to it },
                selectedKey = primarySport,
                onSelect = { primarySport = it },
                modifier = Modifier.weight(1f),
            )
            FluidDropdownSelect(
                label = "Playing Position",
                options = PLAYING_POSITIONS.map { it to it },
                selectedKey = playingPosition,
                onSelect = { playingPosition = it },
                modifier = Modifier.weight(1f),
            )
        }

        BasicText("ANTHROPOMETRICS & WHO 2007 BMI PREVIEW", style = typo.microCaps.copy(color = colors.inkSecondary))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FluidTextField(
                value = heightStr,
                onValueChange = { heightStr = DomainEngine.decimalOnly(it) },
                label = "Height (cm)",
                keyboardType = KeyboardType.Decimal,
                modifier = Modifier.weight(1f),
            )
            FluidTextField(
                value = weightStr,
                onValueChange = { weightStr = DomainEngine.decimalOnly(it) },
                label = "Weight (kg)",
                keyboardType = KeyboardType.Decimal,
                modifier = Modifier.weight(1f),
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FluidTextField(
                value = standingStr,
                onValueChange = { standingStr = DomainEngine.decimalOnly(it) },
                label = "Standing Reach (cm)",
                keyboardType = KeyboardType.Decimal,
                modifier = Modifier.weight(1f),
            )
            FluidTextField(
                value = spikeStr,
                onValueChange = { spikeStr = DomainEngine.decimalOnly(it) },
                label = "Spike Reach (cm)",
                keyboardType = KeyboardType.Decimal,
                modifier = Modifier.weight(1f),
            )
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            FluidToneBadge(text = "WHO BMI: ${liveBmi.value} (${liveBmi.label})", tone = liveBmi.tone)
            if (liveJumpGain != null) {
                FluidToneBadge(text = "Vertical Jump: +${liveJumpGain.toInt()} cm", tone = "emerald")
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FluidTextField(
                value = monthlyFeeStr,
                onValueChange = { monthlyFeeStr = DomainEngine.decimalOnly(it) },
                label = "Monthly Fee (₹)",
                keyboardType = KeyboardType.Number,
                modifier = Modifier.weight(1f),
            )
            FluidTextField(
                value = jumpStr,
                onValueChange = { jumpStr = DomainEngine.decimalOnly(it) },
                label = "Block Reach (cm)",
                keyboardType = KeyboardType.Decimal,
                modifier = Modifier.weight(1f),
            )
        }

        FluidDropdownSelect(
            label = "Enrolment Status",
            options = STUDENT_STATUSES.map { it to it },
            selectedKey = status,
            onSelect = { status = it },
        )

        FluidTextField(
            value = notes,
            onValueChange = { notes = it },
            label = "Coach / Medical Notes",
        )

        Spacer(modifier = Modifier.height(6.dp))

        FluidPrimaryButton(
            text = if (initialStudent == null) "Complete Admission" else "Save Changes",
            icon = CourtIcon.CHECK,
            modifier = Modifier.fillMaxWidth(),
            onClick = {
                try {
                    val input = StudentInput(
                        admissionNo = initialStudent?.admissionNo,
                        fullName = fullName,
                        dateOfBirth = dateOfBirth,
                        registrationDate = registrationDate,
                        parentName = parentName,
                        mobile = mobile,
                        emergencyContact = emergencyContact.ifBlank { null },
                        address = address,
                        schoolName = schoolName,
                        classGrade = classGrade,
                        division = division,
                        bloodGroup = bloodGroup,
                        gender = gender,
                        heightCm = heightStr.toDoubleOrNull(),
                        weightKg = weightStr.toDoubleOrNull(),
                        standingReachCm = standingStr.toDoubleOrNull(),
                        spikeReachCm = spikeStr.toDoubleOrNull(),
                        jumpReachCm = jumpStr.toDoubleOrNull(),
                        primarySport = primarySport,
                        playingPosition = playingPosition,
                        ageCategory = ageCategory,
                        trainingBatch = trainingBatch,
                        monthlyFee = monthlyFeeStr.toDoubleOrNull() ?: defaultMonthlyFee,
                        photoPath = initialStudent?.photoPath,
                        birthCertPath = initialStudent?.birthCertPath,
                        idCardPath = initialStudent?.idCardPath,
                        status = status,
                        notes = notes.ifBlank { null },
                    )
                    DomainEngine.assertValidStudentInput(input)
                    onSubmit(input)
                } catch (e: Exception) {
                    errorMsg = e.message
                }
            },
        )
    }
}
