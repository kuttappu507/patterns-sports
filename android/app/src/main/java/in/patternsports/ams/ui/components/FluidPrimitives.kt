package `in`.patternsports.ams.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import `in`.patternsports.ams.ui.motion.fluidPressable
import `in`.patternsports.ams.ui.theme.CourtIcon
import `in`.patternsports.ams.ui.theme.CourtVectorIcon
import `in`.patternsports.ams.ui.theme.SorbetTheme

// ============================================================
// PS-AMS :: Zero-Material Modern Executive UI Component Kit
// Built strictly on androidx.compose.foundation & ui
// ============================================================

@Composable
fun FluidGlassCard(
    modifier: Modifier = Modifier,
    cornerRadius: Dp = 16.dp,
    accentStripeColor: Color? = null,
    onClick: (() -> Unit)? = null,
    contentPadding: Dp = 16.dp,
    content: @Composable ColumnScope.() -> Unit,
) {
    val colors = SorbetTheme.colors
    val shape = RoundedCornerShape(cornerRadius)
    val pressMod = if (onClick != null) {
        Modifier.fluidPressable(onClick = onClick)
    } else {
        Modifier
    }

    Column(
        modifier = modifier
            .then(pressMod)
            .shadow(
                elevation = if (colors.isDark) 0.dp else 3.dp,
                shape = shape,
                ambientColor = colors.inkPrimary.copy(alpha = 0.05f),
                spotColor = colors.inkPrimary.copy(alpha = 0.06f),
            )
            .clip(shape)
            .background(colors.courtCardGradient, shape)
            .border(1.dp, colors.borderSubtle, shape),
    ) {
        if (accentStripeColor != null) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(3.dp)
                    .background(accentStripeColor)
            )
        }
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(contentPadding),
            content = content,
        )
    }
}

@Composable
fun FluidPrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: CourtIcon? = null,
    enabled: Boolean = true,
    accentBrush: Brush? = null,
) {
    val colors = SorbetTheme.colors
    val typo = SorbetTheme.typography
    val shape = RoundedCornerShape(10.dp)
    val brush = accentBrush ?: Brush.horizontalGradient(
        listOf(colors.primaryRose, colors.primaryRoseDeep)
    )

    Row(
        modifier = modifier
            .fluidPressable(enabled = enabled, onClick = onClick)
            .clip(shape)
            .background(
                brush = if (enabled) brush else SolidColor(colors.borderSubtle),
                shape = shape,
            )
            .padding(horizontal = 12.dp, vertical = 9.5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        if (icon != null) {
            CourtVectorIcon(icon = icon, tint = Color.White, size = 15.dp)
            Spacer(modifier = Modifier.width(6.dp))
        }
        BasicText(
            text = text,
            style = typo.bodyBold.copy(color = if (enabled) Color.White else colors.inkMuted),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
fun FluidSecondaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: CourtIcon? = null,
    tintColor: Color? = null,
) {
    val colors = SorbetTheme.colors
    val typo = SorbetTheme.typography
    val fg = tintColor ?: colors.inkPrimary
    val shape = RoundedCornerShape(10.dp)

    Row(
        modifier = modifier
            .fluidPressable(onClick = onClick)
            .clip(shape)
            .background(colors.bgElevated, shape)
            .border(1.dp, colors.borderStrong.copy(alpha = 0.75f), shape)
            .padding(horizontal = 11.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        if (icon != null) {
            CourtVectorIcon(icon = icon, tint = fg, size = 15.dp)
            Spacer(modifier = Modifier.width(5.dp))
        }
        BasicText(
            text = text,
            style = typo.bodyBold.copy(color = fg),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
fun FluidIconOrbButton(
    icon: CourtIcon,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    tint: Color = SorbetTheme.colors.inkPrimary,
    containerColor: Color = SorbetTheme.colors.bgSubtle,
    size: Dp = 36.dp,
) {
    val shape = RoundedCornerShape(10.dp)
    Box(
        modifier = modifier
            .size(size)
            .fluidPressable(scaleDown = 0.94f, onClick = onClick)
            .clip(shape)
            .background(containerColor, shape)
            .border(1.dp, SorbetTheme.colors.borderSubtle, shape),
        contentAlignment = Alignment.Center,
    ) {
        CourtVectorIcon(icon = icon, tint = tint, size = size * 0.48f)
    }
}

@Composable
fun FluidTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    placeholder: String = "",
    keyboardType: KeyboardType = KeyboardType.Text,
    singleLine: Boolean = true,
) {
    val colors = SorbetTheme.colors
    val typo = SorbetTheme.typography
    var focused by remember { mutableStateOf(false) }
    val borderColor by animateColorAsState(
        targetValue = if (focused) colors.primaryRose else colors.borderStrong.copy(alpha = 0.7f),
        label = "tfBorder",
    )
    val shape = RoundedCornerShape(10.dp)

    Column(modifier = modifier) {
        if (label.isNotEmpty()) {
            BasicText(
                text = label.uppercase(),
                style = typo.microCaps.copy(color = if (focused) colors.primaryRose else colors.inkSecondary),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(bottom = 4.dp),
            )
        }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(shape)
                .background(colors.bgElevated, shape)
                .border(if (focused) 1.5.dp else 1.dp, borderColor, shape)
                .padding(horizontal = 11.dp, vertical = 9.5.dp),
            contentAlignment = Alignment.CenterStart,
        ) {
            if (value.isEmpty() && placeholder.isNotEmpty()) {
                BasicText(
                    text = placeholder,
                    style = typo.body.copy(color = colors.inkMuted),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            BasicTextField(
                value = value,
                onValueChange = onValueChange,
                singleLine = singleLine,
                textStyle = typo.body.copy(color = colors.inkPrimary),
                cursorBrush = SolidColor(colors.primaryRose),
                keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
                modifier = Modifier
                    .fillMaxWidth()
                    .onFocusChanged { focused = it.isFocused },
            )
        }
    }
}

/**
 * Executive Dropdown Select (Zero-Material) matching the PC app's `<Select>` trigger & popover.
 */
@Composable
fun FluidDropdownSelect(
    options: List<Pair<String, String>>, // (key, label)
    selectedKey: String,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
    label: String = "",
    placeholder: String = "Select…",
) {
    val colors = SorbetTheme.colors
    val typo = SorbetTheme.typography
    var expanded by remember { mutableStateOf(false) }
    val selectedLabel = options.firstOrNull { it.first == selectedKey }?.second ?: placeholder
    val isFiltered = selectedKey != "ALL" && selectedKey != "all" && selectedKey.isNotEmpty()

    val borderColor by animateColorAsState(
        targetValue = when {
            expanded -> colors.primaryRose
            isFiltered -> colors.primaryRose.copy(alpha = 0.55f)
            else -> colors.borderStrong.copy(alpha = 0.75f)
        },
        label = "dropdownBorder",
    )
    val chevronRotation by animateFloatAsState(
        targetValue = if (expanded) -90f else 90f,
        label = "chevronRot",
    )
    val shape = RoundedCornerShape(10.dp)

    Column(modifier = modifier) {
        if (label.isNotEmpty()) {
            BasicText(
                text = label.uppercase(),
                style = typo.microCaps.copy(color = if (expanded || isFiltered) colors.primaryRose else colors.inkSecondary),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(bottom = 4.dp),
            )
        }
        Box {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .fluidPressable(scaleDown = 0.98f, onClick = { expanded = !expanded })
                    .clip(shape)
                    .background(
                        if (isFiltered) colors.primaryRoseSoft.copy(alpha = 0.45f) else colors.bgElevated,
                        shape
                    )
                    .border(if (expanded) 1.5.dp else 1.dp, borderColor, shape)
                    .padding(horizontal = 11.dp, vertical = 9.5.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                BasicText(
                    text = selectedLabel,
                    style = typo.caption.copy(
                        color = if (isFiltered) colors.primaryRose else colors.inkPrimary,
                        fontWeight = if (isFiltered) FontWeight.SemiBold else FontWeight.Medium,
                    ),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Spacer(modifier = Modifier.width(6.dp))
                Box(
                    modifier = Modifier.graphicsLayer { rotationZ = chevronRotation }
                ) {
                    CourtVectorIcon(
                        icon = CourtIcon.CHEVRON_RIGHT,
                        tint = if (expanded || isFiltered) colors.primaryRose else colors.inkMuted,
                        size = 14.dp,
                    )
                }
            }

            if (expanded) {
                Popup(
                    alignment = Alignment.TopStart,
                    offset = IntOffset(0, 110),
                    onDismissRequest = { expanded = false },
                    properties = PopupProperties(focusable = true),
                ) {
                    val menuScroll = rememberScrollState()
                    val menuShape = RoundedCornerShape(12.dp)
                    Column(
                        modifier = Modifier
                            .widthIn(min = 180.dp, max = 280.dp)
                            .heightIn(max = 260.dp)
                            .shadow(14.dp, menuShape)
                            .clip(menuShape)
                            .background(colors.bgElevated, menuShape)
                            .border(1.dp, colors.borderStrong, menuShape)
                            .verticalScroll(menuScroll)
                            .padding(6.dp),
                        verticalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        for ((optKey, optLabel) in options) {
                            val active = optKey == selectedKey
                            val itemShape = RoundedCornerShape(8.dp)
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .fluidPressable(
                                        scaleDown = 0.98f,
                                        onClick = {
                                            onSelect(optKey)
                                            expanded = false
                                        }
                                    )
                                    .clip(itemShape)
                                    .background(
                                        if (active) colors.primaryRoseSoft else Color.Transparent,
                                        itemShape
                                    )
                                    .padding(horizontal = 10.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                BasicText(
                                    text = optLabel,
                                    style = typo.body.copy(
                                        color = if (active) colors.primaryRose else colors.inkPrimary,
                                        fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal,
                                    ),
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier.weight(1f),
                                )
                                if (active) {
                                    Spacer(modifier = Modifier.width(8.dp))
                                    CourtVectorIcon(
                                        icon = CourtIcon.CHECK,
                                        tint = colors.primaryRose,
                                        size = 14.dp,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun FluidSearchBar(
    query: String,
    onQueryChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
) {
    val colors = SorbetTheme.colors
    val typo = SorbetTheme.typography
    var focused by remember { mutableStateOf(false) }
    val shape = RoundedCornerShape(10.dp)
    val borderColor by animateColorAsState(
        targetValue = if (focused) colors.primaryRose else colors.borderStrong.copy(alpha = 0.7f),
        label = "searchBorder",
    )

    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .background(colors.bgElevated, shape)
            .border(1.dp, borderColor, shape)
            .padding(horizontal = 12.dp, vertical = 9.5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CourtVectorIcon(
            icon = CourtIcon.SEARCH,
            tint = if (focused) colors.primaryRose else colors.inkMuted,
            size = 16.dp,
        )
        Spacer(modifier = Modifier.width(9.dp))
        Box(modifier = Modifier.weight(1f)) {
            if (query.isEmpty()) {
                BasicText(
                    text = placeholder,
                    style = typo.body.copy(color = colors.inkMuted),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            BasicTextField(
                value = query,
                onValueChange = onQueryChange,
                singleLine = true,
                textStyle = typo.body.copy(color = colors.inkPrimary),
                cursorBrush = SolidColor(colors.primaryRose),
                modifier = Modifier
                    .fillMaxWidth()
                    .onFocusChanged { focused = it.isFocused },
            )
        }
        if (query.isNotEmpty()) {
            Spacer(modifier = Modifier.width(8.dp))
            Box(
                modifier = Modifier
                    .size(22.dp)
                    .fluidPressable(onClick = { onQueryChange("") })
                    .clip(CircleShape)
                    .background(colors.bgSubtle, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                CourtVectorIcon(icon = CourtIcon.CLOSE, tint = colors.inkSecondary, size = 12.dp)
            }
        }
    }
}

@Composable
fun FluidChipRow(
    options: List<Pair<String, String>>, // (key, label)
    selectedKey: String,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = SorbetTheme.colors
    val typo = SorbetTheme.typography
    val scroll = rememberScrollState()

    Row(
        modifier = modifier
            .fillMaxWidth()
            .horizontalScroll(scroll),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        for ((key, label) in options) {
            val active = key == selectedKey
            val bg by animateColorAsState(
                targetValue = if (active) colors.primaryRose else colors.bgElevated,
                label = "chipBg",
            )
            val fg by animateColorAsState(
                targetValue = if (active) Color.White else colors.inkSecondary,
                label = "chipFg",
            )
            val shape = RoundedCornerShape(8.dp)
            Box(
                modifier = Modifier
                    .fluidPressable(scaleDown = 0.95f, onClick = { onSelect(key) })
                    .clip(shape)
                    .background(bg, shape)
                    .border(
                        width = 1.dp,
                        color = if (active) colors.primaryRose else colors.borderSubtle,
                        shape = shape,
                    )
                    .padding(horizontal = 12.dp, vertical = 6.5.dp),
                contentAlignment = Alignment.Center,
            ) {
                BasicText(
                    text = label,
                    style = typo.caption.copy(
                        color = fg,
                        fontWeight = if (active) FontWeight.SemiBold else FontWeight.Medium,
                    ),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
fun FluidToneBadge(
    text: String,
    tone: String, // "emerald" | "amber" | "rose" | "cyan" | "slate"
    modifier: Modifier = Modifier,
) {
    val colors = SorbetTheme.colors
    val typo = SorbetTheme.typography
    val (fg, bg) = when (tone) {
        "emerald" -> colors.accentTeal to colors.accentTealSoft
        "amber" -> colors.accentAmber to colors.accentAmberSoft
        "rose" -> colors.primaryRose to colors.primaryRoseSoft
        "cyan" -> colors.accentCyan to colors.accentCyanSoft
        else -> colors.inkSecondary to colors.bgSubtle
    }
    val shape = RoundedCornerShape(6.dp)
    Box(
        modifier = modifier
            .clip(shape)
            .background(bg, shape)
            .border(1.dp, fg.copy(alpha = 0.28f), shape)
            .padding(horizontal = 8.dp, vertical = 3.dp),
        contentAlignment = Alignment.Center,
    ) {
        BasicText(
            text = text,
            style = typo.caption.copy(color = fg, fontWeight = FontWeight.SemiBold),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
fun FluidProgressBar(
    fraction: Float,
    color: Color,
    modifier: Modifier = Modifier,
    height: Dp = 7.dp,
) {
    val colors = SorbetTheme.colors
    val animatedFraction by animateFloatAsState(
        targetValue = fraction.coerceIn(0f, 1f),
        animationSpec = spring(dampingRatio = 0.85f, stiffness = Spring.StiffnessMediumLow),
        label = "progressFill",
    )
    val shape = RoundedCornerShape(50)
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(height)
            .clip(shape)
            .background(colors.bgSubtle, shape)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth(animatedFraction.coerceAtLeast(0.02f))
                .fillMaxHeight()
                .clip(shape)
                .background(color, shape)
        )
    }
}

@Composable
fun FluidModalSheet(
    title: String,
    subtitle: String? = null,
    onDismiss: () -> Unit,
    content: @Composable ColumnScope.() -> Unit,
) {
    val colors = SorbetTheme.colors
    val typo = SorbetTheme.typography
    val scroll = rememberScrollState()

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            dismissOnBackPress = true,
            dismissOnClickOutside = false,
        ),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xFF020817).copy(alpha = 0.76f))
                .padding(horizontal = 12.dp, vertical = 20.dp),
            contentAlignment = Alignment.Center,
        ) {
            FluidGlassCard(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 740.dp),
                cornerRadius = 18.dp,
                accentStripeColor = colors.primaryRose,
                contentPadding = 16.dp,
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        BasicText(
                            text = title,
                            style = typo.h2.copy(color = colors.inkPrimary),
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                        if (!subtitle.isNullOrBlank()) {
                            Spacer(modifier = Modifier.height(2.dp))
                            BasicText(
                                text = subtitle,
                                style = typo.caption.copy(color = colors.inkSecondary),
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    FluidIconOrbButton(
                        icon = CourtIcon.CLOSE,
                        onClick = onDismiss,
                        size = 32.dp,
                    )
                }
                Spacer(modifier = Modifier.height(12.dp))
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .verticalScroll(scroll),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    content = content,
                )
            }
        }
    }
}

@Composable
fun FluidConfirmDialog(
    title: String,
    message: String,
    confirmText: String = "Delete Permanently",
    cancelText: String = "Cancel",
    icon: CourtIcon = CourtIcon.TRASH,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    val colors = SorbetTheme.colors
    val typo = SorbetTheme.typography

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            dismissOnBackPress = true,
            dismissOnClickOutside = true,
        ),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xFF020817).copy(alpha = 0.78f))
                .padding(horizontal = 18.dp, vertical = 24.dp),
            contentAlignment = Alignment.Center,
        ) {
            FluidGlassCard(
                modifier = Modifier
                    .fillMaxWidth()
                    .widthIn(max = 420.dp),
                cornerRadius = 18.dp,
                accentStripeColor = colors.dangerRed,
                contentPadding = 18.dp,
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        modifier = Modifier
                            .size(40.dp)
                            .clip(RoundedCornerShape(11.dp))
                            .background(colors.dangerRed.copy(alpha = 0.14f), RoundedCornerShape(11.dp))
                            .border(1.dp, colors.dangerRed.copy(alpha = 0.35f), RoundedCornerShape(11.dp)),
                        contentAlignment = Alignment.Center,
                    ) {
                        CourtVectorIcon(
                            icon = icon,
                            tint = colors.dangerRed,
                            size = 18.dp,
                        )
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        BasicText(
                            text = title,
                            style = typo.h2.copy(
                                color = colors.inkPrimary,
                                fontWeight = FontWeight.Bold,
                            ),
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                        BasicText(
                            text = "Confirmation required",
                            style = typo.caption.copy(
                                color = colors.dangerRed,
                                fontWeight = FontWeight.SemiBold,
                            ),
                            maxLines = 1,
                        )
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))
                BasicText(
                    text = message,
                    style = typo.body.copy(color = colors.inkSecondary),
                )

                Spacer(modifier = Modifier.height(18.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    FluidSecondaryButton(
                        text = cancelText,
                        onClick = onDismiss,
                        modifier = Modifier.weight(1f),
                    )
                    FluidDangerButton(
                        text = confirmText,
                        icon = icon,
                        onClick = onConfirm,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}

@Composable
fun FluidDangerButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: CourtIcon? = null,
) {
    val colors = SorbetTheme.colors
    val typo = SorbetTheme.typography
    val shape = RoundedCornerShape(10.dp)

    Row(
        modifier = modifier
            .fluidPressable(onClick = onClick)
            .shadow(
                elevation = 5.dp,
                shape = shape,
                ambientColor = colors.dangerRed.copy(alpha = 0.35f),
                spotColor = colors.dangerRed.copy(alpha = 0.45f),
            )
            .clip(shape)
            .background(colors.dangerRed, shape)
            .border(1.dp, Color.White.copy(alpha = 0.22f), shape)
            .padding(horizontal = 14.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) {
            CourtVectorIcon(
                icon = icon,
                tint = Color.White,
                size = 15.dp,
            )
            Spacer(modifier = Modifier.width(6.dp))
        }
        BasicText(
            text = text,
            style = typo.bodyBold.copy(
                color = Color.White,
                fontWeight = FontWeight.SemiBold,
            ),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
