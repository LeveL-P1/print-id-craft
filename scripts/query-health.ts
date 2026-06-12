import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

type Timed<T> = {
  label: string
  ms: number
  result: T
}

async function timed<T>(label: string, fn: () => Promise<T>): Promise<Timed<T>> {
  const started = performance.now()
  const result = await fn()
  return { label, ms: performance.now() - started, result }
}

async function main() {
  const schoolId = process.env.QUERY_HEALTH_SCHOOL_ID || (
    await prisma.school.findFirst({ select: { id: true }, orderBy: { createdAt: "desc" } })
  )?.id

  if (!schoolId) {
    console.log("No school found. Query health skipped.")
    return
  }

  const classId = process.env.QUERY_HEALTH_CLASS_ID || (
    await prisma.class.findFirst({ where: { schoolId }, select: { id: true } })
  )?.id

  const search = process.env.QUERY_HEALTH_SEARCH || "a"
  const checks: Timed<unknown>[] = []

  checks.push(await timed("students:list:first-page", () =>
    prisma.student.findMany({
      where: { schoolId },
      orderBy: { submittedAt: "desc" },
      take: 50,
      select: { id: true, serialNumber: true, submittedAt: true, classId: true, status: true },
    })
  ))

  if (classId) {
    checks.push(await timed("students:list:class-filter", () =>
      prisma.student.findMany({
        where: { schoolId, classId },
        orderBy: { submittedAt: "desc" },
        take: 50,
        select: { id: true, serialNumber: true, submittedAt: true, classId: true, status: true },
      })
    ))
  }

  checks.push(await timed("students:list:status-filter", () =>
    prisma.student.findMany({
      where: { schoolId, status: "SUBMITTED" },
      orderBy: { submittedAt: "desc" },
      take: 50,
      select: { id: true, serialNumber: true, submittedAt: true, classId: true, status: true },
    })
  ))

  checks.push(await timed("students:search", () =>
    prisma.student.findMany({
      where: {
        schoolId,
        OR: [
          { serialNumber: { contains: search, mode: "insensitive" } },
          { fullName: { contains: search, mode: "insensitive" } },
          { normalizedSearchText: { contains: search.toLowerCase() } },
        ],
      },
      orderBy: { submittedAt: "desc" },
      take: 50,
      select: { id: true, serialNumber: true, submittedAt: true, classId: true, status: true },
    })
  ))

  const total = await prisma.student.count({ where: { schoolId } })
  console.log(JSON.stringify({
    schoolId,
    classId: classId || null,
    totalStudents: total,
    search,
    checks: checks.map((check) => ({
      label: check.label,
      ms: Math.round(check.ms),
      rows: Array.isArray(check.result) ? check.result.length : undefined,
      status: check.ms <= 1_500 ? "ok" : check.ms <= 4_000 ? "watch" : "slow",
    })),
  }, null, 2))
}

main()
  .catch((error) => {
    console.error("Query health failed:", error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
