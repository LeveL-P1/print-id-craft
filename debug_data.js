const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: { name: { contains: 'Aaryans' } },
    include: { school: true }
  });
  
  console.log('--- USERS ---');
  console.log(users.map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    schoolId: u.schoolId,
    schoolName: u.school?.name,
    isMainTeacher: u.isMainTeacher
  })));

  const students = await prisma.student.findMany({
    where: { school: { name: { contains: 'Aaryans' } } }
  });
  
  console.log('\n--- STUDENTS COUNT ---');
  const countsBySchool = {};
  students.forEach(s => {
    countsBySchool[s.schoolId] = (countsBySchool[s.schoolId] || 0) + 1;
  });
  console.log(countsBySchool);
}

main().catch(console.error).finally(() => prisma.$disconnect());
