import { describe, it, expect } from "vitest"
import {
  calculateGridLayout,
  generatePdfFilename,
  getOrientation,
  getMirroredCol,
  PAGE_SIZES,
  CARD_PRESETS,
  QUICK_PRESETS,
} from "@/lib/pdf-layout"

/* ══════════════════════════════════════════════════════════════
 * PAGE_SIZES & CARD_PRESETS — constants validation
 * ═════════════════════════════════════════════════════════════ */
describe("PAGE_SIZES constants", () => {
  it("contains A4 with correct dimensions", () => {
    expect(PAGE_SIZES.A4).toEqual({ label: "A4 (210 × 297 mm)", widthMm: 210, heightMm: 297 })
  })

  it("contains US Letter with correct dimensions", () => {
    expect(PAGE_SIZES.LETTER.widthMm).toBe(216)
    expect(PAGE_SIZES.LETTER.heightMm).toBe(279)
  })

  it("contains all expected page sizes", () => {
    expect(Object.keys(PAGE_SIZES)).toEqual(
      expect.arrayContaining(["A4", "LETTER", "LEGAL", "A3", "A5", "CUSTOM"])
    )
  })

  it("all page sizes have positive dimensions", () => {
    for (const [key, ps] of Object.entries(PAGE_SIZES)) {
      expect(ps.widthMm, `${key}.widthMm`).toBeGreaterThan(0)
      expect(ps.heightMm, `${key}.heightMm`).toBeGreaterThan(0)
    }
  })
})

describe("CARD_PRESETS constants", () => {
  it("CR80 matches ISO 7810 standard (85.6 × 54 mm)", () => {
    expect(CARD_PRESETS.CR80.widthMm).toBe(85.6)
    expect(CARD_PRESETS.CR80.heightMm).toBe(54)
  })

  it("CR80_PORTRAIT is the transpose of CR80", () => {
    expect(CARD_PRESETS.CR80_PORTRAIT.widthMm).toBe(CARD_PRESETS.CR80.heightMm)
    expect(CARD_PRESETS.CR80_PORTRAIT.heightMm).toBe(CARD_PRESETS.CR80.widthMm)
  })

  it("contains all expected presets", () => {
    expect(Object.keys(CARD_PRESETS)).toEqual(
      expect.arrayContaining(["CR80", "CR80_PORTRAIT", "SCHOOL_ID", "SCHOOL_ID_LANDSCAPE", "HALF_A4", "CUSTOM"])
    )
  })

  it("SCHOOL_ID matches 58 × 100 mm cutter", () => {
    expect(CARD_PRESETS.SCHOOL_ID.widthMm).toBe(58)
    expect(CARD_PRESETS.SCHOOL_ID.heightMm).toBe(100)
  })

  it("SCHOOL_ID_LANDSCAPE is the transpose of SCHOOL_ID", () => {
    expect(CARD_PRESETS.SCHOOL_ID_LANDSCAPE.widthMm).toBe(CARD_PRESETS.SCHOOL_ID.heightMm)
    expect(CARD_PRESETS.SCHOOL_ID_LANDSCAPE.heightMm).toBe(CARD_PRESETS.SCHOOL_ID.widthMm)
  })
})

describe("QUICK_PRESETS constants", () => {
  it("has at least one preset", () => {
    expect(QUICK_PRESETS.length).toBeGreaterThanOrEqual(1)
  })

  it("10 Cards on A4 preset references valid page size and card preset", () => {
    const tenOnA4 = QUICK_PRESETS.find(p => p.label === "10 Cards on A4")
    expect(tenOnA4).toBeDefined()
    expect(tenOnA4!.pageSizeKey).toBe("A4")
    expect(tenOnA4!.cardPresetKey).toBe("SCHOOL_ID")
    expect(tenOnA4!.landscape).toBe(true)
    expect(PAGE_SIZES[tenOnA4!.pageSizeKey]).toBeDefined()
    expect(CARD_PRESETS[tenOnA4!.cardPresetKey]).toBeDefined()
  })

  it("all presets reference valid page sizes and card presets", () => {
    for (const preset of QUICK_PRESETS) {
      expect(PAGE_SIZES[preset.pageSizeKey], `page size ${preset.pageSizeKey}`).toBeDefined()
      expect(CARD_PRESETS[preset.cardPresetKey], `card preset ${preset.cardPresetKey}`).toBeDefined()
    }
  })
})

/* ══════════════════════════════════════════════════════════════
 * calculateGridLayout — core grid logic
 * ═════════════════════════════════════════════════════════════ */
describe("calculateGridLayout", () => {
  it("calculates correct grid for A4 + CR80 with 10mm margin, 5mm gap", () => {
    // A4 = 210×297, CR80 = 85.6×54, margin=10, gap=5
    const layout = calculateGridLayout(210, 297, 85.6, 54, 10, 5, 10)

    // printW = 210 - 20 = 190, (190+5)/(85.6+5) = 195/90.6 ≈ 2.15 → cols=2
    expect(layout.cols).toBe(2)
    // printH = 297 - 20 = 277, (277+5)/(54+5) = 282/59 ≈ 4.78 → rows=4
    expect(layout.rows).toBe(4)
    expect(layout.cardsPerPage).toBe(8) // 2×4
    expect(layout.totalPages).toBe(2) // ceil(10/8) = 2
  })

  it("calculates correct grid for Letter + CR80", () => {
    // Letter = 216×279, CR80 = 85.6×54
    const layout = calculateGridLayout(216, 279, 85.6, 54, 10, 5, 4)

    // printW = 216-20=196, (196+5)/(85.6+5)=201/90.6≈2.21 → cols=2
    expect(layout.cols).toBe(2)
    // printH = 279-20=259, (259+5)/(54+5)=264/59≈4.47 → rows=4
    expect(layout.rows).toBe(4)
    expect(layout.cardsPerPage).toBe(8)
    expect(layout.totalPages).toBe(1) // ceil(4/8) = 1
  })

  it("returns at least 1 col and 1 row even with large margins", () => {
    // margin so large that printable area is smaller than one card
    const layout = calculateGridLayout(210, 297, 85.6, 54, 100, 5, 1)

    expect(layout.cols).toBeGreaterThanOrEqual(1)
    expect(layout.rows).toBeGreaterThanOrEqual(1)
    expect(layout.cardsPerPage).toBeGreaterThanOrEqual(1)
  })

  it("handles single card (totalCards=1)", () => {
    const layout = calculateGridLayout(210, 297, 85.6, 54, 10, 5, 1)

    expect(layout.totalPages).toBe(1)
    expect(layout.cardsPerPage).toBeGreaterThanOrEqual(1)
  })

  it("handles zero gap correctly", () => {
    const layout = calculateGridLayout(210, 297, 85.6, 54, 10, 0, 8)

    // printW=190, 190/85.6 ≈ 2.22 → cols=2 (no gap to add)
    expect(layout.cols).toBe(2)
    // printH=277, 277/54 ≈ 5.13 → rows=5
    expect(layout.rows).toBe(5)
    expect(layout.cardsPerPage).toBe(10) // 2×5
    expect(layout.totalPages).toBe(1) // ceil(8/10)
  })

  /* ── 10 Cards on A4 Landscape (58×100mm) ── */
  it("fits cards on A4 landscape with 58×100mm cards", () => {
    // A4 landscape = 297×210, card=58×100, margin=5, gap=1
    const layout = calculateGridLayout(297, 210, 58, 100, 5, 1, 10)

    // printW = 287, (287+1)/(58+1) ≈ 4.88 → cols=4
    expect(layout.cols).toBe(4)
    // printH = 200, (200+1)/(100+1) ≈ 1.99 → rows=1
    expect(layout.rows).toBe(1)
    expect(layout.cardsPerPage).toBe(4)
    expect(layout.totalPages).toBe(3)
  })

  it("fits multiple cards on A4 portrait with 58×100mm cards", () => {
    // A4 portrait = 210×297, card=58×100, margin=5, gap=2
    const layout = calculateGridLayout(210, 297, 58, 100, 5, 2, 9)

    // printW = 200, (200+2)/(58+2) ≈ 3.37 → cols=3
    expect(layout.cols).toBe(3)
    // printH = 287, (287+2)/(100+2) ≈ 2.83 → rows=2
    expect(layout.rows).toBe(2)
    expect(layout.cardsPerPage).toBe(6)
    expect(layout.totalPages).toBe(2)
  })

  it("20 cards of 58×100mm on A4 landscape needs multiple pages", () => {
    const layout = calculateGridLayout(297, 210, 58, 100, 5, 1, 20)
    expect(layout.cardsPerPage).toBe(4)
    expect(layout.totalPages).toBe(5)
  })

  it("centers cards on page (startX and startY)", () => {
    const layout = calculateGridLayout(210, 297, 85.6, 54, 10, 5, 1)

    // startX = margin + (printW - usedW) / 2
    // usedW = 2*85.6 + 1*5 = 176.2, leftover = 190 - 176.2 = 13.8, half = 6.9
    // startX = 10 + 6.9 = 16.9
    expect(layout.startX).toBeCloseTo(16.9, 1)

    // startY = margin + (printH - usedH) / 2
    // usedH = 4*54 + 3*5 = 231, leftover = 277 - 231 = 46, half = 23
    // startY = 10 + 23 = 33
    expect(layout.startY).toBeCloseTo(33, 1)
  })

  it("calculates usedW and usedH correctly", () => {
    const layout = calculateGridLayout(210, 297, 85.6, 54, 10, 5, 1)

    // usedW = cols * cardW + (cols-1) * gap = 2*85.6 + 1*5 = 176.2
    expect(layout.usedW).toBeCloseTo(176.2, 1)
    // usedH = rows * cardH + (rows-1) * gap = 4*54 + 3*5 = 231
    expect(layout.usedH).toBeCloseTo(231, 1)
  })

  it("portrait cards fit more vertically on A4", () => {
    // CR80 Portrait: 54 × 85.6
    const layout = calculateGridLayout(210, 297, 54, 85.6, 10, 5, 12)

    // printW=190, (190+5)/(54+5)=195/59≈3.3 → cols=3
    expect(layout.cols).toBe(3)
    // printH=277, (277+5)/(85.6+5)=282/90.6≈3.11 → rows=3
    expect(layout.rows).toBe(3)
    expect(layout.cardsPerPage).toBe(9)
    expect(layout.totalPages).toBe(2) // ceil(12/9)
  })

  it("handles large A3 page with more cards per page", () => {
    // A3 = 297×420
    const layout = calculateGridLayout(297, 420, 85.6, 54, 10, 5, 20)

    // printW=277, (277+5)/(85.6+5)=282/90.6≈3.1 → cols=3
    expect(layout.cols).toBe(3)
    // printH=400, (400+5)/(54+5)=405/59≈6.8 → rows=6
    expect(layout.rows).toBe(6)
    expect(layout.cardsPerPage).toBe(18)
    expect(layout.totalPages).toBe(2) // ceil(20/18)
  })

  it("small A5 page still fits at least 1 CR80 card", () => {
    // A5 = 148×210
    const layout = calculateGridLayout(148, 210, 85.6, 54, 10, 5, 2)

    // printW=128, (128+5)/(85.6+5)=133/90.6≈1.47 → cols=1
    expect(layout.cols).toBe(1)
    // printH=190, (190+5)/(54+5)=195/59≈3.3 → rows=3
    expect(layout.rows).toBe(3)
    expect(layout.cardsPerPage).toBe(3)
    expect(layout.totalPages).toBe(1)
  })
})

/* ══════════════════════════════════════════════════════════════
 * generatePdfFilename — filename sanitization
 * ═════════════════════════════════════════════════════════════ */
describe("generatePdfFilename", () => {
  it("replaces spaces with underscores", () => {
    expect(generatePdfFilename("St Xavier School")).toBe("St_Xavier_School_IDCards_Print.pdf")
  })

  it("strips special characters", () => {
    expect(generatePdfFilename("School's (Main)")).toBe("School_s__Main__IDCards_Print.pdf")
  })

  it("preserves alphanumeric characters", () => {
    expect(generatePdfFilename("School123")).toBe("School123_IDCards_Print.pdf")
  })

  it("handles empty string", () => {
    expect(generatePdfFilename("")).toBe("_IDCards_Print.pdf")
  })
})

/* ══════════════════════════════════════════════════════════════
 * getOrientation — landscape vs portrait
 * ═════════════════════════════════════════════════════════════ */
describe("getOrientation", () => {
  it("returns portrait when height > width", () => {
    expect(getOrientation(210, 297)).toBe("portrait")
  })

  it("returns landscape when width > height", () => {
    expect(getOrientation(297, 210)).toBe("landscape")
  })

  it("returns portrait when width === height (square)", () => {
    // square pages default to portrait
    expect(getOrientation(200, 200)).toBe("portrait")
  })
})

/* ══════════════════════════════════════════════════════════════
 * getMirroredCol — duplex printing mirror
 * ═════════════════════════════════════════════════════════════ */
describe("getMirroredCol", () => {
  it("mirrors first column to last in a 3-col grid", () => {
    expect(getMirroredCol(0, 3)).toBe(2)
  })

  it("keeps middle column in a 3-col grid", () => {
    expect(getMirroredCol(1, 3)).toBe(1)
  })

  it("mirrors last column to first in a 3-col grid", () => {
    expect(getMirroredCol(2, 3)).toBe(0)
  })

  it("mirrors correctly in a 2-col grid", () => {
    expect(getMirroredCol(0, 2)).toBe(1)
    expect(getMirroredCol(1, 2)).toBe(0)
  })

  it("single column stays the same", () => {
    expect(getMirroredCol(0, 1)).toBe(0)
  })
})
