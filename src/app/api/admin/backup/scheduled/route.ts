import { NextResponse } from "next/server"
import { hasPlatformBackupSince } from "@/lib/backup/platform-export"
import { enqueueJob, kickJobWorker } from "@/lib/jobs/enqueue"

export const dynamic = "force-dynamic"
export const maxDuration = 60

function isAuthorized(req: Request) {
  const secret = process.env.MAINTENANCE_SECRET || process.env.CRON_SECRET
  if (!secret) return process.env.NODE_ENV !== "production"
  const auth = req.headers.get("authorization") || ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : ""
  return token === secret
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const since = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)
    if (await hasPlatformBackupSince(since)) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "Recent platform backup already completed",
        since: since.toISOString(),
      })
    }

    const job = await enqueueJob({
      type: "EXPORT_PLATFORM_BACKUP",
      payload: { includeStudents: true },
    })

    await kickJobWorker()

    return NextResponse.json({
      success: true,
      skipped: false,
      jobId: job.id,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Scheduled backup error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
