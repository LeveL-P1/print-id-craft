"use client"
import { useState, useCallback, useEffect } from "react"
import { toast } from "sonner"
import { normalizeKey, resolveFieldValue, FIELD_GROUPS, formatDateValue } from "@/lib/field-resolver"
import { PrintDialog, type PrintConfig } from "./IDMakerDialogs"
import { generateDirectPdf } from "@/lib/pdf-layout"

type FieldMapping = {
  id: string
  fieldKey: string
  label: string
  type: "text" | "photo" | "flag"
  x: number
  y: number
  width: number
  height: number
  fontSize: number
  fontColor: string
  fontWeight: "normal" | "bold"
  fontFamily: string
  textAlign?: "left" | "center" | "right"
  // How long text is handled inside the box.
  //   "nowrap"    → single line at the user's chosen size, truncated with "…".
  //   "wrap"      → legacy auto-fit (shrink to one line, then wrap+shrink).
  //   "multiline" → wrap onto multiple lines AT THE USER'S CHOSEN size (no shrink).
  textWrap?: "nowrap" | "wrap" | "multiline"
  // Enhanced text formatting — must match JpgTemplateMapper.tsx's FieldMapping.
  fontStyle?: "normal" | "italic"
  textDecoration?: "none" | "underline" | "line-through"
  letterSpacing?: number
  lineHeight?: number
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize"
  dateFormat?: string
  // Photo styling (rounded corners + border) — kept optional so older
  // saved templates without these props still render correctly.
  photoBorderRadius?: number
  photoBorderWidth?: number
  photoBorderColor?: string
  locked?: boolean
}

// Editor reference image width (px). Field.fontSize is stored relative to this.
const BATCH_EDITOR_REFERENCE_WIDTH = 600

type StudentRenderData = {
  id: string
  serialNumber: string
  photoUrl: string
  className: string
  formData: Record<string, string>
}

type BatchGeneratorProps = {
  schoolId: string
  schoolName: string
  classes: { id: string; name: string; _count: { students: number } }[]
}

// normalizeKey, FIELD_GROUPS, resolveFieldValue imported from @/lib/field-resolver

// ─── Bounded LRU caches (scale-safe for 2000+ students) ───
// Template images (rarely change) — kept across runs.
// Student photos — bounded LRU to prevent unbounded memory growth.
const TEMPLATE_HINT = "/template" // URLs containing this are treated as long-lived
const PHOTO_CACHE_MAX = 80        // recent N student photos kept in memory
const DATA_URL_CACHE_MAX = 40     // recent N data URLs

const imageCache = new Map<string, HTMLImageElement>()
const dataUrlCache = new Map<string, string>()

function lruSet<T>(map: Map<string, T>, key: string, value: T, max: number) {
  if (map.has(key)) map.delete(key)
  map.set(key, value)
  // Evict oldest entries when above limit (preserve template entries)
  while (map.size > max) {
    const oldestKey = map.keys().next().value as string | undefined
    if (!oldestKey) break
    if (oldestKey.includes(TEMPLATE_HINT)) {
      // Move template to the end so it stays
      const v = map.get(oldestKey)!
      map.delete(oldestKey)
      map.set(oldestKey, v)
      // If only templates remain, abort
      if (Array.from(map.keys()).every(k => k.includes(TEMPLATE_HINT))) break
      continue
    }
    map.delete(oldestKey)
  }
}

async function getCachedImage(url: string): Promise<HTMLImageElement | null> {
  const cached = imageCache.get(url)
  if (cached) {
    // Move to end (most-recently-used)
    imageCache.delete(url)
    imageCache.set(url, cached)
    return cached
  }
  try {
    const img = new Image()
    img.crossOrigin = "anonymous"
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject()
      img.src = url
    })
    lruSet(imageCache, url, img, PHOTO_CACHE_MAX)
    return img
  } catch { return null }
}

/** Convert an image URL to a base64 data URL (needed for SVG embedding) */
async function imageToDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url
  const cached = dataUrlCache.get(url)
  if (cached) {
    dataUrlCache.delete(url)
    dataUrlCache.set(url, cached)
    return cached
  }
  const img = await getCachedImage(url)
  if (!img) return url
  const canvas = document.createElement("canvas")
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext("2d")
  if (!ctx) return url
  ctx.drawImage(img, 0, 0)
  const dataUrl = canvas.toDataURL("image/jpeg", 1.0)
  lruSet(dataUrlCache, url, dataUrl, DATA_URL_CACHE_MAX)
  return dataUrl
}

/** Release student-photo cache entries after a batch run to free memory */
function clearStudentImageCache() {
  for (const k of Array.from(imageCache.keys())) {
    if (!k.includes(TEMPLATE_HINT)) imageCache.delete(k)
  }
  for (const k of Array.from(dataUrlCache.keys())) {
    if (!k.includes(TEMPLATE_HINT)) dataUrlCache.delete(k)
  }
}

// ── Print resolution limits ──
const MIN_PRINT_W = 661   // 300 DPI minimum (56mm)
const PRINT_DPI = 300     // standard PVC print DPI

// Shared measurement canvas for text metrics (SVG renderer + fitTextToBoxCanvas).
// Avoids creating thousands of throwaway canvases during batch generation.
let _measureCanvas: HTMLCanvasElement | null = null
let _measureCtx: CanvasRenderingContext2D | null = null
function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (!_measureCtx) {
    _measureCanvas = document.createElement("canvas")
    _measureCtx = _measureCanvas.getContext("2d")
  }
  return _measureCtx
}

// Reusable canvas pool — avoids creating+GCing a new canvas per student.
// With CHUNK_SIZE=8, at most 8 canvases are in flight concurrently.
const _canvasPool: HTMLCanvasElement[] = []
function acquireCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = _canvasPool.pop() || document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  return { canvas, ctx }
}
function releaseCanvas(canvas: HTMLCanvasElement) {
  _canvasPool.push(canvas)
}

/**
 * Convert millimetres to pixels at the given DPI.
 * 1 inch = 25.4 mm.
 */
function mmToPx(mm: number, dpi: number = PRINT_DPI): number {
  return Math.round((mm * dpi) / 25.4)
}

/**
 * Rounded-rectangle path on canvas context. Mirrors JpgCardPreview's
 * pathRoundedRect so photo borders render identically in preview & print.
 */
function pathRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2))
  ctx.beginPath()
  if (radius <= 0) { ctx.rect(x, y, w, h); return }
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  ctx.lineTo(x + radius, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

/**
 * Word-wrap + auto-shrink text on canvas to fit a fixed box.
 * Tries single-line shrink first, then falls back to multi-line word-wrap
 * (with character-level break for words wider than the box) and shrinks
 * further until every line fits vertically. Mirrors JpgCardPreview's
 * fitTextToBox so on-screen preview and printed output stay identical.
 */
// Caller threads cardWidthMm through so we convert the user's
// typographic-pt fontSize into canvas pixels exactly. When omitted
// we fall back to legacy 600-px reference behaviour.
function fitTextToBoxCanvas(
  ctx: CanvasRenderingContext2D,
  text: string,
  boxW: number,
  boxH: number,
  fontFamily: string,
  fontWeight: string,
  canvasW: number = 0,
  userFontSizePt?: number,
  wrapMode: "nowrap" | "wrap" | "multiline" = "wrap",
  fontStyle: string = "normal",
  cardWidthMm: number = 85.6,
): { lines: string[]; fontSize: number; lineHeight: number } {
  const padding = 4
  const maxW = Math.max(1, boxW - padding * 2)
  const maxH = Math.max(1, boxH - padding * 2)
  const italicPrefix = fontStyle === "italic" ? "italic " : ""
  const fontPrefix = `${italicPrefix}${fontWeight === "bold" ? "bold " : ""}`
  const setFont = (s: number) => { ctx.font = `${fontPrefix}${s}px ${fontFamily}` }

  // Word-wrap helper used by both nowrap (for ellipsis fallback) and multiline.
  const wrap = (size: number): string[] => {
    setFont(size)
    const words = text.split(/\s+/).filter(Boolean)
    const lines: string[] = []
    let current = ""
    for (const w of words) {
      const tentative = current ? current + " " + w : w
      if (ctx.measureText(tentative).width <= maxW) {
        current = tentative
      } else {
        if (current) lines.push(current)
        if (ctx.measureText(w).width > maxW) {
          let chunk = ""
          for (const ch of w) {
            const t2 = chunk + ch
            if (ctx.measureText(t2).width <= maxW) chunk = t2
            else { if (chunk) lines.push(chunk); chunk = ch }
          }
          current = chunk
        } else {
          current = w
        }
      }
    }
    if (current) lines.push(current)
    return lines
  }

  // Resolve the user's chosen font size (in typographic points) into
  // canvas pixels using the card's mm width: px/pt = canvasW * 25.4 /
  // (cardWidthMm * 72). This means "size 10" in the picker really is
  // 10 pt on the printed card, matching Word/Photoshop expectations.
  const pxPerPt = canvasW > 0 && cardWidthMm > 0 ? (canvasW * 25.4) / (cardWidthMm * 72) : 0
  const userPx =
    userFontSizePt && userFontSizePt > 0 && pxPerPt > 0
      ? userFontSizePt * pxPerPt
      : boxH * 0.6

  // ── MULTILINE → keep the user's font size, wrap to as many lines as needed.
  if (wrapMode === "multiline") {
    const lines = wrap(userPx)
    return { lines, fontSize: userPx, lineHeight: userPx * 1.2 }
  }

  // ── NO WRAP → single line at user font size, truncate with "…".
  if (wrapMode === "nowrap") {
    setFont(userPx)
    if (ctx.measureText(text).width <= maxW) {
      return { lines: [text], fontSize: userPx, lineHeight: userPx * 1.15 }
    }
    const ellipsis = "…"
    let lo = 0, hi = text.length
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      const trial = text.slice(0, mid) + ellipsis
      if (ctx.measureText(trial).width <= maxW) lo = mid
      else hi = mid - 1
    }
    return { lines: [text.slice(0, lo) + ellipsis], fontSize: userPx, lineHeight: userPx * 1.15 }
  }

  const fontSize = userPx
  setFont(fontSize)
  const lines = ctx.measureText(text).width <= maxW ? [text] : wrap(fontSize)
  return { lines, fontSize, lineHeight: fontSize * 1.15 }
}

/**
 * Renders an ID card at the 56:88 mm card ratio, using the template's
 * full native resolution for maximum sharpness (minimum 300 DPI).
 *
 * The template is stretched to fill the canvas. Because field positions
 * are stored as percentages, they scale perfectly — no misalignment,
 * no cropping, and jsPDF never needs to resize the image.
 *
 * Output is PNG (lossless) for maximum PVC print quality.
 */
async function renderIdCard(
  templateImageUrl: string,
  fieldMappings: FieldMapping[],
  student: StudentRenderData,
  flagImageUrl?: string,
  cardWidthMm?: number,
  cardHeightMm?: number,
): Promise<string> {
  const templateImg = await getCachedImage(templateImageUrl)
  if (!templateImg) throw new Error("Failed to load template")

  // Canvas dimensions are derived from the user-entered card size in mm
  // at PRINT_DPI, so the rendered card has the EXACT aspect ratio that
  // jsPDF will place it into on the printed page. This eliminates the
  // squash/stretch that occurs when the template image's aspect ratio
  // differs from the card's mm aspect ratio.
  let printW: number
  let printH: number
  if (cardWidthMm && cardHeightMm && cardWidthMm > 0 && cardHeightMm > 0) {
    printW = Math.max(MIN_PRINT_W, mmToPx(cardWidthMm))
    // Maintain the user's mm aspect ratio exactly.
    printH = Math.round((printW * cardHeightMm) / cardWidthMm)
  } else {
    // Backward-compat: if card size not provided, use template image's
    // native resolution (legacy behaviour).
    printW = Math.max(MIN_PRINT_W, templateImg.naturalWidth)
    const templateAspect = templateImg.naturalHeight / templateImg.naturalWidth
    printH = Math.round(printW * templateAspect)
  }

  const { canvas, ctx } = acquireCanvas(printW, printH)

  // Draw template stretched to fill the card canvas.
  // The template IS the card design — stretching to 56:88 is intentional.
  ctx.drawImage(templateImg, 0, 0, printW, printH)

  // Draw all mapped fields
  for (const field of fieldMappings) {
    const fx = (field.x / 100) * printW
    const fy = (field.y / 100) * printH
    const fw = (field.width / 100) * printW
    const fh = (field.height / 100) * printH

    if (field.type === "photo") {
      // Scale saved editor-px values (border radius + width) to the
      // generated canvas so PDFs match the on-screen preview exactly.
      const radiusPx = ((field.photoBorderRadius || 0) / BATCH_EDITOR_REFERENCE_WIDTH) * printW
      const borderPx = ((field.photoBorderWidth || 0) / BATCH_EDITOR_REFERENCE_WIDTH) * printW
      if (student.photoUrl) {
        const photoImg = await getCachedImage(student.photoUrl)
        if (photoImg) {
          // Cover-fit: fill the entire box, crop overflow
          const photoAspect = photoImg.naturalWidth / photoImg.naturalHeight
          const boxAspect = fw / fh
          let dx: number, dy: number, dw: number, dh: number
          if (photoAspect > boxAspect) {
            dh = fh
            dw = fh * photoAspect
            dx = fx + (fw - dw) / 2
            dy = fy
          } else {
            dw = fw
            dh = fw / photoAspect
            dx = fx
            dy = fy + (fh - dh) / 2
          }
          ctx.save()
          pathRoundedRect(ctx, fx, fy, fw, fh, radiusPx)
          ctx.clip()
          ctx.drawImage(photoImg, 0, 0, photoImg.naturalWidth, photoImg.naturalHeight, dx, dy, dw, dh)
          ctx.restore()
        }
      }
      // Draw photo border on top (matches JpgCardPreview)
      if (borderPx > 0) {
        ctx.save()
        ctx.lineWidth = borderPx
        ctx.strokeStyle = field.photoBorderColor || "#000000"
        const inset = borderPx / 2
        pathRoundedRect(ctx, fx + inset, fy + inset, fw - borderPx, fh - borderPx, Math.max(0, radiusPx - inset))
        ctx.stroke()
        ctx.restore()
      }
    } else if (field.type === "flag") {
      if (flagImageUrl) {
        const flagImg = await getCachedImage(flagImageUrl)
        if (flagImg) {
          ctx.drawImage(flagImg, 0, 0, flagImg.naturalWidth, flagImg.naturalHeight, fx, fy, fw, fh)
        }
      }
    } else {
      const pId = field.fieldKey === "photoId" ? "photoid" : field.fieldKey
      const val = resolveFieldValue(student.formData, pId) || 
                  (field.fieldKey === "class" ? student.className : 
                   field.fieldKey === "serialNumber" ? student.serialNumber : "")
      
      // Apply dateFormat + textTransform before rendering (matches mapper preview).
      let value = String(val || "").trim()
      if (field.dateFormat && value) value = formatDateValue(value, field.dateFormat)
      const transform = field.textTransform || "none"
      if (transform === "uppercase") value = value.toUpperCase()
      else if (transform === "lowercase") value = value.toLowerCase()
      else if (transform === "capitalize") value = value.replace(/\b\w/g, c => c.toUpperCase())

      if (value) {
        const padding = 4
        const fontFamily = field.fontFamily || "Arial"
        const fontWeight = field.fontWeight || "normal"
        const fStyle = field.fontStyle || "normal"
        const { lines, fontSize, lineHeight: baseLineHeight } = fitTextToBoxCanvas(
          ctx, value, fw, fh, fontFamily, fontWeight,
          printW, field.fontSize, field.textWrap || "wrap", fStyle,
          cardWidthMm || 85.6,
        )
        // Honour the user's lineHeight multiplier if set (default 1.2 for multiline, ~1.15 otherwise).
        const userLH = field.lineHeight && field.lineHeight > 0 ? field.lineHeight : 0
        const lineHeight = userLH > 0 ? fontSize * userLH : baseLineHeight

        // Apply letterSpacing (scaled from editor px to canvas px).
        const lsEditorPx = field.letterSpacing || 0
        const lsCanvasPx = (lsEditorPx / BATCH_EDITOR_REFERENCE_WIDTH) * printW
        if (lsCanvasPx !== 0 && (ctx as any).letterSpacing !== undefined) {
          (ctx as any).letterSpacing = `${lsCanvasPx}px`
        }

        ctx.fillStyle = field.fontColor || "#000"
        const align = field.textAlign || "left"
        ctx.textAlign = align
        ctx.textBaseline = "middle"
        ctx.save()
        ctx.beginPath()
        ctx.rect(fx, fy, fw, fh)
        ctx.clip()
        const textX = align === "center" ? fx + fw / 2 : align === "right" ? fx + fw - padding : fx + padding
        const totalH = lines.length * lineHeight
        // Multi-line addresses must top-align so the first line is always visible
        // even when the address overflows the bottom of the box.
        const isMultiline = (field.textWrap || "wrap") === "multiline"
        const firstLineY = isMultiline
          ? fy + padding + lineHeight / 2
          : fy + (fh - totalH) / 2 + lineHeight / 2
        for (let i = 0; i < lines.length; i++) {
          const ly = firstLineY + i * lineHeight
          ctx.fillText(lines[i], textX, ly)
          // textDecoration: underline / line-through
          const decoration = field.textDecoration || "none"
          if (decoration !== "none") {
            const tw = ctx.measureText(lines[i]).width
            const lx = align === "center" ? textX - tw / 2 : align === "right" ? textX - tw : textX
            ctx.save()
            ctx.strokeStyle = field.fontColor || "#000"
            ctx.lineWidth = Math.max(1, fontSize * 0.05)
            ctx.beginPath()
            const yOff = decoration === "underline" ? fontSize * 0.35 : 0
            ctx.moveTo(lx, ly + yOff)
            ctx.lineTo(lx + tw, ly + yOff)
            ctx.stroke()
            ctx.restore()
          }
        }
        // Reset letterSpacing
        if (lsCanvasPx !== 0 && (ctx as any).letterSpacing !== undefined) {
          (ctx as any).letterSpacing = "0px"
        }
        ctx.restore()
      }
    }
  }

  // PNG lossless — maximum quality for PVC card printing
  const dataUrl = canvas.toDataURL("image/png")
  releaseCanvas(canvas)
  return dataUrl
}

/**
 * Render an ID card as SVG markup.
 * Text stays as vector <text> elements (editable in CorelDRAW).
 * Images are embedded as base64 for self-contained SVG files.
 */
async function renderIdCardSvg(
  templateImageUrl: string,
  fieldMappings: FieldMapping[],
  student: StudentRenderData,
  flagImageUrl?: string,
  cardWidthMm?: number,
  cardHeightMm?: number,
): Promise<string> {
  const templateImg = await getCachedImage(templateImageUrl)
  if (!templateImg) throw new Error("Failed to load template")

  // Honour user-entered card mm size for SVG canvas so the exported
  // vector matches the printed PDF aspect (no squash in CorelDRAW).
  let w: number
  let h: number
  if (cardWidthMm && cardHeightMm && cardWidthMm > 0 && cardHeightMm > 0) {
    w = mmToPx(cardWidthMm)
    h = mmToPx(cardHeightMm)
  } else {
    w = templateImg.naturalWidth
    h = templateImg.naturalHeight
  }

  // Convert template to data URL for embedding
  const templateDataUrl = await imageToDataUrl(templateImageUrl)

  const lines: string[] = []
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`)
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`)
  // Template background
  lines.push(`  <image href="${templateDataUrl}" x="0" y="0" width="${w}" height="${h}" />`)

  for (const field of fieldMappings) {
    const fx = (field.x / 100) * w
    const fy = (field.y / 100) * h
    const fw = (field.width / 100) * w
    const fh = (field.height / 100) * h

    if (field.type === "photo") {
      if (student.photoUrl) {
        const photoDataUrl = await imageToDataUrl(student.photoUrl)
        // clipPath for aspect-ratio crop
        const clipId = `clip-${field.id}`
        lines.push(`  <defs><clipPath id="${clipId}"><rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" /></clipPath></defs>`)
        lines.push(`  <image href="${photoDataUrl}" x="${fx}" y="${fy}" width="${fw}" height="${fh}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})" />`)
      }
    } else if (field.type === "flag") {
      if (flagImageUrl) {
        const flagDataUrl = await imageToDataUrl(flagImageUrl)
        lines.push(`  <image href="${flagDataUrl}" x="${fx}" y="${fy}" width="${fw}" height="${fh}" preserveAspectRatio="xMidYMid meet" />`)
      }
    } else {
      const pId = field.fieldKey === "photoId" ? "photoid" : field.fieldKey
      const val = resolveFieldValue(student.formData, pId) ||
                  (field.fieldKey === "class" ? student.className :
                   field.fieldKey === "serialNumber" ? student.serialNumber : "")
      const value = String(val || "").trim()
      if (value) {
        const wrapMode = ((field as any).textWrap || "wrap") as "nowrap" | "wrap" | "multiline"
        const textAnchor = field.textAlign === "center" ? "middle" : field.textAlign === "right" ? "end" : "start"
        const padding = 4
        const textX = field.textAlign === "center" ? fx + fw / 2 : field.textAlign === "right" ? fx + fw - padding : fx + padding
        const fontWeight = field.fontWeight || "normal"
        const fontFamily = field.fontFamily || "Arial"
        const fill = field.fontColor || "#000"
        const svgFontStyle = field.fontStyle === "italic" ? "italic" : "normal"
        const svgTextDecor = field.textDecoration && field.textDecoration !== "none" ? field.textDecoration : ""
        // SVG renderer uses the same pt-based formula as the raster
        // renderer + editor so vector exports match preview pixel-for-pixel.
        const svgPxPerPt = w > 0 && (cardWidthMm || 85.6) > 0
          ? (w * 25.4) / ((cardWidthMm || 85.6) * 72)
          : 0
        const userPx =
          field.fontSize && field.fontSize > 0 && svgPxPerPt > 0
            ? field.fontSize * svgPxPerPt
            : fh * 0.6

        const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

        // ── MULTILINE → keep user font size, wrap onto <tspan> rows.
        if (wrapMode === "multiline") {
          const maxWidth = Math.max(1, fw - padding * 2)
          const mctx = getMeasureCtx()
          const fontPrefix = fontWeight === "bold" ? "bold " : ""
          const wrappedLines: string[] = []
          if (mctx) {
            mctx.font = `${fontPrefix}${userPx}px ${fontFamily}`
            const words = value.split(/\s+/).filter(Boolean)
            let current = ""
            for (const wd of words) {
              const tentative = current ? current + " " + wd : wd
              if (mctx.measureText(tentative).width <= maxWidth) current = tentative
              else { if (current) wrappedLines.push(current); current = wd }
            }
            if (current) wrappedLines.push(current)
          } else {
            wrappedLines.push(value)
          }
          const lineHeight = userPx * 1.2
          // Top-align so first line is visible even if it overflows.
          const firstLineY = fy + padding + userPx
          const tspans = wrappedLines
            .map((ln, i) => `<tspan x="${textX.toFixed(1)}" y="${(firstLineY + i * lineHeight).toFixed(1)}">${escape(ln)}</tspan>`)
            .join("")
          const decorAttr = svgTextDecor ? ` text-decoration="${svgTextDecor}"` : ""
          lines.push(`  <text font-family="${fontFamily}" font-size="${userPx.toFixed(1)}" fill="${fill}" font-weight="${fontWeight}" font-style="${svgFontStyle}"${decorAttr} text-anchor="${textAnchor}">${tspans}</text>`)
        } else {
          // wrap or nowrap: start from the user's chosen font size.
          let fontSize = Math.round(userPx)
          const textY = fy + fh / 2
          if (wrapMode === "wrap") {
            const maxWidth = Math.max(1, fw - padding * 2)
            const mctx = getMeasureCtx()
            if (mctx) {
              const fontPrefix = fontWeight === "bold" ? "bold " : ""
              mctx.font = `${fontPrefix}${fontSize}px ${fontFamily}`
              if (mctx.measureText(value).width > maxWidth) {
                const words = value.split(/\s+/).filter(Boolean)
                const wrappedLines: string[] = []
                let current = ""
                for (const wd of words) {
                  const tentative = current ? current + " " + wd : wd
                  if (mctx.measureText(tentative).width <= maxWidth) current = tentative
                  else { if (current) wrappedLines.push(current); current = wd }
                }
                if (current) wrappedLines.push(current)
                const lineHeight = fontSize * 1.15
                const firstLineY = fy + padding + fontSize
                const tspans = wrappedLines
                  .map((ln, i) => `<tspan x="${textX.toFixed(1)}" y="${(firstLineY + i * lineHeight).toFixed(1)}">${escape(ln)}</tspan>`)
                  .join("")
                const decorAttr2 = svgTextDecor ? ` text-decoration="${svgTextDecor}"` : ""
                lines.push(`  <text font-family="${fontFamily}" font-size="${fontSize}" fill="${fill}" font-weight="${fontWeight}" font-style="${svgFontStyle}"${decorAttr2} text-anchor="${textAnchor}">${tspans}</text>`)
                continue
              }
            }
          } else if (wrapMode === "nowrap") {
            fontSize = Math.round(userPx)
          }
          const decorAttr2 = svgTextDecor ? ` text-decoration="${svgTextDecor}"` : ""
          lines.push(`  <text x="${textX.toFixed(1)}" y="${textY.toFixed(1)}" font-family="${fontFamily}" font-size="${fontSize}" fill="${fill}" font-weight="${fontWeight}" font-style="${svgFontStyle}"${decorAttr2} text-anchor="${textAnchor}" dominant-baseline="central">${escape(value)}</text>`)
        }
      }
    }
  }

  lines.push(`</svg>`)
  return lines.join("\n")
}

/**
 * VBScript that uses CorelDRAW COM automation to batch-convert
 * all SVG files in the same folder to .cdr format.
 * The user double-clicks this .vbs file on their Windows PC
 * (CorelDRAW must be installed).
 */
function generateCdrConverterScript(): string {
  return `' ===================================================================
' Convert SVG to CDR - CorelDRAW Batch Converter
' ===================================================================
' HOW TO USE:
'   1. Extract the ZIP file to a folder
'   2. Double-click this file (convert_to_cdr.vbs)
'   3. CorelDRAW will open and convert all SVG files to .cdr
'   4. CDR files will be saved in the same folder
' ===================================================================
' REQUIREMENT: CorelDRAW must be installed on this computer
' ===================================================================

Option Explicit

Dim fso, folder, file, corelApp, doc, svgFolder, cdrPath, count, totalFiles

Set fso = CreateObject("Scripting.FileSystemObject")
svgFolder = fso.GetParentFolderName(WScript.ScriptFullName)

' Count SVG files first
totalFiles = 0
Set folder = fso.GetFolder(svgFolder)
For Each file In folder.Files
    If LCase(fso.GetExtensionName(file.Name)) = "svg" Then
        totalFiles = totalFiles + 1
    End If
Next

If totalFiles = 0 Then
    MsgBox "No SVG files found in this folder." & vbCrLf & vbCrLf & "Make sure the SVG files are in the same folder as this script.", vbExclamation, "No Files Found"
    WScript.Quit
End If

Dim result
result = MsgBox("Found " & totalFiles & " SVG file(s) to convert." & vbCrLf & vbCrLf & "CorelDRAW will open and convert each file to CDR format." & vbCrLf & "This may take a few minutes." & vbCrLf & vbCrLf & "Continue?", vbYesNo + vbQuestion, "SVG to CDR Converter")
If result <> vbYes Then WScript.Quit

' Start CorelDRAW
On Error Resume Next
Set corelApp = CreateObject("CorelDRAW.Application")
If Err.Number <> 0 Then
    Err.Clear
    ' Try different versions
    Set corelApp = CreateObject("CorelDRAW.Application.24")
    If Err.Number <> 0 Then
        Err.Clear
        Set corelApp = CreateObject("CorelDRAW.Application.23")
        If Err.Number <> 0 Then
            MsgBox "CorelDRAW is not installed or could not be started." & vbCrLf & vbCrLf & "Please install CorelDRAW and try again.", vbCritical, "CorelDRAW Not Found"
            WScript.Quit
        End If
    End If
End If
On Error GoTo 0

corelApp.Visible = True
count = 0

Set folder = fso.GetFolder(svgFolder)
For Each file In folder.Files
    If LCase(fso.GetExtensionName(file.Name)) = "svg" Then
        On Error Resume Next
        Set doc = corelApp.OpenDocument(file.Path)
        If Err.Number = 0 And Not doc Is Nothing Then
            cdrPath = fso.BuildPath(svgFolder, fso.GetBaseName(file.Name) & ".cdr")
            doc.SaveAs cdrPath
            doc.Close
            count = count + 1
        Else
            Err.Clear
        End If
        On Error GoTo 0
    End If
Next

MsgBox count & " of " & totalFiles & " SVG files converted to CDR successfully!" & vbCrLf & vbCrLf & "CDR files saved in:" & vbCrLf & svgFolder, vbInformation, "Conversion Complete"
`
}

async function downloadAsZip(
  cards: { name: string; dataUrl: string }[],
  zipName: string
) {
  const { default: JSZip } = await import("jszip")
  const zip = new JSZip()
  for (const card of cards) {
    const base64 = card.dataUrl.split(",")[1]
    if (base64) {
      zip.file(card.name, base64, { base64: true })
    }
  }
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 1 } })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = zipName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

/** Download SVG files + VBScript converter as a ZIP for CDR conversion */
async function downloadAsCdrZip(
  svgCards: { name: string; svgContent: string }[],
  zipName: string
) {
  const { default: JSZip } = await import("jszip")
  const zip = new JSZip()
  for (const card of svgCards) {
    zip.file(card.name, card.svgContent)
  }
  // Include the CorelDRAW converter script
  zip.file("convert_to_cdr.vbs", generateCdrConverterScript())
  // Include a README
  zip.file("README.txt", [
    "ID Cards - SVG to CDR Conversion",
    "================================",
    "",
    "This ZIP contains SVG files of ID cards with vector text.",
    "",
    "To convert to CDR (CorelDRAW) format:",
    "  1. Extract all files to a folder",
    "  2. Double-click 'convert_to_cdr.vbs'",
    "  3. CorelDRAW will auto-convert all SVGs to .cdr files",
    "",
    "Requirements: CorelDRAW must be installed on this PC.",
    "",
    "You can also open the SVG files directly in CorelDRAW",
    "by using File > Import or dragging them into CorelDRAW.",
  ].join("\r\n"))
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 1 } })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = zipName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

type OutputFormat = "JPEG" | "CDR" | "PDF_PRINT" | "BMP"

/**
 * Encode raw RGBA pixel data (top-down, 4 bytes/pixel) to a 24-bit BMP ArrayBuffer.
 * The BMP file format stores rows bottom-up in BGR order with each row padded to
 * a 4-byte boundary.
 */
function encodeRgbaToBmpBuffer(pixels: Uint8ClampedArray, w: number, h: number): ArrayBuffer {
  // Row size must be multiple of 4 bytes (24bpp = 3 bytes/pixel)
  const rowSize = Math.ceil((w * 3) / 4) * 4
  const pixelDataSize = rowSize * h
  const fileSize = 54 + pixelDataSize // BMP header (14) + DIB header (40) + pixel data

  const buffer = new ArrayBuffer(fileSize)
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)

  // BMP file header
  view.setUint8(0, 0x42) // 'B'
  view.setUint8(1, 0x4D) // 'M'
  view.setUint32(2, fileSize, true)
  view.setUint32(6, 0, true)
  view.setUint32(10, 54, true)

  // DIB header (BITMAPINFOHEADER)
  view.setUint32(14, 40, true)
  view.setInt32(18, w, true)
  view.setInt32(22, h, true)            // positive height → bottom-up
  view.setUint16(26, 1, true)
  view.setUint16(28, 24, true)
  view.setUint32(30, 0, true)
  view.setUint32(34, pixelDataSize, true)
  view.setInt32(38, 11811, true)        // X pixels/meter ≈ 300 DPI
  view.setInt32(42, 11811, true)        // Y pixels/meter ≈ 300 DPI
  view.setUint32(46, 0, true)
  view.setUint32(50, 0, true)

  // Pixel data — bottom-up rows, BGR order
  const rowPad = rowSize - w * 3
  let offset = 54
  for (let row = h - 1; row >= 0; row--) {
    let i = row * w * 4
    for (let col = 0; col < w; col++) {
      bytes[offset++] = pixels[i + 2] // B
      bytes[offset++] = pixels[i + 1] // G
      bytes[offset++] = pixels[i + 0] // R
      i += 4
    }
    for (let p = 0; p < rowPad; p++) bytes[offset++] = 0
  }

  return buffer
}

/** Encode an HTMLCanvasElement to a 24-bit BMP ArrayBuffer. */
function canvasToBmpBuffer(canvas: HTMLCanvasElement): ArrayBuffer {
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas 2D context unavailable")
  const w = canvas.width
  const h = canvas.height
  const imageData = ctx.getImageData(0, 0, w, h)
  return encodeRgbaToBmpBuffer(imageData.data, w, h)
}

// 300 DPI ≈ 11.811 pixels per millimetre — matches the resolution at which
// individual card canvases are rendered, so cards are placed pixel-for-pixel
// without resampling loss.
const BMP_PX_PER_MM = 300 / 25.4

type BmpPageLayout = {
  paperWidth: number
  paperHeight: number
  cardWidth: number
  cardHeight: number
  h1stPosition: number
  v1stPosition: number
  hPitch: number
  vPitch: number
}

type BmpPageFile = { name: string; buffer: ArrayBuffer }

/**
 * Compose multi-card BMP pages from rendered card data URLs.
 * Uses the same grid math as `generateDirectPdf` so PDF and BMP outputs are
 * visually identical (paper size, gaps, mirrored back columns).
 */
async function buildBmpPagesFromCards(
  cards: { serialNumber: string; frontDataUrl: string; backDataUrl?: string }[],
  layout: BmpPageLayout,
  schoolName: string,
  onProgress?: (done: number, total: number, status: string) => void,
): Promise<BmpPageFile[]> {
  const { paperWidth, paperHeight, cardWidth, cardHeight,
    h1stPosition, v1stPosition, hPitch, vPitch } = layout

  // Pixel canvas size (300 DPI)
  const pageWpx = Math.max(1, Math.round(paperWidth * BMP_PX_PER_MM))
  const pageHpx = Math.max(1, Math.round(paperHeight * BMP_PX_PER_MM))
  const cardWpx = Math.max(1, Math.round(cardWidth * BMP_PX_PER_MM))
  const cardHpx = Math.max(1, Math.round(cardHeight * BMP_PX_PER_MM))

  // Layout math (mirrors generateDirectPdf)
  const hasCustomX = h1stPosition > 0
  const hasCustomY = v1stPosition > 0
  const availW = hasCustomX ? paperWidth - h1stPosition : paperWidth
  const availH = hasCustomY ? paperHeight - v1stPosition : paperHeight
  const cols = Math.max(1, Math.floor((availW + (hPitch - cardWidth)) / hPitch))
  const rows = Math.max(1, Math.floor((availH + (vPitch - cardHeight)) / vPitch))
  const cardsPerPage = cols * rows
  const totalPages = Math.ceil(cards.length / cardsPerPage)
  const usedW = cols * hPitch - (hPitch - cardWidth)
  const usedH = rows * vPitch - (vPitch - cardHeight)
  const startXmm = hasCustomX ? h1stPosition : (paperWidth - usedW) / 2
  const startYmm = hasCustomY ? v1stPosition : (paperHeight - usedH) / 2

  const hasBackSide = cards.some(c => !!c.backDataUrl)
  const safeSchool = schoolName.replace(/[^a-zA-Z0-9]/g, "_")
  const out: BmpPageFile[] = []

  // Reusable page canvas — one big allocation reused across pages saves memory.
  const pageCanvas = document.createElement("canvas")
  pageCanvas.width = pageWpx
  pageCanvas.height = pageHpx
  const pageCtx = pageCanvas.getContext("2d")
  if (!pageCtx) throw new Error("Page canvas 2D context unavailable")
  pageCtx.imageSmoothingEnabled = false

  const drawPage = async (pageIdx: number, side: "front" | "back") => {
    pageCtx.fillStyle = "#ffffff"
    pageCtx.fillRect(0, 0, pageWpx, pageHpx)

    for (let slot = 0; slot < cardsPerPage; slot++) {
      const cardIdx = pageIdx * cardsPerPage + slot
      if (cardIdx >= cards.length) break
      const card = cards[cardIdx]
      const url = side === "front" ? card.frontDataUrl : card.backDataUrl
      if (!url) continue
      const row = Math.floor(slot / cols)
      const col = slot % cols
      // Mirror columns for back side so duplex print aligns
      const placeCol = side === "back" ? (cols - 1) - col : col
      const xMm = startXmm + placeCol * hPitch
      const yMm = startYmm + row * vPitch
      const xPx = Math.round(xMm * BMP_PX_PER_MM)
      const yPx = Math.round(yMm * BMP_PX_PER_MM)
      try {
        const img = await getCachedImage(url)
        if (img) {
          pageCtx.imageSmoothingEnabled = false
          pageCtx.drawImage(img, xPx, yPx, cardWpx, cardHpx)
        }
      } catch (err) {
        console.error(`[BMP page ${pageIdx + 1}] failed card ${card.serialNumber}`, err)
      }
    }
  }

  const totalUnits = totalPages * (hasBackSide ? 2 : 1)
  let unit = 0

  for (let p = 0; p < totalPages; p++) {
    onProgress?.(unit, totalUnits, `Composing page ${p + 1}/${totalPages} (front)...`)
    await drawPage(p, "front")
    const frontBuf = canvasToBmpBuffer(pageCanvas)
    out.push({ name: `${safeSchool}_Front_Page${p + 1}.bmp`, buffer: frontBuf })
    unit++
    onProgress?.(unit, totalUnits, `Page ${p + 1}/${totalPages} front encoded`)
    // Yield to UI between pages
    await new Promise(r => setTimeout(r, 0))
  }
  if (hasBackSide) {
    for (let p = 0; p < totalPages; p++) {
      onProgress?.(unit, totalUnits, `Composing page ${p + 1}/${totalPages} (back)...`)
      await drawPage(p, "back")
      const backBuf = canvasToBmpBuffer(pageCanvas)
      out.push({ name: `${safeSchool}_Back_Page${p + 1}.bmp`, buffer: backBuf })
      unit++
      onProgress?.(unit, totalUnits, `Page ${p + 1}/${totalPages} back encoded`)
      await new Promise(r => setTimeout(r, 0))
    }
  }

  return out
}

/**
 * Save composed BMP pages to a user-chosen folder (File System Access API) or
 * fall back to a ZIP download on browsers without that support.
 */
async function saveBmpPagesToFolder(
  pages: BmpPageFile[],
  onProgress: (current: number, total: number) => void,
): Promise<void> {
  let done = 0
  const total = pages.length

  if ((window as any).showDirectoryPicker) {
    let dirHandle: FileSystemDirectoryHandle
    try {
      dirHandle = await (window as any).showDirectoryPicker()
    } catch {
      return // user cancelled
    }
    for (const page of pages) {
      const fileHandle = await dirHandle.getFileHandle(page.name, { create: true })
      const writable = await (fileHandle as any).createWritable()
      await writable.write(page.buffer)
      await writable.close()
      done++
      onProgress(done, total)
    }
  } else {
    const { default: JSZip } = await import("jszip")
    const zip = new JSZip()
    for (const page of pages) {
      zip.file(page.name, page.buffer)
      done++
      onProgress(done, total)
    }
    const blob = await zip.generateAsync({ type: "blob" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = "IDCards-BMP-Pages.zip"
    a.click()
    URL.revokeObjectURL(a.href)
  }
}

export default function BatchGenerator({ schoolId, schoolName, classes }: BatchGeneratorProps) {
  const [selectedClassId, setSelectedClassId] = useState("")
  const [statusFilter, setStatusFilter] = useState("APPROVED")
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("JPEG")
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, status: "" })
  const [previewCards, setPreviewCards] = useState<{ serialNumber: string; frontDataUrl: string; backDataUrl?: string }[]>([])
  const [pdfPrintCards, setPdfPrintCards] = useState<{ serialNumber: string; frontDataUrl: string; backDataUrl?: string }[]>([])
  const [lastCardDims, setLastCardDims] = useState({ w: 85.6, h: 54 })
  // Preview-first download flow: after rendering, hold a closure that performs
  // the actual file write. User must click "Download" to commit. This lets them
  // verify the layout (page size, card size, grid) matches their cutter setup
  // BEFORE any file is written.
  type PendingSave = {
    format: OutputFormat
    cardCount: number
    pageW: number
    pageH: number
    cardW: number
    cardH: number
    h1stPosition: number
    v1stPosition: number
    hPitch: number
    vPitch: number
    cols?: number
    rows?: number
    totalPages?: number
    // For PDF: keep raw rendered cards + studentIds so we can re-stage when user edits layout
    pdfCards?: { serialNumber: string; frontDataUrl: string; backDataUrl?: string }[]
    pdfStudentIds?: string[]
    save: () => Promise<void>
  }
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null)
  const [downloading, setDownloading] = useState(false)
  // Template's configured card size (single source of truth). Loaded on mount
  // so Print Setup, render canvas, and PDF placement all agree.
  const [templateCardDims, setTemplateCardDims] = useState<{ w: number; h: number } | null>(null)
  const [showPrintDialog, setShowPrintDialog] = useState(false)
  const [printConfig, setPrintConfig] = useState<PrintConfig>({
    paper: "A4 Horizontal", paperWidth: 297, paperHeight: 210,
    h1stPosition: 0, h2ndPosition: 0, v1stPosition: 0, v2ndPosition: 0,
  })

  // Track whether printConfig was loaded from DB (to show "saved" badge)
  const [printConfigSaved, setPrintConfigSaved] = useState(false)

  // Fetch the template's configured card dimensions + saved printConfig once.
  // This ensures Print Setup, render canvas, and PDF placement all agree.
  useEffect(() => {
    let cancelled = false
    fetch(`/api/schools/${schoolId}/template`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data?.success || !data?.data) return
        const w = Number(data.data.cardWidthMm) || 85.6
        const h = Number(data.data.cardHeightMm) || 54
        setTemplateCardDims({ w, h })
        setLastCardDims({ w, h })

        // Restore saved Print Config from database if available
        const saved = data.data.printConfig as PrintConfig | null
        if (saved && saved.paperWidth > 0) {
          // Detect stale pitch values caused by card dimension change.
          // Compare the dimensions stored in the config against current card dims.
          const savedCW = saved.cardWidthMm ?? 0
          const savedCH = saved.cardHeightMm ?? 0
          const dimsChanged = Math.abs(savedCW - w) > 0.5 || Math.abs(savedCH - h) > 0.5 || savedCW === 0
          if (dimsChanged) {
            // Card dimensions changed (or were never recorded) — recalculate pitches
            // from the current card size, preserving any deliberate gap the user had.
            // When no prior gap was recorded fall back to the new defaults
            // (3 mm horizontal, 15 mm vertical) so freshly-resized cards still
            // get reasonable spacing on the print sheet.
            const oldGapH = savedCW > 0 ? Math.max(0, saved.h2ndPosition - savedCW) : 3
            const oldGapV = savedCH > 0 ? Math.max(0, saved.v2ndPosition - savedCH) : 15
            setPrintConfig({ ...saved, h2ndPosition: w + oldGapH, v2ndPosition: h + oldGapV, cardWidthMm: w, cardHeightMm: h })
          } else {
            setPrintConfig(saved)
          }
          setPrintConfigSaved(true)
        } else {
          // Seed Print Setup defaults from card dims if user hasn't customised.
          // Default inter-card gap: 3 mm horizontal, 15 mm vertical (Aaryans spec).
          setPrintConfig(prev =>
            prev.h2ndPosition > 0 || prev.v2ndPosition > 0
              ? prev
              : { ...prev, h2ndPosition: w + 3, v2ndPosition: h + 15, cardWidthMm: w, cardHeightMm: h }
          )
        }
      })
      .catch(() => { /* non-fatal: dialog will still work with manual entry */ })
    return () => { cancelled = true }
  }, [schoolId])

  // Save printConfig to template DB so it persists across sessions
  const savePrintConfig = async (cfg: PrintConfig) => {
    try {
      await fetch(`/api/schools/${schoolId}/template`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printConfig: { ...cfg, fontSizeUnit: "pt" } }),
      })
      setPrintConfigSaved(true)
    } catch { /* non-fatal */ }
  }

  const handleGenerate = useCallback(async () => {
    setGenerating(true)
    setProgress({ current: 0, total: 0, status: "Preparing data..." })
    setPreviewCards([])
    setPendingSave(null)

    try {
      const params = new URLSearchParams({ status: statusFilter })
      if (selectedClassId) params.set("classId", selectedClassId)

      const res = await fetch(`/api/schools/${schoolId}/generate?${params}`)
      const data = await res.json()

      if (!res.ok || !data.success) {
        toast.error(data.error || "Failed to fetch data")
        setGenerating(false)
        return
      }

      const { templateImageUrl, fieldMappings, backTemplateImageUrl, backFieldMappings, hasBackSide, students, totalCount, cardWidthMm, cardHeightMm } = data.data
      
      if (!templateImageUrl) {
        toast.error("No template image configured. Please upload a template first.")
        setGenerating(false)
        return
      }

      setProgress({ current: 0, total: totalCount, status: "Rendering front side..." })

      // Fetch flag images for this school (if any flag field exists in mappings)
      let flagImagesMap: Record<string, string> = {}
      const hasFlagField = fieldMappings.some((f: any) => f.type === "flag") ||
                           (backFieldMappings || []).some((f: any) => f.type === "flag")
      if (hasFlagField) {
        try {
          const flagRes = await fetch(`/api/schools/${schoolId}/flags`)
          const flagData = await flagRes.json()
          if (flagData.success) {
            for (const f of flagData.data.flags || []) {
              if (f.color && f.imageUrl) flagImagesMap[f.color] = f.imageUrl
            }
          }
        } catch {}
      }

      // Helper to resolve flag URL for a student
      const getFlagUrl = (student: any): string | undefined => {
        if (!hasFlagField) return undefined
        const fd = student.formData as Record<string, string>
        const color = fd?.flagColor || fd?.["Flag Color"] || fd?.["house"] || fd?.["House"] || fd?.["colour"] || fd?.["Colour"] || ""
        return color ? flagImagesMap[color] : undefined
      }

      // Pre-load template images
      await getCachedImage(templateImageUrl)
      if (hasBackSide && backTemplateImageUrl) {
        await getCachedImage(backTemplateImageUrl)
      }

      // ──── CDR (SVG) PATH ────
      // ──── PDF PRINT PATH ────
      if (outputFormat === "PDF_PRINT") {
        const allCards: typeof pdfPrintCards = []
        const CHUNK_SIZE = 8

        // Prefetch student photos in parallel before rendering (avoids serial
        // loads inside renderIdCard which block each chunk). Fire all fetches
        // concurrently — the LRU cache captures them for the render loop.
        const photoUrls = students.map((s: any) => s.photoUrl).filter(Boolean)
        await Promise.all(photoUrls.slice(0, 50).map((u: string) => getCachedImage(u).catch(() => null)))
        // Continue fetching rest in background while rendering starts
        if (photoUrls.length > 50) {
          Promise.all(photoUrls.slice(50).map((u: string) => getCachedImage(u).catch(() => null)))
        }

        for (let i = 0; i < students.length; i += CHUNK_SIZE) {
          const chunk = students.slice(i, i + CHUNK_SIZE)
          const promises = chunk.map(async (student: any) => {
            try {
              // Renders at fixed 661×1039 (300 DPI, 56×88mm) as JPEG
              const frontDataUrl = await renderIdCard(templateImageUrl, fieldMappings, student, getFlagUrl(student), cardWidthMm, cardHeightMm)
              let backDataUrl: string | undefined
              if (hasBackSide && backTemplateImageUrl && backFieldMappings?.length > 0) {
                backDataUrl = await renderIdCard(backTemplateImageUrl, backFieldMappings, student, getFlagUrl(student), cardWidthMm, cardHeightMm)
              }
              return { serialNumber: student.serialNumber, frontDataUrl, backDataUrl }
            } catch (err) {
              console.error(`Error rendering ${student.serialNumber}`, err)
              return null
            }
          })

          const results = await Promise.all(promises)
          results.forEach(c => { if (c) allCards.push(c) })

          const currentProgress = Math.min(i + CHUNK_SIZE, totalCount)
          setProgress({ current: currentProgress, total: totalCount, status: `Rendered ${currentProgress}/${totalCount} cards (high quality)...` })
          await new Promise(r => setTimeout(r, 0))
        }

        setPreviewCards(allCards.slice(0, 8))
        setPdfPrintCards(allCards)

        // Compute the actual grid that generateDirectPdf will use, so the
        // preview panel shows EXACTLY what the cutter will see.
        const cw = cardWidthMm || 85.6
        const ch = cardHeightMm || 54
        setLastCardDims({ w: cw, h: ch })
        const hPitch = printConfig.h2ndPosition > 0 ? printConfig.h2ndPosition : cw
        const vPitch = printConfig.v2ndPosition > 0 ? printConfig.v2ndPosition : ch
        const availW = printConfig.h1stPosition > 0
          ? printConfig.paperWidth - printConfig.h1stPosition
          : printConfig.paperWidth
        const availH = printConfig.v1stPosition > 0
          ? printConfig.paperHeight - printConfig.v1stPosition
          : printConfig.paperHeight
        const cols = Math.max(1, Math.floor((availW + (hPitch - cw)) / hPitch))
        const rows = Math.max(1, Math.floor((availH + (vPitch - ch)) / vPitch))
        const totalPages = Math.ceil(allCards.length / (cols * rows))

        // Stage the save — DO NOT download yet. User must confirm via the
        // preview panel after verifying the layout matches their cutter.
        const studentIds = students.map((s: any) => s.id)
        setPendingSave({
          format: "PDF_PRINT",
          cardCount: allCards.length,
          pageW: printConfig.paperWidth,
          pageH: printConfig.paperHeight,
          cardW: cw,
          cardH: ch,
          h1stPosition: printConfig.h1stPosition,
          v1stPosition: printConfig.v1stPosition,
          hPitch,
          vPitch,
          cols,
          rows,
          totalPages,
          pdfCards: allCards,
          pdfStudentIds: studentIds,
          save: async () => {
            await generateDirectPdf({
              cards: allCards,
              schoolName,
              paperWidth: printConfig.paperWidth,
              paperHeight: printConfig.paperHeight,
              cardWidth: cw,
              cardHeight: ch,
              h1stPosition: printConfig.h1stPosition,
              v1stPosition: printConfig.v1stPosition,
              hPitch: printConfig.h2ndPosition > 0 ? printConfig.h2ndPosition : undefined,
              vPitch: printConfig.v2ndPosition > 0 ? printConfig.v2ndPosition : undefined,
              marginMm: 0,
              gapMm: 0,
            })
            // Mark as printed only after successful download
            await fetch(`/api/schools/${schoolId}/generate`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ studentIds }),
            })
          },
        })
        setProgress({ current: totalCount, total: totalCount, status: `Ready! Verify layout below, then click Download. (${cols}×${rows} = ${cols*rows} per page · ${totalPages} pages)` })

      // ──── CDR (SVG) PATH ────
      } else if (outputFormat === "CDR") {
        // Pre-convert template images to data URLs for SVG embedding
        setProgress({ current: 0, total: totalCount, status: "Preparing templates for SVG..." })
        await imageToDataUrl(templateImageUrl)
        if (hasBackSide && backTemplateImageUrl) {
          await imageToDataUrl(backTemplateImageUrl)
        }
        const svgCards: { name: string; svgContent: string }[] = []
        const previewData: typeof previewCards = []
        const studentIds: string[] = []
        const CHUNK_SIZE = 4

        // Prefetch student photos as data URLs for SVG embedding
        const svgPhotoUrls = students.map((s: any) => s.photoUrl).filter(Boolean)
        await Promise.all(svgPhotoUrls.slice(0, 30).map((u: string) => imageToDataUrl(u).catch(() => null)))
        if (svgPhotoUrls.length > 30) {
          Promise.all(svgPhotoUrls.slice(30).map((u: string) => imageToDataUrl(u).catch(() => null)))
        }

        for (let i = 0; i < students.length; i += CHUNK_SIZE) {
          const chunk = students.slice(i, i + CHUNK_SIZE)
          const promises = chunk.map(async (student: any) => {
            try {
              const frontSvg = await renderIdCardSvg(templateImageUrl, fieldMappings, student, getFlagUrl(student), cardWidthMm, cardHeightMm)
              const result: { front: { name: string; svgContent: string }; back?: { name: string; svgContent: string }; id: string } = {
                front: { name: `${student.serialNumber}_front.svg`, svgContent: frontSvg },
                id: student.id,
              }

              if (hasBackSide && backTemplateImageUrl && backFieldMappings?.length > 0) {
                const backSvg = await renderIdCardSvg(backTemplateImageUrl, backFieldMappings, student, getFlagUrl(student), cardWidthMm, cardHeightMm)
                result.back = { name: `${student.serialNumber}_back.svg`, svgContent: backSvg }
              }
              return result
            } catch (err) {
              console.error(`Error rendering SVG for ${student.serialNumber}`, err)
              return null
            }
          })
          const results = await Promise.all(promises)
          for (const r of results) {
            if (!r) continue
            svgCards.push(r.front)
            studentIds.push(r.id)
            if (r.back) svgCards.push(r.back)
          }

          // Render JPEG previews for first 8 (only once, outside the hot loop)
          if (previewData.length < 8) {
            for (const student of chunk) {
              if (previewData.length >= 8) break
              try {
                const previewFront = await renderIdCard(templateImageUrl, fieldMappings, student, getFlagUrl(student), cardWidthMm, cardHeightMm)
                let previewBack: string | undefined
                if (hasBackSide && backTemplateImageUrl && backFieldMappings?.length > 0) {
                  previewBack = await renderIdCard(backTemplateImageUrl, backFieldMappings, student, getFlagUrl(student), cardWidthMm, cardHeightMm)
                }
                previewData.push({ serialNumber: student.serialNumber, frontDataUrl: previewFront, backDataUrl: previewBack })
              } catch {}
            }
          }

          const currentProgress = Math.min(i + CHUNK_SIZE, totalCount)
          setProgress({ current: currentProgress, total: totalCount, status: `Generated ${currentProgress}/${totalCount} SVG cards...` })
          await new Promise(r => setTimeout(r, 0))
        }

        setPreviewCards(previewData)
        const cdrCw = cardWidthMm || 85.6
        const cdrCh = cardHeightMm || 54
        setLastCardDims({ w: cdrCw, h: cdrCh })
        const cdrClassName = classes.find((c) => c.id === selectedClassId)?.name || "All"
        const cdrStudentIds = [...studentIds]
        setPendingSave({
          format: "CDR",
          cardCount: svgCards.length,
          pageW: printConfig.paperWidth,
          pageH: printConfig.paperHeight,
          cardW: cdrCw,
          cardH: cdrCh,
          h1stPosition: printConfig.h1stPosition,
          v1stPosition: printConfig.v1stPosition,
          hPitch: printConfig.h2ndPosition,
          vPitch: printConfig.v2ndPosition,
          save: async () => {
            await downloadAsCdrZip(svgCards, `${schoolName}-${cdrClassName}-IDCards-CDR.zip`)
            await fetch(`/api/schools/${schoolId}/generate`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ studentIds: cdrStudentIds }),
            })
          },
        })
        setProgress({ current: totalCount, total: totalCount, status: `Ready! ${svgCards.length} SVG files staged. Verify size below, then click Download.` })

      // ──── BMP PATH ────
      } else if (outputFormat === "BMP") {
        const renderedCards: { serialNumber: string; frontDataUrl: string; backDataUrl?: string; id: string }[] = []
        const CHUNK_SIZE = 8

        // Prefetch student photos
        const bmpPhotoUrls = students.map((s: any) => s.photoUrl).filter(Boolean)
        await Promise.all(bmpPhotoUrls.slice(0, 50).map((u: string) => getCachedImage(u).catch(() => null)))
        if (bmpPhotoUrls.length > 50) {
          Promise.all(bmpPhotoUrls.slice(50).map((u: string) => getCachedImage(u).catch(() => null)))
        }

        for (let i = 0; i < students.length; i += CHUNK_SIZE) {
          const chunk = students.slice(i, i + CHUNK_SIZE)
          const promises = chunk.map(async (student: any) => {
            try {
              const frontDataUrl = await renderIdCard(templateImageUrl, fieldMappings, student, getFlagUrl(student), cardWidthMm, cardHeightMm)
              let backDataUrl: string | undefined
              if (hasBackSide && backTemplateImageUrl && backFieldMappings?.length > 0) {
                backDataUrl = await renderIdCard(backTemplateImageUrl, backFieldMappings, student, getFlagUrl(student), cardWidthMm, cardHeightMm)
              }
              return { serialNumber: student.serialNumber, frontDataUrl, backDataUrl, id: student.id }
            } catch (err) {
              console.error(`Error rendering ${student.serialNumber}`, err)
              return null
            }
          })
          const results = await Promise.all(promises)
          results.forEach(c => { if (c) renderedCards.push(c) })
          const currentProgress = Math.min(i + CHUNK_SIZE, totalCount)
          setProgress({ current: currentProgress, total: totalCount, status: `Rendered ${currentProgress}/${totalCount} cards...` })
          await new Promise(r => setTimeout(r, 0))
        }

        setPreviewCards(renderedCards.slice(0, 8).map(c => ({
          serialNumber: c.serialNumber,
          frontDataUrl: c.frontDataUrl,
          backDataUrl: c.backDataUrl,
        })))

        const bmpCw = cardWidthMm || 85.6
        const bmpCh = cardHeightMm || 54
        setLastCardDims({ w: bmpCw, h: bmpCh })
        const bmpStudentIds = renderedCards.map(c => c.id)
        const bmpRendered = renderedCards.slice()

        // Compute the grid that buildBmpPagesFromCards will use, so the
        // verification panel shows EXACTLY how the cards will be laid out
        // on the printed BMP pages (matches PDF math).
        const bmpHPitch = printConfig.h2ndPosition > 0 ? printConfig.h2ndPosition : bmpCw
        const bmpVPitch = printConfig.v2ndPosition > 0 ? printConfig.v2ndPosition : bmpCh
        const bmpAvailW = printConfig.h1stPosition > 0
          ? printConfig.paperWidth - printConfig.h1stPosition
          : printConfig.paperWidth
        const bmpAvailH = printConfig.v1stPosition > 0
          ? printConfig.paperHeight - printConfig.v1stPosition
          : printConfig.paperHeight
        const bmpCols = Math.max(1, Math.floor((bmpAvailW + (bmpHPitch - bmpCw)) / bmpHPitch))
        const bmpRows = Math.max(1, Math.floor((bmpAvailH + (bmpVPitch - bmpCh)) / bmpVPitch))
        const bmpTotalPages = Math.ceil(bmpRendered.length / (bmpCols * bmpRows))

        setPendingSave({
          format: "BMP",
          cardCount: bmpRendered.length,
          pageW: printConfig.paperWidth,
          pageH: printConfig.paperHeight,
          cardW: bmpCw,
          cardH: bmpCh,
          h1stPosition: printConfig.h1stPosition,
          v1stPosition: printConfig.v1stPosition,
          hPitch: bmpHPitch,
          vPitch: bmpVPitch,
          cols: bmpCols,
          rows: bmpRows,
          totalPages: bmpTotalPages,
          // Reuse pdfCards/pdfStudentIds slots so the layout-edit restage flow
          // (Edit Layout → Print Setup → OK) can be shared with PDF.
          pdfCards: bmpRendered.map(c => ({
            serialNumber: c.serialNumber,
            frontDataUrl: c.frontDataUrl,
            backDataUrl: c.backDataUrl,
          })),
          pdfStudentIds: bmpStudentIds,
          save: async () => {
            setProgress({ current: 0, total: bmpTotalPages, status: "Composing BMP pages..." })
            const pages = await buildBmpPagesFromCards(
              bmpRendered,
              {
                paperWidth: printConfig.paperWidth,
                paperHeight: printConfig.paperHeight,
                cardWidth: bmpCw,
                cardHeight: bmpCh,
                h1stPosition: printConfig.h1stPosition,
                v1stPosition: printConfig.v1stPosition,
                hPitch: bmpHPitch,
                vPitch: bmpVPitch,
              },
              schoolName,
              (done, total, status) => {
                setProgress({ current: done, total, status })
              },
            )
            await saveBmpPagesToFolder(pages, (done, total) => {
              setProgress({ current: done, total, status: `Saving BMP page ${done}/${total}...` })
            })
            await fetch(`/api/schools/${schoolId}/generate`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ studentIds: bmpStudentIds }),
            })
          },
        })
        setProgress({ current: totalCount, total: totalCount, status: `Ready! ${bmpRendered.length} cards staged on ${bmpTotalPages} BMP page(s) (${bmpCols}×${bmpRows} per page). Verify layout below, then click Download.` })

      // ──── JPEG PATH (existing) ────
      } else {
        const renderedCards: { name: string; dataUrl: string; id: string; serialNumber: string; frontDataUrl: string; backDataUrl?: string }[] = []
        const CHUNK_SIZE = 8

        // Prefetch student photos
        const jpgPhotoUrls = students.map((s: any) => s.photoUrl).filter(Boolean)
        await Promise.all(jpgPhotoUrls.slice(0, 50).map((u: string) => getCachedImage(u).catch(() => null)))
        if (jpgPhotoUrls.length > 50) {
          Promise.all(jpgPhotoUrls.slice(50).map((u: string) => getCachedImage(u).catch(() => null)))
        }

        for (let i = 0; i < students.length; i += CHUNK_SIZE) {
          const chunk = students.slice(i, i + CHUNK_SIZE)
          const promises = chunk.map(async (student: any) => {
            try {
              const frontDataUrl = await renderIdCard(templateImageUrl, fieldMappings, student, getFlagUrl(student), cardWidthMm, cardHeightMm)
              let backDataUrl: string | undefined
              if (hasBackSide && backTemplateImageUrl && backFieldMappings?.length > 0) {
                backDataUrl = await renderIdCard(backTemplateImageUrl, backFieldMappings, student, getFlagUrl(student), cardWidthMm, cardHeightMm)
              }
              return {
                name: `${student.serialNumber}_front.jpg`,
                dataUrl: frontDataUrl,
                id: student.id,
                serialNumber: student.serialNumber,
                frontDataUrl,
                backDataUrl,
              }
            } catch (err) {
              console.error(`Error rendering ${student.serialNumber}`, err)
              return null
            }
          })

          const results = await Promise.all(promises)
          results.forEach(c => { if(c) renderedCards.push(c) })

          const currentProgress = Math.min(i + CHUNK_SIZE, totalCount)
          setProgress({ current: currentProgress, total: totalCount, status: `Generated ${currentProgress}/${totalCount} cards...` })
          await new Promise(r => setTimeout(r, 0))
        }

        setPreviewCards(renderedCards.slice(0, 8).map(c => ({
          serialNumber: c.serialNumber,
          frontDataUrl: c.frontDataUrl,
          backDataUrl: c.backDataUrl,
        })))

        const zipCards: { name: string; dataUrl: string }[] = []
        for (const card of renderedCards) {
          zipCards.push({ name: `${card.serialNumber}_front.jpg`, dataUrl: card.frontDataUrl })
          if (card.backDataUrl) {
            zipCards.push({ name: `${card.serialNumber}_back.jpg`, dataUrl: card.backDataUrl })
          }
        }

        const jpegCw = cardWidthMm || 85.6
        const jpegCh = cardHeightMm || 54
        setLastCardDims({ w: jpegCw, h: jpegCh })
        const jpegClassName = classes.find((c) => c.id === selectedClassId)?.name || "All"
        const jpegStudentIds = renderedCards.map((c) => c.id)
        setPendingSave({
          format: "JPEG",
          cardCount: renderedCards.length,
          pageW: printConfig.paperWidth,
          pageH: printConfig.paperHeight,
          cardW: jpegCw,
          cardH: jpegCh,
          h1stPosition: printConfig.h1stPosition,
          v1stPosition: printConfig.v1stPosition,
          hPitch: printConfig.h2ndPosition,
          vPitch: printConfig.v2ndPosition,
          save: async () => {
            setProgress({ current: totalCount, total: totalCount, status: "Creating ZIP file..." })
            await downloadAsZip(zipCards, `${schoolName}-${jpegClassName}-IDCards.zip`)
            await fetch(`/api/schools/${schoolId}/generate`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ studentIds: jpegStudentIds }),
            })
          },
        })
        setProgress({ current: totalCount, total: totalCount, status: `Ready! ${renderedCards.length} cards (${zipCards.length} images) staged. Verify size below, then click Download.` })
      }
    } catch (err: any) {
      console.error(err)
      toast.error("Generation failed: " + (err?.message || "Unknown error"))
    } finally {
      setGenerating(false)
      // Release student photo cache to prevent memory build-up across runs
      clearStudentImageCache()
    }
  }, [schoolId, schoolName, selectedClassId, statusFilter, outputFormat, classes, printConfig])

  const handleConfirmDownload = useCallback(async () => {
    if (!pendingSave) return
    setDownloading(true)
    try {
      await pendingSave.save()
      setProgress({ current: pendingSave.cardCount, total: pendingSave.cardCount, status: "Downloaded! ✅" })
      toast.success(`${pendingSave.cardCount} cards downloaded as ${pendingSave.format}.`)
      setPendingSave(null)
    } catch (err: any) {
      console.error(err)
      toast.error("Download failed: " + (err?.message || "Unknown error"))
    } finally {
      setDownloading(false)
    }
  }, [pendingSave])

  const handleCancelDownload = useCallback(() => {
    setPendingSave(null)
    setProgress({ current: 0, total: 0, status: "" })
  }, [])

  // Re-stage save (PDF or BMP) using already-rendered cards but a (possibly new) printConfig.
  // Called when the user clicks "Edit Layout" and confirms the dialog — avoids re-rendering.
  const restagePdfSave = useCallback((cfg: PrintConfig, cw: number, ch: number) => {
    if (!pendingSave || !pendingSave.pdfCards || !pendingSave.pdfStudentIds) return
    if (pendingSave.format !== "PDF_PRINT" && pendingSave.format !== "BMP") return
    const cards = pendingSave.pdfCards
    const studentIds = pendingSave.pdfStudentIds
    const fmt = pendingSave.format
    const hPitch = cfg.h2ndPosition > 0 ? cfg.h2ndPosition : cw
    const vPitch = cfg.v2ndPosition > 0 ? cfg.v2ndPosition : ch
    const availW = cfg.h1stPosition > 0 ? cfg.paperWidth - cfg.h1stPosition : cfg.paperWidth
    const availH = cfg.v1stPosition > 0 ? cfg.paperHeight - cfg.v1stPosition : cfg.paperHeight
    const cols = Math.max(1, Math.floor((availW + (hPitch - cw)) / hPitch))
    const rows = Math.max(1, Math.floor((availH + (vPitch - ch)) / vPitch))
    const totalPages = Math.ceil(cards.length / (cols * rows))
    setLastCardDims({ w: cw, h: ch })
    setPendingSave({
      format: fmt,
      cardCount: cards.length,
      pageW: cfg.paperWidth,
      pageH: cfg.paperHeight,
      cardW: cw,
      cardH: ch,
      h1stPosition: cfg.h1stPosition,
      v1stPosition: cfg.v1stPosition,
      hPitch,
      vPitch,
      cols,
      rows,
      totalPages,
      pdfCards: cards,
      pdfStudentIds: studentIds,
      save: fmt === "PDF_PRINT"
        ? async () => {
            await generateDirectPdf({
              cards,
              schoolName,
              paperWidth: cfg.paperWidth,
              paperHeight: cfg.paperHeight,
              cardWidth: cw,
              cardHeight: ch,
              h1stPosition: cfg.h1stPosition,
              v1stPosition: cfg.v1stPosition,
              hPitch: cfg.h2ndPosition > 0 ? cfg.h2ndPosition : undefined,
              vPitch: cfg.v2ndPosition > 0 ? cfg.v2ndPosition : undefined,
              marginMm: 0,
              gapMm: 0,
            })
            await fetch(`/api/schools/${schoolId}/generate`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ studentIds }),
            })
          }
        : async () => {
            setProgress({ current: 0, total: totalPages, status: "Composing BMP pages..." })
            const pages = await buildBmpPagesFromCards(
              cards,
              {
                paperWidth: cfg.paperWidth,
                paperHeight: cfg.paperHeight,
                cardWidth: cw,
                cardHeight: ch,
                h1stPosition: cfg.h1stPosition,
                v1stPosition: cfg.v1stPosition,
                hPitch,
                vPitch,
              },
              schoolName,
              (done, total, status) => setProgress({ current: done, total, status }),
            )
            await saveBmpPagesToFolder(pages, (done, total) => {
              setProgress({ current: done, total, status: `Saving BMP page ${done}/${total}...` })
            })
            await fetch(`/api/schools/${schoolId}/generate`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ studentIds }),
            })
          },
    })
    setProgress({ current: cards.length, total: cards.length, status: `Layout updated! (${cols}×${rows} = ${cols * rows} per page · ${totalPages} pages)` })
  }, [pendingSave, schoolId, schoolName])

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Controls */}
      <div
        style={{
          background: "white",
          borderRadius: 16,
          border: "1px solid #e2e8f0",
          padding: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "linear-gradient(135deg, #22c55e, #16a34a)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
            }}
          >
            🖨️
          </div>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", marginBottom: 2 }}>
              Generate & Download ID Cards
            </h3>
            <p style={{ fontSize: 13, color: "#94a3b8" }}>
              Render print-quality ID cards and download as ZIP (manufacturer only)
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
          <div style={{ flex: "1 1 200px" }}>
            <label
              style={{ fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 6, display: "block" }}
            >
              Select Class
            </label>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              style={{
                width: "100%",
                height: 42,
                padding: "0 12px",
                border: "1.5px solid #e2e8f0",
                borderRadius: 10,
                fontSize: 14,
              }}
            >
              <option value="">All Classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c._count.students} students)
                </option>
              ))}
            </select>
          </div>

          <div style={{ flex: "1 1 160px" }}>
            <label
              style={{ fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 6, display: "block" }}
            >
              Student Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                width: "100%",
                height: 42,
                padding: "0 12px",
                border: "1.5px solid #e2e8f0",
                borderRadius: 10,
                fontSize: 14,
              }}
            >
              <option value="APPROVED">Approved Only</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="PRINTED">Already Printed</option>
            </select>
          </div>

          <div style={{ flex: "1 1 160px" }}>
            <label
              style={{ fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 6, display: "block" }}
            >
              Output Format
            </label>
            <select
              value={outputFormat}
              onChange={(e) => setOutputFormat(e.target.value as OutputFormat)}
              style={{
                width: "100%",
                height: 42,
                padding: "0 12px",
                border: outputFormat === "CDR" ? "1.5px solid #8b5cf6" : outputFormat === "PDF_PRINT" ? "1.5px solid #fca5a5" : outputFormat === "BMP" ? "1.5px solid #86efac" : "1.5px solid #e2e8f0",
                borderRadius: 10,
                fontSize: 14,
                background: outputFormat === "CDR" ? "#f5f3ff" : outputFormat === "PDF_PRINT" ? "#fef2f2" : outputFormat === "BMP" ? "#f0fdf4" : "white",
              }}
            >
              <option value="JPEG">📷 JPEG (Print-Ready Images)</option>
              <option value="CDR">📐 CDR (CorelDRAW Vector)</option>
              <option value="PDF_PRINT">📄 PDF Print (Best for Printing)</option>
              <option value="BMP">🖼️ BMP (Combined Print Pages)</option>
            </select>
          </div>
        </div>

        {/* CDR format info banner */}
        {outputFormat === "CDR" && (
          <div style={{
            background: "linear-gradient(135deg, #f5f3ff, #ede9fe)",
            borderRadius: 10,
            padding: 14,
            marginBottom: 16,
            border: "1px solid #c4b5fd",
            fontSize: 12,
            color: "#5b21b6",
            lineHeight: 1.5,
          }}>
            <strong>📐 CDR Export:</strong> Downloads SVG files with vector text + a one-click
            <strong> convert_to_cdr.vbs</strong> script. Double-click the script and CorelDRAW
            will automatically convert all SVGs to .cdr files.
          </div>
        )}

        {/* BMP format info banner */}
        {outputFormat === "BMP" && (
          <div style={{
            background: "linear-gradient(135deg, #f0fdf4, #dcfce7)",
            borderRadius: 10,
            padding: 14,
            marginBottom: 16,
            border: "1px solid #86efac",
            fontSize: 12,
            color: "#14532d",
            lineHeight: 1.5,
          }}>
            <strong>🖼️ BMP Print Pages — Combined Sheet Output:</strong> Lays multiple ID cards on each
            BMP page using your <strong>Print Setup</strong> (page size, gaps, first-card position) — same math as PDF.
            One <strong>.bmp file per page</strong> is saved to a folder you pick. Requires a modern browser
            (Chrome/Edge/Electron). On unsupported browsers, downloads a ZIP of BMP pages instead.
          </div>
        )}

        {/* PDF Print format info banner */}
        {outputFormat === "PDF_PRINT" && (
          <div style={{
            background: "linear-gradient(135deg, #fef2f2, #fee2e2)",
            borderRadius: 10,
            padding: 14,
            marginBottom: 16,
            border: "1px solid #fca5a5",
            fontSize: 12,
            color: "#991b1b",
            lineHeight: 1.5,
          }}>
            <strong>📄 PDF Print — Best for Printing:</strong> Generates a high-quality PDF with
            multiple ID cards per page. You can choose page size (A4, Letter, etc.), customize
            card dimensions, add cut marks, and configure layout — all with <strong>zero quality loss</strong>.
            Just like Canva&apos;s &ldquo;PDF Print&rdquo; option.
          </div>
        )}

        {/* Saved Print Setup & Card Size Summary */}
        <div style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          marginTop: 12,
          marginBottom: 4,
        }}>
          {templateCardDims && (
            <div style={{
              background: "linear-gradient(135deg, #f0fdf4, #dcfce7)",
              border: "1px solid #86efac",
              borderRadius: 10,
              padding: "8px 14px",
              fontSize: 12,
              color: "#166534",
              display: "flex",
              alignItems: "center",
              gap: 6,
              flex: "1 1 180px",
            }}>
              <span style={{ fontSize: 16 }}>🪪</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 1 }}>Card Size (Saved)</div>
                <div style={{ fontWeight: 600 }}>{templateCardDims.w} × {templateCardDims.h} mm</div>
              </div>
            </div>
          )}
          {printConfigSaved && (
            <div style={{
              background: "linear-gradient(135deg, #eff6ff, #dbeafe)",
              border: "1px solid #93c5fd",
              borderRadius: 10,
              padding: "8px 14px",
              fontSize: 12,
              color: "#1e40af",
              display: "flex",
              alignItems: "center",
              gap: 6,
              flex: "1 1 260px",
            }}>
              <span style={{ fontSize: 16 }}>🖨️</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 1 }}>Print Setup (Saved)</div>
                <div style={{ fontWeight: 600 }}>
                  {printConfig.paper} ({printConfig.paperWidth}×{printConfig.paperHeight}mm) · Card {printConfig.h2ndPosition}×{printConfig.v2ndPosition}mm
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginTop: 16 }}>
          <button
            className="btn btn-outline"
            onClick={() => setShowPrintDialog(true)}
            style={{
              padding: "13px 24px",
              fontSize: 14,
              minHeight: 48,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              flex: "0 1 220px",
            }}
          >
            🖨️ Print Setup...
          </button>

          {printConfigSaved && (
            <button
              className="btn btn-outline"
              title="Clear saved Print Setup and reset to card dimension defaults"
              onClick={async () => {
                const w = templateCardDims?.w || 56
                const h = templateCardDims?.h || 88
                const defaults: PrintConfig = {
                  paper: "A4 Horizontal", paperWidth: 297, paperHeight: 210,
                  // 3 mm horizontal gap + 15 mm vertical gap between cards
                  h1stPosition: 0, h2ndPosition: w + 3, v1stPosition: 0, v2ndPosition: h + 15,
                  cardWidthMm: w, cardHeightMm: h,
                }
                setPrintConfig(defaults)
                setPrintConfigSaved(false)
                await fetch(`/api/schools/${schoolId}/template`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ printConfig: null }),
                })
                toast.success("Print settings reset to defaults")
              }}
              style={{
                padding: "13px 18px",
                fontSize: 13,
                minHeight: 48,
                display: "flex",
                alignItems: "center",
                gap: 6,
                color: "#ef4444",
                borderColor: "#fca5a5",
              }}
            >
              🔄 Reset Settings
            </button>
          )}

          <button
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={generating}
            style={{
              padding: "13px 28px",
              fontSize: 15,
              minHeight: 48,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              flex: "1 1 280px",
              maxWidth: 380,
              background: outputFormat === "CDR"
                ? "linear-gradient(135deg, #8b5cf6, #6d28d9)"
                : outputFormat === "PDF_PRINT"
                  ? "linear-gradient(135deg, #dc2626, #b91c1c)"
                  : outputFormat === "BMP"
                    ? "linear-gradient(135deg, #34c759, #2ecc71)"
                    : undefined,
            }}
          >
            {generating ? (
              <>
                <div
                  className="login-spinner"
                  style={{
                    width: 18,
                    height: 18,
                    borderColor: "rgba(255,255,255,0.3)",
                    borderTopColor: "#fff",
                  }}
                />
                Generating...
              </>
            ) : (
              <>{outputFormat === "CDR" ? "📐 Render CorelDRAW Preview" : outputFormat === "PDF_PRINT" ? "📄 Render PDF Preview" : outputFormat === "BMP" ? "🖼️ Render BMP Preview" : "🖨️ Render JPEG Preview"}</>
            )}
          </button>
        </div>
      </div>

      {/* Progress */}
      {(generating || progress.total > 0) && (
        <div
          style={{
            background: "white",
            borderRadius: 16,
            border: "1px solid #e2e8f0",
            padding: 24,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 13,
              color: "#64748b",
              marginBottom: 8,
            }}
          >
            <span>{progress.status}</span>
            {progress.total > 0 && (
              <span style={{ fontWeight: 600 }}>
                {progress.current}/{progress.total}
              </span>
            )}
          </div>
          <div
            style={{
              height: 8,
              borderRadius: 4,
              background: "#f1f5f9",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                borderRadius: 4,
                background: progress.status.includes("Done")
                  ? "linear-gradient(90deg, #22c55e, #16a34a)"
                  : "linear-gradient(90deg, #3b82f6, #2563eb)",
                width: progress.total > 0
                  ? `${(progress.current / progress.total) * 100}%`
                  : "0%",
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>
      )}

      {/* ── Layout Verification Panel (shown when a save is staged) ── */}
      {pendingSave && (
        <div
          style={{
            background: "linear-gradient(135deg, #fffbeb, #fef3c7)",
            border: "2px solid #f59e0b",
            borderRadius: 16,
            padding: 20,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 22 }}>⚠️</span>
            <h4 style={{ fontSize: 15, fontWeight: 700, color: "#78350f" }}>
              Verify layout before downloading
            </h4>
          </div>
          <p style={{ fontSize: 12, color: "#78350f", marginBottom: 14, lineHeight: 1.5 }}>
            Cards have been rendered at the <strong>exact dimensions configured below</strong>.
            Confirm these match your cutter setup before saving.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 10,
              background: "white",
              border: "1px solid #fcd34d",
              borderRadius: 10,
              padding: 14,
              marginBottom: 14,
            }}
          >
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: 0.5 }}>Format</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginTop: 2 }}>
                {pendingSave.format === "PDF_PRINT" ? "📄 PDF Print Sheet" :
                 pendingSave.format === "JPEG" ? "📷 JPEG (ZIP)" :
                 pendingSave.format === "BMP" ? "🖼️ BMP Print Pages" :
                 "📐 CorelDRAW (ZIP)"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: 0.5 }}>Card Size</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginTop: 2, fontFamily: "monospace" }}>
                {pendingSave.cardW} × {pendingSave.cardH} mm
              </div>
            </div>
            {(pendingSave.format === "PDF_PRINT" || pendingSave.format === "BMP") && (
              <>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: 0.5 }}>Page Size</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginTop: 2, fontFamily: "monospace" }}>
                    {pendingSave.pageW} × {pendingSave.pageH} mm
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: 0.5 }}>Grid / Page</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginTop: 2, fontFamily: "monospace" }}>
                    {pendingSave.cols} × {pendingSave.rows} = {(pendingSave.cols || 0) * (pendingSave.rows || 0)} cards
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: 0.5 }}>Total Pages</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginTop: 2, fontFamily: "monospace" }}>
                    {pendingSave.totalPages}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: 0.5 }}>1st Card Position</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginTop: 2, fontFamily: "monospace" }}>
                    X: {pendingSave.h1stPosition} mm · Y: {pendingSave.v1stPosition} mm
                    {(pendingSave.h1stPosition === 0 && pendingSave.v1stPosition === 0) && (
                      <span style={{ fontSize: 10, color: "#92400e", marginLeft: 6 }}>(auto-centered)</span>
                    )}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: 0.5 }}>Pitch (card-to-card)</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginTop: 2, fontFamily: "monospace" }}>
                    H: {pendingSave.hPitch} mm · V: {pendingSave.vPitch} mm
                  </div>
                </div>
              </>
            )}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: 0.5 }}>Total Cards</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginTop: 2, fontFamily: "monospace" }}>
                {pendingSave.cardCount}
              </div>
            </div>
          </div>

          {(pendingSave.format === "PDF_PRINT" || pendingSave.format === "BMP") && pendingSave.hPitch > 0 && pendingSave.vPitch > 0 && (
            (pendingSave.hPitch < pendingSave.cardW || pendingSave.vPitch < pendingSave.cardH) && (
              <div style={{
                background: "#fee2e2",
                border: "1px solid #fca5a5",
                borderRadius: 8,
                padding: 10,
                marginBottom: 12,
                fontSize: 12,
                color: "#991b1b",
              }}>
                <strong>⚠ Pitch is smaller than card size.</strong> Cards will overlap on output.
                {pendingSave.hPitch < pendingSave.cardW && ` (H pitch ${pendingSave.hPitch}mm < card width ${pendingSave.cardW}mm)`}
                {pendingSave.vPitch < pendingSave.cardH && ` (V pitch ${pendingSave.vPitch}mm < card height ${pendingSave.cardH}mm)`}
              </div>
            )
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {(pendingSave.format === "PDF_PRINT" || pendingSave.format === "BMP") && (
              <button
                onClick={() => setShowPrintDialog(true)}
                disabled={downloading}
                style={{
                  padding: "12px 20px",
                  borderRadius: 10,
                  border: "1px solid #f59e0b",
                  background: "white",
                  color: "#92400e",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: downloading ? "not-allowed" : "pointer",
                }}
              >
                ✏️ Edit Layout
              </button>
            )}
            <button
              onClick={handleConfirmDownload}
              disabled={downloading}
              style={{
                flex: "1 1 200px",
                padding: "12px 20px",
                borderRadius: 10,
                border: "none",
                background: downloading
                  ? "#94a3b8"
                  : "linear-gradient(135deg, #16a34a, #15803d)",
                color: "white",
                fontSize: 14,
                fontWeight: 700,
                cursor: downloading ? "not-allowed" : "pointer",
                boxShadow: "0 2px 10px rgba(22,163,74,0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {downloading ? "Downloading..." : `✅ Confirm & Download ${pendingSave.format === "PDF_PRINT" ? "PDF" : pendingSave.format === "BMP" ? "BMP Pages" : pendingSave.format}`}
            </button>
            <button
              onClick={handleCancelDownload}
              disabled={downloading}
              style={{
                padding: "12px 20px",
                borderRadius: 10,
                border: "1px solid #cbd5e1",
                background: "white",
                color: "#475569",
                fontSize: 14,
                fontWeight: 600,
                cursor: downloading ? "not-allowed" : "pointer",
              }}
            >
              ✕ Cancel
            </button>
          </div>
        </div>
      )}

      {/* Preview Grid */}
      {previewCards.length > 0 && (
        <div
          style={{
            background: "white",
            borderRadius: 16,
            border: "1px solid #e2e8f0",
            padding: 24,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
            <h4 style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
              Card Preview ({previewCards.length} of {progress.total})
            </h4>
            {pdfPrintCards.length > 0 && !pendingSave && (
              <button
                onClick={async () => {
                  await generateDirectPdf({
                    cards: pdfPrintCards,
                    schoolName,
                    paperWidth: printConfig.paperWidth,
                    paperHeight: printConfig.paperHeight,
                    cardWidth: lastCardDims.w,
                    cardHeight: lastCardDims.h,
                    h1stPosition: printConfig.h1stPosition,
                    v1stPosition: printConfig.v1stPosition,
                    hPitch: printConfig.h2ndPosition > 0 ? printConfig.h2ndPosition : undefined,
                    vPitch: printConfig.v2ndPosition > 0 ? printConfig.v2ndPosition : undefined,
                    marginMm: 0,
                    gapMm: 0,
                  })
                }}
                style={{
                  padding: "8px 16px",
                  borderRadius: 10,
                  border: "none",
                  background: "linear-gradient(135deg, #dc2626, #b91c1c)",
                  color: "white",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  boxShadow: "0 2px 10px rgba(220,38,38,0.3)",
                }}
              >
                📄 Re-download PDF
              </button>
            )}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: 16,
            }}
          >
            {previewCards.map((card) => (
              <div key={card.serialNumber}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 4, textAlign: "center" }}>FRONT</div>
                <img
                  src={card.frontDataUrl}
                  alt={`ID Card Front ${card.serialNumber}`}
                  style={{
                    width: "100%",
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                  }}
                />
                {card.backDataUrl && (
                  <>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 4, marginTop: 8, textAlign: "center" }}>BACK</div>
                    <img
                      src={card.backDataUrl}
                      alt={`ID Card Back ${card.serialNumber}`}
                      style={{
                        width: "100%",
                        borderRadius: 8,
                        border: "1px solid #e2e8f0",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                      }}
                    />
                  </>
                )}
                <div
                  style={{
                    textAlign: "center",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#64748b",
                    marginTop: 6,
                    fontFamily: "monospace",
                  }}
                >
                  {card.serialNumber}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}


      {/* ── Print Setup Dialog ── */}
      {showPrintDialog && (
        <PrintDialog
          initial={printConfig}
          cardWidthMm={templateCardDims?.w}
          cardHeightMm={templateCardDims?.h}
          onOk={(cfg: PrintConfig) => {
            // Stamp current card dims so future loads can detect stale pitch values.
            const cfgWithDims: PrintConfig = { ...cfg, cardWidthMm: templateCardDims?.w, cardHeightMm: templateCardDims?.h }
            setPrintConfig(cfgWithDims)
            setShowPrintDialog(false)
            savePrintConfig(cfgWithDims)
            // If a PDF or BMP save is staged, re-stage immediately with the new
            // layout (no re-render needed — card images are already drawn).
            if (pendingSave?.format === "PDF_PRINT" || pendingSave?.format === "BMP") {
              const cw = templateCardDims?.w || pendingSave.cardW
              const ch = templateCardDims?.h || pendingSave.cardH
              restagePdfSave(cfgWithDims, cw, ch)
              toast.success(`Layout updated: ${cfg.paperWidth}×${cfg.paperHeight} mm`)
            } else {
              toast.success(`Print setup saved: ${cfg.paper} (${cfg.paperWidth}×${cfg.paperHeight} mm)`)
            }
          }}
          onCancel={() => setShowPrintDialog(false)}
        />
      )}
    </div>
  )
}
