import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { migrateTemplateToPt } from "@/lib/font-size-units"
import { inferFieldRole } from "@/lib/field-resolver"

const templateSchema = z.object({
  name: z.string().min(1).optional(),
  frontLayout: z.any().optional(),
  backLayout: z.any().optional(),
  cardWidthMm: z.number().positive().optional(),
  cardHeightMm: z.number().positive().optional(),
  printDpi: z.number().int().positive().optional(),
  orientation: z.enum(["PORTRAIT", "LANDSCAPE"]).optional(),
  fieldConfig: z.any().optional(),
  templateImageUrl: z.string().optional(),
  backTemplateImageUrl: z.string().optional().nullable(),
  fieldMappings: z.any().optional(),
  backFieldMappings: z.any().optional(),
  hasBackSide: z.boolean().optional(),
  photoBgColor: z.string().optional(),
  cardSizeLocked: z.boolean().optional(),
  printConfig: z.any().optional(),
})

function deriveFieldConfigFromMappings(fieldMappings: any[]): any[] {
  if (!Array.isArray(fieldMappings) || fieldMappings.length === 0) return []

  return fieldMappings
    .filter((m) => m.type !== "photo")
    .map((m) => {
      let formType = "text"
      if (
        m.fieldKey === "mob_father" ||
        m.fieldKey === "mother_phone" ||
        m.fieldKey?.includes("phone") ||
        m.fieldKey?.includes("mob")
      ) {
        formType = "tel"
      }
      const role = inferFieldRole(m.fieldKey, m.label)
      return {
        key: m.fieldKey,
        label: m.label,
        type: formType,
        required: true,
        ...(role ? { role } : {}),
      }
    })
}

function canAccessSchoolTemplate(session: any, schoolId: string): boolean {
  const isManufacturer = session?.user?.role === "MANUFACTURER"
  const isMainTeacher =
    session?.user?.role === "TEACHER" &&
    session?.user?.isMainTeacher &&
    session?.user?.schoolId === schoolId
  return !!(session && (isManufacturer || isMainTeacher))
}

export async function GET(
  req: Request,
  { params }: { params: { id: string; tid: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!canAccessSchoolTemplate(session, params.id)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let template = await prisma.template.findFirst({
      where: { id: params.tid, schoolId: params.id },
    })

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 })
    }

    const { migrated, data } = migrateTemplateToPt(template as any)
    if (migrated && data) {
      try {
        template = await prisma.template.update({
          where: { id: params.tid },
          data: {
            frontLayout: (data as any).frontLayout,
            backLayout: (data as any).backLayout,
            fieldMappings: (data as any).fieldMappings,
            backFieldMappings: (data as any).backFieldMappings,
            printConfig: (data as any).printConfig,
          },
        })
      } catch (persistErr) {
        console.error("Font-size migration persist failed (non-fatal):", persistErr)
        template = data as any
      }
    }

    return NextResponse.json({ success: true, data: template })
  } catch (error) {
    console.error("GET template error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function PUT(
  req: Request,
  { params }: { params: { id: string; tid: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!canAccessSchoolTemplate(session, params.id)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const existing = await prisma.template.findFirst({
      where: { id: params.tid, schoolId: params.id },
      select: { id: true, cardSizeLocked: true, printConfig: true },
    })
    if (!existing) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 })
    }

    const body = await req.json()
    const validated = templateSchema.parse(body)

    let fieldConfig = validated.fieldConfig
    if (
      validated.fieldMappings &&
      Array.isArray(validated.fieldMappings) &&
      validated.fieldMappings.length > 0
    ) {
      const studentCount = await prisma.student.count({ where: { schoolId: params.id } })
      if (studentCount === 0) {
        fieldConfig = deriveFieldConfigFromMappings(validated.fieldMappings)
      }
    }

    const updateData: any = { ...validated }
    if (fieldConfig) {
      updateData.fieldConfig = fieldConfig
    } else {
      delete updateData.fieldConfig
    }

    if (updateData.printConfig && typeof updateData.printConfig === "object") {
      const existingPc = (existing?.printConfig as Record<string, any>) || {}
      updateData.printConfig = { ...existingPc, ...updateData.printConfig }
    }

    const isLocked = existing?.cardSizeLocked === true
    const isUnlocking = validated.cardSizeLocked === false
    if (isLocked && !isUnlocking) {
      delete updateData.cardWidthMm
      delete updateData.cardHeightMm
      delete updateData.printDpi
      delete updateData.orientation
    }

    const template = await prisma.template.update({
      where: { id: params.tid },
      data: updateData,
    })

    return NextResponse.json({ success: true, data: template })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("PUT template error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string; tid: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const template = await prisma.template.findFirst({
      where: { id: params.tid, schoolId: params.id },
      include: { _count: { select: { classes: true } } },
    })
    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 })
    }

    const totalTemplates = await prisma.template.count({ where: { schoolId: params.id } })
    if (totalTemplates <= 1) {
      return NextResponse.json(
        { error: "Cannot delete the only template for this school." },
        { status: 400 }
      )
    }

    await prisma.$transaction([
      prisma.class.updateMany({
        where: { templateId: params.tid },
        data: { templateId: null },
      }),
      prisma.template.delete({ where: { id: params.tid } }),
    ])

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("DELETE template error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
