/**
 * Physical ID card dimensions - single source of truth for print output.
 *
 * Cutter / die size: 58 mm x 100 mm (portrait: width x height).
 * Landscape swaps to 100 mm x 58 mm.
 */

export const CUTTER_WIDTH_MM = 58
export const CUTTER_HEIGHT_MM = 100

export const DEFAULT_CARD_WIDTH_MM = CUTTER_WIDTH_MM
export const DEFAULT_CARD_HEIGHT_MM = CUTTER_HEIGHT_MM

export const DEFAULT_PRINT_DPI = 300
export const MM_PER_INCH = 25.4

/** PDF points per millimetre (72 pt/in / 25.4 mm/in) - exact, not rounded. */
export const PDF_PT_PER_MM = 72 / MM_PER_INCH

export type CardOrientationInput =
  | "PORTRAIT"
  | "LANDSCAPE"
  | "portrait"
  | "landscape"
  | "horizontal"
  | "vertical"

export function isLandscapeOrientation(orientation?: CardOrientationInput | null): boolean {
  return (
    orientation === "LANDSCAPE" ||
    orientation === "landscape" ||
    orientation === "horizontal"
  )
}

/** Cutter dimensions for the given orientation (exact mm). */
export function cardDimensionsForOrientation(
  orientation?: CardOrientationInput | null,
): { widthMm: number; heightMm: number } {
  if (isLandscapeOrientation(orientation)) {
    return { widthMm: CUTTER_HEIGHT_MM, heightMm: CUTTER_WIDTH_MM }
  }
  return { widthMm: CUTTER_WIDTH_MM, heightMm: CUTTER_HEIGHT_MM }
}

/** Resolve stored mm values, falling back to cutter defaults. */
export function resolveCardDimensions(
  cardWidthMm?: number | null,
  cardHeightMm?: number | null,
  orientation?: CardOrientationInput | null,
): { widthMm: number; heightMm: number } {
  const w = Number(cardWidthMm)
  const h = Number(cardHeightMm)
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
    return { widthMm: w, heightMm: h }
  }
  return cardDimensionsForOrientation(orientation)
}

/** Millimetres to print pixels at the given DPI (independent per axis). */
export function mmToPrintPx(mm: number, dpi: number = DEFAULT_PRINT_DPI): number {
  return Math.round((mm * dpi) / MM_PER_INCH)
}

/** Print pixels to millimetres at the given DPI. */
export function printPxToMm(px: number, dpi: number = DEFAULT_PRINT_DPI): number {
  return (px * MM_PER_INCH) / dpi
}

/** Canvas pixel size for a card at print DPI - both axes from exact mm. */
export function printCanvasSize(
  widthMm: number,
  heightMm: number,
  dpi: number = DEFAULT_PRINT_DPI,
): { widthPx: number; heightPx: number } {
  return {
    widthPx: mmToPrintPx(widthMm, dpi),
    heightPx: mmToPrintPx(heightMm, dpi),
  }
}

/** BMP / PNG pHYs header: pixels per metre for the given DPI. */
export function bmpPixelsPerMeter(dpi: number = DEFAULT_PRINT_DPI): number {
  return Math.round((dpi / MM_PER_INCH) * 1000)
}

/** Minimum card width in px at 300 DPI (58 mm). */
export const MIN_PRINT_WIDTH_PX = mmToPrintPx(CUTTER_WIDTH_MM)
