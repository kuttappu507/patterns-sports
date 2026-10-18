package `in`.patternsports.ams.ui.screens

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import `in`.patternsports.ams.domain.AcademySettings
import `in`.patternsports.ams.domain.COMMITTEE_ROLES
import `in`.patternsports.ams.domain.CommitteeMember
import `in`.patternsports.ams.domain.CommitteeMemberInput
import `in`.patternsports.ams.domain.DomainEngine
import `in`.patternsports.ams.ui.components.FluidChipRow
import `in`.patternsports.ams.ui.components.FluidGlassCard
import `in`.patternsports.ams.ui.components.FluidIconOrbButton
import `in`.patternsports.ams.ui.components.FluidModalSheet
import `in`.patternsports.ams.ui.components.FluidPrimaryButton
import `in`.patternsports.ams.ui.components.FluidSecondaryButton
import `in`.patternsports.ams.ui.components.FluidTextField
import `in`.patternsports.ams.ui.components.FluidToneBadge
import `in`.patternsports.ams.ui.motion.StaggeredFluidEntrance
import `in`.patternsports.ams.ui.theme.CourtIcon
import `in`.patternsports.ams.ui.theme.SorbetTheme

// ============================================================
// PS-AMS :: Academy Letterhead, Committee & Database Vault
// 1:1 parity with src/components/psams/views/settings-view.tsx
// ============================================================

@Composable
fun SettingsScreen(
    settings: AcademySettings,
    committee: List<CommitteeMember>,
    hasDemoData: Boolean,
    onSaveSettings: (AcademySettings) -> Unit,
    onCreateCommittee: (CommitteeMemberInput) -> Unit,
    onUpdateCommittee: (String, CommitteeMemberInput) -> Unit,
    onDeleteCommittee: (String) -> Unit,
    onBackupDatabase: () -> Unit,
    onRestoreDatabase: (Uri) -> Unit,
    onExportJsonSnapshot: () -> Unit,
    onLoadDemoData: () -> Unit,
    onClearDemoData: (String) -> Unit, // "demo" | "all"
) {
    val colors = SorbetTheme.colors
    val typo = SorbetTheme.typography
    val scroll = rememberScrollState()

    var academyName by remember(settings) { mutableStateOf(settings.academyName) }
    var tagline by remember(settings) { mutableStateOf(settings.tagline) }
    var address by remember(settings) { mutableStateOf(settings.address) }
    var phone by remember(settings) { mutableStateOf(settings.phone) }
    var email by remember(settings) { mutableStateOf(settings.email) }
    var defaultFee by remember(settings) { mutableStateOf(settings.defaultMonthlyFee.toInt().toString()) }
    var signatory by remember(settings) { mutableStateOf(settings.receiptSignatory) }

    var editingMember by remember { mutableStateOf<CommitteeMember?>(null) }
    var showCommitteeModal by remember { mutableStateOf(false) }

    val restorePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) {
            onRestoreDatabase(uri)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(scroll)
            .padding(horizontal = 14.dp, vertical = 6.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        // 1. Academy Identity & Receipt Letterhead
        StaggeredFluidEntrance(index = 0) {
            FluidGlassCard(accentStripeColor = colors.primaryRose) {
                BasicText("Academy Identity & Receipt Letterhead", style = typo.h2.copy(color = colors.inkPrimary))
                BasicText(
                    "Printed on A4 profile cards, formal receipts, thermal slips & WhatsApp messages.",
                    style = typo.caption.copy(color = colors.inkSecondary),
                )
                Spacer(modifier = Modifier.height(12.dp))

                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    FluidTextField(value = academyName, onValueChange = { academyName = it }, label = "Academy Name")
                    FluidTextField(value = tagline, onValueChange = { tagline = it }, label = "Tagline / Motto")
                    FluidTextField(value = address, onValueChange = { address = it }, label = "Official Address")
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FluidTextField(
                            value = phone,
                            onValueChange = { phone = it },
                            label = "Contact Phone",
                            modifier = Modifier.weight(1f),
                        )
                        FluidTextField(
                            value = email,
                            onValueChange = { email = it },
                            label = "Email",
                            modifier = Modifier.weight(1f),
                        )
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FluidTextField(
                            value = defaultFee,
                            onValueChange = { defaultFee = DomainEngine.decimalOnly(it) },
                            label = "Default Monthly Fee (₹)",
                            keyboardType = KeyboardType.Number,
                            modifier = Modifier.weight(1f),
                        )
                        FluidTextField(
                            value = signatory,
                            onValueChange = { signatory = it },
                            label = "Receipt Signatory",
                            modifier = Modifier.weight(1f),
                        )
                    }

                    FluidPrimaryButton(
                        text = "Save Letterhead Settings",
                        icon = CourtIcon.CHECK,
                        modifier = Modifier.fillMaxWidth(),
                        onClick = {
                            onSaveSettings(
                                AcademySettings(
                                    academyName = academyName,
                                    tagline = tagline,
                                    address = address,
                                    phone = phone,
                                    email = email,
                                    defaultMonthlyFee = defaultFee.toDoubleOrNull() ?: 500.0,
                                    receiptSignatory = signatory,
                                )
                            )
                        },
                    )
                }
            }
        }

        // 2. Executive Committee Management
        StaggeredFluidEntrance(index = 1) {
            FluidGlassCard(accentStripeColor = colors.accentAmber) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column {
                        BasicText("Executive Committee (${committee.size})", style = typo.h2.copy(color = colors.inkPrimary))
                        BasicText("Office-bearers & governing responsibilities", style = typo.caption.copy(color = colors.inkSecondary))
                    }
                    FluidSecondaryButton(
                        text = "Add Member",
                        icon = CourtIcon.PLUS,
                        tintColor = colors.accentAmber,
                        onClick = {
                            editingMember = null
                            showCommitteeModal = true
                        },
                    )
                }

                Spacer(modifier = Modifier.height(10.dp))

                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    for (m in committee) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .background(colors.bgSubtle.copy(alpha = 0.6f))
                                .padding(horizontal = 12.dp, vertical = 9.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                ) {
                                    BasicText(m.fullName, style = typo.bodyBold.copy(color = colors.inkPrimary))
                                    FluidToneBadge(text = m.role, tone = "amber")
                                }
                                BasicText(
                                    text = "${m.phone}${m.responsibilities?.let { " • $it" } ?: ""}",
                                    style = typo.caption.copy(color = colors.inkSecondary),
                                )
                            }
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                FluidIconOrbButton(
                                    icon = CourtIcon.EDIT,
                                    size = 30.dp,
                                    onClick = {
                                        editingMember = m
                                        showCommitteeModal = true
                                    },
                                )
                                FluidIconOrbButton(
                                    icon = CourtIcon.TRASH,
                                    tint = colors.dangerRed,
                                    size = 30.dp,
                                    onClick = { onDeleteCommittee(m.id) },
                                )
                            }
                        }
                    }
                }
            }
        }

        // 3. Offline SQLite WAL Vault Backup & Atomic Restore
        StaggeredFluidEntrance(index = 2) {
            FluidGlassCard(accentStripeColor = colors.accentTeal) {
                BasicText("SQLite WAL Database Vault & Backup", style = typo.h2.copy(color = colors.inkPrimary))
                BasicText(
                    "Export a verified SQLite 3 database file (PRAGMA quick_check verified) or restore from an existing backup with automatic pre-restore safety snapshot.",
                    style = typo.caption.copy(color = colors.inkSecondary),
                )
                Spacer(modifier = Modifier.height(12.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    FluidPrimaryButton(
                        text = "Backup SQLite DB",
                        icon = CourtIcon.DOWNLOAD,
                        modifier = Modifier.weight(1f),
                        onClick = onBackupDatabase,
                    )
                    FluidSecondaryButton(
                        text = "Restore DB",
                        icon = CourtIcon.UPLOAD,
                        tintColor = colors.accentCyan,
                        modifier = Modifier.weight(1f),
                        onClick = { restorePicker.launch("*/*") },
                    )
                }
                Spacer(modifier = Modifier.height(8.dp))
                FluidSecondaryButton(
                    text = "Export JSON Audit Snapshot",
                    icon = CourtIcon.SHIELD,
                    modifier = Modifier.fillMaxWidth(),
                    onClick = onExportJsonSnapshot,
                )
            }
        }

        // 4. Demo Squad Seeder & Surgical Reset
        StaggeredFluidEntrance(index = 3) {
            FluidGlassCard(accentStripeColor = colors.dangerRed) {
                BasicText("Demo Squad Seeder & Surgical Data Reset", style = typo.h2.copy(color = colors.inkPrimary))
                BasicText(
                    "Load 12 sample Kerala volleyball athletes to test workflows, or surgically remove only tagged demo records.",
                    style = typo.caption.copy(color = colors.inkSecondary),
                )
                Spacer(modifier = Modifier.height(12.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    FluidSecondaryButton(
                        text = "Load Demo Squad",
                        icon = CourtIcon.SPARKLES,
                        tintColor = colors.accentTeal,
                        modifier = Modifier.weight(1f),
                        onClick = onLoadDemoData,
                    )
                    if (hasDemoData) {
                        FluidSecondaryButton(
                            text = "Clear Demo Only",
                            icon = CourtIcon.TRASH,
                            tintColor = colors.accentAmber,
                            modifier = Modifier.weight(1f),
                            onClick = { onClearDemoData("demo") },
                        )
                    }
                    FluidSecondaryButton(
                        text = "Wipe All Records",
                        icon = CourtIcon.TRASH,
                        tintColor = colors.dangerRed,
                        modifier = Modifier.weight(1f),
                        onClick = { onClearDemoData("all") },
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(24.dp))
    }

    if (showCommitteeModal) {
        var name by remember(editingMember) { mutableStateOf(editingMember?.fullName ?: "") }
        var role by remember(editingMember) { mutableStateOf(editingMember?.role ?: "Executive Member") }
        var phoneStr by remember(editingMember) { mutableStateOf(editingMember?.phone ?: "") }
        var resp by remember(editingMember) { mutableStateOf(editingMember?.responsibilities ?: "") }
        var orderStr by remember(editingMember) { mutableStateOf((editingMember?.displayOrder ?: committee.size).toString()) }

        FluidModalSheet(
            title = if (editingMember == null) "Add Committee Member" else "Edit Committee Member",
            subtitle = "Academy governing committee",
            onDismiss = { showCommitteeModal = false },
        ) {
            FluidTextField(value = name, onValueChange = { name = it }, label = "Full Name *")
            BasicText("OFFICE ROLE", style = typo.microCaps.copy(color = colors.inkSecondary))
            FluidChipRow(
                options = COMMITTEE_ROLES.map { it to it },
                selectedKey = role,
                onSelect = { role = it },
            )
            FluidTextField(
                value = phoneStr,
                onValueChange = { phoneStr = it },
                label = "Phone Number",
                keyboardType = KeyboardType.Phone,
            )
            FluidTextField(
                value = resp,
                onValueChange = { resp = it },
                label = "Portfolio / Responsibilities",
            )
            FluidTextField(
                value = orderStr,
                onValueChange = { orderStr = DomainEngine.intOnly(it, 2) },
                label = "Display Order",
                keyboardType = KeyboardType.Number,
            )
            FluidPrimaryButton(
                text = if (editingMember == null) "Create Member" else "Update Member",
                icon = CourtIcon.CHECK,
                modifier = Modifier.fillMaxWidth(),
                onClick = {
                    val input = CommitteeMemberInput(
                        fullName = name,
                        role = role,
                        phone = phoneStr,
                        responsibilities = resp.ifBlank { null },
                        displayOrder = orderStr.toIntOrNull() ?: 0,
                    )
                    if (editingMember == null) {
                        onCreateCommittee(input)
                    } else {
                        onUpdateCommittee(editingMember!!.id, input)
                    }
                    showCommitteeModal = false
                },
            )
        }
    }
}
