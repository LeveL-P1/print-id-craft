export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024
export const MAX_IMPORT_ROWS = 5000
export const MAX_IMPORT_COLUMNS = 80
export const MAX_IMPORT_CELL_CHARS = 2000

const ALLOWED_IMPORT_EXTENSIONS = new Set(["csv", "xlsx"])
const ALLOWED_IMPORT_MIME_TYPES = new Set([
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream",
])

export function validateImportFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() || ""
  if (!ALLOWED_IMPORT_EXTENSIONS.has(extension)) {
    return { ok: false, error: "Unsupported file type. Upload .csv or .xlsx only." }
  }

  if (file.type && !ALLOWED_IMPORT_MIME_TYPES.has(file.type)) {
    return { ok: false, error: "Unsupported file type. Upload .csv or .xlsx only." }
  }

  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return { ok: false, error: "File too large. Maximum 10MB." }
  }

  if (file.size === 0) {
    return { ok: false, error: "Uploaded file is empty." }
  }

  return { ok: true, extension }
}

export function neutralizeSpreadsheetFormula(value: unknown) {
  const text = String(value ?? "").replace(/\0/g, "").slice(0, MAX_IMPORT_CELL_CHARS)
  return /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text
}

export function csvCell(value: unknown): string {
  return `"${neutralizeSpreadsheetFormula(value).replace(/"/g, '""')}"`
}

export function sanitizeWorksheetData(rows: unknown[][]) {
  return rows.map((row) => row.map((cell) => neutralizeSpreadsheetFormula(cell)))
}

export function normalizeImportedRows(rows: Record<string, unknown>[]) {
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new Error(`Maximum ${MAX_IMPORT_ROWS} students per import. Your file has ${rows.length} rows.`)
  }

  return rows.map((row) => {
    const entries = Object.entries(row).slice(0, MAX_IMPORT_COLUMNS)
    return Object.fromEntries(
      entries.map(([key, value]) => [
        neutralizeSpreadsheetFormula(key).trim(),
        neutralizeSpreadsheetFormula(value).trim(),
      ])
    )
  }) as Record<string, string>[]
}

export function parseCsvRows(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const next = text[i + 1]

    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"'
        i++
      } else if (char === '"') {
        quoted = false
      } else {
        cell += char
      }
      continue
    }

    if (char === '"') {
      quoted = true
    } else if (char === ",") {
      row.push(cell)
      cell = ""
    } else if (char === "\n") {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
    } else if (char !== "\r") {
      cell += char
    }
  }

  row.push(cell)
  rows.push(row)

  const [headers = [], ...dataRows] = rows.filter((r) => r.some((c) => c.trim()))
  const cleanHeaders = headers.slice(0, MAX_IMPORT_COLUMNS).map((h) => neutralizeSpreadsheetFormula(h).trim())
  const objects = dataRows.map((dataRow) => {
    const record: Record<string, string> = {}
    cleanHeaders.forEach((header, index) => {
      if (header) record[header] = neutralizeSpreadsheetFormula(dataRow[index] ?? "").trim()
    })
    return record
  })

  return normalizeImportedRows(objects)
}
