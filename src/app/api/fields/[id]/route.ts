import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const fieldTypeEnum = z.enum(["TEXT", "DATE", "SELECT", "PHOTO", "SIGNATURE"])

const updateFieldSchema = z.object({
  fieldName: z.string().min(1).optional(),
  fieldType: fieldTypeEnum.optional(),
  isRequired: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const field = await prisma.submissionField.findUnique({
      where: { id: params.id },
      include: { school: true }
    })

    if (!field || field.school.manufacturerId !== session.user.id) {
       return NextResponse.json({ success: false, error: "Not found or unauthorized" }, { status: 403 })
    }

    const body = await req.json()
    const validatedData = updateFieldSchema.parse(body)

    const updatedField = await prisma.submissionField.update({
      where: { id: params.id },
      data: validatedData,
    })

    return NextResponse.json({ success: true, data: updatedField, error: null })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: (error as any).errors }, { status: 400 })
    }
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const field = await prisma.submissionField.findUnique({
      where: { id: params.id },
      include: { school: true }
    })

    if (!field || field.school.manufacturerId !== session.user.id) {
       return NextResponse.json({ success: false, error: "Not found or unauthorized" }, { status: 403 })
    }

    await prisma.submissionField.delete({
      where: { id: params.id }
    })

    return NextResponse.json({ success: true, data: null, error: null })
  } catch (error) {
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 })
  }
}
