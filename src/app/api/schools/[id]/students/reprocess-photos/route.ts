import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { enqueueJob, kickJobWorker } from "@/lib/jobs/enqueue"
import { isRembgConfigured } from "@/lib/rembg-service"
import { PHOTO_BG_STATUS } from "@/lib/photo-bg-status"

export const maxDuration = 30

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const url = new URL(req.url)
    const classId = url.searchParams.get("classId")

    const where: {
      schoolId: string
      photoBgStatus: string
      photoPath: { not: string }
      classId?: string
    } = {
      schoolId: params.id,
      photoBgStatus: PHOTO_BG_STATUS.SKIPPED,
      photoPath: { not: "" },
    }
    if (classId) where.classId = classId

    const [skippedCount, rembgAvailable] = await Promise.all([
      prisma.student.count({ where }),
      Promise.resolve(isRembgConfigured()),
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
        skippedCount,
        rembgAvailable,
        activeJob,
      },
    })
  } catch (error) {
    console.error("GET reprocess-photos error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
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

    const job = await enqueueJob({
      type: "REPROCESS_PHOTOS",
      schoolId: params.id,
      createdById: session.user?.id || null,
      payload: { classId, studentIds, maxStudents },
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
