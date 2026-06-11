import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
export const revalidate = 0

/**
 * Lightweight dashboard stats endpoint.
 * Returns only aggregated counts — no joins, no findMany.
 * Designed to respond as fast as possible so the dashboard
 * tiles render immediately while the schools table fetches in parallel.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Keep dashboard counts in one transaction so DB failures are not rendered as zero data.
    const [totalSchools, totalStudents, totalClasses, totalBatches] = await prisma.$transaction([
      prisma.school.count(),
      prisma.student.count(),
      prisma.class.count(),
      prisma.printBatch.count(),
    ])

    const res = NextResponse.json({
      success: true,
      stats: { totalSchools, totalStudents, totalClasses, totalBatches },
    })
    // Cache for 10s on the edge, allow 30s stale-while-revalidate for instant repeat loads
    res.headers.set("Cache-Control", "private, max-age=5, stale-while-revalidate=30")
    return res
  } catch (e) {
    console.error("GET /api/dashboard/stats error:", e)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
