import { Prisma, PrismaClient } from "@prisma/client"

type TxClient = Prisma.TransactionClient | PrismaClient

export function schoolCodeFromName(name: string): string {
  const code = name.replace(/[^A-Za-z]/g, "").substring(0, 6).toUpperCase()
  return code || "SCHOOL"
}

export async function getNextStudentSerial(
  tx: TxClient,
  schoolId: string,
  schoolName: string
): Promise<string> {
  const code = schoolCodeFromName(schoolName)

  // PostgreSQL advisory transaction locks serialize serial allocation per school
  // without changing the visible product flow or adding a new table.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`student-serial:${schoolId}`}))`

  const lastStudent = await tx.student.findFirst({
    where: { schoolId },
    orderBy: { serialNumber: "desc" },
    select: { serialNumber: true },
  })

  let nextNum = 1
  if (lastStudent) {
    const match = lastStudent.serialNumber.match(/-(\d+)$/)
    nextNum = match
      ? parseInt(match[1], 10) + 1
      : (await tx.student.count({ where: { schoolId } })) + 1
  }

  return `${code}-${String(nextNum).padStart(4, "0")}`
}
