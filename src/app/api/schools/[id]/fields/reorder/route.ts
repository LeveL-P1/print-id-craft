import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getDefaultTemplate } from "@/lib/template-resolver"
import { z } from "zod"

const reorderSchema = z.object({
  fields: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      type: z.string(),
      required: z.boolean(),
    })
  ),
})

export async function PUT(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const validated = reorderSchema.parse(body)

    const template = await getDefaultTemplate(params.id)
    if (!template) {
      return NextResponse.json({ success: false, error: "No template found" }, { status: 404 })
    }

    await prisma.template.update({
      where: { id: template.id },
      data: { fieldConfig: validated.fields },
    })

    return NextResponse.json({ success: true, data: null, error: null })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.issues }, { status: 400 })
    }
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 })
  }
}
