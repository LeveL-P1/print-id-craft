import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
export const revalidate = 0

const SUBMISSION_CATEGORIES = [
  "PUBLIC_SUBMISSION_ATTEMPT",
  "PUBLIC_SUBMISSION_RECEIVED",
  "PUBLIC_SUBMISSION_DUPLICATE",
] as const

function metadataObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}
}

function stageFromEvent(event: { type: string; metadata: unknown }) {
  if (event.type === "SUBMIT_FAILED") return "FAILED"
  const metadata = metadataObject(event.metadata)
  return typeof metadata.stage === "string" ? metadata.stage : "UNKNOWN"
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const url = new URL(req.url)
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 12), 1), 50)
    const schoolId = url.searchParams.get("schoolId") || undefined
    const events = await prisma.systemEvent.findMany({
      where: {
        ...(schoolId ? { schoolId } : {}),
        OR: [
          ...SUBMISSION_CATEGORIES.map((category) => ({
            type: "MAINTENANCE" as const,
            metadata: { path: ["category"], equals: category },
          })),
          { type: "SUBMIT_FAILED" },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    })

    const submissionEvents = events

    const schoolIds = Array.from(new Set(submissionEvents.map((event) => event.schoolId).filter(Boolean))) as string[]
    const schools = schoolIds.length
      ? await prisma.school.findMany({
          where: { id: { in: schoolIds } },
          select: { id: true, name: true },
        })
      : []
    const schoolNameById = new Map(schools.map((school) => [school.id, school.name]))

    const data = submissionEvents.map((event) => {
      const metadata = metadataObject(event.metadata)
      return {
        id: event.id,
        createdAt: event.createdAt.toISOString(),
        type: event.type,
        severity: event.severity,
        stage: stageFromEvent(event),
        message: event.message,
        schoolId: event.schoolId,
        schoolName: metadata.schoolName || (event.schoolId ? schoolNameById.get(event.schoolId) : null) || "Unknown school",
        source: metadata.source || null,
        classId: metadata.classId || null,
        sectionName: metadata.sectionName || null,
        classValue: metadata.classValue || null,
        classGrade: metadata.classGrade || null,
        division: metadata.division || null,
        studentName: metadata.studentName || null,
        studentId: metadata.studentId || null,
        serialNumber: metadata.serialNumber || null,
        photoBgStatus: metadata.photoBgStatus || null,
        hasPhoto: typeof metadata.hasPhoto === "boolean" ? metadata.hasPhoto : null,
        durationMs: typeof metadata.durationMs === "number" ? metadata.durationMs : null,
        error: metadata.error || null,
      }
    })

    const res = NextResponse.json({ success: true, data })
    res.headers.set("Cache-Control", "no-store")
    return res
  } catch (error) {
    console.error("GET /api/dashboard/submissions error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
