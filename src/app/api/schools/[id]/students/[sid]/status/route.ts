import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const statusSchema = z.object({
  status: z.enum(["PENDING", "SUBMITTED", "FLAGGED", "APPROVED", "PRINTED"]),
})

export async function PUT(req: Request, props: { params: Promise<{ id: string; sid: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    // Teachers can only update students from their own school
    if (session.user?.role === "TEACHER" && session.user.schoolId !== params.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await req.json()
    const validated = statusSchema.parse(body)

    const student = await prisma.student.update({
      where: { id: params.sid, schoolId: params.id },
      data: { status: validated.status },
    })

    return NextResponse.json({ success: true, data: student })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
