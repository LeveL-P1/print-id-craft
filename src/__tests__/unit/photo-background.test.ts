import { describe, expect, it } from "vitest"
import {
  configuredBgRemovalServiceUrl,
  isRetryableBgServiceStatus,
} from "@/lib/bg-removal-service"
import {
  canUseFastRecolorOnly,
  colorDistance,
  edgeAwareAlphaRefine,
  enhanceForegroundMask,
  floodFillInteriorHoles,
  isBackgroundLikePixel,
  isHeadHairZonePixel,
  isPlainBackground,
  isProtectedPortraitCorePixel,
  isSubjectInteriorPixel,
  markExteriorBackgroundMask,
  matchesSchoolColor,
  parseHexColor,
  recoverHairByColor,
  repairForegroundMaskHoles,
  rescuePortraitEnvelope,
  scoreRawMaskQuality,
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

describe("photo-background shirt-safe cleanup rules", () => {
  const schoolRed = parseHexColor("#DA0B0B")!
  const whiteShirt = { r: 248, g: 246, b: 242 }
  const navyShirt = { r: 28, g: 42, b: 92 }
  const lightBlueShirt = { r: 168, g: 198, b: 228 }

  it("does not treat white shirts as replaceable on a red background", () => {
    expect(isBackgroundLikePixel(whiteShirt.r, whiteShirt.g, whiteShirt.b, schoolRed, true)).toBe(false)
    expect(isBackgroundLikePixel(whiteShirt.r, whiteShirt.g, whiteShirt.b, schoolRed, false)).toBe(false)
  })

  it("does not treat coloured uniforms as replaceable when they differ from the target", () => {
    expect(isBackgroundLikePixel(navyShirt.r, navyShirt.g, navyShirt.b, schoolRed, true)).toBe(false)
    expect(isBackgroundLikePixel(lightBlueShirt.r, lightBlueShirt.g, lightBlueShirt.b, schoolRed, true)).toBe(false)
  })

  it("still replaces pixels that match the chosen background colour", () => {
    expect(isBackgroundLikePixel(218, 11, 11, schoolRed, false)).toBe(true)
    expect(isBackgroundLikePixel(255, 255, 255, parseHexColor("#FFFFFF")!, false)).toBe(true)
  })

  it("protects the centre torso region from edge flood cleanup", () => {
    expect(isSubjectInteriorPixel(100, 200, 200, 400)).toBe(true)
    expect(isSubjectInteriorPixel(5, 200, 200, 400)).toBe(false)
  })

  it("protects eye, face, collar, and shirt zones from neutral cleanup", () => {
    expect(isProtectedPortraitCorePixel(100, 140, 200, 400)).toBe(true)
    expect(isProtectedPortraitCorePixel(100, 210, 200, 400)).toBe(true)
    expect(isProtectedPortraitCorePixel(100, 300, 200, 400)).toBe(true)
    expect(isProtectedPortraitCorePixel(10, 140, 200, 400)).toBe(false)
  })
})

describe("photo-background hair hole repair", () => {
  function makeImage(w: number, h: number, paint: (x: number, y: number) => [number, number, number, number]) {
    const data = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        const [r, g, b, a] = paint(x, y)
        data[i] = r
        data[i + 1] = g
        data[i + 2] = b
        data[i + 3] = a
      }
    }
    return { data, width: w, height: h } as ImageData
  }

  it("fills interior transparent holes surrounded by hair", () => {
    const original = makeImage(9, 9, (x, y) => {
      if (x === 4 && y === 4) return [42, 28, 18, 255]
      return [42, 28, 18, 255]
    })
    const mask = makeImage(9, 9, (x, y) => {
      if (x === 4 && y === 4) return [0, 0, 0, 0]
      if (Math.abs(x - 4) <= 1 && Math.abs(y - 4) <= 1) return [0, 0, 0, 255]
      return [0, 0, 0, 0]
    })

    const repaired = repairForegroundMaskHoles(original, mask)
    expect(repaired.data[(4 * 9 + 4) * 4 + 3]).toBe(255)
    expect(repaired.data[(4 * 9 + 4) * 4]).toBe(42)
  })

  it("does not fill background holes connected to the border", () => {
    const original = makeImage(5, 5, () => [250, 250, 250, 255])
    const mask = makeImage(5, 5, (x, y) => {
      if (x === 0 || y === 0) return [0, 0, 0, 0]
      return [0, 0, 0, 255]
    })
    const exterior = markExteriorBackgroundMask(mask.data, 5, 5, 72)
    expect(exterior[0]).toBe(1)
    expect(exterior[2 * 5 + 2]).toBe(0)
  })

  it("targets the head band for hair repair", () => {
    expect(isHeadHairZonePixel(50, 40, 100, 200)).toBe(true)
    expect(isHeadHairZonePixel(50, 180, 100, 200)).toBe(false)
  })

  it("scores masks with fewer person-zone holes higher", () => {
    const original = makeImage(7, 7, () => [40, 30, 20, 255])
    const good = makeImage(7, 7, (x, y) => {
      if (x >= 2 && x <= 4 && y >= 1 && y <= 5) return [0, 0, 0, 255]
      return [0, 0, 0, 0]
    })
    const holey = makeImage(7, 7, (x, y) => {
      if (x === 3 && y === 3) return [0, 0, 0, 0]
      if (x >= 2 && x <= 4 && y >= 1 && y <= 5) return [0, 0, 0, 255]
      return [0, 0, 0, 0]
    })
    expect(scoreRawMaskQuality(original, good)).toBeGreaterThan(scoreRawMaskQuality(original, holey))
  })

  it("enhanceForegroundMask restores original colours on foreground", () => {
    const original = makeImage(5, 5, () => [90, 60, 40, 255])
    const mask = makeImage(5, 5, (x, y) => {
      if (x === 2 && y === 2) return [200, 200, 200, 255]
      if (x >= 1 && x <= 3 && y >= 1 && y <= 3) return [0, 0, 0, 255]
      return [0, 0, 0, 0]
    })
    const enhanced = enhanceForegroundMask(original, mask)
    expect(enhanced.data[(2 * 5 + 2) * 4]).toBe(90)
    expect(enhanced.data[(2 * 5 + 2) * 4 + 1]).toBe(60)
  })

  it("rescues a wider lower portrait envelope for shoulders and sleeves", () => {
    const original = makeImage(20, 20, () => [248, 248, 245, 255])
    const mask = makeImage(20, 20, (x, y) => {
      if (x >= 7 && x <= 12 && y >= 1 && y <= 8) return [0, 0, 0, 255]
      return [0, 0, 0, 0]
    })

    const rescued = rescuePortraitEnvelope(original, mask)
    expect(rescued.data[(12 * 20 + 4) * 4 + 3]).toBe(255)
    expect(rescued.data[(12 * 20 + 4) * 4]).toBe(248)
  })
})

describe("bg-removal-service helpers", () => {
  it("strips trailing slashes from configured service URL", () => {
    const prev = process.env.BG_REMOVAL_SERVICE_URL
    process.env.BG_REMOVAL_SERVICE_URL = "https://example.hf.space/"
    expect(configuredBgRemovalServiceUrl()).toBe("https://example.hf.space")
    process.env.BG_REMOVAL_SERVICE_URL = prev
  })

  it("treats gateway statuses as retryable", () => {
    expect(isRetryableBgServiceStatus(502)).toBe(true)
    expect(isRetryableBgServiceStatus(503)).toBe(true)
    expect(isRetryableBgServiceStatus(504)).toBe(true)
    expect(isRetryableBgServiceStatus(400)).toBe(false)
  })
})

describe("new background enhancements", () => {
  it("covers extended head/hair zone for braids/venis", () => {
    expect(isHeadHairZonePixel(80, 160, 100, 200)).toBe(true)
  })

  it("covers wider shirt/torso zone in protected core", () => {
    expect(isProtectedPortraitCorePixel(10, 100, 100, 200)).toBe(true)
  })
})

describe("phone-quality cutout optimizations", () => {
  // Helper to make fake ImageData
  const makeImageData = (w: number, h: number, fill: (x: number, y: number) => [number, number, number, number]) => {
    const data = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const [r, g, b, a] = fill(x, y)
        const p = (y * w + x) * 4
        data[p] = r; data[p+1] = g; data[p+2] = b; data[p+3] = a
      }
    }
    return { data, width: w, height: h } as ImageData
  }

  it("floodFillInteriorHoles fills holes that cannot reach the border", () => {
    // 10×10 image: solid foreground ring with a transparent hole in the centre
    const original = makeImageData(10, 10, () => [100, 50, 50, 255])
    const mask = makeImageData(10, 10, (x, y) => {
      // Border: transparent background
      if (x === 0 || y === 0 || x === 9 || y === 9) return [0, 0, 0, 0]
      // Inner ring (1-pixel thick): solid foreground
      if (x === 1 || y === 1 || x === 8 || y === 8) return [100, 50, 50, 255]
      // Centre 6×6: transparent hole (interior)
      return [0, 0, 0, 0]
    })

    const result = floodFillInteriorHoles(original, mask)
    // Centre pixel (5,5) was transparent but is an interior hole → should now be filled
    const centreAlpha = result.data[(5 * 10 + 5) * 4 + 3]
    expect(centreAlpha).toBe(255)

    // Border pixel (0,0) should remain transparent (exterior)
    const borderAlpha = result.data[3]
    expect(borderAlpha).toBe(0)
  })

  it("floodFillInteriorHoles does NOT fill holes connected to the border", () => {
    // 10×10 image: foreground with a gap in the left wall so the hole reaches the border
    const original = makeImageData(10, 10, () => [100, 50, 50, 255])
    const mask = makeImageData(10, 10, (x, y) => {
      if (x === 0 || y === 0 || x === 9 || y === 9) return [0, 0, 0, 0]
      // Left wall has a gap at y=5 (hole connects to border through x=0,y=5 → x=1,y=5)
      if (x === 1 && y === 5) return [0, 0, 0, 0]  // gap!
      if (x === 1 || y === 1 || x === 8 || y === 8) return [100, 50, 50, 255]
      return [0, 0, 0, 0]  // interior
    })

    const result = floodFillInteriorHoles(original, mask)
    // Centre should still be transparent because the hole connects to border via the gap
    const centreAlpha = result.data[(5 * 10 + 5) * 4 + 3]
    expect(centreAlpha).toBe(0)
  })

  it("edgeAwareAlphaRefine boosts alpha for pixels similar to high-alpha neighbours", () => {
    // 10×10 image: uniform dark colour, mask has a weak pixel surrounded by strong ones
    const original = makeImageData(10, 10, () => [40, 30, 20, 255]) // all same dark colour
    const mask = makeImageData(10, 10, (x, y) => {
      if (x === 5 && y === 5) return [40, 30, 20, 60]  // weak alpha in centre
      return [40, 30, 20, 200]  // strong alpha everywhere else
    })

    const result = edgeAwareAlphaRefine(original, mask)
    const centreAlpha = result.data[(5 * 10 + 5) * 4 + 3]
    // Since all neighbours have alpha 200 and same colour, the centre should be boosted
    expect(centreAlpha).toBeGreaterThan(60)
  })

  it("recoverHairByColor recovers dark pixels adjacent to foreground in head zone", () => {
    // 20×20 image: light grey wall with a dark hair pixel at (10, 5) that has low mask alpha
    const original = makeImageData(20, 20, (x, y) => {
      // Wall colour: light grey (this becomes the edge background)
      if (x <= 1 || x >= 18 || y <= 1) return [220, 220, 220, 255]
      // Dark hair pixel
      if (x === 10 && y === 5) return [30, 20, 15, 255]
      // Face/foreground
      return [180, 140, 120, 255]
    })

    const mask = makeImageData(20, 20, (x, y) => {
      // The dark pixel is missed by the model (low alpha)
      if (x === 10 && y === 5) return [30, 20, 15, 10]
      // Adjacent pixel is solid foreground
      if (x === 10 && y === 6) return [180, 140, 120, 255]
      // Everything else: some foreground
      if (x > 5 && x < 15 && y > 2 && y < 15) return [180, 140, 120, 200]
      return [220, 220, 220, 0]  // background
    })

    const result = recoverHairByColor(original, mask)
    const hairAlpha = result.data[(5 * 20 + 10) * 4 + 3]
    // Dark pixel at (10,5) should be recovered since it's dark, far from wall, and has fg neighbour
    expect(hairAlpha).toBe(255)
  })

  it("recoverHairByColor does NOT recover light pixels (not hair)", () => {
    const original = makeImageData(20, 20, (x, y) => {
      if (x <= 1 || x >= 18 || y <= 1) return [220, 220, 220, 255]
      // Light pixel — not hair
      if (x === 10 && y === 5) return [200, 190, 180, 255]
      return [180, 140, 120, 255]
    })

    const mask = makeImageData(20, 20, (x, y) => {
      if (x === 10 && y === 5) return [200, 190, 180, 10]  // low alpha
      if (x === 10 && y === 6) return [180, 140, 120, 255]
      if (x > 5 && x < 15 && y > 2 && y < 15) return [180, 140, 120, 200]
      return [220, 220, 220, 0]
    })

    const result = recoverHairByColor(original, mask)
    const pixelAlpha = result.data[(5 * 20 + 10) * 4 + 3]
    // Light pixel should NOT be recovered (brightness > 100)
    expect(pixelAlpha).toBe(10)
  })
})
