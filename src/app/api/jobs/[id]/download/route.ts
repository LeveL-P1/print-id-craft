import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { storageDownload } from "@/lib/storage"
import { EXPORT_BUCKET } from "@/lib/jobs/types"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user?.role !== "MANUFACTURER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const job = await prisma.job.findUnique({ where: { id: params.id } })
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 })
  }

  if (job.status !== "COMPLETED") {
    return NextResponse.json(
      { error: "Export not ready yet", status: job.status },
      { status: 409 }
    )
  }

  const result = job.result as { storagePath?: string; fileName?: string } | null
  if (!result?.storagePath) {
    return NextResponse.json({ error: "No downloadable export for this job" }, { status: 404 })
  }

  const { data, error } = await storageDownload(EXPORT_BUCKET, result.storagePath)
  if (error || !data) {
    return NextResponse.json({ error: "Export file missing from storage" }, { status: 404 })
  }

  const fileName = result.fileName || "school-archive.zip"
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  })
}
