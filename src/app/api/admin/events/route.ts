import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

const EVENT_SEVERITIES = ["INFO", "WARNING", "ERROR", "CRITICAL"] as const
const EVENT_TYPES = [
  "SUBMIT_FAILED",
  "UPLOAD_FAILED",
  "EXPORT_FAILED",
  "IMPORT_FAILED",
  "JOB_FAILED",
  "SECURITY",
  "MAINTENANCE",
] as const

const parseEnumParam = <T extends readonly string[]>(value: string | null, allowed: T): T[number] | undefined =>
  value && (allowed as readonly string[]).includes(value) ? value : undefined

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user?.role !== "MANUFACTURER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const url = new URL(req.url)
  const limit = Math.min(Number(url.searchParams.get("limit") || 100), 500)
  const severity = parseEnumParam(url.searchParams.get("severity"), EVENT_SEVERITIES)
  const type = parseEnumParam(url.searchParams.get("type"), EVENT_TYPES)
  const schoolId = url.searchParams.get("schoolId") || undefined
  const summary = url.searchParams.get("summary") === "1"

  if (summary) {
    const minutes = Math.min(Math.max(Number(url.searchParams.get("minutes") || 15), 1), 24 * 60)
    const since = new Date(Date.now() - minutes * 60 * 1000)
    const [submitFailures, uploadFailures, criticalEvents, slowOperations] = await Promise.all([
      prisma.systemEvent.count({
        where: { type: "SUBMIT_FAILED", createdAt: { gte: since }, ...(schoolId ? { schoolId } : {}) },
      }),
      prisma.systemEvent.count({
        where: { type: "UPLOAD_FAILED", createdAt: { gte: since }, ...(schoolId ? { schoolId } : {}) },
      }),
      prisma.systemEvent.count({
        where: { severity: "CRITICAL", createdAt: { gte: since }, ...(schoolId ? { schoolId } : {}) },
      }),
      prisma.systemEvent.count({
        where: {
          type: "MAINTENANCE",
          severity: "WARNING",
          message: { startsWith: "Slow operation:" },
          createdAt: { gte: since },
          ...(schoolId ? { schoolId } : {}),
        },
      }),
    ])

    const submitFailureRatePerHour = (submitFailures / minutes) * 60
    const alerts = [
      ...(submitFailures >= 5 || submitFailureRatePerHour >= 10
        ? [{ level: "critical", message: `/submit/* failures elevated: ${submitFailures} in ${minutes} min` }]
        : []),
      ...(uploadFailures >= 5
        ? [{ level: "warning", message: `Upload failures elevated: ${uploadFailures} in ${minutes} min` }]
        : []),
      ...(slowOperations >= 10
        ? [{ level: "warning", message: `Slow operations elevated: ${slowOperations} in ${minutes} min` }]
        : []),
    ]

    return NextResponse.json({
      success: true,
      data: {
        windowMinutes: minutes,
        submitFailures,
        uploadFailures,
        criticalEvents,
        slowOperations,
        submitFailureRatePerHour: Number(submitFailureRatePerHour.toFixed(2)),
        alerts,
      },
    })
  }

  const events = await prisma.systemEvent.findMany({
    where: {
      ...(severity ? { severity } : {}),
      ...(type ? { type } : {}),
      ...(schoolId ? { schoolId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  })

  return NextResponse.json({ success: true, data: events })
}
