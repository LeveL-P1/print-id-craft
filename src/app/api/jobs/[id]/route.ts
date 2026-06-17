import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

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

  // Teachers can only access jobs belonging to their own school
  if (role === "TEACHER") {
    const teacherSchoolId = session.user.schoolId
    if (!teacherSchoolId || job.schoolId !== teacherSchoolId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  return NextResponse.json({ success: true, data: job })
}
