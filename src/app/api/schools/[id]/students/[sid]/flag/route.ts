import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const flagSchema = z.object({
  flagNote: z.string().min(1, "Flag note is required").optional(),
  unflag: z.boolean().optional(),
})

export async function PUT(
  req: Request,
  { params }: { params: { id: string; sid: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    // Teachers can only flag students from their own school
    if (session.user?.role === "TEACHER" && session.user.schoolId !== params.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await req.json()
    const validated = flagSchema.parse(body)

    if (validated.unflag) {
      const student = await prisma.student.update({
        where: { id: params.sid, schoolId: params.id },
        data: { status: "SUBMITTED", flagNote: null },
      })
      return NextResponse.json({ success: true, data: student })
    }

    const student = await prisma.student.update({
      where: { id: params.sid, schoolId: params.id },
      data: {
        status: "FLAGGED",
        flagNote: validated.flagNote || "Flagged for review",
      },
    })

    return NextResponse.json({ success: true, data: student })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
