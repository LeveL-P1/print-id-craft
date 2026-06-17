import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { storageDownload } from "@/lib/storage"
import { EXPORT_BUCKET } from "@/lib/jobs/types"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions)
  const role = session?.user?.role
  if (!session || (role !== "MANUFACTURER" && role !== "TEACHER")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const job = await prisma.job.findUnique({ where: { id: params.id } })
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 })
  }

  // Teachers can only download jobs belonging to their own school
  if (role === "TEACHER") {
    const teacherSchoolId = session.user.schoolId
    if (!teacherSchoolId || job.schoolId !== teacherSchoolId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
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
