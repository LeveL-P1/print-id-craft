import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { studentPhotoUrl } from "@/lib/student-photo-url"
import { getDefaultTemplate, getTemplateForClass } from "@/lib/template-resolver"

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
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const classId = searchParams.get("classId")
    const statusFilter = searchParams.get("status") || "APPROVED"

    const template = classId
      ? await getTemplateForClass(classId)
      : await getDefaultTemplate(params.id)

    if (!template?.templateImageUrl || !template?.fieldMappings) {
      return NextResponse.json(
        { error: classId
            ? "No JPG template configured for this class. Please assign and map a template first."
            : "No JPG template configured. Please upload and map a template first." },
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
      select: {
        id: true,
        serialNumber: true,
        photoUrl: true,
        photoPath: true,
        formData: true,
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
        photoUrl: studentPhotoUrl(s),
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
 * Explicitly marks students as PRINTED after physical print confirmation.
 * Download/generation must not call this automatically.
 */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { action, confirmPrinted, studentIds } = body

    if (action !== "markPrinted" || confirmPrinted !== true) {
      return NextResponse.json(
        { error: "Printed status requires explicit physical print confirmation" },
        { status: 400 }
      )
    }
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return NextResponse.json({ error: "No student IDs provided" }, { status: 400 })
    }
    if (studentIds.length > 2000 || studentIds.some((id) => typeof id !== "string")) {
      return NextResponse.json({ error: "Invalid student IDs" }, { status: 400 })
    }

    const result = await prisma.student.updateMany({
      where: {
        id: { in: studentIds },
        schoolId: params.id,
        status: { in: ["APPROVED", "SUBMITTED"] },
      },
      data: { status: "PRINTED" },
    })

    return NextResponse.json({
      success: true,
      printedCount: result.count,
      requestedCount: studentIds.length,
      message: `${result.count} students marked as PRINTED`,
    })
  } catch (error) {
    console.error("POST /api/schools/[id]/generate error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
