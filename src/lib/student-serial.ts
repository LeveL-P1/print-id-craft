import { Prisma, PrismaClient } from "@prisma/client"

type TxClient = Prisma.TransactionClient | PrismaClient

export function schoolCodeFromName(name: string): string {
  const code = name.replace(/[^A-Za-z]/g, "").substring(0, 6).toUpperCase()
  return code || "SCHOOL"
}

export async function getOrGenerateSchoolPrefix(
  tx: TxClient,
  schoolId: string,
  schoolName: string
): Promise<string> {
  // 1. Check if there are any students in this school to preserve existing prefix
  const existingStudent = await tx.student.findFirst({
    where: { schoolId },
    select: { serialNumber: true },
  })

  if (existingStudent?.serialNumber) {
    const parts = existingStudent.serialNumber.split("-")
    if (parts.length > 1) {
      return parts.slice(0, -1).join("-")
    }
  }

  // 2. Generate a unique candidate prefix for new schools
  const words = schoolName.replace(/[^A-Za-z\s]/g, "").split(/\s+/).filter(Boolean)
  
  // Strategy 1: First 6 letters of name
  const candidate1 = schoolName.replace(/[^A-Za-z]/g, "").substring(0, 6).toUpperCase() || "SCHOOL"
  
  // Strategy 2: If multiple words, first 3 letters of first word + first 3 letters of second word
  let candidate2 = ""
  if (words.length > 1) {
    const w1 = words[0].substring(0, 3).toUpperCase()
    const w2 = words[1].substring(0, 3).toUpperCase()
    if (w1 && w2) {
      candidate2 = (w1 + w2).padEnd(6, "X").substring(0, 6)
    }
  }

  // Strategy 3: Initials of the first few words (up to 6 chars)
  let candidate3 = ""
  if (words.length > 1) {
    candidate3 = words.map(w => w[0].toUpperCase()).join("").substring(0, 6)
  }

  const candidates = [candidate1, candidate2, candidate3].filter(Boolean)

  for (const candidate of candidates) {
    const count = await tx.student.count({
      where: {
        serialNumber: {
          startsWith: `${candidate}-`
        }
      }
    })
    if (count === 0) {
      return candidate
    }
  }

  // Fallback: If all strategies are taken, append a number to Candidate 1 (first 5 chars + number)
  const base = candidate1.substring(0, 5)
  let counter = 1
  while (true) {
    const candidate = `${base}${counter}`
    const count = await tx.student.count({
      where: {
        serialNumber: {
          startsWith: `${candidate}-`
        }
      }
    })
    if (count === 0) {
      return candidate
    }
    counter++
  }
}

export async function getNextStudentSerial(
  tx: TxClient,
  schoolId: string,
  schoolName: string
): Promise<string> {
  // PostgreSQL advisory transaction locks serialize serial allocation per school
  // without changing the visible product flow or adding a new table.
  // $executeRaw: pg_advisory_xact_lock returns void — $queryRaw cannot deserialize it
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`student-serial:${schoolId}`}))`

  const code = await getOrGenerateSchoolPrefix(tx, schoolId, schoolName)
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

  // $executeRaw: pg_advisory_xact_lock returns void — $queryRaw cannot deserialize it
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`student-serial:${schoolId}`}))`

  const code = await getOrGenerateSchoolPrefix(tx, schoolId, schoolName)
  const start = (await getMaxStudentSerialNumber(tx, schoolId)) + 1

  return Array.from({ length: count }, (_, index) => formatStudentSerial(code, start + index))
}
