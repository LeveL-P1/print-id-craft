import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const statusSchema = z.object({
  status: z.enum(["APPROVED", "FLAGGED", "UNDER_REVIEW"])
})

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || (session.user?.role !== "TEACHER" && session.user?.role !== "MANUFACTURER")) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { status } = statusSchema.parse(body)

    // Security check omitted for brevity in prototyping, ideally ensure student belongs to user's school

    const updated = await prisma.student.update({
      where: { id: params.id },
      data: { status }
    })

    return NextResponse.json({ success: true, data: updated, error: null })
  } catch (error) {
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 })
  }
}
