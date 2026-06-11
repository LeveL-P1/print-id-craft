import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

let dbUrl = process.env.DATABASE_URL;
if (dbUrl && process.env.NODE_ENV === "production" && !dbUrl.includes("pgbouncer=true")) {
  dbUrl += (dbUrl.includes("?") ? "&" : "?") + "pgbouncer=true&connection_limit=5&statement_cache_size=0&pool_timeout=15";
} else if (dbUrl && dbUrl.includes("connection_limit=")) {
  // Supabase Pro plan supports larger pool — use 5 per function for fast responses
  dbUrl = dbUrl.replace(/connection_limit=\d+/, "connection_limit=5");
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    datasourceUrl: dbUrl,
  })

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma

/**
 * Helper: Execute a batch of operations with controlled concurrency.
 * Prevents overwhelming the DB connection pool.
 */
export async function batchExecute<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number = 10
): Promise<{ results: R[]; errors: Array<{ index: number; error: string }> }> {
  const results: R[] = []
  const errors: Array<{ index: number; error: string }> = []

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency)
    const settled = await Promise.allSettled(
      batch.map((item, batchIdx) => fn(item).then(r => ({ globalIdx: i + batchIdx, result: r })))
    )
    for (const outcome of settled) {
      if (outcome.status === "fulfilled") {
        results.push(outcome.value.result)
      } else {
        const idx = results.length + errors.length
        errors.push({ index: idx, error: outcome.reason?.message || "Unknown error" })
      }
    }
  }

  return { results, errors }
}
