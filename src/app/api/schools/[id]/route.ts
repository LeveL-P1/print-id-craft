import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  contactEmail: z.string().email().optional(),
  address: z.string().optional(),
  logoUrl: z.string().optional().nullable(),
})

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const school = await prisma.school.findUnique({
      where: { id: params.id },
      include: {
        _count: {
          select: { classes: true, students: true, batches: true },
        },
        templates: { take: 1, select: { id: true, fieldConfig: true } },
        teachers: {
          select: { id: true, email: true, name: true, role: true, isMainTeacher: true },
          where: { role: 'TEACHER' }
        },
      },
    })

    if (!school) {
      return NextResponse.json({ error: "School not found" }, { status: 404 })
    }

    const { templates, ...rest } = school
    const response = NextResponse.json({
      success: true,
      data: {
        ...rest,
        template: templates[0] || null,
      },
    })
    response.headers.set("Cache-Control", "private, s-maxage=5, stale-while-revalidate=30")
    return response
  } catch (error) {
    console.error(`GET /api/schools/${params.id} error:`, error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function PUT(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const validated = updateSchema.parse(body)

    const school = await prisma.school.update({
      where: { id: params.id },
      data: validated,
    })

    return NextResponse.json({ success: true, data: school })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Cascade delete: template, classes (cascade students), batches
    await prisma.$transaction([
      prisma.student.deleteMany({ where: { schoolId: params.id } }),
      prisma.printBatch.deleteMany({ where: { schoolId: params.id } }),
      prisma.template.deleteMany({ where: { schoolId: params.id } }),
      prisma.class.deleteMany({ where: { schoolId: params.id } }),
      prisma.school.delete({ where: { id: params.id } }),
    ])

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error(`DELETE /api/schools/${params.id} error:`, error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
