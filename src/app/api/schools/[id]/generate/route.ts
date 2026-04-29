import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const maxDuration = 60; // Vercel function timeout config

/**
 * GET /api/schools/[id]/generate?classId=xxx
 * 
 * Returns all data needed for client-side batch rendering:
 * - Template image URL and field mappings
 * - All student data for the class (or all classes)
 * 
 * The actual canvas rendering happens client-side using the
 * existing `generateJpgCard()` function from JpgCardPreview.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const classId = searchParams.get("classId")
    const statusFilter = searchParams.get("status") || "APPROVED"

    // Get template
    const template = await prisma.template.findUnique({
      where: { schoolId: params.id },
    })

    if (!template?.templateImageUrl || !template?.fieldMappings) {
      return NextResponse.json(
        { error: "No JPG template configured. Please upload and map a template first." },
        { status: 400 }
      )
    }

    const fieldMappings = template.fieldMappings as any[]
    if (!Array.isArray(fieldMappings) || fieldMappings.length === 0) {
      return NextResponse.json(
        { error: "No field mappings found. Please map fields on the template first." },
        { status: 400 }
      )
    }

    // Get students
    const whereClause: any = {
      schoolId: params.id,
      status: statusFilter,
    }
    if (classId) {
      whereClause.classId = classId
    }

    const students = await prisma.student.findMany({
      where: whereClause,
      include: {
        class: { select: { name: true } },
      },
      orderBy: { serialNumber: "asc" },
    })

    if (students.length === 0) {
      return NextResponse.json(
        { error: `No ${statusFilter.toLowerCase()} students found${classId ? " in this class" : ""}.` },
        { status: 404 }
      )
    }

    // Build student render data
    const renderData = students.map((s) => {
      const formData = s.formData as Record<string, any>
      return {
        id: s.id,
        serialNumber: s.serialNumber,
        photoUrl: s.photoUrl,
        qrCodeUrl: s.qrCodeUrl,
        className: s.class.name,
        formData: {
          ...formData,
          class: formData.class || s.class.name,
        },
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        templateImageUrl: template.templateImageUrl,
        fieldMappings: fieldMappings,
        backTemplateImageUrl: template.backTemplateImageUrl || null,
        backFieldMappings: (template.backFieldMappings as any[]) || [],
        hasBackSide: template.hasBackSide || false,
        cardWidthMm: template.cardWidthMm || 85.6,
        cardHeightMm: template.cardHeightMm || 54,
        orientation: template.orientation || "PORTRAIT",
        students: renderData,
        totalCount: renderData.length,
      },
    })
  } catch (error) {
    console.error("GET /api/schools/[id]/generate error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

/**
 * POST /api/schools/[id]/generate
 * 
 * Marks students as PRINTED after batch generation is complete.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { studentIds } = body

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return NextResponse.json({ error: "No student IDs provided" }, { status: 400 })
    }

    // Mark students as PRINTED
    await prisma.student.updateMany({
      where: {
        id: { in: studentIds },
        schoolId: params.id,
      },
      data: { status: "PRINTED" },
    })

    return NextResponse.json({
      success: true,
      message: `${studentIds.length} students marked as PRINTED`,
    })
  } catch (error) {
    console.error("POST /api/schools/[id]/generate error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
