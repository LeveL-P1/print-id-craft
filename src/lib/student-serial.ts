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
  // $executeRaw: pg_advisory_xact_lock returns void — $queryRaw cannot deserialize it
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`student-serial:${schoolId}`}))`

  const nextNum = (await getMaxStudentSerialNumber(tx, schoolId)) + 1

  return formatStudentSerial(code, nextNum)
}

export function formatStudentSerial(code: string, serialNumber: number): string {
  return `${code}-${String(serialNumber).padStart(4, "0")}`
}

export async function getMaxStudentSerialNumber(tx: TxClient, schoolId: string): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ max: number | bigint | null }>>`
    SELECT COALESCE(MAX((substring("serialNumber" from '-([0-9]+)$'))::int), 0) AS max
    FROM "Student"
    WHERE "schoolId" = ${schoolId}
  `
  return Number(rows[0]?.max || 0)
}

export async function allocateStudentSerials(
  tx: TxClient,
  schoolId: string,
  schoolName: string,
  count: number
): Promise<string[]> {
  if (count <= 0) return []

  const code = schoolCodeFromName(schoolName)
  // $executeRaw: pg_advisory_xact_lock returns void — $queryRaw cannot deserialize it
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`student-serial:${schoolId}`}))`
  const start = (await getMaxStudentSerialNumber(tx, schoolId)) + 1

  return Array.from({ length: count }, (_, index) => formatStudentSerial(code, start + index))
}
