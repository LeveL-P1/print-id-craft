import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { buildPlatformBackupPayload } from "@/lib/backup/platform-export"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const url = new URL(req.url)
    const includeStudents = url.searchParams.get("students") !== "false"
    const dump = await buildPlatformBackupPayload(includeStudents)
    const json = JSON.stringify(dump, null, 2)
    const date = new Date().toISOString().slice(0, 10)

    return new NextResponse(json, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="wisemelon-db-export-${date}.json"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    console.error("DB export error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
