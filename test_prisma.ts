import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  try {
    const res = await prisma.school.findMany({
      select: {
        id: true,
        _count: {
          select: { classes: true, students: true, batches: true }
        }
      }
    });
    console.log("Success: found", res.length, "schools.");
  } catch (err: any) {
    console.error("Prisma error:", err.message);
  } finally {
    await prisma.$disconnect();
  }
}
main();
