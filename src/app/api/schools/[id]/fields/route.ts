import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const fieldTypeEnum = z.enum(["TEXT", "DATE", "SELECT", "PHOTO", "SIGNATURE"])

const fieldSchema = z.object({
  fieldName: z.string().min(1),
  fieldType: fieldTypeEnum,
  isRequired: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
})

export async function GET(req: Request, { params }: { params: { id: string } }) {
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

    const fields = await prisma.submissionField.findMany({
      where: { schoolId: params.id },
      orderBy: { sortOrder: "asc" }
    })

    return NextResponse.json({ success: true, data: fields, error: null })
  } catch (error) {
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const school = await prisma.school.findUnique({
      where: { id: params.id, manufacturerId: session.user.id }
    })
    
    if (!school) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })

    const body = await req.json()
    const validatedData = fieldSchema.parse(body)

    const newField = await prisma.submissionField.create({
      data: {
        ...validatedData,
        schoolId: params.id,
      }
    })

    return NextResponse.json({ success: true, data: newField, error: null }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: (error as any).errors }, { status: 400 })
    }
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 })
  }
}
