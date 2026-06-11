import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const createTemplateSchema = z.object({
  name: z.string().min(1, "Template name is required"),
  classId: z.string().optional(),
})

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    const isManufacturer = session?.user?.role === "MANUFACTURER"
    const isMainTeacher =
      session?.user?.role === "TEACHER" &&
      session?.user?.isMainTeacher &&
      session?.user?.schoolId === params.id

    if (!session || (!isManufacturer && !isMainTeacher)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const templates = await prisma.template.findMany({
      where: { schoolId: params.id },
      orderBy: { createdAt: "asc" },
      include: {
        _count: { select: { classes: true } },
      },
    })

    return NextResponse.json({ success: true, data: templates, error: null })
  } catch (error) {
    console.error("GET /templates error:", error)
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    const isManufacturer = session?.user?.role === "MANUFACTURER"
    const isMainTeacher =
      session?.user?.role === "TEACHER" &&
      session?.user?.isMainTeacher &&
      session?.user?.schoolId === params.id

    if (!session || (!isManufacturer && !isMainTeacher)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const validated = createTemplateSchema.parse(body)

    const school = await prisma.school.findUnique({ where: { id: params.id } })
    if (!school) {
      return NextResponse.json({ success: false, error: "School not found" }, { status: 404 })
    }

    const template = await prisma.template.create({
      data: {
        schoolId: params.id,
        name: validated.name.trim(),
        frontLayout: [],
        backLayout: [],
        fieldConfig: [],
        fieldMappings: [],
      },
    })

    if (validated.classId) {
      await prisma.class.updateMany({
        where: { id: validated.classId, schoolId: params.id },
        data: { templateId: template.id },
      })
    }

    return NextResponse.json({ success: true, data: template, error: null }, { status: 201 })
  } catch (error: any) {
    console.error("POST /templates error:", error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.issues }, { status: 400 })
    }
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 })
  }
}
