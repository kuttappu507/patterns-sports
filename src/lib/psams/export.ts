"use client"

// ============================================================
// PS-AMS :: Client-side export pipelines
//  - Excel (.xlsx) via ExcelJS
//  - CSV via PapaParse
//  - PDF via jsPDF + AutoTable
// ============================================================

import ExcelJS from "exceljs"
import Papa from "papaparse"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import { saveAs } from "file-saver"
import { formatINR, monthLabel, parsePaidMonths, computeAge, computeBMI, ageDetailed, categoryBracket, formatDate, ACADEMY_MAPS_URL } from "./domain"
import type { AcademySettings, Achievement, FeePayment, Student } from "./types"
import { mediaUrl } from "./api"

function timestamp(): string {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`
}

export type ExportRow = Record<string, string | number | null | undefined>

/**
 * Persist a generated document. In the Tauri desktop shell a native
 * Save dialog is used (WebView2 blocks anchor downloads); on the web
 * this falls back to file-saver.
 */
async function saveBlob(blob: Blob, fileName: string): Promise<void> {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    try {
      const { save } = await import("@tauri-apps/plugin-dialog")
      const { writeFile } = await import("@tauri-apps/plugin-fs")
      const target = await save({ defaultPath: fileName })
      if (target) {
        await writeFile(target, new Uint8Array(await blob.arrayBuffer()))
        return
      }
    } catch {
      /* fall through to browser download */
    }
  }
  saveAs(blob, fileName)
}

// ---------------- Excel ----------------

export async function exportExcel(opts: {
  sheetName: string
  fileName: string
  title: string
  subtitle?: string
  academy?: Pick<AcademySettings, "academyName" | "address" | "phone">
  columns: { header: string; key: string; width?: number }[]
  rows: ExportRow[]
  totalsRow?: ExportRow
}) {
  const wb = new ExcelJS.Workbook()
  wb.creator = "PS-AMS"
  const ws = wb.addWorksheet(opts.sheetName.slice(0, 30))

  // Letterhead block
  const colCount = Math.max(opts.columns.length, 1)
  ws.mergeCells(1, 1, 1, colCount)
  const t1 = ws.getCell(1, 1)
  t1.value = opts.academy ? opts.academy.academyName : "Pattern Sports Academy"
  t1.font = { size: 16, bold: true, color: { argb: "FF0F3B66" } }
  t1.alignment = { horizontal: "center" }
  ws.getRow(1).height = 24

  ws.mergeCells(2, 1, 2, colCount)
  const t2 = ws.getCell(2, 1)
  t2.value = [opts.academy?.address, opts.academy?.phone].filter(Boolean).join("  ·  ") || "Sports Academy Management"
  t2.font = { size: 10, color: { argb: "FF666666" } }
  t2.alignment = { horizontal: "center" }

  ws.mergeCells(3, 1, 3, colCount)
  const t3 = ws.getCell(3, 1)
  t3.value = opts.title
  t3.font = { size: 12, bold: true }
  t3.alignment = { horizontal: "center" }

  if (opts.subtitle) {
    ws.mergeCells(4, 1, 4, colCount)
    const t4 = ws.getCell(4, 1)
    t4.value = opts.subtitle
    t4.font = { size: 9, italic: true, color: { argb: "FF888888" } }
    t4.alignment = { horizontal: "center" }
  }

  const headerRowIndex = 6
  const headerRow = ws.getRow(headerRowIndex)
  headerRow.values = opts.columns.map((c) => c.header)
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 }
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F6FB2" } }
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true }
    cell.border = { bottom: { style: "thin", color: { argb: "FFCCCCCC" } } }
  })
  headerRow.height = 20

  opts.rows.forEach((r, i) => {
    const row = ws.getRow(headerRowIndex + 1 + i)
    row.values = opts.columns.map((c) => {
      const v = r[c.key]
      return v === null || v === undefined ? "" : v
    })
    if (i % 2 === 1) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F8FC" } }
      })
    }
    row.eachCell((cell) => {
      cell.font = { size: 10 }
      cell.alignment = { vertical: "middle", wrapText: false }
    })
  })

  if (opts.totalsRow) {
    const row = ws.getRow(headerRowIndex + 1 + opts.rows.length)
    row.values = opts.columns.map((c) => {
      const v = opts.totalsRow?.[c.key]
      return v === null || v === undefined ? "" : v
    })
    row.eachCell((cell) => {
      cell.font = { bold: true, size: 10 }
      cell.border = { top: { style: "double", color: { argb: "FF1F6FB2" } } }
    })
  }

  opts.columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width ?? Math.max(c.header.length + 4, 14)
  })

  const buf = await wb.xlsx.writeBuffer()
  await saveBlob(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${opts.fileName}-${timestamp()}.xlsx`
  )
}

// ---------------- CSV ----------------

export async function exportCSV(fileName: string, columns: { header: string; key: string }[], rows: ExportRow[]) {
  const data = rows.map((r) => {
    const o: Record<string, string | number> = {}
    columns.forEach((c) => {
      const v = r[c.key]
      o[c.header] = v === null || v === undefined ? "" : v
    })
    return o
  })
  const csv = Papa.unparse(data)
  await saveBlob(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }), `${fileName}-${timestamp()}.csv`)
}

// ---------------- PDF ----------------

export async function exportPDF(opts: {
  fileName: string
  title: string
  subtitle?: string
  academy?: Pick<AcademySettings, "academyName" | "address" | "phone">
  columns: { header: string; key: string; width?: number }[]
  rows: ExportRow[]
  totalsRow?: ExportRow
  orientation?: "p" | "l"
  footnote?: string
}) {
  const doc = new jsPDF({ orientation: opts.orientation ?? "p", unit: "mm", format: "a4" })
  const pageW = doc.internal.pageSize.getWidth()

  // Letterhead
  const academyName = opts.academy?.academyName || "Pattern Sports Academy"
  doc.setFillColor(31, 111, 178)
  doc.rect(0, 0, pageW, 22, "F")
  doc.setTextColor(255, 255, 255)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(15)
  doc.text(academyName, pageW / 2, 9, { align: "center" })
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  const contact = [opts.academy?.address, opts.academy?.phone].filter(Boolean).join("  |  ")
  if (contact) doc.text(contact, pageW / 2, 15, { align: "center" })

  doc.setTextColor(30, 30, 30)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.text(opts.title, pageW / 2, 31, { align: "center" })
  let afterTitle = 35
  if (opts.subtitle) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    doc.setTextColor(110, 110, 110)
    doc.text(opts.subtitle, pageW / 2, 35.5, { align: "center" })
    afterTitle = 39
  }
  doc.setDrawColor(31, 111, 178)
  doc.line(14, afterTitle + 1, pageW - 14, afterTitle + 1)

  autoTable(doc, {
    startY: afterTitle + 4,
    head: [opts.columns.map((c) => c.header)],
    body: opts.rows.map((r) => opts.columns.map((c) => String(r[c.key] ?? ""))),
    ...(opts.totalsRow
      ? { foot: [opts.columns.map((c) => String(opts.totalsRow?.[c.key] ?? ""))] }
      : {}),
    styles: { fontSize: 8, cellPadding: 2, overflow: "linebreak" },
    headStyles: { fillColor: [31, 111, 178], textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: [240, 244, 248], textColor: [30, 30, 30], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [244, 248, 252] },
    margin: { left: 12, right: 12 },
  })

  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(140, 140, 140)
    doc.text(
      `${opts.footnote ?? "Generated by PS-AMS"}  ·  Page ${i} of ${pageCount}`,
      pageW / 2,
      doc.internal.pageSize.getHeight() - 6,
      { align: "center" }
    )
  }

  await saveBlob(doc.output("blob"), `${opts.fileName}-${timestamp()}.pdf`)
}

/* =================== document exports (receipt / profile) =================== */

/**
 * ₹ (U+20B9) is NOT in jsPDF's standard WinAnsi fonts — it renders as
 * garbage on paper. PDF documents therefore use the "Rs." convention
 * that Indian fee receipts commonly print.
 */
function rs(n: number | null | undefined): string {
  return formatINR(n).replace("₹", "Rs. ")
}

function inWords(n: number): string {
  // Indian numbering — rupees in words for the receipt total.
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]
  const two = (x: number): string => (x < 20 ? ones[x] : `${tens[Math.floor(x / 10)]}${x % 10 ? " " + ones[x % 10] : ""}`)
  const three = (x: number): string =>
    x >= 100 ? `${ones[Math.floor(x / 100)]} Hundred${x % 100 ? " " + two(x % 100) : ""}` : two(x)
  const num = Math.round(Math.abs(n))
  if (num === 0) return "Zero Rupees Only"
  const parts: string[] = []
  const crore = Math.floor(num / 10000000)
  const lakh = Math.floor((num % 10000000) / 100000)
  const thousand = Math.floor((num % 100000) / 1000)
  const rest = num % 1000
  if (crore) parts.push(`${three(crore)} Crore`)
  if (lakh) parts.push(`${three(lakh)} Lakh`)
  if (thousand) parts.push(`${three(thousand)} Thousand`)
  if (rest) parts.push(three(rest))
  return `${parts.join(" ")} Rupees Only`
}

/** Shared letterhead matching the printed letterhead (Watermelon Sorbet brand). */
function drawLetterhead(doc: jsPDF, academy: AcademySettings | null, docTitle: string): number {
  const pageW = doc.internal.pageSize.getWidth()
  const brand: [number, number, number] = [239, 71, 111] // #EF476F
  const ink: [number, number, number] = [7, 59, 76] // #073B4C

  doc.setFont("helvetica", "bold")
  doc.setFontSize(15)
  doc.setTextColor(...ink)
  doc.text(academy?.academyName || "Pattern Sports Academy", pageW / 2, 12, { align: "center" })

  let y = 16.5
  const meta = [academy?.tagline, [academy?.address, academy?.phone && `Ph: ${academy.phone}`, academy?.email].filter(Boolean).join("  ·  ")]
    .filter(Boolean)
    .join("  —  ")
  if (meta) {
    doc.setFont("helvetica", "italic")
    doc.setFontSize(7.5)
    doc.setTextColor(90, 90, 90)
    doc.text(doc.splitTextToSize(meta, pageW - 24), pageW / 2, y, { align: "center" })
    y += 3.5 * Math.min(2, doc.splitTextToSize(meta, pageW - 24).length)
  }

  doc.setFillColor(...brand)
  doc.roundedRect(pageW / 2 - 32, y, 64, 6.5, 1.2, 1.2, "F")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.setTextColor(255, 255, 255)
  doc.text(docTitle.toUpperCase(), pageW / 2, y + 4.5, { align: "center" })
  doc.setDrawColor(...brand)
  doc.setLineWidth(0.5)
  doc.line(12, y + 9.5, pageW - 12, y + 9.5)
  return y + 14
}

/**
 * TRUE A5 fee receipt as a downloadable PDF file (148 × 210 mm portrait).
 * Also used as the document attachment on one-click WhatsApp dispatch.
 */
export async function buildReceiptPdfA5(
  receipt: FeePayment & { studentName?: string; admissionNo?: string },
  settings: AcademySettings | null,
): Promise<Blob> {
  const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a5" })
  const pageW = doc.internal.pageSize.getWidth()
  const months = parsePaidMonths(receipt.months || "[]")

  let y = drawLetterhead(doc, settings, "Fee Payment Receipt")

  // receipt meta
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(60, 60, 60)
  doc.text(`Receipt No:`, 14, y)
  doc.setFont("helvetica", "bold")
  doc.text(receipt.receiptNo, 38, y)
  doc.setFont("helvetica", "normal")
  doc.text(`Date:`, pageW - 52, y)
  doc.setFont("helvetica", "bold")
  doc.text(formatDate(receipt.paymentDate), pageW - 38, y)
  y += 7

  // detail rows
  const rows: [string, string][] = [
    ["Received From", `${receipt.studentName || ""}  (${receipt.admissionNo || ""})`],
    ["Towards", `Academy fee${months.length > 1 ? "s" : ""} for ${months.map(monthLabel).join(", ")}`],
    ["Payment Mode", receipt.paymentMode],
  ]
  if (receipt.notes) rows.push(["Remarks", receipt.notes])
  for (const [label, value] of rows) {
    doc.setDrawColor(210, 214, 219)
    doc.setLineWidth(0.2)
    doc.line(14, y - 3.4, pageW - 14, y - 3.4)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(7)
    doc.setTextColor(130, 130, 130)
    doc.text(label.toUpperCase(), 14, y)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9.5)
    doc.setTextColor(25, 25, 25)
    const lines = doc.splitTextToSize(value, pageW - 58)
    doc.text(lines, 52, y)
    y += 5 + 3.6 * (lines.length - 1) + 1.2
  }
  y += 2

  // amount banner
  doc.setFillColor(245, 247, 250)
  doc.setDrawColor(30, 30, 30)
  doc.setLineWidth(0.5)
  doc.roundedRect(14, y, pageW - 28, 14, 1.5, 1.5, "FD")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(8)
  doc.setTextColor(90, 90, 90)
  doc.text("TOTAL AMOUNT PAID", 17, y + 5.5)
  doc.setFontSize(8)
  doc.text(inWords(Number(receipt.amount)), 17, y + 10.5)
  doc.setFontSize(17)
  doc.setTextColor(7, 59, 76)
  doc.text(rs(receipt.amount), pageW - 17, y + 9, { align: "right" })
  y += 19

  doc.setFont("helvetica", "italic")
  doc.setFontSize(7.5)
  doc.setTextColor(120, 120, 120)
  doc.text("Fees once paid are non-refundable. Please retain this receipt for future reference.", 14, y)
  y += 4

  // signatory
  doc.setDrawColor(110, 110, 110)
  doc.setLineWidth(0.3)
  doc.line(pageW - 62, y + 8, pageW - 14, y + 8)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(60, 60, 60)
  doc.text(settings?.receiptSignatory || "Authorized Signatory", pageW - 38, y + 11.5, { align: "center" })
  doc.setFont("helvetica", "normal")
  doc.setFontSize(6.5)
  doc.setTextColor(130, 130, 130)

  // footer
  doc.setFontSize(6.5)
  doc.setTextColor(150, 150, 150)
  doc.text(`Generated by PS-AMS  ·  Find us on Google Maps: ${ACADEMY_MAPS_URL.replace("https://", "")}`, pageW / 2, doc.internal.pageSize.getHeight() - 6, { align: "center" })

  return doc.output("blob")
}

/** Convenience: build AND download the A5 receipt PDF. */
export async function receiptPdfA5(
  receipt: FeePayment & { studentName?: string; admissionNo?: string },
  settings: AcademySettings | null,
): Promise<void> {
  const blob = await buildReceiptPdfA5(receipt, settings)
  await saveBlob(blob, `PS-AMS-Receipt-${receipt.receiptNo}.pdf`)
}

/**
 * TRUE A4 player profile card as a downloadable PDF (210 × 297 mm portrait).
 * Embeds the student photo when reachable, falls back to a monogram box.
 */
export async function profilePdfA4(
  student: Student & { achievements?: Achievement[] },
  achievements: Achievement[],
  settings: AcademySettings | null,
): Promise<void> {
  const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" })
  const pageW = doc.internal.pageSize.getWidth()
  const bmi = computeBMI(student.weightKg, student.heightCm)

  const y0 = drawLetterhead(doc, settings, "Player Profile Card")

  // ---- photo (best effort) + identity table ----
  let photoData: string | null = null
  let photoRatio = 0.75
  if (student.photoPath) {
    try {
      const res = await fetch(mediaUrl(student.photoPath))
      if (res.ok) {
        const buf = await res.arrayBuffer()
        const b64 = arrayBufferToBase64(buf)
        // sniff mime from the first bytes (png/jpeg) — jsPDF needs the right format
        const view = new Uint8Array(buf)
        const isPng = view[0] === 0x89 && view[1] === 0x50
        photoData = `data:image/${isPng ? "png" : "jpeg"};base64,${b64}`
        // natural aspect via a temp Image
        photoRatio = await new Promise<number>((resolve) => {
          const img = new Image()
          img.onload = () => resolve(img.naturalWidth / img.naturalHeight || 0.75)
          img.onerror = () => resolve(0.75)
          img.src = photoData!
        })
      }
    } catch {
      photoData = null
    }
  }

  const photoH = 34
  const photoW = photoH * photoRatio
  if (photoData) {
    try {
      doc.addImage(photoData, photoData.includes("image/png") ? "PNG" : "JPEG", 14, y0, photoW, photoH)
    } catch {
      /* unreadable image — fall through to monogram */
      doc.setFillColor(245, 247, 250)
      doc.rect(14, y0, photoW, photoH, "F")
    }
  } else {
    doc.setFillColor(245, 247, 250)
    doc.rect(14, y0, photoW, photoH, "F")
    doc.setFont("helvetica", "bold")
    doc.setFontSize(16)
    doc.setTextColor(180, 185, 190)
    doc.text(
      student.fullName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase(),
      14 + photoW / 2,
      y0 + photoH / 2 + 2,
      { align: "center" }
    )
  }
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(80, 80, 80)
  doc.text(student.admissionNo, 14 + photoW / 2, y0 + photoH + 3.5, { align: "center" })

  const idRows: [string, string][] = [
    ["Full Name", student.fullName],
    ["Date of Birth", `${formatDate(student.dateOfBirth)}  (${ageDetailed(student.dateOfBirth)})`],
    ["Gender", student.gender || "—"],
    ["Age Category", `${student.ageCategory} — ${categoryBracket(student.ageCategory)}`],
    ["Parent / Guardian", student.parentName],
    ["Contact", `${student.mobile}${student.emergencyContact ? "  ·  Emergency: " + student.emergencyContact : ""}`],
    ["Address", student.address || "—"],
    ["School / Class", `${student.schoolName || "—"}${student.classGrade ? "  ·  Class " + student.classGrade : ""}${student.division ? " · Div " + student.division : ""}`],
    ["Blood Group", student.bloodGroup || "—"],
  ]
  autoTable(doc, {
    startY: y0,
    margin: { left: 14 + photoW + 4, right: 14 },
    theme: "grid",
    styles: { fontSize: 7.6, cellPadding: 1.1, lineColor: [210, 214, 219], lineWidth: 0.15 },
    columnStyles: {
      0: { cellWidth: 26, fontStyle: "bold", fillColor: [245, 247, 250], textColor: [110, 110, 110] },
    },
    body: idRows.map(([k, v]) => [k, v]),
  })

  type WithAuto = jsPDF & { lastAutoTable?: { finalY: number } }
  let y = ((doc as WithAuto).lastAutoTable?.finalY ?? y0 + photoH) + 6
  y = Math.max(y, y0 + photoH + 9)

  // ---- athletic & biometric metrics ----
  doc.setFont("helvetica", "bold")
  doc.setFontSize(8)
  doc.setTextColor(239, 71, 111)
  doc.text("ATHLETIC & BIOMETRIC PARAMETERS", 14, y)
  y += 2
  const metrics: [string, string][] = [
    ["Height", student.heightCm ? `${student.heightCm} cm` : "—"],
    ["Weight", student.weightKg ? `${student.weightKg} kg` : "—"],
    ["BMI", bmi !== null ? bmi.toFixed(1) : "—"],
    ["Standing Reach", student.standingReachCm ? `${student.standingReachCm} cm` : "—"],
    ["Spike Reach", student.spikeReachCm ? `${student.spikeReachCm} cm` : "—"],
    ["Jump Reach", student.jumpReachCm ? `${student.jumpReachCm} cm` : "—"],
  ]
  autoTable(doc, {
    startY: y,
    margin: { left: 14, right: 14 },
    theme: "grid",
    styles: { fontSize: 7.6, cellPadding: 1.4, halign: "center", lineColor: [210, 214, 219], lineWidth: 0.15 },
    headStyles: { fillColor: [245, 247, 250], textColor: [110, 110, 110], fontSize: 6.4 },
    head: [metrics.map(([k]) => k)],
    body: [metrics.map(([, v]) => v)],
  })
  y = ((doc as WithAuto).lastAutoTable?.finalY ?? y) + 4.5

  // sport chips
  doc.setFont("helvetica", "normal")
  doc.setFontSize(7.6)
  doc.setTextColor(60, 60, 60)
  const chips = [
    `Primary Sport: ${student.primarySport}`,
    `Position: ${student.playingPosition || "—"}`,
    `Training Batch: ${student.trainingBatch || "—"}`,
    `Gender: ${student.gender || "—"}`,
    `Registered: ${formatDate(student.registrationDate)} (${computeAge(student.dateOfBirth)} yrs)`,
  ].join("    |    ")
  doc.text(doc.splitTextToSize(chips, pageW - 28), 14, y)
  y += 8

  // ---- achievements ----
  doc.setFont("helvetica", "bold")
  doc.setFontSize(8)
  doc.setTextColor(239, 71, 111)
  doc.text("ACHIEVEMENTS & CAREER MILESTONES", 14, y)
  autoTable(doc, {
    startY: y + 2,
    margin: { left: 14, right: 14 },
    theme: "grid",
    styles: { fontSize: 7.4, cellPadding: 1.1, lineColor: [210, 214, 219], lineWidth: 0.15 },
    headStyles: { fillColor: [239, 71, 111], textColor: 255, fontSize: 7.2 },
    alternateRowStyles: { fillColor: [253, 244, 242] },
    head: [["#", "Tournament / Milestone", "Date", "Level", "Medal"]],
    body:
      achievements.length === 0
        ? [["—", "No achievements recorded", "—", "—", "—"]]
        : achievements.map((a, i) => [
            String(i + 1),
            `${a.tournamentName}${a.notes ? " — " + a.notes : ""}`,
            formatDate(a.eventDate),
            a.level,
            a.medal,
          ]),
    columnStyles: { 0: { cellWidth: 8 } },
  })

  // ---- signatory + footer ----
  const endY = (doc as WithAuto).lastAutoTable?.finalY ?? y
  const sigY = Math.min(endY + 10, doc.internal.pageSize.getHeight() - 30)
  doc.setDrawColor(110, 110, 110)
  doc.setLineWidth(0.3)
  doc.line(pageW - 64, sigY, pageW - 14, sigY)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(60, 60, 60)
  doc.text(settings?.receiptSignatory || "General Secretary", pageW - 39, sigY + 3.5, { align: "center" })
  doc.setFont("helvetica", "normal")
  doc.setFontSize(6.5)
  doc.setTextColor(130, 130, 130)
  doc.text("General Secretary", pageW - 39, sigY + 6.5, { align: "center" })

  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(6.5)
    doc.setTextColor(150, 150, 150)
    doc.text(
      `Generated by PS-AMS  ·  ${formatDate(new Date())}  ·  Find us on Google Maps: ${ACADEMY_MAPS_URL.replace("https://", "")}`,
      pageW / 2,
      doc.internal.pageSize.getHeight() - 6,
      { align: "center" }
    )
  }

  await saveBlob(doc.output("blob"), `PS-AMS-Profile-${student.admissionNo}.pdf`)
}

/** Base64 (no data: prefix) — used to hand PDFs to the WhatsApp engine. */
export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ""
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}
