import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function testAuth() {
  const email = "admin@wisemelon.com"
  const password = "Admin@123"
  const role = "MANUFACTURER"

  console.log(`Checking credentials for ${email}...`)
  
  const user = await prisma.user.findUnique({
    where: { email },
  })

  if (!user) {
    console.log("❌ User not found in database.")
    return
  }

  console.log("✅ User found.")
  console.log("Role in DB:", user.role)
  
  if (user.role !== role) {
    console.log(`❌ Role mismatch! DB role is ${user.role}, but expected ${role}`)
  } else {
    console.log("✅ Role matches.")
  }

  const isMatch = await bcrypt.compare(password, user.password || "")
  if (isMatch) {
    console.log("✅ Password matches.")
  } else {
    console.log("❌ Password DOES NOT match.")
  }
}

testAuth()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
