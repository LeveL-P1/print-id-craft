/**
 * Pure layout calculation utilities for PDF Print Sheet.
 * All functions are side-effect-free and framework-independent.
 */

/* ─── Types ─── */
export type PageSize = {
  label: string
  widthMm: number
  heightMm: number
}

export type CardPreset = {
  label: string
  widthMm: number
  heightMm: number
}

export type QuickPreset = {
  label: string
  description: string
  pageSizeKey: string
  cardPresetKey: string
  marginMm: number
  gapMm: number
  landscape: boolean
  expectedGrid: string
  isPvc?: boolean
}

export type GridLayout = {
  cols: number
  rows: number
  cardsPerPage: number
  totalPages: number
  startX: number
  startY: number
  usedW: number
  usedH: number
}

/* ─── Constants ─── */
export const PAGE_SIZES: Record<string, PageSize> = {
  A4: { label: "A4 (210 × 297 mm)", widthMm: 210, heightMm: 297 },
  LETTER: { label: "US Letter (216 × 279 mm)", widthMm: 216, heightMm: 279 },
  LEGAL: { label: "US Legal (216 × 356 mm)", widthMm: 216, heightMm: 356 },
  A3: { label: "A3 (297 × 420 mm)", widthMm: 297, heightMm: 420 },
  A5: { label: "A5 (148 × 210 mm)", widthMm: 148, heightMm: 210 },
  CUSTOM: { label: "Custom Size", widthMm: 210, heightMm: 297 },
}

export const CARD_PRESETS: Record<string, CardPreset> = {
  CR80: { label: "CR-80 / ISO (85.6 × 54 mm)", widthMm: 85.6, heightMm: 54 },
  CR80_PORTRAIT: { label: "CR-80 Portrait (54 × 85.6 mm)", widthMm: 54, heightMm: 85.6 },
  SCHOOL_ID: { label: "School ID (56 × 88 mm)", widthMm: 56, heightMm: 88 },
  SCHOOL_ID_LANDSCAPE: { label: "School ID Landscape (88 × 56 mm)", widthMm: 88, heightMm: 56 },
  HALF_A4: { label: "Half A4 (105 × 74 mm)", widthMm: 105, heightMm: 74 },
  CUSTOM: { label: "Custom Size", widthMm: 85.6, heightMm: 54 },
}

/* ─── PVC Print Configuration (Aaryans Exact Spec) ─── */
export const PVC_PRINT_CONFIG = {
  cardW: 56,       // mm
  cardH: 88,       // mm
  pageW: 297,      // A4 landscape width
  pageH: 210,      // A4 landscape height
  marginX: 1.7,    // left/right margin
  marginY: 15.5,   // top/bottom margin
  gapH: 3.4,       // horizontal gap between cards
  gapV: 3.0,       // vertical gap between cards
  cols: 5,
  rows: 2,
  bleed: 1.5,      // mm bleed on all sides
  cornerRadius: 2.5, // mm corner radius for die-cut
  cropMarkLen: 3.0,  // mm crop mark length
  cropMarkOff: 1.0,  // mm offset from card edge
  // Verification:
  // Width:  5×56 + 4×3.4 + 2×1.7 = 280 + 13.6 + 3.4 = 297mm ✅
  // Height: 2×88 + 1×3.0 + 2×15.5 = 176 + 3.0 + 31.0 = 210mm ✅
} as const

export type PvcCardPosition = { x: number; y: number; col: number; row: number }

/**
 * Returns the exact (x, y) positions for each card slot on a PVC print page.
 * Uses fixed margins and separate H/V gaps — no auto-centering.
 */
export function getPvcCardPositions(): PvcCardPosition[] {
  const { marginX, marginY, cardW, cardH, gapH, gapV, cols, rows } = PVC_PRINT_CONFIG
  const positions: PvcCardPosition[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      positions.push({
        x: marginX + c * (cardW + gapH),
        y: marginY + r * (cardH + gapV),
        col: c,
        row: r,
      })
    }
  }
  return positions
}

/**
 * Calculates the PVC grid layout for a given number of cards.
 * Returns a GridLayout compatible with the existing system.
 */
export function calculatePvcLayout(totalCards: number): GridLayout {
  const { cols, rows, marginX, marginY, cardW, cardH, gapH, gapV } = PVC_PRINT_CONFIG
  const cardsPerPage = cols * rows
  const totalPages = Math.ceil(totalCards / cardsPerPage)
  const usedW = cols * cardW + (cols - 1) * gapH
  const usedH = rows * cardH + (rows - 1) * gapV
  return {
    cols,
    rows,
    cardsPerPage,
    totalPages,
    startX: marginX,
    startY: marginY,
    usedW,
    usedH,
  }
}

/* ─── Quick Presets for common print configurations ─── */
export const QUICK_PRESETS: QuickPreset[] = [
  {
    label: "📋 Aaryans Print (2×5)",
    description: "88×56mm landscape cards · A4 Portrait · 2×5 grid",
    pageSizeKey: "A4",
    cardPresetKey: "SCHOOL_ID_LANDSCAPE",
    marginMm: 3,
    gapMm: 1,
    landscape: false,
    expectedGrid: "2×5",
  },
  {
    label: "🪪 PVC Print (56×88)",
    description: "Exact 5×2 · 1.7mm margins · Bleed + Crop marks",
    pageSizeKey: "A4",
    cardPresetKey: "SCHOOL_ID",
    marginMm: 1.7,
    gapMm: 3.4,
    landscape: true,
    expectedGrid: "5×2",
    isPvc: true,
  },
  {
    label: "10 Cards on A4",
    description: "56×88mm cards · A4 Landscape · 5×2 grid",
    pageSizeKey: "A4",
    cardPresetKey: "SCHOOL_ID",
    marginMm: 5,
    gapMm: 1,
    landscape: true,
    expectedGrid: "5×2",
  },
  {
    label: "9 Cards on A4",
    description: "56×88mm cards · A4 Portrait · 3×3 grid",
    pageSizeKey: "A4",
    cardPresetKey: "SCHOOL_ID",
    marginMm: 5,
    gapMm: 2,
    landscape: false,
    expectedGrid: "3×3",
  },
  {
    label: "8 Cards on A4 (CR80)",
    description: "85.6×54mm cards · A4 Portrait · 2×4 grid",
    pageSizeKey: "A4",
    cardPresetKey: "CR80",
    marginMm: 10,
    gapMm: 5,
    landscape: false,
    expectedGrid: "2×4",
  },
]

/* ─── Core Layout Calculator ─── */

/**
 * Calculates the grid layout for arranging ID cards on a page.
 *
 * @param pageWidthMm   - total page width in mm
 * @param pageHeightMm  - total page height in mm
 * @param cardWidthMm   - single card width in mm
 * @param cardHeightMm  - single card height in mm
 * @param marginMm      - outer page margin in mm
 * @param gapMm         - gap between cards in mm
 * @param totalCards     - total number of cards to arrange
 */
export function calculateGridLayout(
  pageWidthMm: number,
  pageHeightMm: number,
  cardWidthMm: number,
  cardHeightMm: number,
  marginMm: number,
  gapMm: number,
  totalCards: number,
  customStartX?: number,
  customStartY?: number,
  gapVMm?: number,
): GridLayout {
  // Separate H/V gaps. Defaults to a single `gapMm` for both axes for
  // backward compatibility with callers / tests that pass only one gap.
  const gapH = gapMm
  const gapV = typeof gapVMm === "number" && isFinite(gapVMm) && gapVMm >= 0 ? gapVMm : gapMm
  const printW = pageWidthMm - marginMm * 2
  const printH = pageHeightMm - marginMm * 2
  // When a custom start position is set, reduce available space so cards
  // don't overflow the page edge.
  // Guard: null passes `!== undefined` in JS, so coerce to a proper number first.
  const safeStartX = typeof customStartX === "number" && isFinite(customStartX) && customStartX >= 0 ? customStartX : undefined
  const safeStartY = typeof customStartY === "number" && isFinite(customStartY) && customStartY >= 0 ? customStartY : undefined
  const availW = safeStartX !== undefined
    ? pageWidthMm - safeStartX
    : printW
  const availH = safeStartY !== undefined
    ? pageHeightMm - safeStartY
    : printH
  const cols = Math.max(1, Math.floor((availW + gapH) / (cardWidthMm + gapH)))
  const rows = Math.max(1, Math.floor((availH + gapV) / (cardHeightMm + gapV)))
  const cardsPerPage = cols * rows
  const totalPages = Math.ceil(totalCards / cardsPerPage)
  const usedW = cols * cardWidthMm + (cols - 1) * gapH
  const usedH = rows * cardHeightMm + (rows - 1) * gapV
  // Use custom start positions if provided, otherwise auto-center
  const startX = safeStartX !== undefined
    ? safeStartX
    : marginMm + (printW - usedW) / 2
  const startY = safeStartY !== undefined
    ? safeStartY
    : marginMm + (printH - usedH) / 2
  return { cols, rows, cardsPerPage, totalPages, startX, startY, usedW, usedH }
}

/**
 * Generates a safe PDF filename from school name.
 */
export function generatePdfFilename(schoolName: string): string {
  return `${schoolName.replace(/[^a-zA-Z0-9]/g, "_")}_IDCards_Print.pdf`
}

export function generatePdfChunkFilename(schoolName: string, suffix?: string): string {
  const base = schoolName.replace(/[^a-zA-Z0-9]/g, "_")
  return suffix ? `${base}_IDCards_Print_${suffix}.pdf` : `${base}_IDCards_Print.pdf`
}

/**
 * Determines PDF orientation from page dimensions.
 */
export function getOrientation(widthMm: number, heightMm: number): "portrait" | "landscape" {
  return widthMm > heightMm ? "landscape" : "portrait"
}

/**
 * Calculates the mirrored column index for duplex printing.
 * Back side cards are horizontally flipped so they align when printed double-sided.
 */
export function getMirroredCol(col: number, totalCols: number): number {
  return (totalCols - 1) - col
}

/* ─── Direct PDF generation (bypasses the PdfPrintSheet modal) ─── */

export type DirectPdfOptions = {
  cards: { serialNumber: string; frontDataUrl: string; backDataUrl?: string }[]
  schoolName: string
  /** Paper width in mm */
  paperWidth: number
  /** Paper height in mm */
  paperHeight: number
  /** Card image width in mm (actual size placed on PDF) */
  cardWidth: number
  /** Card image height in mm (actual size placed on PDF) */
  cardHeight: number
  /** First card horizontal position (mm), 0 = auto-center */
  h1stPosition?: number
  /** First card vertical position (mm), 0 = auto-center */
  v1stPosition?: number
  /** Horizontal pitch — distance between successive card left-edges (mm).
   *  Defaults to cardWidth (edge-to-edge). When > cardWidth a visible gap appears. */
  hPitch?: number
  /** Vertical pitch — distance between successive card top-edges (mm).
   *  Defaults to cardHeight (edge-to-edge). */
  vPitch?: number
  /** Page margin in mm (default 3) */
  marginMm?: number
  /** Gap between cards in mm (default 1) — used only when hPitch/vPitch are 0 */
  gapMm?: number
  /** Add crop/cut marks (default true) */
  addCutMarks?: boolean
  /** Optional filename suffix for chunked downloads, e.g. "001-100" */
  filenameSuffix?: string
}

/**
 * Generates and downloads a print-ready PDF directly from Print Setup values.
 * No modal UI — uses the exact paper size, card size, and positions provided.
 */
export async function generateDirectPdf(opts: DirectPdfOptions): Promise<void> {
  const { default: jsPDF } = await import("jspdf")
  const { default: toast } = await import("sonner").then(m => ({ default: m.toast }))

  const {
    cards, schoolName,
    paperWidth, paperHeight,
    cardWidth, cardHeight,
    h1stPosition = 0, v1stPosition = 0,
    hPitch: _hPitch, vPitch: _vPitch,
    marginMm = 3, gapMm = 1,
    addCutMarks = true,
    filenameSuffix,
  } = opts

  const pageW = paperWidth
  const pageH = paperHeight
  const cardW = cardWidth
  const cardH = cardHeight

  // Pitch = distance between successive card left/top edges.
  // When explicitly provided (from Print Setup h2nd/v2ndPosition), use it.
  // Otherwise fall back to cardW/H + gapMm (legacy auto-layout).
  const hPitch = _hPitch && _hPitch > 0 ? _hPitch : cardW + gapMm
  const vPitch = _vPitch && _vPitch > 0 ? _vPitch : cardH + gapMm

  // Starting position: use Print Setup first-card position if set,
  // otherwise auto-center on the page.
  const hasCustomX = h1stPosition > 0
  const hasCustomY = v1stPosition > 0

  // Compute how many cards fit within the available page area.
  // When a custom start offset is set, the available width shrinks.
  const availW = hasCustomX ? pageW - h1stPosition : pageW - marginMm * 2
  const availH = hasCustomY ? pageH - v1stPosition : pageH - marginMm * 2
  const cols = Math.max(1, Math.floor((availW + (hPitch - cardW)) / hPitch))
  const rows = Math.max(1, Math.floor((availH + (vPitch - cardH)) / vPitch))
  const cardsPerPage = cols * rows
  const totalPages = Math.ceil(cards.length / cardsPerPage)

  // Compute start positions (auto-center if no custom offset)
  const usedW = cols * hPitch - (hPitch - cardW) // = cols * cardW + (cols-1) * gap
  const usedH = rows * vPitch - (vPitch - cardH)
  const startX = hasCustomX ? h1stPosition : marginMm + (availW - usedW) / 2
  const startY = hasCustomY ? v1stPosition : marginMm + (availH - usedH) / 2

  console.log(`[PDF] page ${pageW}×${pageH}mm · card ${cardW}×${cardH}mm · pitch ${hPitch}×${vPitch}mm · grid ${cols}×${rows} · start (${startX.toFixed(1)}, ${startY.toFixed(1)})`)

  const hasBackSide = cards.some(c => !!c.backDataUrl)

  const doc = new jsPDF({
    orientation: getOrientation(pageW, pageH),
    unit: "mm",
    format: [pageW, pageH],
    compress: true,
  })

  // Helper: data URL → Uint8Array binary
  const dataUrlToBytes = (dataUrl: string): Uint8Array => {
    const base64 = dataUrl.split(",")[1]
    const bin = atob(base64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes
  }

  const getImageFormat = (dataUrl: string): "PNG" | "JPEG" =>
    dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG"

  // Pre-convert ALL card images to byte arrays once upfront.
  // This avoids re-running atob + byte-copy inside the inner page loop
  // (saves ~200ms per 100 cards for typical 200KB PNG data URLs).
  const frontBytes: Uint8Array[] = new Array(cards.length)
  const frontFmt: ("PNG" | "JPEG")[] = new Array(cards.length)
  const backBytes: (Uint8Array | null)[] = new Array(cards.length)
  const backFmt: ("PNG" | "JPEG" | null)[] = new Array(cards.length)
  for (let i = 0; i < cards.length; i++) {
    try {
      frontBytes[i] = dataUrlToBytes(cards[i].frontDataUrl)
      frontFmt[i] = getImageFormat(cards[i].frontDataUrl)
    } catch { /* handled in page loop */ }
    if (cards[i].backDataUrl) {
      try {
        backBytes[i] = dataUrlToBytes(cards[i].backDataUrl!)
        backFmt[i] = getImageFormat(cards[i].backDataUrl!)
      } catch { backBytes[i] = null; backFmt[i] = null }
    } else {
      backBytes[i] = null; backFmt[i] = null
    }
  }

  // Cut marks helper
  const drawCutMarks = (d: typeof doc, x: number, y: number, w: number, h: number) => {
    const cm = 3, off = 0.5
    d.setDrawColor(0, 0, 0)
    d.setLineWidth(0.1)
    d.line(x - off - cm, y, x - off, y); d.line(x, y - off - cm, x, y - off)
    d.line(x + w + off, y, x + w + off + cm, y); d.line(x + w, y - off - cm, x + w, y - off)
    d.line(x - off - cm, y + h, x - off, y + h); d.line(x, y + h + off, x, y + h + off + cm)
    d.line(x + w + off, y + h, x + w + off + cm, y + h); d.line(x + w, y + h + off, x + w, y + h + off + cm)
  }

  let aliasCounter = 0

  // Front pages
  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    if (pageIdx > 0) doc.addPage([pageW, pageH])

    doc.setFontSize(6); doc.setTextColor(200, 200, 200)
    doc.text(`${schoolName} - Front Side - Page ${pageIdx + 1}`, pageW / 2, 4, { align: "center" })

    for (let slot = 0; slot < cardsPerPage; slot++) {
      const cardIdx = pageIdx * cardsPerPage + slot
      if (cardIdx >= cards.length) break
      const row = Math.floor(slot / cols)
      const col = slot % cols
      const x = startX + col * hPitch
      const y = startY + row * vPitch

      try {
        if (frontBytes[cardIdx]) {
          doc.addImage(frontBytes[cardIdx], frontFmt[cardIdx], x, y, cardW, cardH, `img_${aliasCounter++}`, "FAST")
        }
        if (addCutMarks) drawCutMarks(doc, x, y, cardW, cardH)
      } catch (err) {
        console.error(`Failed front image ${cards[cardIdx].serialNumber}`, err)
        doc.setDrawColor(200, 200, 200); doc.rect(x, y, cardW, cardH)
      }
    }
  }

  // Back pages (mirrored)
  if (hasBackSide) {
    for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
      doc.addPage([pageW, pageH])
      doc.setFontSize(6); doc.setTextColor(200, 200, 200)
      doc.text(`${schoolName} - Back Side - Page ${pageIdx + 1}`, pageW / 2, 4, { align: "center" })

      for (let slot = 0; slot < cardsPerPage; slot++) {
        const cardIdx = pageIdx * cardsPerPage + slot
        if (cardIdx >= cards.length) break
        if (!backBytes[cardIdx]) continue
        const row = Math.floor(slot / cols)
        const col = slot % cols
        const mirroredCol = getMirroredCol(col, cols)
        const x = startX + mirroredCol * hPitch
        const y = startY + row * vPitch

        try {
          doc.addImage(backBytes[cardIdx]!, backFmt[cardIdx]!, x, y, cardW, cardH, `img_${aliasCounter++}`, "FAST")
          if (addCutMarks) drawCutMarks(doc, x, y, cardW, cardH)
        } catch (err) {
          console.error(`Failed back image ${cards[cardIdx].serialNumber}`, err)
        }
      }
    }
  }

  // Download
  const filename = generatePdfChunkFilename(schoolName, filenameSuffix)
  const pdfBlob = doc.output("blob")
  const blobUrl = URL.createObjectURL(pdfBlob)
  const a = document.createElement("a")
  a.href = blobUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(blobUrl), 5000)
  toast.success(`PDF saved! ${cards.length} cards on ${totalPages} page(s) · ${pageW}×${pageH}mm · Card ${cardW}×${cardH}mm · Grid ${cols}×${rows}`)
}
