import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { migrateTemplateToPt } from "@/lib/font-size-units"
import { inferFieldRole } from "@/lib/field-resolver"

const templateSchema = z.object({
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

/**
 * Auto-generates fieldConfig from fieldMappings so the student form
 * always matches exactly what the admin mapped on the JPG template.
 *
 * Each mapped field becomes a form field with the correct key, label,
 * type, and required flag.
 */
function deriveFieldConfigFromMappings(fieldMappings: any[]): any[] {
  if (!Array.isArray(fieldMappings) || fieldMappings.length === 0) return []

  return fieldMappings
    .filter((m) => m.type !== "photo") // photo is handled separately in form
    .map((m) => {
      // Determine form field type based on the key/label
      let formType = "text"
      if (m.fieldKey === "mob_father" || m.fieldKey === "mother_phone" || m.fieldKey?.includes("phone") || m.fieldKey?.includes("mob")) {
        formType = "tel"
      }
      if (m.fieldKey === "class") {
        formType = "text" // will be auto-filled from class name
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

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Manufacturer can access any school's template; Teacher can only access their own
    if (session.user?.role === "TEACHER") {
      if (session.user.schoolId !== params.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    } else if (session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const template = await prisma.template.findUnique({
      where: { schoolId: params.id },
    })

    // One-shot legacy → pt font-size migration. Idempotent: gated by
    // `printConfig.fontSizeUnit === "pt"`. After the first GET on a
    // legacy template, every subsequent read is a fast no-op.
    let outTemplate: typeof template = template
    if (template) {
      const { migrated, data } = migrateTemplateToPt(template as any)
      if (migrated && data) {
        try {
          outTemplate = await prisma.template.update({
            where: { schoolId: params.id },
            data: {
              frontLayout: (data as any).frontLayout,
              backLayout: (data as any).backLayout,
              fieldMappings: (data as any).fieldMappings,
              backFieldMappings: (data as any).backFieldMappings,
              printConfig: (data as any).printConfig,
            },
          })
        } catch (persistErr) {
          // Non-fatal — return the migrated values to the caller anyway
          // so the renderer uses correct fontSizes even if persistence
          // failed (e.g. read-only replica). Next save will fix it.
          console.error("Font-size migration persist failed (non-fatal):", persistErr)
          outTemplate = data as any
        }
      }
    }

    return NextResponse.json({ success: true, data: outTemplate })
  } catch (error) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    
    // Check if the user is Manufacturer or Main Teacher of this school
    const isManufacturer = session?.user?.role === "MANUFACTURER"
    const isMainTeacher = session?.user?.role === "TEACHER" && session?.user?.isMainTeacher && session?.user?.schoolId === params.id

    if (!session || (!isManufacturer && !isMainTeacher)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const validated = templateSchema.parse(body)

    // Only auto-derive fieldConfig from fieldMappings when the school has NO students
    // (i.e. no Excel has been imported yet). Once students exist, fieldConfig is
    // authoritative from the Excel auto-sync and must NOT be overwritten by the
    // JPG-template field labels, which are for card printing only.
    let fieldConfig = validated.fieldConfig
    if (validated.fieldMappings && Array.isArray(validated.fieldMappings) && validated.fieldMappings.length > 0) {
      const studentCount = await prisma.student.count({ where: { schoolId: params.id } })
      if (studentCount === 0) {
        fieldConfig = deriveFieldConfigFromMappings(validated.fieldMappings)
      }
      // If students exist, leave fieldConfig as-is (Excel-synced values are preserved)
    }

    const updateData: any = { ...validated }
    if (fieldConfig) {
      updateData.fieldConfig = fieldConfig
    } else {
      // Never accidentally null out fieldConfig — remove it from the update payload
      delete updateData.fieldConfig
    }

    // When the card size is locked, prevent accidental overwrite of dimensions
    // unless the request explicitly unlocks (cardSizeLocked === false).
    const existing = await prisma.template.findUnique({ where: { schoolId: params.id }, select: { cardSizeLocked: true, printConfig: true } })

    // Merge incoming printConfig with existing to preserve fontSizeUnit flag.
    // Without this, savePrintConfig (paper/position settings) would wipe the
    // "fontSizeUnit: pt" marker, causing migrateTemplateToPt to re-run on
    // the next GET and shrink every font size by ×0.4.
    if (updateData.printConfig && typeof updateData.printConfig === "object") {
      const existingPc = (existing?.printConfig as Record<string, any>) || {}
      updateData.printConfig = { ...existingPc, ...updateData.printConfig }
    }
    const isLocked = existing?.cardSizeLocked === true
    const isUnlocking = validated.cardSizeLocked === false
    if (isLocked && !isUnlocking) {
      // Preserve locked dimensions — strip size fields from the update
      delete updateData.cardWidthMm
      delete updateData.cardHeightMm
      delete updateData.printDpi
      delete updateData.orientation
    }

    const template = await prisma.template.upsert({
      where: { schoolId: params.id },
      update: updateData,
      create: {
        schoolId: params.id,
        frontLayout: validated.frontLayout || [],
        backLayout: validated.backLayout || [],
        fieldConfig: fieldConfig || [],
        cardWidthMm: validated.cardWidthMm || 85.6,
        cardHeightMm: validated.cardHeightMm || 54.0,
        printDpi: validated.printDpi || 300,
        orientation: validated.orientation || "PORTRAIT",
        templateImageUrl: validated.templateImageUrl,
        fieldMappings: validated.fieldMappings || [],
        photoBgColor: validated.photoBgColor || "#FFFFFF",
        cardSizeLocked: validated.cardSizeLocked ?? false,
      },
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
