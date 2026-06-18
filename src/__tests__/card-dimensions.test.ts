import { describe, it, expect } from "vitest"
import {
  CUTTER_WIDTH_MM,
  CUTTER_HEIGHT_MM,
  PDF_PT_PER_MM,
  bmpPixelsPerMeter,
  cardDimensionsForOrientation,
  mmToPrintPx,
  printCanvasSize,
  resolveCardDimensions,
} from "@/lib/card-dimensions"

describe("card-dimensions", () => {
  it("cutter portrait size is 58 x 100 mm", () => {
    const d = cardDimensionsForOrientation("PORTRAIT")
    expect(d.widthMm).toBe(58)
    expect(d.heightMm).toBe(100)
  })

  it("cutter landscape size is 100 x 58 mm", () => {
    const d = cardDimensionsForOrientation("LANDSCAPE")
    expect(d.widthMm).toBe(100)
    expect(d.heightMm).toBe(58)
  })

  it("300 DPI pixel size for 58 x 100 mm", () => {
    expect(mmToPrintPx(58)).toBe(685)
    expect(mmToPrintPx(100)).toBe(1181)
    const { widthPx, heightPx } = printCanvasSize(58, 100)
    expect(widthPx).toBe(685)
    expect(heightPx).toBe(1181)
  })

  it("300 DPI pixel size for 100 x 58 mm landscape", () => {
    const { widthPx, heightPx } = printCanvasSize(100, 58)
    expect(widthPx).toBe(1181)
    expect(heightPx).toBe(685)
  })

  it("resolveCardDimensions prefers stored mm values", () => {
    expect(resolveCardDimensions(100, 58, "PORTRAIT")).toEqual({ widthMm: 100, heightMm: 58 })
  })

  it("resolveCardDimensions falls back to orientation defaults", () => {
    expect(resolveCardDimensions(undefined, undefined, "LANDSCAPE")).toEqual({
      widthMm: CUTTER_HEIGHT_MM,
      heightMm: CUTTER_WIDTH_MM,
    })
  })

  it("PDF points per mm uses exact 72/25.4", () => {
    expect(PDF_PT_PER_MM).toBeCloseTo(2.834645669, 9)
    expect(58 * PDF_PT_PER_MM).toBeCloseTo(164.4094488, 4)
  })

  it("BMP pixels per metre matches 300 DPI", () => {
    expect(bmpPixelsPerMeter()).toBe(11811)
  })
})
