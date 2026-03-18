import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(req: Request, { params }: { params: { submissionLink: string } }) {
  try {
    const classGroup = await prisma.classGroup.findUnique({
      where: { submissionLink: params.submissionLink },
      include: {
        school: {
          include: {
            fields: {
              orderBy: { sortOrder: 'asc' }
            }
          }
        }
      }
    })

    if (!classGroup || !classGroup.isActive || classGroup.school.status !== "ACTIVE") {
      return NextResponse.json({ success: false, error: "Form not found or inactive" }, { status: 404 })
    }

    const formData = {
      schoolName: classGroup.school.name,
      logo: classGroup.school.logo,
      primaryColor: classGroup.school.primaryColor,
      className: classGroup.name,
      schoolId: classGroup.school.id,
      classGroupId: classGroup.id,
      fields: classGroup.school.fields.map(f => ({
        id: f.id,
        fieldName: f.fieldName,
        fieldType: f.fieldType,
        isRequired: f.isRequired
      }))
    }

    return NextResponse.json({ success: true, data: formData, error: null })
  } catch (error) {
    console.error(`GET /api/form/${params.submissionLink} error:`, error)
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 })
  }
}
