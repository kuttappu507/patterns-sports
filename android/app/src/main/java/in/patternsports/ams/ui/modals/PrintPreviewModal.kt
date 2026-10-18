package `in`.patternsports.ams.ui.modals

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import `in`.patternsports.ams.data.DocumentExporter
import `in`.patternsports.ams.data.WhatsAppDispatcher
import `in`.patternsports.ams.domain.ACADEMY_MAPS_URL
import `in`.patternsports.ams.domain.AcademySettings
import `in`.patternsports.ams.domain.BmiEngine
import `in`.patternsports.ams.domain.DomainEngine
import `in`.patternsports.ams.domain.PrintPayload
import `in`.patternsports.ams.ui.components.FluidDropdownSelect
import `in`.patternsports.ams.ui.components.FluidModalSheet
import `in`.patternsports.ams.ui.components.FluidPrimaryButton
import `in`.patternsports.ams.ui.components.FluidSecondaryButton
import `in`.patternsports.ams.ui.motion.StopMotionReceiptTearEdge
import `in`.patternsports.ams.ui.theme.CourtIcon
import `in`.patternsports.ams.ui.theme.SorbetTheme

// ============================================================
// PS-AMS :: Professional Print, PDF & POS Receipt Preview Modal
// 1:1 visual parity with PC app src/components/psams/prints/print-root.tsx
// ============================================================

@Composable
fun PrintPreviewModal(
    payload: PrintPayload,
    settings: AcademySettings,
    onDismiss: () -> Unit,
) {
    val colors = SorbetTheme.colors
    val typo = SorbetTheme.typography
    val context = LocalContext.current

    // Allow switching between Formal A5 Receipt, A6 Receipt, and 80mm Thermal POS Slip
    var receiptFormat by remember(payload) {
        mutableStateOf(
            when (payload) {
                is PrintPayload.PosReceipt -> "pos"
                else -> if (DocumentExporter.receiptPaperFormat == "A6") "a6" else "a5"
            }
        )
    }

    val effectivePayload: PrintPayload = when (payload) {
        is PrintPayload.FormalReceipt -> {
            if (receiptFormat == "pos") {
                PrintPayload.PosReceipt(payload.payment, payload.student)
            } else {
                DocumentExporter.receiptPaperFormat = if (receiptFormat == "a6") "A6" else "A5"
                payload
            }
        }
        is PrintPayload.PosReceipt -> {
            if (receiptFormat == "a5" || receiptFormat == "a6") {
                DocumentExporter.receiptPaperFormat = if (receiptFormat == "a6") "A6" else "A5"
                PrintPayload.FormalReceipt(payload.payment, payload.student)
            } else {
                payload
            }
        }
        else -> payload
    }

    val docSubtitle = when (effectivePayload) {
        is PrintPayload.FormalReceipt -> {
            if (receiptFormat == "a6") "Receipt · A6 (105 × 148 mm) · Zero margins"
            else "Receipt · A5 (148 × 210 mm) · Zero margins"
        }
        is PrintPayload.PosReceipt -> "Thermal POS Roll · 80 mm"
        is PrintPayload.ProfileCard -> "A4 Portrait · 210 × 297 mm"
        is PrintPayload.DefaultersReport -> "A4 Roster · Fee Defaulters"
        is PrintPayload.FilteredReport -> "A4 Roster · Player Report"
        is PrintPayload.BlankAttendanceSheet -> "A4 Landscape · Session Register"
        is PrintPayload.PaymentHistoryReport -> "A4 Roster · Fee Ledger"
    }

    FluidModalSheet(
        title = "Print & PDF Preview",
        subtitle = docSubtitle,
        onDismiss = onDismiss,
    ) {
        if (payload is PrintPayload.FormalReceipt || payload is PrintPayload.PosReceipt) {
            FluidDropdownSelect(
                label = "RECEIPT PAPER FORMAT",
                options = listOf(
                    "a5" to "A5 Formal Receipt (148 × 210 mm)",
                    "a6" to "A6 Compact Receipt (105 × 148 mm)",
                    "pos" to "80mm Thermal POS Slip",
                ),
                selectedKey = receiptFormat,
                onSelect = { receiptFormat = it },
                modifier = Modifier.fillMaxWidth(),
            )
        }

        // Authentic White Paper Sheet on Dark Desk Surface (matching PC app print-root.tsx)
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(Color(0xFF0F172A))
                .padding(12.dp),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .shadow(8.dp, RoundedCornerShape(4.dp))
                    .clip(RoundedCornerShape(4.dp))
                    .background(Color.White)
                    .border(1.dp, Color(0xFFCBD5E1), RoundedCornerShape(4.dp))
            ) {
                when (val p = effectivePayload) {
                    is PrintPayload.FormalReceipt -> {
                        FormalReceiptPaperPreview(
                            payment = p.payment,
                            student = p.student,
                            settings = settings,
                        )
                    }
                    is PrintPayload.PosReceipt -> {
                        PosThermalPaperPreview(
                            payment = p.payment,
                            student = p.student,
                            settings = settings,
                        )
                        StopMotionReceiptTearEdge(color = Color(0xFFCBD5E1))
                    }
                    is PrintPayload.ProfileCard -> {
                        ProfileCardPaperPreview(
                            detail = p.detail,
                            settings = settings,
                        )
                    }
                    is PrintPayload.DefaultersReport -> {
                        val total = p.rows.sumOf { it.dueAmount }
                        Column(modifier = Modifier.padding(16.dp)) {
                            PcPaperLetterhead(settings = settings, docTitle = "Fee Defaulters Register")
                            Spacer(modifier = Modifier.height(10.dp))
                            BorderedKeyValueTable(
                                rows = listOf(
                                    "Generated Date" to DomainEngine.formatDate(DomainEngine.todayKey()),
                                    "Defaulter Accounts" to "${p.rows.size} player(s)",
                                    "Total Outstanding" to DomainEngine.formatINR(total),
                                ),
                                boldFirstRow = false,
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                            PaperSignatoryBlock(
                                name = settings.receiptSignatory.ifBlank { "General Secretary" },
                                role = "General Secretary",
                            )
                        }
                    }
                    is PrintPayload.FilteredReport -> {
                        Column(modifier = Modifier.padding(16.dp)) {
                            PcPaperLetterhead(settings = settings, docTitle = p.title.ifBlank { "Player Roster Report" })
                            Spacer(modifier = Modifier.height(10.dp))
                            BorderedKeyValueTable(
                                rows = listOf(
                                    "Filter Criteria" to p.subtitle.ifBlank { "All Players" },
                                    "Matching Players" to "${p.students.size} record(s)",
                                    "Generated On" to DomainEngine.formatDate(DomainEngine.todayKey()),
                                ),
                                boldFirstRow = false,
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                            PaperSignatoryBlock(
                                name = settings.receiptSignatory.ifBlank { "General Secretary" },
                                role = "General Secretary",
                            )
                        }
                    }
                    is PrintPayload.BlankAttendanceSheet -> {
                        Column(modifier = Modifier.padding(16.dp)) {
                            PcPaperLetterhead(settings = settings, docTitle = "Daily Attendance Sheet")
                            Spacer(modifier = Modifier.height(10.dp))
                            BorderedKeyValueTable(
                                rows = listOf(
                                    "Month / Period" to p.monthLabel,
                                    "Batch & Category" to "${p.batch} · ${p.category}",
                                    "Active Roster" to "${p.students.size} player(s) · 31-day grid",
                                ),
                                boldFirstRow = false,
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                            PaperSignatoryBlock(
                                name = "Coach / Session In-charge",
                                role = "Coach / Session In-charge",
                            )
                        }
                    }
                    is PrintPayload.PaymentHistoryReport -> {
                        val total = p.payments.sumOf { it.amount }
                        Column(modifier = Modifier.padding(16.dp)) {
                            PcPaperLetterhead(settings = settings, docTitle = p.title.ifBlank { "Fee Collection Register" })
                            Spacer(modifier = Modifier.height(10.dp))
                            BorderedKeyValueTable(
                                rows = listOf(
                                    "Receipts Count" to "${p.payments.size} receipt(s)",
                                    "Total Collected" to DomainEngine.formatINR(total),
                                    "In Words" to DomainEngine.inWords(total),
                                ),
                                boldFirstRow = false,
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                            PaperSignatoryBlock(
                                name = settings.receiptSignatory.ifBlank { "General Secretary" },
                                role = "General Secretary",
                            )
                        }
                    }
                }
            }
        }

        // Action Buttons: System Print & Save/Share PDF
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            FluidPrimaryButton(
                text = "Print",
                icon = CourtIcon.PRINTER,
                modifier = Modifier.weight(1f),
                onClick = {
                    DocumentExporter.printPayload(context, effectivePayload, settings)
                },
            )
            FluidSecondaryButton(
                text = "Save / Share PDF",
                icon = CourtIcon.DOWNLOAD,
                tintColor = colors.accentCyan,
                modifier = Modifier.weight(1f),
                onClick = {
                    val pdf = DocumentExporter.exportPrintPayloadToPdf(context, effectivePayload, settings)
                    DocumentExporter.shareExportedFile(context, pdf, "application/pdf", "Save or Share PS-AMS PDF")
                },
            )
        }

        // Direct WhatsApp Dispatch if this is a Receipt
        val receiptPair = when (effectivePayload) {
            is PrintPayload.FormalReceipt -> effectivePayload.payment to effectivePayload.student
            is PrintPayload.PosReceipt -> effectivePayload.payment to effectivePayload.student
            else -> null
        }
        if (receiptPair != null) {
            val (payment, student) = receiptPair
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                FluidSecondaryButton(
                    text = "WhatsApp Text",
                    icon = CourtIcon.WHATSAPP,
                    tintColor = colors.accentTeal,
                    modifier = Modifier.weight(1f),
                    onClick = {
                        val msg = WhatsAppDispatcher.buildReceiptWhatsAppMessage(payment, student, settings)
                        WhatsAppDispatcher.openWhatsAppChat(context, student.mobile, msg)
                    },
                )
                FluidSecondaryButton(
                    text = "WhatsApp PDF",
                    icon = CourtIcon.WHATSAPP,
                    tintColor = colors.primaryRose,
                    modifier = Modifier.weight(1f),
                    onClick = {
                        val pdf = DocumentExporter.exportPrintPayloadToPdf(context, effectivePayload, settings)
                        val msg = WhatsAppDispatcher.buildReceiptWhatsAppMessage(payment, student, settings)
                        WhatsAppDispatcher.sharePdfViaWhatsApp(context, pdf, student.mobile, msg)
                    },
                )
            }
        }
    }
}

@Composable
private fun PcPaperLetterhead(
    settings: AcademySettings,
    docTitle: String,
) {
    val typo = SorbetTheme.typography
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        BasicText(
            text = settings.academyName.ifBlank { "Pattern Sports Academy" },
            style = typo.h2.copy(
                color = Color(0xFF073B4C),
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
            ),
        )
        if (settings.tagline.isNotBlank()) {
            BasicText(
                text = settings.tagline,
                style = typo.caption.copy(
                    color = Color(0xFF525252),
                    fontStyle = FontStyle.Italic,
                    fontSize = 10.5.sp,
                    textAlign = TextAlign.Center,
                ),
            )
        }
        val contact = buildList {
            if (settings.address.isNotBlank()) add(settings.address)
            if (settings.phone.isNotBlank()) add("Ph: ${settings.phone}")
            if (settings.email.isNotBlank()) add(settings.email)
        }.joinToString("  ·  ")
        if (contact.isNotBlank()) {
            Spacer(modifier = Modifier.height(2.dp))
            BasicText(
                text = contact,
                style = typo.caption.copy(
                    color = Color(0xFF525252),
                    fontSize = 10.sp,
                    textAlign = TextAlign.Center,
                ),
            )
        }
        Spacer(modifier = Modifier.height(6.dp))
        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(4.dp))
                .background(Color(0xFFEF476F))
                .padding(horizontal = 12.dp, vertical = 3.dp),
            contentAlignment = Alignment.Center,
        ) {
            BasicText(
                text = docTitle.uppercase(),
                style = typo.microCaps.copy(
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                ),
            )
        }
        Spacer(modifier = Modifier.height(7.dp))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(1.5.dp)
                .background(Color(0xFFEF476F))
        )
    }
}

@Composable
private fun FormalReceiptPaperPreview(
    payment: `in`.patternsports.ams.domain.FeePayment,
    student: `in`.patternsports.ams.domain.Student,
    settings: AcademySettings,
) {
    val typo = SorbetTheme.typography
    val months = DomainEngine.parsePaidMonths(payment.months)
    val towards = if (months.isEmpty()) {
        "Academy training fee"
    } else {
        "Academy fee${if (months.size > 1) "s" else ""} for ${months.joinToString(", ") { DomainEngine.monthLabel(it) }}"
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
    ) {
        PcPaperLetterhead(settings = settings, docTitle = "Fee Payment Receipt")

        Spacer(modifier = Modifier.height(10.dp))

        // Receipt No & Date bar
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row {
                BasicText(
                    text = "Receipt No: ",
                    style = typo.caption.copy(color = Color(0xFF64748B)),
                )
                BasicText(
                    text = payment.receiptNo,
                    style = typo.monoStat.copy(color = Color(0xFF0F172A), fontSize = 11.5.sp),
                )
            }
            Row {
                BasicText(
                    text = "Date: ",
                    style = typo.caption.copy(color = Color(0xFF64748B)),
                )
                BasicText(
                    text = DomainEngine.formatDate(payment.paymentDate),
                    style = typo.caption.copy(color = Color(0xFF0F172A), fontWeight = FontWeight.Bold),
                )
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        // Bordered Table matching PC app ReceiptA5
        val rows = buildList {
            add("Received From" to "${student.fullName}  (${student.admissionNo})")
            add("Towards" to towards)
            add("Payment Mode" to payment.paymentMode)
            if (!payment.remarks.isNullOrBlank()) {
                add("Remarks" to payment.remarks)
            }
        }
        BorderedKeyValueTable(rows = rows, boldFirstRow = true)

        Spacer(modifier = Modifier.height(10.dp))

        // Total Amount Paid Banner with Rupees in Words
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(5.dp))
                .background(Color(0xFFF5F7FA))
                .border(1.5.dp, Color(0xFF1E293B), RoundedCornerShape(5.dp))
                .padding(horizontal = 12.dp, vertical = 9.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                BasicText(
                    text = "TOTAL AMOUNT PAID",
                    style = typo.microCaps.copy(color = Color(0xFF475569)),
                )
                Spacer(modifier = Modifier.height(2.dp))
                BasicText(
                    text = DomainEngine.inWords(payment.amount),
                    style = typo.caption.copy(
                        color = Color(0xFF334155),
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Medium,
                    ),
                )
            }
            Spacer(modifier = Modifier.width(8.dp))
            BasicText(
                text = DomainEngine.formatINR(payment.amount),
                style = typo.h1.copy(
                    color = Color(0xFF073B4C),
                    fontWeight = FontWeight.ExtraBold,
                ),
            )
        }

        Spacer(modifier = Modifier.height(8.dp))

        BasicText(
            text = "Fees once paid are non-refundable. Please retain this receipt for future reference.",
            style = typo.caption.copy(
                color = Color(0xFF64748B),
                fontSize = 9.5.sp,
                fontStyle = FontStyle.Italic,
            ),
        )

        Spacer(modifier = Modifier.height(14.dp))

        PaperSignatoryBlock(
            name = settings.receiptSignatory.ifBlank { "Authorized Signatory" },
            role = "Authorized Signatory",
        )

        Spacer(modifier = Modifier.height(8.dp))
        BasicText(
            text = "Generated by PS-AMS  ·  Google Maps: ${ACADEMY_MAPS_URL.removePrefix("https://")}",
            style = typo.caption.copy(
                color = Color(0xFF94A3B8),
                fontSize = 8.5.sp,
                textAlign = TextAlign.Center,
            ),
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun PosThermalPaperPreview(
    payment: `in`.patternsports.ams.domain.FeePayment,
    student: `in`.patternsports.ams.domain.Student,
    settings: AcademySettings,
) {
    val typo = SorbetTheme.typography
    val months = DomainEngine.parsePaidMonths(payment.months)
    val dash = "--------------------------------"
    val slipText = buildString {
        appendLine(settings.academyName.ifBlank { "Pattern Sports Academy" })
        if (settings.address.isNotBlank()) appendLine(settings.address)
        if (settings.phone.isNotBlank()) appendLine("Ph: ${settings.phone}")
        appendLine(dash)
        appendLine("FEE RECEIPT")
        appendLine(dash)
        appendLine("Receipt : ${payment.receiptNo}")
        appendLine("Date    : ${DomainEngine.formatDate(payment.paymentDate)}")
        appendLine("Student : ${student.fullName}")
        appendLine("Adm No  : ${student.admissionNo}")
        appendLine(dash)
        appendLine("PERIODS PAID:")
        if (months.isEmpty()) {
            appendLine("  - Academy Fee")
        } else {
            for (m in months) {
                appendLine("  - ${DomainEngine.monthLabel(m)}")
            }
        }
        appendLine(dash)
        appendLine("Mode    : ${payment.paymentMode}")
        if (!payment.remarks.isNullOrBlank()) {
            appendLine("Note    : ${payment.remarks}")
        }
        appendLine("TOTAL   : ${DomainEngine.formatINR(payment.amount)}")
        appendLine(DomainEngine.inWords(payment.amount))
        appendLine(dash)
        appendLine("Thank you! Keep training hard.")
        appendLine(settings.receiptSignatory.ifBlank { "Authorized Signatory" })
        append("Powered by PS-AMS")
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(14.dp),
    ) {
        BasicText(
            text = slipText,
            style = typo.monoStat.copy(
                color = Color(0xFF0F172A),
                fontSize = 11.5.sp,
                lineHeight = 16.5.sp,
            ),
        )
    }
}

@Composable
private fun ProfileCardPaperPreview(
    detail: `in`.patternsports.ams.domain.StudentDetail,
    settings: AcademySettings,
) {
    val s = detail.student
    val bmi = BmiEngine.bmiReportFields(s)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
    ) {
        PcPaperLetterhead(settings = settings, docTitle = "Player Profile Card")
        Spacer(modifier = Modifier.height(10.dp))
        BorderedKeyValueTable(
            rows = listOf(
                "Full Name" to "${s.fullName} (${s.admissionNo})",
                "Date of Birth" to "${DomainEngine.formatDate(s.dateOfBirth)} (${DomainEngine.ageDetailed(s.dateOfBirth)})",
                "Age Category" to "${s.ageCategory} — ${DomainEngine.categoryBracket(s.ageCategory)}",
                "Parent / Guardian" to "${s.parentName} · ${s.mobile}",
                "Height / Weight" to "${s.heightCm?.toInt() ?: "—"} cm / ${s.weightKg?.toInt() ?: "—"} kg",
                "WHO 2007 BMI" to bmi.combined,
                "Reach (St / Sp / Jp)" to "${s.standingReachCm?.toInt() ?: "—"} / ${s.spikeReachCm?.toInt() ?: "—"} / ${s.jumpReachCm?.toInt() ?: "—"} cm",
                "Achievements" to "${detail.achievements.size} career milestone(s)",
            ),
            boldFirstRow = true,
        )
        Spacer(modifier = Modifier.height(12.dp))
        PaperSignatoryBlock(
            name = settings.receiptSignatory.ifBlank { "General Secretary" },
            role = "General Secretary",
        )
    }
}

@Composable
private fun BorderedKeyValueTable(
    rows: List<Pair<String, String>>,
    boldFirstRow: Boolean,
) {
    val typo = SorbetTheme.typography
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, Color(0xFFCBD5E1)),
    ) {
        for ((idx, pair) in rows.withIndex()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .border(0.5.dp, Color(0xFFCBD5E1)),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier
                        .width(108.dp)
                        .background(Color(0xFFF8FAFC))
                        .padding(horizontal = 8.dp, vertical = 6.dp),
                ) {
                    BasicText(
                        text = pair.first.uppercase(),
                        style = typo.microCaps.copy(
                            color = Color(0xFF64748B),
                            fontSize = 9.sp,
                        ),
                    )
                }
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .padding(horizontal = 8.dp, vertical = 6.dp),
                ) {
                    BasicText(
                        text = pair.second,
                        style = if (idx == 0 && boldFirstRow) {
                            typo.bodyBold.copy(color = Color(0xFF0F172A), fontSize = 12.sp)
                        } else {
                            typo.caption.copy(color = Color(0xFF1E293B), fontSize = 11.sp)
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun PaperSignatoryBlock(
    name: String,
    role: String,
) {
    val typo = SorbetTheme.typography
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.End,
    ) {
        Column(
            modifier = Modifier.width(148.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(1.dp)
                    .background(Color(0xFF64748B))
            )
            Spacer(modifier = Modifier.height(4.dp))
            BasicText(
                text = name,
                style = typo.caption.copy(
                    color = Color(0xFF1E293B),
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                ),
            )
            BasicText(
                text = role,
                style = typo.caption.copy(
                    color = Color(0xFF64748B),
                    fontSize = 9.sp,
                ),
            )
        }
    }
}
