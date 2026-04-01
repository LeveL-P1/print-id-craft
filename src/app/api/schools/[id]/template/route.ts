import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const templateSchema = z.object({
  frontLayout: z.any().optional(),
  backLayout: z.any().optional(),
  cardWidthMm: z.number().positive().optional(),
  cardHeightMm: z.number().positive().optional(),
  printDpi: z.number().int().positive().optional(),
  orientation: z.enum(["PORTRAIT", "LANDSCAPE"]).optional(),
  fieldConfig: z.any().optional(),
  templateImageUrl: z.string().optional(),
  fieldMappings: z.any().optional(),
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

      return {
        key: m.fieldKey,
        label: m.label,
        type: formType,
        required: true,
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

    return NextResponse.json({ success: true, data: template })
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

    // AUTO-SYNC: When fieldMappings are saved, auto-generate fieldConfig
    // This ensures the student form always matches the mapped JPG fields
    let fieldConfig = validated.fieldConfig
    if (validated.fieldMappings && Array.isArray(validated.fieldMappings) && validated.fieldMappings.length > 0) {
      fieldConfig = deriveFieldConfigFromMappings(validated.fieldMappings)
    }

    const updateData: any = { ...validated }
    if (fieldConfig) {
      updateData.fieldConfig = fieldConfig
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
