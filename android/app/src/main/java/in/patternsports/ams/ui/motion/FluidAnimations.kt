package `in`.patternsports.ams.ui.motion

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.TextStyle
import `in`.patternsports.ams.domain.DomainEngine
import `in`.patternsports.ams.ui.theme.SorbetTheme
import kotlinx.coroutines.delay
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin

// ============================================================
// PS-AMS :: Modern Executive Motion, Ambient Backdrop & Spring Physics
// ============================================================

/**
 * Subtle ambient mesh backdrop matching the PC app's porcelain/slate canvas.
 */
@Composable
fun FluidAuroraBackdrop(
    modifier: Modifier = Modifier,
) {
    val colors = SorbetTheme.colors
    val infinite = rememberInfiniteTransition(label = "ambientMesh")
    val phase by infinite.animateFloat(
        initialValue = 0f,
        targetValue = (2f * PI).toFloat(),
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 28000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "meshPhase",
    )

    Canvas(modifier = modifier.fillMaxSize()) {
        val w = size.width
        val h = size.height

        drawRect(color = colors.bgCanvas)

        val orb1Center = Offset(
            x = w * (0.18f + 0.06f * cos(phase)),
            y = h * (0.10f + 0.04f * sin(phase)),
        )
        val orb2Center = Offset(
            x = w * (0.85f + 0.05f * sin(phase * 0.7f)),
            y = h * (0.24f + 0.05f * cos(phase * 0.7f)),
        )

        val alphaMul = if (colors.isDark) 0.09f else 0.055f

        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(colors.primaryRose.copy(alpha = alphaMul), Color.Transparent),
                center = orb1Center,
                radius = w * 0.7f,
            ),
            radius = w * 0.7f,
            center = orb1Center,
        )
        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(colors.accentCyan.copy(alpha = alphaMul * 0.8f), Color.Transparent),
                center = orb2Center,
                radius = w * 0.65f,
            ),
            radius = w * 0.65f,
            center = orb2Center,
        )
    }
}

/**
 * Clean, responsive spring press modifier (no 3D tilt distortion, zero Material ripple).
 */
@Composable
fun Modifier.fluidPressable(
    enabled: Boolean = true,
    scaleDown: Float = 0.975f,
    onClick: () -> Unit,
): Modifier {
    if (!enabled) return this
    var pressed by remember { mutableStateOf(false) }

    val scale by animateFloatAsState(
        targetValue = if (pressed) scaleDown else 1f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioNoBouncy,
            stiffness = Spring.StiffnessMedium,
        ),
        label = "pressScale",
    )

    return this
        .graphicsLayer {
            scaleX = scale
            scaleY = scale
        }
        .pointerInput(enabled, onClick) {
            detectTapGestures(
                onPress = {
                    pressed = true
                    val released = tryAwaitRelease()
                    pressed = false
                    if (released) {
                        onClick()
                    }
                }
            )
        }
}

/**
 * Smooth, professional staggered entrance for section blocks.
 */
@Composable
fun StaggeredFluidEntrance(
    index: Int,
    modifier: Modifier = Modifier,
    baseDelayMs: Long = 22L,
    content: @Composable () -> Unit,
) {
    val progress = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        delay((index.coerceIn(0, 10)) * baseDelayMs)
        progress.animateTo(
            targetValue = 1f,
            animationSpec = tween(durationMillis = 240, easing = FastOutSlowInEasing),
        )
    }
    val p = progress.value
    Box(
        modifier = modifier.graphicsLayer {
            alpha = p.coerceIn(0f, 1f)
            translationY = (1f - p) * 12f
        }
    ) {
        content()
    }
}

/**
 * Animated count-up integer or INR currency text.
 */
@Composable
fun FluidCountUpText(
    targetValue: Double,
    style: TextStyle,
    modifier: Modifier = Modifier,
    isCurrency: Boolean = false,
    suffix: String = "",
) {
    val anim = remember { Animatable(0f) }
    LaunchedEffect(targetValue) {
        anim.animateTo(
            targetValue = targetValue.toFloat(),
            animationSpec = tween(durationMillis = 520, easing = FastOutSlowInEasing),
        )
    }
    val current = anim.value.toDouble()
    val text = if (isCurrency) {
        DomainEngine.formatINR(current.roundToInt().toDouble()) + suffix
    } else {
        "${current.roundToInt()}$suffix"
    }
    BasicText(
        text = text,
        style = style,
        modifier = modifier,
    )
}

/**
 * Subtle top-edge radial glow pulse on action completion (no cartoon confetti circles).
 */
@Composable
fun CelebrationBurstOverlay(
    triggerCount: Int,
    modifier: Modifier = Modifier,
) {
    if (triggerCount <= 0) return
    val progress = remember(triggerCount) { Animatable(0f) }
    LaunchedEffect(triggerCount) {
        progress.snapTo(0f)
        progress.animateTo(
            targetValue = 1f,
            animationSpec = tween(durationMillis = 750, easing = FastOutSlowInEasing),
        )
    }
    val p = progress.value
    if (p >= 0.99f) return

    Canvas(modifier = modifier.fillMaxSize()) {
        val alpha = (1f - p) * 0.16f
        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(Color(0xFF06D6A0).copy(alpha = alpha), Color.Transparent),
                center = Offset(size.width / 2f, size.height * 0.15f),
                radius = size.width * (0.4f + p * 0.5f),
            ),
            radius = size.width * (0.4f + p * 0.5f),
            center = Offset(size.width / 2f, size.height * 0.15f),
        )
    }
}
