package `in`.patternsports.ams.ui.theme

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

// ============================================================
// PS-AMS :: Precision 24×24 Lucide-Grade Vector Icons
// Zero Material Icons dependency — exact 24×24 grid geometry
// matching the PC app's Lucide icon set
// ============================================================

enum class CourtIcon {
    VOLLEYBALL,
    DASHBOARD,
    PLAYERS,
    FEES_RUPEE,
    ATTENDANCE,
    REPORTS,
    SETTINGS,
    PLUS,
    SEARCH,
    PRINTER,
    WHATSAPP,
    DOWNLOAD,
    UPLOAD,
    TRASH,
    EDIT,
    TROPHY,
    CALENDAR,
    SUN,
    MOON,
    CHEVRON_RIGHT,
    CHEVRON_LEFT,
    CLOSE,
    FILTER,
    PHONE,
    SHIELD,
    SPARKLES,
    CAMERA,
    HEART_PULSE,
    CHECK,
}

@Composable
fun CourtVectorIcon(
    icon: CourtIcon,
    tint: Color,
    modifier: Modifier = Modifier,
    size: Dp = 20.dp,
    strokeWidthDp: Dp = 1.85.dp,
) {
    Canvas(modifier = modifier.size(size)) {
        val w = this.size.width
        val h = this.size.height
        val sw = strokeWidthDp.toPx()
        val stroke = Stroke(width = sw, cap = StrokeCap.Round, join = StrokeJoin.Round)

        // Coordinate helpers on a canonical 24x24 Lucide grid
        fun x(v: Float): Float = (v / 24f) * w
        fun y(v: Float): Float = (v / 24f) * h
        fun pt(vx: Float, vy: Float): Offset = Offset(x(vx), y(vy))

        when (icon) {
            // Lucide `Volleyball` (clean 24x24 spherical seam geometry)
            CourtIcon.VOLLEYBALL -> {
                drawCircle(color = tint, radius = x(9.5f), center = pt(12f, 12f), style = stroke)
                val p = Path().apply {
                    // Center top to bottom-left seam
                    moveTo(x(12f), y(2.5f))
                    cubicTo(x(10.2f), y(6.5f), x(10.2f), y(11.5f), x(12f), y(12f))
                    // Center to bottom-right seam
                    moveTo(x(12f), y(12f))
                    cubicTo(x(15.5f), y(10.2f), x(19.2f), y(11.8f), x(21.2f), y(14.5f))
                    // Center to bottom-left outer seam
                    moveTo(x(12f), y(12f))
                    cubicTo(x(8.5f), y(14.2f), x(5.8f), y(17.5f), x(6.2f), y(20.2f))
                    // Upper curved panel seam
                    moveTo(x(4.2f), y(7.2f))
                    cubicTo(x(8.5f), y(5.5f), x(14.8f), y(5.8f), x(19.5f), y(7.5f))
                    // Lower curved panel seam
                    moveTo(x(3.2f), y(14.2f))
                    cubicTo(x(7.5f), y(16.8f), x(14.5f), y(17.2f), x(19.2f), y(18.2f))
                }
                drawPath(p, tint, style = stroke)
            }

            // Lucide `LayoutDashboard` (asymmetric 4-panel masonry grid)
            CourtIcon.DASHBOARD -> {
                val r = CornerRadius(x(1.8f), y(1.8f))
                drawRoundRect(tint, pt(3f, 3f), Size(x(7f), y(9f)), r, stroke)
                drawRoundRect(tint, pt(14f, 3f), Size(x(7f), y(5f)), r, stroke)
                drawRoundRect(tint, pt(14f, 12f), Size(x(7f), y(9f)), r, stroke)
                drawRoundRect(tint, pt(3f, 16f), Size(x(7f), y(5f)), r, stroke)
            }

            // Lucide `Users` (primary user + secondary user silhouette)
            CourtIcon.PLAYERS -> {
                // Primary head
                drawCircle(tint, radius = x(4f), center = pt(9f, 7f), style = stroke)
                // Primary shoulders
                val p = Path().apply {
                    moveTo(x(2f), y(21f))
                    lineTo(x(2f), y(19f))
                    cubicTo(x(2f), y(16.8f), x(3.8f), y(15f), x(6f), y(15f))
                    lineTo(x(12f), y(15f))
                    cubicTo(x(14.2f), y(15f), x(16f), y(16.8f), x(16f), y(19f))
                    lineTo(x(16f), y(21f))
                    // Secondary head arc
                    moveTo(x(16f), y(3.13f))
                    cubicTo(x(17.7f), y(3.6f), x(19f), y(5.15f), x(19f), y(7f))
                    cubicTo(x(19f), y(8.85f), x(17.7f), y(10.4f), x(16f), y(10.87f))
                    // Secondary shoulder arc
                    moveTo(x(22f), y(21f))
                    lineTo(x(22f), y(19f))
                    cubicTo(x(22f), y(17.1f), x(20.7f), y(15.5f), x(19f), y(15.13f))
                }
                drawPath(p, tint, style = stroke)
            }

            // Lucide `ReceiptIndianRupee` (clean Indian Rupee symbol ₹)
            CourtIcon.FEES_RUPEE -> {
                val p = Path().apply {
                    moveTo(x(6f), y(4f))
                    lineTo(x(18f), y(4f))
                    moveTo(x(6f), y(9f))
                    lineTo(x(18f), y(9f))
                    moveTo(x(9.5f), y(4f))
                    cubicTo(x(13.2f), y(4f), x(15.5f), y(6.2f), x(15.5f), y(9f))
                    cubicTo(x(15.5f), y(11.8f), x(13.2f), y(14f), x(9.5f), y(14f))
                    lineTo(x(6f), y(14f))
                    lineTo(x(15f), y(20.5f))
                }
                drawPath(p, tint, style = stroke)
            }

            // Lucide `ClipboardCheck` (clipboard with top clip + checkmark)
            CourtIcon.ATTENDANCE -> {
                drawRoundRect(
                    color = tint,
                    topLeft = pt(8f, 2f),
                    size = Size(x(8f), y(4f)),
                    cornerRadius = CornerRadius(x(1.2f), y(1.2f)),
                    style = stroke,
                )
                val p = Path().apply {
                    moveTo(x(16f), y(4f))
                    lineTo(x(18f), y(4f))
                    cubicTo(x(19.1f), y(4f), x(20f), y(4.9f), x(20f), y(6f))
                    lineTo(x(20f), y(20f))
                    cubicTo(x(20f), y(21.1f), x(19.1f), y(22f), x(18f), y(22f))
                    lineTo(x(6f), y(22f))
                    cubicTo(x(4.9f), y(22f), x(4f), y(21.1f), x(4f), y(20f))
                    lineTo(x(4f), y(6f))
                    cubicTo(x(4f), y(4.9f), x(4.9f), y(4f), x(6f), y(4f))
                    lineTo(x(8f), y(4f))
                    // Checkmark
                    moveTo(x(9f), y(14f))
                    lineTo(x(11f), y(16f))
                    lineTo(x(15.5f), y(11.5f))
                }
                drawPath(p, tint, style = stroke)
            }

            // Lucide `FileSearch` / `BarChart3` (executive analytics frame)
            CourtIcon.REPORTS -> {
                drawRoundRect(
                    color = tint,
                    topLeft = pt(3f, 3f),
                    size = Size(x(18f), y(18f)),
                    cornerRadius = CornerRadius(x(2.2f), y(2.2f)),
                    style = stroke,
                )
                drawLine(tint, pt(8f, 16f), pt(8f, 12f), strokeWidth = sw, cap = StrokeCap.Round)
                drawLine(tint, pt(12f, 16f), pt(12f, 8f), strokeWidth = sw, cap = StrokeCap.Round)
                drawLine(tint, pt(16f, 16f), pt(16f, 10.5f), strokeWidth = sw, cap = StrokeCap.Round)
            }

            // Lucide `Settings2` (horizontal control sliders — matches PC app Settings2!)
            CourtIcon.SETTINGS -> {
                drawLine(tint, pt(20f, 7f), pt(11f, 7f), strokeWidth = sw, cap = StrokeCap.Round)
                drawLine(tint, pt(6f, 7f), pt(4f, 7f), strokeWidth = sw, cap = StrokeCap.Round)
                drawCircle(tint, radius = x(2.5f), center = pt(8.5f, 7f), style = stroke)

                drawLine(tint, pt(20f, 17f), pt(18f, 17f), strokeWidth = sw, cap = StrokeCap.Round)
                drawLine(tint, pt(13f, 17f), pt(4f, 17f), strokeWidth = sw, cap = StrokeCap.Round)
                drawCircle(tint, radius = x(2.5f), center = pt(15.5f, 17f), style = stroke)
            }

            // Lucide `Plus`
            CourtIcon.PLUS -> {
                drawLine(tint, pt(12f, 5f), pt(12f, 19f), strokeWidth = sw, cap = StrokeCap.Round)
                drawLine(tint, pt(5f, 12f), pt(19f, 12f), strokeWidth = sw, cap = StrokeCap.Round)
            }

            // Lucide `Search`
            CourtIcon.SEARCH -> {
                drawCircle(tint, radius = x(7.5f), center = pt(11f, 11f), style = stroke)
                drawLine(tint, pt(16.65f, 16.65f), pt(21f, 21f), strokeWidth = sw, cap = StrokeCap.Round)
            }

            // Lucide `Printer`
            CourtIcon.PRINTER -> {
                val p = Path().apply {
                    // Top paper feed
                    moveTo(x(6f), y(9f))
                    lineTo(x(6f), y(3f))
                    lineTo(x(18f), y(3f))
                    lineTo(x(18f), y(9f))
                    // Printer body
                    moveTo(x(6f), y(18f))
                    lineTo(x(4f), y(18f))
                    cubicTo(x(2.9f), y(18f), x(2f), y(17.1f), x(2f), y(16f))
                    lineTo(x(2f), y(11f))
                    cubicTo(x(2f), y(9.9f), x(2.9f), y(9f), x(4f), y(9f))
                    lineTo(x(20f), y(9f))
                    cubicTo(x(21.1f), y(9f), x(22f), y(9.9f), x(22f), y(11f))
                    lineTo(x(22f), y(16f))
                    cubicTo(x(22f), y(17.1f), x(21.1f), y(18f), x(20f), y(18f))
                    lineTo(x(18f), y(18f))
                }
                drawPath(p, tint, style = stroke)
                // Bottom paper sheet
                drawRoundRect(
                    color = tint,
                    topLeft = pt(6f, 14f),
                    size = Size(x(12f), y(7f)),
                    cornerRadius = CornerRadius(x(1f), y(1f)),
                    style = stroke,
                )
            }

            // Clean MessageCircle / WhatsApp Chat Icon
            CourtIcon.WHATSAPP -> {
                val p = Path().apply {
                    arcTo(
                        rect = Rect(x(3f), y(3f), x(21f), y(21f)),
                        startAngleDegrees = 140f,
                        sweepAngleDegrees = 310f,
                        forceMoveTo = true,
                    )
                    lineTo(x(3.5f), y(20.5f))
                    close()
                }
                drawPath(p, tint, style = stroke)
                val handset = Path().apply {
                    moveTo(x(9.2f), y(8.8f))
                    lineTo(x(10.8f), y(8.8f))
                    lineTo(x(11.4f), y(10.6f))
                    lineTo(x(10.3f), y(11.6f))
                    cubicTo(x(11.0f), y(12.8f), x(12.2f), y(13.8f), x(13.4f), y(14.3f))
                    lineTo(x(14.4f), y(13.2f))
                    lineTo(x(16.0f), y(13.8f))
                    lineTo(x(16.0f), y(15.2f))
                    cubicTo(x(12.2f), y(15.6f), x(8.8f), y(12.4f), x(9.2f), y(8.8f))
                }
                drawPath(handset, tint, style = stroke)
            }

            // Lucide `Download`
            CourtIcon.DOWNLOAD -> {
                val p = Path().apply {
                    moveTo(x(21f), y(15f))
                    lineTo(x(21f), y(19f))
                    cubicTo(x(21f), y(20.1f), x(20.1f), y(21f), x(19f), y(21f))
                    lineTo(x(5f), y(21f))
                    cubicTo(x(3.9f), y(21f), x(3f), y(20.1f), x(3f), y(19f))
                    lineTo(x(3f), y(15f))
                    moveTo(x(7f), y(10f))
                    lineTo(x(12f), y(15f))
                    lineTo(x(17f), y(10f))
                    moveTo(x(12f), y(15f))
                    lineTo(x(12f), y(3f))
                }
                drawPath(p, tint, style = stroke)
            }

            // Lucide `Upload`
            CourtIcon.UPLOAD -> {
                val p = Path().apply {
                    moveTo(x(21f), y(15f))
                    lineTo(x(21f), y(19f))
                    cubicTo(x(21f), y(20.1f), x(20.1f), y(21f), x(19f), y(21f))
                    lineTo(x(5f), y(21f))
                    cubicTo(x(3.9f), y(21f), x(3f), y(20.1f), x(3f), y(19f))
                    lineTo(x(3f), y(15f))
                    moveTo(x(17f), y(8f))
                    lineTo(x(12f), y(3f))
                    lineTo(x(7f), y(8f))
                    moveTo(x(12f), y(3f))
                    lineTo(x(12f), y(15f))
                }
                drawPath(p, tint, style = stroke)
            }

            // Lucide `Trash2`
            CourtIcon.TRASH -> {
                val p = Path().apply {
                    moveTo(x(3f), y(6f))
                    lineTo(x(21f), y(6f))
                    moveTo(x(19f), y(6f))
                    lineTo(x(19f), y(20f))
                    cubicTo(x(19f), y(21.1f), x(18.1f), y(22f), x(17f), y(22f))
                    lineTo(x(7f), y(22f))
                    cubicTo(x(5.9f), y(22f), x(5f), y(21.1f), x(5f), y(20f))
                    lineTo(x(5f), y(6f))
                    moveTo(x(8f), y(6f))
                    lineTo(x(8f), y(4f))
                    cubicTo(x(8f), y(2.9f), x(8.9f), y(2f), x(10f), y(2f))
                    lineTo(x(14f), y(2f))
                    cubicTo(x(15.1f), y(2f), x(16f), y(2.9f), x(16f), y(4f))
                    lineTo(x(16f), y(6f))
                    moveTo(x(10f), y(11f))
                    lineTo(x(10f), y(17f))
                    moveTo(x(14f), y(11f))
                    lineTo(x(14f), y(17f))
                }
                drawPath(p, tint, style = stroke)
            }

            // Lucide `Pencil`
            CourtIcon.EDIT -> {
                val p = Path().apply {
                    moveTo(x(17f), y(3f))
                    cubicTo(x(18.1f), y(1.9f), x(19.9f), y(1.9f), x(21f), y(3f))
                    cubicTo(x(22.1f), y(4.1f), x(22.1f), y(5.9f), x(21f), y(7f))
                    lineTo(x(7.5f), y(20.5f))
                    lineTo(x(2f), y(22f))
                    lineTo(x(3.5f), y(16.5f))
                    close()
                    moveTo(x(15f), y(5f))
                    lineTo(x(19f), y(9f))
                }
                drawPath(p, tint, style = stroke)
            }

            // Lucide `Trophy`
            CourtIcon.TROPHY -> {
                val p = Path().apply {
                    // Cup body
                    moveTo(x(6f), y(3f))
                    lineTo(x(18f), y(3f))
                    lineTo(x(18f), y(9f))
                    cubicTo(x(18f), y(12.3f), x(15.3f), y(15f), x(12f), y(15f))
                    cubicTo(x(8.7f), y(15f), x(6f), y(12.3f), x(6f), y(9f))
                    close()
                    // Left handle
                    moveTo(x(6f), y(5f))
                    lineTo(x(4f), y(5f))
                    cubicTo(x(2.9f), y(5f), x(2f), y(5.9f), x(2f), y(7f))
                    cubicTo(x(2f), y(9.2f), x(3.8f), y(11f), x(6f), y(11f))
                    // Right handle
                    moveTo(x(18f), y(5f))
                    lineTo(x(20f), y(5f))
                    cubicTo(x(21.1f), y(5f), x(22f), y(5.9f), x(22f), y(7f))
                    cubicTo(x(22f), y(9.2f), x(20.2f), y(11f), x(18f), y(11f))
                    // Stem & base
                    moveTo(x(12f), y(15f))
                    lineTo(x(12f), y(21f))
                    moveTo(x(7f), y(21f))
                    lineTo(x(17f), y(21f))
                }
                drawPath(p, tint, style = stroke)
            }

            // Lucide `Calendar`
            CourtIcon.CALENDAR -> {
                drawRoundRect(
                    color = tint,
                    topLeft = pt(3f, 4f),
                    size = Size(x(18f), y(18f)),
                    cornerRadius = CornerRadius(x(2f), y(2f)),
                    style = stroke,
                )
                drawLine(tint, pt(16f, 2f), pt(16f, 6f), strokeWidth = sw, cap = StrokeCap.Round)
                drawLine(tint, pt(8f, 2f), pt(8f, 6f), strokeWidth = sw, cap = StrokeCap.Round)
                drawLine(tint, pt(3f, 10f), pt(21f, 10f), strokeWidth = sw, cap = StrokeCap.Round)
            }

            // Lucide `Sun` (8 rays)
            CourtIcon.SUN -> {
                val c = pt(12f, 12f)
                drawCircle(tint, radius = x(4f), center = c, style = stroke)
                for (i in 0 until 8) {
                    val rad = (i * 45.0) * PI / 180.0
                    val r1 = x(7.2f)
                    val r2 = x(9.5f)
                    drawLine(
                        color = tint,
                        start = Offset(c.x + (cos(rad) * r1).toFloat(), c.y + (sin(rad) * r1).toFloat()),
                        end = Offset(c.x + (cos(rad) * r2).toFloat(), c.y + (sin(rad) * r2).toFloat()),
                        strokeWidth = sw,
                        cap = StrokeCap.Round,
                    )
                }
            }

            // Lucide `Moon`
            CourtIcon.MOON -> {
                val p = Path().apply {
                    moveTo(x(21f), y(12.79f))
                    cubicTo(x(20.4f), y(17.5f), x(16.2f), y(21f), x(11.21f), y(21f))
                    cubicTo(x(6.12f), y(21f), x(2f), y(16.88f), x(2f), y(11.79f))
                    cubicTo(x(2f), y(6.8f), x(5.5f), y(2.6f), x(10.21f), y(2f))
                    cubicTo(x(9.1f), y(3.6f), x(8.6f), y(5.6f), x(9f), y(7.7f))
                    cubicTo(x(9.7f), y(11.4f), x(12.6f), y(14.3f), x(16.3f), y(15f))
                    cubicTo(x(18.4f), y(15.4f), x(20.4f), y(14.9f), x(21f), y(12.79f))
                    close()
                }
                drawPath(p, tint, style = stroke)
            }

            // Lucide `ChevronRight`
            CourtIcon.CHEVRON_RIGHT -> {
                val p = Path().apply {
                    moveTo(x(9f), y(18f))
                    lineTo(x(15f), y(12f))
                    lineTo(x(9f), y(6f))
                }
                drawPath(p, tint, style = stroke)
            }

            // Lucide `ChevronLeft`
            CourtIcon.CHEVRON_LEFT -> {
                val p = Path().apply {
                    moveTo(x(15f), y(18f))
                    lineTo(x(9f), y(12f))
                    lineTo(x(15f), y(6f))
                }
                drawPath(p, tint, style = stroke)
            }

            // Lucide `X`
            CourtIcon.CLOSE -> {
                drawLine(tint, pt(18f, 6f), pt(6f, 18f), strokeWidth = sw, cap = StrokeCap.Round)
                drawLine(tint, pt(6f, 6f), pt(18f, 18f), strokeWidth = sw, cap = StrokeCap.Round)
            }

            // Lucide `Filter`
            CourtIcon.FILTER -> {
                val p = Path().apply {
                    moveTo(x(22f), y(3f))
                    lineTo(x(2f), y(3f))
                    lineTo(x(10f), y(12.46f))
                    lineTo(x(10f), y(19f))
                    lineTo(x(14f), y(21f))
                    lineTo(x(14f), y(12.46f))
                    close()
                }
                drawPath(p, tint, style = stroke)
            }

            // Lucide `Phone`
            CourtIcon.PHONE -> {
                val p = Path().apply {
                    moveTo(x(22f), y(16.92f))
                    lineTo(x(22f), y(19.92f))
                    cubicTo(x(22f), y(21.0f), x(21.1f), y(21.9f), x(20f), y(21.92f))
                    cubicTo(x(10.6f), y(21.1f), x(2.9f), y(13.4f), x(2.08f), y(4f))
                    cubicTo(x(2.1f), y(2.9f), x(3.0f), y(2f), x(4.08f), y(2f))
                    lineTo(x(7.08f), y(2f))
                    cubicTo(x(8.0f), y(2f), x(8.8f), y(2.7f), x(9.0f), y(3.6f))
                    lineTo(x(9.7f), y(7.2f))
                    cubicTo(x(9.85f), y(8.0f), x(9.5f), y(8.8f), x(8.8f), y(9.3f))
                    lineTo(x(7.1f), y(10.6f))
                    cubicTo(x(8.6f), y(13.5f), x(10.5f), y(15.4f), x(13.4f), y(16.9f))
                    lineTo(x(14.7f), y(15.2f))
                    cubicTo(x(15.2f), y(14.5f), x(16.0f), y(14.15f), x(16.8f), y(14.3f))
                    lineTo(x(20.4f), y(15.0f))
                    cubicTo(x(21.3f), y(15.2f), x(22f), y(16.0f), x(22f), y(16.92f))
                }
                drawPath(p, tint, style = stroke)
            }

            // Lucide `ShieldCheck`
            CourtIcon.SHIELD -> {
                val p = Path().apply {
                    moveTo(x(12f), y(22f))
                    cubicTo(x(12f), y(22f), x(20f), y(18f), x(20f), y(12f))
                    lineTo(x(20f), y(5f))
                    lineTo(x(12f), y(2f))
                    lineTo(x(4f), y(5f))
                    lineTo(x(4f), y(12f))
                    cubicTo(x(4f), y(18f), x(12f), y(22f), x(12f), y(22f))
                    close()
                    moveTo(x(9f), y(12f))
                    lineTo(x(11f), y(14f))
                    lineTo(x(15f), y(10f))
                }
                drawPath(p, tint, style = stroke)
            }

            // Lucide `Sparkles`
            CourtIcon.SPARKLES -> {
                val p = Path().apply {
                    moveTo(x(12f), y(3f))
                    lineTo(x(14.2f), y(8.8f))
                    lineTo(x(20f), y(11f))
                    lineTo(x(14.2f), y(13.2f))
                    lineTo(x(12f), y(19f))
                    lineTo(x(9.8f), y(13.2f))
                    lineTo(x(4f), y(11f))
                    lineTo(x(9.8f), y(8.8f))
                    close()
                    moveTo(x(19f), y(3f))
                    lineTo(x(19f), y(7f))
                    moveTo(x(17f), y(5f))
                    lineTo(x(21f), y(5f))
                }
                drawPath(p, tint, style = stroke)
            }

            // Lucide `Camera`
            CourtIcon.CAMERA -> {
                val p = Path().apply {
                    moveTo(x(14.5f), y(4f))
                    lineTo(x(9.5f), y(4f))
                    lineTo(x(7f), y(7f))
                    lineTo(x(4f), y(7f))
                    cubicTo(x(2.9f), y(7f), x(2f), y(7.9f), x(2f), y(9f))
                    lineTo(x(2f), y(18f))
                    cubicTo(x(2f), y(19.1f), x(2.9f), y(20f), x(4f), y(20f))
                    lineTo(x(20f), y(20f))
                    cubicTo(x(21.1f), y(20f), x(22f), y(19.1f), x(22f), y(18f))
                    lineTo(x(22f), y(9f))
                    cubicTo(x(22f), y(7.9f), x(21.1f), y(7f), x(20f), y(7f))
                    lineTo(x(17f), y(7f))
                    close()
                }
                drawPath(p, tint, style = stroke)
                drawCircle(tint, radius = x(3f), center = pt(12f, 13f), style = stroke)
            }

            // Lucide `Activity`
            CourtIcon.HEART_PULSE -> {
                val p = Path().apply {
                    moveTo(x(22f), y(12f))
                    lineTo(x(18f), y(12f))
                    lineTo(x(15f), y(21f))
                    lineTo(x(9f), y(3f))
                    lineTo(x(6f), y(12f))
                    lineTo(x(2f), y(12f))
                }
                drawPath(p, tint, style = stroke)
            }

            // Lucide `Check`
            CourtIcon.CHECK -> {
                val p = Path().apply {
                    moveTo(x(20f), y(6f))
                    lineTo(x(9f), y(17f))
                    lineTo(x(4f), y(12f))
                }
                drawPath(p, tint, style = stroke)
            }
        }
    }
}
