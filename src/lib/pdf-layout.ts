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

/* ─── Quick Presets for common print configurations ─── */
export const QUICK_PRESETS: QuickPreset[] = [
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
): GridLayout {
  const printW = pageWidthMm - marginMm * 2
  const printH = pageHeightMm - marginMm * 2
  const cols = Math.max(1, Math.floor((printW + gapMm) / (cardWidthMm + gapMm)))
  const rows = Math.max(1, Math.floor((printH + gapMm) / (cardHeightMm + gapMm)))
  const cardsPerPage = cols * rows
  const totalPages = Math.ceil(totalCards / cardsPerPage)
  const usedW = cols * cardWidthMm + (cols - 1) * gapMm
  const usedH = rows * cardHeightMm + (rows - 1) * gapMm
  const startX = marginMm + (printW - usedW) / 2
  const startY = marginMm + (printH - usedH) / 2
  return { cols, rows, cardsPerPage, totalPages, startX, startY, usedW, usedH }
}

/**
 * Generates a safe PDF filename from school name.
 */
export function generatePdfFilename(schoolName: string): string {
  return `${schoolName.replace(/[^a-zA-Z0-9]/g, "_")}_IDCards_Print.pdf`
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
