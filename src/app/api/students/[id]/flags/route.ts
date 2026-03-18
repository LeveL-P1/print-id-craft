import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const noteSchema = z.object({
  note: z.string().min(1)
})

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || (session.user?.role !== "TEACHER" && session.user?.role !== "MANUFACTURER")) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { note } = noteSchema.parse(body)

    const flagNote = await prisma.flagNote.create({
      data: {
        studentId: params.id,
        teacherId: session.user.id,
        note
      }
    })

    // Also update status to FLAGGED
    await prisma.student.update({
      where: { id: params.id },
      data: { status: "FLAGGED" }
    })

    return NextResponse.json({ success: true, data: flagNote, error: null }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 })
  }
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const flags = await prisma.flagNote.findMany({
      where: { studentId: params.id },
      include: { teacher: { select: { email: true } } },
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json({ success: true, data: flags, error: null })
  } catch (error) {
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 })
  }
}
