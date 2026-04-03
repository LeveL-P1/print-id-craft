import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

export const dynamic = "force-dynamic"

const schoolSchema = z.object({
  name: z.string().min(2, "School name must be at least 2 characters"),
  contactEmail: z.string().email("Invalid contact email"),
  address: z.string().optional(),
  logoUrl: z.string().optional(),
  classNames: z.array(z.string()).optional(), // Batch class creation
})

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const url = new URL(req.url)
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"))
    const limit = Math.min(100, parseInt(url.searchParams.get("limit") || "50"))
    const search = url.searchParams.get("search")?.trim()

    const where: any = {}
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { contactEmail: { contains: search, mode: "insensitive" } },
        { address: { contains: search, mode: "insensitive" } },
      ]
    }

    // Warm the DB connection to prevent cold-start pool exhaustion
    await prisma.$connect()

    const safeCount = async (fn: () => Promise<number>): Promise<number> => {
      try { return await fn() } catch (e) { console.error("Stats query failed:", e); return 0 }
    }

    const [schools, total, globalStats] = await Promise.all([
      prisma.school.findMany({
        where,
        select: {
          id: true,
          name: true,
          contactEmail: true,
          address: true,
          logoUrl: true,
          createdAt: true,
          _count: { select: { classes: true, students: true, batches: true } },
          template: { select: { id: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.school.count({ where }),
      // DB-level aggregation for global stats — each wrapped individually
      Promise.all([
        safeCount(() => prisma.school.count()),
        safeCount(() => prisma.student.count()),
        safeCount(() => prisma.class.count()),
        safeCount(() => prisma.printBatch.count()),
      ]),
    ])

    const response = NextResponse.json({
      success: true,
      data: schools,
      stats: {
        totalSchools: globalStats[0],
        totalStudents: globalStats[1],
        totalClasses: globalStats[2],
        totalBatches: globalStats[3],
      },
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
    // Disable aggressive browser caching to prevent "0 schools" on mobile Safari
    response.headers.set("Cache-Control", "no-store, max-age=0")
    return response
  } catch (error) {
    console.error("GET /api/schools error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const validated = schoolSchema.parse(body)

    // Use transaction for atomicity: school + template + classes in one DB round-trip
    const result = await prisma.$transaction(async (tx) => {
      const school = await tx.school.create({
        data: {
          name: validated.name,
          contactEmail: validated.contactEmail,
          address: validated.address || null,
          logoUrl: validated.logoUrl || null,
        },
      })

      // Create empty template
      await tx.template.create({
        data: {
          schoolId: school.id,
          frontLayout: [],
          backLayout: [],
          fieldConfig: [],
        },
      })

      // Batch create classes if provided (replaces N sequential API calls)
      if (validated.classNames && validated.classNames.length > 0) {
        await tx.class.createMany({
          data: validated.classNames
            .filter((name) => name.trim())
            .map((name) => ({
              name: name.trim(),
              schoolId: school.id,
            })),
        })
      }

      // Automatically create a Main Teacher login for the new school
      const bcrypt = require("bcryptjs")
      const defaultPassword = await bcrypt.hash("Teacher@123", 12)
      
      const existingUser = await tx.user.findUnique({ where: { email: validated.contactEmail } })
      const teacherEmail = existingUser ? `teacher_${school.id.substring(0, 8)}@printidcraft.com` : validated.contactEmail
      
      await tx.user.create({
        data: {
          email: teacherEmail,
          password: defaultPassword,
          name: "Main Teacher",
          role: "TEACHER",
          schoolId: school.id,
          isMainTeacher: true,
        }
      })

      return school
    })

    return NextResponse.json({ success: true, data: result }, { status: 201 })
  } catch (error) {
    console.error("POST /api/schools error:", error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
