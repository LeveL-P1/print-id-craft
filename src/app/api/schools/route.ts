import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const schoolSchema = z.object({
  name: z.string().min(2),
  logo: z.string().url().optional().or(z.literal("")),
  address: z.string().optional(),
  primaryColor: z.string().regex(/^#([0-9A-F]{3}){1,2}$/i).optional(),
})

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const manufacturerId = (session.user as any).id

    const schools = await prisma.school.findMany({
      where: {
        manufacturerId,
        status: "ACTIVE"
      },
      include: {
        _count: {
          select: { classes: true }
        }
      },
      orderBy: { createdAt: "desc" }
    })

    return NextResponse.json({ success: true, data: schools, error: null })
  } catch (error) {
    console.error("GET /api/schools error:", error)
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const manufacturerId = session.user?.id as string
    const body = await req.json()
    
    const validatedData = schoolSchema.parse(body)

    const newSchool = await prisma.school.create({
      data: {
        ...validatedData,
        manufacturerId,
      }
    })

    return NextResponse.json({ success: true, data: newSchool, error: null }, { status: 201 })
  } catch (error) {
    console.error("POST /api/schools error:", error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: (error as any).errors }, { status: 400 })
    }
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 })
  }
}
