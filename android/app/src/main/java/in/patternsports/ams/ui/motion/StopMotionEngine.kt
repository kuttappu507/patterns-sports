package `in`.patternsports.ams.ui.motion

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import `in`.patternsports.ams.ui.theme.CourtIcon
import `in`.patternsports.ams.ui.theme.CourtVectorIcon
import `in`.patternsports.ams.ui.theme.SorbetTheme
import kotlinx.coroutines.delay

// ============================================================
// PS-AMS :: Executive Motion & Brand Crest Components
// Modern, professional sports-club motion primitives matching
// the PC desktop app (brand-tile, upright status pills,
// and clean POS thermal paper perforation)
// ============================================================

@Composable
fun rememberStopMotionFrame(fps: Int = 12, totalFrames: Int = 24): Int {
    var frame by remember { mutableIntStateOf(0) }
    val frameDelayMs = (1000L / fps.coerceIn(4, 24))
    LaunchedEffect(fps, totalFrames) {
        while (true) {
            delay(frameDelayMs)
            frame = (frame + 1) % totalFrames
        }
    }
    return frame
}

/**
 * Clean upright modifier (no wobble/jitter on navigation items or cards).
 */
@Composable
fun Modifier.stopMotionStickerWobble(
    enabled: Boolean = true,
    amplitudeDeg: Float = 0f,
    seed: Int = 0,
): Modifier = this

/**
 * Executive Brand Crest Tile — matches the PC app's `.brand-tile` in `app-shell.tsx`:
 * a refined rounded squircle with a rose-crimson gradient, precision 24×24 Lucide
 * Volleyball icon, and a sunlit amber status indicator dot.
 */
@Composable
fun StopMotionVolleyballOrb(
    modifier: Modifier = Modifier,
    size: Dp = 42.dp,
    primaryColor: Color = SorbetTheme.colors.primaryRose,
    accentColor: Color = SorbetTheme.colors.accentAmber,
) {
    val corner = RoundedCornerShape(size * 0.28f)
    val dotSize = (size * 0.26f).coerceIn(8.dp, 14.dp)

    Box(
        modifier = modifier.size(size),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .size(size)
                .shadow(
                    elevation = 6.dp,
                    shape = corner,
                    ambientColor = primaryColor.copy(alpha = 0.25f),
                    spotColor = primaryColor.copy(alpha = 0.28f),
                )
                .clip(corner)
                .background(
                    brush = Brush.linearGradient(
                        colors = listOf(
                            Color(0xFFFF5C82),
                            Color(0xFFEF476F),
                            Color(0xFFC9184A),
                        )
                    ),
                    shape = corner,
                )
                .border(1.dp, Color.White.copy(alpha = 0.28f), corner),
            contentAlignment = Alignment.Center,
        ) {
            CourtVectorIcon(
                icon = CourtIcon.VOLLEYBALL,
                tint = Color.White,
                size = size * 0.54f,
                strokeWidthDp = 2.dp,
            )
        }

        // Signature PC-app status dot in bottom-right corner
        Box(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .offset(x = 2.dp, y = 2.dp)
                .size(dotSize)
                .clip(CircleShape)
                .background(accentColor, CircleShape)
                .border(2.dp, Color(0xFF073B4C), CircleShape)
        )
    }
}

/**
 * Executive Status Pill Badge — upright, clean status indicator with a subtle
 * leading dot and smooth spring scale-in transition when `stampKey` changes.
 */
@Composable
fun StopMotionStampBadge(
    label: String,
    color: Color,
    backgroundColor: Color,
    modifier: Modifier = Modifier,
    stampKey: Any = label,
) {
    val scaleAnim = remember(stampKey) { Animatable(0.92f) }
    LaunchedEffect(stampKey) {
        scaleAnim.animateTo(
            targetValue = 1f,
            animationSpec = spring(
                dampingRatio = Spring.DampingRatioMediumBouncy,
                stiffness = Spring.StiffnessMediumLow,
            ),
        )
    }

    val typo = SorbetTheme.typography
    val shape = RoundedCornerShape(50)
    Row(
        modifier = modifier
            .graphicsLayer {
                scaleX = scaleAnim.value
                scaleY = scaleAnim.value
            }
            .clip(shape)
            .background(backgroundColor, shape)
            .border(1.dp, color.copy(alpha = 0.32f), shape)
            .padding(horizontal = 9.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        Box(
            modifier = Modifier
                .size(5.5.dp)
                .clip(CircleShape)
                .background(color, CircleShape)
        )
        Spacer(modifier = Modifier.width(5.dp))
        BasicText(
            text = label.uppercase(),
            style = typo.microCaps.copy(
                color = color,
                fontWeight = FontWeight.Bold,
            ),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/**
 * Clean Receipt Perforation Tear Edge used at the bottom of POS thermal receipt previews.
 */
@Composable
fun StopMotionReceiptTearEdge(
    color: Color,
    modifier: Modifier = Modifier,
    toothWidthDp: Dp = 8.dp,
    heightDp: Dp = 6.dp,
) {
    Canvas(
        modifier = modifier
            .fillMaxWidth()
            .height(heightDp)
    ) {
        val toothW = toothWidthDp.toPx().coerceAtLeast(6f)
        val count = (size.width / toothW).toInt().coerceAtLeast(4)
        val actualW = size.width / count
        val path = Path().apply {
            moveTo(0f, 0f)
            for (i in 0 until count) {
                val xMid = i * actualW + actualW / 2f
                val xNext = (i + 1) * actualW
                lineTo(xMid, size.height)
                lineTo(xNext, 0f)
            }
            close()
        }
        drawPath(path, color = color)
    }
}
