"use client"
import { useRef, useEffect, useState, useCallback, memo } from "react"
import {
  resolveDisplayFieldValue as resolveDisplayFieldValueShared,
  resolveFieldValue as resolveFieldValueShared,
  formatDateValue,
} from "@/lib/field-resolver"

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
  // How long text is handled inside the box:
  //   "nowrap"    → single line, truncated with "…" on overflow.
  //   "wrap"      → single line, auto-shrunk so the full text fits (default,
  //                  matches legacy behaviour).
  //   "multiline" → wraps onto multiple lines AT THE USER'S CHOSEN font size.
  //                  Used for long addresses where shrinking would be illegible.
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

/**
 * Draws a rounded-rectangle path on the given canvas context.
 * Used to clip photo regions with rounded corners (incl. full-circle when
 * radius is >= min(w,h)/2). Falls back to a plain rectangle when radius is 0.
 */
function pathRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2))
  ctx.beginPath()
  if (radius <= 0) {
    ctx.rect(x, y, w, h)
    return
  }
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

type JpgCardPreviewProps = {
  templateImageUrl: string
  fieldMappings: FieldMapping[]
  formData: Record<string, string>
  studentPhoto?: string
  flagImageUrl?: string
  scale?: number
  className?: string
  watermark?: string
  /**
   * Card physical size in millimetres. When provided, the preview canvas
   * uses this aspect ratio (cardWidthMm × DPI / 25.4 wide) instead of the
   * template image's natural pixel size. This ensures the preview matches
   * what jsPDF will render in the printed PDF — no squash/stretch.
   */
  cardWidthMm?: number
  cardHeightMm?: number
}

const MAPPER_REFERENCE_WIDTH = 600
const PREVIEW_DPI = 300

// Bounded LRU image cache — prevents unbounded memory growth when
// previewing many students. Template images (long-lived) are protected.
const IMAGE_CACHE_MAX = 60
const imageCache = new Map<string, HTMLImageElement>()

async function loadImage(url: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(url)
  if (cached) {
    // Move to end (most-recently-used)
    imageCache.delete(url)
    imageCache.set(url, cached)
    return cached
  }
  const img = new Image()
  img.crossOrigin = "anonymous"
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error("Failed to load: " + url))
    img.src = url
  })
  // Evict oldest if at capacity (skip template URLs)
  if (imageCache.size >= IMAGE_CACHE_MAX) {
    const oldest = imageCache.keys().next().value
    if (oldest && !oldest.includes("/template")) imageCache.delete(oldest)
  }
  imageCache.set(url, img)
  return img
}

const normalizeKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "")

const FIELD_GROUPS: Record<string, string[]> = {
  name: ["fullname", "studentname", "name", "student_name", "full_name"],
  father: ["fathername", "father", "fatherphone", "mobfather", "mob_father", "fatherno"],
  mother: ["mothername", "mother", "motherphone", "motherno"],
  mob_father: ["mobfather", "mob_father", "fatherphone", "father", "fathername", "phone"],
  phone: ["phone", "mobile", "contact", "fatherphone", "mobfather"],
  class: ["class", "classsection", "class_section"],
  division: ["division", "div", "section"],
  branch: ["branch"],
  rollno: ["rollno", "roll", "srno", "no", "admissionno"],
  address: ["address", "addr"],
  dateofbirth: ["dob", "dateofbirth", "birthdate"],
  bloodgroup: ["bloodgroup"],
  admissionno: ["admissionno", "admno"],
  photoid: ["photoid", "photo_id", "photono", "photo_no", "photonumber", "img", "imgno", "img_no", "imageno", "image_no"],
  serialnumber: ["serialnumber", "serial"],
  flagcolor: ["flagcolor", "flag_color", "flag", "house", "housecolor", "house_color", "colour", "color", "team"],
}

// Delegate to the canonical shared resolver so all field-key aliases
// (including "mobile" → "phone"/"fatherphone") stay in sync across the app.
export function resolveFieldValue(fd: Record<string, string>, fieldKey: string): string {
  return resolveFieldValueShared(fd, fieldKey)
}

function resolveCardFieldValue(fd: Record<string, string>, fieldKey: string): string {
  return resolveDisplayFieldValueShared(fd, fieldKey)
}

/**
 * Word-wrap + (optionally) auto-shrink text to fit a fixed box.
 *
 * Honours the field's `textWrap` mode:
 *   • "wrap"      → legacy auto-fit. Try single line shrinking down to ~30%
 *                    of box height, otherwise wrap and keep shrinking.
 *   • "nowrap"    → single line at the user's chosen font size (truncated
 *                    with "…" if it overflows the box width).
 *   • "multiline" → wrap onto multiple lines AT THE USER'S CHOSEN font size.
 *                    Font is NEVER shrunk for width; lines that overflow the
 *                    box vertically are clipped by the caller's ctx.rect clip.
 *
 * `userFontSizeEditorPx` is the value the user set in the side panel (stored
 * in editor pixels, relative to a ~600 px reference image). We scale it to
 * canvas pixels here so what they see in the editor matches the preview.
 */
// `userFontSizePt` is interpreted as typographic points. We convert
// to canvas pixels using the card's mm width so size 10 in the picker
// really is 10 pt on the printed card.
function fitTextToBox(
  ctx: CanvasRenderingContext2D,
  text: string,
  boxW: number,
  boxH: number,
  fontFamily: string,
  fontWeight: string,
  scale: number,
  canvasW: number,
  userFontSizePt?: number,
  wrapMode: "nowrap" | "wrap" | "multiline" = "wrap",
  fontStyle: string = "normal",
  cardWidthMm: number = 85.6,
): { lines: string[]; fontSize: number; lineHeight: number } {
  const padding = 4 * scale
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
        // Single word is wider than the box → hard-break char-by-char
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

  // Resolve the user's chosen font size (in pt) into canvas pixels.
  // pxPerPt = canvasW * 25.4 / (cardWidthMm * 72) so the printed text
  // size in pt is exactly what the user picked.
  const pxPerPt = canvasW > 0 && cardWidthMm > 0 ? (canvasW * 25.4) / (cardWidthMm * 72) : 0
  const userPx =
    userFontSizePt && userFontSizePt > 0 && pxPerPt > 0
      ? userFontSizePt * pxPerPt
      : boxH * 0.6

  // ── MULTILINE: preserve the user's font size, wrap to as many lines as needed.
  if (wrapMode === "multiline") {
    const lines = wrap(userPx)
    return { lines, fontSize: userPx, lineHeight: userPx * 1.2 }
  }

  // ── NO WRAP: single line at the user's font size, truncate with "…".
  if (wrapMode === "nowrap") {
    setFont(userPx)
    if (ctx.measureText(text).width <= maxW) {
      return { lines: [text], fontSize: userPx, lineHeight: userPx * 1.15 }
    }
    // Truncate with ellipsis
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

  // ── WRAP: start from the user's chosen font size, then shrink only if needed.
  const minFont = Math.max(7 * scale, boxH * 0.28)
  let fontSize = userPx
  setFont(fontSize)
  while (ctx.measureText(text).width > maxW && fontSize > minFont) {
    fontSize -= 0.5
    setFont(fontSize)
  }
  if (ctx.measureText(text).width <= maxW) {
    return { lines: [text], fontSize, lineHeight: fontSize * 1.15 }
  }

  let lines = wrap(fontSize)
  let lineHeight = fontSize * 1.15
  while (lines.length * lineHeight > maxH && fontSize > minFont) {
    fontSize -= 0.5
    lines = wrap(fontSize)
    lineHeight = fontSize * 1.15
  }
  return { lines, fontSize, lineHeight }
}

export default function JpgCardPreview({
  templateImageUrl,
  fieldMappings,
  formData,
  studentPhoto,
  flagImageUrl,
  scale = 1,
  className,
  watermark,
  cardWidthMm,
  cardHeightMm,
}: JpgCardPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [dimensions, setDimensions] = useState({ width: 600, height: 380 })

  const render = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    try {
      const img = await loadImage(templateImageUrl)
      // When card size in mm is provided, canvas uses that aspect ratio so
      // the preview is pixel-faithful to the printed PDF. Otherwise fall
      // back to the template image's natural size (legacy behaviour).
      let w: number
      let h: number
      if (cardWidthMm && cardHeightMm && cardWidthMm > 0 && cardHeightMm > 0) {
        w = Math.round((cardWidthMm * PREVIEW_DPI) / 25.4) * scale
        h = Math.round((cardHeightMm * PREVIEW_DPI) / 25.4) * scale
      } else {
        w = img.naturalWidth * scale
        h = img.naturalHeight * scale
      }
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        setDimensions({ width: w, height: h })
      }

      ctx.clearRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)

      for (const field of fieldMappings) {
        const fx = (field.x / 100) * w
        const fy = (field.y / 100) * h
        const fw = (field.width / 100) * w
        const fh = (field.height / 100) * h

        if (field.type === "photo") {
          // Honour the template's saved rounded-corner + border settings so the
          // live student preview matches the editor exactly. Radius is stored
          // in editor px (relative to a ~600 px reference image); we scale it
          // to the rendered canvas so circles stay circular at any DPI.
          const radiusEditorPx = field.photoBorderRadius || 0
          const radiusPx = (radiusEditorPx / MAPPER_REFERENCE_WIDTH) * w
          const borderPx = ((field.photoBorderWidth || 0) / MAPPER_REFERENCE_WIDTH) * w
          if (studentPhoto) {
            try {
              const photoImg = await loadImage(studentPhoto)
              // Cover-fit: fill the entire box, crop overflow.
              // The clip path handles hiding any overflow.
              const photoAspect = photoImg.naturalWidth / photoImg.naturalHeight
              const boxAspect = fw / fh
              let dx: number, dy: number, dw: number, dh: number
              if (photoAspect > boxAspect) {
                // Photo is wider → fit height, center horizontally
                dh = fh
                dw = fh * photoAspect
                dx = fx + (fw - dw) / 2
                dy = fy
              } else {
                // Photo is taller → fit width, center vertically
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
            } catch (err) {
              ctx.save()
              pathRoundedRect(ctx, fx, fy, fw, fh, radiusPx)
              ctx.clip()
              ctx.fillStyle = "#e2e8f0"
              ctx.fillRect(fx, fy, fw, fh)
              ctx.restore()
            }
          }
          // Draw the border on top of the (clipped) photo so rounded corners
          // are stroked cleanly. Skip when width is 0.
          if (borderPx > 0) {
            ctx.save()
            ctx.lineWidth = borderPx
            ctx.strokeStyle = field.photoBorderColor || "#000000"
            // Inset by half the line width so the stroke sits inside the box.
            const inset = borderPx / 2
            pathRoundedRect(
              ctx,
              fx + inset, fy + inset,
              fw - borderPx, fh - borderPx,
              Math.max(0, radiusPx - inset),
            )
            ctx.stroke()
            ctx.restore()
          }
        } else if (field.type === "flag") {
          if (flagImageUrl) {
            try {
              const flagImg = await loadImage(flagImageUrl)
              ctx.drawImage(flagImg, 0, 0, flagImg.naturalWidth, flagImg.naturalHeight, fx, fy, fw, fh)
            } catch (err) {
              // Flag image failed to load — skip silently
            }
          }
        } else {
          // Apply dateFormat + textTransform before rendering (matches mapper preview).
          let value = resolveCardFieldValue(formData, field.fieldKey)
          if (field.dateFormat && value) value = formatDateValue(value, field.dateFormat)
          const transform = field.textTransform || "none"
          if (transform === "uppercase") value = value.toUpperCase()
          else if (transform === "lowercase") value = value.toLowerCase()
          else if (transform === "capitalize") value = value.replace(/\b\w/g, c => c.toUpperCase())

          if (value) {
            const padding = 4 * scale
            const fontFamily = field.fontFamily || "Arial"
            const fontWeight = field.fontWeight || "normal"
            const fStyle = field.fontStyle || "normal"
            const { lines, fontSize, lineHeight: baseLineHeight } = fitTextToBox(
              ctx, String(value), fw, fh, fontFamily, fontWeight, scale,
              w, field.fontSize, field.textWrap || "wrap", fStyle,
              cardWidthMm || 85.6,
            )
            // Honour the user's lineHeight multiplier if set.
            const userLH = field.lineHeight && field.lineHeight > 0 ? field.lineHeight : 0
            const lineHeight = userLH > 0 ? fontSize * userLH : baseLineHeight

            // Apply letterSpacing (scaled from editor px to canvas px).
            const lsEditorPx = field.letterSpacing || 0
            const lsCanvasPx = (lsEditorPx / MAPPER_REFERENCE_WIDTH) * w
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
            // Vertically position the text block.
            //   • multiline → top-align so the first line is always visible
            //     even if the address overflows the bottom of the box.
            //   • everything else → centered (legacy behaviour).
            const totalH = lines.length * lineHeight
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

      if (watermark) {
        ctx.save()
        ctx.globalAlpha = 0.15
        const wmFontSize = Math.max(w * 0.05, 20)
        ctx.font = `bold ${wmFontSize}px Arial`
        ctx.fillStyle = "#ef4444"
        ctx.textAlign = "center"
        ctx.translate(w / 2, h / 2)
        ctx.rotate(-Math.PI / 6)
        for (let row = -2; row <= 2; row++) {
          ctx.fillText(watermark, 0, row * wmFontSize * 2.5)
        }
        ctx.restore()
      }
    } catch (err) {
      console.error("Render failed", err)
    }
  }, [templateImageUrl, fieldMappings, formData, studentPhoto, flagImageUrl, scale, watermark, cardWidthMm, cardHeightMm])

  const renderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Debounce canvas rendering to prevent lag on rapid form edits
    if (renderTimerRef.current) clearTimeout(renderTimerRef.current)
    renderTimerRef.current = setTimeout(() => {
      render()
    }, 50)
    return () => {
      if (renderTimerRef.current) clearTimeout(renderTimerRef.current)
    }
  }, [render])

  return (
    <div className={`${className} fade-in`} style={{ display: "inline-block" }}>
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "auto",
          maxWidth: Math.round(dimensions.width / (scale > 1 ? scale : 1)),
          borderRadius: 12,
          boxShadow: "0 10px 40px rgba(0,0,0,0.12)",
        }}
      />
    </div>
  )
}

export async function generateJpgCard(
  templateImageUrl: string,
  fieldMappings: FieldMapping[],
  formData: Record<string, string>,
  studentPhoto?: string,
  outputScale: number = 1,
  flagImageUrl?: string,
  cardWidthMm: number = 85.6,
): Promise<string> {
  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas context failed")

  const img = await loadImage(templateImageUrl)
  const w = img.naturalWidth * outputScale
  const h = img.naturalHeight * outputScale
  canvas.width = w
  canvas.height = h

  ctx.drawImage(img, 0, 0, w, h)

  for (const field of fieldMappings) {
    const fx = (field.x / 100) * w
    const fy = (field.y / 100) * h
    const fw = (field.width / 100) * w
    const fh = (field.height / 100) * h

    if (field.type === "photo") {
      // Scale saved editor-px values (border width + corner radius) to the
      // generated canvas so PDFs match what's shown in the on-screen preview.
      const radiusPx = ((field.photoBorderRadius || 0) / MAPPER_REFERENCE_WIDTH) * w
      const borderPx = ((field.photoBorderWidth || 0) / MAPPER_REFERENCE_WIDTH) * w
      if (studentPhoto) {
        try {
          const photoImg = await loadImage(studentPhoto)
          // Cover-fit: fill the entire box, crop overflow
          const photoAspect = photoImg.naturalWidth / photoImg.naturalHeight
          const boxAspect = fw / fh
          let dx: number, dy: number, dw: number, dh: number
          if (photoAspect > boxAspect) {
            dh = fh; dw = fh * photoAspect
            dx = fx + (fw - dw) / 2; dy = fy
          } else {
            dw = fw; dh = fw / photoAspect
            dx = fx; dy = fy + (fh - dh) / 2
          }
          ctx.save()
          pathRoundedRect(ctx, fx, fy, fw, fh, radiusPx)
          ctx.clip()
          ctx.drawImage(photoImg, 0, 0, photoImg.naturalWidth, photoImg.naturalHeight, dx, dy, dw, dh)
          ctx.restore()
        } catch {}
      }
      if (borderPx > 0) {
        ctx.save()
        ctx.lineWidth = borderPx
        ctx.strokeStyle = field.photoBorderColor || "#000000"
        const inset = borderPx / 2
        pathRoundedRect(
          ctx,
          fx + inset, fy + inset,
          fw - borderPx, fh - borderPx,
          Math.max(0, radiusPx - inset),
        )
        ctx.stroke()
        ctx.restore()
      }
    } else if (field.type === "flag" && flagImageUrl) {
      try {
        const flagImg = await loadImage(flagImageUrl)
        ctx.drawImage(flagImg, 0, 0, flagImg.naturalWidth, flagImg.naturalHeight, fx, fy, fw, fh)
      } catch {}
    } else if (field.type === "text") {
      const value = resolveCardFieldValue(formData, field.fieldKey)
      if (value) {
        const padding = 4 * outputScale
        const fontFamily = field.fontFamily || "Arial"
        const fontWeight = field.fontWeight || "normal"
        const { lines, fontSize, lineHeight } = fitTextToBox(
          ctx, String(value), fw, fh, fontFamily, fontWeight, outputScale,
          w, field.fontSize, field.textWrap || "wrap",
          "normal",
          cardWidthMm || 85.6,
        )

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
        const isMultiline = (field.textWrap || "wrap") === "multiline"
        const firstLineY = isMultiline
          ? fy + padding + lineHeight / 2
          : fy + (fh - totalH) / 2 + lineHeight / 2
        for (let i = 0; i < lines.length; i++) {
          ctx.fillText(lines[i], textX, firstLineY + i * lineHeight)
        }
        ctx.restore()
      }
    }
  }

  return canvas.toDataURL("image/jpeg", 0.92)
}
