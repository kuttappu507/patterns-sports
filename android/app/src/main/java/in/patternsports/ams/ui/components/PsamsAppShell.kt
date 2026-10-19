package `in`.patternsports.ams.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import `in`.patternsports.ams.domain.AcademySettings
import `in`.patternsports.ams.domain.NavView
import `in`.patternsports.ams.ui.motion.FluidAuroraBackdrop
import `in`.patternsports.ams.ui.motion.StopMotionVolleyballOrb
import `in`.patternsports.ams.ui.motion.fluidPressable
import `in`.patternsports.ams.ui.theme.CourtIcon
import `in`.patternsports.ams.ui.theme.CourtVectorIcon
import `in`.patternsports.ams.ui.theme.SorbetTheme

// ============================================================
// PS-AMS :: Executive App Shell (Matches PC App Chrome)
// Top Club Header Bar + Bottom Navigation Bar + Toast Banner
// ============================================================

private data class NavDestination(
    val view: NavView,
    val label: String,
    val icon: CourtIcon,
)

private val DOCK_DESTINATIONS = listOf(
    NavDestination(NavView.DASHBOARD, "Home", CourtIcon.DASHBOARD),
    NavDestination(NavView.STUDENTS, "Players", CourtIcon.PLAYERS),
    NavDestination(NavView.FEES, "Fees", CourtIcon.FEES_RUPEE),
    NavDestination(NavView.ATTENDANCE, "Attendance", CourtIcon.ATTENDANCE),
    NavDestination(NavView.REPORTS, "Reports", CourtIcon.REPORTS),
    NavDestination(NavView.SETTINGS, "Admin", CourtIcon.SETTINGS),
)

@Composable
fun PsamsAppShell(
    currentView: NavView,
    settings: AcademySettings,
    defaultersCount: Int,
    darkTheme: Boolean,
    toastMessage: String?,
    onSelectView: (NavView) -> Unit,
    onQuickAddStudent: () -> Unit,
    onQuickCollectFee: () -> Unit,
    onToggleTheme: () -> Unit,
    onDismissToast: () -> Unit,
    content: @Composable () -> Unit,
) {
    val colors = SorbetTheme.colors
    val typo = SorbetTheme.typography
    val statusPad = WindowInsets.statusBars.asPaddingValues()
    val navPad = WindowInsets.navigationBars.asPaddingValues()

    Box(modifier = Modifier.fillMaxSize()) {
        // 1. Subtle Ambient Canvas
        FluidAuroraBackdrop()

        // 2. Main Vertical Layout
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(
                    top = statusPad.calculateTopPadding(),
                    bottom = navPad.calculateBottomPadding(),
                )
        ) {
            // Top Executive Header Bar (matches PC app top bar & dark club header)
            TopArenaHeaderBar(
                academyName = settings.academyName,
                currentView = currentView,
                darkTheme = darkTheme,
                onQuickAddStudent = onQuickAddStudent,
                onQuickCollectFee = onQuickCollectFee,
                onToggleTheme = onToggleTheme,
            )

            // Active Screen Viewport
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
            ) {
                content()
            }

            // Bottom Executive Navigation Bar
            BottomFluidCourtDock(
                currentView = currentView,
                defaultersCount = defaultersCount,
                onSelectView = onSelectView,
            )
        }

        // 3. Clean Executive Toast Notification Banner
        AnimatedVisibility(
            visible = !toastMessage.isNullOrBlank(),
            enter = slideInVertically { -it } + fadeIn(),
            exit = slideOutVertically { -it } + fadeOut(),
            modifier = Modifier
                .align(Alignment.TopCenter)
                .padding(top = statusPad.calculateTopPadding() + 68.dp, start = 20.dp, end = 20.dp),
        ) {
            Row(
                modifier = Modifier
                    .fluidPressable(onClick = onDismissToast)
                    .shadow(10.dp, RoundedCornerShape(12.dp))
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color(0xFF072532), RoundedCornerShape(12.dp))
                    .border(1.dp, colors.accentTeal.copy(alpha = 0.6f), RoundedCornerShape(12.dp))
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CourtVectorIcon(icon = CourtIcon.CHECK, tint = colors.accentTeal, size = 16.dp)
                Spacer(modifier = Modifier.width(8.dp))
                BasicText(
                    text = toastMessage.orEmpty(),
                    style = typo.bodyBold.copy(color = Color.White),
                )
            }
        }
    }
}

@Composable
private fun TopArenaHeaderBar(
    academyName: String,
    currentView: NavView,
    darkTheme: Boolean,
    onQuickAddStudent: () -> Unit,
    onQuickCollectFee: () -> Unit,
    onToggleTheme: () -> Unit,
) {
    val colors = SorbetTheme.colors
    val typo = SorbetTheme.typography

    val viewSubtitle = when (currentView) {
        NavView.DASHBOARD -> "Executive Dashboard"
        NavView.STUDENTS -> "Player Profiles & Biometrics"
        NavView.STUDENT_DETAIL -> "Player Profile & WHO 2007 BMI"
        NavView.FEES -> "Fee Management & Receipts"
        NavView.ATTENDANCE -> "Court-Side Attendance"
        NavView.REPORTS -> "Smart Search & Reports"
        NavView.SETTINGS -> "Committee & Administration"
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xFF07222E))
    ) {
        // Top 3dp gradient spike line matching PC app sidebar-court
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(3.dp)
                .background(
                    Brush.horizontalGradient(
                        listOf(
                            Color(0xFFEF476F),
                            Color(0xFFFF6B8D),
                            Color(0xFFFFD166),
                        )
                    )
                )
        )

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            // Left: Brand Tile + Academy Title & Module Subtitle
            Row(
                modifier = Modifier.weight(1f),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                StopMotionVolleyballOrb(size = 38.dp)
                Spacer(modifier = Modifier.width(11.dp))
                Column {
                    BasicText(
                        text = academyName,
                        style = typo.h3.copy(
                            color = Color.White,
                            fontWeight = FontWeight.Bold,
                        ),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    BasicText(
                        text = viewSubtitle,
                        style = typo.caption.copy(color = Color(0xFF94B8C7)),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }

            // Right: Quick Action Buttons ("Fee" & "Register") + Theme Toggle
            Spacer(modifier = Modifier.width(8.dp))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                // Collect Fee Button
                Box(
                    modifier = Modifier
                        .fluidPressable(scaleDown = 0.95f, onClick = onQuickCollectFee)
                        .clip(RoundedCornerShape(9.dp))
                        .background(Color.White.copy(alpha = 0.10f), RoundedCornerShape(9.dp))
                        .border(1.dp, Color.White.copy(alpha = 0.18f), RoundedCornerShape(9.dp))
                        .padding(horizontal = 9.dp, vertical = 6.5.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        CourtVectorIcon(icon = CourtIcon.FEES_RUPEE, tint = Color(0xFFFFD166), size = 14.dp)
                        Spacer(modifier = Modifier.width(4.dp))
                        BasicText(
                            text = "Fee",
                            style = typo.caption.copy(color = Color.White, fontWeight = FontWeight.SemiBold),
                            maxLines = 1,
                        )
                    }
                }

                // Register Player Button
                Box(
                    modifier = Modifier
                        .fluidPressable(scaleDown = 0.95f, onClick = onQuickAddStudent)
                        .clip(RoundedCornerShape(9.dp))
                        .background(
                            Brush.horizontalGradient(listOf(colors.primaryRose, colors.primaryRoseDeep)),
                            RoundedCornerShape(9.dp)
                        )
                        .padding(horizontal = 9.dp, vertical = 6.5.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        CourtVectorIcon(icon = CourtIcon.PLUS, tint = Color.White, size = 14.dp)
                        Spacer(modifier = Modifier.width(4.dp))
                        BasicText(
                            text = "Register",
                            style = typo.caption.copy(color = Color.White, fontWeight = FontWeight.SemiBold),
                            maxLines = 1,
                        )
                    }
                }

                // Theme Toggle Button
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .fluidPressable(scaleDown = 0.94f, onClick = onToggleTheme)
                        .clip(RoundedCornerShape(9.dp))
                        .background(Color.White.copy(alpha = 0.08f), RoundedCornerShape(9.dp))
                        .border(1.dp, Color.White.copy(alpha = 0.14f), RoundedCornerShape(9.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    CourtVectorIcon(
                        icon = if (darkTheme) CourtIcon.SUN else CourtIcon.MOON,
                        tint = if (darkTheme) Color(0xFFFFD166) else Color(0xFFE2E8F0),
                        size = 16.dp,
                    )
                }
            }
        }
    }
}

@Composable
private fun BottomFluidCourtDock(
    currentView: NavView,
    defaultersCount: Int,
    onSelectView: (NavView) -> Unit,
) {
    val colors = SorbetTheme.colors
    val typo = SorbetTheme.typography
    val effectiveView = if (currentView == NavView.STUDENT_DETAIL) NavView.STUDENTS else currentView

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xFF07222E))
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(1.dp)
                .background(Color.White.copy(alpha = 0.08f))
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 6.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            for (dest in DOCK_DESTINATIONS) {
                val active = dest.view == effectiveView
                val pillBg by animateColorAsState(
                    targetValue = if (active) colors.primaryRose else Color.Transparent,
                    animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
                    label = "dockBg",
                )
                val iconTint by animateColorAsState(
                    targetValue = if (active) Color.White else Color(0xFF94B8C7),
                    label = "dockTint",
                )

                Box(
                    modifier = Modifier
                        .weight(1f)
                        .padding(horizontal = 2.dp)
                        .fluidPressable(scaleDown = 0.95f, onClick = { onSelectView(dest.view) })
                        .clip(RoundedCornerShape(10.dp))
                        .background(pillBg, RoundedCornerShape(10.dp))
                        .padding(vertical = 7.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Box {
                            CourtVectorIcon(
                                icon = dest.icon,
                                tint = iconTint,
                                size = 18.dp,
                                strokeWidthDp = if (active) 2.1.dp else 1.8.dp,
                            )
                            if (dest.view == NavView.FEES && defaultersCount > 0) {
                                Box(
                                    modifier = Modifier
                                        .align(Alignment.TopEnd)
                                        .size(7.dp)
                                        .clip(CircleShape)
                                        .background(if (active) Color(0xFFFFD166) else colors.primaryRose)
                                )
                            }
                        }
                        Spacer(modifier = Modifier.height(3.dp))
                        BasicText(
                            text = dest.label,
                            style = typo.caption.copy(
                                color = iconTint,
                                fontSize = 10.5.sp,
                                lineHeight = 14.sp,
                                fontWeight = if (active) FontWeight.SemiBold else FontWeight.Medium,
                            ),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
        }
    }
}
