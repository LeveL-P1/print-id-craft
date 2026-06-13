import { PrismaClient } from "@prisma/client"
import { createClient } from "@supabase/supabase-js"

type Check = {
  name: string
  ok: boolean
  detail?: string
}

const REQUIRED_ENV = [
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
]

const RECOMMENDED_ENV = ["CRON_SECRET", "WORKER_SECRET"]
const REQUIRED_STUDENT_COLUMNS = [
  "fullName",
  "normalizedName",
  "normalizedFatherName",
  "normalizedDob",
  "normalizedRollNo",
  "normalizedSearchText",
  "duplicateFingerprint",
]

const REQUIRED_STUDENT_INDEX_COLUMNS = [
  ['"schoolId"', '"status"'],
  ['"schoolId"', '"classId"'],
  ['"schoolId"', '"classId"', '"status"'],
  ['"schoolId"', '"submittedAt"'],
  ['"schoolId"', '"normalizedSearchText"'],
]

function mask(value: string) {
  if (value.length <= 8) return "***"
  return `${value.slice(0, 4)}...${value.slice(-4)}`
}

function checkEnv(): Check[] {
  const checks: Check[] = []

  for (const key of REQUIRED_ENV) {
    const value = process.env[key]
    checks.push({
      name: `env:${key}`,
      ok: Boolean(value),
      detail: value ? mask(value) : "missing",
    })
  }

  const hasWorkerSecret = RECOMMENDED_ENV.some((key) => Boolean(process.env[key]))
  checks.push({
    name: "env:worker-or-cron-secret",
    ok: hasWorkerSecret,
    detail: hasWorkerSecret ? "configured" : "missing CRON_SECRET or WORKER_SECRET",
  })

  const nextAuthUrl = process.env.NEXTAUTH_URL || ""
  checks.push({
    name: "env:NEXTAUTH_URL_https",
    ok: nextAuthUrl.startsWith("https://") || process.env.NODE_ENV !== "production",
    detail: nextAuthUrl || "missing",
  })

  return checks
}

async function checkDatabase(prisma: PrismaClient): Promise<Check[]> {
  const checks: Check[] = []

  try {
    await prisma.$queryRaw`SELECT 1`
    checks.push({ name: "database:connectivity", ok: true })
  } catch (error: any) {
    checks.push({ name: "database:connectivity", ok: false, detail: error?.message || String(error) })
    return checks
  }

  try {
    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'Student'
    `
    const names = new Set(columns.map((column) => column.column_name))
    const missing = REQUIRED_STUDENT_COLUMNS.filter((column) => !names.has(column))
    checks.push({
      name: "database:student-index-columns",
      ok: missing.length === 0,
      detail: missing.length ? `missing: ${missing.join(", ")}` : "ready",
    })
  } catch (error: any) {
    checks.push({ name: "database:student-index-columns", ok: false, detail: error?.message || String(error) })
  }

  try {
    const [schools, classes, students] = await Promise.all([
      prisma.school.count(),
      prisma.class.count(),
      prisma.student.count(),
    ])
    checks.push({
      name: "database:counts",
      ok: true,
      detail: `schools=${schools}, classes=${classes}, students=${students}`,
    })
  } catch (error: any) {
    checks.push({ name: "database:counts", ok: false, detail: error?.message || String(error) })
  }

  try {
    const migrations = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = '_prisma_migrations'
      ) AS exists
    `
    checks.push({
      name: "database:prisma-migrations-table",
      ok: Boolean(migrations[0]?.exists),
      detail: migrations[0]?.exists ? "ready" : "missing - use prisma migrate deploy for production changes",
    })
  } catch (error: any) {
    checks.push({ name: "database:prisma-migrations-table", ok: false, detail: error?.message || String(error) })
  }

  try {
    const indexes = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef
      FROM pg_indexes
      WHERE tablename = 'Student'
    `
    const definitions = indexes.map((index) => index.indexdef)
    const missing = REQUIRED_STUDENT_INDEX_COLUMNS.filter((columns) =>
      !definitions.some((definition) => columns.every((column) => definition.includes(column)))
    )
    checks.push({
      name: "database:student-query-indexes",
      ok: missing.length === 0,
      detail: missing.length
        ? `missing index coverage for: ${missing.map((columns) => columns.join("+")).join(", ")}`
        : "ready",
    })
  } catch (error: any) {
    checks.push({ name: "database:student-query-indexes", ok: false, detail: error?.message || String(error) })
  }

  return checks
}

async function checkStorage(): Promise<Check[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return [{ name: "storage:student-photos-bucket", ok: false, detail: "missing Supabase URL/service role key" }]
  }

  try {
    const supabase = createClient(url, serviceKey)
    const { data, error } = await supabase.storage.listBuckets()
    if (error) {
      return [{ name: "storage:student-photos-bucket", ok: false, detail: error.message }]
    }
    const bucket = data?.find((entry) => entry.name === "student-photos")
    return [{
      name: "storage:student-photos-bucket",
      ok: Boolean(bucket),
      detail: bucket ? `found, public=${bucket.public}` : "missing",
    }]
  } catch (error: any) {
    return [{ name: "storage:student-photos-bucket", ok: false, detail: error?.message || String(error) }]
  }
}

function printChecks(checks: Check[]) {
  for (const check of checks) {
    const mark = check.ok ? "PASS" : "FAIL"
    console.log(`${mark} ${check.name}${check.detail ? ` - ${check.detail}` : ""}`)
  }
}

async function main() {
  const dbUrl = process.env.DATABASE_URL
  const prisma = new PrismaClient({ datasourceUrl: dbUrl })

  const checks: Check[] = [
    ...checkEnv(),
    ...(await checkDatabase(prisma)),
    ...(await checkStorage()),
  ]

  await prisma.$disconnect()
  printChecks(checks)

  const failed = checks.filter((check) => !check.ok)
  if (failed.length > 0) {
    console.error(`\nPreflight failed: ${failed.length} check(s) need attention.`)
    process.exitCode = 1
    return
  }

  console.log("\nPreflight passed. Live system dependencies are ready.")
}

main().catch((error) => {
  console.error("Preflight crashed:", error)
  process.exitCode = 1
})
