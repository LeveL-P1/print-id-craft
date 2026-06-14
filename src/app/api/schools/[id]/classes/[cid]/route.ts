import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import {
  DEFAULT_CLASS_OPTIONS,
  parseClassOptions,
  type SectionType,
} from "@/lib/section-class"

const sectionTypeSchema = z.enum(["PRE_PRIMARY", "PRIMARY", "SECONDARY"])

const updateClassSchema = z.object({
  isActive: z.boolean().optional(),
  expiresAt: z.string().optional().nullable(),
  name: z.string().min(1).optional(),
  templateId: z.string().nullable().optional(),
  sectionType: sectionTypeSchema.optional().nullable(),
  classOptions: z.array(z.string()).optional(),
})

export async function PUT(req: Request, props: { params: Promise<{ id: string; cid: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const validated = updateClassSchema.parse(body)

    if (validated.templateId) {
      const tpl = await prisma.template.findFirst({
        where: { id: validated.templateId, schoolId: params.id },
      })
      if (!tpl) {
        return NextResponse.json({ error: "Template not found for this school" }, { status: 400 })
      }
    }

    const updateData: Record<string, unknown> = {
      isActive: validated.isActive,
      name: validated.name,
      templateId: validated.templateId,
      sectionType: validated.sectionType,
    }
    if (validated.expiresAt !== undefined) {
      updateData.expiresAt = validated.expiresAt ? new Date(validated.expiresAt) : null
    }
    if (validated.classOptions !== undefined) {
      updateData.classOptions = validated.classOptions
    } else if (validated.sectionType) {
      updateData.classOptions = DEFAULT_CLASS_OPTIONS[validated.sectionType as SectionType]
    }

    const cls = await prisma.class.update({
      where: { id: params.cid, schoolId: params.id },
      data: updateData,
    })

    return NextResponse.json({
      success: true,
      data: { ...cls, classOptions: parseClassOptions(cls.classOptions) },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function DELETE(req: Request, props: { params: Promise<{ id: string; cid: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await prisma.$transaction([
      prisma.student.deleteMany({ where: { classId: params.cid } }),
      prisma.class.delete({ where: { id: params.cid, schoolId: params.id } }),
    ])

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
