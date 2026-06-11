import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { buildExcelBuffer, columnWidthsFromRows } from "@/lib/excel"

export const dynamic = "force-dynamic"
export const maxDuration = 60

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
    const where: Record<string, unknown> = { schoolId }
    if (classId) where.classId = classId

    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { name: true },
    })

    const [totalStudents, classes] = await Promise.all([
      prisma.student.count({ where }),
      prisma.class.findMany({ where: { schoolId }, orderBy: { name: "asc" } }),
    ])

    const wsData: unknown[][] = [
      [school?.name || "School Export"],
      [`Export Date: ${new Date().toLocaleDateString()}`],
      [`Total Students: ${totalStudents}`],
      [],
      [
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
        "Status",
        "Submitted At",
      ],
    ]

    let cursor: string | undefined
    let hasMore = true
    const statusCounts: Record<string, Record<string, number>> = {}

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
        const fd = s.formData as Record<string, string>
        const className = s.class?.name || "Unknown"
        if (!statusCounts[className]) {
          statusCounts[className] = {
            total: 0,
            SUBMITTED: 0,
            APPROVED: 0,
            FLAGGED: 0,
            PENDING: 0,
            PRINTED: 0,
          }
        }
        statusCounts[className].total++
        statusCounts[className][s.status] = (statusCounts[className][s.status] || 0) + 1

        wsData.push([
          s.serialNumber,
          fd.fullName || "",
          className,
          fd.rollNo || "",
          fd.dob || "",
          fd.bloodGroup || "",
          fd.fatherName || "",
          fd.motherName || "",
          fd.phone || "",
          fd.address || "",
          s.status,
          s.submittedAt ? new Date(s.submittedAt).toLocaleDateString() : "",
        ])
      }

      cursor = students[students.length - 1].id
    }

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
