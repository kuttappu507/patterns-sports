package `in`.patternsports.ams.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import `in`.patternsports.ams.data.WhatsAppDispatcher
import `in`.patternsports.ams.domain.ACHIEVEMENT_LEVELS
import `in`.patternsports.ams.domain.AcademySettings
import `in`.patternsports.ams.domain.Achievement
import `in`.patternsports.ams.domain.AchievementInput
import `in`.patternsports.ams.domain.BmiAssessment
import `in`.patternsports.ams.domain.BmiEngine
import `in`.patternsports.ams.domain.DomainEngine
import `in`.patternsports.ams.domain.FeePayment
import `in`.patternsports.ams.domain.MEDAL_TYPES
import `in`.patternsports.ams.domain.Measurement
import `in`.patternsports.ams.domain.MeasurementInput
import `in`.patternsports.ams.domain.NET_HEIGHT_M
import `in`.patternsports.ams.domain.PrintPayload
import `in`.patternsports.ams.domain.StudentDetail
import `in`.patternsports.ams.ui.components.FluidConfirmDialog
import `in`.patternsports.ams.ui.components.FluidDropdownSelect
import `in`.patternsports.ams.ui.components.FluidGlassCard
import `in`.patternsports.ams.ui.components.FluidIconOrbButton
import `in`.patternsports.ams.ui.components.FluidModalSheet
import `in`.patternsports.ams.ui.components.FluidPrimaryButton
import `in`.patternsports.ams.ui.components.FluidSecondaryButton
import `in`.patternsports.ams.ui.components.FluidTextField
import `in`.patternsports.ams.ui.components.FluidToneBadge
import `in`.patternsports.ams.ui.motion.StaggeredFluidEntrance
import `in`.patternsports.ams.ui.motion.StopMotionStampBadge
import `in`.patternsports.ams.ui.motion.stopMotionStickerWobble
import `in`.patternsports.ams.ui.theme.CourtIcon
import `in`.patternsports.ams.ui.theme.CourtVectorIcon
import `in`.patternsports.ams.ui.theme.SorbetTheme
import java.util.Locale

// ============================================================
// PS-AMS :: 360° Athlete Dossier, WHO 2007 BMI & Sports Science
// 1:1 parity with src/components/psams/views/student-detail-view.tsx
// ============================================================

@Composable
fun StudentDetailScreen(
    detail: StudentDetail,
    settings: AcademySettings,
    onBack: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onCollectFee: () -> Unit,
    onRecordMeasurement: (MeasurementInput) -> Unit,
    onDeleteMeasurement: (String) -> Unit,
    onAddAchievement: (AchievementInput) -> Unit,
    onDeleteAchievement: (String) -> Unit,
    onUploadDocument: (Uri, String) -> Unit, // (uri, fieldKind: "photo"|"birthCert"|"idCard")
    onOpenPrintPreview: (PrintPayload) -> Unit,
    onPrintReceipt: (FeePayment) -> Unit,
) {
    val colors = SorbetTheme.colors
    val typo = SorbetTheme.typography
    val context = LocalContext.current
    val scroll = rememberScrollState()

    val s = detail.student
    val ageDetailed = DomainEngine.ageDetailed(s.dateOfBirth)
    val bmiAssessment = BmiEngine.assessCurrentBmi(s, detail.measurements)
    val bmiPres = BmiEngine.presentBmi(bmiAssessment)
    val weightBand = BmiEngine.weightBandFor(s.heightCm, s.dateOfBirth, s.gender)
    val jumpGain = DomainEngine.jumpDelta(s.spikeReachCm, s.standingReachCm)
    val jumpRating = DomainEngine.verticalJumpRating(jumpGain)
    val netClearance = DomainEngine.spikeClearance(s.spikeReachCm, s.ageCategory)
    val reachRatio = DomainEngine.reachRatio(s.standingReachCm, s.heightCm)
    val trainMonths = DomainEngine.trainingAge(s.registrationDate)

    var showMeasurementModal by remember { mutableStateOf(false) }
    var showAchievementModal by remember { mutableStateOf(false) }
    var confirmDeleteProfile by remember { mutableStateOf(false) }
    var pendingDeleteMeasurement by remember { mutableStateOf<Measurement?>(null) }
    var pendingDeleteAchievement by remember { mutableStateOf<Achievement?>(null) }
    var pendingDocTarget by remember { mutableStateOf("photo") }

    val docPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) {
            onUploadDocument(uri, pendingDocTarget)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(scroll)
            .padding(horizontal = 14.dp, vertical = 6.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        // Top Action Bar
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            FluidSecondaryButton(
                text = "Roster",
                icon = CourtIcon.CHEVRON_LEFT,
                onClick = onBack,
            )
            Row(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                FluidSecondaryButton(
                    text = "Profile PDF",
                    icon = CourtIcon.PRINTER,
                    onClick = { onOpenPrintPreview(PrintPayload.ProfileCard(detail)) },
                )
                FluidSecondaryButton(
                    text = "Edit",
                    icon = CourtIcon.EDIT,
                    onClick = onEdit,
                )
                FluidIconOrbButton(
                    icon = CourtIcon.TRASH,
                    tint = colors.dangerRed,
                    onClick = { confirmDeleteProfile = true },
                )
            }
        }

        // 1. Hero Athlete Identity Card
        StaggeredFluidEntrance(index = 0) {
            FluidGlassCard(accentStripeColor = colors.primaryRose) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    val initials = s.fullName.split(" ").filter { it.isNotBlank() }.take(2)
                        .joinToString("") { it.first().uppercase() }.ifEmpty { "PS" }

                    Box(
                        modifier = Modifier
                            .size(64.dp)
                            .clip(RoundedCornerShape(20.dp))
                            .background(Brush.linearGradient(listOf(colors.primaryRose, colors.accentAmber))),
                        contentAlignment = Alignment.Center,
                    ) {
                        BasicText(initials, style = typo.h1.copy(color = Color.White, fontWeight = FontWeight.Black))
                    }

                    Spacer(modifier = Modifier.width(14.dp))

                    Column(modifier = Modifier.weight(1f)) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            FluidToneBadge(text = s.admissionNo, tone = "rose")
                            FluidToneBadge(text = s.status, tone = if (s.status == "Active") "emerald" else "slate")
                        }
                        Spacer(modifier = Modifier.height(4.dp))
                        BasicText(s.fullName, style = typo.h1.copy(color = colors.inkPrimary))
                        BasicText(
                            "${DomainEngine.categoryBracket(s.ageCategory)} • ${s.trainingBatch} Batch • ${s.playingPosition ?: s.primarySport}",
                            style = typo.caption.copy(color = colors.inkSecondary),
                        )
                    }

                    StopMotionStampBadge(
                        label = when {
                            detail.isDefaulter -> "DEFAULTER"
                            detail.dueAmount > 0 -> "DUE ${DomainEngine.formatINR(detail.dueAmount)}"
                            else -> "SETTLED"
                        },
                        color = when {
                            detail.isDefaulter -> colors.dangerRed
                            detail.dueAmount > 0 -> colors.accentAmber
                            else -> colors.accentTeal
                        },
                        backgroundColor = when {
                            detail.isDefaulter -> colors.dangerSoft
                            detail.dueAmount > 0 -> colors.accentAmberSoft
                            else -> colors.accentTealSoft
                        },
                        stampKey = detail.dueAmount,
                    )
                }

                Spacer(modifier = Modifier.height(12.dp))

                // Quick Contact & Fee CTA Row
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    FluidPrimaryButton(
                        text = "Collect Fee",
                        icon = CourtIcon.FEES_RUPEE,
                        onClick = onCollectFee,
                        modifier = Modifier.weight(1f),
                    )
                    FluidSecondaryButton(
                        text = "Call Parent",
                        icon = CourtIcon.PHONE,
                        onClick = {
                            context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:${s.mobile}")))
                        },
                    )
                    if (detail.pendingMonths.isNotEmpty()) {
                        FluidSecondaryButton(
                            text = "WhatsApp Due",
                            icon = CourtIcon.WHATSAPP,
                            tintColor = colors.accentTeal,
                            onClick = {
                                val msg = WhatsAppDispatcher.buildFeeReminderMessage(
                                    student = s,
                                    pendingMonths = detail.pendingMonths,
                                    dueAmount = detail.dueAmount,
                                    settings = settings,
                                )
                                WhatsAppDispatcher.openWhatsAppChat(context, s.mobile, msg)
                            },
                        )
                    }
                }
            }
        }

        // 2. WHO 2007 BMI-for-Age & Volleyball Sports Science Lab Card
        StaggeredFluidEntrance(index = 1) {
            FluidGlassCard(accentStripeColor = colors.accentTeal) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        BasicText("WHO 2007 BMI & Sports Science Lab", style = typo.h2.copy(color = colors.inkPrimary))
                        BasicText(bmiPres.hint, style = typo.caption.copy(color = colors.inkSecondary))
                    }
                    FluidToneBadge(
                        text = "BMI ${bmiPres.value} • ${bmiPres.label}",
                        tone = bmiPres.tone,
                    )
                }

                Spacer(modifier = Modifier.height(12.dp))

                // 2x3 Sports Science Metric Grid
                val netM = NET_HEIGHT_M[s.ageCategory] ?: 2.43
                val metrics = listOf(
                    "Height / Weight" to "${s.heightCm?.let { "$it cm" } ?: "—"} / ${s.weightKg?.let { "$it kg" } ?: "—"}",
                    "Healthy Weight Band" to (weightBand?.let { "${it.lo}–${it.hi} kg" } ?: "—"),
                    "Standing / Spike Reach" to "${s.standingReachCm?.let { "$it cm" } ?: "—"} / ${s.spikeReachCm?.let { "$it cm" } ?: "—"}",
                    "Vertical Jump Gain" to "${jumpGain?.let { "+${it.toInt()} cm (${jumpRating.label})" } ?: "—"}",
                    "Spike Clearance (${netM}m Net)" to (netClearance?.let { if (it >= 0) "+$it cm over net" else "$it cm below net" } ?: "—"),
                    "Reach Ratio / Tenure" to "${reachRatio?.let { "%.2f×".format(Locale.US, it) } ?: "—"} • ${trainMonths ?: 0} mos",
                )

                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    for (rowItems in metrics.chunked(2)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            for (item in rowItems) {
                                Column(
                                    modifier = Modifier
                                        .weight(1f)
                                        .clip(RoundedCornerShape(12.dp))
                                        .background(colors.bgSubtle.copy(alpha = 0.6f))
                                        .padding(10.dp)
                                ) {
                                    BasicText(item.first.uppercase(), style = typo.microCaps.copy(color = colors.inkMuted))
                                    Spacer(modifier = Modifier.height(3.dp))
                                    BasicText(item.second, style = typo.bodyBold.copy(color = colors.inkPrimary))
                                }
                            }
                        }
                    }
                }

                if (bmiAssessment is BmiAssessment.Ok) {
                    Spacer(modifier = Modifier.height(8.dp))
                    BasicText(
                        text = "${bmiAssessment.referenceStandard} — ${bmiAssessment.disclaimer}",
                        style = typo.caption.copy(color = colors.inkMuted),
                    )
                }
            }
        }

        // 3. Longitudinal Anthropometric History (Measurement Table)
        StaggeredFluidEntrance(index = 2) {
            FluidGlassCard(accentStripeColor = colors.accentCyan) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        BasicText("Biometric Growth Log (${detail.measurements.size})", style = typo.h2.copy(color = colors.inkPrimary))
                        BasicText("Date-stamped height, weight & reach progression", style = typo.caption.copy(color = colors.inkSecondary))
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    FluidSecondaryButton(
                        text = "Log Check",
                        icon = CourtIcon.PLUS,
                        tintColor = colors.accentCyan,
                        onClick = { showMeasurementModal = true },
                    )
                }

                Spacer(modifier = Modifier.height(10.dp))

                if (detail.measurements.isEmpty()) {
                    BasicText("No biometric rows logged yet.", style = typo.body.copy(color = colors.inkMuted))
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        for (m in detail.measurements) {
                            val mBmi = BmiEngine.presentBmi(
                                BmiEngine.assessBmi(m.weightKg, m.heightCm, s.dateOfBirth, s.gender, m.date)
                            )
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(colors.bgSubtle.copy(alpha = 0.6f))
                                    .padding(horizontal = 12.dp, vertical = 9.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    BasicText(
                                        text = "${DomainEngine.formatDate(m.date)} • ${m.heightCm ?: "—"} cm • ${m.weightKg ?: "—"} kg",
                                        style = typo.bodyBold.copy(color = colors.inkPrimary),
                                    )
                                    BasicText(
                                        text = "BMI ${mBmi.value} (${mBmi.label}) • Spike: ${m.spikeReachCm ?: "—"} cm ${m.notes?.let { "• $it" } ?: ""}",
                                        style = typo.caption.copy(color = colors.inkSecondary),
                                    )
                                }
                                Spacer(modifier = Modifier.width(8.dp))
                                FluidIconOrbButton(
                                    icon = CourtIcon.TRASH,
                                    tint = colors.dangerRed,
                                    size = 28.dp,
                                    onClick = { pendingDeleteMeasurement = m },
                                )
                            }
                        }
                    }
                }
            }
        }

        // 4. Bio, Academic & Document Vault
        StaggeredFluidEntrance(index = 3) {
            FluidGlassCard(accentStripeColor = colors.navyCourt) {
                BasicText("Personal, Academic & Document Vault", style = typo.h2.copy(color = colors.inkPrimary))
                Spacer(modifier = Modifier.height(10.dp))
                val bioPairs = listOf(
                    "Date of Birth / Age" to "${DomainEngine.formatDate(s.dateOfBirth)} ($ageDetailed)",
                    "Gender / Blood Group" to "${s.gender} • ${s.bloodGroup}",
                    "Parent / Guardian" to "${s.parentName} (${s.mobile})",
                    "School & Class" to "${s.schoolName} • Class ${s.classGrade} ${s.division}".trim(),
                    "Residential Address" to s.address,
                    "Registration Date" to "${DomainEngine.formatDate(s.registrationDate)} • Fee: ${DomainEngine.formatINR(s.monthlyFee)}/mo",
                )
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    for ((k, v) in bioPairs) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.Top,
                        ) {
                            BasicText(
                                text = k,
                                style = typo.caption.copy(color = colors.inkMuted),
                                modifier = Modifier.weight(0.38f),
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            BasicText(
                                text = v.ifBlank { "—" },
                                style = typo.bodyBold.copy(
                                    color = colors.inkPrimary,
                                    textAlign = TextAlign.End,
                                ),
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.weight(0.62f),
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    FluidSecondaryButton(
                        text = if (s.photoPath != null) "Photo ✓" else "+ Photo",
                        icon = CourtIcon.CAMERA,
                        modifier = Modifier.weight(1f),
                        onClick = {
                            pendingDocTarget = "photo"
                            docPicker.launch("image/*")
                        },
                    )
                    FluidSecondaryButton(
                        text = if (s.birthCertPath != null) "Birth Cert ✓" else "+ Birth Cert",
                        icon = CourtIcon.UPLOAD,
                        modifier = Modifier.weight(1f),
                        onClick = {
                            pendingDocTarget = "birthCert"
                            docPicker.launch("*/*")
                        },
                    )
                    FluidSecondaryButton(
                        text = if (s.idCardPath != null) "ID Card ✓" else "+ ID Card",
                        icon = CourtIcon.SHIELD,
                        modifier = Modifier.weight(1f),
                        onClick = {
                            pendingDocTarget = "idCard"
                            docPicker.launch("*/*")
                        },
                    )
                }
            }
        }

        // 5. Tournament Achievements Log
        StaggeredFluidEntrance(index = 4) {
            FluidGlassCard(accentStripeColor = colors.accentAmber) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        BasicText("Tournament Achievements (${detail.achievements.size})", style = typo.h2.copy(color = colors.inkPrimary))
                        BasicText("Championship participations & podium medals", style = typo.caption.copy(color = colors.inkSecondary))
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    FluidSecondaryButton(
                        text = "Add Medal",
                        icon = CourtIcon.TROPHY,
                        tintColor = colors.accentAmber,
                        onClick = { showAchievementModal = true },
                    )
                }

                Spacer(modifier = Modifier.height(10.dp))

                if (detail.achievements.isEmpty()) {
                    BasicText("No tournament records added yet.", style = typo.body.copy(color = colors.inkMuted))
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        detail.achievements.forEachIndexed { idx, ach ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(colors.bgSubtle.copy(alpha = 0.6f))
                                    .padding(horizontal = 12.dp, vertical = 9.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    BasicText(ach.tournamentName, style = typo.bodyBold.copy(color = colors.inkPrimary))
                                    BasicText(
                                        "${DomainEngine.formatDate(ach.eventDate)} • ${ach.level} • ${ach.medal}${ach.notes?.let { " • $it" } ?: ""}",
                                        style = typo.caption.copy(color = colors.inkSecondary),
                                    )
                                }
                                Spacer(modifier = Modifier.width(8.dp))
                                FluidToneBadge(
                                    text = ach.medal,
                                    tone = if (ach.medal == "Gold") "amber" else "emerald",
                                    modifier = Modifier.stopMotionStickerWobble(seed = idx),
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                FluidIconOrbButton(
                                    icon = CourtIcon.TRASH,
                                    tint = colors.dangerRed,
                                    size = 28.dp,
                                    onClick = { pendingDeleteAchievement = ach },
                                )
                            }
                        }
                    }
                }
            }
        }

        // 6. Fee Receipts Ledger
        StaggeredFluidEntrance(index = 5) {
            FluidGlassCard(accentStripeColor = colors.primaryRose) {
                BasicText("Fee Ledger & Receipts (${detail.payments.size})", style = typo.h2.copy(color = colors.inkPrimary))
                Spacer(modifier = Modifier.height(4.dp))
                BasicText(
                    text = if (detail.pendingMonths.isEmpty()) {
                        "All billing months settled up to current cycle."
                    } else {
                        "Pending: ${detail.pendingMonths.joinToString(", ") { DomainEngine.monthLabel(it) }}"
                    },
                    style = typo.caption.copy(color = if (detail.pendingMonths.isEmpty()) colors.accentTeal else colors.primaryRose),
                )
                Spacer(modifier = Modifier.height(10.dp))

                if (detail.payments.isEmpty()) {
                    BasicText("No receipts recorded yet.", style = typo.body.copy(color = colors.inkMuted))
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        for (p in detail.payments) {
                            val mText = DomainEngine.parsePaidMonths(p.months).joinToString(", ") { DomainEngine.monthLabel(it) }
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(colors.bgSubtle.copy(alpha = 0.6f))
                                    .padding(horizontal = 12.dp, vertical = 9.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    BasicText("${p.receiptNo} • ${DomainEngine.formatINR(p.amount)}", style = typo.bodyBold.copy(color = colors.inkPrimary))
                                    BasicText("${DomainEngine.formatDate(p.paymentDate)} • $mText (${p.paymentMode})", style = typo.caption.copy(color = colors.inkSecondary))
                                }
                                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    FluidIconOrbButton(
                                        icon = CourtIcon.PRINTER,
                                        tint = colors.primaryRose,
                                        size = 30.dp,
                                        onClick = { onPrintReceipt(p) },
                                    )
                                    FluidIconOrbButton(
                                        icon = CourtIcon.WHATSAPP,
                                        tint = colors.accentTeal,
                                        size = 30.dp,
                                        onClick = {
                                            val msg = WhatsAppDispatcher.buildReceiptWhatsAppMessage(p, s, settings)
                                            WhatsAppDispatcher.openWhatsAppChat(context, s.mobile, msg)
                                        },
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(24.dp))
    }

    // Measurement Modal
    if (showMeasurementModal) {
        var date by remember { mutableStateOf(DomainEngine.todayKey()) }
        var height by remember { mutableStateOf(s.heightCm?.toString() ?: "") }
        var weight by remember { mutableStateOf(s.weightKg?.toString() ?: "") }
        var standing by remember { mutableStateOf(s.standingReachCm?.toString() ?: "") }
        var spike by remember { mutableStateOf(s.spikeReachCm?.toString() ?: "") }
        var block by remember { mutableStateOf(s.jumpReachCm?.toString() ?: "") }
        var notes by remember { mutableStateOf("") }

        FluidModalSheet(
            title = "Log Biometric Check",
            subtitle = "Updates WHO 2007 BMI-for-age & vertical jump progression",
            onDismiss = { showMeasurementModal = false },
        ) {
            FluidTextField(value = date, onValueChange = { date = it }, label = "Date (YYYY-MM-DD)")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FluidTextField(
                    value = height,
                    onValueChange = { height = DomainEngine.decimalOnly(it) },
                    label = "Height (cm)",
                    keyboardType = KeyboardType.Decimal,
                    modifier = Modifier.weight(1f),
                )
                FluidTextField(
                    value = weight,
                    onValueChange = { weight = DomainEngine.decimalOnly(it) },
                    label = "Weight (kg)",
                    keyboardType = KeyboardType.Decimal,
                    modifier = Modifier.weight(1f),
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FluidTextField(
                    value = standing,
                    onValueChange = { standing = DomainEngine.decimalOnly(it) },
                    label = "Standing Reach (cm)",
                    keyboardType = KeyboardType.Decimal,
                    modifier = Modifier.weight(1f),
                )
                FluidTextField(
                    value = spike,
                    onValueChange = { spike = DomainEngine.decimalOnly(it) },
                    label = "Spike Reach (cm)",
                    keyboardType = KeyboardType.Decimal,
                    modifier = Modifier.weight(1f),
                )
            }
            FluidTextField(
                value = block,
                onValueChange = { block = DomainEngine.decimalOnly(it) },
                label = "Block Jump Reach (cm)",
                keyboardType = KeyboardType.Decimal,
            )
            FluidTextField(value = notes, onValueChange = { notes = it }, label = "Coach Notes")
            FluidPrimaryButton(
                text = "Save Biometric Entry",
                icon = CourtIcon.CHECK,
                modifier = Modifier.fillMaxWidth(),
                onClick = {
                    onRecordMeasurement(
                        MeasurementInput(
                            date = date,
                            heightCm = height.toDoubleOrNull(),
                            weightKg = weight.toDoubleOrNull(),
                            standingReachCm = standing.toDoubleOrNull(),
                            spikeReachCm = spike.toDoubleOrNull(),
                            jumpReachCm = block.toDoubleOrNull(),
                            notes = notes.ifBlank { null },
                        )
                    )
                    showMeasurementModal = false
                },
            )
        }
    }

    // Achievement Modal
    if (showAchievementModal) {
        var tournament by remember { mutableStateOf("") }
        var eventDate by remember { mutableStateOf(DomainEngine.todayKey()) }
        var level by remember { mutableStateOf("District") }
        var medal by remember { mutableStateOf("Gold") }
        var notes by remember { mutableStateOf("") }

        FluidModalSheet(
            title = "Add Tournament Achievement",
            subtitle = "Record championship medal or participation for ${s.fullName}",
            onDismiss = { showAchievementModal = false },
        ) {
            FluidTextField(
                value = tournament,
                onValueChange = { tournament = it },
                label = "Tournament / Championship Name *",
                placeholder = "e.g., Kerala State Youth Volleyball Championship",
            )
            FluidTextField(
                value = eventDate,
                onValueChange = { eventDate = it },
                label = "Event Date (YYYY-MM-DD)",
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                FluidDropdownSelect(
                    label = "COMPETITION LEVEL",
                    options = ACHIEVEMENT_LEVELS.map { it to it },
                    selectedKey = level,
                    onSelect = { level = it },
                    modifier = Modifier.weight(1f),
                )
                FluidDropdownSelect(
                    label = "MEDAL / HONOUR",
                    options = MEDAL_TYPES.map { it to it },
                    selectedKey = medal,
                    onSelect = { medal = it },
                    modifier = Modifier.weight(1f),
                )
            }
            FluidTextField(value = notes, onValueChange = { notes = it }, label = "Notes / Distinction")
            FluidPrimaryButton(
                text = "Save Achievement",
                icon = CourtIcon.TROPHY,
                modifier = Modifier.fillMaxWidth(),
                onClick = {
                    onAddAchievement(
                        AchievementInput(
                            tournamentName = tournament,
                            eventDate = eventDate,
                            level = level,
                            medal = medal,
                            notes = notes.ifBlank { null },
                        )
                    )
                    showAchievementModal = false
                },
            )
        }
    }

    // Confirmation Dialog 1: Delete Athlete Profile
    if (confirmDeleteProfile) {
        FluidConfirmDialog(
            title = "Remove ${s.fullName}?",
            message = "This permanently deletes ${s.fullName} (${s.admissionNo}) along with achievements, biometric growth logs, and attendance records. This action cannot be undone.",
            confirmText = "Delete Athlete",
            onConfirm = {
                confirmDeleteProfile = false
                onDelete()
            },
            onDismiss = { confirmDeleteProfile = false },
        )
    }

    // Confirmation Dialog 2: Delete Biometric Measurement Entry
    val targetMeasurement = pendingDeleteMeasurement
    if (targetMeasurement != null) {
        FluidConfirmDialog(
            title = "Delete Biometric Entry?",
            message = "Remove the biometric check recorded on ${DomainEngine.formatDate(targetMeasurement.date)} (${targetMeasurement.heightCm ?: "—"} cm / ${targetMeasurement.weightKg ?: "—"} kg) from ${s.fullName}'s growth log?",
            confirmText = "Delete Entry",
            onConfirm = {
                pendingDeleteMeasurement = null
                onDeleteMeasurement(targetMeasurement.id)
            },
            onDismiss = { pendingDeleteMeasurement = null },
        )
    }

    // Confirmation Dialog 3: Delete Tournament Achievement
    val targetAchievement = pendingDeleteAchievement
    if (targetAchievement != null) {
        FluidConfirmDialog(
            title = "Delete Achievement?",
            message = "Remove '${targetAchievement.tournamentName}' (${targetAchievement.medal} · ${targetAchievement.level}) from ${s.fullName}'s honours log?",
            confirmText = "Delete Honour",
            onConfirm = {
                pendingDeleteAchievement = null
                onDeleteAchievement(targetAchievement.id)
            },
            onDismiss = { pendingDeleteAchievement = null },
        )
    }
}
