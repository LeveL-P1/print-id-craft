"use client"
import { useState, useMemo, useCallback, useEffect, useRef } from "react"
import { toast } from "sonner"
import {
  calculateGridLayout,
  generatePdfFilename,
  getOrientation,
  getMirroredCol,
  PAGE_SIZES,
  CARD_PRESETS,
  QUICK_PRESETS,
} from "@/lib/pdf-layout"

/* ─── Types ─── */
type CardImage = {
  serialNumber: string
  frontDataUrl: string
  backDataUrl?: string
}

type PdfPrintSheetProps = {
  cards: CardImage[]
  schoolName: string
  /** Called when the modal is closed */
  onClose: () => void
}

// PAGE_SIZES, CARD_PRESETS imported from @/lib/pdf-layout

/* ─── Helpers ─── */
const MM_TO_PX = 3.7795275591 // 1mm = 3.78px @ 96dpi

/**
 * PdfPrintSheet — an overlay modal that lets users configure and download
 * a multi-up print-ready PDF of ID cards.
 */
export default function PdfPrintSheet({ cards, schoolName, onClose }: PdfPrintSheetProps) {
  /* ── State ── */
  const [pageSizeKey, setPageSizeKey] = useState("A4")
  const [customPageW, setCustomPageW] = useState(210)
  const [customPageH, setCustomPageH] = useState(297)

  const [cardPresetKey, setCardPresetKey] = useState("SCHOOL_ID")
  const [customCardW, setCustomCardW] = useState(56)
  const [customCardH, setCustomCardH] = useState(88)

  const [marginMm, setMarginMm] = useState(5) // outer page margin
  const [gapMm, setGapMm] = useState(1) // gap between cards
  const [landscape, setLandscape] = useState(true) // landscape for 10 cards
  const [includeBacks, setIncludeBacks] = useState(true)
  const [addCutMarks, setAddCutMarks] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [printSide, setPrintSide] = useState<"both" | "front" | "back">("both")
  const [imageFormat, setImageFormat] = useState<"jpeg" | "png">("png") // PNG for lossless print

  const previewRef = useRef<HTMLCanvasElement>(null)

  /* ── Derived sizes ── */
  const rawPageW = pageSizeKey === "CUSTOM" ? customPageW : PAGE_SIZES[pageSizeKey].widthMm
  const rawPageH = pageSizeKey === "CUSTOM" ? customPageH : PAGE_SIZES[pageSizeKey].heightMm
  // Swap dimensions when landscape orientation is selected
  const pageW = landscape ? Math.max(rawPageW, rawPageH) : Math.min(rawPageW, rawPageH)
  const pageH = landscape ? Math.min(rawPageW, rawPageH) : Math.max(rawPageW, rawPageH)
  const cardW = cardPresetKey === "CUSTOM" ? customCardW : CARD_PRESETS[cardPresetKey].widthMm
  const cardH = cardPresetKey === "CUSTOM" ? customCardH : CARD_PRESETS[cardPresetKey].heightMm

  const hasBackSide = cards.some(c => !!c.backDataUrl)

  /* ── Grid layout calculator ── */
  const layout = useMemo(
    () => calculateGridLayout(pageW, pageH, cardW, cardH, marginMm, gapMm, cards.length),
    [pageW, pageH, cardW, cardH, marginMm, gapMm, cards.length]
  )

  /* ── Live preview canvas ── */
  useEffect(() => {
    const canvas = previewRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const scale = 2 // retina
    const previewMaxW = 360
    const pageAspect = pageH / pageW
    const cWidth = previewMaxW
    const cHeight = Math.round(previewMaxW * pageAspect)
    canvas.width = cWidth * scale
    canvas.height = cHeight * scale
    canvas.style.width = `${cWidth}px`
    canvas.style.height = `${cHeight}px`
    ctx.scale(scale, scale)

    // page background
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, cWidth, cHeight)

    const mmToPx = (mm: number) => (mm / pageW) * cWidth

    // draw margin area
    const mPx = mmToPx(marginMm)
    ctx.strokeStyle = "#e2e8f0"
    ctx.lineWidth = 1
    ctx.setLineDash([4, 2])
    ctx.strokeRect(mPx, mPx, cWidth - mPx * 2, cHeight - mPx * 2)
    ctx.setLineDash([])

    // draw card slots
    const { cols, rows, startX, startY } = layout
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c
        const x = mmToPx(startX + c * (cardW + gapMm))
        const y = mmToPx(startY + r * (cardH + gapMm))
        const w = mmToPx(cardW)
        const h = mmToPx(cardH)

        if (idx < cards.length) {
          // filled card slot
          const grad = ctx.createLinearGradient(x, y, x + w, y + h)
          grad.addColorStop(0, "#dbeafe")
          grad.addColorStop(1, "#bfdbfe")
          ctx.fillStyle = grad
          ctx.fillRect(x, y, w, h)
          ctx.strokeStyle = "#3b82f6"
          ctx.lineWidth = 0.8
          ctx.strokeRect(x, y, w, h)

          // serial number
          ctx.fillStyle = "#1d4ed8"
          ctx.font = `bold ${Math.max(6, mmToPx(3))}px Inter, system-ui, sans-serif`
          ctx.textAlign = "center"
          ctx.textBaseline = "middle"
          ctx.fillText(cards[idx].serialNumber, x + w / 2, y + h / 2)
        } else {
          // empty slot
          ctx.fillStyle = "#f8fafc"
          ctx.fillRect(x, y, w, h)
          ctx.strokeStyle = "#e2e8f0"
          ctx.lineWidth = 0.5
          ctx.setLineDash([2, 2])
          ctx.strokeRect(x, y, w, h)
          ctx.setLineDash([])
        }

        // cut marks
        if (addCutMarks && idx < cards.length) {
          ctx.strokeStyle = "#94a3b8"
          ctx.lineWidth = 0.3
          const cmLen = mmToPx(3)
          // top-left
          ctx.beginPath(); ctx.moveTo(x - cmLen, y); ctx.lineTo(x, y); ctx.stroke()
          ctx.beginPath(); ctx.moveTo(x, y - cmLen); ctx.lineTo(x, y); ctx.stroke()
          // top-right
          ctx.beginPath(); ctx.moveTo(x + w, y); ctx.lineTo(x + w + cmLen, y); ctx.stroke()
          ctx.beginPath(); ctx.moveTo(x + w, y - cmLen); ctx.lineTo(x + w, y); ctx.stroke()
          // bottom-left
          ctx.beginPath(); ctx.moveTo(x - cmLen, y + h); ctx.lineTo(x, y + h); ctx.stroke()
          ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y + h + cmLen); ctx.stroke()
          // bottom-right
          ctx.beginPath(); ctx.moveTo(x + w, y + h); ctx.lineTo(x + w + cmLen, y + h); ctx.stroke()
          ctx.beginPath(); ctx.moveTo(x + w, y + h); ctx.lineTo(x + w, y + h + cmLen); ctx.stroke()
        }
      }
    }

    // page info text
    ctx.fillStyle = "#94a3b8"
    ctx.font = `10px Inter, system-ui, sans-serif`
    ctx.textAlign = "center"
    ctx.textBaseline = "bottom"
    ctx.fillText(
      `Page 1 of ${layout.totalPages} · ${layout.cols}×${layout.rows} (${layout.cardsPerPage}/page)`,
      cWidth / 2,
      cHeight - 4
    )
  }, [layout, cards, pageW, pageH, cardW, cardH, marginMm, gapMm, addCutMarks])

  /* ── PDF Generation ── */
  const generatePdf = useCallback(async () => {
    setGenerating(true)
    try {
      const { default: jsPDF } = await import("jspdf")

      const { cols, rows, cardsPerPage, startX, startY } = layout

      // Determine which sides to include
      const includeFront = printSide === "both" || printSide === "front"
      const includeBack = (printSide === "both" || printSide === "back") && includeBacks && hasBackSide

      // Create PDF with page size in mm
      const doc = new jsPDF({
        orientation: getOrientation(pageW, pageH),
        unit: "mm",
        format: [pageW, pageH],
        compress: true,
      })

      // Helper to load image as HTMLImageElement
      const loadImage = (dataUrl: string): Promise<HTMLImageElement> =>
        new Promise((resolve, reject) => {
          const img = new Image()
          img.onload = () => resolve(img)
          img.onerror = reject
          img.src = dataUrl
        })

      // Helper: render high-quality image data from a dataUrl
      // PNG = lossless (larger file, perfect quality for print)
      // JPEG = lossy at max quality (smaller file, negligible loss)
      const usePng = imageFormat === "png"
      const imgFmt = usePng ? "PNG" : "JPEG"

      const getHighResImageData = async (dataUrl: string): Promise<string> => {
        if (usePng) {
          // Convert everything to PNG for lossless print quality
          if (dataUrl.startsWith("data:image/png")) return dataUrl
          const img = await loadImage(dataUrl)
          const canvas = document.createElement("canvas")
          canvas.width = img.naturalWidth
          canvas.height = img.naturalHeight
          const ctx2 = canvas.getContext("2d")!
          ctx2.drawImage(img, 0, 0)
          return canvas.toDataURL("image/png")
        } else {
          // JPEG at maximum quality
          if (dataUrl.startsWith("data:image/jpeg")) return dataUrl
          const img = await loadImage(dataUrl)
          const canvas = document.createElement("canvas")
          canvas.width = img.naturalWidth
          canvas.height = img.naturalHeight
          const ctx2 = canvas.getContext("2d")!
          ctx2.drawImage(img, 0, 0)
          return canvas.toDataURL("image/jpeg", 1.0)
        }
      }

      // Helper: add cut marks to the PDF
      const drawCutMarks = (d: typeof doc, x: number, y: number, w: number, h: number) => {
        const cm = 3 // cut mark length in mm
        d.setDrawColor(150, 150, 150)
        d.setLineWidth(0.1)
        // top-left
        d.line(x - cm, y, x - 0.5, y)
        d.line(x, y - cm, x, y - 0.5)
        // top-right
        d.line(x + w + 0.5, y, x + w + cm, y)
        d.line(x + w, y - cm, x + w, y - 0.5)
        // bottom-left
        d.line(x - cm, y + h, x - 0.5, y + h)
        d.line(x, y + h + 0.5, x, y + h + cm)
        // bottom-right
        d.line(x + w + 0.5, y + h, x + w + cm, y + h)
        d.line(x + w, y + h + 0.5, x + w, y + h + cm)
      }

      // Generate FRONT pages
      if (includeFront) {
        for (let pageIdx = 0; pageIdx < Math.ceil(cards.length / cardsPerPage); pageIdx++) {
          if (pageIdx > 0 || (!includeFront && includeBack)) doc.addPage([pageW, pageH])

          // Page header watermark (faint)
          doc.setFontSize(6)
          doc.setTextColor(200, 200, 200)
          doc.text(`${schoolName} - Front Side - Page ${pageIdx + 1}`, pageW / 2, 4, { align: "center" })

          for (let slot = 0; slot < cardsPerPage; slot++) {
            const cardIdx = pageIdx * cardsPerPage + slot
            if (cardIdx >= cards.length) break

            const row = Math.floor(slot / cols)
            const col = slot % cols
            const x = startX + col * (cardW + gapMm)
            const y = startY + row * (cardH + gapMm)

            try {
              const imgData = await getHighResImageData(cards[cardIdx].frontDataUrl)
              doc.addImage(imgData, imgFmt, x, y, cardW, cardH, undefined, "NONE")

              if (addCutMarks) drawCutMarks(doc, x, y, cardW, cardH)
            } catch (err) {
              console.error(`Failed to add front image for card ${cards[cardIdx].serialNumber}`, err)
              // Draw placeholder
              doc.setDrawColor(200, 200, 200)
              doc.rect(x, y, cardW, cardH)
              doc.setFontSize(8)
              doc.setTextColor(150, 150, 150)
              doc.text(`Card ${cards[cardIdx].serialNumber}`, x + cardW / 2, y + cardH / 2, { align: "center" })
            }
          }
        }
      }

      // Generate BACK pages (mirror layout for double-sided printing)
      if (includeBack) {
        for (let pageIdx = 0; pageIdx < Math.ceil(cards.length / cardsPerPage); pageIdx++) {
          doc.addPage([pageW, pageH])

          doc.setFontSize(6)
          doc.setTextColor(200, 200, 200)
          doc.text(`${schoolName} - Back Side - Page ${pageIdx + 1}`, pageW / 2, 4, { align: "center" })

          for (let slot = 0; slot < cardsPerPage; slot++) {
            const cardIdx = pageIdx * cardsPerPage + slot
            if (cardIdx >= cards.length) break
            if (!cards[cardIdx].backDataUrl) continue

            const row = Math.floor(slot / cols)
            const col = slot % cols
            const mirroredCol = getMirroredCol(col, cols)
            const x = startX + mirroredCol * (cardW + gapMm)
            const y = startY + row * (cardH + gapMm)

            try {
              const imgData = await getHighResImageData(cards[cardIdx].backDataUrl!)
              doc.addImage(imgData, imgFmt, x, y, cardW, cardH, undefined, "NONE")

              if (addCutMarks) drawCutMarks(doc, x, y, cardW, cardH)
            } catch (err) {
              console.error(`Failed to add back image for card ${cards[cardIdx].serialNumber}`, err)
            }
          }
        }
      }

      // Save
      const filename = generatePdfFilename(schoolName)
      doc.save(filename)
      toast.success(`PDF saved! ${cards.length} cards on ${layout.totalPages} page(s).`)
    } catch (err: any) {
      console.error("PDF generation error:", err)
      toast.error("PDF generation failed: " + (err?.message || "Unknown error"))
    } finally {
      setGenerating(false)
    }
  }, [cards, layout, pageW, pageH, cardW, cardH, marginMm, gapMm, addCutMarks, includeBacks, printSide, hasBackSide, schoolName, imageFormat])

  /* ─── UI ─── */
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(6px)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: "white",
          borderRadius: 20,
          width: "min(95vw, 920px)",
          maxHeight: "90vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 80px rgba(0,0,0,0.25)",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "20px 24px",
          borderBottom: "1px solid #f1f5f9",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #eff6ff, #f8fafc)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              background: "linear-gradient(135deg, #dc2626, #b91c1c)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
              color: "white",
            }}>
              📄
            </div>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", marginBottom: 2 }}>
                PDF Print — Best for Printing
              </h3>
              <p style={{ fontSize: 12, color: "#64748b" }}>
                High-quality print-ready PDF · No quality drop · {cards.length} cards
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 36, height: 36, borderRadius: 10, border: "none",
              background: "#f1f5f9", cursor: "pointer", fontSize: 18,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#64748b",
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "auto", padding: 24, display: "flex", gap: 24, flexWrap: "wrap" }}>
          {/* Left – Settings */}
          <div style={{ flex: "1 1 340px", minWidth: 280, display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Quick Presets */}
            <SettingsSection title="⚡ Quick Presets" subtitle="One-click configurations for common layouts">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {QUICK_PRESETS.map((preset, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setPageSizeKey(preset.pageSizeKey)
                      setCardPresetKey(preset.cardPresetKey)
                      setMarginMm(preset.marginMm)
                      setGapMm(preset.gapMm)
                      setLandscape(preset.landscape)
                      if (preset.cardPresetKey !== "CUSTOM") {
                        setCustomCardW(CARD_PRESETS[preset.cardPresetKey].widthMm)
                        setCustomCardH(CARD_PRESETS[preset.cardPresetKey].heightMm)
                      }
                    }}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 10,
                      border: "1.5px solid #3b82f6",
                      background: "linear-gradient(135deg, #eff6ff, #dbeafe)",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#1d4ed8",
                      transition: "all 0.15s",
                      textAlign: "left",
                      lineHeight: 1.4,
                    }}
                    onMouseEnter={e => {
                      (e.target as HTMLElement).style.background = "linear-gradient(135deg, #dbeafe, #bfdbfe)";
                      (e.target as HTMLElement).style.transform = "translateY(-1px)";
                    }}
                    onMouseLeave={e => {
                      (e.target as HTMLElement).style.background = "linear-gradient(135deg, #eff6ff, #dbeafe)";
                      (e.target as HTMLElement).style.transform = "translateY(0)";
                    }}
                  >
                    <div>{preset.label}</div>
                    <div style={{ fontSize: 10, fontWeight: 500, color: "#3b82f6", marginTop: 2 }}>
                      {preset.description}
                    </div>
                  </button>
                ))}
              </div>
            </SettingsSection>

            {/* Page Size */}
            <SettingsSection title="📐 Page Size" subtitle="Select the paper size for printing">
              <select
                value={pageSizeKey}
                onChange={(e) => setPageSizeKey(e.target.value)}
                style={selectStyle}
              >
                {Object.entries(PAGE_SIZES).map(([key, ps]) => (
                  <option key={key} value={key}>{ps.label}</option>
                ))}
              </select>
              {pageSizeKey === "CUSTOM" && (
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <InputWithLabel label="Width (mm)" value={customPageW} onChange={(v) => setCustomPageW(Number(v))} />
                  <InputWithLabel label="Height (mm)" value={customPageH} onChange={(v) => setCustomPageH(Number(v))} />
                </div>
              )}
              {/* Orientation Toggle */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>Orientation:</label>
                <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1.5px solid #e2e8f0" }}>
                  <button
                    onClick={() => setLandscape(false)}
                    style={{
                      padding: "6px 14px",
                      border: "none",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      background: !landscape ? "#3b82f6" : "white",
                      color: !landscape ? "white" : "#64748b",
                      transition: "all 0.15s",
                    }}
                  >
                    📄 Portrait
                  </button>
                  <button
                    onClick={() => setLandscape(true)}
                    style={{
                      padding: "6px 14px",
                      border: "none",
                      borderLeft: "1.5px solid #e2e8f0",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      background: landscape ? "#3b82f6" : "white",
                      color: landscape ? "white" : "#64748b",
                      transition: "all 0.15s",
                    }}
                  >
                    📃 Landscape
                  </button>
                </div>
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                Page: {pageW} × {pageH} mm ({landscape ? "Landscape" : "Portrait"})
              </div>
            </SettingsSection>

            {/* Card Size */}
            <SettingsSection title="🪪 ID Card Size" subtitle="Size of each ID card on the page">
              <select
                value={cardPresetKey}
                onChange={(e) => {
                  setCardPresetKey(e.target.value)
                  if (e.target.value !== "CUSTOM") {
                    setCustomCardW(CARD_PRESETS[e.target.value].widthMm)
                    setCustomCardH(CARD_PRESETS[e.target.value].heightMm)
                  }
                }}
                style={selectStyle}
              >
                {Object.entries(CARD_PRESETS).map(([key, cp]) => (
                  <option key={key} value={key}>{cp.label}</option>
                ))}
              </select>
              {cardPresetKey === "CUSTOM" && (
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <InputWithLabel label="Width (mm)" value={customCardW} onChange={(v) => setCustomCardW(Number(v))} />
                  <InputWithLabel label="Height (mm)" value={customCardH} onChange={(v) => setCustomCardH(Number(v))} />
                </div>
              )}
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                Card: {cardW} × {cardH} mm
              </div>
            </SettingsSection>

            {/* Layout Tuning */}
            <SettingsSection title="⚙️ Layout Settings" subtitle="Fine-tune margins and spacing">
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Page Margin</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="range" min={2} max={30} step={1}
                      value={marginMm}
                      onChange={e => setMarginMm(Number(e.target.value))}
                      style={{ flex: 1, accentColor: "#3b82f6" }}
                    />
                    <span style={valueTagStyle}>{marginMm}mm</span>
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Card Gap</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="range" min={0} max={20} step={1}
                      value={gapMm}
                      onChange={e => setGapMm(Number(e.target.value))}
                      style={{ flex: 1, accentColor: "#3b82f6" }}
                    />
                    <span style={valueTagStyle}>{gapMm}mm</span>
                  </div>
                </div>
              </div>
            </SettingsSection>

            {/* Options */}
            <SettingsSection title="🎯 Print Options" subtitle="Additional PDF options">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <CheckboxOption
                  label="Add crop/cut marks"
                  checked={addCutMarks}
                  onChange={setAddCutMarks}
                  hint="Helps cut cards precisely"
                />
                {hasBackSide && (
                  <>
                    <CheckboxOption
                      label="Include back side pages"
                      checked={includeBacks}
                      onChange={setIncludeBacks}
                      hint="Back sides mirror-flipped for duplex printing"
                    />
                    <div>
                      <label style={labelStyle}>Print Side</label>
                      <select
                        value={printSide}
                        onChange={e => setPrintSide(e.target.value as any)}
                        style={{ ...selectStyle, fontSize: 13 }}
                      >
                        <option value="both">Both Sides (Front + Back)</option>
                        <option value="front">Front Side Only</option>
                        <option value="back">Back Side Only</option>
                      </select>
                    </div>
                  </>
                )}
              </div>
            </SettingsSection>

            {/* Image Quality */}
            <SettingsSection title="🖨️ Print Quality" subtitle="Image format for PDF output">
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setImageFormat("png")}
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: imageFormat === "png" ? "2px solid #16a34a" : "1.5px solid #e2e8f0",
                    background: imageFormat === "png" ? "linear-gradient(135deg, #f0fdf4, #dcfce7)" : "white",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: imageFormat === "png" ? "#166534" : "#475569" }}>
                    🔬 PNG Lossless
                  </div>
                  <div style={{ fontSize: 10, color: imageFormat === "png" ? "#16a34a" : "#94a3b8", marginTop: 2 }}>
                    Best for print · No quality loss · Larger file
                  </div>
                </button>
                <button
                  onClick={() => setImageFormat("jpeg")}
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: imageFormat === "jpeg" ? "2px solid #2563eb" : "1.5px solid #e2e8f0",
                    background: imageFormat === "jpeg" ? "linear-gradient(135deg, #eff6ff, #dbeafe)" : "white",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: imageFormat === "jpeg" ? "#1d4ed8" : "#475569" }}>
                    📷 JPEG Max
                  </div>
                  <div style={{ fontSize: 10, color: imageFormat === "jpeg" ? "#3b82f6" : "#94a3b8", marginTop: 2 }}>
                    Good quality · Smaller file · Fastest
                  </div>
                </button>
              </div>
              <div style={{
                marginTop: 8,
                padding: "8px 10px",
                borderRadius: 8,
                background: imageFormat === "png" ? "#f0fdf4" : "#eff6ff",
                border: `1px solid ${imageFormat === "png" ? "#bbf7d0" : "#bfdbfe"}`,
                fontSize: 11,
                color: imageFormat === "png" ? "#166534" : "#1d4ed8",
                lineHeight: 1.5,
              }}>
                {imageFormat === "png"
                  ? "✅ PNG embeds images with zero compression artifacts — ideal for professional ID card printing."
                  : "JPEG at 100% quality — very close to lossless, significantly smaller file size."}
              </div>
            </SettingsSection>
          </div>

          {/* Right – Preview & Summary */}
          <div style={{ flex: "1 1 300px", minWidth: 260, display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Live preview */}
            <div style={{
              background: "#f8fafc",
              borderRadius: 14,
              border: "1px solid #e2e8f0",
              padding: 16,
              textAlign: "center",
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 10 }}>
                📋 Page Layout Preview
              </div>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <canvas
                  ref={previewRef}
                  style={{
                    borderRadius: 8,
                    boxShadow: "0 2px 12px rgba(0,0,0,0.1)",
                    border: "1px solid #e2e8f0",
                  }}
                />
              </div>
            </div>

            {/* Summary */}
            <div style={{
              background: "linear-gradient(135deg, #f0fdf4, #dcfce7)",
              borderRadius: 14,
              border: "1px solid #86efac",
              padding: 16,
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#166534", marginBottom: 10 }}>
                📊 Print Summary
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
                <SummaryItem label="Grid" value={`${layout.cols} × ${layout.rows}`} />
                <SummaryItem label="Cards/Page" value={String(layout.cardsPerPage)} />
                <SummaryItem label="Total Cards" value={String(cards.length)} />
                <SummaryItem label="Total Pages" value={String(layout.totalPages)} />
                <SummaryItem label="Page" value={`${pageW}×${pageH}mm`} />
                <SummaryItem label="Card" value={`${cardW}×${cardH}mm`} />
              </div>
              {includeBacks && hasBackSide && (
                <div style={{
                  marginTop: 8,
                  paddingTop: 8,
                  borderTop: "1px solid #bbf7d0",
                  fontSize: 11,
                  color: "#166534",
                }}>
                  + {layout.totalPages} back-side page(s) for duplex printing
                </div>
              )}
            </div>

            {/* Quality info */}
            <div style={{
              background: "linear-gradient(135deg, #faf5ff, #f3e8ff)",
              borderRadius: 14,
              border: "1px solid #d8b4fe",
              padding: 14,
              fontSize: 12,
              color: "#6b21a8",
              lineHeight: 1.5,
            }}>
              <strong>🖨️ Print Quality:</strong> Images embedded at full source resolution
              with {imageFormat === "png" ? "PNG lossless" : "JPEG 100% quality"} format
              and zero PDF compression — ensures crisp output at any DPI.
              {imageFormat === "png" && " Perfect for professional ID card printing."}
            </div>

            {/* DPI info */}
            <div style={{
              background: "linear-gradient(135deg, #fefce8, #fef9c3)",
              borderRadius: 14,
              border: "1px solid #fde047",
              padding: 14,
              fontSize: 12,
              color: "#854d0e",
              lineHeight: 1.5,
            }}>
              <strong>💡 Tip:</strong> For best print results, ensure your card template
              images are at least <strong>661×1039 pixels</strong> (300 DPI at 56×88mm).
              Higher resolution source images = sharper printed cards.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: "16px 24px",
          borderTop: "1px solid #f1f5f9",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#fafbfc",
          flexWrap: "wrap",
          gap: 12,
        }}>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>
            {cards.length} cards → {layout.totalPages} page(s) at {layout.cols}×{layout.rows} grid
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={onClose}
              style={{
                padding: "10px 20px",
                borderRadius: 10,
                border: "1px solid #e2e8f0",
                background: "white",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
                color: "#64748b",
              }}
            >
              Cancel
            </button>
            <button
              onClick={generatePdf}
              disabled={generating}
              style={{
                padding: "10px 28px",
                borderRadius: 10,
                border: "none",
                background: generating
                  ? "#94a3b8"
                  : "linear-gradient(135deg, #dc2626, #b91c1c)",
                color: "white",
                fontSize: 14,
                fontWeight: 700,
                cursor: generating ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                boxShadow: generating ? "none" : "0 4px 14px rgba(220,38,38,0.35)",
              }}
            >
              {generating ? (
                <>
                  <div
                    style={{
                      width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)",
                      borderTopColor: "white", borderRadius: "50%",
                      animation: "spin 1s linear infinite",
                    }}
                  />
                  Generating PDF...
                </>
              ) : (
                <>📄 Download PDF Print</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Spinner keyframe (inline, safe) */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

/* ─── Sub-components ─── */
function SettingsSection({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: "#f8fafc",
      borderRadius: 14,
      border: "1px solid #e2e8f0",
      padding: 16,
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 2 }}>{title}</div>
      <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 10 }}>{subtitle}</div>
      {children}
    </div>
  )
}

function InputWithLabel({ label, value, onChange }: { label: string; value: number; onChange: (v: string) => void }) {
  return (
    <div style={{ flex: 1 }}>
      <label style={{ fontSize: 11, color: "#64748b", fontWeight: 600, display: "block", marginBottom: 4 }}>{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        step={0.1}
        style={{
          width: "100%",
          height: 36,
          padding: "0 10px",
          border: "1.5px solid #e2e8f0",
          borderRadius: 8,
          fontSize: 13,
        }}
      />
    </div>
  )
}

function CheckboxOption({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint: string }) {
  return (
    <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer" }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        style={{ marginTop: 2, accentColor: "#3b82f6", width: 16, height: 16 }}
      />
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{label}</div>
        <div style={{ fontSize: 11, color: "#94a3b8" }}>{hint}</div>
      </div>
    </label>
  )
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span style={{ color: "#4ade80", fontWeight: 600 }}>{label}: </span>
      <span style={{ color: "#166534", fontWeight: 700 }}>{value}</span>
    </div>
  )
}

/* ─── Shared styles ─── */
const selectStyle: React.CSSProperties = {
  width: "100%",
  height: 40,
  padding: "0 12px",
  border: "1.5px solid #e2e8f0",
  borderRadius: 10,
  fontSize: 14,
  background: "white",
  cursor: "pointer",
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "#64748b",
  display: "block",
  marginBottom: 4,
}

const valueTagStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#3b82f6",
  background: "#eff6ff",
  padding: "2px 8px",
  borderRadius: 6,
  minWidth: 42,
  textAlign: "center",
}
