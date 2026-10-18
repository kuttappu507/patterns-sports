package `in`.patternsports.ams.ui.modals

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import `in`.patternsports.ams.domain.DomainEngine
import `in`.patternsports.ams.domain.PAYMENT_MODES
import `in`.patternsports.ams.domain.StudentFeeStatus
import `in`.patternsports.ams.ui.components.FluidChipRow
import `in`.patternsports.ams.ui.components.FluidModalSheet
import `in`.patternsports.ams.ui.components.FluidPrimaryButton
import `in`.patternsports.ams.ui.components.FluidSearchBar
import `in`.patternsports.ams.ui.components.FluidTextField
import `in`.patternsports.ams.ui.components.FluidToneBadge
import `in`.patternsports.ams.ui.motion.StopMotionReceiptTearEdge
import `in`.patternsports.ams.ui.motion.fluidPressable
import `in`.patternsports.ams.ui.theme.CourtIcon
import `in`.patternsports.ams.ui.theme.SorbetTheme
import java.util.Locale

// ============================================================
// PS-AMS :: Multi-Month POS Fee Collection Modal
// 1:1 parity with src/components/psams/collect-fee-dialog.tsx
// ============================================================

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun CollectFeeModal(
    statuses: List<StudentFeeStatus>,
    preselectedStudentId: String?,
    onDismiss: () -> Unit,
    onCollect: (studentId: String, months: List<String>, amount: Double, mode: String, remarks: String?, paymentDate: String) -> Unit,
) {
    val colors = SorbetTheme.colors
    val typo = SorbetTheme.typography

    var studentQuery by remember { mutableStateOf("") }
    var selectedStudentId by remember(preselectedStudentId) {
        mutableStateOf(preselectedStudentId ?: statuses.firstOrNull { it.pendingMonths.isNotEmpty() }?.student?.id ?: statuses.firstOrNull()?.student?.id.orEmpty())
    }

    val selectedStatus = statuses.firstOrNull { it.student.id == selectedStudentId }
    val selectedMonths = remember(selectedStudentId) { mutableStateListOf<String>() }

    LaunchedEffect(selectedStatus) {
        selectedMonths.clear()
        if (selectedStatus != null && selectedStatus.pendingMonths.isNotEmpty()) {
            selectedMonths.add(selectedStatus.pendingMonths.first())
        }
    }

    var paymentMode by remember { mutableStateOf("Cash") }
    var paymentDate by remember { mutableStateOf(DomainEngine.todayKey()) }
    var remarks by remember { mutableStateOf("") }
    var errorMsg by remember { mutableStateOf<String?>(null) }

    val totalAmount = (selectedStatus?.student?.monthlyFee ?: 0.0) * selectedMonths.size

    FluidModalSheet(
        title = "Collect Training Fee (POS)",
        subtitle = "Allocates unique PaymentMonth ledger entries & RC-YYYYMM-NNNNN receipt",
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

        // Student Selector if not locked
        if (preselectedStudentId == null) {
            FluidSearchBar(
                query = studentQuery,
                onQueryChange = { studentQuery = it },
                placeholder = "Find athlete by name or admission no…",
            )
            val candidates = remember(statuses, studentQuery) {
                val q = studentQuery.trim().lowercase(Locale.ROOT)
                statuses.filter {
                    q.isEmpty() || "${it.student.fullName} ${it.student.admissionNo}".lowercase(Locale.ROOT).contains(q)
                }.take(8)
            }
            FluidChipRow(
                options = candidates.map { it.student.id to "${it.student.fullName} (${it.pendingMonths.size}m due)" },
                selectedKey = selectedStudentId,
                onSelect = { selectedStudentId = it },
            )
        }

        if (selectedStatus != null) {
            val s = selectedStatus.student
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(colors.bgSubtle.copy(alpha = 0.7f))
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column {
                            BasicText(s.fullName, style = typo.h3.copy(color = colors.inkPrimary))
                            BasicText(
                                "${s.admissionNo} • ${s.ageCategory} • Joined ${DomainEngine.formatDate(s.registrationDate)} (joining month complimentary)",
                                style = typo.caption.copy(color = colors.inkSecondary),
                            )
                        }
                        FluidToneBadge(
                            text = "${DomainEngine.formatINR(s.monthlyFee)}/mo",
                            tone = "rose",
                        )
                    }
                }
                StopMotionReceiptTearEdge(color = colors.borderSubtle)
            }

            // Billable Pending Months Picker
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                BasicText("SELECT BILLING MONTHS TO SETTLE", style = typo.microCaps.copy(color = colors.inkSecondary))
                if (selectedStatus.pendingMonths.size > 1) {
                    Box(
                        modifier = Modifier
                            .fluidPressable(onClick = {
                                if (selectedMonths.size == selectedStatus.pendingMonths.size) {
                                    selectedMonths.clear()
                                    selectedMonths.add(selectedStatus.pendingMonths.first())
                                } else {
                                    selectedMonths.clear()
                                    selectedMonths.addAll(selectedStatus.pendingMonths)
                                }
                            })
                    ) {
                        BasicText(
                            text = if (selectedMonths.size == selectedStatus.pendingMonths.size) "Select 1 Month" else "Select All (${selectedStatus.pendingMonths.size})",
                            style = typo.caption.copy(color = colors.primaryRose, fontWeight = FontWeight.Bold),
                        )
                    }
                }
            }

            if (selectedStatus.pendingMonths.isEmpty()) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(colors.accentTealSoft)
                        .padding(12.dp)
                ) {
                    BasicText(
                        "All billable months up to the current cycle are already settled!",
                        style = typo.bodyBold.copy(color = colors.accentTeal),
                    )
                }
            } else {
                FlowRow(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    for (m in selectedStatus.pendingMonths) {
                        val checked = selectedMonths.contains(m)
                        Box(
                            modifier = Modifier
                                .fluidPressable(scaleDown = 0.92f, onClick = {
                                    if (checked) selectedMonths.remove(m) else selectedMonths.add(m)
                                })
                                .clip(RoundedCornerShape(12.dp))
                                .background(if (checked) colors.primaryRose else colors.bgSubtle)
                                .border(1.dp, if (checked) colors.primaryRose else colors.borderSubtle, RoundedCornerShape(12.dp))
                                .padding(horizontal = 12.dp, vertical = 8.dp),
                        ) {
                            BasicText(
                                text = DomainEngine.monthLabel(m) + (if (checked) " ✓" else ""),
                                style = typo.caption.copy(
                                    color = if (checked) Color.White else colors.inkPrimary,
                                    fontWeight = FontWeight.Bold,
                                ),
                            )
                        }
                    }
                }
            }

            BasicText("PAYMENT MODE", style = typo.microCaps.copy(color = colors.inkSecondary))
            FluidChipRow(
                options = PAYMENT_MODES.map { it to it },
                selectedKey = paymentMode,
                onSelect = { paymentMode = it },
            )

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FluidTextField(
                    value = paymentDate,
                    onValueChange = { paymentDate = it },
                    label = "Receipt Date (YYYY-MM-DD)",
                    modifier = Modifier.weight(1f),
                )
                FluidTextField(
                    value = remarks,
                    onValueChange = { remarks = it },
                    label = "Remarks / UPI Ref",
                    modifier = Modifier.weight(1f),
                )
            }

            // Total Amount Summary Banner
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(colors.navyCourt)
                    .padding(14.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    BasicText(
                        text = "${selectedMonths.size} MONTH${if (selectedMonths.size == 1) "" else "S"} SELECTED",
                        style = typo.microCaps.copy(color = colors.accentAmber),
                    )
                    BasicText(
                        text = DomainEngine.inWords(totalAmount),
                        style = typo.caption.copy(color = Color.White.copy(alpha = 0.85f)),
                    )
                }
                BasicText(
                    text = DomainEngine.formatINR(totalAmount),
                    style = typo.h1.copy(color = Color.White),
                )
            }

            FluidPrimaryButton(
                text = "Generate Official Receipt (${DomainEngine.formatINR(totalAmount)})",
                icon = CourtIcon.FEES_RUPEE,
                enabled = selectedMonths.isNotEmpty() && totalAmount > 0,
                modifier = Modifier.fillMaxWidth(),
                onClick = {
                    try {
                        onCollect(
                            selectedStatus.student.id,
                            selectedMonths.toList(),
                            totalAmount,
                            paymentMode,
                            remarks.ifBlank { null },
                            paymentDate,
                        )
                    } catch (e: Exception) {
                        errorMsg = e.message
                    }
                },
            )
        }
    }
}
