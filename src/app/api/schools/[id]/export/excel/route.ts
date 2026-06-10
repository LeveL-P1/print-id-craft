import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { buildExcelBuffer, columnWidthsFromRows } from "@/lib/excel"

export const maxDuration = 60

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user?.role === "TEACHER") {
      if (session.user.schoolId !== params.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    } else if (session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const url = new URL(req.url)
    const classId = url.searchParams.get("classId")
    const status = url.searchParams.get("status")

    const where: Record<string, unknown> = { schoolId: params.id }
    if (classId) where.classId = classId
    if (status) where.status = status

    const school = await prisma.school.findUnique({
      where: { id: params.id },
      select: { name: true },
    })

    const wsData: unknown[][] = [
      [school?.name || "School Export"],
      [`Export Date: ${new Date().toLocaleDateString()}`],
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
        "Photo Path",
        "Photo URL",
        "Status",
        "Submitted At",
      ],
    ]

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

      students.forEach((s) => {
        const fd = s.formData as Record<string, string>
        wsData.push([
          s.serialNumber,
          fd.fullName || "",
          s.class?.name || "",
          fd.rollNo || "",
          fd.dob || "",
          fd.bloodGroup || "",
          fd.fatherName || "",
          fd.motherName || "",
          fd.phone || "",
          fd.address || "",
          s.photoPath || "",
          s.photoUrl || "",
          s.status,
          s.submittedAt ? new Date(s.submittedAt).toLocaleDateString() : "",
        ])
      })

      cursor = students[students.length - 1].id
    }

    const buffer = await buildExcelBuffer([
      {
        name: "Students",
        rows: wsData,
        columnWidths: columnWidthsFromRows(wsData, 3),
      },
    ])

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${school?.name || "students"}-export.xlsx"`,
      },
    })
  } catch (error) {
    console.error("Excel export error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
