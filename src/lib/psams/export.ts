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
import type { AcademySettings } from "./types"

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
