package `in`.patternsports.ams.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import `in`.patternsports.ams.data.DocumentExporter
import `in`.patternsports.ams.data.WhatsAppDispatcher
import `in`.patternsports.ams.domain.AGE_CATEGORIES
import `in`.patternsports.ams.domain.AcademySettings
import `in`.patternsports.ams.domain.DomainEngine
import `in`.patternsports.ams.domain.FeeOverview
import `in`.patternsports.ams.domain.FeePayment
import `in`.patternsports.ams.domain.PrintPayload
import `in`.patternsports.ams.domain.StudentFeeStatus
import `in`.patternsports.ams.ui.components.FluidChipRow
import `in`.patternsports.ams.ui.components.FluidDropdownSelect
import `in`.patternsports.ams.ui.components.FluidGlassCard
import `in`.patternsports.ams.ui.components.FluidIconOrbButton
import `in`.patternsports.ams.ui.components.FluidPrimaryButton
import `in`.patternsports.ams.ui.components.FluidSearchBar
import `in`.patternsports.ams.ui.components.FluidSecondaryButton
import `in`.patternsports.ams.ui.components.FluidToneBadge
import `in`.patternsports.ams.ui.motion.FluidCountUpText
import `in`.patternsports.ams.ui.motion.StaggeredFluidEntrance
import `in`.patternsports.ams.ui.motion.StopMotionReceiptTearEdge
import `in`.patternsports.ams.ui.motion.StopMotionStampBadge
import `in`.patternsports.ams.ui.theme.CourtIcon
import `in`.patternsports.ams.ui.theme.SorbetTheme
import java.util.Locale

// ============================================================
// PS-AMS :: Fee Management, Defaulters Monitor & POS Ledger
// 1:1 parity with src/components/psams/views/fees-view.tsx
// ============================================================

@Composable
fun FeesScreen(
    overview: FeeOverview?,
    settings: AcademySettings,
    onCollectFee: (String?) -> Unit,
    onSelectStudent: (String) -> Unit,
    onPrintReceipt: (FeePayment) -> Unit,
    onOpenPrintPreview: (PrintPayload) -> Unit,
) {
    val colors = SorbetTheme.colors
    val typo = SorbetTheme.typography
    val context = LocalContext.current

    var activeTab by remember { mutableStateOf("defaulters") } // "defaulters" | "ledger" | "receipts"
    var searchQuery by remember { mutableStateOf("") }
    var categoryFilter by remember { mutableStateOf("ALL") }

    if (overview == null) return

    val defaultersAndDue = remember(overview.statuses, searchQuery, categoryFilter) {
        val q = searchQuery.trim().lowercase(Locale.ROOT)
        overview.statuses
            .filter { it.pendingMonths.isNotEmpty() }
            .filter {
                if (categoryFilter != "ALL" && it.student.ageCategory != categoryFilter) return@filter false
                if (q.isNotEmpty()) {
                    val hay = "${it.student.fullName} ${it.student.admissionNo} ${it.student.mobile}".lowercase(Locale.ROOT)
                    if (!hay.contains(q)) return@filter false
                }
                true
            }
            .sortedByDescending { it.dueAmount }
    }

    val filteredStatuses = remember(overview.statuses, searchQuery, categoryFilter) {
        val q = searchQuery.trim().lowercase(Locale.ROOT)
        overview.statuses.filter {
            if (categoryFilter != "ALL" && it.student.ageCategory != categoryFilter) return@filter false
            if (q.isNotEmpty()) {
                val hay = "${it.student.fullName} ${it.student.admissionNo} ${it.student.mobile}".lowercase(Locale.ROOT)
                if (!hay.contains(q)) return@filter false
            }
            true
        }
    }

    val filteredReceipts = remember(overview.payments, searchQuery, categoryFilter) {
        val q = searchQuery.trim().lowercase(Locale.ROOT)
        overview.payments.filter { p ->
            if (categoryFilter != "ALL" && p.ageCategory != categoryFilter) return@filter false
            if (q.isNotEmpty()) {
                val hay = "${p.receiptNo} ${p.studentName ?: ""} ${p.admissionNo ?: ""} ${p.paymentMode}".lowercase(Locale.ROOT)
                if (!hay.contains(q)) return@filter false
            }
            true
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 14.dp, vertical = 6.dp),
    ) {
        // KPI Summary Strip
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            FluidGlassCard(
                modifier = Modifier.weight(1f),
                accentStripeColor = colors.accentTeal,
                contentPadding = 12.dp,
            ) {
                BasicText("THIS MONTH", style = typo.microCaps.copy(color = colors.inkMuted))
                FluidCountUpText(
                    targetValue = overview.summary.monthlyRevenue,
                    isCurrency = true,
                    style = typo.h2.copy(color = colors.accentTeal),
                )
                BasicText(
                    "Today: ${DomainEngine.formatINR(overview.summary.todayCollection)}",
                    style = typo.caption.copy(color = colors.inkSecondary),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            FluidGlassCard(
                modifier = Modifier.weight(1f),
                accentStripeColor = colors.primaryRose,
                contentPadding = 12.dp,
            ) {
                BasicText("OUTSTANDING", style = typo.microCaps.copy(color = colors.inkMuted))
                FluidCountUpText(
                    targetValue = overview.summary.totalOutstanding,
                    isCurrency = true,
                    style = typo.h2.copy(color = colors.primaryRose),
                )
                BasicText(
                    "${overview.summary.defaultersCount} defaulters (>1 mo)",
                    style = typo.caption.copy(color = colors.inkSecondary),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        // Sub-navigation Tabs
        FluidChipRow(
            options = listOf(
                "defaulters" to "Due & Defaulters (${defaultersAndDue.size})",
                "receipts" to "Receipts (${filteredReceipts.size})",
                "ledger" to "All Accounts (${filteredStatuses.size})",
            ),
            selectedKey = activeTab,
            onSelect = { activeTab = it },
        )

        Spacer(modifier = Modifier.height(8.dp))

        // Search + Category Dropdown + Print/Export Actions
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            FluidSearchBar(
                query = searchQuery,
                onQueryChange = { searchQuery = it },
                placeholder = "Search athlete, RC-, mobile…",
                modifier = Modifier.weight(1.25f),
            )
            FluidDropdownSelect(
                options = listOf("ALL" to "All Categories") + AGE_CATEGORIES.map { it to it },
                selectedKey = categoryFilter,
                onSelect = { categoryFilter = it },
                modifier = Modifier.weight(0.95f),
            )
            if (activeTab == "defaulters") {
                FluidIconOrbButton(
                    icon = CourtIcon.PRINTER,
                    tint = colors.primaryRose,
                    onClick = {
                        onOpenPrintPreview(PrintPayload.DefaultersReport(defaultersAndDue))
                    },
                )
            } else if (activeTab == "receipts") {
                FluidIconOrbButton(
                    icon = CourtIcon.DOWNLOAD,
                    tint = colors.accentTeal,
                    onClick = {
                        val xlsx = DocumentExporter.exportPaymentsToXlsx(context, filteredReceipts)
                        DocumentExporter.shareExportedFile(
                            context,
                            xlsx,
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                            "Export Fee Ledger (.xlsx)"
                        )
                    },
                )
                FluidIconOrbButton(
                    icon = CourtIcon.PRINTER,
                    tint = colors.primaryRose,
                    onClick = {
                        onOpenPrintPreview(
                            PrintPayload.PaymentHistoryReport(
                                payments = filteredReceipts,
                                title = "Fee Payment Register",
                                subtitle = "Category: $categoryFilter",
                            )
                        )
                    },
                )
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            when (activeTab) {
                "defaulters" -> {
                    if (defaultersAndDue.isEmpty()) {
                        item {
                            FluidGlassCard(accentStripeColor = colors.accentTeal) {
                                BasicText("All fee accounts are settled!", style = typo.h2.copy(color = colors.inkPrimary))
                                Spacer(modifier = Modifier.height(4.dp))
                                BasicText(
                                    "No pending or overdue accounts match the current search and category filter.",
                                    style = typo.body.copy(color = colors.inkSecondary),
                                )
                            }
                        }
                    } else {
                        itemsIndexed(defaultersAndDue, key = { _, s -> s.student.id }) { idx, status ->
                            StaggeredFluidEntrance(index = idx) {
                                FeeStatusCard(
                                    status = status,
                                    settings = settings,
                                    onCollect = { onCollectFee(status.student.id) },
                                    onOpenProfile = { onSelectStudent(status.student.id) },
                                )
                            }
                        }
                    }
                }
                "ledger" -> {
                    if (filteredStatuses.isEmpty()) {
                        item {
                            FluidGlassCard(accentStripeColor = colors.primaryRose) {
                                BasicText("No athlete accounts found", style = typo.h2.copy(color = colors.inkPrimary))
                                Spacer(modifier = Modifier.height(4.dp))
                                BasicText(
                                    "Try clearing the search query or switching the category filter.",
                                    style = typo.body.copy(color = colors.inkSecondary),
                                )
                            }
                        }
                    } else {
                        itemsIndexed(filteredStatuses, key = { _, s -> s.student.id }) { idx, status ->
                            StaggeredFluidEntrance(index = idx) {
                                FeeStatusCard(
                                    status = status,
                                    settings = settings,
                                    onCollect = { onCollectFee(status.student.id) },
                                    onOpenProfile = { onSelectStudent(status.student.id) },
                                )
                            }
                        }
                    }
                }
                "receipts" -> {
                    if (filteredReceipts.isEmpty()) {
                        item {
                            FluidGlassCard(accentStripeColor = colors.accentCyan) {
                                BasicText("No fee receipts found", style = typo.h2.copy(color = colors.inkPrimary))
                                Spacer(modifier = Modifier.height(4.dp))
                                BasicText(
                                    "Collect a training fee or clear your search filter to view digital receipts.",
                                    style = typo.body.copy(color = colors.inkSecondary),
                                )
                            }
                        }
                    } else {
                        itemsIndexed(filteredReceipts, key = { _, p -> p.id }) { idx, payment ->
                            StaggeredFluidEntrance(index = idx) {
                                ReceiptTicketCard(
                                    payment = payment,
                                    onPrint = { onPrintReceipt(payment) },
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun FeeStatusCard(
    status: StudentFeeStatus,
    settings: AcademySettings,
    onCollect: () -> Unit,
    onOpenProfile: () -> Unit,
) {
    val colors = SorbetTheme.colors
    val typo = SorbetTheme.typography
    val context = LocalContext.current
    val s = status.student

    FluidGlassCard(
        accentStripeColor = when {
            status.isDefaulter -> colors.dangerRed
            status.pendingMonths.isNotEmpty() -> colors.accentAmber
            else -> colors.accentTeal
        },
        onClick = onOpenProfile,
        contentPadding = 14.dp,
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                BasicText(
                    text = s.fullName,
                    style = typo.h3.copy(color = colors.inkPrimary),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                BasicText(
                    text = "${s.admissionNo} · ${s.ageCategory} · ${DomainEngine.formatINR(s.monthlyFee)}/mo",
                    style = typo.caption.copy(color = colors.inkSecondary),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Spacer(modifier = Modifier.width(8.dp))
            StopMotionStampBadge(
                label = when {
                    status.isDefaulter -> "DEFAULTER (${status.overdueMonths.size}m)"
                    status.pendingMonths.isNotEmpty() -> "DUE ${DomainEngine.formatINR(status.dueAmount)}"
                    else -> "PAID UP"
                },
                color = when {
                    status.isDefaulter -> colors.dangerRed
                    status.pendingMonths.isNotEmpty() -> colors.accentAmber
                    else -> colors.accentTeal
                },
                backgroundColor = when {
                    status.isDefaulter -> colors.dangerSoft
                    status.pendingMonths.isNotEmpty() -> colors.accentAmberSoft
                    else -> colors.accentTealSoft
                },
                stampKey = "${s.id}-${status.dueAmount}",
            )
        }

        if (status.pendingMonths.isNotEmpty()) {
            Spacer(modifier = Modifier.height(6.dp))
            BasicText(
                text = "Pending: ${status.pendingMonths.joinToString(", ") { DomainEngine.monthLabel(it) }}",
                style = typo.caption.copy(color = colors.primaryRose),
            )
        }

        Spacer(modifier = Modifier.height(10.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            FluidPrimaryButton(
                text = "Collect ${if (status.dueAmount > 0) DomainEngine.formatINR(status.dueAmount) else "Fee"}",
                icon = CourtIcon.FEES_RUPEE,
                onClick = onCollect,
                modifier = Modifier.weight(1f),
            )
            if (status.pendingMonths.isNotEmpty()) {
                FluidSecondaryButton(
                    text = "Remind",
                    icon = CourtIcon.WHATSAPP,
                    tintColor = colors.accentTeal,
                    onClick = {
                        val msg = WhatsAppDispatcher.buildFeeReminderMessage(
                            student = s,
                            pendingMonths = status.pendingMonths,
                            dueAmount = status.dueAmount,
                            settings = settings,
                        )
                        WhatsAppDispatcher.openWhatsAppChat(context, s.mobile, msg)
                    },
                )
            }
        }
    }
}

@Composable
private fun ReceiptTicketCard(
    payment: FeePayment,
    onPrint: () -> Unit,
) {
    val colors = SorbetTheme.colors
    val typo = SorbetTheme.typography
    val months = DomainEngine.parsePaidMonths(payment.months).joinToString(", ") { DomainEngine.monthLabel(it) }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(colors.bgElevated)
            .border(1.dp, colors.borderSubtle, RoundedCornerShape(16.dp))
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
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
                        FluidToneBadge(text = payment.receiptNo, tone = "emerald")
                        FluidToneBadge(text = payment.paymentMode, tone = "cyan")
                    }
                    Spacer(modifier = Modifier.height(4.dp))
                    BasicText(
                        text = payment.studentName ?: "Athlete",
                        style = typo.h3.copy(color = colors.inkPrimary),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    BasicText(
                        text = "${payment.admissionNo ?: ""} · Settled: $months",
                        style = typo.caption.copy(color = colors.inkSecondary),
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }

                Spacer(modifier = Modifier.width(8.dp))

                Column(horizontalAlignment = Alignment.End) {
                    BasicText(
                        text = DomainEngine.formatINR(payment.amount),
                        style = typo.h2.copy(color = colors.accentTeal),
                        maxLines = 1,
                    )
                    BasicText(
                        text = DomainEngine.formatDate(payment.paymentDate),
                        style = typo.caption.copy(color = colors.inkMuted),
                        maxLines = 1,
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    FluidSecondaryButton(
                        text = "Receipt",
                        icon = CourtIcon.PRINTER,
                        onClick = onPrint,
                    )
                }
            }
        }
        StopMotionReceiptTearEdge(color = colors.borderSubtle)
    }
}
