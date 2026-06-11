import ExcelJS from "exceljs"
import { columnWidthsFromRows } from "@/lib/excel"
import { sanitizeWorksheetData } from "@/lib/spreadsheet-safety"

export type StudentFormData = Record<string, string>

export function getStudentFullName(fd: StudentFormData): string {
  return (
    fd.fullName ||
    fd["Full Name"] ||
    fd["Student Name"] ||
    fd.Student_Name ||
    fd.name ||
    ""
  )
}

export function getStudentRollNo(fd: StudentFormData): string {
  return fd.rollNo || fd["Roll No."] || fd.roll || ""
}

export function getStudentField(fd: StudentFormData, ...keys: string[]): string {
  for (const key of keys) {
    const value = fd[key]
    if (value) return value
  }
  return ""
}

export function safeExportFileName(value: string): string {
  return (value || "file")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || "file"
}

/** Keeps spaces for readable photo names; strips characters invalid on Windows/macOS. */
export function safePhotoBaseName(value: string): string {
  return (value || "")
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100) || ""
}

export function photoExtFromPath(path: string, fallback = "jpg"): string {
  const ext = path.split(".").pop()?.toLowerCase()
  return ext && /^[a-z0-9]{2,5}$/.test(ext) ? ext : fallback
}

/**
 * Assigns one photo filename per student using the student's name.
 * Duplicate names get a numeric suffix so photos are never overwritten.
 */
export class PhotoFileNameAllocator {
  private usedNames = new Map<string, number>()

  assign(fullName: string, serialNumber: string, studentId: string, photoPath: string): string {
    if (!photoPath) return ""

    const ext = photoExtFromPath(photoPath)
    const base =
      safePhotoBaseName(fullName) ||
      safePhotoBaseName(serialNumber) ||
      safeExportFileName(studentId)

    const seen = this.usedNames.get(base) ?? 0
    this.usedNames.set(base, seen + 1)

    const suffix = seen === 0 ? "" : ` (${seen + 1})`
    return `${base}${suffix}.${ext}`
  }
}

export function buildStudentPhotoFileName(
  serialNumber: string,
  fullName: string,
  studentId: string,
  photoPath: string,
  allocator?: PhotoFileNameAllocator
): string {
  const alloc = allocator ?? new PhotoFileNameAllocator()
  return alloc.assign(fullName, serialNumber, studentId, photoPath)
}

export const STUDENT_EXPORT_HEADERS = [
  "School Name",
  "Serial Number",
  "Full Name",
  "Class",
  "Roll No.",
  "Date of Birth",
  "Blood Group",
  "Father Name",
  "Mother Name",
  "Phone",
  "Address",
  "Photo File",
  "Photo URL",
  "Status",
  "Submitted At",
] as const

export type StudentExportRecord = {
  id: string
  serialNumber: string
  status: string
  formData: StudentFormData
  className: string
  schoolName: string
  photoPath?: string | null
  photoUrl?: string | null
  submittedAt?: Date | string | null
}

export type StudentPhotoMapping = {
  serialNumber: string
  fullName: string
  className: string
  photoFile: string
  photoSaved: boolean
  studentId: string
}

export function buildStudentExportRow(student: StudentExportRecord, photoFile: string): unknown[] {
  const fd = student.formData || {}
  return [
    student.schoolName,
    student.serialNumber,
    getStudentFullName(fd),
    student.className,
    getStudentRollNo(fd),
    getStudentField(fd, "dob", "Date of Birth", "DOB"),
    getStudentField(fd, "bloodGroup", "Blood Group"),
    getStudentField(fd, "fatherName", "Father Name", "Father"),
    getStudentField(fd, "motherName", "Mother Name", "Mother"),
    getStudentField(fd, "phone", "Phone", "Mobile"),
    getStudentField(fd, "address", "Address"),
    photoFile ? `photos/${photoFile}` : "",
    student.photoUrl || "",
    student.status,
    student.submittedAt ? new Date(student.submittedAt).toLocaleDateString() : "",
  ]
}

export async function buildStudentExcelBuffer(
  schoolName: string,
  students: Array<{ row: unknown[]; photoUrl?: string | null }>,
  meta?: { exportDate?: string; totalStudents?: number; schoolAddress?: string | null }
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Students")

  const exportDate = meta?.exportDate || new Date().toLocaleDateString()
  sheet.addRow([schoolName])
  if (meta?.schoolAddress) sheet.addRow([meta.schoolAddress])
  sheet.addRow([`Export Date: ${exportDate}`])
  if (meta?.totalStudents != null) sheet.addRow([`Total Students: ${meta.totalStudents}`])
  sheet.addRow([])

  const headerRowIndex = sheet.rowCount + 1
  sheet.addRow([...STUDENT_EXPORT_HEADERS])

  const photoUrlCol = STUDENT_EXPORT_HEADERS.indexOf("Photo URL") + 1

  for (const student of students) {
    const row = sheet.addRow(sanitizeWorksheetData([student.row])[0])
    if (student.photoUrl) {
      const cell = row.getCell(photoUrlCol)
      cell.value = { text: student.photoUrl, hyperlink: student.photoUrl }
      cell.font = { color: { argb: "FF0563C1" }, underline: true }
    }
  }

  const widths = columnWidthsFromRows(
    [
      [...STUDENT_EXPORT_HEADERS],
      ...students.map((s) => s.row),
    ],
    0
  )
  sheet.columns = widths.map((width) => ({ width }))

  const headerRow = sheet.getRow(headerRowIndex)
  headerRow.font = { bold: true }
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE2E8F0" },
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
