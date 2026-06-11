import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getActivePlatformBackupJob } from "@/lib/backup/platform-export"
import { enqueueJob, kickJobWorker } from "@/lib/jobs/enqueue"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const active = await getActivePlatformBackupJob()
    if (active) {
      return NextResponse.json(
        { error: "A platform backup is already running", jobId: active.id },
        { status: 409 }
      )
    }

    let includeStudents = true
    try {
      const body = await req.json()
      if (body && typeof body.includeStudents === "boolean") {
        includeStudents = body.includeStudents
      }
    } catch {
      // Empty body is fine.
    }

    const job = await enqueueJob({
      type: "EXPORT_PLATFORM_BACKUP",
      createdById: session.user.id,
      payload: { includeStudents },
    })

    await kickJobWorker()

    return NextResponse.json({
      success: true,
      jobId: job.id,
      includeStudents,
    })
  } catch (error) {
    console.error("Backup run error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
