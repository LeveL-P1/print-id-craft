// Validates Poof.bg API keys from POOFBG_FREE_API_KEYS and simulates rotation.
// Usage: node scripts/test-poof-keys.cjs

const fs = require("fs")
const path = require("path")

const sharp = require("sharp")

const POOF_URL = "https://api.poof.bg/v1/remove"
const POOF_SIZE = process.env.POOFBG_SIZE || "preview"
let testImage = null

async function getTestImage() {
  if (testImage) return testImage
  testImage = await sharp({
    create: { width: 400, height: 520, channels: 3, background: { r: 180, g: 200, b: 220 } },
  }).jpeg().toBuffer()
  return testImage
}

function loadKeys() {
  const envPath = path.join(__dirname, "..", ".env")
  const raw = fs.readFileSync(envPath, "utf8")
  const line = raw.split("\n").find((l) => l.startsWith("POOFBG_FREE_API_KEYS="))
  if (!line) throw new Error("POOFBG_FREE_API_KEYS not found in .env")
  const keys = line.slice("POOFBG_FREE_API_KEYS=".length).trim().split(",").map((k) => k.trim()).filter(Boolean)
  if (!keys.length) throw new Error("No keys in POOFBG_FREE_API_KEYS")
  return keys
}

function classify(status, detail) {
  const lower = String(detail).toLowerCase()
  if (status === 200) return "OK - has credits"
  if (status === 402 || (lower.includes("credit") && (lower.includes("exhaust") || lower.includes("insufficient") || lower.includes("limit")))) {
    return "VALID - credits exhausted"
  }
  if (status === 401 || status === 403) return "INVALID - key rejected"
  if (status === 429 || lower.includes("rate limit")) return "VALID - rate limited"
  if (status >= 500) return "SERVER ERROR"
  return "UNKNOWN (" + status + ")"
}

function shouldRotate(status, detail) {
  const lower = String(detail).toLowerCase()
  if (status === 402 || status === 401 || status === 403 || status === 429) return true
  if (lower.includes("credit") && (lower.includes("exhaust") || lower.includes("insufficient") || lower.includes("limit"))) return true
  if (status >= 500 && status < 600) return true
  return false
}

async function testKey(key, index) {
  const image = await getTestImage()
  const form = new FormData()
  form.append("image_file", new Blob([image], { type: "image/jpeg" }), "test.jpg")
  form.append("size", POOF_SIZE)
  form.append("format", "jpg")
  form.append("bg_color", "#FFFFFF")

  try {
    const res = await fetch(POOF_URL, {
      method: "POST",
      headers: { "x-api-key": key },
      body: form,
    })
    const detail = await res.text()
    let message = detail
    try {
      const json = JSON.parse(detail)
      message = json.error?.message || json.message || detail
      if (json.error?.code) message = json.error.code + ": " + message
    } catch {
      // raw
    }
    return {
      index,
      keyPreview: key.slice(0, 10) + "..." + key.slice(-6),
      status: res.status,
      result: classify(res.status, message),
      rotates: shouldRotate(res.status, message),
      message: String(message).slice(0, 100),
    }
  } catch (err) {
    return {
      index,
      keyPreview: key.slice(0, 10) + "..." + key.slice(-6),
      status: 0,
      result: "NETWORK ERROR",
      rotates: true,
      message: err instanceof Error ? err.message : String(err),
    }
  }
}

async function main() {
  const keys = loadKeys()
  console.log("Testing " + keys.length + " Poof API keys...\n")

  const results = []
  for (let i = 0; i < keys.length; i++) {
    process.stdout.write("  [" + (i + 1) + "/" + keys.length + "] " + keys[i].slice(0, 12) + "... ")
    const r = await testKey(keys[i], i + 1)
    results.push(r)
    console.log(r.result + " (HTTP " + (r.status || "-") + ")")
    if (i < keys.length - 1) await new Promise((res) => setTimeout(res, 400))
  }

  const ok = results.filter((r) => r.status === 200)
  const exhausted = results.filter((r) => r.result.startsWith("VALID - credits"))
  const invalid = results.filter((r) => r.result.startsWith("INVALID"))

  console.log("\n--- Summary ---")
  console.log("  Has credits:      " + ok.length)
  console.log("  Valid, exhausted: " + exhausted.length)
  console.log("  Invalid:          " + invalid.length)

  console.log("\n--- Rotation simulation ---")
  for (let i = 0; i < keys.length; i++) {
    const r = results[i]
    if (r.status === 200) {
      console.log("Next photo uses key #" + (i + 1) + " SUCCESS")
      break
    }
    if (r.rotates && i < keys.length - 1) {
      console.log("Key #" + (i + 1) + " " + r.result + " -> auto-switch to key #" + (i + 2))
    } else {
      console.log("Key #" + (i + 1) + " " + r.result + " -> stop or fallback")
      break
    }
  }

  if (invalid.length) {
    console.log("\nInvalid key numbers: " + invalid.map((r) => r.index).join(", "))
  }

  process.exit(invalid.length === keys.length ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
