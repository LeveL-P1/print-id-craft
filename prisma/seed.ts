import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

// Realistic Indian names
const FIRST_NAMES = [
  "Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Reyansh", "Mohammed", "Sai", "Arnav", "Dhruv",
  "Ananya", "Diya", "Priya", "Kavya", "Saanvi", "Aisha", "Ishita", "Meera", "Nisha", "Riya",
  "Rohan", "Karan", "Dev", "Ishaan", "Rahul", "Sanya", "Zara", "Fatima", "Pooja", "Ankita",
  "Yash", "Krish", "Aadhya", "Manav", "Tanvi", "Shreya", "Atharv", "Ritika", "Kabir", "Avni",
]
const LAST_NAMES = [
  "Sharma", "Patel", "Singh", "Kumar", "Verma", "Joshi", "Gupta", "Reddy", "Banerjee", "Iyer",
  "Nair", "Mishra", "Chopra", "Mehta", "Desai", "Shah", "Khan", "Thomas", "D'Souza", "Fernandes",
]
const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"]
const CITIES = ["Mumbai", "Pune", "Delhi", "Chennai", "Bengaluru", "Kolkata", "Hyderabad", "Ahmedabad"]

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function generatePhone(): string {
  return `98${String(Math.floor(Math.random() * 100000000)).padStart(8, "0")}`
}

function generateDOB(minYear = 2008, maxYear = 2016): string {
  const year = minYear + Math.floor(Math.random() * (maxYear - minYear + 1))
  const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, "0")
  const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function generateStudentData(rollNo: string, className: string) {
  const firstName = pick(FIRST_NAMES)
  const lastName = pick(LAST_NAMES)
  return {
    fullName: `${firstName} ${lastName}`,
    class: className,
    rollNo,
    dob: generateDOB(),
    bloodGroup: pick(BLOOD_GROUPS),
    fatherName: `Mr. ${pick(LAST_NAMES)} ${pick(LAST_NAMES).charAt(0)}.`,
    motherName: `Mrs. ${firstName.endsWith("a") ? pick(FIRST_NAMES) : pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
    phone: generatePhone(),
    address: `${Math.floor(Math.random() * 500) + 1}, Sector ${Math.floor(Math.random() * 50) + 1}, ${pick(CITIES)}`,
  }
}

// Template layout that works with the IDCardPreview component
const STANDARD_FRONT_LAYOUT = [
  { id: "school-name", type: "text", x: 120, y: 15, width: 200, height: 24, content: "{{SCHOOL_NAME}}", fontSize: 14, fill: "#1e3a5f", bold: true, align: "center" },
  { id: "logo", type: "logo", x: 20, y: 10, width: 50, height: 50, content: "[Logo]" },
  { id: "photo", type: "photo", x: 20, y: 70, width: 85, height: 110, content: "[Photo]" },
  { id: "name-label", type: "text", x: 115, y: 70, width: 80, height: 14, content: "Name:", fontSize: 9, fill: "#64748b", align: "left" },
  { id: "name-value", type: "text", x: 115, y: 84, width: 200, height: 18, content: "{{fullName}}", fontSize: 13, fill: "#0f172a", bold: true, align: "left" },
  { id: "class-label", type: "text", x: 115, y: 106, width: 60, height: 14, content: "Class:", fontSize: 9, fill: "#64748b", align: "left" },
  { id: "class-value", type: "text", x: 115, y: 120, width: 80, height: 16, content: "{{class}}", fontSize: 12, fill: "#0f172a", align: "left" },
  { id: "roll-label", type: "text", x: 210, y: 106, width: 60, height: 14, content: "Roll No:", fontSize: 9, fill: "#64748b", align: "left" },
  { id: "roll-value", type: "text", x: 210, y: 120, width: 80, height: 16, content: "{{rollNo}}", fontSize: 12, fill: "#0f172a", align: "left" },
  { id: "dob-label", type: "text", x: 115, y: 140, width: 60, height: 14, content: "DOB:", fontSize: 9, fill: "#64748b", align: "left" },
  { id: "dob-value", type: "text", x: 115, y: 154, width: 100, height: 16, content: "{{dob}}", fontSize: 11, fill: "#0f172a", align: "left" },
  { id: "serial", type: "text", x: 115, y: 178, width: 120, height: 14, content: "{{serialNumber}}", fontSize: 8, fill: "#94a3b8", align: "left" },
  { id: "qr", type: "qr", x: 260, y: 140, width: 50, height: 50, content: "[QR Code]" },
]

const STANDARD_BACK_LAYOUT = [
  { id: "back-title", type: "text", x: 60, y: 15, width: 220, height: 22, content: "STUDENT IDENTITY CARD", fontSize: 13, fill: "#0f172a", bold: true, align: "center" },
  { id: "father-label", type: "text", x: 20, y: 50, width: 100, height: 14, content: "Father's Name:", fontSize: 9, fill: "#64748b", align: "left" },
  { id: "father-value", type: "text", x: 20, y: 64, width: 200, height: 16, content: "{{fatherName}}", fontSize: 12, fill: "#0f172a", align: "left" },
  { id: "mother-label", type: "text", x: 20, y: 84, width: 100, height: 14, content: "Mother's Name:", fontSize: 9, fill: "#64748b", align: "left" },
  { id: "mother-value", type: "text", x: 20, y: 98, width: 200, height: 16, content: "{{motherName}}", fontSize: 12, fill: "#0f172a", align: "left" },
  { id: "phone-label", type: "text", x: 20, y: 118, width: 80, height: 14, content: "Phone:", fontSize: 9, fill: "#64748b", align: "left" },
  { id: "phone-value", type: "text", x: 20, y: 132, width: 160, height: 16, content: "{{phone}}", fontSize: 12, fill: "#0f172a", align: "left" },
  { id: "blood-label", type: "text", x: 240, y: 50, width: 70, height: 14, content: "Blood Group:", fontSize: 8, fill: "#64748b", align: "left" },
  { id: "blood-value", type: "text", x: 250, y: 66, width: 50, height: 22, content: "{{bloodGroup}}", fontSize: 16, fill: "#dc2626", bold: true, align: "center" },
  { id: "address-label", type: "text", x: 20, y: 156, width: 80, height: 14, content: "Address:", fontSize: 9, fill: "#64748b", align: "left" },
  { id: "address-value", type: "text", x: 20, y: 170, width: 290, height: 16, content: "{{address}}", fontSize: 11, fill: "#0f172a", align: "left" },
]

const FIELD_CONFIG = [
  { key: "fullName", label: "Full Name", type: "text", required: true },
  { key: "class", label: "Class", type: "text", required: true },
  { key: "rollNo", label: "Roll No.", type: "text", required: true },
  { key: "dob", label: "Date of Birth", type: "date", required: true },
  { key: "bloodGroup", label: "Blood Group", type: "select", required: false },
  { key: "fatherName", label: "Father Name", type: "text", required: true },
  { key: "motherName", label: "Mother Name", type: "text", required: false },
  { key: "phone", label: "Phone", type: "tel", required: true },
  { key: "address", label: "Address", type: "textarea", required: false },
]

async function main() {
  console.log("🌱 Seeding database...")

  // Clear existing data (order matters for foreign keys)
  await prisma.student.deleteMany()
  await prisma.printBatch.deleteMany()
  await prisma.template.deleteMany()
  await prisma.class.deleteMany()
  await prisma.school.deleteMany()
  await prisma.user.deleteMany()
  console.log("  ✓ Cleared existing data")

  // ── MANUFACTURER ──
  const hashedPassword = await bcrypt.hash("Admin@123", 12)
  const manufacturer = await prisma.user.create({
    data: {
      email: "admin@wisemelon.com",
      password: hashedPassword,
      name: "Admin User",
      role: "MANUFACTURER",
    },
  })
  console.log("  ✓ Created manufacturer:", manufacturer.email)

  // ── SCHOOL 1: St. Xavier's High School (fully loaded) ──
  const school1 = await prisma.school.create({
    data: { name: "St. Xavier's High School", address: "MG Road, Pune", contactEmail: "admin@xaviers.edu.in" },
  })
  const frontLayout1 = STANDARD_FRONT_LAYOUT.map(el =>
    el.id === "school-name" ? { ...el, content: "St. Xavier's High School" } : el
  )
  await prisma.template.create({
    data: {
      schoolId: school1.id,
      frontLayout: frontLayout1,
      backLayout: STANDARD_BACK_LAYOUT,
      fieldConfig: FIELD_CONFIG,
      cardWidthMm: 85.6, cardHeightMm: 54.0, printDpi: 300, orientation: "LANDSCAPE",
    },
  })

  const teacherPw = await bcrypt.hash("Teacher@123", 12)
  await prisma.user.create({
    data: { email: "xavier.teacher@school.com", password: teacherPw, name: "Priya Sharma", role: "TEACHER", schoolId: school1.id, isMainTeacher: true },
  })

  // 3 classes: Grade 9-A (25), Grade 9-B (22), Grade 10-A (28) = 75 students
  const s1Classes = [
    { name: "Grade 9-A", count: 25 },
    { name: "Grade 9-B", count: 22 },
    { name: "Grade 10-A", count: 28 },
  ]
  let s1Serial = 0
  for (const c of s1Classes) {
    const cls = await prisma.class.create({
      data: { name: c.name, schoolId: school1.id, isActive: true },
    })
    for (let j = 0; j < c.count; j++) {
      s1Serial++
      const rollNo = `XVR${String(s1Serial).padStart(3, "0")}`
      const serial = `STXAVI-${String(s1Serial).padStart(4, "0")}`
      await prisma.student.create({
        data: {
          schoolId: school1.id,
          classId: cls.id,
          serialNumber: serial,
          photoUrl: "",
          status: "SUBMITTED",
          formData: generateStudentData(rollNo, c.name),
        },
      })
    }
  }

  // Create 1 completed batch for School 1
  await prisma.printBatch.create({
    data: {
      schoolId: school1.id,
      studentCount: 75,
      status: "READY",
      frontPdfPath: `batches/${school1.id}/demo/front.pdf`,
      backPdfPath: `batches/${school1.id}/demo/back.pdf`,
      manifestPath: `batches/${school1.id}/demo/manifest.csv`,
    },
  })
  console.log("  ✓ School 1: St. Xavier's High School — 75 students, 3 classes, 1 batch, 1 teacher")

  // ── SCHOOL 2: Delhi Public School, Pune (mid-progress) ──
  const school2 = await prisma.school.create({
    data: { name: "Delhi Public School, Pune", address: "Aundh, Pune", contactEmail: "principal@dpspune.edu.in" },
  })
  const frontLayout2 = STANDARD_FRONT_LAYOUT.map(el =>
    el.id === "school-name" ? { ...el, content: "Delhi Public School, Pune" } : el
  )
  await prisma.template.create({
    data: {
      schoolId: school2.id,
      frontLayout: frontLayout2,
      backLayout: STANDARD_BACK_LAYOUT,
      fieldConfig: FIELD_CONFIG,
      cardWidthMm: 85.6, cardHeightMm: 54.0, printDpi: 300, orientation: "LANDSCAPE",
    },
  })

  await prisma.user.create({
    data: { email: "dps.teacher@school.com", password: teacherPw, name: "Amit Kumar", role: "TEACHER", schoolId: school2.id, isMainTeacher: true },
  })

  // 2 classes: Grade 6-A (30), Grade 7-A (30) — mixed statuses
  const s2Statuses = {
    "Grade 6-A": { SUBMITTED: 25, PENDING: 5 },
    "Grade 7-A": { SUBMITTED: 20, FLAGGED: 5, PENDING: 5 },
  }
  let s2Serial = 0
  for (const [className, statusMap] of Object.entries(s2Statuses)) {
    const cls = await prisma.class.create({
      data: { name: className, schoolId: school2.id, isActive: true },
    })
    for (const [status, count] of Object.entries(statusMap)) {
      for (let j = 0; j < count; j++) {
        s2Serial++
        const rollNo = `DPS${String(s2Serial).padStart(3, "0")}`
        const serial = `DLPUNE-${String(s2Serial).padStart(4, "0")}`
        await prisma.student.create({
          data: {
            schoolId: school2.id,
            classId: cls.id,
            serialNumber: serial,
            photoUrl: "",
            status: status as any,
            flagNote: status === "FLAGGED" ? "Photo not clear, please re-submit" : null,
            formData: generateStudentData(rollNo, className),
          },
        })
      }
    }
  }
  console.log("  ✓ School 2: Delhi Public School, Pune — 60 students, 2 classes, 1 teacher")

  // ── SCHOOL 3: Sunrise Academy (early stage) ──
  const school3 = await prisma.school.create({
    data: { name: "Sunrise Academy", address: "Kothrud, Pune", contactEmail: "info@sunrise.edu.in" },
  })
  const frontLayout3 = STANDARD_FRONT_LAYOUT.map(el =>
    el.id === "school-name" ? { ...el, content: "Sunrise Academy" } : el
  )
  await prisma.template.create({
    data: {
      schoolId: school3.id,
      frontLayout: frontLayout3,
      backLayout: STANDARD_BACK_LAYOUT,
      fieldConfig: FIELD_CONFIG,
      cardWidthMm: 85.6, cardHeightMm: 54.0, printDpi: 300, orientation: "LANDSCAPE",
    },
  })

  await prisma.user.create({
    data: { email: "sunrise.teacher@school.com", password: teacherPw, name: "Mary Thomas", role: "TEACHER", schoolId: school3.id, isMainTeacher: true },
  })

  // 1 class: Grade 5-A (20 students — 8 SUBMITTED, 12 PENDING)
  const cls3 = await prisma.class.create({
    data: { name: "Grade 5-A", schoolId: school3.id, isActive: true },
  })
  let s3Serial = 0
  for (let j = 0; j < 20; j++) {
    s3Serial++
    const rollNo = `SRA${String(s3Serial).padStart(3, "0")}`
    const serial = `SUNRIS-${String(s3Serial).padStart(4, "0")}`
    const status = j < 8 ? "SUBMITTED" : "PENDING"
    await prisma.student.create({
      data: {
        schoolId: school3.id,
        classId: cls3.id,
        serialNumber: serial,
        photoUrl: "",
        status: status as any,
        formData: generateStudentData(rollNo, "Grade 5-A"),
      },
    })
  }
  console.log("  ✓ School 3: Sunrise Academy — 20 students, 1 class, 1 teacher")

  // ── SUMMARY ──
  const totalStudents = await prisma.student.count()
  const totalClasses = await prisma.class.count()
  const totalSchools = await prisma.school.count()

  console.log("\n✅ Seeding complete!\n")
  console.log(`📊 Summary: ${totalSchools} schools, ${totalClasses} classes, ${totalStudents} students\n`)
  console.log("📋 Login Credentials:")
  console.log("  ─────────────────────────────────────────")
  console.log("  MANUFACTURER:")
  console.log("    Email:    admin@wisemelon.com")
  console.log("    Password: Admin@123")
  console.log("  ─────────────────────────────────────────")
  console.log("  TEACHER (St. Xavier's):")
  console.log("    Email:    xavier.teacher@school.com")
  console.log("    Password: Teacher@123")
  console.log("  ─────────────────────────────────────────")
  console.log("  TEACHER (DPS Pune):")
  console.log("    Email:    dps.teacher@school.com")
  console.log("    Password: Teacher@123")
  console.log("  ─────────────────────────────────────────")
  console.log("  TEACHER (Sunrise Academy):")
  console.log("    Email:    sunrise.teacher@school.com")
  console.log("    Password: Teacher@123")
  console.log("  ─────────────────────────────────────────")
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
