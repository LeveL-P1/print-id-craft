import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const updateSchoolSchema = z.object({
  name: z.string().min(2).optional(),
  logo: z.string().url().optional().or(z.literal("")),
  address: z.string().optional(),
  primaryColor: z.string().regex(/^#([0-9A-F]{3}){1,2}$/i).optional(),
})

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const school = await prisma.school.findUnique({
      where: {
        id: params.id,
        manufacturerId: session.user.id,
        status: "ACTIVE"
      },
      include: {
        _count: {
          select: {
            classes: { where: { isActive: true } },
          }
        }
      }
    })

    if (!school) {
      return NextResponse.json({ success: false, error: "School not found" }, { status: 404 })
    }

    // Getting total submissions for all active classes in this school
    const classes = await prisma.classGroup.findMany({
      where: { schoolId: school.id, isActive: true },
      select: { id: true }
    })
    
    const totalSubmissions = await prisma.student.count({
      where: {
        classGroupId: { in: classes.map(c => c.id) },
      }
    })

    return NextResponse.json({ success: true, data: { ...school, totalSubmissions }, error: null })
  } catch (error) {
    console.error(`GET /api/schools/${params.id} error:`, error)
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const validatedData = updateSchoolSchema.parse(body)

    const updatedSchool = await prisma.school.update({
      where: {
        id: params.id,
        manufacturerId: session.user.id,
      },
      data: validatedData,
    })

    return NextResponse.json({ success: true, data: updatedSchool, error: null })
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

    await prisma.school.update({
      where: {
        id: params.id,
        manufacturerId: session.user.id,
      },
      data: { status: "INACTIVE" },
    })

    return NextResponse.json({ success: true, data: null, error: null })
  } catch (error) {
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 })
  }
}
