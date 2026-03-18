import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const reorderSchema = z.object({
  fields: z.array(
    z.object({
      id: z.string(),
      sortOrder: z.number().int(),
    })
  )
})

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    // Verify school
    const school = await prisma.school.findUnique({
      where: { id: params.id, manufacturerId: session.user.id }
    })
    
    if (!school) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })

    const body = await req.json()
    const validatedData = reorderSchema.parse(body)

    // Run updates in a transaction to ensure all or nothing
    await prisma.$transaction(
      validatedData.fields.map((field) => 
        prisma.submissionField.update({
          where: { id: field.id },
          data: { sortOrder: field.sortOrder }
        })
      )
    )

    return NextResponse.json({ success: true, data: null, error: null })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: (error as any).errors }, { status: 400 })
    }
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 })
  }
}
