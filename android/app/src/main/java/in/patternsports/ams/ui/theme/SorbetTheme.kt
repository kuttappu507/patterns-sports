package `in`.patternsports.ams.ui.theme

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import `in`.patternsports.ams.R

// ============================================================
// PS-AMS :: Executive Sports Suite Design System & Theme Engine
// Explicitly uses bundled Google Fonts Poppins across the app
// ============================================================

val PoppinsFontFamily = FontFamily(
    Font(R.font.poppins_regular, FontWeight.Normal, FontStyle.Normal),
    Font(R.font.poppins_italic, FontWeight.Normal, FontStyle.Italic),
    Font(R.font.poppins_medium, FontWeight.Medium, FontStyle.Normal),
    Font(R.font.poppins_semibold, FontWeight.SemiBold, FontStyle.Normal),
    Font(R.font.poppins_bold, FontWeight.Bold, FontStyle.Normal),
    Font(R.font.poppins_bold, FontWeight.ExtraBold, FontStyle.Normal),
    Font(R.font.poppins_bold, FontWeight.Black, FontStyle.Normal),
    Font(R.font.poppins_bold_italic, FontWeight.Bold, FontStyle.Italic),
)

private val CleanPlatformTextStyle = PlatformTextStyle(includeFontPadding = false)

@Immutable
data class SorbetColors(
    val isDark: Boolean,
    val bgCanvas: Color,
    val bgElevated: Color,
    val bgGlass: Color,
    val bgSubtle: Color,
    val inkPrimary: Color,
    val inkSecondary: Color,
    val inkMuted: Color,
    val borderSubtle: Color,
    val borderStrong: Color,
    val primaryRose: Color,
    val primaryRoseDeep: Color,
    val primaryRoseSoft: Color,
    val accentAmber: Color,
    val accentAmberSoft: Color,
    val accentTeal: Color,
    val accentTealSoft: Color,
    val accentCyan: Color,
    val accentCyanSoft: Color,
    val navyCourt: Color,
    val dangerRed: Color,
    val dangerSoft: Color,
) {
    val heroGradient: Brush
        get() = Brush.linearGradient(
            colors = listOf(Color(0xFF073B4C), Color(0xFF0D4F66), primaryRoseDeep)
        )

    val courtCardGradient: Brush
        get() = if (isDark) {
            Brush.verticalGradient(
                colors = listOf(Color(0xFF0F2432), Color(0xFF0B1C27))
            )
        } else {
            Brush.verticalGradient(
                colors = listOf(Color(0xFFFFFFFF), Color(0xFFFAFBFD))
            )
        }
}

val LightSorbetPalette = SorbetColors(
    isDark = false,
    bgCanvas = Color(0xFFF6F8FA),
    bgElevated = Color(0xFFFFFFFF),
    bgGlass = Color(0xF5FFFFFF),
    bgSubtle = Color(0xFFEEF2F6),
    inkPrimary = Color(0xFF073B4C),
    inkSecondary = Color(0xFF3E5966),
    inkMuted = Color(0xFF6C8591),
    borderSubtle = Color(0xFFE2E8F0),
    borderStrong = Color(0xFFCBD5E1),
    primaryRose = Color(0xFFEF476F),
    primaryRoseDeep = Color(0xFFC9184A),
    primaryRoseSoft = Color(0xFFFFEBF0),
    accentAmber = Color(0xFFD97706),
    accentAmberSoft = Color(0xFFFEF3C7),
    accentTeal = Color(0xFF059669),
    accentTealSoft = Color(0xFFD1FAE5),
    accentCyan = Color(0xFF0284C7),
    accentCyanSoft = Color(0xFFE0F2FE),
    navyCourt = Color(0xFF072532),
    dangerRed = Color(0xFFDC2626),
    dangerSoft = Color(0xFFFEE2E2),
)

val DarkArenaPalette = SorbetColors(
    isDark = true,
    bgCanvas = Color(0xFF06131B),
    bgElevated = Color(0xFF0C202D),
    bgGlass = Color(0xEB0E2433),
    bgSubtle = Color(0xFF132E3F),
    inkPrimary = Color(0xFFF1F7FA),
    inkSecondary = Color(0xFF9EBAC7),
    inkMuted = Color(0xFF648291),
    borderSubtle = Color(0xFF1B3A4D),
    borderStrong = Color(0xFF28526B),
    primaryRose = Color(0xFFFF5C82),
    primaryRoseDeep = Color(0xFFEF476F),
    primaryRoseSoft = Color(0xFF381623),
    accentAmber = Color(0xFFFBBF24),
    accentAmberSoft = Color(0xFF362A10),
    accentTeal = Color(0xFF10B981),
    accentTealSoft = Color(0xFF0B3329),
    accentCyan = Color(0xFF38BDF8),
    accentCyanSoft = Color(0xFF0E2D42),
    navyCourt = Color(0xFF040E14),
    dangerRed = Color(0xFFF87171),
    dangerSoft = Color(0xFF3A161B),
)

@Immutable
data class SorbetTypography(
    val displayHero: TextStyle = TextStyle(
        fontFamily = PoppinsFontFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 24.sp,
        lineHeight = 32.sp,
        letterSpacing = 0.sp,
        platformStyle = CleanPlatformTextStyle,
    ),
    val h1: TextStyle = TextStyle(
        fontFamily = PoppinsFontFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 19.sp,
        lineHeight = 26.sp,
        letterSpacing = 0.sp,
        platformStyle = CleanPlatformTextStyle,
    ),
    val h2: TextStyle = TextStyle(
        fontFamily = PoppinsFontFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = 16.sp,
        lineHeight = 22.sp,
        letterSpacing = 0.sp,
        platformStyle = CleanPlatformTextStyle,
    ),
    val h3: TextStyle = TextStyle(
        fontFamily = PoppinsFontFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = 14.sp,
        lineHeight = 20.sp,
        letterSpacing = 0.sp,
        platformStyle = CleanPlatformTextStyle,
    ),
    val body: TextStyle = TextStyle(
        fontFamily = PoppinsFontFamily,
        fontWeight = FontWeight.Normal,
        fontSize = 13.sp,
        lineHeight = 19.sp,
        letterSpacing = 0.sp,
        platformStyle = CleanPlatformTextStyle,
    ),
    val bodyBold: TextStyle = TextStyle(
        fontFamily = PoppinsFontFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = 13.sp,
        lineHeight = 19.sp,
        letterSpacing = 0.sp,
        platformStyle = CleanPlatformTextStyle,
    ),
    val caption: TextStyle = TextStyle(
        fontFamily = PoppinsFontFamily,
        fontWeight = FontWeight.Normal,
        fontSize = 11.5.sp,
        lineHeight = 16.5.sp,
        letterSpacing = 0.sp,
        platformStyle = CleanPlatformTextStyle,
    ),
    val microCaps: TextStyle = TextStyle(
        fontFamily = PoppinsFontFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = 10.sp,
        lineHeight = 14.sp,
        letterSpacing = 0.35.sp,
        platformStyle = CleanPlatformTextStyle,
    ),
    val monoStat: TextStyle = TextStyle(
        fontFamily = PoppinsFontFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = 12.5.sp,
        lineHeight = 18.sp,
        letterSpacing = 0.sp,
        fontFeatureSettings = "tnum",
        platformStyle = CleanPlatformTextStyle,
    ),
)

val LocalSorbetColors = staticCompositionLocalOf { LightSorbetPalette }
val LocalSorbetTypography = staticCompositionLocalOf { SorbetTypography() }

object SorbetTheme {
    val colors: SorbetColors
        @Composable get() = LocalSorbetColors.current

    val typography: SorbetTypography
        @Composable get() = LocalSorbetTypography.current
}

@Composable
fun PsamsSorbetTheme(
    darkTheme: Boolean,
    content: @Composable () -> Unit,
) {
    val target = if (darkTheme) DarkArenaPalette else LightSorbetPalette
    val spec = spring<Color>(stiffness = Spring.StiffnessMediumLow)

    val animatedColors = SorbetColors(
        isDark = darkTheme,
        bgCanvas = animateColorAsState(target.bgCanvas, spec, label = "bgCanvas").value,
        bgElevated = animateColorAsState(target.bgElevated, spec, label = "bgElevated").value,
        bgGlass = animateColorAsState(target.bgGlass, spec, label = "bgGlass").value,
        bgSubtle = animateColorAsState(target.bgSubtle, spec, label = "bgSubtle").value,
        inkPrimary = animateColorAsState(target.inkPrimary, spec, label = "inkPrimary").value,
        inkSecondary = animateColorAsState(target.inkSecondary, spec, label = "inkSecondary").value,
        inkMuted = animateColorAsState(target.inkMuted, spec, label = "inkMuted").value,
        borderSubtle = animateColorAsState(target.borderSubtle, spec, label = "borderSubtle").value,
        borderStrong = animateColorAsState(target.borderStrong, spec, label = "borderStrong").value,
        primaryRose = animateColorAsState(target.primaryRose, spec, label = "primaryRose").value,
        primaryRoseDeep = animateColorAsState(target.primaryRoseDeep, spec, label = "primaryRoseDeep").value,
        primaryRoseSoft = animateColorAsState(target.primaryRoseSoft, spec, label = "primaryRoseSoft").value,
        accentAmber = animateColorAsState(target.accentAmber, spec, label = "accentAmber").value,
        accentAmberSoft = animateColorAsState(target.accentAmberSoft, spec, label = "accentAmberSoft").value,
        accentTeal = animateColorAsState(target.accentTeal, spec, label = "accentTeal").value,
        accentTealSoft = animateColorAsState(target.accentTealSoft, spec, label = "accentTealSoft").value,
        accentCyan = animateColorAsState(target.accentCyan, spec, label = "accentCyan").value,
        accentCyanSoft = animateColorAsState(target.accentCyanSoft, spec, label = "accentCyanSoft").value,
        navyCourt = animateColorAsState(target.navyCourt, spec, label = "navyCourt").value,
        dangerRed = animateColorAsState(target.dangerRed, spec, label = "dangerRed").value,
        dangerSoft = animateColorAsState(target.dangerSoft, spec, label = "dangerSoft").value,
    )

    CompositionLocalProvider(
        LocalSorbetColors provides animatedColors,
        LocalSorbetTypography provides SorbetTypography(),
        content = content,
    )
}
