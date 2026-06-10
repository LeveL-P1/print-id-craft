import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { enqueueJob, kickJobWorker } from "@/lib/jobs/enqueue"

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const url = new URL(req.url)
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"))
    const limit = Math.min(50, parseInt(url.searchParams.get("limit") || "20"))

    const [batches, total] = await Promise.all([
      prisma.printBatch.findMany({
        where: { schoolId: params.id },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.printBatch.count({ where: { schoolId: params.id } }),
    ])

    const response = NextResponse.json({
      success: true,
      data: batches,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
    response.headers.set("Cache-Control", "private, max-age=3, stale-while-revalidate=10")
    return response
  } catch (error) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const existingGenerating = await prisma.printBatch.findFirst({
      where: { schoolId: params.id, status: "GENERATING" },
    })
    if (existingGenerating) {
      return NextResponse.json(
        { error: "A batch is already being generated for this school. Please wait." },
        { status: 409 }
      )
    }

    const students = await prisma.student.findMany({
      where: {
        schoolId: params.id,
        status: { in: ["SUBMITTED", "APPROVED"] },
      },
      orderBy: { serialNumber: "asc" },
      include: { class: { select: { name: true } } },
    })

    if (students.length === 0) {
      return NextResponse.json(
        { error: "No students available for printing. Students must be in SUBMITTED or APPROVED status." },
        { status: 400 }
      )
    }

    const batch = await prisma.printBatch.create({
      data: {
        schoolId: params.id,
        studentCount: students.length,
        status: "GENERATING",
      },
    })

    const job = await enqueueJob({
      type: "GENERATE_PRINT_BATCH",
      schoolId: params.id,
      createdById: session.user.id,
      payload: {
        batchId: batch.id,
        studentIds: students.map((s) => s.id),
      },
    })

    await kickJobWorker(new URL(req.url).origin)

    return NextResponse.json(
      {
        success: true,
        data: {
          batchId: batch.id,
          jobId: job.id,
          status: "GENERATING",
          studentCount: students.length,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error("POST batches error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
