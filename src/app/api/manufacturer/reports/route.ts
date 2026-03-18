import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const schools = await prisma.school.findMany({
      where: { manufacturerId: session.user.id, status: "ACTIVE" },
      select: { id: true, name: true }
    })

    const schoolIds = schools.map(s => s.id)

    const [totalStudents, totalBatches] = await Promise.all([
      prisma.student.count({
        where: { classGroup: { schoolId: { in: schoolIds } } }
      }),
      prisma.printBatch.count({
        where: { schoolId: { in: schoolIds } }
      })
    ])

    const statusBreakdown = await prisma.student.groupBy({
      by: ['status'],
      where: { classGroup: { schoolId: { in: schoolIds } } },
      _count: { id: true }
    })

    // Per-school student count for chart
    const perSchool = await Promise.all(
      schools.map(async (s) => {
        const count = await prisma.student.count({
          where: { classGroup: { schoolId: s.id } }
        })
        return { name: s.name, students: count }
      })
    )

    return NextResponse.json({
      success: true,
      data: {
        totalSchools: schools.length,
        totalStudents,
        totalBatches,
        statusBreakdown: statusBreakdown.map(s => ({ status: s.status, count: s._count.id })),
        perSchool
      },
      error: null
    })
  } catch (error) {
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 })
  }
}
