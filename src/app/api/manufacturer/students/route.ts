import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status")

    const query: any = {
      classGroup: {
        school: { manufacturerId: session.user.id }
      }
    }

    if (status) {
      query.status = status
    }

    const students = await prisma.student.findMany({
      where: query,
      include: {
        classGroup: { 
          include: { 
             school: { select: { id: true, name: true } }
          }
        }
      },
      orderBy: { submittedAt: 'desc' },
      take: 100 // pagination placeholder
    })

    return NextResponse.json({ success: true, data: students, error: null })
  } catch (error) {
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 })
  }
}
