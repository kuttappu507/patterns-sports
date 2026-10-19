package `in`.patternsports.ams.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import `in`.patternsports.ams.domain.APP_VERSION
import `in`.patternsports.ams.ui.motion.StopMotionVolleyballOrb
import `in`.patternsports.ams.ui.motion.fluidPressable
import `in`.patternsports.ams.ui.theme.SorbetTheme
import kotlinx.coroutines.delay

// ============================================================
// PS-AMS :: Executive Academy Splash Screen
// 1:1 parity with src/components/psams/splash.tsx
// ============================================================

@Composable
fun SplashOverlay(
    visible: Boolean,
    academyName: String,
    tagline: String,
    onFinished: () -> Unit,
) {
    val progress = remember { Animatable(0f) }

    LaunchedEffect(visible) {
        if (visible) {
            progress.snapTo(0f)
            progress.animateTo(
                targetValue = 1f,
                animationSpec = tween(durationMillis = 1500, easing = FastOutSlowInEasing),
            )
            delay(120)
            onFinished()
        }
    }

    AnimatedVisibility(
        visible = visible,
        exit = fadeOut(animationSpec = tween(300)),
    ) {
        val colors = SorbetTheme.colors
        val typo = SorbetTheme.typography

        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        listOf(
                            Color(0xFF07222E),
                            Color(0xFF05161F),
                        )
                    )
                )
                .fluidPressable(scaleDown = 1f, onClick = onFinished),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                StopMotionVolleyballOrb(size = 76.dp)

                Spacer(modifier = Modifier.height(22.dp))

                Box(
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(Color.White.copy(alpha = 0.08f))
                        .border(1.dp, Color.White.copy(alpha = 0.16f), CircleShape)
                        .padding(horizontal = 14.dp, vertical = 5.dp),
                ) {
                    BasicText(
                        text = "PS-AMS v$APP_VERSION · SPORTS ACADEMY MANAGEMENT SUITE",
                        style = typo.microCaps.copy(color = Color(0xFFFFD166)),
                    )
                }

                Spacer(modifier = Modifier.height(14.dp))

                BasicText(
                    text = academyName,
                    style = typo.displayHero.copy(
                        color = Color.White,
                        textAlign = TextAlign.Center,
                    ),
                )

                Spacer(modifier = Modifier.height(6.dp))

                BasicText(
                    text = tagline,
                    style = typo.body.copy(
                        color = Color(0xFF94B8C7),
                        textAlign = TextAlign.Center,
                    ),
                )

                Spacer(modifier = Modifier.height(28.dp))

                FluidProgressBar(
                    fraction = progress.value,
                    color = colors.primaryRose,
                    modifier = Modifier.width(200.dp),
                    height = 5.dp,
                )

                Spacer(modifier = Modifier.height(12.dp))

                BasicText(
                    text = "OFFLINE SQLITE DATABASE READY · TAP TO CONTINUE",
                    style = typo.microCaps.copy(color = Color(0xFF648291)),
                )
            }
        }
    }
}
