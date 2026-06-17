import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { buildExcelBuffer, columnWidthsFromRows } from "@/lib/excel"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Prettify a camelCase / snake_case formData key into a readable column header.
 * e.g. "fatherName" → "Father Name", "mob_father" → "Mob Father",
 *      "Mobile no -Mother" stays as-is (already readable).
 */
function prettifyKey(key: string): string {
  // If already contains spaces, just title-case it
  if (/\s/.test(key)) {
    return key
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
  }
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2") // camelCase → words
    .replace(/[_-]+/g, " ")              // snake_case → words
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Keys that are system-internal and should not appear as data columns. */
const SKIP_KEYS = new Set(["class", "classSection", "photoUrl", "photoPath"])

function isUsableDataKey(key: string): boolean {
  const normalized = key.trim().toLowerCase()
  if (!normalized) return false
  if (SKIP_KEYS.has(key)) return false
  if (normalized.startsWith("__empty")) return false
  if (normalized === "empty" || normalized === "undefined" || normalized === "null") return false
  return true
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "TEACHER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const schoolId = session.user.schoolId
    if (!schoolId) {
      return NextResponse.json({ error: "No school assigned" }, { status: 400 })
    }

    const url = new URL(req.url)
    const classId = url.searchParams.get("classId")
    const gradeClass = url.searchParams.get("gradeClass")
    const where: Record<string, unknown> = { schoolId }
    if (classId) where.classId = classId

    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { name: true },
    })

    const classes = await prisma.class.findMany({
      where: { schoolId },
      orderBy: { name: "asc" },
    })

    // First pass: fetch all students and collect all unique formData keys
    const allStudents: Array<{
      serialNumber: string
      status: string
      formData: Record<string, string>
      className: string
      submittedAt: Date | null
      photoUrl: string | null
    }> = []

    const allKeys = new Set<string>()
    let cursor: string | undefined
    let hasMore = true

    while (hasMore) {
      const students = await prisma.student.findMany({
        where,
        include: { class: { select: { name: true } } },
        orderBy: { id: "asc" },
        take: 500,
        skip: cursor ? 1 : 0,
        ...(cursor ? { cursor: { id: cursor } } : {}),
      })

      if (students.length === 0) {
        hasMore = false
        break
      }

      for (const s of students) {
        const fd = (s.formData || {}) as Record<string, string>
        const className = s.class?.name || "Unknown"

        // Apply grade/class filter if specified
        if (gradeClass) {
          const studentGrade = fd.classgrade || fd.classGrade || fd.ClassGrade || fd.class || fd.Class || ""
          if (studentGrade !== gradeClass) continue
        }

        // Collect all usable keys
        for (const key of Object.keys(fd)) {
          if (isUsableDataKey(key) && String(fd[key]).trim() !== "") {
            allKeys.add(key)
          }
        }

        allStudents.push({
          serialNumber: s.serialNumber,
          status: s.status,
          formData: fd,
          className,
          submittedAt: s.submittedAt,
          photoUrl: s.photoUrl,
        })
      }

      cursor = students[students.length - 1].id
    }

    // Build ordered list of formData columns
    const dataColumns = Array.from(allKeys)

    // Fixed system columns + dynamic formData columns
    const headers = [
      "Serial Number",
      ...dataColumns.map(prettifyKey),
      "Class / Section",
      "Photo URL",
      "Status",
      "Submitted At",
    ]

    const wsData: unknown[][] = [
      [school?.name || "School Export"],
      [`Export Date: ${new Date().toLocaleDateString()}`],
      [`Total Students: ${allStudents.length}`],
      [],
      headers,
    ]

    // Status counts for summary sheet
    const statusCounts: Record<string, Record<string, number>> = {}

    for (const s of allStudents) {
      const fd = s.formData

      if (!statusCounts[s.className]) {
        statusCounts[s.className] = {
          total: 0,
          SUBMITTED: 0,
          APPROVED: 0,
          FLAGGED: 0,
          PENDING: 0,
          PRINTED: 0,
        }
      }
      statusCounts[s.className].total++
      statusCounts[s.className][s.status] = (statusCounts[s.className][s.status] || 0) + 1

      wsData.push([
        s.serialNumber,
        ...dataColumns.map((key) => fd[key] || ""),
        s.className,
        s.photoUrl || "",
        s.status,
        s.submittedAt ? new Date(s.submittedAt).toLocaleDateString() : "",
      ])
    }

    // Summary sheet
    const summaryData: unknown[][] = [
      ["Class Summary"],
      [],
      ["Class Name", "Total Students", "Submitted", "Approved", "Flagged", "Pending", "Printed"],
    ]

    classes.forEach((c) => {
      const stats = statusCounts[c.name] || {
        total: 0,
        SUBMITTED: 0,
        APPROVED: 0,
        FLAGGED: 0,
        PENDING: 0,
        PRINTED: 0,
      }
      summaryData.push([
        c.name,
        stats.total,
        stats.SUBMITTED,
        stats.APPROVED,
        stats.FLAGGED,
        stats.PENDING,
        stats.PRINTED,
      ])
    })

    const buffer = await buildExcelBuffer([
      { name: "Students", rows: wsData, columnWidths: columnWidthsFromRows(wsData, 4) },
      { name: "Class Summary", rows: summaryData, columnWidths: columnWidthsFromRows(summaryData, 2) },
    ])

    const dateStr = new Date().toISOString().slice(0, 10)
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${school?.name || "students"}-${dateStr}.xlsx"`,
      },
    })
  } catch (error) {
    console.error("Teacher Excel export error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
