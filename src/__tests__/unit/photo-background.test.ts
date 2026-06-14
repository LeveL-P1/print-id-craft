import { describe, expect, it } from "vitest"
import {
  canUseFastRecolorOnly,
  colorDistance,
  isPlainBackground,
  matchesSchoolColor,
  parseHexColor,
  type BgUniformity,
} from "@/lib/photo-background"

describe("photo-background fast recolor gate", () => {
  const plainWhite: BgUniformity = {
    score: 90,
    dominantRgb: { r: 250, g: 250, b: 248 },
    dominantRatio: 0.9,
  }

  const plainRed: BgUniformity = {
    score: 88,
    dominantRgb: { r: 218, g: 11, b: 11 },
    dominantRatio: 0.88,
  }

  it("does not fast-recolor white background to school red", () => {
    expect(canUseFastRecolorOnly(plainWhite, "#DA0B0B")).toBe(false)
    expect(matchesSchoolColor(plainWhite, "#DA0B0B")).toBe(false)
  })

  it("allows fast recolor when background already matches school colour", () => {
    expect(canUseFastRecolorOnly(plainRed, "#DA0B0B")).toBe(true)
  })

  it("does not fast-recolor mixed backgrounds even if dominant is close", () => {
    const mixed: BgUniformity = { score: 50, dominantRgb: { r: 218, g: 11, b: 11 }, dominantRatio: 0.4 }
    expect(isPlainBackground(mixed)).toBe(false)
    expect(canUseFastRecolorOnly(mixed, "#DA0B0B")).toBe(false)
  })

  it("parses hex colours for distance checks", () => {
    const red = parseHexColor("#DA0B0B")
    expect(red).toEqual({ r: 218, g: 11, b: 11 })
    expect(colorDistance(plainRed.dominantRgb, red!)).toBeLessThan(10)
  })
})
