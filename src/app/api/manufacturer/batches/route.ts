import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const createBatchSchema = z.object({
  schoolId: z.string(),
  studentIds: z.array(z.string())
})

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { schoolId, studentIds } = createBatchSchema.parse(body)

    // Verify school
    const school = await prisma.school.findUnique({
      where: { id: schoolId, manufacturerId: session.user.id }
    })
    if (!school) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })

    const batch = await prisma.printBatch.create({
      data: {
        schoolId,
        status: "PENDING",
        studentIds
      }
    })

    return NextResponse.json({ success: true, data: batch, error: null }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: (error as any).errors }, { status: 400 })
    }
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 })
  }
}
