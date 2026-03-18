import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "TEACHER") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const students = await prisma.student.findMany({
      where: {
        classGroup: {
          schoolId: session.user.schoolId
        }
      },
      include: {
        classGroup: { select: { name: true } }
      },
      orderBy: { submittedAt: 'desc' }
    })

    return NextResponse.json({ success: true, data: students, error: null })
  } catch (error) {
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 })
  }
}
