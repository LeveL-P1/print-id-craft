const SERVICE = (process.argv[2] || "https://teamsasd-wisemelon-bg-removal.hf.space").replace(/\/+$/, "")
const CASES = [
  ["boy_light_shirt", "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=480&h=640&fit=crop"],
  ["girl_long_hair", "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=480&h=640&fit=crop"],
  ["girl_plain_wall", "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=480&h=640&fit=crop"],
]
async function fetchJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": "WiseMelon-bg-test/1.0" } })
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => ({})) }
}
async function download(url) {
  const res = await fetch(url, { headers: { "User-Agent": "WiseMelon-bg-test/1.0" } })
  if (!res.ok) throw new Error("download " + res.status)
  return Buffer.from(await res.arrayBuffer())
}
async function remove(imageBytes) {
  const form = new FormData()
  form.append("image", new Blob([imageBytes], { type: "image/jpeg" }), "photo.jpg")
  form.append("model", "birefnet-portrait")
  form.append("bgColor", "#DA0B0B")
  const started = Date.now()
  const res = await fetch(SERVICE + "/remove", { method: "POST", body: form, headers: { "User-Agent": "WiseMelon-bg-test/1.0" } })
  const elapsed = ((Date.now() - started) / 1000).toFixed(1)
  const model = res.headers.get("x-bg-removal-model") || "?"
  const bytes = Buffer.from(await res.arrayBuffer())
  return { ok: res.ok, status: res.status, elapsed, model, size: bytes.length, detail: bytes.toString("utf8").slice(0, 200) }
}
async function main() {
  console.log("Service:", SERVICE)
  const health = await fetchJson(SERVICE + "/health")
  console.log("Health:", JSON.stringify(health.body, null, 2))
  if (!health.ok || !health.body.ok) process.exit(1)
  const mergeReady = health.body.mergeMask === true && Boolean(health.body.mergeModel)
  const versionOk = health.body.serviceVersion === "2026-06-15-merge-v1"
  console.log("mergeReady=" + mergeReady + " versionOk=" + versionOk)
  if (!mergeReady) console.log("NOTE: Factory-rebuild Space from latest main (docker/rembg).\n")
  let failed = 0
  for (const [name, url] of CASES) {
    console.log("=== " + name + " ===")
    try {
      const raw = await download(url)
      const result = await remove(raw)
      if (!result.ok) { console.log("FAIL", result.status, result.detail); failed++; continue }
      console.log((result.model.includes("u2net_human_seg") ? "PASS+" : "PASS") + " model=" + result.model + " time=" + result.elapsed + "s png=" + result.size)
    } catch (e) { console.log("FAIL", e.message || e); failed++ }
  }
  process.exit(failed ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
