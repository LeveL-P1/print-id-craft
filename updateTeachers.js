const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.user.updateMany({ where: { role: 'TEACHER' }, data: { isMainTeacher: true } })
  .then(res => console.log('Updated', res.count, 'teachers'))
  .catch(console.error)
  .finally(() => prisma.$disconnect());
