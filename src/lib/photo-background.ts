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

/** True when a pixel looks like the chosen plain background (not shirt/uniform). */
export function isBackgroundLikePixel(
  r: number,
  g: number,
  b: number,
  target: { r: number; g: number; b: number },
  inSubjectZone = false
): boolean {
  const tolerance = inSubjectZone ? 22 : 42
  return colorDistance({ r, g, b }, target) < tolerance
}

export function isSubjectInteriorPixel(x: number, y: number, w: number, h: number): boolean {
  const xRatio = x / w
  const yRatio = y / h
  return xRatio > 0.08 && xRatio < 0.92 && yRatio > 0.14 && yRatio < 0.98
}

/** Head/ hair band — slightly more aggressive hole fill than torso. */
export function isHeadHairZonePixel(x: number, y: number, w: number, h: number): boolean {
  const xRatio = x / w
  const yRatio = y / h
  return xRatio > 0.05 && xRatio < 0.95 && yRatio > 0.02 && yRatio < 0.85
}

export type MaskHoleRepairOptions = {
  holeAlphaMax?: number
  solidNeighborAlpha?: number
  minSolidNeighbors?: number
  wispyAlphaMax?: number
  wispyMinSolidNeighbors?: number
  iterations?: number
}

function readAlpha(data: Uint8ClampedArray, idx: number): number {
  return data[idx * 4 + 3]
}

function createImageData(data: Uint8ClampedArray, width: number, height: number): ImageData {
  if (typeof ImageData !== "undefined") {
    return new ImageData(data.slice() as unknown as ImageDataArray, width, height)
  }
  return { data, width, height } as ImageData
}

function countSolidNeighbors(
  alphaAt: (idx: number) => number,
  idx: number,
  w: number,
  h: number,
  minAlpha: number
): number {
  const x = idx % w
  const y = (idx / w) | 0
  const offsets = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1],
  ]
  let count = 0
  for (const [dx, dy] of offsets) {
    const nx = x + dx
    const ny = y + dy
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
    if (alphaAt(ny * w + nx) >= minAlpha) count++
  }
  return count
}

/** Pixels reachable from the border through low-alpha regions (true background). */
export function markExteriorBackgroundMask(
  maskData: Uint8ClampedArray,
  w: number,
  h: number,
  holeAlphaMax: number
): Uint8Array {
  const total = w * h
  const exterior = new Uint8Array(total)
  const queue = new Int32Array(total)
  let head = 0
  let tail = 0

  const alphaAt = (idx: number) => readAlpha(maskData, idx)

  const trySeed = (idx: number) => {
    if (idx < 0 || idx >= total || exterior[idx]) return
    if (alphaAt(idx) >= holeAlphaMax) return
    exterior[idx] = 1
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
      x > 0 && y > 0 ? idx - w - 1 : -1,
      x < w - 1 && y > 0 ? idx - w + 1 : -1,
      x > 0 && y < h - 1 ? idx + w - 1 : -1,
      x < w - 1 && y < h - 1 ? idx + w + 1 : -1,
    ]
    for (const n of neighbours) {
      if (n < 0 || exterior[n] || alphaAt(n) >= holeAlphaMax) continue
      exterior[n] = 1
      queue[tail++] = n
    }
  }

  return exterior
}

/**
 * Fill transparent patches inside hair/subject using the original photo colours.
 * Fixes Swiss-cheese hair without touching true background outside the silhouette.
 */
export function repairForegroundMaskHoles(
  original: ImageData,
  mask: ImageData,
  options?: MaskHoleRepairOptions
): ImageData {
  const w = mask.width
  const h = mask.height
  if (original.width !== w || original.height !== h) return mask

  const holeAlphaMax = options?.holeAlphaMax ?? 72
  const solidNeighborAlpha = options?.solidNeighborAlpha ?? 118
  const minSolidNeighbors = options?.minSolidNeighbors ?? 4
  const wispyAlphaMax = options?.wispyAlphaMax ?? 132
  const wispyMinSolidNeighbors = options?.wispyMinSolidNeighbors ?? 5
  const iterations = options?.iterations ?? 2

  const outData = new Uint8ClampedArray(mask.data)
  const orig = original.data
  const total = w * h

  for (let pass = 0; pass < iterations; pass++) {
    const alphaAt = (idx: number) => readAlpha(outData, idx)
    const exterior = markExteriorBackgroundMask(outData, w, h, holeAlphaMax)

    for (let idx = 0; idx < total; idx++) {
      const alpha = alphaAt(idx)
      const x = idx % w
      const y = (idx / w) | 0
      const inHead = isHeadHairZonePixel(x, y, w, h)
      const p = idx * 4

      const solidNeighbors = countSolidNeighbors(
        alphaAt,
        idx,
        w,
        h,
        solidNeighborAlpha
      )
      const headMinNeighbors = Math.max(3, minSolidNeighbors - 1)
      const requiredSolid = inHead ? headMinNeighbors : minSolidNeighbors

      const isInteriorHole = alpha < holeAlphaMax && !exterior[idx]
      const isWispyStrand =
        alpha >= holeAlphaMax &&
        alpha < wispyAlphaMax &&
        solidNeighbors >= (inHead ? wispyMinSolidNeighbors - 1 : wispyMinSolidNeighbors)

      if (!isInteriorHole && !isWispyStrand) continue
      if (isInteriorHole && solidNeighbors < requiredSolid) continue

      outData[p] = orig[p]
      outData[p + 1] = orig[p + 1]
      outData[p + 2] = orig[p + 2]
      outData[p + 3] = 255
    }
  }

  return createImageData(outData, w, h)
}

export async function loadBlobAsImageData(blob: Blob): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(blob)
    img.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext("2d")
      if (!ctx) {
        URL.revokeObjectURL(url)
        reject(new Error("Canvas unavailable"))
        return
      }
      ctx.drawImage(img, 0, 0)
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(data)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Image load failed"))
    }
    img.src = url
  })
}

export async function imageDataToPngBlob(image: ImageData): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas")
    canvas.width = image.width
    canvas.height = image.height
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      reject(new Error("Canvas unavailable"))
      return
    }
    ctx.putImageData(image, 0, 0)
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error("Could not encode repaired mask"))
    }, "image/png")
  })
}

export async function repairTransparentBlobHoles(
  originalBlob: Blob,
  maskBlob: Blob
): Promise<Blob> {
  const [original, mask] = await Promise.all([
    loadBlobAsImageData(originalBlob),
    loadBlobAsImageData(maskBlob),
  ])
  if (original.width !== mask.width || original.height !== mask.height) {
    return maskBlob
  }
  const repaired = enhanceForegroundMask(original, mask)
  return imageDataToPngBlob(repaired)
}

/** Alpha below this is treated as background when compositing.
 *  Lowered from 48→20 to preserve semi-transparent hair strands during
 *  the "cutout sticker" compositing step. */
export const BG_ALPHA_CUTOFF = 20

const DEFAULT_MASK_ENHANCE: MaskHoleRepairOptions = {
  iterations: 4,
  holeAlphaMax: 80,
  solidNeighborAlpha: 108,
  minSolidNeighbors: 3,
  wispyAlphaMax: 142,
  wispyMinSolidNeighbors: 4,
}

/** Use true photo colours anywhere the mask says foreground. */
export function alignMaskWithOriginalColors(original: ImageData, mask: ImageData): ImageData {
  const out = new Uint8ClampedArray(mask.data)
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] < BG_ALPHA_CUTOFF) continue
    out[i] = original.data[i]
    out[i + 1] = original.data[i + 1]
    out[i + 2] = original.data[i + 2]
  }
  return createImageData(out, mask.width, mask.height)
}

/**
 * ID-card portraits follow a predictable shape: head at top, shoulders/shirt below.
 * Some free models keep hair but incorrectly mark white shirts as background.
 * This repairs the inferred torso envelope using original pixels instead of the
 * selected plain background colour.
 */
export function rescuePortraitEnvelope(original: ImageData, mask: ImageData): ImageData {
  const w = mask.width
  const h = mask.height
  const out = new Uint8ClampedArray(mask.data)
  const rowBounds: Array<{ min: number; max: number } | null> = new Array(h).fill(null)

  for (let y = 0; y < h; y++) {
    let min = w
    let max = -1
    for (let x = 0; x < w; x++) {
      const a = out[(y * w + x) * 4 + 3]
      if (a < 72) continue
      min = Math.min(min, x)
      max = Math.max(max, x)
    }
    if (max >= min) rowBounds[y] = { min, max }
  }

  const solidRows = rowBounds
    .map((bounds, y) => bounds ? y : -1)
    .filter((y) => y >= 0)
  if (solidRows.length < Math.max(8, Math.floor(h * 0.08))) return mask

  const top = solidRows[0]
  const bottom = solidRows[solidRows.length - 1]
  const centerX = (() => {
    let sum = 0
    let n = 0
    for (let y = top; y <= bottom; y++) {
      const bounds = rowBounds[y]
      if (!bounds) continue
      sum += (bounds.min + bounds.max) / 2
      n++
    }
    return n ? sum / n : w / 2
  })()

  for (let y = top; y < h; y++) {
    const yRatio = y / h
    if (yRatio < 0.46) continue

    const halfWidth = Math.min(w * 0.48, w * (0.22 + (yRatio - 0.46) * 0.6))
    const minX = Math.max(0, Math.floor(centerX - halfWidth))
    const maxX = Math.min(w - 1, Math.ceil(centerX + halfWidth))

    for (let x = minX; x <= maxX; x++) {
      const idx = (y * w + x) * 4
      if (out[idx + 3] >= 96) continue
      out[idx] = original.data[idx]
      out[idx + 1] = original.data[idx + 1]
      out[idx + 2] = original.data[idx + 2]
      out[idx + 3] = 255
    }
  }

  return createImageData(out, w, h)
}

/** Close tiny alpha gaps (hair strands, shirt folds) using original colours. */
export function closeMaskAlphaGaps(original: ImageData, mask: ImageData): ImageData {
  const w = mask.width
  const h = mask.height
  const out = new Uint8ClampedArray(mask.data)
  const alphas = new Uint8Array(w * h)
  for (let idx = 0; idx < w * h; idx++) {
    alphas[idx] = out[idx * 4 + 3]
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x
      let maxAlpha = alphas[idx]
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          maxAlpha = Math.max(maxAlpha, alphas[ny * w + nx])
        }
      }
      if (maxAlpha <= alphas[idx] || maxAlpha < 88) continue
      const p = idx * 4
      out[p] = original.data[p]
      out[p + 1] = original.data[p + 1]
      out[p + 2] = original.data[p + 2]
      out[p + 3] = Math.min(255, Math.max(maxAlpha, alphas[idx] + 24))
    }
  }

  return createImageData(out, w, h)
}

function getEdgeColorFromImageData(original: ImageData): { r: number; g: number; b: number } {
  const w = original.width
  const h = original.height
  const data = original.data
  
  let sumR = 0, sumG = 0, sumB = 0, count = 0
  const samplePixel = (x: number, y: number) => {
    const idx = (y * w + x) * 4
    sumR += data[idx]
    sumG += data[idx + 1]
    sumB += data[idx + 2]
    count++
  }
  
  const topRows = Math.max(5, Math.floor(h * 0.08))
  for (let y = 0; y < topRows; y++) {
    for (let x = 0; x < w; x += 4) {
      samplePixel(x, y)
    }
  }
  
  const sideCols = Math.max(5, Math.floor(w * 0.08))
  for (let y = topRows; y < h * 0.6; y += 4) {
    for (let x = 0; x < sideCols; x++) {
      samplePixel(x, y)
    }
    for (let x = w - sideCols; x < w; x++) {
      samplePixel(x, y)
    }
  }
  
  if (count === 0) return { r: 240, g: 240, b: 240 }
  return {
    r: Math.round(sumR / count),
    g: Math.round(sumG / count),
    b: Math.round(sumB / count),
  }
}

export function protectClothingInMask(original: ImageData, mask: ImageData): ImageData {
  const w = mask.width
  const h = mask.height
  const out = new Uint8ClampedArray(mask.data)
  const edgeBg = getEdgeColorFromImageData(original)
  
  for (let y = Math.floor(h * 0.45); y < h; y++) {
    for (let x = 0; x < w; x++) {
      const xRatio = x / w
      if (xRatio < 0.08 || xRatio > 0.92) continue
      
      const idx = (y * w + x) * 4
      if (out[idx + 3] >= 180) continue
      
      const r = original.data[idx]
      const g = original.data[idx + 1]
      const b = original.data[idx + 2]
      
      const dist = colorDistance({ r, g, b }, edgeBg)
      if (dist > 25) {
        out[idx] = r
        out[idx + 1] = g
        out[idx + 2] = b
        out[idx + 3] = 255
      }
    }
  }
  
  return createImageData(out, w, h)
}

/**
 * Flood-fill from all 4 image borders to find true exterior background.
 * Any transparent pixel that CANNOT be reached from the border through other
 * transparent pixels is an interior hole → force it to foreground (255 alpha
 * with original RGB).  This guarantees zero "donut holes" inside the person.
 */
export function floodFillInteriorHoles(original: ImageData, mask: ImageData): ImageData {
  const w = mask.width
  const h = mask.height
  const total = w * h
  const out = new Uint8ClampedArray(mask.data)

  // Build binary map: 1 = background-ish (alpha < threshold)
  const BG_THRESH = 64
  const isBg = new Uint8Array(total)
  for (let i = 0; i < total; i++) {
    isBg[i] = out[i * 4 + 3] < BG_THRESH ? 1 : 0
  }

  // Flood fill from all border pixels that are background
  const visited = new Uint8Array(total)
  const queue = new Int32Array(total)
  let head = 0, tail = 0

  const seed = (idx: number) => {
    if (isBg[idx] && !visited[idx]) {
      visited[idx] = 1
      queue[tail++] = idx
    }
  }

  // Seed all border pixels
  for (let x = 0; x < w; x++) {
    seed(x)                    // top row
    seed((h - 1) * w + x)     // bottom row
  }
  for (let y = 1; y < h - 1; y++) {
    seed(y * w)                // left col
    seed(y * w + (w - 1))     // right col
  }

  // BFS — 8-connected
  while (head < tail) {
    const idx = queue[head++]
    const x = idx % w
    const y = (idx / w) | 0
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const ni = ny * w + nx
        if (!visited[ni] && isBg[ni]) {
          visited[ni] = 1
          queue[tail++] = ni
        }
      }
    }
  }

  // Any background pixel NOT reached = interior hole → fill with original
  let filled = 0
  for (let i = 0; i < total; i++) {
    if (isBg[i] && !visited[i]) {
      const p = i * 4
      out[p] = original.data[p]
      out[p + 1] = original.data[p + 1]
      out[p + 2] = original.data[p + 2]
      out[p + 3] = 255
      filled++
    }
  }

  return createImageData(out, w, h)
}

/**
 * Edge-aware alpha refinement.  For each pixel with intermediate alpha,
 * look at a small window in the ORIGINAL image.  Find neighbours with
 * similar colour and average their mask alphas.  Result: the mask smooths
 * out in uniform regions (inside solid hair) but stays sharp at real colour
 * edges (hair against wall).
 *
 * This is a simplified guided-filter approach that produces the smooth,
 * natural alpha transitions that phone cutouts have.
 */
export function edgeAwareAlphaRefine(original: ImageData, mask: ImageData): ImageData {
  const w = mask.width
  const h = mask.height
  const out = new Uint8ClampedArray(mask.data)
  const orig = original.data
  const RADIUS = 2                // 5×5 window
  const COLOR_SIM_THRESH = 35     // max RGB distance to count as "similar colour"
  const ALPHA_LOW = 24            // only refine pixels with alpha in this range
  const ALPHA_HIGH = 220

  for (let y = RADIUS; y < h - RADIUS; y++) {
    for (let x = RADIUS; x < w - RADIUS; x++) {
      const idx = y * w + x
      const p = idx * 4
      const sa = out[p + 3]
      if (sa < ALPHA_LOW || sa >= ALPHA_HIGH) continue

      // Centre pixel colour in original
      const cr = orig[p], cg = orig[p + 1], cb = orig[p + 2]

      // Gather alpha values from colour-similar neighbours
      let alphaSum = 0, count = 0
      for (let dy = -RADIUS; dy <= RADIUS; dy++) {
        for (let dx = -RADIUS; dx <= RADIUS; dx++) {
          const ni = (y + dy) * w + (x + dx)
          const np = ni * 4
          const dr = Math.abs(orig[np] - cr)
          const dg = Math.abs(orig[np + 1] - cg)
          const db = Math.abs(orig[np + 2] - cb)
          const dist = dr + dg + db  // L1 distance, fast
          if (dist <= COLOR_SIM_THRESH) {
            alphaSum += out[np + 3]
            count++
          }
        }
      }

      if (count < 3) continue   // not enough similar-colour neighbours

      const avgAlpha = alphaSum / count
      // Bias toward the higher alpha (foreground-friendly)
      const refined = Math.round(Math.max(sa, avgAlpha * 0.85 + sa * 0.15))
      out[p + 3] = Math.min(255, refined) as number
      // If we boosted significantly, also restore original RGB
      if (refined > sa + 20) {
        out[p] = orig[p]
        out[p + 1] = orig[p + 1]
        out[p + 2] = orig[p + 2]
      }
    }
  }

  return createImageData(out, w, h)
}

/**
 * Recover hair pixels the AI model missed.  Many Indian school hairstyles
 * (black/dark-brown hair on grey/white wall) cause the model to confuse
 * dark hair strands with shadows.  This function:
 * 1. Builds a confirmed-background colour model from BOTH edge pixels AND
 *    confirmed-background pixels in the mask (alpha < 20).
 * 2. Runs 3 iterative passes in the head zone.  Each pass recovers dark
 *    pixels adjacent to existing foreground.  Recovered pixels then become
 *    "foreground neighbours" for the next pass, allowing the recovery to
 *    propagate along long braids, ponytails, and venis.
 */
export function recoverHairByColor(original: ImageData, mask: ImageData): ImageData {
  const w = mask.width
  const h = mask.height
  const out = new Uint8ClampedArray(mask.data)
  const orig = original.data

  // --- Build a confirmed-background colour model ---
  // Sample 1: edge pixels (always background in a portrait)
  const edgeBg = getEdgeColorFromImageData(original)

  // Sample 2: confirmed bg pixels from the mask (alpha < 20) within edge region
  let bgR = 0, bgG = 0, bgB = 0, bgCount = 0
  const sampleBand = Math.max(8, Math.floor(Math.min(w, h) * 0.12))
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Only sample from the outer band (likely background)
      const isEdgeBand = x < sampleBand || x >= w - sampleBand ||
                         y < sampleBand || y >= h - sampleBand
      if (!isEdgeBand) continue
      const idx = (y * w + x) * 4
      if (out[idx + 3] >= 20) continue  // not confirmed background in mask
      bgR += orig[idx]
      bgG += orig[idx + 1]
      bgB += orig[idx + 2]
      bgCount++
    }
  }

  // Use confirmed-bg model if we have enough samples, otherwise fall back to edge
  const wallColor = bgCount > 50
    ? { r: Math.round(bgR / bgCount), g: Math.round(bgG / bgCount), b: Math.round(bgB / bgCount) }
    : edgeBg

  // --- Multi-pass iterative recovery ---
  const yEnd = Math.floor(h * 0.65)  // extended to 65% to catch longer hair
  const xStart = Math.floor(w * 0.04)
  const xEnd = Math.floor(w * 0.96)

  const DARK_THRESH = 110       // pixel brightness below this = "dark" (slightly raised)
  const BG_DIST_MIN = 35        // min colour distance from wall to be "not wall"
  const ALPHA_CUTOFF = 80       // only recover pixels with alpha below this
  const NEIGHBOR_MIN_ALPHA = 70 // lowered to allow chaining from recently recovered pixels
  const PASSES = 3              // 3 iterative passes for braid/ponytail propagation

  for (let pass = 0; pass < PASSES; pass++) {
    let recovered = 0
    for (let y = 0; y < yEnd; y++) {
      for (let x = xStart; x < xEnd; x++) {
        const idx = y * w + x
        const p = idx * 4
        if (out[p + 3] >= ALPHA_CUTOFF) continue   // already foreground

        const r = orig[p], g = orig[p + 1], b = orig[p + 2]
        const brightness = (r + g + b) / 3

        if (brightness > DARK_THRESH) continue

        const wallDist = colorDistance({ r, g, b }, wallColor)
        if (wallDist < BG_DIST_MIN) continue

        // Check if at least 1 neighbour (cardinal + diagonal) is foreground
        let hasFgNeighbor = false
        for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]] as const) {
          const nx = x + dx, ny = y + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          if (out[(ny * w + nx) * 4 + 3] >= NEIGHBOR_MIN_ALPHA) {
            hasFgNeighbor = true
            break
          }
        }
        if (!hasFgNeighbor) continue

        out[p] = r
        out[p + 1] = g
        out[p + 2] = b
        out[p + 3] = 255
        recovered++
      }
    }
    if (recovered === 0) break  // no more pixels to recover, stop early
  }

  return createImageData(out, w, h)
}

/** Full mask prep pipeline for phone-quality cutouts:
 *  1. Iterative hole fill (4 passes)
 *  2. Alpha gap closing (×2 for 2px coverage)
 *  3. Clothing protection (white-shirt-safe)
 *  4. Portrait envelope rescue (shoulder/torso fill)
 *  5. Hair colour recovery (dark hair on light wall)
 *  6. Connected-component interior fill (zero donut holes)
 *  7. Edge-aware alpha refinement (smooth transitions)
 *  8. Original RGB alignment
 */
export function enhanceForegroundMask(original: ImageData, mask: ImageData): ImageData {
  const repaired = repairForegroundMaskHoles(original, mask, DEFAULT_MASK_ENHANCE)
  const closed1 = closeMaskAlphaGaps(original, repaired)
  const closed2 = closeMaskAlphaGaps(original, closed1)   // 2nd pass: fill wider hair gaps
  const clothingProtected = protectClothingInMask(original, closed2)
  const rescued = rescuePortraitEnvelope(original, clothingProtected)
  const hairRecovered = recoverHairByColor(original, rescued)
  const interiorFilled = floodFillInteriorHoles(original, hairRecovered)
  const edgeRefined = edgeAwareAlphaRefine(original, interiorFilled)
  return alignMaskWithOriginalColors(original, edgeRefined)
}

export function isPersonZonePixel(x: number, y: number, w: number, h: number): boolean {
  return isHeadHairZonePixel(x, y, w, h) || isSubjectInteriorPixel(x, y, w, h)
}

export function isProtectedPortraitCorePixel(x: number, y: number, w: number, h: number): boolean {
  const xRatio = x / w
  const yRatio = y / h

  const faceAndNeckCore =
    xRatio > 0.22 &&
    xRatio < 0.78 &&
    yRatio > 0.10 &&
    yRatio < 0.58

  const shirtAndHandsCore =
    xRatio > 0.08 &&
    xRatio < 0.92 &&
    yRatio >= 0.42 &&
    yRatio < 0.99

  return faceAndNeckCore || shirtAndHandsCore
}

function countNonBackgroundNeighbors(
  data: Uint8ClampedArray,
  idx: number,
  w: number,
  h: number,
  target: { r: number; g: number; b: number },
  tolerance: number
): number {
  const x = idx % w
  const y = (idx / w) | 0
  let count = 0
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const ni = (ny * w + nx) * 4
      if (colorDistance({ r: data[ni], g: data[ni + 1], b: data[ni + 2] }, target) >= tolerance) {
        count++
      }
    }
  }
  return count
}

/** Restore hair/shirt patches that wrongly received the plain background colour. */
export function repairCompositedSubjectHoles(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  original: ImageData,
  targetHex: string
): void {
  const target = parseHexColor(targetHex)
  if (!target) return

  const imageData = ctx.getImageData(0, 0, w, h)
  const data = imageData.data
  const total = w * h
  const bgTolerance = 36

  for (let idx = 0; idx < total; idx++) {
    const x = idx % w
    const y = (idx / w) | 0
    if (!isPersonZonePixel(x, y, w, h)) continue

    const p = idx * 4
    const pixel = { r: data[p], g: data[p + 1], b: data[p + 2] }
    if (colorDistance(pixel, target) >= bgTolerance) continue
    if (countNonBackgroundNeighbors(data, idx, w, h, target, bgTolerance) < 4) continue

    data[p] = original.data[p]
    data[p + 1] = original.data[p + 1]
    data[p + 2] = original.data[p + 2]
    data[p + 3] = 255
  }

  ctx.putImageData(imageData, 0, 0)
}

/** Remove white/grey wall islands around hair while preserving the lower shirt area. */
export function removeUpperNeutralBackgroundIslands(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  targetHex: string,
  original: ImageData
): void {
  const target = parseHexColor(targetHex)
  if (!target) return

  const edgeBg = getEdgeColorFromImageData(original)
  const maxEdge = Math.max(edgeBg.r, edgeBg.g, edgeBg.b)
  const minEdge = Math.min(edgeBg.r, edgeBg.g, edgeBg.b)
  const isOriginalBgNeutral = maxEdge > 160 && maxEdge - minEdge < 55
  if (!isOriginalBgNeutral) return

  const imageData = ctx.getImageData(0, 0, w, h)
  const data = imageData.data
  const isNeutralWall = (r: number, g: number, b: number) => {
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    return max > 168 && max - min < 52
  }

  for (let y = 0; y < Math.floor(h * 0.64); y++) {
    const yRatio = y / h
    for (let x = 0; x < w; x++) {
      const xRatio = x / w
      if (isProtectedPortraitCorePixel(x, y, w, h)) continue

      const inLowerShirtSafeZone = yRatio > 0.48 && xRatio > 0.22 && xRatio < 0.78
      if (inLowerShirtSafeZone) continue

      const p = (y * w + x) * 4
      const r = data[p]
      const g = data[p + 1]
      const b = data[p + 2]
      if (!isNeutralWall(r, g, b)) continue

      const origR = original.data[p]
      const origG = original.data[p + 1]
      const origB = original.data[p + 2]
      const distToOrigBg = colorDistance({ r: origR, g: origG, b: origB }, edgeBg)
      if (distToOrigBg > 28) continue

      data[p] = target.r
      data[p + 1] = target.g
      data[p + 2] = target.b
      data[p + 3] = 255
    }
  }

  ctx.putImageData(imageData, 0, 0)
}

/** Force edge/side bands to the selected plain colour (never touches person core). */
export function enforcePlainBackgroundEdges(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  targetHex: string
): void {
  const target = parseHexColor(targetHex)
  if (!target) return

  const imageData = ctx.getImageData(0, 0, w, h)
  const data = imageData.data
  const topBand = Math.max(12, Math.floor(h * 0.14))
  const sideBand = Math.max(12, Math.floor(w * 0.11))
  const bottomBand = Math.max(8, Math.floor(h * 0.06))

  const paint = (idx: number) => {
    const x = idx % w
    const y = (idx / w) | 0
    if (isPersonZonePixel(x, y, w, h)) {
      const p = idx * 4
      const dist = colorDistance({ r: data[p], g: data[p + 1], b: data[p + 2] }, target)
      if (dist > 28) return
    }
    const p = idx * 4
    data[p] = target.r
    data[p + 1] = target.g
    data[p + 2] = target.b
    data[p + 3] = 255
  }

  for (let y = 0; y < topBand; y++) {
    for (let x = 0; x < w; x++) paint(y * w + x)
  }
  for (let y = h - bottomBand; y < h; y++) {
    for (let x = 0; x < w; x++) paint(y * w + x)
  }
  for (let y = topBand; y < h - bottomBand; y++) {
    for (let x = 0; x < sideBand; x++) paint(y * w + x)
    for (let x = w - sideBand; x < w; x++) paint(y * w + x)
  }

  ctx.putImageData(imageData, 0, 0)
}

export function compositeMaskImageDataOntoPlainColor(
  original: ImageData,
  mask: ImageData,
  bgColor: string
): ImageData {
  const target = parseHexColor(bgColor) || { r: 255, g: 255, b: 255 }
  const w = mask.width
  const h = mask.height
  const out = new Uint8ClampedArray(w * h * 4)
  const { r: tr, g: tg, b: tb } = target

  // --- Pass 1: Alpha composite (cutout sticker onto colour) ---
  for (let idx = 0; idx < w * h; idx++) {
    const p = idx * 4
    const x = idx % w
    const y = (idx / w) | 0
    const sa = mask.data[p + 3]

    if (sa < BG_ALPHA_CUTOFF) {
      out[p] = tr
      out[p + 1] = tg
      out[p + 2] = tb
      out[p + 3] = 255
      continue
    }

    const inPerson = isPersonZonePixel(x, y, w, h)
    // Lower thresholds: treat more pixels as fully opaque original.
    // Person zone: 56 (was 88) — aggressively preserve hair/face/shirt
    // Outer zone: 96 (was 124) — still preserve clear foreground
    const preserveThreshold = inPerson ? 56 : 96

    if (sa >= preserveThreshold) {
      out[p] = original.data[p]
      out[p + 1] = original.data[p + 1]
      out[p + 2] = original.data[p + 2]
      out[p + 3] = 255
      continue
    }

    // In person zone, strongly favour original photo (0.92 min alpha, was 0.85).
    // This prevents the cutout from looking "ghostly" around hair edges.
    const a = inPerson ? Math.max(sa / 255, 0.92) : sa / 255
    const fr = original.data[p]
    const fg = original.data[p + 1]
    const fb = original.data[p + 2]
    out[p] = Math.round(fr * a + tr * (1 - a))
    out[p + 1] = Math.round(fg * a + tg * (1 - a))
    out[p + 2] = Math.round(fb * a + tb * (1 - a))
    out[p + 3] = 255
  }

  // --- Pass 2: Edge feathering for smooth cutout transitions ---
  // At the boundary between person and background, apply a 1px soft blend
  // so edges look phone-quality instead of pixelated.
  const feathered = new Uint8ClampedArray(out)
  for (let idx = 0; idx < w * h; idx++) {
    const x = idx % w
    const y = (idx / w) | 0
    if (x === 0 || y === 0 || x >= w - 1 || y >= h - 1) continue

    const p = idx * 4
    const sa = mask.data[p + 3]
    // Only feather pixels at the edge (alpha between BG_ALPHA_CUTOFF and 96)
    if (sa < BG_ALPHA_CUTOFF || sa >= 96) continue

    // Count how many cardinal neighbours are pure background
    let bgNeighbors = 0
    let fgNeighbors = 0
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const na = mask.data[((y + dy) * w + (x + dx)) * 4 + 3]
      if (na < BG_ALPHA_CUTOFF) bgNeighbors++
      else if (na >= 96) fgNeighbors++
    }

    // Only feather boundary pixels (next to both bg and fg)
    if (bgNeighbors === 0 || fgNeighbors === 0) continue

    // Soft blend: average the composited colour with neighbours
    let rSum = 0, gSum = 0, bSum = 0, count = 0
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const np = ((y + dy) * w + (x + dx)) * 4
        rSum += out[np]
        gSum += out[np + 1]
        bSum += out[np + 2]
        count++
      }
    }
    feathered[p] = Math.round(rSum / count)
    feathered[p + 1] = Math.round(gSum / count)
    feathered[p + 2] = Math.round(bSum / count)
    feathered[p + 3] = 255
  }

  return createImageData(feathered, w, h)
}

export function scoreRawMaskQuality(original: ImageData, mask: ImageData): number {
  const w = mask.width
  const h = mask.height
  if (original.width !== w || original.height !== h) return 0

  const data = mask.data
  const total = w * h
  const exterior = markExteriorBackgroundMask(data, w, h, 80)
  let foreground = 0
  let personSamples = 0
  let personHoles = 0

  for (let idx = 0; idx < total; idx++) {
    const alpha = data[idx * 4 + 3]
    if (alpha >= 64) foreground++

    const x = idx % w
    const y = (idx / w) | 0
    if (!isPersonZonePixel(x, y, w, h)) continue
    personSamples++
    if (alpha < 64 && !exterior[idx]) personHoles++
  }

  const fgRatio = foreground / total
  const holeRatio = personSamples > 0 ? personHoles / personSamples : 1
  if (fgRatio < 0.06) return 0
  return Math.round(Math.min(100, fgRatio * 140 + (1 - holeRatio) * 60))
}

export type PlainBackgroundQuality = {
  edgeMatch: number
  subjectLeaks: number
  score: number
}

export function scorePlainBackgroundQuality(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  targetHex: string
): PlainBackgroundQuality {
  const target = parseHexColor(targetHex)
  const edgeMatch = measureEdgeBackgroundMatch(ctx, w, h, targetHex)
  if (!target) return { edgeMatch, subjectLeaks: 100, score: edgeMatch }

  const data = ctx.getImageData(0, 0, w, h).data
  let leaks = 0
  let samples = 0
  const bgTol = 34

  for (let idx = 0; idx < w * h; idx++) {
    const x = idx % w
    const y = (idx / w) | 0
    if (!isPersonZonePixel(x, y, w, h)) continue
    samples++
    const p = idx * 4
    if (colorDistance({ r: data[p], g: data[p + 1], b: data[p + 2] }, target) >= bgTol) continue
    if (countNonBackgroundNeighbors(data, idx, w, h, target, bgTol) >= 3) leaks++
  }

  const subjectLeaks = samples > 0 ? Math.round((leaks / samples) * 100) : 0
  const score = Math.round(edgeMatch * 0.55 + Math.max(0, 100 - subjectLeaks * 4) * 0.45)
  return { edgeMatch, subjectLeaks, score }
}

/**
 * Best-effort finish for every portrait: preserve hair/shirt/uniform,
 * then enforce a perfectly plain selected background colour.
 */
export function finalizePlainBackgroundFromMask(
  original: ImageData,
  mask: ImageData,
  bgColor: string
): ImageData {
  const enhanced = enhanceForegroundMask(original, mask)
  let composited = compositeMaskImageDataOntoPlainColor(original, enhanced, bgColor)

  if (typeof document === "undefined") return composited

  const canvas = document.createElement("canvas")
  canvas.width = composited.width
  canvas.height = composited.height
  const ctx = canvas.getContext("2d")
  if (!ctx) return composited

  ctx.putImageData(composited, 0, 0)
  repairCompositedSubjectHoles(ctx, composited.width, composited.height, original, bgColor)
  removeUpperNeutralBackgroundIslands(ctx, composited.width, composited.height, bgColor, original)
  cleanupBackgroundArtifacts(ctx, composited.width, composited.height, bgColor)
  enforcePlainBackgroundEdges(ctx, composited.width, composited.height, bgColor)

  let quality = scorePlainBackgroundQuality(ctx, composited.width, composited.height, bgColor)
  if (quality.edgeMatch < 72) {
    cleanupBackgroundArtifacts(ctx, composited.width, composited.height, bgColor)
    enforcePlainBackgroundEdges(ctx, composited.width, composited.height, bgColor)
    repairCompositedSubjectHoles(ctx, composited.width, composited.height, original, bgColor)
    removeUpperNeutralBackgroundIslands(ctx, composited.width, composited.height, bgColor, original)
    quality = scorePlainBackgroundQuality(ctx, composited.width, composited.height, bgColor)
  }

  return ctx.getImageData(0, 0, composited.width, composited.height)
}

export async function finalizePlainBackgroundFromMaskBlobs(
  originalBlob: Blob,
  maskBlob: Blob,
  bgColor: string,
  jpegQuality = 0.88
): Promise<string> {
  const [original, mask] = await Promise.all([
    loadBlobAsImageData(originalBlob),
    loadBlobAsImageData(maskBlob),
  ])
  if (original.width !== mask.width || original.height !== mask.height) {
    throw new Error("Mask size does not match photo")
  }

  const result = finalizePlainBackgroundFromMask(original, mask, bgColor)
  const canvas = document.createElement("canvas")
  canvas.width = result.width
  canvas.height = result.height
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas unavailable")
  ctx.putImageData(result, 0, 0)
  return canvas.toDataURL("image/jpeg", jpegQuality)
}

export async function scorePlainBackgroundFromMaskBlobs(
  originalBlob: Blob,
  maskBlob: Blob,
  bgColor: string
): Promise<PlainBackgroundQuality> {
  const [original, mask] = await Promise.all([
    loadBlobAsImageData(originalBlob),
    loadBlobAsImageData(maskBlob),
  ])
  const result = finalizePlainBackgroundFromMask(original, mask, bgColor)
  const canvas = document.createElement("canvas")
  canvas.width = result.width
  canvas.height = result.height
  const ctx = canvas.getContext("2d")
  if (!ctx) return { edgeMatch: 0, subjectLeaks: 100, score: 0 }
  ctx.putImageData(result, 0, 0)
  return scorePlainBackgroundQuality(ctx, result.width, result.height, bgColor)
}

/** Flood from edges: remove halos outside the subject without eating white/coloured shirts. */
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

  const isReplaceable = (idx: number, r: number, g: number, b: number) => {
    const x = idx % w
    const y = (idx / w) | 0
    return isBackgroundLikePixel(r, g, b, target, isSubjectInteriorPixel(x, y, w, h))
  }

  const isProtectedSubject = (idx: number, r: number, g: number, b: number) => {
    const x = idx % w
    const y = (idx / w) | 0
    if (isProtectedPortraitCorePixel(x, y, w, h)) return true

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
    if (isProtectedSubject(idx, r, g, b)) {
      visited[idx] = 1
      return
    }
    if (!isReplaceable(idx, r, g, b)) {
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
      if (isProtectedSubject(n, r, g, b)) {
        visited[n] = 1
        continue
      }
      if (!isReplaceable(n, r, g, b)) {
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
export const BG_REMOVAL_MODEL = "isnet" as const

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
