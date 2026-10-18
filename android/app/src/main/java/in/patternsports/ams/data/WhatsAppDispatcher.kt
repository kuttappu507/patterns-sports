package `in`.patternsports.ams.data

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import `in`.patternsports.ams.domain.AcademySettings
import `in`.patternsports.ams.domain.DomainEngine
import `in`.patternsports.ams.domain.FeePayment
import `in`.patternsports.ams.domain.Student
import java.io.File

// ============================================================
// PS-AMS :: WhatsApp Receipt & Fee Reminder Dispatcher
// 1:1 parity with src/lib/psams/whatsapp.ts
// ============================================================

object WhatsAppDispatcher {

    /**
     * Normalize an Indian or international phone string to WhatsApp's
     * digits-only E.164 format (without leading '+').
     */
    fun normalizeWhatsAppPhone(raw: String?, defaultCountryCode: String = "91"): String? {
        if (raw.isNullOrBlank()) return null
        val digits = raw.filter { it.isDigit() }
        if (digits.isEmpty()) return null
        if (digits.length == 11 && digits.startsWith("0")) {
            return defaultCountryCode + digits.substring(1)
        }
        if (digits.length == 10) {
            return defaultCountryCode + digits
        }
        if (digits.length in 11..15) {
            return digits
        }
        return null
    }

    /**
     * Format a clean, structured WhatsApp receipt message ready to send to the
     * parent/guardian after fee collection.
     */
    fun buildReceiptWhatsAppMessage(
        payment: FeePayment,
        student: Student,
        settings: AcademySettings,
    ): String {
        val months = DomainEngine.parsePaidMonths(payment.months).map { DomainEngine.monthLabel(it) }
        val lines = mutableListOf(
            "*${settings.academyName}*",
            "_Official Fee Receipt_",
            "─────────────────────",
            "*Receipt No:* ${payment.receiptNo}",
            "*Date:* ${DomainEngine.formatDate(payment.paymentDate)}",
            "*Student:* ${student.fullName} (${student.admissionNo})",
            "*Category:* ${student.ageCategory} · ${student.trainingBatch} Batch",
            "*Month(s) Paid:* ${if (months.isNotEmpty()) months.joinToString(", ") else "—"}",
            "*Payment Mode:* ${payment.paymentMode}",
            "*Amount Received:* *${DomainEngine.formatINR(payment.amount)}*",
            "_${DomainEngine.inWords(payment.amount)}_",
        )
        if (!payment.remarks.isNullOrBlank()) {
            lines.add("*Remarks:* ${payment.remarks}")
        }
        lines.addAll(
            listOf(
                "─────────────────────",
                "Thank you for your timely support!",
                "— ${settings.receiptSignatory}, ${settings.academyName}",
                settings.phone,
            )
        )
        return lines.joinToString("\n")
    }

    /**
     * Format a polite fee reminder message for pending/overdue months.
     */
    fun buildFeeReminderMessage(
        student: Student,
        pendingMonths: List<String>,
        dueAmount: Double,
        settings: AcademySettings,
    ): String {
        val months = pendingMonths.map { DomainEngine.monthLabel(it) }.joinToString(", ")
        return listOf(
            "*${settings.academyName}*",
            "_Friendly Fee Reminder_",
            "─────────────────────",
            "Dear ${student.parentName},",
            "This is a gentle reminder regarding the training fee for *${student.fullName}* (${student.admissionNo} · ${student.ageCategory}).",
            "*Pending Month(s):* $months",
            "*Total Due:* *${DomainEngine.formatINR(dueAmount)}* (${DomainEngine.formatINR(student.monthlyFee)}/mo)",
            "─────────────────────",
            "Kindly arrange payment at your earliest convenience. Please ignore if already paid.",
            "— ${settings.receiptSignatory}, ${settings.academyName}",
            settings.phone,
        ).joinToString("\n")
    }

    /**
     * Open WhatsApp directly to the recipient's chat with the pre-filled message.
     */
    fun openWhatsAppChat(context: Context, phone: String?, message: String): Boolean {
        val normalized = normalizeWhatsAppPhone(phone) ?: return false
        val encoded = Uri.encode(message)
        val uri = Uri.parse("https://wa.me/$normalized?text=$encoded")
        val intent = Intent(Intent.ACTION_VIEW, uri).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return try {
            context.startActivity(intent)
            true
        } catch (_: Exception) {
            false
        }
    }

    /**
     * Share a generated PDF receipt + WhatsApp message via Android's share sheet
     * (preferring WhatsApp if installed).
     */
    fun sharePdfViaWhatsApp(context: Context, pdfFile: File, phone: String?, message: String) {
        val authority = "${context.packageName}.fileprovider"
        val contentUri = FileProvider.getUriForFile(context, authority, pdfFile)
        val normalized = normalizeWhatsAppPhone(phone)

        val sendIntent = Intent(Intent.ACTION_SEND).apply {
            type = "application/pdf"
            putExtra(Intent.EXTRA_STREAM, contentUri)
            putExtra(Intent.EXTRA_TEXT, message)
            if (normalized != null) {
                putExtra("jid", "$normalized@s.whatsapp.net")
            }
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }

        val chooser = Intent.createChooser(sendIntent, "Share Receipt PDF").apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(chooser)
    }
}
