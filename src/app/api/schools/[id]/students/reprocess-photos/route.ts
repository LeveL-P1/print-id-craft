import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { enqueueJob, kickJobWorker } from "@/lib/jobs/enqueue"
import { isRembgConfigured } from "@/lib/rembg-service"
import { PHOTO_BG_STATUS } from "@/lib/photo-bg-status"

export const maxDuration = 30

const PHOTO_BG_MODES = new Set(["skipped", "unprocessed", "all"])
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const url = new URL(req.url)
    const classId = url.searchParams.get("classId")
    const modeParam = url.searchParams.get("mode") || "skipped"
    const mode = PHOTO_BG_MODES.has(modeParam) ? modeParam : "skipped"

    const baseWhere: any = {
      schoolId: params.id,
      photoPath: { not: "" },
    }
    if (classId) baseWhere.classId = classId

    // "all" mode: entire selected scope.
    // "unprocessed" mode: empty or skipped bg status.
    // "skipped" mode (default): only photos explicitly marked SKIPPED.
    const skippedWhere = { ...baseWhere, photoBgStatus: PHOTO_BG_STATUS.SKIPPED }
    const unprocessedWhere = { ...baseWhere, photoBgStatus: { in: ["", PHOTO_BG_STATUS.SKIPPED] } }
    const filterWhere = mode === "all" ? baseWhere : mode === "unprocessed" ? unprocessedWhere : skippedWhere

    const [filteredCount, rembgAvailable, template] = await Promise.all([
      prisma.student.count({ where: filterWhere }),
      Promise.resolve(isRembgConfigured()),
      prisma.template.findFirst({
        where: { schoolId: params.id },
        orderBy: { updatedAt: "desc" },
        select: { photoBgColor: true },
      }),
    ])

    const activeJob = await prisma.job.findFirst({
      where: {
        schoolId: params.id,
        type: "REPROCESS_PHOTOS",
        status: { in: ["PENDING", "RUNNING"] },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        result: true,
        createdAt: true,
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        skippedCount: filteredCount,
        bgColor: template?.photoBgColor || "#FFFFFF",
        rembgAvailable,
        activeJob,
      },
    })
  } catch (error) {
    console.error("GET reprocess-photos error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!isRembgConfigured()) {
      return NextResponse.json(
        {
          error:
            "Server background removal is not configured. Set REMBG_SERVICE_URL and run docker/rembg.",
        },
        { status: 503 }
      )
    }

    const existing = await prisma.job.findFirst({
      where: {
        schoolId: params.id,
        type: "REPROCESS_PHOTOS",
        status: { in: ["PENDING", "RUNNING"] },
      },
      select: { id: true },
    })
    if (existing) {
      return NextResponse.json(
        { error: "A photo reprocess job is already running for this school.", jobId: existing.id },
        { status: 409 }
      )
    }

    const body = await req.json().catch(() => ({}))
    const classId = typeof body.classId === "string" ? body.classId : null
    const studentIds = Array.isArray(body.studentIds) ? body.studentIds : undefined
    const maxStudents = typeof body.maxStudents === "number" ? body.maxStudents : 5000
    const mode = typeof body.mode === "string" && PHOTO_BG_MODES.has(body.mode) ? body.mode : "skipped"
    const bgColor = typeof body.bgColor === "string" && HEX_COLOR_RE.test(body.bgColor)
      ? body.bgColor.toUpperCase()
      : undefined

    const job = await enqueueJob({
      type: "REPROCESS_PHOTOS",
      schoolId: params.id,
      createdById: session.user?.id || null,
      payload: { classId, studentIds, maxStudents, mode, bgColor },
    })

    const origin = new URL(req.url).origin
    await kickJobWorker(origin)

    return NextResponse.json({
      success: true,
      data: { jobId: job.id },
    })
  } catch (error) {
    console.error("POST reprocess-photos error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
