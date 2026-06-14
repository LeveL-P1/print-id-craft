/**
 * Student ID photo background pipeline.
 */

export type BgUniformity = {
  score: number
  dominantRgb: { r: number; g: number; b: number }
  dominantRatio: number
}

export function parseHexColor(input: string | undefined): { r: number; g: number; b: number } | null {
  if (!input) return null
  const hex = input.trim().replace(/^#/, "")
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    }
  }
  const m = input.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (m) return { r: +m[1], g: +m[2], b: +m[3] }
  return null
}

export function colorDistance(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number }
): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2)
}

export function analyzeEdgeBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number
): BgUniformity {
  type RGB = { r: number; g: number; b: number }
  const samples: RGB[] = []
  const collect = (x: number, y: number, width: number, height: number) => {
    try {
      const data = ctx.getImageData(x, y, width, height).data
      for (let i = 0; i < data.length; i += 16) {
        samples.push({ r: data[i], g: data[i + 1], b: data[i + 2] })
      }
    } catch { /* ignore */ }
  }
  const topBand = Math.max(20, Math.floor(h * 0.12))
  const sideBand = Math.max(20, Math.floor(w * 0.10))
  collect(0, 0, w, topBand)
  collect(0, topBand, sideBand, Math.floor(h * 0.55))
  collect(w - sideBand, topBand, sideBand, Math.floor(h * 0.55))

  if (samples.length === 0) {
    return { score: 50, dominantRgb: { r: 255, g: 255, b: 255 }, dominantRatio: 0 }
  }

  const hist = new Map<number, number>()
  for (const p of samples) {
    const bin = ((p.r >> 4) << 8) | ((p.g >> 4) << 4) | (p.b >> 4)
    hist.set(bin, (hist.get(bin) || 0) + 1)
  }
  let topBin = 0, topCount = 0
  Array.from(hist.entries()).forEach(([bin, count]) => {
    if (count > topCount) { topCount = count; topBin = bin }
  })
  const dominantRatio = topCount / samples.length
  const dR = (topBin >> 8) & 0xf, dG = (topBin >> 4) & 0xf, dB = topBin & 0xf
  const minR = dR * 16, minG = dG * 16, minB = dB * 16
  let sR = 0, sG = 0, sB = 0, n = 0
  for (const p of samples) {
    if (p.r >= minR && p.r < minR + 16 && p.g >= minG && p.g < minG + 16 && p.b >= minB && p.b < minB + 16) {
      sR += p.r; sG += p.g; sB += p.b; n++
    }
  }
  const dominantRgb = n > 0
    ? { r: Math.round(sR / n), g: Math.round(sG / n), b: Math.round(sB / n) }
    : { r: minR + 8, g: minG + 8, b: minB + 8 }

  const avgR = samples.reduce((s, p) => s + p.r, 0) / samples.length
  const avgG = samples.reduce((s, p) => s + p.g, 0) / samples.length
  const avgB = samples.reduce((s, p) => s + p.b, 0) / samples.length
  const variance = samples.reduce(
    (s, p) => s + (p.r - avgR) ** 2 + (p.g - avgG) ** 2 + (p.b - avgB) ** 2, 0
  ) / (samples.length * 3)
  const stdDev = Math.sqrt(variance)

  let stdScore = 50
  if (stdDev > 70) stdScore = 0
  else if (stdDev > 55) stdScore = 10
  else if (stdDev > 45) stdScore = 20
  else if (stdDev > 35) stdScore = 30
  else if (stdDev > 25) stdScore = 40

  let domScore = 0
  if (dominantRatio > 0.85) domScore = 50
  else if (dominantRatio > 0.70) domScore = 40
  else if (dominantRatio > 0.55) domScore = 25
  else if (dominantRatio > 0.40) domScore = 10

  return { score: Math.min(100, stdScore + domScore), dominantRgb, dominantRatio }
}

export function isPlainBackground(bg: BgUniformity): boolean {
  return bg.score >= 75 && bg.dominantRatio >= 0.6
}

export function matchesSchoolColor(
  bg: BgUniformity,
  schoolHex: string | undefined,
  threshold = 50
): boolean {
  const target = parseHexColor(schoolHex)
  if (!target) return false
  return colorDistance(bg.dominantRgb, target) < threshold
}

/** Fast recolor only when the wall is already the school colour — never for white→red etc. */
export function canUseFastRecolorOnly(bg: BgUniformity, targetHex: string): boolean {
  if (!isPlainBackground(bg)) return false
  return matchesSchoolColor(bg, targetHex, 45)
}

export function measureEdgeBackgroundMatch(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  targetHex: string
): number {
  const target = parseHexColor(targetHex)
  if (!target) return 0

  const bg = analyzeEdgeBackground(ctx, w, h)
  const dist = colorDistance(bg.dominantRgb, target)
  if (dist > 55) return Math.max(0, 100 - dist)

  type RGB = { r: number; g: number; b: number }
  const samples: RGB[] = []
  const collect = (x: number, y: number, width: number, height: number) => {
    try {
      const data = ctx.getImageData(x, y, width, height).data
      for (let i = 0; i < data.length; i += 12) {
        samples.push({ r: data[i], g: data[i + 1], b: data[i + 2] })
      }
    } catch { /* ignore */ }
  }
  const topBand = Math.max(20, Math.floor(h * 0.12))
  const sideBand = Math.max(20, Math.floor(w * 0.10))
  collect(0, 0, w, topBand)
  collect(0, topBand, sideBand, Math.floor(h * 0.55))
  collect(w - sideBand, topBand, sideBand, Math.floor(h * 0.55))

  if (samples.length === 0) return 0
  const matched = samples.filter((p) => colorDistance(p, target) < 40).length
  return Math.round((matched / samples.length) * 100)
}

export async function measureForegroundRatioInTransparentBlob(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(blob)
    const finish = (ratio: number) => {
      URL.revokeObjectURL(url)
      resolve(ratio)
    }
    img.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext("2d")
      if (!ctx) { finish(0); return }
      ctx.drawImage(img, 0, 0)
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      let fg = 0
      const total = canvas.width * canvas.height
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] >= 64) fg++
      }
      finish(total > 0 ? fg / total : 0)
    }
    img.onerror = () => finish(0)
    img.src = url
  })
}

/** Flood from edges: remove white halos and uneven shades outside the subject. */
export function cleanupBackgroundArtifacts(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  targetHex: string
): void {
  const target = parseHexColor(targetHex)
  if (!target) return

  const imageData = ctx.getImageData(0, 0, w, h)
  const data = imageData.data
  const total = w * h

  const isReplaceable = (r: number, g: number, b: number) => {
    if (r > 195 && g > 195 && b > 195) return true
    if (colorDistance({ r, g, b }, target) < 55) return true
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    if (max - min < 28 && max > 150) return true
    return false
  }

  const isProtectedSubject = (r: number, g: number, b: number) => {
    if (g > r + 12 && g > b + 12 && g > 60) return true
    if (r > 95 && g > 50 && b > 35 && r >= g - 15 && r > b + 8) return true
    if (r < 90 && g < 90 && b < 90) return true
    return false
  }

  const visited = new Uint8Array(total)
  const replace = new Uint8Array(total)
  const queue = new Int32Array(total)
  let head = 0
  let tail = 0

  const trySeed = (idx: number) => {
    if (idx < 0 || idx >= total || visited[idx]) return
    const i = idx * 4
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    if (isProtectedSubject(r, g, b)) {
      visited[idx] = 1
      return
    }
    if (!isReplaceable(r, g, b)) {
      visited[idx] = 1
      return
    }
    visited[idx] = 1
    replace[idx] = 1
    queue[tail++] = idx
  }

  for (let x = 0; x < w; x++) {
    trySeed(x)
    trySeed((h - 1) * w + x)
  }
  for (let y = 0; y < h; y++) {
    trySeed(y * w)
    trySeed(y * w + (w - 1))
  }

  while (head < tail) {
    const idx = queue[head++]
    const x = idx % w
    const y = (idx / w) | 0
    const neighbours = [
      x > 0 ? idx - 1 : -1,
      x < w - 1 ? idx + 1 : -1,
      y > 0 ? idx - w : -1,
      y < h - 1 ? idx + w : -1,
    ]
    for (const n of neighbours) {
      if (n < 0 || visited[n]) continue
      const i = n * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      if (isProtectedSubject(r, g, b)) {
        visited[n] = 1
        continue
      }
      if (!isReplaceable(r, g, b)) {
        visited[n] = 1
        continue
      }
      visited[n] = 1
      replace[n] = 1
      queue[tail++] = n
    }
  }

  for (let i = 0; i < total; i++) {
    if (!replace[i]) continue
    const p = i * 4
    data[p] = target.r
    data[p + 1] = target.g
    data[p + 2] = target.b
    data[p + 3] = 255
  }

  ctx.putImageData(imageData, 0, 0)
}

export function recolorPlainBackgroundOnCanvas(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  targetHex: string,
  tolerance = 42
): boolean {
  const target = parseHexColor(targetHex)
  if (!target) return false

  const bg = analyzeEdgeBackground(ctx, w, h)
  if (!isPlainBackground(bg)) return false

  const imageData = ctx.getImageData(0, 0, w, h)
  const data = imageData.data
  const total = w * h
  const visited = new Uint8Array(total)
  const replace = new Uint8Array(total)
  const queue = new Int32Array(total)
  const { r: dr, g: dg, b: db } = bg.dominantRgb

  const matchesBg = (idx: number) => {
    const i = idx * 4
    const dist = Math.sqrt(
      (data[i] - dr) ** 2 + (data[i + 1] - dg) ** 2 + (data[i + 2] - db) ** 2
    )
    return dist <= tolerance
  }

  const seedCorners = [
    0, w - 1, (h - 1) * w, (h - 1) * w + (w - 1),
    w >> 1, (h >> 1) * w,
  ]
  let head = 0, tail = 0
  for (const seed of seedCorners) {
    if (seed < 0 || seed >= total || visited[seed] || !matchesBg(seed)) continue
    visited[seed] = 1
    replace[seed] = 1
    queue[tail++] = seed
  }

  while (head < tail) {
    const idx = queue[head++]
    const x = idx % w
    const y = (idx / w) | 0
    const neighbours = [
      x > 0 ? idx - 1 : -1,
      x < w - 1 ? idx + 1 : -1,
      y > 0 ? idx - w : -1,
      y < h - 1 ? idx + w : -1,
    ]
    for (const n of neighbours) {
      if (n < 0 || visited[n] || !matchesBg(n)) continue
      visited[n] = 1
      replace[n] = 1
      queue[tail++] = n
    }
  }

  let replaced = 0
  for (let i = 0; i < total; i++) {
    if (!replace[i]) continue
    const p = i * 4
    data[p] = target.r
    data[p + 1] = target.g
    data[p + 2] = target.b
    data[p + 3] = 255
    replaced++
  }

  if (replaced < total * 0.15) return false
  ctx.putImageData(imageData, 0, 0)
  cleanupBackgroundArtifacts(ctx, w, h, targetHex)
  return true
}

export async function loadImageToCanvas(url: string, maxDim = 1024): Promise<{
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
}> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
      const canvas = document.createElement("canvas")
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
      const ctx = canvas.getContext("2d")
      if (!ctx) { reject(new Error("Canvas unavailable")); return }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve({ canvas, ctx })
    }
    img.onerror = () => reject(new Error("Image load failed"))
    img.src = url
  })
}

type BgRemovalDevice = "gpu" | "cpu"

/**
 * ISNet FP16 — IMG.LY default: best practical balance of hair/edge quality,
 * download size (~80MB), and inference speed on parent phones. Full `isnet`
 * is slightly sharper but ~2× slower and more likely to feel stuck on CPU.
 */
export const BG_REMOVAL_MODEL = "isnet_fp16" as const

/** Abort inference if the device stalls — prevents an endless spinner. */
export const BG_REMOVAL_INFERENCE_TIMEOUT_MS = 120_000

let preloadPromise: Promise<BgRemovalDevice> | null = null
let removalChain: Promise<unknown> = Promise.resolve()

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)),
      ms
    )
    promise.then(
      (value) => { clearTimeout(timer); resolve(value) },
      (err) => { clearTimeout(timer); reject(err) }
    )
  })
}

function runSerialized<T>(task: () => Promise<T>): Promise<T> {
  const run = removalChain.then(task, task)
  removalChain = run.then(() => undefined, () => undefined)
  return run
}

export function preloadBgRemovalModel(): Promise<BgRemovalDevice> {
  if (typeof window === "undefined") return Promise.resolve("cpu")
  if (!preloadPromise) {
    preloadPromise = runSerialized(async () => {
      const { preload } = await import("@imgly/background-removal")
      try {
        await preload({
          model: BG_REMOVAL_MODEL,
          device: "gpu",
          fetchArgs: { cache: "force-cache" },
        })
        return "gpu" as const
      } catch {
        await preload({ model: BG_REMOVAL_MODEL, device: "cpu" })
        return "cpu" as const
      }
    }).catch(() => "cpu" as const)
  }
  return preloadPromise
}

export async function removeBackgroundWithBestModel(
  blob: Blob,
  onProgress?: (msg: string, pct: number) => void
): Promise<Blob> {
  return runSerialized(async () => {
    const device = await preloadBgRemovalModel()
    const { removeBackground } = await import("@imgly/background-removal")
    const base = {
      model: BG_REMOVAL_MODEL,
      proxyToWorker: true,
      fetchArgs: { cache: "force-cache" as RequestCache },
      output: { format: "image/png" as const, quality: 0.92 },
      progress: (key: string, current: number, total: number) => {
        const pct = Math.round((current / total) * 100)
        if (key.includes("fetch")) onProgress?.("Downloading AI model...", pct)
        else if (key.includes("inference")) onProgress?.("Cleaning background...", pct)
      },
    }

    try {
      const result = await withTimeout(
        removeBackground(blob, { ...base, device }),
        BG_REMOVAL_INFERENCE_TIMEOUT_MS,
        "Background removal"
      )
      return result
    } catch (gpuErr) {
      if (device === "cpu") throw gpuErr
      const { preload } = await import("@imgly/background-removal")
      await preload({ model: BG_REMOVAL_MODEL, device: "cpu" })
      return await withTimeout(
        removeBackground(blob, { ...base, device: "cpu" }),
        BG_REMOVAL_INFERENCE_TIMEOUT_MS,
        "Background removal"
      )
    }
  })
}
export async function downscaleBlob(blob: Blob, maxDim = 768): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(blob)
    const finish = (result: Blob) => {
      URL.revokeObjectURL(url)
      resolve(result)
    }
    img.onload = () => {
      const { naturalWidth: w, naturalHeight: h } = img
      if (w <= maxDim && h <= maxDim) {
        finish(blob)
        return
      }
      const scale = maxDim / Math.max(w, h)
      const canvas = document.createElement("canvas")
      canvas.width = Math.round(w * scale)
      canvas.height = Math.round(h * scale)
      const ctx = canvas.getContext("2d")
      if (!ctx) { finish(blob); return }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((result) => finish(result || blob), "image/jpeg", 0.88)
    }
    img.onerror = () => finish(blob)
    img.src = url
  })
}
