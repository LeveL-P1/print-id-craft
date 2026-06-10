const target = process.env.LOAD_TARGET || "http://localhost:3000"
const token = process.env.LOAD_TOKEN
const total = Number(process.env.LOAD_TOTAL || 100)
const concurrency = Number(process.env.LOAD_CONCURRENCY || 10)
const endpointMode = process.env.LOAD_MODE || "class"

if (!token) {
  console.error("Missing LOAD_TOKEN. Example: LOAD_TOKEN=<class-link-token> npm run load:submit")
  process.exit(1)
}

const path =
  endpointMode === "school"
    ? `/api/submit/school/${token}/submit`
    : `/api/submit/${token}/submit`

const results = []
let nextIndex = 0

function payload(index) {
  const id = `${Date.now()}-${index}`
  return {
    formData: {
      fullName: `Load Test Student ${id}`,
      rollNo: `LT-${id}`,
      phone: "9999999999",
      class: "Load Test",
    },
    photoUrl: "",
    photoPath: "",
  }
}

async function submitOne(index) {
  const startedAt = performance.now()
  try {
    const res = await fetch(`${target}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload(index)),
    })
    const elapsedMs = performance.now() - startedAt
    results.push({ status: res.status, elapsedMs })
  } catch (error) {
    const elapsedMs = performance.now() - startedAt
    results.push({ status: 0, elapsedMs, error: error.message })
  }
}

async function worker() {
  while (nextIndex < total) {
    const index = nextIndex++
    await submitOne(index)
  }
}

function percentile(values, p) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
}

async function main() {
  const startedAt = performance.now()
  await Promise.all(Array.from({ length: concurrency }, worker))
  const totalElapsed = performance.now() - startedAt
  const latencies = results.map((r) => r.elapsedMs)
  const byStatus = results.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1
    return acc
  }, {})

  console.log(JSON.stringify({
    target,
    path,
    total,
    concurrency,
    elapsedMs: Math.round(totalElapsed),
    requestsPerSecond: Number((results.length / (totalElapsed / 1000)).toFixed(2)),
    status: byStatus,
    latencyMs: {
      p50: Math.round(percentile(latencies, 50)),
      p95: Math.round(percentile(latencies, 95)),
      p99: Math.round(percentile(latencies, 99)),
      max: Math.round(Math.max(...latencies)),
    },
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
