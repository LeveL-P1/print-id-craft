/**
 * Full load test: public submit + optional photo upload.
 *
 * Examples:
 *   LOAD_TARGET=https://staging.example.com LOAD_TOKEN=abc LOAD_TOTAL=1000 npm run load:full
 *   LOAD_WITH_PHOTOS=1 LOAD_TOTAL=500 LOAD_CONCURRENCY=20 npm run load:full
 */
const target = process.env.LOAD_TARGET || "http://localhost:3000"
const token = process.env.LOAD_TOKEN
const total = Math.min(Number(process.env.LOAD_TOTAL || 1000), 3000)
const concurrency = Number(process.env.LOAD_CONCURRENCY || 15)
const endpointMode = process.env.LOAD_MODE || "class"
const withPhotos = process.env.LOAD_WITH_PHOTOS === "1"

if (!token) {
  console.error("Missing LOAD_TOKEN. Example: LOAD_TOKEN=<class-link-token> npm run load:full")
  process.exit(1)
}

const submitPath =
  endpointMode === "school"
    ? `/api/submit/school/${token}/submit`
    : `/api/submit/${token}/submit`

const uploadPath = "/api/upload"

// Minimal valid JPEG (1x1)
const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAACD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAACD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAACD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAACD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAALD/2gAIAQEAAT8hf//Z",
  "base64"
)

const results = []
let nextIndex = 0

function payload(index, photoUrl = "", photoPath = "") {
  const id = `${Date.now()}-${index}`
  return {
    formData: {
      fullName: `Load Test Student ${id}`,
      rollNo: `LT-${id}`,
      phone: "9999999999",
      class: "Load Test",
    },
    photoUrl,
    photoPath,
  }
}

function percentile(values, p) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
}

function summarize(label, entries) {
  const latencies = entries.map((e) => e.elapsedMs)
  const byStatus = entries.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1
    return acc
  }, {})
  return {
    label,
    count: entries.length,
    status: byStatus,
    latencyMs: {
      p50: Math.round(percentile(latencies, 50)),
      p95: Math.round(percentile(latencies, 95)),
      p99: Math.round(percentile(latencies, 99)),
      max: Math.round(Math.max(...latencies, 0)),
    },
  }
}

async function uploadPhoto(index, schoolId) {
  const startedAt = performance.now()
  try {
    const form = new FormData()
    form.append("file", new Blob([TINY_JPEG], { type: "image/jpeg" }), `load-${index}.jpg`)
    form.append("folder", `students/${schoolId}`)
    form.append("submitToken", token)

    const res = await fetch(`${target}${uploadPath}`, { method: "POST", body: form })
    const elapsedMs = performance.now() - startedAt
    const data = await res.json().catch(() => ({}))
    return {
      status: res.status,
      elapsedMs,
      url: data.url || "",
      path: data.path || "",
      error: data.error,
    }
  } catch (error) {
    return {
      status: 0,
      elapsedMs: performance.now() - startedAt,
      url: "",
      path: "",
      error: error.message,
    }
  }
}

async function submitOne(index, schoolId) {
  const uploadStartedAt = performance.now()
  let photoUrl = ""
  let photoPath = ""
  let uploadResult = null

  if (withPhotos && schoolId) {
    uploadResult = await uploadPhoto(index, schoolId)
    photoUrl = uploadResult.url
    photoPath = uploadResult.path
  }

  const submitStartedAt = performance.now()
  try {
    const res = await fetch(`${target}${submitPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload(index, photoUrl, photoPath)),
    })
    const submitElapsedMs = performance.now() - submitStartedAt
    const totalElapsedMs = performance.now() - uploadStartedAt

    results.push({
      index,
      uploadStatus: uploadResult?.status ?? null,
      uploadElapsedMs: uploadResult?.elapsedMs ?? 0,
      submitStatus: res.status,
      submitElapsedMs,
      totalElapsedMs,
    })
  } catch (error) {
    results.push({
      index,
      uploadStatus: uploadResult?.status ?? null,
      uploadElapsedMs: uploadResult?.elapsedMs ?? 0,
      submitStatus: 0,
      submitElapsedMs: performance.now() - submitStartedAt,
      totalElapsedMs: performance.now() - uploadStartedAt,
      error: error.message,
    })
  }
}

async function resolveSchoolId() {
  const path =
    endpointMode === "school"
      ? `/api/submit/school/${token}`
      : `/api/submit/${token}`
  const res = await fetch(`${target}${path}`)
  if (!res.ok) return null
  const data = await res.json().catch(() => ({}))
  return data?.data?.schoolId || data?.schoolId || data?.data?.school?.id || null
}

async function worker(schoolId) {
  while (nextIndex < total) {
    const index = nextIndex++
    await submitOne(index, schoolId)
  }
}

async function main() {
  const startedAt = performance.now()
  const schoolId = withPhotos ? await resolveSchoolId() : null

  if (withPhotos && !schoolId) {
    console.error("Could not resolve schoolId from submit token. Photo upload phase skipped.")
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker(schoolId)))
  const totalElapsed = performance.now() - startedAt

  const uploadEntries = results
    .filter((r) => r.uploadStatus != null)
    .map((r) => ({ status: r.uploadStatus, elapsedMs: r.uploadElapsedMs }))
  const submitEntries = results.map((r) => ({ status: r.submitStatus, elapsedMs: r.submitElapsedMs }))
  const totalEntries = results.map((r) => ({ status: r.submitStatus, elapsedMs: r.totalElapsedMs }))

  console.log(
    JSON.stringify(
      {
        target,
        submitPath,
        total,
        concurrency,
        withPhotos: withPhotos && !!schoolId,
        elapsedMs: Math.round(totalElapsed),
        requestsPerSecond: Number((results.length / (totalElapsed / 1000)).toFixed(2)),
        upload: uploadEntries.length ? summarize("upload", uploadEntries) : null,
        submit: summarize("submit", submitEntries),
        endToEnd: summarize("end-to-end", totalEntries),
        failures: results.filter((r) => r.submitStatus !== 201 && r.submitStatus !== 200).slice(0, 10),
      },
      null,
      2
    )
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
