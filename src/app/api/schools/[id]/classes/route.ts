import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import crypto from "crypto"

export const dynamic = "force-dynamic"
export const maxDuration = 30

const classSchema = z.object({
  name: z.string().min(1, "Class name is required"),
  expiresAt: z.string().optional().nullable(),
})

function parsePagination(req: Request) {
  const url = new URL(req.url)
  const page = Math.max(1, Number(url.searchParams.get("page") || 1))
  const requestedLimit = Number(url.searchParams.get("limit") || 100)
  const limit = Math.min(Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 100), 100)
  return { page, limit, skip: (page - 1) * limit }
}

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions)
    const isManufacturer = session?.user?.role === "MANUFACTURER"
    const isMainTeacher = session?.user?.role === "TEACHER" && session?.user?.isMainTeacher && session?.user?.schoolId === params.id

    if (!session || (!isManufacturer && !isMainTeacher)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { page, limit, skip } = parsePagination(req)

    const baseClasses = await prisma.class.findMany({
      where: { schoolId: params.id },
      select: {
        id: true,
        name: true,
        linkToken: true,
        isActive: true,
        expiresAt: true,
        templateId: true,
        createdAt: true,
        _count: { select: { students: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    })

    const classIds = baseClasses.map((entry) => entry.id)
    const templateIds = Array.from(new Set(baseClasses.map((entry) => entry.templateId).filter(Boolean))) as string[]

    const [templatesResult, teachersResult, totalResult] = await Promise.allSettled([
      templateIds.length
        ? prisma.template.findMany({
            where: { id: { in: templateIds }, schoolId: params.id },
            select: { id: true, name: true, templateImageUrl: true },
          })
        : Promise.resolve([]),
      classIds.length
        ? prisma.user.findMany({
            where: { classId: { in: classIds }, role: "TEACHER" },
            select: { id: true, classId: true, name: true, email: true, isMainTeacher: true },
          })
        : Promise.resolve([]),
      prisma.class.count({ where: { schoolId: params.id } }),
    ])

    const templatesById = new Map(
      templatesResult.status === "fulfilled"
        ? templatesResult.value.map((template) => [template.id, template])
        : []
    )
    const teachersByClassId = new Map<string, Array<{ id: string; name: string; email: string; isMainTeacher: boolean }>>()
    if (teachersResult.status === "fulfilled") {
      for (const teacher of teachersResult.value) {
        if (!teacher.classId) continue
        const current = teachersByClassId.get(teacher.classId) || []
        current.push({
          id: teacher.id,
          name: teacher.name,
          email: teacher.email,
          isMainTeacher: teacher.isMainTeacher,
        })
        teachersByClassId.set(teacher.classId, current)
      }
    }

    const classes = baseClasses.map((entry) => ({
      ...entry,
      template: entry.templateId ? templatesById.get(entry.templateId) || null : null,
      teachers: teachersByClassId.get(entry.id) || [],
    }))

    const response = NextResponse.json({
      success: true,
      data: classes,
      pagination: {
        page,
        limit,
        total: totalResult.status === "fulfilled" ? totalResult.value : classes.length,
      },
      partial: templatesResult.status === "rejected" || teachersResult.status === "rejected",
    })
    response.headers.set("Cache-Control", "private, max-age=10, stale-while-revalidate=30")
    return response
  } catch (error) {
    console.error(`GET /api/schools/${params.id}/classes error:`, error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions)
    
    const isManufacturer = session?.user?.role === "MANUFACTURER"
    const isMainTeacher = session?.user?.role === "TEACHER" && session?.user?.isMainTeacher && session?.user?.schoolId === params.id

    if (!session || (!isManufacturer && !isMainTeacher)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Verify school exists
    const school = await prisma.school.findUnique({ where: { id: params.id } })
    if (!school) return NextResponse.json({ error: "School not found" }, { status: 404 })

    const body = await req.json()
    const validated = classSchema.parse(body)

    // Parse expiresAt — handles both ISO strings and datetime-local format
    let expiresAt: Date | null = null
    if (validated.expiresAt) {
      const parsed = new Date(validated.expiresAt)
      if (!isNaN(parsed.getTime())) {
        expiresAt = parsed
      }
    }

    const newClass = await prisma.class.create({
      data: {
        name: validated.name,
        schoolId: params.id,
        linkToken: crypto.randomUUID(),
        expiresAt,
      },
    })

    return NextResponse.json({ success: true, data: newClass }, { status: 201 })
  } catch (error) {
    console.error(`POST /api/schools/${params.id}/classes error:`, error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
