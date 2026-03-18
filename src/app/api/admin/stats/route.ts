import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const [totalUsers, totalSchools, totalStudents, totalBatches, recentStudents] = await Promise.all([
      prisma.user.count(),
      prisma.school.count({ where: { status: "ACTIVE" } }),
      prisma.student.count(),
      prisma.printBatch.count(),
      prisma.student.findMany({
        take: 10,
        orderBy: { submittedAt: 'desc' },
        include: { classGroup: { include: { school: { select: { name: true } } } } }
      })
    ])

    const manufacturers = await prisma.user.count({ where: { role: "MANUFACTURER" } })
    const teachers = await prisma.user.count({ where: { role: "TEACHER" } })

    const statusBreakdown = await prisma.student.groupBy({
      by: ['status'],
      _count: { id: true }
    })

    return NextResponse.json({
      success: true,
      data: {
        totalUsers, totalSchools, totalStudents, totalBatches,
        manufacturers, teachers,
        statusBreakdown: statusBreakdown.map(s => ({ status: s.status, count: s._count.id })),
        recentStudents
      },
      error: null
    })
  } catch (error) {
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 })
  }
}
