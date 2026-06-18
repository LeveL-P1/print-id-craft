"use client"
import { useState, useMemo, useCallback, useEffect, useRef } from "react"
import {
  CUTTER_HEIGHT_MM,
  CUTTER_WIDTH_MM,
} from "@/lib/card-dimensions"

/* Mobile tab for Settings vs Preview */
type MobileTab = "settings" | "preview"
import { toast } from "sonner"
import {
  calculateGridLayout,
  calculatePvcLayout,
  generatePdfFilename,
  getOrientation,
  getMirroredCol,
  getPvcCardPositions,
  PAGE_SIZES,
  CARD_PRESETS,
  QUICK_PRESETS,
  PVC_PRINT_CONFIG,
} from "@/lib/pdf-layout"

/* ─── Types ─── */
type CardImage = {
  serialNumber: string
  frontDataUrl: string
  backDataUrl?: string
}

type PrintSetupConfig = {
  paper: string
  paperWidth: number
  paperHeight: number
  h1stPosition: number
  h2ndPosition: number
  v1stPosition: number
  v2ndPosition: number
}

type PdfPrintSheetProps = {
  cards: CardImage[]
  schoolName: string
  /** Called when the modal is closed */
  onClose: () => void
  /** Optional: seed from Print Setup dialog for exact paper size & card positions */
  printSetup?: PrintSetupConfig
}

// PAGE_SIZES, CARD_PRESETS imported from @/lib/pdf-layout

/* ─── Helpers ─── */
const MM_TO_PX = 3.7795275591 // 1mm = 3.78px @ 96dpi

/**
 * PdfPrintSheet — an overlay modal that lets users configure and download
 * a multi-up print-ready PDF of ID cards.
 */
export default function PdfPrintSheet({ cards, schoolName, onClose, printSetup }: PdfPrintSheetProps) {
  // Determine initial values from printSetup if provided
  const hasPrintSetup = !!printSetup && (printSetup.paperWidth > 0 || printSetup.paperHeight > 0)
  const initLandscape = hasPrintSetup ? printSetup!.paperWidth > printSetup!.paperHeight : false
  const initPageSizeKey = hasPrintSetup ? "CUSTOM" : "A4"
  const initPageW = hasPrintSetup ? printSetup!.paperWidth : 210
  const initPageH = hasPrintSetup ? printSetup!.paperHeight : 297
  const initUsePos = hasPrintSetup && (printSetup!.h1stPosition > 0 || printSetup!.v1stPosition > 0)
  const initPosX = hasPrintSetup ? printSetup!.h1stPosition : 0
  const initPosY = hasPrintSetup ? printSetup!.v1stPosition : 0
  // If h2ndPosition / v2ndPosition are set, use them as custom card sizes
  const initCardPreset = hasPrintSetup && printSetup!.h2ndPosition > 0 && printSetup!.v2ndPosition > 0 ? "CUSTOM" : "SCHOOL_ID_LANDSCAPE"
  const initCardW = hasPrintSetup && printSetup!.h2ndPosition > 0 ? printSetup!.h2ndPosition : CUTTER_HEIGHT_MM
  const initCardH = hasPrintSetup && printSetup!.v2ndPosition > 0 ? printSetup!.v2ndPosition : CUTTER_WIDTH_MM

  /* ── State ── */
  const [pageSizeKey, setPageSizeKey] = useState(initPageSizeKey)
  const [customPageW, setCustomPageW] = useState(initPageW)
  const [customPageH, setCustomPageH] = useState(initPageH)

  const [cardPresetKey, setCardPresetKey] = useState(initCardPreset)
  const [customCardW, setCustomCardW] = useState(initCardW)
  const [customCardH, setCustomCardH] = useState(initCardH)

  const [marginMm, setMarginMm] = useState(3) // outer page margin
  // Separate H/V gaps between cards. Defaults: 3mm horizontal, 15mm vertical.
  const [gapMm, setGapMm] = useState(3) // horizontal gap between cards (mm)
  const [gapVMm, setGapVMm] = useState(15) // vertical gap between cards (mm)
  const [landscape, setLandscape] = useState(initLandscape) // portrait page for 2×5 layout
  const [includeBacks, setIncludeBacks] = useState(true)
  const [addCutMarks, setAddCutMarks] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [printSide, setPrintSide] = useState<"both" | "front" | "back">("both")
  const [imageFormat, setImageFormat] = useState<"jpeg" | "png">("png") // PNG for lossless print
  const [pvcMode, setPvcMode] = useState(false) // PVC precision print mode
  const [activePresetIdx, setActivePresetIdx] = useState(hasPrintSetup ? -1 : 0) // Track active Quick Preset
  const [useCustomPosition, setUseCustomPosition] = useState(initUsePos) // ID-Card Position override
  const [cardPosX, setCardPosX] = useState(initPosX) // Horizontal 1st card position (mm)
  const [cardPosY, setCardPosY] = useState(initPosY) // Vertical 1st card position (mm)
  const [mobileTab, setMobileTab] = useState<MobileTab>("settings")
  const [isMobile, setIsMobile] = useState(false)

  /* Detect mobile viewport */
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  const previewRef = useRef<HTMLCanvasElement>(null)

  /* ── Derived sizes (PVC mode overrides all) ── */
  const rawPageW = pvcMode ? PVC_PRINT_CONFIG.pageW : pageSizeKey === "CUSTOM" ? customPageW : PAGE_SIZES[pageSizeKey].widthMm
  const rawPageH = pvcMode ? PVC_PRINT_CONFIG.pageH : pageSizeKey === "CUSTOM" ? customPageH : PAGE_SIZES[pageSizeKey].heightMm
  // Swap dimensions when landscape orientation is selected
  const pageW = pvcMode ? PVC_PRINT_CONFIG.pageW : landscape ? Math.max(rawPageW, rawPageH) : Math.min(rawPageW, rawPageH)
  const pageH = pvcMode ? PVC_PRINT_CONFIG.pageH : landscape ? Math.min(rawPageW, rawPageH) : Math.max(rawPageW, rawPageH)
  const cardW = pvcMode ? PVC_PRINT_CONFIG.cardW : cardPresetKey === "CUSTOM" ? customCardW : CARD_PRESETS[cardPresetKey].widthMm
  const cardH = pvcMode ? PVC_PRINT_CONFIG.cardH : cardPresetKey === "CUSTOM" ? customCardH : CARD_PRESETS[cardPresetKey].heightMm

  const hasBackSide = cards.some(c => !!c.backDataUrl)

  /* ── Grid layout calculator ── */
  const layout = useMemo(
    () => pvcMode
      ? calculatePvcLayout(cards.length)
      : calculateGridLayout(
          pageW, pageH, cardW, cardH, marginMm, gapMm, cards.length,
          useCustomPosition ? cardPosX : undefined,
          useCustomPosition ? cardPosY : undefined,
          gapVMm,
        ),
    [pvcMode, pageW, pageH, cardW, cardH, marginMm, gapMm, gapVMm, cards.length, useCustomPosition, cardPosX, cardPosY]
  )

  /* ── Live preview canvas ── */
  useEffect(() => {
    const canvas = previewRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const scale = 2 // retina
    const previewMaxW = isMobile ? Math.min(window.innerWidth - 56, 320) : 360
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
    const effectiveGapH = pvcMode ? PVC_PRINT_CONFIG.gapH : gapMm
    const effectiveGapV = pvcMode ? PVC_PRINT_CONFIG.gapV : gapVMm
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c
        const x = mmToPx(startX + c * (cardW + effectiveGapH))
        const y = mmToPx(startY + r * (cardH + effectiveGapV))
        const w = mmToPx(cardW)
        const h = mmToPx(cardH)

        if (idx < cards.length) {
          // filled card slot
          const grad = ctx.createLinearGradient(x, y, x + w, y + h)
          grad.addColorStop(0, pvcMode ? "#dcfce7" : "#dbeafe")
          grad.addColorStop(1, pvcMode ? "#bbf7d0" : "#bfdbfe")
          ctx.fillStyle = grad
          ctx.fillRect(x, y, w, h)
          ctx.strokeStyle = pvcMode ? "#16a34a" : "#3b82f6"
          ctx.lineWidth = 0.8
          ctx.strokeRect(x, y, w, h)

          // serial number
          ctx.fillStyle = pvcMode ? "#166534" : "#1d4ed8"
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
          const cmLen = pvcMode ? mmToPx(PVC_PRINT_CONFIG.cropMarkLen) : mmToPx(3)
          const cmOff = pvcMode ? mmToPx(PVC_PRINT_CONFIG.cropMarkOff) : 0
          ctx.strokeStyle = pvcMode ? "#059669" : "#94a3b8"
          ctx.lineWidth = pvcMode ? 0.4 : 0.3
          // top-left
          ctx.beginPath(); ctx.moveTo(x - cmOff - cmLen, y); ctx.lineTo(x - cmOff, y); ctx.stroke()
          ctx.beginPath(); ctx.moveTo(x, y - cmOff - cmLen); ctx.lineTo(x, y - cmOff); ctx.stroke()
          // top-right
          ctx.beginPath(); ctx.moveTo(x + w + cmOff, y); ctx.lineTo(x + w + cmOff + cmLen, y); ctx.stroke()
          ctx.beginPath(); ctx.moveTo(x + w, y - cmOff - cmLen); ctx.lineTo(x + w, y - cmOff); ctx.stroke()
          // bottom-left
          ctx.beginPath(); ctx.moveTo(x - cmOff - cmLen, y + h); ctx.lineTo(x - cmOff, y + h); ctx.stroke()
          ctx.beginPath(); ctx.moveTo(x, y + h + cmOff); ctx.lineTo(x, y + h + cmOff + cmLen); ctx.stroke()
          // bottom-right
          ctx.beginPath(); ctx.moveTo(x + w + cmOff, y + h); ctx.lineTo(x + w + cmOff + cmLen, y + h); ctx.stroke()
          ctx.beginPath(); ctx.moveTo(x + w, y + h + cmOff); ctx.lineTo(x + w, y + h + cmOff + cmLen); ctx.stroke()
        }
      }
    }

    // page info text
    ctx.fillStyle = pvcMode ? "#059669" : "#94a3b8"
    ctx.font = `10px Inter, system-ui, sans-serif`
    ctx.textAlign = "center"
    ctx.textBaseline = "bottom"
    ctx.fillText(
      `${pvcMode ? "🪪 PVC · " : ""}Page 1 of ${layout.totalPages} · ${layout.cols}×${layout.rows} (${layout.cardsPerPage}/page)`,
      cWidth / 2,
      cHeight - 4
    )
  }, [layout, cards, pageW, pageH, cardW, cardH, marginMm, gapMm, gapVMm, addCutMarks, pvcMode, isMobile])

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

      // Helper: convert a data URL to Uint8Array binary for jsPDF.
      // Passing binary Uint8Array avoids hitting JS string length limits.
      const dataUrlToBytes = (dataUrl: string): Uint8Array => {
        const base64 = dataUrl.split(",")[1]
        const binaryString = atob(base64)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }
        return bytes
      }

      // Detect image format from data URL
      const getImageFormat = (dataUrl: string): "PNG" | "JPEG" =>
        dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG"

      // Extract binary directly from source — NO re-encoding, NO quality loss.
      // PNG stays PNG (lossless, crisp text). JPEG stays JPEG (no double-compression).
      const getCardImageBinary = (dataUrl: string): { bytes: Uint8Array; format: "PNG" | "JPEG" } => {
        return { bytes: dataUrlToBytes(dataUrl), format: getImageFormat(dataUrl) }
      }

      // Helper: add cut marks to the PDF
      const drawCutMarks = (d: typeof doc, x: number, y: number, w: number, h: number) => {
        const cm = pvcMode ? PVC_PRINT_CONFIG.cropMarkLen : 3 // cut mark length in mm
        const off = pvcMode ? PVC_PRINT_CONFIG.cropMarkOff : 0.5 // offset from card edge
        d.setDrawColor(0, 0, 0) // pure black for print
        d.setLineWidth(pvcMode ? 0.15 : 0.1)
        // top-left
        d.line(x - off - cm, y, x - off, y)
        d.line(x, y - off - cm, x, y - off)
        // top-right
        d.line(x + w + off, y, x + w + off + cm, y)
        d.line(x + w, y - off - cm, x + w, y - off)
        // bottom-left
        d.line(x - off - cm, y + h, x - off, y + h)
        d.line(x, y + h + off, x, y + h + off + cm)
        // bottom-right
        d.line(x + w + off, y + h, x + w + off + cm, y + h)
        d.line(x + w, y + h + off, x + w, y + h + off + cm)
      }

      // Image cache with unique aliases — jsPDF deduplicates images by alias,
      // so identical images are only stored once in the PDF.
      let aliasCounter = 0

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
            const pdfGapH = pvcMode ? PVC_PRINT_CONFIG.gapH : gapMm
            const pdfGapV = pvcMode ? PVC_PRINT_CONFIG.gapV : gapVMm
            const x = startX + col * (cardW + pdfGapH)
            const y = startY + row * (cardH + pdfGapV)

            try {
              const { bytes, format } = getCardImageBinary(cards[cardIdx].frontDataUrl)
              const alias = `img_${aliasCounter++}`
              doc.addImage(bytes, format, x, y, cardW, cardH, alias, "FAST")

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
            const pdfGapH = pvcMode ? PVC_PRINT_CONFIG.gapH : gapMm
            const pdfGapV = pvcMode ? PVC_PRINT_CONFIG.gapV : gapVMm
            const x = startX + mirroredCol * (cardW + pdfGapH)
            const y = startY + row * (cardH + pdfGapV)

            try {
              const { bytes, format } = getCardImageBinary(cards[cardIdx].backDataUrl!)
              const alias = `img_${aliasCounter++}`
              doc.addImage(bytes, format, x, y, cardW, cardH, alias, "FAST")

              if (addCutMarks) drawCutMarks(doc, x, y, cardW, cardH)
            } catch (err) {
              console.error(`Failed to add back image for card ${cards[cardIdx].serialNumber}`, err)
            }
          }
        }
      }
      // Save using Blob-based download to avoid doc.save()'s internal
      // Array.join('') which crashes with "Invalid string length" on large PDFs.
      const filename = generatePdfFilename(schoolName)
      const pdfBlob = doc.output("blob")
      const blobUrl = URL.createObjectURL(pdfBlob)
      const a = document.createElement("a")
      a.href = blobUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000)
      toast.success(`PDF saved! ${cards.length} cards on ${layout.totalPages} page(s).`)
    } catch (err: any) {
      console.error("PDF generation error:", err)
      toast.error("PDF generation failed: " + (err?.message || "Unknown error"))
    } finally {
      setGenerating(false)
    }
  }, [cards, layout, pageW, pageH, cardW, cardH, marginMm, gapMm, gapVMm, addCutMarks, includeBacks, printSide, hasBackSide, schoolName, imageFormat])

  /* ─── UI ─── */
  return (
    <div
      className="pdf-modal-overlay"
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
        className="pdf-modal-container"
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

        {/* Mobile Tab Switcher */}
        {isMobile && (
          <div className="pdf-mobile-tabs">
            <button
              className={`pdf-mobile-tab ${mobileTab === "settings" ? "pdf-mobile-tab-active" : ""}`}
              onClick={() => setMobileTab("settings")}
            >
              ⚙️ Settings
            </button>
            <button
              className={`pdf-mobile-tab ${mobileTab === "preview" ? "pdf-mobile-tab-active" : ""}`}
              onClick={() => setMobileTab("preview")}
            >
              👁️ Preview
            </button>
          </div>
        )}

        {/* Body */}
        <div className="pdf-modal-body" style={{ flex: 1, overflow: "auto", padding: 24, display: "flex", gap: 24, flexWrap: "wrap" }}>
          {/* Left – Settings */}
          <div className={`pdf-settings-panel ${isMobile && mobileTab !== "settings" ? "pdf-panel-hidden" : ""}`} style={{ flex: "1 1 340px", minWidth: 280, display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Quick Presets */}
            <SettingsSection title="⚡ Quick Presets" subtitle="One-click configurations for common layouts">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {QUICK_PRESETS.map((preset, idx) => {
                  const isActive = activePresetIdx === idx
                  const isPvc = !!preset.isPvc
                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        setActivePresetIdx(idx)
                        setPvcMode(!!preset.isPvc)
                        setPageSizeKey(preset.pageSizeKey)
                        setCardPresetKey(preset.cardPresetKey)
                        setMarginMm(preset.marginMm)
                        setGapMm(preset.gapMm)
                        setGapVMm(preset.gapMm)
                        setLandscape(preset.landscape)
                        setAddCutMarks(true)
                        if (preset.cardPresetKey !== "CUSTOM") {
                          setCustomCardW(CARD_PRESETS[preset.cardPresetKey].widthMm)
                          setCustomCardH(CARD_PRESETS[preset.cardPresetKey].heightMm)
                        }
                      }}
                      style={{
                        padding: "8px 14px",
                        borderRadius: 10,
                        border: `2px solid ${isActive ? (isPvc ? "#16a34a" : "#2563eb") : isPvc ? "#bbf7d0" : "#bfdbfe"}`,
                        background: isActive
                          ? isPvc
                            ? "linear-gradient(135deg, #166534, #15803d)"
                            : "linear-gradient(135deg, #1d4ed8, #2563eb)"
                          : isPvc
                            ? "linear-gradient(135deg, #f0fdf4, #dcfce7)"
                            : "linear-gradient(135deg, #eff6ff, #dbeafe)",
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 700,
                        color: isActive ? "#ffffff" : isPvc ? "#166534" : "#1d4ed8",
                        transition: "all 0.2s ease",
                        textAlign: "left",
                        lineHeight: 1.4,
                        transform: isActive ? "scale(1.03)" : "scale(1)",
                        boxShadow: isActive
                          ? isPvc
                            ? "0 4px 12px rgba(22,163,74,0.35)"
                            : "0 4px 12px rgba(37,99,235,0.35)"
                          : "none",
                      }}
                    >
                      <div>{isActive ? "✓ " : ""}{preset.label}</div>
                      <div style={{
                        fontSize: 10, fontWeight: 500, marginTop: 2,
                        color: isActive ? "rgba(255,255,255,0.8)" : isPvc ? "#16a34a" : "#3b82f6",
                      }}>
                        {preset.description}
                      </div>
                    </button>
                  )
                })}
              </div>
              {pvcMode && (
                <div style={{
                  marginTop: 10, padding: "8px 12px", borderRadius: 8,
                  background: "linear-gradient(135deg, #f0fdf4, #dcfce7)",
                  border: "1px solid #bbf7d0", fontSize: 11, color: "#166534",
                }}>
                  🪪 <strong>PVC Mode Active</strong> — All settings locked to factory spec: {CUTTER_WIDTH_MM}×{CUTTER_HEIGHT_MM}mm cards, 5×2 grid, 1.7mm margins, 3.4/3.0mm gaps, crop marks with 1mm offset
                </div>
              )}
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
                  <label style={labelStyle}>Card Gap (H)</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="range" min={0} max={30} step={1}
                      value={gapMm}
                      onChange={e => setGapMm(Number(e.target.value))}
                      style={{ flex: 1, accentColor: "#3b82f6" }}
                    />
                    <span style={valueTagStyle}>{gapMm}mm</span>
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Card Gap (V)</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="range" min={0} max={40} step={1}
                      value={gapVMm}
                      onChange={e => setGapVMm(Number(e.target.value))}
                      style={{ flex: 1, accentColor: "#3b82f6" }}
                    />
                    <span style={valueTagStyle}>{gapVMm}mm</span>
                  </div>
                </div>
              </div>
            </SettingsSection>

            {/* ID-Card Position (like old ID-Maker software) */}
            <SettingsSection title="📍 ID-Card Position" subtitle="Set exact starting position of cards on the page (in mm)">
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={useCustomPosition}
                    onChange={(e) => setUseCustomPosition(e.target.checked)}
                    style={{ accentColor: "#3b82f6", width: 16, height: 16 }}
                  />
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>Use Custom Position</span>
                </label>
                {!useCustomPosition && (
                  <span style={{ fontSize: 11, color: "#94a3b8", fontStyle: "italic" }}>Auto-centered</span>
                )}
              </div>

              {useCustomPosition && (
                <div style={{ background: "#f8fafc", borderRadius: 10, padding: 14, border: "1px solid #e2e8f0" }}>
                  {/* Horizontal */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 8 }}>Horizontal</div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4 }}>1st Card Position</label>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <input
                            type="number"
                            min={0}
                            max={pageW}
                            step={0.5}
                            value={cardPosX}
                            onChange={(e) => setCardPosX(Number(e.target.value))}
                            style={{
                              width: 70, height: 32, padding: "0 8px", border: "1.5px solid #cbd5e1",
                              borderRadius: 8, fontSize: 13, fontWeight: 600, textAlign: "center",
                            }}
                          />
                          <span style={{ fontSize: 11, color: "#94a3b8" }}>(in mm)</span>
                        </div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4 }}>2nd Position (Card Width)</label>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <input
                            type="number"
                            value={cardW}
                            readOnly
                            style={{
                              width: 70, height: 32, padding: "0 8px", border: "1.5px solid #e2e8f0",
                              borderRadius: 8, fontSize: 13, fontWeight: 600, textAlign: "center",
                              background: "#f1f5f9", color: "#64748b",
                            }}
                          />
                          <span style={{ fontSize: 11, color: "#94a3b8" }}>(in mm)</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Vertical */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 8 }}>Vertical</div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4 }}>1st Card Position</label>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <input
                            type="number"
                            min={0}
                            max={pageH}
                            step={0.5}
                            value={cardPosY}
                            onChange={(e) => setCardPosY(Number(e.target.value))}
                            style={{
                              width: 70, height: 32, padding: "0 8px", border: "1.5px solid #cbd5e1",
                              borderRadius: 8, fontSize: 13, fontWeight: 600, textAlign: "center",
                            }}
                          />
                          <span style={{ fontSize: 11, color: "#94a3b8" }}>(in mm)</span>
                        </div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4 }}>2nd Position (Card Height)</label>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <input
                            type="number"
                            value={cardH}
                            readOnly
                            style={{
                              width: 70, height: 32, padding: "0 8px", border: "1.5px solid #e2e8f0",
                              borderRadius: 8, fontSize: 13, fontWeight: 600, textAlign: "center",
                              background: "#f1f5f9", color: "#64748b",
                            }}
                          />
                          <span style={{ fontSize: 11, color: "#94a3b8" }}>(in mm)</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>
                Start: X={layout.startX.toFixed(1)}mm, Y={layout.startY.toFixed(1)}mm
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
          <div className={`pdf-preview-panel ${isMobile && mobileTab !== "preview" ? "pdf-panel-hidden" : ""}`} style={{ flex: "1 1 300px", minWidth: 260, display: "flex", flexDirection: "column", gap: 16 }}>
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
              images are at least <strong>{Math.round((CUTTER_WIDTH_MM * 300) / 25.4)}×{Math.round((CUTTER_HEIGHT_MM * 300) / 25.4)} pixels</strong> (300 DPI at {CUTTER_WIDTH_MM}×{CUTTER_HEIGHT_MM}mm).
              Higher resolution source images = sharper printed cards.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pdf-modal-footer" style={{
          padding: "16px 24px",
          borderTop: "1px solid #f1f5f9",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#fafbfc",
          flexWrap: "wrap",
          gap: 12,
        }}>
          <div style={{ fontSize: 12, color: pvcMode ? "#166534" : "#94a3b8" }}>
            {pvcMode ? "🪪 PVC · " : ""}{cards.length} cards → {layout.totalPages} page(s) at {layout.cols}×{layout.rows} grid
            {pvcMode && ` · ${CUTTER_WIDTH_MM}×${CUTTER_HEIGHT_MM}mm · 1.7mm margins`}
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
                  : pvcMode
                    ? "linear-gradient(135deg, #16a34a, #15803d)"
                    : "linear-gradient(135deg, #dc2626, #b91c1c)",
                color: "white",
                fontSize: 14,
                fontWeight: 700,
                cursor: generating ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                boxShadow: generating ? "none" : pvcMode
                  ? "0 4px 14px rgba(22,163,74,0.35)"
                  : "0 4px 14px rgba(220,38,38,0.35)",
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
                <>{pvcMode ? "🪪 Download PVC Print" : "📄 Download PDF Print"}</>
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
