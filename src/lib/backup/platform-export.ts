import { prisma } from "@/lib/prisma"

const STUDENT_PAGE_SIZE = 500

export async function getPlatformCounts() {
  const [users, schools, classes, students, templates, batches] = await Promise.all([
    prisma.user.count(),
    prisma.school.count(),
    prisma.class.count(),
    prisma.student.count(),
    prisma.template.count(),
    prisma.printBatch.count(),
  ])

  return { users, schools, classes, students, templates, batches }
}

async function fetchAllStudentsPaginated() {
  const students: Awaited<ReturnType<typeof prisma.student.findMany>> = []
  let cursor: string | undefined
  let hasMore = true

  while (hasMore) {
    const page = await prisma.student.findMany({
      orderBy: { id: "asc" },
      take: STUDENT_PAGE_SIZE,
      skip: cursor ? 1 : 0,
      ...(cursor ? { cursor: { id: cursor } } : {}),
    })

    if (page.length === 0) {
      hasMore = false
      break
    }

    students.push(...page)
    cursor = page[page.length - 1].id
  }

  return students
}

export async function buildPlatformBackupPayload(includeStudents = true) {
  const counts = await getPlatformCounts()

  const [users, schools, classes, templates, batches] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        schoolId: true,
        classId: true,
        isMainTeacher: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.school.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.class.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.template.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.printBatch.findMany({ orderBy: { createdAt: "asc" } }),
  ])

  const students = includeStudents ? await fetchAllStudentsPaginated() : []

  return {
    exportedAt: new Date().toISOString(),
    version: 1,
    counts,
    users,
    schools,
    classes,
    templates,
    students,
    batches,
  }
}

export async function getLatestPlatformBackupJob() {
  return prisma.job.findFirst({
    where: { type: "EXPORT_PLATFORM_BACKUP", status: "COMPLETED" },
    orderBy: { completedAt: "desc" },
  })
}

export async function getActivePlatformBackupJob() {
  return prisma.job.findFirst({
    where: {
      type: "EXPORT_PLATFORM_BACKUP",
      status: { in: ["PENDING", "RUNNING"] },
    },
    orderBy: { createdAt: "desc" },
  })
}

export async function hasPlatformBackupSince(since: Date) {
  const count = await prisma.job.count({
    where: {
      type: "EXPORT_PLATFORM_BACKUP",
      status: "COMPLETED",
      completedAt: { gte: since },
    },
  })
  return count > 0
}
