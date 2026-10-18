package `in`.patternsports.ams.ui.screens

import android.content.Intent
import android.net.Uri
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
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import `in`.patternsports.ams.domain.ACADEMY_MAPS_URL
import `in`.patternsports.ams.domain.DashboardData
import `in`.patternsports.ams.domain.DomainEngine
import `in`.patternsports.ams.domain.FeePayment
import `in`.patternsports.ams.domain.NavView
import `in`.patternsports.ams.ui.components.FluidConfirmDialog
import `in`.patternsports.ams.ui.components.FluidGlassCard
import `in`.patternsports.ams.ui.components.FluidPrimaryButton
import `in`.patternsports.ams.ui.components.FluidProgressBar
import `in`.patternsports.ams.ui.components.FluidSecondaryButton
import `in`.patternsports.ams.ui.components.FluidToneBadge
import `in`.patternsports.ams.ui.motion.FluidCountUpText
import `in`.patternsports.ams.ui.motion.StaggeredFluidEntrance
import `in`.patternsports.ams.ui.motion.StopMotionStampBadge
import `in`.patternsports.ams.ui.motion.StopMotionVolleyballOrb
import `in`.patternsports.ams.ui.motion.fluidPressable
import `in`.patternsports.ams.ui.motion.stopMotionStickerWobble
import `in`.patternsports.ams.ui.theme.CourtIcon
import `in`.patternsports.ams.ui.theme.CourtVectorIcon
import `in`.patternsports.ams.ui.theme.SorbetTheme

// ============================================================
// PS-AMS :: Executive Dashboard Screen
// 1:1 parity with src/components/psams/views/dashboard-view.tsx
// ============================================================

@Composable
fun DashboardScreen(
    data: DashboardData?,
    onNavigate: (NavView) -> Unit,
    onFilterCategory: (String) -> Unit,
    onSelectStudent: (String) -> Unit,
    onAddStudent: () -> Unit,
    onCollectFee: (String?) -> Unit,
    onPrintReceipt: (FeePayment) -> Unit,
    onLoadDemoData: () -> Unit,
    onClearDemoData: () -> Unit,
) {
    val colors = SorbetTheme.colors
    val typo = SorbetTheme.typography
    val context = LocalContext.current
    val scroll = rememberScrollState()

    if (data == null) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            StopMotionVolleyballOrb(size = 64.dp)
        }
        return
    }

    val totals = data.totals
    var confirmClearDemo by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(scroll)
            .padding(horizontal = 14.dp, vertical = 6.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        // 1. Executive Academy Header Card
        StaggeredFluidEntrance(index = 0) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(
                        Brush.linearGradient(
                            listOf(
                                Color(0xFF072532),
                                Color(0xFF0B384A),
                                Color(0xFF12465B),
                            )
                        )
                    )
                    .border(1.dp, Color.White.copy(alpha = 0.12f), RoundedCornerShape(16.dp))
                    .padding(18.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.Top,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(6.dp))
                                .background(colors.primaryRose.copy(alpha = 0.22f))
                                .border(1.dp, colors.primaryRose.copy(alpha = 0.45f), RoundedCornerShape(6.dp))
                                .padding(horizontal = 9.dp, vertical = 3.5.dp),
                        ) {
                            BasicText(
                                text = "EXECUTIVE ACADEMY OVERVIEW",
                                style = typo.microCaps.copy(color = Color(0xFFFF8FA8)),
                            )
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        BasicText(
                            text = data.settings.academyName,
                            style = typo.h1.copy(color = Color.White),
                        )
                        Spacer(modifier = Modifier.height(2.dp))
                        BasicText(
                            text = data.settings.tagline,
                            style = typo.caption.copy(color = Color(0xFFB4CED9)),
                        )
                    }
                    StopMotionVolleyballOrb(size = 46.dp)
                }

                Spacer(modifier = Modifier.height(12.dp))

                // Location & Maps Pill
                Row(
                    modifier = Modifier
                        .fluidPressable(onClick = {
                            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(ACADEMY_MAPS_URL)))
                        })
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color.Black.copy(alpha = 0.18f))
                        .padding(horizontal = 10.dp, vertical = 7.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    CourtVectorIcon(icon = CourtIcon.MAP_PIN, tint = Color.White, size = 14.dp)
                    Spacer(modifier = Modifier.width(6.dp))
                    BasicText(
                        text = data.settings.address,
                        style = typo.caption.copy(color = Color.White),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }

                // Demo Data Banner if database is empty or has tagged demo data
                if (totals.totalStudents == 0 || data.hasDemoData) {
                    Spacer(modifier = Modifier.height(12.dp))
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(14.dp))
                            .background(Color.White.copy(alpha = 0.92f))
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            BasicText(
                                text = if (totals.totalStudents == 0) "Ready to explore?" else "Demo Squad Loaded",
                                style = typo.bodyBold.copy(color = colors.navyCourt),
                            )
                            BasicText(
                                text = if (totals.totalStudents == 0) {
                                    "Seed 12 Kerala volleyball athletes, receipts & medals."
                                } else {
                                    "Clear tagged demo records anytime without losing real athletes."
                                },
                                style = typo.caption.copy(color = colors.inkSecondary),
                            )
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                        if (totals.totalStudents == 0) {
                            FluidPrimaryButton(
                                text = "Load Demo",
                                icon = CourtIcon.SPARKLES,
                                onClick = onLoadDemoData,
                            )
                        } else {
                            FluidSecondaryButton(
                                text = "Clear Demo",
                                icon = CourtIcon.TRASH,
                                tintColor = colors.dangerRed,
                                onClick = { confirmClearDemo = true },
                            )
                        }
                    }
                }
            }
        }

        // 2. Four Animated KPI Cards (2x2 Grid)
        StaggeredFluidEntrance(index = 1) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    // Active Enrolment
                    FluidGlassCard(
                        modifier = Modifier.weight(1f),
                        accentStripeColor = colors.primaryRose,
                        onClick = { onNavigate(NavView.STUDENTS) },
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            BasicText("ACTIVE SQUAD", style = typo.microCaps.copy(color = colors.inkMuted))
                            CourtVectorIcon(icon = CourtIcon.PLAYERS, tint = colors.primaryRose, size = 18.dp)
                        }
                        Spacer(modifier = Modifier.height(6.dp))
                        FluidCountUpText(
                            targetValue = totals.activeStudents.toDouble(),
                            style = typo.displayHero.copy(color = colors.inkPrimary),
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        BasicText(
                            text = "${totals.totalStudents} total • ${totals.inactiveStudents} alumni/inactive",
                            style = typo.caption.copy(color = colors.inkSecondary),
                        )
                    }

                    // Monthly Revenue
                    FluidGlassCard(
                        modifier = Modifier.weight(1f),
                        accentStripeColor = colors.accentTeal,
                        onClick = { onNavigate(NavView.FEES) },
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            BasicText("THIS MONTH", style = typo.microCaps.copy(color = colors.inkMuted))
                            CourtVectorIcon(icon = CourtIcon.FEES_RUPEE, tint = colors.accentTeal, size = 18.dp)
                        }
                        Spacer(modifier = Modifier.height(6.dp))
                        FluidCountUpText(
                            targetValue = totals.monthlyRevenue,
                            isCurrency = true,
                            style = typo.h1.copy(color = colors.accentTeal),
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        BasicText(
                            text = "Today: ${DomainEngine.formatINR(totals.todayCollection)}",
                            style = typo.caption.copy(color = colors.inkSecondary),
                        )
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    // Fee Cycle Breakdown
                    FluidGlassCard(
                        modifier = Modifier.weight(1f),
                        accentStripeColor = colors.accentAmber,
                        onClick = { onNavigate(NavView.FEES) },
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            BasicText("FEE CYCLE", style = typo.microCaps.copy(color = colors.inkMuted))
                            StopMotionStampBadge(
                                label = if (totals.defaultersCount > 0) "${totals.defaultersCount} OVERDUE" else "ALL CLEAR",
                                color = if (totals.defaultersCount > 0) colors.primaryRose else colors.accentTeal,
                                backgroundColor = if (totals.defaultersCount > 0) colors.primaryRoseSoft else colors.accentTealSoft,
                                stampKey = totals.defaultersCount,
                            )
                        }
                        Spacer(modifier = Modifier.height(6.dp))
                        FluidCountUpText(
                            targetValue = totals.totalOutstandingAmount,
                            isCurrency = true,
                            style = typo.h1.copy(color = colors.inkPrimary),
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        BasicText(
                            text = "${totals.paidThisMonthCount} paid • ${totals.dueCount} due • ${totals.defaultersCount} defaulters",
                            style = typo.caption.copy(color = colors.inkSecondary),
                        )
                    }

                    // Today's Roll Call
                    FluidGlassCard(
                        modifier = Modifier.weight(1f),
                        accentStripeColor = colors.accentCyan,
                        onClick = { onNavigate(NavView.ATTENDANCE) },
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            BasicText("TODAY ROLL CALL", style = typo.microCaps.copy(color = colors.inkMuted))
                            CourtVectorIcon(icon = CourtIcon.ATTENDANCE, tint = colors.accentCyan, size = 18.dp)
                        }
                        Spacer(modifier = Modifier.height(6.dp))
                        Row(verticalAlignment = Alignment.Bottom) {
                            FluidCountUpText(
                                targetValue = totals.presentToday.toDouble(),
                                style = typo.displayHero.copy(color = colors.accentCyan),
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            BasicText(
                                text = "present",
                                style = typo.caption.copy(color = colors.inkSecondary),
                                modifier = Modifier.padding(bottom = 4.dp),
                            )
                        }
                        Spacer(modifier = Modifier.height(4.dp))
                        BasicText(
                            text = "${totals.absentToday} absent • Tap to mark batch",
                            style = typo.caption.copy(color = colors.inkSecondary),
                        )
                    }
                }
            }
        }

        // 3. Age-Category Squad Distribution (Interactive Bars)
        StaggeredFluidEntrance(index = 2) {
            FluidGlassCard(accentStripeColor = colors.primaryRose) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        BasicText(
                            text = "Squad Age-Category Distribution",
                            style = typo.h2.copy(color = colors.inkPrimary),
                        )
                        BasicText(
                            text = "Tap any category bar to filter the athlete roster",
                            style = typo.caption.copy(color = colors.inkSecondary),
                        )
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    FluidToneBadge(text = "5 Brackets", tone = "rose")
                }

                Spacer(modifier = Modifier.height(14.dp))

                val maxCount = (data.categoryBreakdown.maxOfOrNull { it.count } ?: 1).coerceAtLeast(1)
                val catColors = listOf(
                    colors.accentTeal,
                    colors.accentCyan,
                    colors.primaryRose,
                    colors.accentAmber,
                    Color(0xFF8B5CF6),
                )

                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    data.categoryBreakdown.forEachIndexed { idx, item ->
                        val barColor = catColors[idx % catColors.size]
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .fluidPressable(scaleDown = 0.98f, onClick = { onFilterCategory(item.category) })
                                .clip(RoundedCornerShape(12.dp))
                                .background(colors.bgSubtle.copy(alpha = 0.55f))
                                .padding(horizontal = 12.dp, vertical = 9.dp)
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                BasicText(
                                    text = DomainEngine.categoryBracket(item.category),
                                    style = typo.bodyBold.copy(color = colors.inkPrimary),
                                )
                                BasicText(
                                    text = "${item.count} athlete${if (item.count == 1) "" else "s"}",
                                    style = typo.monoStat.copy(color = barColor),
                                )
                            }
                            Spacer(modifier = Modifier.height(6.dp))
                            FluidProgressBar(
                                fraction = item.count.toFloat() / maxCount.toFloat(),
                                color = barColor,
                                height = 7.dp,
                            )
                        }
                    }
                }
            }
        }

        // 4. Recent Fee Receipts & Recent Tournament Achievements
        StaggeredFluidEntrance(index = 3) {
            FluidGlassCard(accentStripeColor = colors.accentTeal) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        BasicText("Recent Fee Receipts", style = typo.h2.copy(color = colors.inkPrimary))
                        BasicText("Tap any receipt to preview / print / WhatsApp", style = typo.caption.copy(color = colors.inkSecondary))
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    FluidSecondaryButton(
                        text = "Collect",
                        icon = CourtIcon.PLUS,
                        tintColor = colors.accentTeal,
                        onClick = { onCollectFee(null) },
                    )
                }

                Spacer(modifier = Modifier.height(10.dp))

                if (data.recentPayments.isEmpty()) {
                    BasicText(
                        text = "No fee payments recorded yet.",
                        style = typo.body.copy(color = colors.inkMuted),
                    )
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        for (p in data.recentPayments) {
                            val months = DomainEngine.parsePaidMonths(p.months).joinToString(", ") { DomainEngine.monthLabel(it) }
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .fluidPressable(onClick = { onPrintReceipt(p) })
                                    .clip(RoundedCornerShape(14.dp))
                                    .background(colors.bgSubtle.copy(alpha = 0.65f))
                                    .border(1.dp, colors.borderSubtle, RoundedCornerShape(14.dp))
                                    .padding(horizontal = 12.dp, vertical = 10.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    BasicText(
                                        text = p.studentName ?: "Athlete",
                                        style = typo.bodyBold.copy(color = colors.inkPrimary),
                                    )
                                    BasicText(
                                        text = "${p.receiptNo} • $months • ${p.paymentMode}",
                                        style = typo.caption.copy(color = colors.inkSecondary),
                                    )
                                }
                                Column(horizontalAlignment = Alignment.End) {
                                    BasicText(
                                        text = DomainEngine.formatINR(p.amount),
                                        style = typo.monoStat.copy(color = colors.accentTeal),
                                    )
                                    BasicText(
                                        text = DomainEngine.formatDate(p.paymentDate),
                                        style = typo.caption.copy(color = colors.inkMuted),
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        // 5. Tournament Honours & Upcoming Birthdays
        StaggeredFluidEntrance(index = 4) {
            FluidGlassCard(accentStripeColor = colors.accentAmber) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        BasicText("Tournament Honours & Podiums", style = typo.h2.copy(color = colors.inkPrimary))
                        BasicText("Recent district, state & national medals", style = typo.caption.copy(color = colors.inkSecondary))
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    CourtVectorIcon(icon = CourtIcon.TROPHY, tint = colors.accentAmber, size = 22.dp)
                }

                Spacer(modifier = Modifier.height(10.dp))

                if (data.recentAchievements.isEmpty()) {
                    BasicText(
                        text = "No tournament medals logged yet.",
                        style = typo.body.copy(color = colors.inkMuted),
                    )
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        data.recentAchievements.forEachIndexed { idx, ach ->
                            val medalTone = when (ach.medal) {
                                "Gold" -> "amber"
                                "Silver" -> "cyan"
                                "Bronze" -> "rose"
                                else -> "emerald"
                            }
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .fluidPressable(onClick = { onSelectStudent(ach.studentId) })
                                    .clip(RoundedCornerShape(14.dp))
                                    .background(colors.bgSubtle.copy(alpha = 0.65f))
                                    .padding(horizontal = 12.dp, vertical = 10.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    BasicText(
                                        text = ach.studentName,
                                        style = typo.bodyBold.copy(color = colors.inkPrimary),
                                    )
                                    BasicText(
                                        text = "${ach.tournamentName} (${ach.level})",
                                        style = typo.caption.copy(color = colors.inkSecondary),
                                    )
                                }
                                Spacer(modifier = Modifier.width(8.dp))
                                FluidToneBadge(
                                    text = "${ach.medal} Medal",
                                    tone = medalTone,
                                    modifier = Modifier.stopMotionStickerWobble(seed = idx, amplitudeDeg = 1.5f),
                                )
                            }
                        }
                    }
                }
            }
        }

        // 6. Upcoming Birthdays & Executive Committee Strip
        if (data.upcomingBirthdays.isNotEmpty()) {
            StaggeredFluidEntrance(index = 5) {
                FluidGlassCard(accentStripeColor = colors.accentCyan) {
                    BasicText("Upcoming Athlete Birthdays (Next 30 Days)", style = typo.h2.copy(color = colors.inkPrimary))
                    Spacer(modifier = Modifier.height(8.dp))
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        for (b in data.upcomingBirthdays) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .fluidPressable(onClick = { onSelectStudent(b.id) })
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(colors.bgSubtle.copy(alpha = 0.6f))
                                    .padding(horizontal = 12.dp, vertical = 8.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    BasicText(b.fullName, style = typo.bodyBold.copy(color = colors.inkPrimary))
                                    BasicText(
                                        "${b.ageCategory} • Turning ${b.turningAge} on ${DomainEngine.formatDate(b.dateOfBirth)}",
                                        style = typo.caption.copy(color = colors.inkSecondary),
                                    )
                                }
                                Spacer(modifier = Modifier.width(8.dp))
                                FluidToneBadge(
                                    text = if (b.inDays == 0) "TODAY!" else "In ${b.inDays}d",
                                    tone = if (b.inDays == 0) "rose" else "cyan",
                                )
                            }
                        }
                    }
                }
            }
        }

        // 7. Executive Committee Showcase
        StaggeredFluidEntrance(index = 6) {
            FluidGlassCard(accentStripeColor = colors.navyCourt) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        BasicText("Academy Office-Bearers & Committee", style = typo.h2.copy(color = colors.inkPrimary))
                        BasicText("${data.committee.size} governing members", style = typo.caption.copy(color = colors.inkSecondary))
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    FluidSecondaryButton(
                        text = "Manage",
                        icon = CourtIcon.SETTINGS,
                        onClick = { onNavigate(NavView.SETTINGS) },
                    )
                }
                Spacer(modifier = Modifier.height(10.dp))
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    for (m in data.committee.take(5)) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .background(colors.bgSubtle.copy(alpha = 0.55f))
                                .padding(horizontal = 12.dp, vertical = 9.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                BasicText(m.fullName, style = typo.bodyBold.copy(color = colors.inkPrimary))
                                BasicText(
                                    text = m.responsibilities ?: m.role,
                                    style = typo.caption.copy(color = colors.inkSecondary),
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                            Spacer(modifier = Modifier.width(8.dp))
                            FluidToneBadge(text = m.role, tone = "slate")
                        }
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(20.dp))
    }

    if (confirmClearDemo) {
        FluidConfirmDialog(
            title = "Clear Demo Squad?",
            message = "Remove all tagged sample demo athletes, demo fee receipts, and demo achievements from the academy database while keeping your real records intact?",
            confirmText = "Clear Demo Squad",
            onConfirm = {
                confirmClearDemo = false
                onClearDemoData()
            },
            onDismiss = { confirmClearDemo = false },
        )
    }
}
