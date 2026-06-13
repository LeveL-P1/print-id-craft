import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { JOB_STALE_RUNNING_MINUTES } from "@/lib/jobs/types"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user?.role !== "MANUFACTURER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const url = new URL(req.url)
  const limit = Math.min(Number(url.searchParams.get("limit") || 100), 500)
  const status = url.searchParams.get("status") || undefined
  const type = url.searchParams.get("type") || undefined
  const schoolId = url.searchParams.get("schoolId") || undefined
  const summary = url.searchParams.get("summary") === "1"

  if (summary) {
    const minutes = Math.min(Math.max(Number(url.searchParams.get("minutes") || 60), 1), 24 * 60)
    const since = new Date(Date.now() - minutes * 60 * 1000)
    const staleStartedBefore = new Date(Date.now() - JOB_STALE_RUNNING_MINUTES * 60 * 1000)
    const whereSchool = schoolId ? { schoolId } : {}

    const [
      pending,
      running,
      failed,
      completedRecently,
      failedRecently,
      oldestPending,
      staleRunning,
      recentFailures,
    ] = await Promise.all([
      prisma.job.count({ where: { status: "PENDING", ...whereSchool } }),
      prisma.job.count({ where: { status: "RUNNING", ...whereSchool } }),
      prisma.job.count({ where: { status: "FAILED", ...whereSchool } }),
      prisma.job.count({ where: { status: "COMPLETED", completedAt: { gte: since }, ...whereSchool } }),
      prisma.job.count({ where: { status: "FAILED", completedAt: { gte: since }, ...whereSchool } }),
      prisma.job.findFirst({
        where: { status: "PENDING", ...whereSchool },
        orderBy: { createdAt: "asc" },
        select: { id: true, type: true, createdAt: true },
      }),
      prisma.job.count({
        where: { status: "RUNNING", startedAt: { lt: staleStartedBefore }, ...whereSchool },
      }),
      prisma.job.findMany({
        where: { status: "FAILED", ...whereSchool },
        orderBy: { completedAt: "desc" },
        take: 5,
        select: {
          id: true,
          type: true,
          schoolId: true,
          attempts: true,
          error: true,
          completedAt: true,
        },
      }),
    ])

    const oldestPendingAgeSeconds = oldestPending
      ? Math.max(0, Math.round((Date.now() - oldestPending.createdAt.getTime()) / 1000))
      : 0
    const alerts = [
      ...(staleRunning > 0
        ? [{ level: "critical", message: `${staleRunning} job(s) appear stale` }]
        : []),
      ...(oldestPendingAgeSeconds > 10 * 60
        ? [{ level: "warning", message: `Oldest pending job has waited ${Math.round(oldestPendingAgeSeconds / 60)} min` }]
        : []),
      ...(failedRecently > 0
        ? [{ level: "warning", message: `${failedRecently} job(s) failed in the last ${minutes} min` }]
        : []),
    ]

    return NextResponse.json({
      success: true,
      data: {
        windowMinutes: minutes,
        pending,
        running,
        failed,
        completedRecently,
        failedRecently,
        staleRunning,
        oldestPending,
        oldestPendingAgeSeconds,
        recentFailures,
        alerts,
      },
    })
  }

  const jobs = await prisma.job.findMany({
    where: {
      ...(status ? { status: status as any } : {}),
      ...(type ? { type: type as any } : {}),
      ...(schoolId ? { schoolId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  })

  return NextResponse.json({ success: true, data: jobs })
}
