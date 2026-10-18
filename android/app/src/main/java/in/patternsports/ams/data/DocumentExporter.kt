package `in`.patternsports.ams.data

import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.net.Uri
import android.os.Bundle
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.print.PageRange
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintDocumentInfo
import android.print.PrintManager
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import androidx.core.content.FileProvider
import androidx.core.content.res.ResourcesCompat
import `in`.patternsports.ams.R
import `in`.patternsports.ams.domain.ACADEMY_MAPS_URL
import `in`.patternsports.ams.domain.AcademySettings
import `in`.patternsports.ams.domain.BMI_SCREENING_NOTE
import `in`.patternsports.ams.domain.BmiEngine
import `in`.patternsports.ams.domain.DomainEngine
import `in`.patternsports.ams.domain.FeePayment
import `in`.patternsports.ams.domain.PrintPayload
import `in`.patternsports.ams.domain.Student
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.util.Locale
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import kotlin.math.ceil
import kotlin.math.max

// ============================================================
// PS-AMS :: Professional PDF, Print, Excel (.xlsx) & CSV Exporter
// 1:1 visual & structural parity with PC app:
//  - src/lib/psams/export.ts (buildReceiptPdfA5, profilePdfA4, exportPDF)
//  - src/components/psams/prints/print-root.tsx (Letterhead, ReceiptA5/A6,
//    ReceiptThermal, ProfileA4, RosterPrint, AttendancePrint)
// ============================================================

object DocumentExporter {

    private const val COLOR_BRAND_ROSE = 0xFFEF476F.toInt()
    private const val COLOR_INK_NAVY = 0xFF073B4C.toInt()
    private const val COLOR_EXEC_BLUE = 0xFF1F6FB2.toInt()
    private const val COLOR_TEXT_DARK = 0xFF191919.toInt()
    private const val COLOR_TEXT_MUTED = 0xFF5A5A5A.toInt()
    private const val COLOR_TEXT_LIGHT = 0xFF828282.toInt()
    private const val COLOR_BG_SUBTLE = 0xFFF5F7FA.toInt()
    private const val COLOR_ZEBRA_ROSE = 0xFFFDF4F2.toInt()
    private const val COLOR_ZEBRA_BLUE = 0xFFF4F8FC.toInt()
    private const val COLOR_GRID_LINE = 0xFFD2D6DB.toInt()
    private const val COLOR_DARK_BORDER = 0xFF1E1E1E.toInt()

    /** Paper format option for formal receipts ("A5" = 148×210mm, "A6" = 105×148mm). */
    var receiptPaperFormat: String = "A5"

    private var poppinsRegular: Typeface? = null
    private var poppinsMedium: Typeface? = null
    private var poppinsSemiBold: Typeface? = null
    private var poppinsBold: Typeface? = null
    private var poppinsItalic: Typeface? = null
    private var poppinsBoldItalic: Typeface? = null

    private fun ensurePoppinsTypefaces(context: Context) {
        if (poppinsRegular != null) return
        try {
            poppinsRegular = ResourcesCompat.getFont(context, R.font.poppins_regular)
            poppinsMedium = ResourcesCompat.getFont(context, R.font.poppins_medium)
            poppinsSemiBold = ResourcesCompat.getFont(context, R.font.poppins_semibold)
            poppinsBold = ResourcesCompat.getFont(context, R.font.poppins_bold)
            poppinsItalic = ResourcesCompat.getFont(context, R.font.poppins_italic)
            poppinsBoldItalic = ResourcesCompat.getFont(context, R.font.poppins_bold_italic)
        } catch (_: Exception) {
        }
    }

    private fun rs(amount: Double): String =
        DomainEngine.formatINR(amount).replace("₹", "Rs. ")

    fun exportPrintPayloadToPdf(
        context: Context,
        payload: PrintPayload,
        settings: AcademySettings,
    ): File {
        ensurePoppinsTypefaces(context)
        val doc = PdfDocument()
        val fileName: String

        when (payload) {
            is PrintPayload.ProfileCard -> {
                fileName = "PS-AMS-Profile-${payload.detail.student.admissionNo}.pdf"
                renderProfileCardPdf(context, doc, payload, settings)
            }
            is PrintPayload.FormalReceipt -> {
                fileName = "PS-AMS-Receipt-${payload.payment.receiptNo}.pdf"
                renderFormalReceiptPdf(doc, payload, settings, receiptPaperFormat)
            }
            is PrintPayload.PosReceipt -> {
                fileName = "PS-AMS-POS-${payload.payment.receiptNo}.pdf"
                renderPosReceiptPdf(doc, payload, settings)
            }
            is PrintPayload.DefaultersReport -> {
                fileName = "PS-AMS-Defaulters-${DomainEngine.todayKey()}.pdf"
                renderDefaultersPdf(doc, payload, settings)
            }
            is PrintPayload.FilteredReport -> {
                fileName = "PS-AMS-Report-${DomainEngine.todayKey()}.pdf"
                renderFilteredReportPdf(doc, payload, settings)
            }
            is PrintPayload.BlankAttendanceSheet -> {
                fileName = "PS-AMS-Attendance-Sheet-${payload.monthLabel.replace(" ", "-")}.pdf"
                renderBlankAttendancePdf(doc, payload, settings)
            }
            is PrintPayload.PaymentHistoryReport -> {
                fileName = "PS-AMS-Payments-${DomainEngine.todayKey()}.pdf"
                renderPaymentHistoryPdf(doc, payload, settings)
            }
        }

        val outDir = File(context.cacheDir, "exports").apply { mkdirs() }
        val outFile = File(outDir, DomainEngine.sanitizeFileName(fileName))
        FileOutputStream(outFile).use { doc.writeTo(it) }
        doc.close()
        return outFile
    }

    /** Send a PrintPayload to the native Android system PrintManager. */
    fun printPayload(context: Context, payload: PrintPayload, settings: AcademySettings) {
        val pdfFile = exportPrintPayloadToPdf(context, payload, settings)
        val printManager = context.getSystemService(Context.PRINT_SERVICE) as? PrintManager ?: return
        val jobName = "PS-AMS-${pdfFile.nameWithoutExtension}"
        printManager.print(
            jobName,
            object : PrintDocumentAdapter() {
                override fun onLayout(
                    oldAttributes: PrintAttributes?,
                    newAttributes: PrintAttributes?,
                    cancellationSignal: CancellationSignal?,
                    callback: LayoutResultCallback?,
                    extras: Bundle?,
                ) {
                    if (cancellationSignal?.isCanceled == true) {
                        callback?.onLayoutCancelled()
                        return
                    }
                    val info = PrintDocumentInfo.Builder(pdfFile.name)
                        .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT)
                        .build()
                    callback?.onLayoutFinished(info, true)
                }

                override fun onWrite(
                    pages: Array<out PageRange>?,
                    destination: ParcelFileDescriptor?,
                    cancellationSignal: CancellationSignal?,
                    callback: WriteResultCallback?,
                ) {
                    if (destination == null) {
                        callback?.onWriteFailed("No destination")
                        return
                    }
                    try {
                        FileInputStream(pdfFile).use { input ->
                            FileOutputStream(destination.fileDescriptor).use { output ->
                                input.copyTo(output)
                            }
                        }
                        callback?.onWriteFinished(arrayOf(PageRange.ALL_PAGES))
                    } catch (e: Exception) {
                        callback?.onWriteFailed(e.message)
                    }
                }
            },
            null
        )
    }

    /** Share any exported file (PDF / XLSX / CSV / DB) using Android's share sheet. */
    fun shareExportedFile(context: Context, file: File, mimeType: String, title: String = "Share Document") {
        val authority = "${context.packageName}.fileprovider"
        val uri = FileProvider.getUriForFile(context, authority, file)
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = mimeType
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(
            Intent.createChooser(intent, title).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
        )
    }

    // ---------- Shared Typography & Multi-line Helpers (Bundled Poppins) ----------

    private fun makeTextPaint(
        colorInt: Int,
        sizePt: Float,
        bold: Boolean = false,
        italic: Boolean = false,
        mono: Boolean = false,
        align: Paint.Align = Paint.Align.LEFT,
    ): TextPaint {
        val tf = when {
            bold && italic -> poppinsBoldItalic ?: Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD_ITALIC)
            bold -> poppinsBold ?: poppinsSemiBold ?: Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)
            italic -> poppinsItalic ?: Typeface.create(Typeface.SANS_SERIF, Typeface.ITALIC)
            mono -> poppinsMedium ?: poppinsRegular ?: Typeface.SANS_SERIF
            else -> poppinsRegular ?: Typeface.SANS_SERIF
        }
        return TextPaint(Paint.ANTI_ALIAS_FLAG or Paint.SUBPIXEL_TEXT_FLAG or Paint.LINEAR_TEXT_FLAG).apply {
            color = colorInt
            textSize = sizePt
            typeface = tf
            textAlign = align
            letterSpacing = 0f
        }
    }

    private fun drawWrappedText(
        canvas: Canvas,
        text: String,
        x: Float,
        yTop: Float,
        maxWidth: Float,
        paint: TextPaint,
        alignment: Layout.Alignment = Layout.Alignment.ALIGN_NORMAL,
    ): Float {
        val safeW = maxWidth.toInt().coerceAtLeast(20)
        val layout = StaticLayout.Builder
            .obtain(text, 0, text.length, paint, safeW)
            .setAlignment(alignment)
            .setLineSpacing(0f, 1.12f)
            .setIncludePad(false)
            .build()
        canvas.save()
        canvas.translate(x, yTop)
        layout.draw(canvas)
        canvas.restore()
        return layout.height.toFloat()
    }

    private fun measureWrappedHeight(
        text: String,
        maxWidth: Float,
        paint: TextPaint,
    ): Float {
        val safeW = maxWidth.toInt().coerceAtLeast(20)
        val layout = StaticLayout.Builder
            .obtain(text, 0, text.length, paint, safeW)
            .setLineSpacing(0f, 1.12f)
            .setIncludePad(false)
            .build()
        return layout.height.toFloat()
    }

    // ---------- Shared PC-App Letterhead (`drawLetterhead` in export.ts) ----------

    private fun drawPcLetterhead(
        canvas: Canvas,
        pageW: Float,
        marginX: Float,
        settings: AcademySettings,
        docTitle: String,
        compact: Boolean = false,
    ): Float {
        val centerX = pageW / 2f
        var y = if (compact) 18f else 24f

        val titlePaint = makeTextPaint(
            colorInt = COLOR_INK_NAVY,
            sizePt = if (compact) 13.5f else 16.5f,
            bold = true,
            align = Paint.Align.CENTER,
        )
        val academyName = settings.academyName.ifBlank { "Pattern Sports Academy" }
        canvas.drawText(academyName, centerX, y + (if (compact) 11f else 13f), titlePaint)
        y += if (compact) 15f else 18f

        // Tagline + Contact meta line
        val contactParts = buildList {
            if (settings.address.isNotBlank()) add(settings.address)
            if (settings.phone.isNotBlank()) add("Ph: ${settings.phone}")
            if (settings.email.isNotBlank()) add(settings.email)
        }.joinToString("  ·  ")

        val metaLine = buildList {
            if (settings.tagline.isNotBlank()) add(settings.tagline)
            if (contactParts.isNotBlank()) add(contactParts)
        }.joinToString("  —  ")

        if (metaLine.isNotBlank()) {
            val metaPaint = makeTextPaint(
                colorInt = COLOR_TEXT_MUTED,
                sizePt = if (compact) 7.2f else 8.2f,
                italic = true,
            )
            val h = drawWrappedText(
                canvas = canvas,
                text = metaLine,
                x = marginX,
                yTop = y,
                maxWidth = pageW - marginX * 2f,
                paint = metaPaint,
                alignment = Layout.Alignment.ALIGN_CENTER,
            )
            y += h + (if (compact) 4f else 6f)
        }

        // Watermelon Rose Document Title Pill (`#EF476F`)
        val badgeText = docTitle.uppercase(Locale.ROOT)
        val badgeTextPaint = makeTextPaint(
            colorInt = Color.WHITE,
            sizePt = if (compact) 8f else 9f,
            bold = true,
            align = Paint.Align.CENTER,
        )
        val pillW = max(badgeTextPaint.measureText(badgeText) + 24f, if (compact) 128f else 156f)
        val pillH = if (compact) 15.5f else 18f
        val pillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = COLOR_BRAND_ROSE }
        canvas.drawRoundRect(
            RectF(centerX - pillW / 2f, y, centerX + pillW / 2f, y + pillH),
            3.5f,
            3.5f,
            pillPaint,
        )
        canvas.drawText(badgeText, centerX, y + pillH * 0.71f, badgeTextPaint)
        y += pillH + (if (compact) 6f else 8f)

        // Bottom horizontal rule in `#EF476F`
        val linePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = COLOR_BRAND_ROSE
            strokeWidth = 1.4f
        }
        canvas.drawLine(marginX, y, pageW - marginX, y, linePaint)
        return y + (if (compact) 10f else 13f)
    }

    private fun drawSignatoryBlock(
        canvas: Canvas,
        pageW: Float,
        marginX: Float,
        yTop: Float,
        signatoryName: String,
        roleLabel: String,
    ) {
        val blockW = 136f
        val rightX = pageW - marginX
        val leftX = rightX - blockW
        val centerX = leftX + blockW / 2f
        val lineY = yTop + 20f

        val rulePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = 0xFF6E6E6E.toInt()
            strokeWidth = 0.85f
        }
        canvas.drawLine(leftX, lineY, rightX, lineY, rulePaint)

        val sigPaint = makeTextPaint(
            colorInt = 0xFF3C3C3C.toInt(),
            sizePt = 8f,
            bold = true,
            align = Paint.Align.CENTER,
        )
        val rolePaint = makeTextPaint(
            colorInt = COLOR_TEXT_LIGHT,
            sizePt = 7f,
            align = Paint.Align.CENTER,
        )
        canvas.drawText(signatoryName.ifBlank { roleLabel }, centerX, lineY + 10f, sigPaint)
        if (signatoryName.isNotBlank() && !signatoryName.equals(roleLabel, ignoreCase = true)) {
            canvas.drawText(roleLabel, centerX, lineY + 19f, rolePaint)
        }
    }

    private fun drawPageFooter(
        canvas: Canvas,
        pageW: Float,
        pageH: Float,
        text: String,
    ) {
        val footerPaint = makeTextPaint(
            colorInt = 0xFF969696.toInt(),
            sizePt = 7f,
            align = Paint.Align.CENTER,
        )
        canvas.drawText(text, pageW / 2f, pageH - 14f, footerPaint)
    }

    // ---------- 1. Formal A5 / A6 Portrait Fee Payment Receipt (`buildReceiptPdfA5` in export.ts) ----------

    private fun renderFormalReceiptPdf(
        doc: PdfDocument,
        payload: PrintPayload.FormalReceipt,
        settings: AcademySettings,
        paper: String = "A5",
    ) {
        val isA6 = paper.equals("A6", ignoreCase = true)
        // A5 portrait = 420 × 595 pt (148 × 210 mm); A6 portrait = 298 × 420 pt (105 × 148 mm)
        val pageW = if (isA6) 298 else 420
        val pageH = if (isA6) 420 else 595
        val marginX = if (isA6) 22f else 34f

        val pageInfo = PdfDocument.PageInfo.Builder(pageW, pageH, 1).create()
        val page = doc.startPage(pageInfo)
        val c = page.canvas

        var y = drawPcLetterhead(
            canvas = c,
            pageW = pageW.toFloat(),
            marginX = marginX,
            settings = settings,
            docTitle = "Fee Payment Receipt",
            compact = isA6,
        )

        val p = payload.payment
        val s = payload.student
        val months = DomainEngine.parsePaidMonths(p.months)
        val monthNames = months.joinToString(", ") { DomainEngine.monthLabel(it) }

        // Receipt No & Date bar
        val metaLabelPaint = makeTextPaint(COLOR_TEXT_MUTED, if (isA6) 8.2f else 9.2f, bold = false)
        val metaValPaint = makeTextPaint(COLOR_TEXT_DARK, if (isA6) 8.5f else 9.5f, bold = true)
        val metaMonoPaint = makeTextPaint(COLOR_TEXT_DARK, if (isA6) 8.5f else 9.5f, bold = true, mono = true)

        c.drawText("Receipt No:", marginX, y + 9f, metaLabelPaint)
        c.drawText(p.receiptNo, marginX + (if (isA6) 52f else 58f), y + 9f, metaMonoPaint)

        val dateStr = DomainEngine.formatDate(p.paymentDate)
        val dateValW = metaValPaint.measureText(dateStr)
        val dateLabelW = metaLabelPaint.measureText("Date: ")
        c.drawText("Date: ", pageW - marginX - dateValW - dateLabelW, y + 9f, metaLabelPaint)
        c.drawText(dateStr, pageW - marginX - dateValW, y + 9f, metaValPaint)

        y += if (isA6) 17f else 21f

        // Detail rows (matching PC app's Received From / Towards / Payment Mode / Remarks)
        val towardsText = if (months.isEmpty()) {
            "Academy training fee"
        } else {
            "Academy fee${if (months.size > 1) "s" else ""} for $monthNames"
        }
        val rows = buildList {
            add("Received From" to "${s.fullName}  (${s.admissionNo})")
            add("Category / Batch" to "${s.ageCategory} (${DomainEngine.categoryBracket(s.ageCategory)}) · ${s.trainingBatch} Batch")
            add("Towards" to towardsText)
            add("Payment Mode" to p.paymentMode)
            if (!p.remarks.isNullOrBlank()) {
                add("Remarks" to p.remarks)
            }
        }

        val labelColW = if (isA6) 78f else 104f
        val tableW = pageW - marginX * 2f
        val valColW = tableW - labelColW - 14f
        val rowLabelPaint = makeTextPaint(COLOR_TEXT_LIGHT, if (isA6) 6.8f else 7.5f, bold = true)
        val rowValPaint = makeTextPaint(COLOR_TEXT_DARK, if (isA6) 8.6f else 9.6f, bold = false)
        val rowValBoldPaint = makeTextPaint(COLOR_TEXT_DARK, if (isA6) 9.0f else 10.2f, bold = true)
        val gridStroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = COLOR_GRID_LINE
            style = Paint.Style.STROKE
            strokeWidth = 0.7f
        }
        val labelBgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = COLOR_BG_SUBTLE }

        for ((idx, pair) in rows.withIndex()) {
            val (label, value) = pair
            val vPaint = if (idx == 0) rowValBoldPaint else rowValPaint
            val textH = measureWrappedHeight(value, valColW, vPaint)
            val rowH = max(textH + (if (isA6) 9f else 11f), if (isA6) 19f else 22f)

            // Shaded label cell + white value cell with crisp border
            c.drawRect(marginX, y, marginX + labelColW, y + rowH, labelBgPaint)
            c.drawRect(marginX, y, marginX + labelColW, y + rowH, gridStroke)
            c.drawRect(marginX + labelColW, y, pageW - marginX, y + rowH, gridStroke)

            c.drawText(label.uppercase(Locale.ROOT), marginX + 6f, y + (if (isA6) 12f else 14f), rowLabelPaint)
            drawWrappedText(
                canvas = c,
                text = value,
                x = marginX + labelColW + 7f,
                yTop = y + (if (isA6) 4.5f else 5.5f),
                maxWidth = valColW,
                paint = vPaint,
            )
            y += rowH
        }

        y += if (isA6) 10f else 13f

        // Total Amount Paid Banner (matching PC app export.ts roundedRect with inWords + Rs. total)
        val wordsStr = DomainEngine.inWords(p.amount)
        val wordsPaint = makeTextPaint(COLOR_TEXT_MUTED, if (isA6) 7.2f else 8.2f, bold = true)
        val wordsMaxW = tableW * 0.62f
        val wordsH = measureWrappedHeight(wordsStr, wordsMaxW, wordsPaint)
        val bannerH = max(if (isA6) 34f else 42f, wordsH + (if (isA6) 20f else 24f))

        val bannerFill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = COLOR_BG_SUBTLE }
        val bannerStroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = COLOR_DARK_BORDER
            style = Paint.Style.STROKE
            strokeWidth = 1.3f
        }
        val bannerRect = RectF(marginX, y, pageW - marginX, y + bannerH)
        c.drawRoundRect(bannerRect, 4.5f, 4.5f, bannerFill)
        c.drawRoundRect(bannerRect, 4.5f, 4.5f, bannerStroke)

        val totalHeadingPaint = makeTextPaint(COLOR_TEXT_MUTED, if (isA6) 7.2f else 8.0f, bold = true)
        c.drawText("TOTAL AMOUNT PAID", marginX + 10f, y + (if (isA6) 12.5f else 14.5f), totalHeadingPaint)

        drawWrappedText(
            canvas = c,
            text = wordsStr,
            x = marginX + 10f,
            yTop = y + (if (isA6) 16.5f else 19.5f),
            maxWidth = wordsMaxW,
            paint = wordsPaint,
        )

        val amtPaint = makeTextPaint(
            colorInt = COLOR_INK_NAVY,
            sizePt = if (isA6) 14.5f else 17.5f,
            bold = true,
            align = Paint.Align.RIGHT,
        )
        c.drawText(rs(p.amount), pageW - marginX - 10f, y + bannerH / 2f + 6f, amtPaint)
        y += bannerH + (if (isA6) 9f else 12f)

        // Non-refundable disclaimer
        val notePaint = makeTextPaint(0xFF787878.toInt(), if (isA6) 6.8f else 7.8f, italic = true)
        c.drawText(
            "Fees once paid are non-refundable. Please retain this receipt for future reference.",
            marginX,
            y + 8f,
            notePaint,
        )
        y += if (isA6) 16f else 22f

        // Signatory block
        drawSignatoryBlock(
            canvas = c,
            pageW = pageW.toFloat(),
            marginX = marginX,
            yTop = y,
            signatoryName = settings.receiptSignatory.ifBlank { "Authorized Signatory" },
            roleLabel = "Authorized Signatory",
        )

        // Bottom Footer
        drawPageFooter(
            canvas = c,
            pageW = pageW.toFloat(),
            pageH = pageH.toFloat(),
            text = "Generated by PS-AMS  ·  Find us on Google Maps: ${ACADEMY_MAPS_URL.removePrefix("https://")}",
        )

        doc.finishPage(page)
    }

    // ---------- 2. 80mm POS Thermal Roll Receipt (`ReceiptThermal` in print-root.tsx) ----------

    private fun renderPosReceiptPdf(
        doc: PdfDocument,
        payload: PrintPayload.PosReceipt,
        settings: AcademySettings,
    ) {
        val p = payload.payment
        val s = payload.student
        val months = DomainEngine.parsePaidMonths(p.months)

        // 80mm roll = 226 pt wide; height adapts dynamically to number of paid months
        val pageW = 226
        val pageH = max(360, 295 + months.size * 13 + (if (p.remarks.isNullOrBlank()) 0 else 16))
        val pageInfo = PdfDocument.PageInfo.Builder(pageW, pageH, 1).create()
        val page = doc.startPage(pageInfo)
        val c = page.canvas

        val centerBold = makeTextPaint(Color.BLACK, 10.5f, bold = true, mono = true, align = Paint.Align.CENTER)
        val centerReg = makeTextPaint(Color.BLACK, 8.0f, bold = false, mono = true, align = Paint.Align.CENTER)
        val leftBold = makeTextPaint(Color.BLACK, 8.5f, bold = true, mono = true)
        val leftReg = makeTextPaint(Color.BLACK, 8.0f, bold = false, mono = true)
        val totalBold = makeTextPaint(Color.BLACK, 11.5f, bold = true, mono = true)

        val dashPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.BLACK
            style = Paint.Style.STROKE
            strokeWidth = 0.8f
            pathEffect = DashPathEffect(floatArrayOf(3f, 2.5f), 0f)
        }

        val cx = pageW / 2f
        val mx = 11f
        var y = 20f

        c.drawText(settings.academyName.ifBlank { "Pattern Sports Academy" }, cx, y, centerBold)
        y += 12f
        if (settings.address.isNotBlank()) {
            val h = drawWrappedText(
                canvas = c,
                text = settings.address,
                x = mx,
                yTop = y - 8f,
                maxWidth = pageW - mx * 2f,
                paint = makeTextPaint(Color.BLACK, 7.6f, mono = true),
                alignment = Layout.Alignment.ALIGN_CENTER,
            )
            y += h + 3f
        }
        if (settings.phone.isNotBlank()) {
            c.drawText("Ph: ${settings.phone}", cx, y, centerReg)
            y += 10f
        }

        c.drawLine(mx, y, pageW - mx, y, dashPaint)
        y += 12f
        c.drawText("FEE RECEIPT", cx, y, centerBold)
        y += 7f
        c.drawLine(mx, y, pageW - mx, y, dashPaint)
        y += 13f

        fun kv(label: String, value: String) {
            c.drawText(label.padEnd(8, ' ') + ": ", mx, y, leftReg)
            c.drawText(value.take(22), mx + 52f, y, leftBold)
            y += 12.5f
        }

        kv("Receipt", p.receiptNo)
        kv("Date", DomainEngine.formatDate(p.paymentDate))
        kv("Student", s.fullName)
        kv("Adm No", s.admissionNo)

        y += 2f
        c.drawLine(mx, y, pageW - mx, y, dashPaint)
        y += 12f

        c.drawText("PERIODS PAID:", mx, y, leftBold)
        y += 12f
        if (months.isEmpty()) {
            c.drawText("  - Academy Fee", mx, y, leftReg)
            y += 12f
        } else {
            for (m in months) {
                c.drawText("  - ${DomainEngine.monthLabel(m)}", mx, y, leftReg)
                y += 12f
            }
        }

        y += 2f
        c.drawLine(mx, y, pageW - mx, y, dashPaint)
        y += 13f

        kv("Mode", p.paymentMode)
        if (!p.remarks.isNullOrBlank()) {
            kv("Note", p.remarks)
        }
        y += 2f
        c.drawText("TOTAL   : ${rs(p.amount)}", mx, y, totalBold)
        y += 12f
        val wordsH = drawWrappedText(
            canvas = c,
            text = DomainEngine.inWords(p.amount),
            x = mx,
            yTop = y - 8f,
            maxWidth = pageW - mx * 2f,
            paint = leftReg,
        )
        y += wordsH + 4f

        c.drawLine(mx, y, pageW - mx, y, dashPaint)
        y += 13f
        c.drawText("Thank you! Keep training hard.", cx, y, centerReg)
        y += 11f
        c.drawText(settings.receiptSignatory.ifBlank { "Authorized Signatory" }, cx, y, centerBold)
        y += 11f
        c.drawText("Powered by PS-AMS", cx, y, makeTextPaint(0xFF555555.toInt(), 7f, mono = true, align = Paint.Align.CENTER))

        doc.finishPage(page)
    }

    // ---------- 3. A4 Player Profile Card (`profilePdfA4` in export.ts & `ProfileA4` in print-root.tsx) ----------

    private fun renderProfileCardPdf(
        context: Context,
        doc: PdfDocument,
        payload: PrintPayload.ProfileCard,
        settings: AcademySettings,
    ) {
        val pageW = 595
        val pageH = 842
        val marginX = 36f
        val pageInfo = PdfDocument.PageInfo.Builder(pageW, pageH, 1).create()
        val page = doc.startPage(pageInfo)
        val c = page.canvas

        var y = drawPcLetterhead(
            canvas = c,
            pageW = pageW.toFloat(),
            marginX = marginX,
            settings = settings,
            docTitle = "Player Profile Card",
        )

        val s = payload.detail.student
        val achievements = payload.detail.achievements
        val bmiFields = BmiEngine.bmiReportFields(s)

        // ---- Photo box (left) + 9-Row Identity Grid Table (right) ----
        val photoW = 76f
        val photoH = 98f
        val photoRect = RectF(marginX, y, marginX + photoW, y + photoH)
        val fillSubtle = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = COLOR_BG_SUBTLE }
        val gridStroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = COLOR_GRID_LINE
            style = Paint.Style.STROKE
            strokeWidth = 0.75f
        }

        c.drawRoundRect(photoRect, 4f, 4f, fillSubtle)
        var drewPhoto = false
        if (!s.photoPath.isNullOrBlank()) {
            try {
                val bmp = when {
                    s.photoPath.startsWith("content://") || s.photoPath.startsWith("file://") -> {
                        context.contentResolver.openInputStream(Uri.parse(s.photoPath))?.use {
                            BitmapFactory.decodeStream(it)
                        }
                    }
                    else -> {
                        val f = File(s.photoPath)
                        if (f.exists()) BitmapFactory.decodeFile(f.absolutePath) else null
                    }
                }
                if (bmp != null) {
                    c.save()
                    c.clipRect(photoRect)
                    c.drawBitmap(bmp, null, photoRect, Paint(Paint.FILTER_BITMAP_FLAG))
                    c.restore()
                    drewPhoto = true
                }
            } catch (_: Exception) {
                drewPhoto = false
            }
        }
        if (!drewPhoto) {
            val initials = s.fullName
                .trim()
                .split(Regex("\\s+"))
                .mapNotNull { it.firstOrNull()?.uppercaseChar() }
                .take(2)
                .joinToString("")
                .ifEmpty { "PS" }
            val monoInitPaint = makeTextPaint(
                colorInt = 0xFFB4B9BE.toInt(),
                sizePt = 18f,
                bold = true,
                align = Paint.Align.CENTER,
            )
            c.drawText(initials, marginX + photoW / 2f, y + photoH / 2f + 6f, monoInitPaint)
        }
        c.drawRoundRect(photoRect, 4f, 4f, gridStroke)

        val admPaint = makeTextPaint(
            colorInt = 0xFF444444.toInt(),
            sizePt = 8f,
            bold = true,
            mono = true,
            align = Paint.Align.CENTER,
        )
        c.drawText(s.admissionNo, marginX + photoW / 2f, y + photoH + 11f, admPaint)

        // 9-row Identity Grid Table on right of photo
        val tableLeft = marginX + photoW + 12f
        val tableRight = pageW - marginX
        val labelW = 86f
        val valW = (tableRight - tableLeft) - labelW - 12f

        val schoolCombined = buildString {
            append(s.schoolName.ifBlank { "—" })
            if (s.classGrade.isNotBlank()) append("  ·  Class ${s.classGrade}")
            if (s.division.isNotBlank()) append(" · Div ${s.division}")
        }
        val contactCombined = buildString {
            append(s.mobile)
            if (!s.emergencyContact.isNullOrBlank()) append("  ·  Emergency: ${s.emergencyContact}")
        }

        val idRows = listOf(
            "Full Name" to s.fullName,
            "Date of Birth" to "${DomainEngine.formatDate(s.dateOfBirth)}  (${DomainEngine.ageDetailed(s.dateOfBirth)})",
            "Gender" to s.gender.ifBlank { "—" },
            "Age Category" to "${s.ageCategory} — ${DomainEngine.categoryBracket(s.ageCategory)}",
            "Parent / Guardian" to s.parentName.ifBlank { "—" },
            "Contact" to contactCombined,
            "Address" to s.address.ifBlank { "—" },
            "School / Class" to schoolCombined,
            "Blood Group" to s.bloodGroup.ifBlank { "—" },
        )

        val idLabelPaint = makeTextPaint(COLOR_TEXT_MUTED, 7.2f, bold = true)
        val idValPaint = makeTextPaint(COLOR_TEXT_DARK, 8.2f, bold = false)
        val idValBoldPaint = makeTextPaint(COLOR_TEXT_DARK, 9.2f, bold = true)

        var tableY = y
        for ((idx, pair) in idRows.withIndex()) {
            val (k, v) = pair
            val vp = if (idx == 0) idValBoldPaint else idValPaint
            val textH = measureWrappedHeight(v, valW, vp)
            val rH = max(textH + 6f, 14.5f)

            c.drawRect(tableLeft, tableY, tableLeft + labelW, tableY + rH, fillSubtle)
            c.drawRect(tableLeft, tableY, tableLeft + labelW, tableY + rH, gridStroke)
            c.drawRect(tableLeft + labelW, tableY, tableRight, tableY + rH, gridStroke)

            c.drawText(k.uppercase(Locale.ROOT), tableLeft + 5f, tableY + 10f, idLabelPaint)
            drawWrappedText(
                canvas = c,
                text = v,
                x = tableLeft + labelW + 6f,
                yTop = tableY + 2.8f,
                maxWidth = valW,
                paint = vp,
            )
            tableY += rH
        }

        y = max(tableY, y + photoH + 18f) + 14f

        // Helper for section header matching PC app `<SectionHead>`
        fun drawSectionHeader(title: String) {
            val secText = title.uppercase(Locale.ROOT)
            val secPaint = makeTextPaint(Color.WHITE, 7.6f, bold = true)
            val pillW = secPaint.measureText(secText) + 14f
            val pillH = 14f
            val rosePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = COLOR_BRAND_ROSE }
            c.drawRoundRect(RectF(marginX, y, marginX + pillW, y + pillH), 2.5f, 2.5f, rosePaint)
            c.drawText(secText, marginX + 7f, y + 10f, secPaint)
            c.drawLine(marginX + pillW + 6f, y + pillH / 2f, pageW - marginX, y + pillH / 2f, gridStroke)
            y += pillH + 6f
        }

        // ---- Section 1: Athletic & Biometric Parameters (6-column grid) ----
        drawSectionHeader("Athletic & Biometric Parameters")

        val metrics = listOf(
            "Height" to (s.heightCm?.let { "${it.toInt()} cm" } ?: "—"),
            "Weight" to (s.weightKg?.let { "${it.toInt()} kg" } ?: "—"),
            "BMI (age-specific)" to bmiFields.combined,
            "Standing Reach" to (s.standingReachCm?.let { "${it.toInt()} cm" } ?: "—"),
            "Spike Reach" to (s.spikeReachCm?.let { "${it.toInt()} cm" } ?: "—"),
            "Jump Reach" to (s.jumpReachCm?.let { "${it.toInt()} cm" } ?: "—"),
        )
        val totalTableW = pageW - marginX * 2f
        val colW = totalTableW / metrics.size
        val headH = 14f
        val bodyH = 22f
        val mHeadPaint = makeTextPaint(COLOR_TEXT_MUTED, 6.5f, bold = true, align = Paint.Align.CENTER)
        val mValPaint = makeTextPaint(COLOR_INK_NAVY, 8.2f, bold = true)

        for ((idx, item) in metrics.withIndex()) {
            val cxLeft = marginX + idx * colW
            val cxRight = cxLeft + colW
            val cxMid = cxLeft + colW / 2f
            c.drawRect(cxLeft, y, cxRight, y + headH, fillSubtle)
            c.drawRect(cxLeft, y, cxRight, y + headH, gridStroke)
            c.drawText(item.first.uppercase(Locale.ROOT), cxMid, y + 9.5f, mHeadPaint)

            c.drawRect(cxLeft, y + headH, cxRight, y + headH + bodyH, gridStroke)
            drawWrappedText(
                canvas = c,
                text = item.second,
                x = cxLeft + 3f,
                yTop = y + headH + 4f,
                maxWidth = colW - 6f,
                paint = mValPaint,
                alignment = Layout.Alignment.ALIGN_CENTER,
            )
        }
        y += headH + bodyH + 5f

        // WHO 2007 BMI Screening Disclaimer
        val discPaint = makeTextPaint(0xFF787878.toInt(), 6.8f, italic = true)
        val discH = drawWrappedText(
            canvas = c,
            text = "$BMI_SCREENING_NOTE Classification per WHO: age-specific BMI-for-age (5–19 y) or adult bands (from 19 y 1 m).",
            x = marginX,
            yTop = y,
            maxWidth = totalTableW,
            paint = discPaint,
        )
        y += discH + 6f

        // Sport & Registration Chips line
        val chipsLine = listOf(
            "Primary Sport: ${s.primarySport}",
            "Position: ${s.playingPosition ?: "—"}",
            "Training Batch: ${s.trainingBatch.ifBlank { "—" }}",
            "Registered: ${DomainEngine.formatDate(s.registrationDate)}",
        ).joinToString("    |    ")
        val chipBoxH = 16f
        c.drawRoundRect(RectF(marginX, y, pageW - marginX, y + chipBoxH), 3f, 3f, fillSubtle)
        c.drawRoundRect(RectF(marginX, y, pageW - marginX, y + chipBoxH), 3f, 3f, gridStroke)
        c.drawText(chipsLine, marginX + 8f, y + 11f, makeTextPaint(COLOR_TEXT_DARK, 7.8f, bold = true))
        y += chipBoxH + 12f

        // ---- Section 2: Achievements & Career Milestones Table ----
        drawSectionHeader("Achievements & Career Milestones")

        val achCols = floatArrayOf(24f, 235f, 82f, 92f, totalTableW - (24f + 235f + 82f + 92f))
        val achHeaders = arrayOf("#", "Tournament / Milestone", "Date", "Level", "Medal")
        val achHeadFill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = COLOR_BRAND_ROSE }
        val achHeadText = makeTextPaint(Color.WHITE, 7.6f, bold = true)
        val achRowH = 16f

        var ax = marginX
        for (i in achHeaders.indices) {
            c.drawRect(ax, y, ax + achCols[i], y + achRowH, achHeadFill)
            c.drawRect(ax, y, ax + achCols[i], y + achRowH, gridStroke)
            c.drawText(achHeaders[i], ax + 5f, y + 11f, achHeadText)
            ax += achCols[i]
        }
        y += achRowH

        val achCellPaint = makeTextPaint(COLOR_TEXT_DARK, 7.8f)
        val zebraPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = COLOR_ZEBRA_ROSE }

        if (achievements.isEmpty()) {
            c.drawRect(marginX, y, pageW - marginX, y + 18f, gridStroke)
            c.drawText(
                "No achievements recorded",
                pageW / 2f,
                y + 12f,
                makeTextPaint(COLOR_TEXT_LIGHT, 8f, italic = true, align = Paint.Align.CENTER),
            )
            y += 18f
        } else {
            for ((idx, ach) in achievements.take(12).withIndex()) {
                val titleText = buildString {
                    append(ach.tournamentName)
                    if (!ach.notes.isNullOrBlank()) append(" — ${ach.notes}")
                }
                val rowCells = arrayOf(
                    (idx + 1).toString(),
                    titleText,
                    DomainEngine.formatDate(ach.eventDate),
                    ach.level,
                    ach.medal,
                )
                val rH = max(measureWrappedHeight(titleText, achCols[1] - 10f, achCellPaint) + 6f, 15.5f)
                if (idx % 2 == 1) {
                    c.drawRect(marginX, y, pageW - marginX, y + rH, zebraPaint)
                }
                var cx = marginX
                for (colIdx in rowCells.indices) {
                    c.drawRect(cx, y, cx + achCols[colIdx], y + rH, gridStroke)
                    drawWrappedText(
                        canvas = c,
                        text = rowCells[colIdx],
                        x = cx + 5f,
                        yTop = y + 3f,
                        maxWidth = achCols[colIdx] - 8f,
                        paint = achCellPaint,
                    )
                    cx += achCols[colIdx]
                }
                y += rH
            }
        }

        // Signatory block + footer
        val sigY = (y + 16f).coerceAtMost(pageH - 64f)
        drawSignatoryBlock(
            canvas = c,
            pageW = pageW.toFloat(),
            marginX = marginX,
            yTop = sigY,
            signatoryName = settings.receiptSignatory.ifBlank { "General Secretary" },
            roleLabel = "General Secretary",
        )

        drawPageFooter(
            canvas = c,
            pageW = pageW.toFloat(),
            pageH = pageH.toFloat(),
            text = "Generated by PS-AMS  ·  ${DomainEngine.formatDate(DomainEngine.todayKey())}  ·  Find us on Google Maps: ${ACADEMY_MAPS_URL.removePrefix("https://")}",
        )

        doc.finishPage(page)
    }

    // ---------- 4. Generic Multi-Page A4 Bordered Table Renderer (Defaulters / Reports / Payments) ----------

    private fun renderMultiPageTablePdf(
        doc: PdfDocument,
        settings: AcademySettings,
        docBadgeTitle: String,
        subtitleLeft: String,
        subtitleRight: String,
        colWidths: FloatArray,
        headers: Array<String>,
        rows: List<Array<String>>,
        totalsRow: Array<String>? = null,
        signatoryRole: String = settings.receiptSignatory.ifBlank { "General Secretary" },
        headerFillColor: Int = COLOR_BRAND_ROSE,
        zebraFillColor: Int = COLOR_ZEBRA_ROSE,
    ) {
        val pageW = 595
        val pageH = 842
        val marginX = 32f
        val bottomLimit = pageH - 68f

        val gridStroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = COLOR_GRID_LINE
            style = Paint.Style.STROKE
            strokeWidth = 0.7f
        }
        val headFill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = headerFillColor }
        val zebraFill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = zebraFillColor }
        val totalFill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = COLOR_BG_SUBTLE }

        val headPaint = makeTextPaint(Color.WHITE, 7.5f, bold = true)
        val cellPaint = makeTextPaint(COLOR_TEXT_DARK, 7.6f, bold = false)
        val cellBoldPaint = makeTextPaint(COLOR_TEXT_DARK, 7.8f, bold = true)
        val subPaint = makeTextPaint(COLOR_TEXT_MUTED, 8.0f, bold = false)
        val subRightPaint = makeTextPaint(COLOR_TEXT_MUTED, 8.0f, bold = true, align = Paint.Align.RIGHT)

        val pages = mutableListOf<PdfDocument.Page>()
        var pageNumber = 1
        var currentPage = doc.startPage(PdfDocument.PageInfo.Builder(pageW, pageH, pageNumber).create())
        pages.add(currentPage)
        var c = currentPage.canvas

        fun drawTablePageHeader(firstPage: Boolean): Float {
            var y = drawPcLetterhead(
                canvas = c,
                pageW = pageW.toFloat(),
                marginX = marginX,
                settings = settings,
                docTitle = docBadgeTitle,
                compact = !firstPage,
            )
            c.drawText(subtitleLeft, marginX, y + 8f, subPaint)
            c.drawText(subtitleRight, pageW - marginX, y + 8f, subRightPaint)
            y += 14f

            val headH = 17f
            var cx = marginX
            for (i in headers.indices) {
                c.drawRect(cx, y, cx + colWidths[i], y + headH, headFill)
                c.drawRect(cx, y, cx + colWidths[i], y + headH, gridStroke)
                c.drawText(headers[i], cx + 4f, y + 11.5f, headPaint)
                cx += colWidths[i]
            }
            return y + headH
        }

        var y = drawTablePageHeader(firstPage = true)

        if (rows.isEmpty()) {
            c.drawRect(marginX, y, pageW - marginX, y + 22f, gridStroke)
            c.drawText(
                "No records matching criteria",
                pageW / 2f,
                y + 14f,
                makeTextPaint(COLOR_TEXT_LIGHT, 8.5f, italic = true, align = Paint.Align.CENTER),
            )
            y += 22f
        } else {
            for ((rIdx, row) in rows.withIndex()) {
                var maxCellH = 15.5f
                for (cIdx in row.indices) {
                    val h = measureWrappedHeight(row[cIdx], colWidths[cIdx] - 8f, cellPaint) + 6f
                    if (h > maxCellH) maxCellH = h
                }
                if (y + maxCellH > bottomLimit) {
                    doc.finishPage(currentPage)
                    pageNumber++
                    currentPage = doc.startPage(PdfDocument.PageInfo.Builder(pageW, pageH, pageNumber).create())
                    pages.add(currentPage)
                    c = currentPage.canvas
                    y = drawTablePageHeader(firstPage = false)
                }

                if (rIdx % 2 == 1) {
                    c.drawRect(marginX, y, pageW - marginX, y + maxCellH, zebraFill)
                }
                var cx = marginX
                for (cIdx in row.indices) {
                    c.drawRect(cx, y, cx + colWidths[cIdx], y + maxCellH, gridStroke)
                    val p = if (cIdx == 2) cellBoldPaint else cellPaint
                    drawWrappedText(
                        canvas = c,
                        text = row[cIdx],
                        x = cx + 4f,
                        yTop = y + 3f,
                        maxWidth = colWidths[cIdx] - 7f,
                        paint = p,
                    )
                    cx += colWidths[cIdx]
                }
                y += maxCellH
            }
        }

        if (totalsRow != null) {
            val totH = 18f
            if (y + totH > bottomLimit) {
                doc.finishPage(currentPage)
                pageNumber++
                currentPage = doc.startPage(PdfDocument.PageInfo.Builder(pageW, pageH, pageNumber).create())
                pages.add(currentPage)
                c = currentPage.canvas
                y = drawTablePageHeader(firstPage = false)
            }
            c.drawRect(marginX, y, pageW - marginX, y + totH, totalFill)
            var cx = marginX
            for (cIdx in totalsRow.indices) {
                c.drawRect(cx, y, cx + colWidths[cIdx], y + totH, gridStroke)
                if (totalsRow[cIdx].isNotBlank()) {
                    c.drawText(totalsRow[cIdx], cx + 4f, y + 12f, cellBoldPaint)
                }
                cx += colWidths[cIdx]
            }
            y += totH
        }

        val sigY = (y + 12f).coerceAtMost(pageH - 56f)
        drawSignatoryBlock(
            canvas = c,
            pageW = pageW.toFloat(),
            marginX = marginX,
            yTop = sigY,
            signatoryName = signatoryRole,
            roleLabel = "Authorized Signatory",
        )
        drawPageFooter(
            canvas = c,
            pageW = pageW.toFloat(),
            pageH = pageH.toFloat(),
            text = "Generated by PS-AMS  ·  ${DomainEngine.formatDate(DomainEngine.todayKey())}  ·  Page $pageNumber",
        )
        doc.finishPage(currentPage)
    }

    private fun renderDefaultersPdf(
        doc: PdfDocument,
        payload: PrintPayload.DefaultersReport,
        settings: AcademySettings,
    ) {
        // Total width = 595 - 64 = 531 pt
        val colWidths = floatArrayOf(22f, 68f, 108f, 40f, 125f, 58f, 56f, 54f)
        val headers = arrayOf("#", "Admission", "Student", "Cat.", "Unpaid Months", "Outstanding", "Parent", "Contact")
        val totalDue = payload.rows.sumOf { it.dueAmount }

        val rows = payload.rows.mapIndexed { i, item ->
            val s = item.student
            val mText = item.pendingMonths.joinToString(", ") { DomainEngine.monthLabel(it) }.ifBlank { "—" }
            arrayOf(
                (i + 1).toString(),
                s.admissionNo,
                s.fullName,
                s.ageCategory,
                mText,
                rs(item.dueAmount),
                s.parentName.ifBlank { "—" },
                s.mobile,
            )
        }
        val totalsRow = arrayOf("", "", "", "", "TOTAL OUTSTANDING", rs(totalDue), "", "")

        renderMultiPageTablePdf(
            doc = doc,
            settings = settings,
            docBadgeTitle = "Fee Defaulters Register",
            subtitleLeft = "Generated: ${DomainEngine.formatDate(DomainEngine.todayKey())}",
            subtitleRight = "${payload.rows.size} account(s)  ·  Total Due: ${rs(totalDue)}",
            colWidths = colWidths,
            headers = headers,
            rows = rows,
            totalsRow = totalsRow,
        )
    }

    private fun renderFilteredReportPdf(
        doc: PdfDocument,
        payload: PrintPayload.FilteredReport,
        settings: AcademySettings,
    ) {
        // Total width = 531 pt
        val colWidths = floatArrayOf(20f, 64f, 96f, 34f, 24f, 30f, 30f, 75f, 62f, 50f, 46f)
        val headers = arrayOf("#", "Admission", "Student", "Cat.", "Age", "Ht", "Wt", "BMI / Class", "Sport / Pos", "School", "Mobile")

        val rows = payload.students.mapIndexed { i, s ->
            val bmi = BmiEngine.bmiReportFields(s)
            val sportPos = buildString {
                append(s.primarySport)
                if (!s.playingPosition.isNullOrBlank()) append(" / ${s.playingPosition}")
            }
            arrayOf(
                (i + 1).toString(),
                s.admissionNo,
                s.fullName,
                s.ageCategory,
                DomainEngine.computeAge(s.dateOfBirth).toString(),
                s.heightCm?.toInt()?.toString() ?: "—",
                s.weightKg?.toInt()?.toString() ?: "—",
                bmi.combined,
                sportPos,
                s.schoolName.ifBlank { "—" },
                s.mobile,
            )
        }

        renderMultiPageTablePdf(
            doc = doc,
            settings = settings,
            docBadgeTitle = payload.title.ifBlank { "Player Roster Report" },
            subtitleLeft = payload.subtitle.ifBlank { "Generated: ${DomainEngine.formatDate(DomainEngine.todayKey())}" },
            subtitleRight = "${payload.students.size} record(s)",
            colWidths = colWidths,
            headers = headers,
            rows = rows,
            headerFillColor = COLOR_EXEC_BLUE,
            zebraFillColor = COLOR_ZEBRA_BLUE,
        )
    }

    private fun renderPaymentHistoryPdf(
        doc: PdfDocument,
        payload: PrintPayload.PaymentHistoryReport,
        settings: AcademySettings,
    ) {
        // Total width = 531 pt
        val colWidths = floatArrayOf(22f, 82f, 62f, 64f, 102f, 95f, 50f, 54f)
        val headers = arrayOf("#", "Receipt No", "Date", "Adm No", "Student", "Months Paid", "Mode", "Amount")
        val total = payload.payments.sumOf { it.amount }

        val rows = payload.payments.mapIndexed { i, p ->
            val mText = DomainEngine.parsePaidMonths(p.months).joinToString(", ") { DomainEngine.monthLabel(it) }
            arrayOf(
                (i + 1).toString(),
                p.receiptNo,
                DomainEngine.formatDate(p.paymentDate),
                p.admissionNo ?: "—",
                p.studentName ?: "—",
                mText.ifBlank { "—" },
                p.paymentMode,
                rs(p.amount),
            )
        }
        val totalsRow = arrayOf("", "", "", "", "", "TOTAL COLLECTED", "", rs(total))

        renderMultiPageTablePdf(
            doc = doc,
            settings = settings,
            docBadgeTitle = payload.title.ifBlank { "Fee Collection Register" },
            subtitleLeft = "Generated: ${DomainEngine.formatDate(DomainEngine.todayKey())}",
            subtitleRight = "${payload.payments.size} receipt(s)  ·  Total: ${rs(total)}",
            colWidths = colWidths,
            headers = headers,
            rows = rows,
            totalsRow = totalsRow,
            headerFillColor = COLOR_EXEC_BLUE,
            zebraFillColor = COLOR_ZEBRA_BLUE,
        )
    }

    private fun renderBlankAttendancePdf(
        doc: PdfDocument,
        payload: PrintPayload.BlankAttendanceSheet,
        settings: AcademySettings,
    ) {
        val pageW = 842 // A4 Landscape
        val pageH = 595
        val marginX = 28f
        val pageInfo = PdfDocument.PageInfo.Builder(pageW, pageH, 1).create()
        val page = doc.startPage(pageInfo)
        val c = page.canvas

        var y = drawPcLetterhead(
            canvas = c,
            pageW = pageW.toFloat(),
            marginX = marginX,
            settings = settings,
            docTitle = "Monthly Attendance Register",
            compact = true,
        )

        val subPaint = makeTextPaint(COLOR_TEXT_DARK, 8.5f, bold = true)
        c.drawText(
            "Month: ${payload.monthLabel}   ·   Batch: ${payload.batch}   ·   Category: ${payload.category}   ·   Roster: ${payload.students.size} Athletes",
            marginX,
            y + 9f,
            subPaint,
        )
        y += 15f

        val gridStroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = COLOR_GRID_LINE
            style = Paint.Style.STROKE
            strokeWidth = 0.65f
        }
        val headFill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = COLOR_BRAND_ROSE }
        val zebraFill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = COLOR_ZEBRA_ROSE }
        val headText = makeTextPaint(Color.WHITE, 6.8f, bold = true, align = Paint.Align.CENTER)
        val headLeftText = makeTextPaint(Color.WHITE, 7.2f, bold = true)
        val cellText = makeTextPaint(COLOR_TEXT_DARK, 7.2f)

        val numW = 18f
        val admW = 54f
        val nameW = 118f
        val dayW = (pageW - marginX * 2f - numW - admW - nameW) / 31f
        val rowH = 15.5f

        // Header row
        c.drawRect(marginX, y, pageW - marginX, y + rowH, headFill)
        c.drawRect(marginX, y, marginX + numW, y + rowH, gridStroke)
        c.drawText("#", marginX + numW / 2f, y + 10.5f, headText)

        c.drawRect(marginX + numW, y, marginX + numW + admW, y + rowH, gridStroke)
        c.drawText("Adm No", marginX + numW + 4f, y + 10.5f, headLeftText)

        c.drawRect(marginX + numW + admW, y, marginX + numW + admW + nameW, y + rowH, gridStroke)
        c.drawText("Player Name", marginX + numW + admW + 4f, y + 10.5f, headLeftText)

        for (d in 1..31) {
            val dx = marginX + numW + admW + nameW + (d - 1) * dayW
            c.drawRect(dx, y, dx + dayW, y + rowH, gridStroke)
            c.drawText(d.toString(), dx + dayW / 2f, y + 10.5f, headText)
        }
        y += rowH

        for ((idx, s) in payload.students.take(26).withIndex()) {
            if (idx % 2 == 1) {
                c.drawRect(marginX, y, pageW - marginX, y + rowH, zebraFill)
            }
            c.drawRect(marginX, y, marginX + numW, y + rowH, gridStroke)
            c.drawText((idx + 1).toString(), marginX + 4f, y + 10.5f, cellText)

            c.drawRect(marginX + numW, y, marginX + numW + admW, y + rowH, gridStroke)
            c.drawText(s.admissionNo, marginX + numW + 3f, y + 10.5f, cellText)

            c.drawRect(marginX + numW + admW, y, marginX + numW + admW + nameW, y + rowH, gridStroke)
            c.drawText(s.fullName.take(22), marginX + numW + admW + 4f, y + 10.5f, cellText)

            for (d in 1..31) {
                val dx = marginX + numW + admW + nameW + (d - 1) * dayW
                c.drawRect(dx, y, dx + dayW, y + rowH, gridStroke)
            }
            y += rowH
        }

        drawSignatoryBlock(
            canvas = c,
            pageW = pageW.toFloat(),
            marginX = marginX,
            yTop = (y + 8f).coerceAtMost(pageH - 48f),
            signatoryName = "Coach / Session In-charge",
            roleLabel = "Coach / Session In-charge",
        )
        drawPageFooter(
            canvas = c,
            pageW = pageW.toFloat(),
            pageH = pageH.toFloat(),
            text = "Generated by PS-AMS  ·  ${DomainEngine.formatDate(DomainEngine.todayKey())}",
        )

        doc.finishPage(page)
    }

    // ---------- Excel (.xlsx) & CSV Exporters ----------

    fun exportStudentsToXlsx(context: Context, students: List<Student>, title: String = "PS-AMS-Students"): File {
        val headers = listOf(
            "#", "Admission No", "Full Name", "Gender", "DOB", "Age", "Category", "Batch",
            "Sport", "Position", "Height (cm)", "Weight (kg)", "BMI", "WHO BMI Category",
            "Standing Reach (cm)", "Spike Reach (cm)", "Jump Gain (cm)", "Block Reach (cm)",
            "Blood Group", "School", "Class", "Division", "Parent / Guardian", "Mobile",
            "Emergency Contact", "Monthly Fee (INR)", "Status", "Joined Date"
        )
        val rows = students.mapIndexed { i, s ->
            val bmi = BmiEngine.bmiReportFields(s)
            val gain = DomainEngine.jumpDelta(s.spikeReachCm, s.standingReachCm)
            listOf(
                (i + 1).toString(),
                s.admissionNo,
                s.fullName,
                s.gender,
                DomainEngine.formatDate(s.dateOfBirth),
                DomainEngine.computeAge(s.dateOfBirth).toString(),
                s.ageCategory,
                s.trainingBatch,
                s.primarySport,
                s.playingPosition ?: "—",
                s.heightCm?.toString() ?: "—",
                s.weightKg?.toString() ?: "—",
                bmi.value,
                bmi.classification,
                s.standingReachCm?.toString() ?: "—",
                s.spikeReachCm?.toString() ?: "—",
                gain?.let { "+${it.toInt()}" } ?: "—",
                s.jumpReachCm?.toString() ?: "—",
                s.bloodGroup,
                s.schoolName,
                s.classGrade,
                s.division,
                s.parentName,
                s.mobile,
                s.emergencyContact ?: "—",
                s.monthlyFee.toInt().toString(),
                s.status,
                DomainEngine.formatDate(s.registrationDate),
            )
        }
        return writeOoxmlWorkbook(
            context = context,
            fileName = "${DomainEngine.sanitizeFileName(title)}-${DomainEngine.todayKey()}.xlsx",
            sheetName = "Students",
            headers = headers,
            rows = rows,
        )
    }

    fun exportPaymentsToXlsx(context: Context, payments: List<FeePayment>, title: String = "PS-AMS-Fee-Payments"): File {
        val headers = listOf(
            "#", "Receipt No", "Date", "Admission No", "Student Name",
            "Category", "Gender", "Months Paid", "Mode", "Amount (INR)", "Remarks"
        )
        val rows = payments.mapIndexed { i, p ->
            val months = DomainEngine.parsePaidMonths(p.months).joinToString(", ") { DomainEngine.monthLabel(it) }
            listOf(
                (i + 1).toString(),
                p.receiptNo,
                DomainEngine.formatDate(p.paymentDate),
                p.admissionNo ?: "—",
                p.studentName ?: "—",
                p.ageCategory ?: "—",
                p.gender ?: "—",
                months,
                p.paymentMode,
                p.amount.toInt().toString(),
                p.remarks ?: "",
            )
        }
        return writeOoxmlWorkbook(
            context = context,
            fileName = "${DomainEngine.sanitizeFileName(title)}-${DomainEngine.todayKey()}.xlsx",
            sheetName = "Fee Payments",
            headers = headers,
            rows = rows,
        )
    }

    fun exportStudentsToCsv(context: Context, students: List<Student>, title: String = "PS-AMS-Students"): File {
        val headers = listOf(
            "Admission No", "Full Name", "Gender", "DOB", "Age", "Category", "Batch",
            "Sport", "Position", "Height (cm)", "Weight (kg)", "BMI", "WHO BMI Category",
            "School", "Parent", "Mobile", "Monthly Fee", "Status"
        )
        val rows = students.map { s ->
            val bmi = BmiEngine.bmiReportFields(s)
            listOf(
                s.admissionNo,
                s.fullName,
                s.gender,
                s.dateOfBirth,
                DomainEngine.computeAge(s.dateOfBirth).toString(),
                s.ageCategory,
                s.trainingBatch,
                s.primarySport,
                s.playingPosition ?: "",
                s.heightCm?.toString() ?: "",
                s.weightKg?.toString() ?: "",
                bmi.value,
                bmi.classification,
                s.schoolName,
                s.parentName,
                s.mobile,
                s.monthlyFee.toString(),
                s.status,
            )
        }
        val outDir = File(context.cacheDir, "exports").apply { mkdirs() }
        val outFile = File(outDir, "${DomainEngine.sanitizeFileName(title)}-${DomainEngine.todayKey()}.csv")
        val csvText = buildString {
            append("\uFEFF") // UTF-8 BOM matching PC app exportCSV
            appendLine(headers.joinToString(",") { escapeCsv(it) })
            for (r in rows) {
                appendLine(r.joinToString(",") { escapeCsv(csvSafe(it)) })
            }
        }
        outFile.writeText(csvText, Charsets.UTF_8)
        return outFile
    }

    /** Neutralize spreadsheet formula injection matching PC app PS-038. */
    private fun csvSafe(value: String): String =
        if (value.isNotEmpty() && (value[0] == '=' || value[0] == '+' || value[0] == '-' || value[0] == '@' || value[0] == '\t' || value[0] == '\r')) {
            "'$value"
        } else {
            value
        }

    private fun escapeCsv(v: String): String {
        val needsQuotes = v.contains(',') || v.contains('"') || v.contains('\n')
        return if (needsQuotes) "\"${v.replace("\"", "\"\"")}\"" else v
    }

    private fun xmlEscape(s: String): String = s
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;")
        .replace("'", "&apos;")

    private fun colLetter(colIndex0: Int): String {
        var n = colIndex0 + 1
        val sb = StringBuilder()
        while (n > 0) {
            val rem = (n - 1) % 26
            sb.insert(0, ('A'.code + rem).toChar())
            n = (n - 1) / 26
        }
        return sb.toString()
    }

    /** Writes a standards-compliant OpenXML (.xlsx) workbook with zero external dependencies. */
    private fun writeOoxmlWorkbook(
        context: Context,
        fileName: String,
        sheetName: String,
        headers: List<String>,
        rows: List<List<String>>,
    ): File {
        val outDir = File(context.cacheDir, "exports").apply { mkdirs() }
        val outFile = File(outDir, fileName)

        ZipOutputStream(FileOutputStream(outFile)).use { zip ->
            fun putXml(path: String, xml: String) {
                zip.putNextEntry(ZipEntry(path))
                zip.write(xml.toByteArray(Charsets.UTF_8))
                zip.closeEntry()
            }

            putXml(
                "[Content_Types].xml",
                """
                <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
                  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
                  <Default Extension="xml" ContentType="application/xml"/>
                  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
                  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
                </Types>
                """.trimIndent()
            )

            putXml(
                "_rels/.rels",
                """
                <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
                  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
                </Relationships>
                """.trimIndent()
            )

            putXml(
                "xl/workbook.xml",
                """
                <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
                  <sheets>
                    <sheet name="${xmlEscape(sheetName)}" sheetId="1" r:id="rId1"/>
                  </sheets>
                </workbook>
                """.trimIndent()
            )

            putXml(
                "xl/_rels/workbook.xml.rels",
                """
                <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
                  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
                </Relationships>
                """.trimIndent()
            )

            val sheetXml = StringBuilder().apply {
                append("""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>""")
                append("""<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>""")
                val allRows = listOf(headers) + rows
                for ((rIdx, row) in allRows.withIndex()) {
                    val rNum = rIdx + 1
                    append("""<row r="$rNum">""")
                    for ((cIdx, cellVal) in row.withIndex()) {
                        val ref = "${colLetter(cIdx)}$rNum"
                        append("""<c r="$ref" t="inlineStr"><is><t>${xmlEscape(cellVal)}</t></is></c>""")
                    }
                    append("""</row>""")
                }
                append("""</sheetData></worksheet>""")
            }.toString()

            putXml("xl/worksheets/sheet1.xml", sheetXml)
        }
        return outFile
    }
}
