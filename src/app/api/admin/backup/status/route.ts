import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import {
  getActivePlatformBackupJob,
  getLatestPlatformBackupJob,
  getPlatformCounts,
} from "@/lib/backup/platform-export"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const [counts, latestBackup, activeBackup] = await Promise.all([
      getPlatformCounts(),
      getLatestPlatformBackupJob(),
      getActivePlatformBackupJob(),
    ])

    return NextResponse.json({
      counts,
      latestBackup: latestBackup
        ? {
            id: latestBackup.id,
            completedAt: latestBackup.completedAt,
            result: latestBackup.result,
          }
        : null,
      activeBackup: activeBackup
        ? {
            id: activeBackup.id,
            status: activeBackup.status,
            createdAt: activeBackup.createdAt,
          }
        : null,
    })
  } catch (error) {
    console.error("Backup status error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
