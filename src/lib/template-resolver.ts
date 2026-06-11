import { prisma } from "@/lib/prisma"
import type { Template } from "@prisma/client"

export async function getDefaultTemplate(schoolId: string): Promise<Template | null> {
  return prisma.template.findFirst({
    where: { schoolId },
    orderBy: { createdAt: "asc" },
  })
}

export async function getTemplateForClass(classId: string): Promise<Template | null> {
  const cls = await prisma.class.findUnique({
    where: { id: classId },
    select: {
      templateId: true,
      template: true,
      schoolId: true,
    },
  })
  if (!cls) return null
  if (cls.template) return cls.template
  return getDefaultTemplate(cls.schoolId)
}

export async function getTemplateByIdForSchool(
  schoolId: string,
  templateId?: string | null
): Promise<Template | null> {
  if (templateId) {
    return prisma.template.findFirst({
      where: { id: templateId, schoolId },
    })
  }
  return getDefaultTemplate(schoolId)
}
