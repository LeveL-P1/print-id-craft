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
  return xRatio > 0.1 && xRatio < 0.9 && yRatio > 0.04 && yRatio < 0.58
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

  return { data: outData, width: w, height: h } as ImageData
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

/** Alpha below this is treated as background when compositing. */
export const BG_ALPHA_CUTOFF = 48

const DEFAULT_MASK_ENHANCE: MaskHoleRepairOptions = {
  iterations: 3,
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
  return { data: out, width: mask.width, height: mask.height } as ImageData
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

  return { data: out, width: w, height: h } as ImageData
}

/** Full mask prep: hole fill → alpha close → original RGB alignment. */
export function enhanceForegroundMask(original: ImageData, mask: ImageData): ImageData {
  const repaired = repairForegroundMaskHoles(original, mask, DEFAULT_MASK_ENHANCE)
  const closed = closeMaskAlphaGaps(original, repaired)
  return alignMaskWithOriginalColors(original, closed)
}

export function isPersonZonePixel(x: number, y: number, w: number, h: number): boolean {
  return isHeadHairZonePixel(x, y, w, h) || isSubjectInteriorPixel(x, y, w, h)
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
    const preserveThreshold = inPerson ? 88 : 124

    if (sa >= preserveThreshold) {
      out[p] = original.data[p]
      out[p + 1] = original.data[p + 1]
      out[p + 2] = original.data[p + 2]
      out[p + 3] = 255
      continue
    }

    const a = inPerson ? Math.max(sa / 255, 0.85) : sa / 255
    const fr = original.data[p]
    const fg = original.data[p + 1]
    const fb = original.data[p + 2]
    out[p] = Math.round(fr * a + tr * (1 - a))
    out[p + 1] = Math.round(fg * a + tg * (1 - a))
    out[p + 2] = Math.round(fb * a + tb * (1 - a))
    out[p + 3] = 255
  }

  return { data: out, width: w, height: h } as ImageData
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
  cleanupBackgroundArtifacts(ctx, composited.width, composited.height, bgColor)
  enforcePlainBackgroundEdges(ctx, composited.width, composited.height, bgColor)

  let quality = scorePlainBackgroundQuality(ctx, composited.width, composited.height, bgColor)
  if (quality.edgeMatch < 72) {
    cleanupBackgroundArtifacts(ctx, composited.width, composited.height, bgColor)
    enforcePlainBackgroundEdges(ctx, composited.width, composited.height, bgColor)
    repairCompositedSubjectHoles(ctx, composited.width, composited.height, original, bgColor)
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
      if (isProtectedSubject(r, g, b)) {
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
