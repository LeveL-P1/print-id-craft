import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const classSchema = z.object({
  name: z.string().min(1),
})

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    // Verify school belongs to manufacturer
    const school = await prisma.school.findUnique({
      where: { id: params.id, manufacturerId: session.user.id }
    })
    
    if (!school) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })

    const classes = await prisma.classGroup.findMany({
      where: {
        schoolId: params.id,
        isActive: true
      },
      include: {
        _count: {
          select: { students: true }
        }
      },
      orderBy: { name: "asc" }
    })

    return NextResponse.json({ success: true, data: classes, error: null })
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
    const validatedData = classSchema.parse(body)

    const newClass = await prisma.classGroup.create({
      data: {
        name: validatedData.name,
        schoolId: params.id,
        // submissionLink auto-generated as UUID via Prisma schema default
      }
    })

    return NextResponse.json({ success: true, data: newClass, error: null }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: (error as any).errors }, { status: 400 })
    }
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 })
  }
}
