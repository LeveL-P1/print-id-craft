import { PrismaClient } from "@prisma/client"
import { buildStudentIndexData } from "../src/lib/student-index"

const prisma = new PrismaClient()
const PAGE_SIZE = Number(process.env.BACKFILL_PAGE_SIZE || 500)

async function main() {
  let cursor: string | undefined
  let updated = 0

  while (true) {
    const students = await prisma.student.findMany({
      select: { id: true, classId: true, formData: true },
      orderBy: { id: "asc" },
      take: PAGE_SIZE,
      skip: cursor ? 1 : 0,
      ...(cursor ? { cursor: { id: cursor } } : {}),
    })

    if (students.length === 0) break

    await prisma.$transaction(
      students.map((student) =>
        prisma.student.update({
          where: { id: student.id },
          data: buildStudentIndexData(student.formData as Record<string, unknown>, student.classId),
        })
      )
    )

    updated += students.length
    cursor = students[students.length - 1].id
    console.log(`Backfilled ${updated} students...`)
  }

  console.log(`Done. Backfilled ${updated} students.`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
