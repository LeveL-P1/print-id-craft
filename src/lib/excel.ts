import ExcelJS from "exceljs"
import { MAX_IMPORT_ROWS, normalizeImportedRows, sanitizeWorksheetData } from "./spreadsheet-safety"

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return ""
  if (typeof value === "object" && "text" in (value as object)) {
    return String((value as { text?: string }).text ?? "")
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value)
}

export async function parseExcelBuffer(buffer: Buffer): Promise<Record<string, string>[]> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer)
  const sheet = workbook.worksheets[0]
  if (!sheet) {
    throw new Error("Empty file - no sheets found.")
  }

  const headerRow = sheet.getRow(1)
  const headers: string[] = []
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = cellText(cell.value).trim()
  })

  const rows: Record<string, string>[] = []
  const maxRow = Math.min(sheet.rowCount || 0, MAX_IMPORT_ROWS + 1)

  for (let rowNumber = 2; rowNumber <= maxRow; rowNumber++) {
    const row = sheet.getRow(rowNumber)
    if (!row || row.cellCount === 0) continue

    const record: Record<string, string> = {}
    let hasData = false
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const header = headers[colNumber - 1]
      if (!header) return
      const val = cellText(cell.value).trim()
      if (val) hasData = true
      record[header] = val
    })

    if (hasData) rows.push(record)
  }

  return normalizeImportedRows(rows)
}

export async function buildExcelBuffer(
  sheets: Array<{ name: string; rows: unknown[][]; columnWidths?: number[] }>
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()

  for (const sheetDef of sheets) {
    const sheet = workbook.addWorksheet(sheetDef.name)
    for (const row of sanitizeWorksheetData(sheetDef.rows)) {
      sheet.addRow(row)
    }
    if (sheetDef.columnWidths?.length) {
      sheet.columns = sheetDef.columnWidths.map((width) => ({ width }))
    }
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

export function columnWidthsFromRows(rows: unknown[][], headerIndex = 0): number[] {
  const headerRow = rows[headerIndex] || []
  return headerRow.map((header, i) => {
    const maxLen = Math.max(
      String(header ?? "").length,
      ...rows.slice(headerIndex + 1).map((row) => String((row as unknown[])[i] ?? "").length)
    )
    return Math.min(maxLen + 2, 40)
  })
}
