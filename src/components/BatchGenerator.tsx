"use client"
import { useState, useCallback } from "react"
import { toast } from "sonner"
import { normalizeKey, resolveFieldValue, FIELD_GROUPS } from "@/lib/field-resolver"
import { PrintDialog, type PrintConfig } from "./IDMakerDialogs"
import { generateDirectPdf } from "@/lib/pdf-layout"

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
}

type StudentRenderData = {
  id: string
  serialNumber: string
  photoUrl: string
  qrCodeUrl: string | null
  className: string
  formData: Record<string, string>
}

type BatchGeneratorProps = {
  schoolId: string
  schoolName: string
  classes: { id: string; name: string; _count: { students: number } }[]
}

// normalizeKey, FIELD_GROUPS, resolveFieldValue imported from @/lib/field-resolver

// ─── Bounded LRU caches (scale-safe for 2000+ students) ───
// Template images (rarely change) — kept across runs.
// Student photos — bounded LRU to prevent unbounded memory growth.
const TEMPLATE_HINT = "/template" // URLs containing this are treated as long-lived
const PHOTO_CACHE_MAX = 80        // recent N student photos kept in memory
const DATA_URL_CACHE_MAX = 40     // recent N data URLs

const imageCache = new Map<string, HTMLImageElement>()
const dataUrlCache = new Map<string, string>()

function lruSet<T>(map: Map<string, T>, key: string, value: T, max: number) {
  if (map.has(key)) map.delete(key)
  map.set(key, value)
  // Evict oldest entries when above limit (preserve template entries)
  while (map.size > max) {
    const oldestKey = map.keys().next().value as string | undefined
    if (!oldestKey) break
    if (oldestKey.includes(TEMPLATE_HINT)) {
      // Move template to the end so it stays
      const v = map.get(oldestKey)!
      map.delete(oldestKey)
      map.set(oldestKey, v)
      // If only templates remain, abort
      if (Array.from(map.keys()).every(k => k.includes(TEMPLATE_HINT))) break
      continue
    }
    map.delete(oldestKey)
  }
}

async function getCachedImage(url: string): Promise<HTMLImageElement | null> {
  const cached = imageCache.get(url)
  if (cached) {
    // Move to end (most-recently-used)
    imageCache.delete(url)
    imageCache.set(url, cached)
    return cached
  }
  try {
    const img = new Image()
    img.crossOrigin = "anonymous"
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject()
      img.src = url
    })
    lruSet(imageCache, url, img, PHOTO_CACHE_MAX)
    return img
  } catch { return null }
}

/** Convert an image URL to a base64 data URL (needed for SVG embedding) */
async function imageToDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url
  const cached = dataUrlCache.get(url)
  if (cached) {
    dataUrlCache.delete(url)
    dataUrlCache.set(url, cached)
    return cached
  }
  const img = await getCachedImage(url)
  if (!img) return url
  const canvas = document.createElement("canvas")
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext("2d")
  if (!ctx) return url
  ctx.drawImage(img, 0, 0)
  const dataUrl = canvas.toDataURL("image/jpeg", 1.0)
  lruSet(dataUrlCache, url, dataUrl, DATA_URL_CACHE_MAX)
  return dataUrl
}

/** Release student-photo cache entries after a batch run to free memory */
function clearStudentImageCache() {
  for (const k of Array.from(imageCache.keys())) {
    if (!k.includes(TEMPLATE_HINT)) imageCache.delete(k)
  }
  for (const k of Array.from(dataUrlCache.keys())) {
    if (!k.includes(TEMPLATE_HINT)) dataUrlCache.delete(k)
  }
}

// ── Print resolution limits ──
const MIN_PRINT_W = 661   // 300 DPI minimum (56mm)

/**
 * Renders an ID card at the 56:88 mm card ratio, using the template's
 * full native resolution for maximum sharpness (minimum 300 DPI).
 *
 * The template is stretched to fill the canvas. Because field positions
 * are stored as percentages, they scale perfectly — no misalignment,
 * no cropping, and jsPDF never needs to resize the image.
 *
 * Output is PNG (lossless) for maximum PVC print quality.
 */
async function renderIdCard(
  templateImageUrl: string,
  fieldMappings: FieldMapping[],
  student: StudentRenderData,
  flagImageUrl?: string,
): Promise<string> {
  const templateImg = await getCachedImage(templateImageUrl)
  if (!templateImg) throw new Error("Failed to load template")

  // Use template's FULL native resolution (min 300 DPI).
  // Preserve the template's native aspect ratio — works for both
  // portrait (56×88) and landscape (88×56) card designs.
  const printW = Math.max(MIN_PRINT_W, templateImg.naturalWidth)
  const templateAspect = templateImg.naturalHeight / templateImg.naturalWidth
  const printH = Math.round(printW * templateAspect)

  const canvas = document.createElement("canvas")
  canvas.width = printW
  canvas.height = printH
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas context failed")

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"

  // Draw template stretched to fill the card canvas.
  // The template IS the card design — stretching to 56:88 is intentional.
  ctx.drawImage(templateImg, 0, 0, printW, printH)

  // Draw all mapped fields
  for (const field of fieldMappings) {
    const fx = (field.x / 100) * printW
    const fy = (field.y / 100) * printH
    const fw = (field.width / 100) * printW
    const fh = (field.height / 100) * printH

    if (field.type === "photo") {
      if (student.photoUrl) {
        const photoImg = await getCachedImage(student.photoUrl)
        if (photoImg) {
          // Contain-fit: show the ENTIRE photo, no cropping
          // This prevents heads/faces from being cut off
          const photoAspect = photoImg.naturalWidth / photoImg.naturalHeight
          const boxAspect = fw / fh
          let dx: number, dy: number, dw: number, dh: number
          if (photoAspect > boxAspect) {
            // Photo is wider than box — fit to width, center vertically
            dw = fw
            dh = fw / photoAspect
            dx = fx
            dy = fy + (fh - dh) / 2
          } else {
            // Photo is taller than box — fit to height, center horizontally
            dh = fh
            dw = fh * photoAspect
            dx = fx + (fw - dw) / 2
            dy = fy
          }
          ctx.drawImage(photoImg, 0, 0, photoImg.naturalWidth, photoImg.naturalHeight, dx, dy, dw, dh)
        }
      }
    } else if (field.type === "flag") {
      if (flagImageUrl) {
        const flagImg = await getCachedImage(flagImageUrl)
        if (flagImg) {
          ctx.drawImage(flagImg, 0, 0, flagImg.naturalWidth, flagImg.naturalHeight, fx, fy, fw, fh)
        }
      }
    } else {
      const pId = field.fieldKey === "photoId" ? "photoid" : field.fieldKey
      const val = resolveFieldValue(student.formData, pId) || 
                  (field.fieldKey === "class" ? student.className : 
                   field.fieldKey === "serialNumber" ? student.serialNumber : "")
      
      const value = String(val || "").trim()
      if (value) {
        const padding = 4
        const maxWidth = fw - padding * 2
        const fontPrefix = field.fontWeight === "bold" ? "bold " : ""
        let fontSize = fh * 0.78
        const minFontSize = Math.max(8, fh * 0.3)
        
        ctx.font = `${fontPrefix}${fontSize}px ${field.fontFamily || "Inter, Arial"}`
        let textWidth = ctx.measureText(value).width
        while (textWidth > maxWidth && fontSize > minFontSize) {
          fontSize -= 0.5
          ctx.font = `${fontPrefix}${fontSize}px ${field.fontFamily || "Inter, Arial"}`
          textWidth = ctx.measureText(value).width
        }

        ctx.fillStyle = field.fontColor || "#0f172a"
        const align = field.textAlign || "left"
        ctx.textAlign = align
        ctx.textBaseline = "middle"
        ctx.save()
        ctx.beginPath()
        ctx.rect(fx, fy, fw, fh)
        ctx.clip()
        const textX = align === "center" ? fx + fw / 2 : align === "right" ? fx + fw - padding : fx + padding
        ctx.fillText(value, textX, fy + fh / 2)
        ctx.restore()
      }
    }
  }

  // PNG lossless — maximum quality for PVC card printing
  return canvas.toDataURL("image/png")
}

/**
 * Render an ID card as SVG markup.
 * Text stays as vector <text> elements (editable in CorelDRAW).
 * Images are embedded as base64 for self-contained SVG files.
 */
async function renderIdCardSvg(
  templateImageUrl: string,
  fieldMappings: FieldMapping[],
  student: StudentRenderData,
  flagImageUrl?: string,
): Promise<string> {
  const templateImg = await getCachedImage(templateImageUrl)
  if (!templateImg) throw new Error("Failed to load template")

  const w = templateImg.naturalWidth
  const h = templateImg.naturalHeight

  // Convert template to data URL for embedding
  const templateDataUrl = await imageToDataUrl(templateImageUrl)

  const lines: string[] = []
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`)
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`)
  // Template background
  lines.push(`  <image href="${templateDataUrl}" x="0" y="0" width="${w}" height="${h}" />`)

  for (const field of fieldMappings) {
    const fx = (field.x / 100) * w
    const fy = (field.y / 100) * h
    const fw = (field.width / 100) * w
    const fh = (field.height / 100) * h

    if (field.type === "photo") {
      if (student.photoUrl) {
        const photoDataUrl = await imageToDataUrl(student.photoUrl)
        // clipPath for aspect-ratio crop
        const clipId = `clip-${field.id}`
        lines.push(`  <defs><clipPath id="${clipId}"><rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" /></clipPath></defs>`)
        lines.push(`  <image href="${photoDataUrl}" x="${fx}" y="${fy}" width="${fw}" height="${fh}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})" />`)
      }
    } else if (field.type === "flag") {
      if (flagImageUrl) {
        const flagDataUrl = await imageToDataUrl(flagImageUrl)
        lines.push(`  <image href="${flagDataUrl}" x="${fx}" y="${fy}" width="${fw}" height="${fh}" preserveAspectRatio="xMidYMid meet" />`)
      }
    } else {
      const pId = field.fieldKey === "photoId" ? "photoid" : field.fieldKey
      const val = resolveFieldValue(student.formData, pId) ||
                  (field.fieldKey === "class" ? student.className :
                   field.fieldKey === "serialNumber" ? student.serialNumber : "")
      const value = String(val || "").trim()
      if (value) {
        let fontSize = Math.round(fh * 0.78)
        const textAnchor = field.textAlign === "center" ? "middle" : field.textAlign === "right" ? "end" : "start"
        const padding = 4
        const textX = field.textAlign === "center" ? fx + fw / 2 : field.textAlign === "right" ? fx + fw - padding : fx + padding
        const textY = fy + fh / 2
        const fontWeight = field.fontWeight || "normal"
        const fontFamily = field.fontFamily || "Arial"
        const fill = field.fontColor || "#0f172a"
        const escaped = value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
        // Auto-fit when "wrap" mode is enabled — measure with a canvas and shrink
        // the font-size so the full string always fits inside the box.
        if ((field as any).textWrap === "wrap") {
          const maxWidth = Math.max(1, fw - padding * 2)
          const measureCanvas = document.createElement("canvas")
          const mctx = measureCanvas.getContext("2d")
          if (mctx) {
            const fontPrefix = fontWeight === "bold" ? "bold " : ""
            mctx.font = `${fontPrefix}${fontSize}px ${fontFamily}`
            let w = mctx.measureText(value).width
            const minFs = Math.max(8, fh * 0.3)
            while (w > maxWidth && fontSize > minFs) {
              fontSize -= 0.5
              mctx.font = `${fontPrefix}${fontSize}px ${fontFamily}`
              w = mctx.measureText(value).width
            }
          }
        }
        lines.push(`  <text x="${textX.toFixed(1)}" y="${textY.toFixed(1)}" font-family="${fontFamily}" font-size="${fontSize}" fill="${fill}" font-weight="${fontWeight}" text-anchor="${textAnchor}" dominant-baseline="central">${escaped}</text>`)
      }
    }
  }

  lines.push(`</svg>`)
  return lines.join("\n")
}

/**
 * VBScript that uses CorelDRAW COM automation to batch-convert
 * all SVG files in the same folder to .cdr format.
 * The user double-clicks this .vbs file on their Windows PC
 * (CorelDRAW must be installed).
 */
function generateCdrConverterScript(): string {
  return `' ===================================================================
' Convert SVG to CDR - CorelDRAW Batch Converter
' ===================================================================
' HOW TO USE:
'   1. Extract the ZIP file to a folder
'   2. Double-click this file (convert_to_cdr.vbs)
'   3. CorelDRAW will open and convert all SVG files to .cdr
'   4. CDR files will be saved in the same folder
' ===================================================================
' REQUIREMENT: CorelDRAW must be installed on this computer
' ===================================================================

Option Explicit

Dim fso, folder, file, corelApp, doc, svgFolder, cdrPath, count, totalFiles

Set fso = CreateObject("Scripting.FileSystemObject")
svgFolder = fso.GetParentFolderName(WScript.ScriptFullName)

' Count SVG files first
totalFiles = 0
Set folder = fso.GetFolder(svgFolder)
For Each file In folder.Files
    If LCase(fso.GetExtensionName(file.Name)) = "svg" Then
        totalFiles = totalFiles + 1
    End If
Next

If totalFiles = 0 Then
    MsgBox "No SVG files found in this folder." & vbCrLf & vbCrLf & "Make sure the SVG files are in the same folder as this script.", vbExclamation, "No Files Found"
    WScript.Quit
End If

Dim result
result = MsgBox("Found " & totalFiles & " SVG file(s) to convert." & vbCrLf & vbCrLf & "CorelDRAW will open and convert each file to CDR format." & vbCrLf & "This may take a few minutes." & vbCrLf & vbCrLf & "Continue?", vbYesNo + vbQuestion, "SVG to CDR Converter")
If result <> vbYes Then WScript.Quit

' Start CorelDRAW
On Error Resume Next
Set corelApp = CreateObject("CorelDRAW.Application")
If Err.Number <> 0 Then
    Err.Clear
    ' Try different versions
    Set corelApp = CreateObject("CorelDRAW.Application.24")
    If Err.Number <> 0 Then
        Err.Clear
        Set corelApp = CreateObject("CorelDRAW.Application.23")
        If Err.Number <> 0 Then
            MsgBox "CorelDRAW is not installed or could not be started." & vbCrLf & vbCrLf & "Please install CorelDRAW and try again.", vbCritical, "CorelDRAW Not Found"
            WScript.Quit
        End If
    End If
End If
On Error GoTo 0

corelApp.Visible = True
count = 0

Set folder = fso.GetFolder(svgFolder)
For Each file In folder.Files
    If LCase(fso.GetExtensionName(file.Name)) = "svg" Then
        On Error Resume Next
        Set doc = corelApp.OpenDocument(file.Path)
        If Err.Number = 0 And Not doc Is Nothing Then
            cdrPath = fso.BuildPath(svgFolder, fso.GetBaseName(file.Name) & ".cdr")
            doc.SaveAs cdrPath
            doc.Close
            count = count + 1
        Else
            Err.Clear
        End If
        On Error GoTo 0
    End If
Next

MsgBox count & " of " & totalFiles & " SVG files converted to CDR successfully!" & vbCrLf & vbCrLf & "CDR files saved in:" & vbCrLf & svgFolder, vbInformation, "Conversion Complete"
`
}

async function downloadAsZip(
  cards: { name: string; dataUrl: string }[],
  zipName: string
) {
  const { default: JSZip } = await import("jszip")
  const zip = new JSZip()
  for (const card of cards) {
    const base64 = card.dataUrl.split(",")[1]
    if (base64) {
      zip.file(card.name, base64, { base64: true })
    }
  }
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = zipName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

/** Download SVG files + VBScript converter as a ZIP for CDR conversion */
async function downloadAsCdrZip(
  svgCards: { name: string; svgContent: string }[],
  zipName: string
) {
  const { default: JSZip } = await import("jszip")
  const zip = new JSZip()
  for (const card of svgCards) {
    zip.file(card.name, card.svgContent)
  }
  // Include the CorelDRAW converter script
  zip.file("convert_to_cdr.vbs", generateCdrConverterScript())
  // Include a README
  zip.file("README.txt", [
    "ID Cards - SVG to CDR Conversion",
    "================================",
    "",
    "This ZIP contains SVG files of ID cards with vector text.",
    "",
    "To convert to CDR (CorelDRAW) format:",
    "  1. Extract all files to a folder",
    "  2. Double-click 'convert_to_cdr.vbs'",
    "  3. CorelDRAW will auto-convert all SVGs to .cdr files",
    "",
    "Requirements: CorelDRAW must be installed on this PC.",
    "",
    "You can also open the SVG files directly in CorelDRAW",
    "by using File > Import or dragging them into CorelDRAW.",
  ].join("\r\n"))
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = zipName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

type OutputFormat = "JPEG" | "CDR" | "PDF_PRINT" | "BMP"

/**
 * Convert a PNG/JPEG data URL to a 24-bit BMP data URL.
 * BMP format: DIB header (BITMAPINFOHEADER) + pixel data (BGR, bottom-up).
 */
function dataUrlToBmp(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const w = img.naturalWidth
      const h = img.naturalHeight
      const canvas = document.createElement("canvas")
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext("2d")
      if (!ctx) return reject(new Error("No canvas ctx"))
      ctx.drawImage(img, 0, 0)
      const imageData = ctx.getImageData(0, 0, w, h)
      const pixels = imageData.data // RGBA, top-down

      // Row size must be multiple of 4 bytes (24bpp = 3 bytes/pixel)
      const rowSize = Math.ceil((w * 3) / 4) * 4
      const pixelDataSize = rowSize * h
      const fileSize = 54 + pixelDataSize // BMP header (14) + DIB header (40) + pixel data

      const buffer = new ArrayBuffer(fileSize)
      const view = new DataView(buffer)

      // BMP file header
      view.setUint8(0, 0x42) // 'B'
      view.setUint8(1, 0x4D) // 'M'
      view.setUint32(2, fileSize, true)   // file size
      view.setUint32(6, 0, true)          // reserved
      view.setUint32(10, 54, true)        // pixel data offset

      // DIB header (BITMAPINFOHEADER)
      view.setUint32(14, 40, true)        // header size
      view.setInt32(18, w, true)          // width
      view.setInt32(22, h, true)          // height (positive = bottom-up)
      view.setUint16(26, 1, true)         // color planes
      view.setUint16(28, 24, true)        // bits per pixel
      view.setUint32(30, 0, true)         // no compression
      view.setUint32(34, pixelDataSize, true)
      view.setInt32(38, 2835, true)       // X pixels per meter (~72 DPI)
      view.setInt32(42, 2835, true)       // Y pixels per meter
      view.setUint32(46, 0, true)         // colors in table
      view.setUint32(50, 0, true)         // important colors

      // Pixel data — BMP stores rows bottom-up, BGR order
      let offset = 54
      for (let row = h - 1; row >= 0; row--) {
        for (let col = 0; col < w; col++) {
          const i = (row * w + col) * 4
          view.setUint8(offset++, pixels[i + 2]) // B
          view.setUint8(offset++, pixels[i + 1]) // G
          view.setUint8(offset++, pixels[i + 0]) // R
        }
        // Padding to align row to 4 bytes
        for (let p = 0; p < rowSize - w * 3; p++) view.setUint8(offset++, 0)
      }

      const blob = new Blob([buffer], { type: "image/bmp" })
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    }
    img.onerror = reject
    img.src = dataUrl
  })
}

/** Prompt user to pick a folder (via <input webkitdirectory>) and save BMP files into it */
async function saveBmpFilesToFolder(
  cards: { serialNumber: string; frontDataUrl: string; backDataUrl?: string }[],
  onProgress: (current: number, total: number) => void,
): Promise<void> {
  // Use the File System Access API if available (Chromium/Electron)
  if ((window as any).showDirectoryPicker) {
    let dirHandle: FileSystemDirectoryHandle
    try {
      dirHandle = await (window as any).showDirectoryPicker()
    } catch {
      return // user cancelled
    }
    let done = 0
    const total = cards.reduce((acc, c) => acc + 1 + (c.backDataUrl ? 1 : 0), 0)
    for (const card of cards) {
      const frontBmp = await dataUrlToBmp(card.frontDataUrl)
      const frontBase64 = frontBmp.split(",")[1]
      const frontBytes = Uint8Array.from(atob(frontBase64), c => c.charCodeAt(0))
      const frontFile = await dirHandle.getFileHandle(`${card.serialNumber}_front.bmp`, { create: true })
      const frontWritable = await (frontFile as any).createWritable()
      await frontWritable.write(frontBytes)
      await frontWritable.close()
      done++
      onProgress(done, total)

      if (card.backDataUrl) {
        const backBmp = await dataUrlToBmp(card.backDataUrl)
        const backBase64 = backBmp.split(",")[1]
        const backBytes = Uint8Array.from(atob(backBase64), c => c.charCodeAt(0))
        const backFile = await dirHandle.getFileHandle(`${card.serialNumber}_back.bmp`, { create: true })
        const backWritable = await (backFile as any).createWritable()
        await backWritable.write(backBytes)
        await backWritable.close()
        done++
        onProgress(done, total)
      }
    }
  } else {
    // Fallback: download BMP files one by one as individual downloads
    const { default: JSZip } = await import("jszip")
    const zip = new JSZip()
    let done = 0
    const total = cards.reduce((acc, c) => acc + 1 + (c.backDataUrl ? 1 : 0), 0)
    for (const card of cards) {
      const frontBmp = await dataUrlToBmp(card.frontDataUrl)
      zip.file(`${card.serialNumber}_front.bmp`, frontBmp.split(",")[1], { base64: true })
      done++
      onProgress(done, total)
      if (card.backDataUrl) {
        const backBmp = await dataUrlToBmp(card.backDataUrl)
        zip.file(`${card.serialNumber}_back.bmp`, backBmp.split(",")[1], { base64: true })
        done++
        onProgress(done, total)
      }
    }
    const blob = await zip.generateAsync({ type: "blob" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = "IDCards-BMP.zip"
    a.click()
    URL.revokeObjectURL(a.href)
  }
}

export default function BatchGenerator({ schoolId, schoolName, classes }: BatchGeneratorProps) {
  const [selectedClassId, setSelectedClassId] = useState("")
  const [statusFilter, setStatusFilter] = useState("APPROVED")
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("JPEG")
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, status: "" })
  const [previewCards, setPreviewCards] = useState<{ serialNumber: string; frontDataUrl: string; backDataUrl?: string }[]>([])
  const [pdfPrintCards, setPdfPrintCards] = useState<{ serialNumber: string; frontDataUrl: string; backDataUrl?: string }[]>([])
  const [lastCardDims, setLastCardDims] = useState({ w: 85.6, h: 54 })
  const [showPrintDialog, setShowPrintDialog] = useState(false)
  const [printConfig, setPrintConfig] = useState<PrintConfig>({
    paper: "A4 Horizontal", paperWidth: 297, paperHeight: 210,
    h1stPosition: 0, h2ndPosition: 0, v1stPosition: 0, v2ndPosition: 0,
  })

  const handleGenerate = useCallback(async () => {
    setGenerating(true)
    setProgress({ current: 0, total: 0, status: "Preparing data..." })
    setPreviewCards([])

    try {
      const params = new URLSearchParams({ status: statusFilter })
      if (selectedClassId) params.set("classId", selectedClassId)

      const res = await fetch(`/api/schools/${schoolId}/generate?${params}`)
      const data = await res.json()

      if (!res.ok || !data.success) {
        toast.error(data.error || "Failed to fetch data")
        setGenerating(false)
        return
      }

      const { templateImageUrl, fieldMappings, backTemplateImageUrl, backFieldMappings, hasBackSide, students, totalCount, cardWidthMm, cardHeightMm } = data.data
      
      if (!templateImageUrl) {
        toast.error("No template image configured. Please upload a template first.")
        setGenerating(false)
        return
      }

      setProgress({ current: 0, total: totalCount, status: "Rendering front side..." })

      // Fetch flag images for this school (if any flag field exists in mappings)
      let flagImagesMap: Record<string, string> = {}
      const hasFlagField = fieldMappings.some((f: any) => f.type === "flag") ||
                           (backFieldMappings || []).some((f: any) => f.type === "flag")
      if (hasFlagField) {
        try {
          const flagRes = await fetch(`/api/schools/${schoolId}/flags`)
          const flagData = await flagRes.json()
          if (flagData.success) {
            for (const f of flagData.data.flags || []) {
              if (f.color && f.imageUrl) flagImagesMap[f.color] = f.imageUrl
            }
          }
        } catch {}
      }

      // Helper to resolve flag URL for a student
      const getFlagUrl = (student: any): string | undefined => {
        if (!hasFlagField) return undefined
        const fd = student.formData as Record<string, string>
        const color = fd?.flagColor || fd?.["Flag Color"] || fd?.["house"] || fd?.["House"] || fd?.["colour"] || fd?.["Colour"] || ""
        return color ? flagImagesMap[color] : undefined
      }

      // Pre-load template images
      await getCachedImage(templateImageUrl)
      if (hasBackSide && backTemplateImageUrl) {
        await getCachedImage(backTemplateImageUrl)
      }

      // ──── CDR (SVG) PATH ────
      // ──── PDF PRINT PATH ────
      if (outputFormat === "PDF_PRINT") {
        const allCards: typeof pdfPrintCards = []
        const CHUNK_SIZE = 4

        for (let i = 0; i < students.length; i += CHUNK_SIZE) {
          const chunk = students.slice(i, i + CHUNK_SIZE)
          const promises = chunk.map(async (student: any) => {
            try {
              // Renders at fixed 661×1039 (300 DPI, 56×88mm) as JPEG
              const frontDataUrl = await renderIdCard(templateImageUrl, fieldMappings, student, getFlagUrl(student))
              let backDataUrl: string | undefined
              if (hasBackSide && backTemplateImageUrl && backFieldMappings?.length > 0) {
                backDataUrl = await renderIdCard(backTemplateImageUrl, backFieldMappings, student, getFlagUrl(student))
              }
              return { serialNumber: student.serialNumber, frontDataUrl, backDataUrl }
            } catch (err) {
              console.error(`Error rendering ${student.serialNumber}`, err)
              return null
            }
          })

          const results = await Promise.all(promises)
          results.forEach(c => { if (c) allCards.push(c) })

          const currentProgress = Math.min(i + CHUNK_SIZE, totalCount)
          setProgress({ current: currentProgress, total: totalCount, status: `Rendered ${currentProgress}/${totalCount} cards (high quality)...` })
          await new Promise(r => setTimeout(r, 0))
        }

        setPreviewCards(allCards.slice(0, 8))
        setPdfPrintCards(allCards)
        setProgress({ current: totalCount, total: totalCount, status: "Done! Generating PDF..." })

        // Mark as printed
        const studentIds = students.map((s: any) => s.id)
        await fetch(`/api/schools/${schoolId}/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ studentIds }),
        })

        // Generate PDF directly using Print Setup values — no modal
        const cw = printConfig.h2ndPosition > 0 ? printConfig.h2ndPosition : cardWidthMm || 85.6
        const ch = printConfig.v2ndPosition > 0 ? printConfig.v2ndPosition : cardHeightMm || 54
        setLastCardDims({ w: cw, h: ch })
        await generateDirectPdf({
          cards: allCards,
          schoolName,
          paperWidth: printConfig.paperWidth,
          paperHeight: printConfig.paperHeight,
          cardWidth: cw,
          cardHeight: ch,
          h1stPosition: printConfig.h1stPosition,
          v1stPosition: printConfig.v1stPosition,
        })
        setProgress({ current: totalCount, total: totalCount, status: "PDF downloaded! ✅" })

      // ──── CDR (SVG) PATH ────
      } else if (outputFormat === "CDR") {
        // Pre-convert template images to data URLs for SVG embedding
        setProgress({ current: 0, total: totalCount, status: "Preparing templates for SVG..." })
        await imageToDataUrl(templateImageUrl)
        if (hasBackSide && backTemplateImageUrl) {
          await imageToDataUrl(backTemplateImageUrl)
        }
        const svgCards: { name: string; svgContent: string }[] = []
        const previewData: typeof previewCards = []
        const studentIds: string[] = []
        const CHUNK_SIZE = 2 // SVG generation is heavier due to base64 embedding

        for (let i = 0; i < students.length; i += CHUNK_SIZE) {
          const chunk = students.slice(i, i + CHUNK_SIZE)
          for (const student of chunk) {
            try {
              const frontSvg = await renderIdCardSvg(templateImageUrl, fieldMappings, student, getFlagUrl(student))
              svgCards.push({ name: `${student.serialNumber}_front.svg`, svgContent: frontSvg })
              studentIds.push(student.id)

              if (hasBackSide && backTemplateImageUrl && backFieldMappings?.length > 0) {
                const backSvg = await renderIdCardSvg(backTemplateImageUrl, backFieldMappings, student, getFlagUrl(student))
                svgCards.push({ name: `${student.serialNumber}_back.svg`, svgContent: backSvg })
              }

              // Render JPEG preview for the first 8 (for on-screen display)
              if (previewData.length < 8) {
                const previewFront = await renderIdCard(templateImageUrl, fieldMappings, student, getFlagUrl(student))
                let previewBack: string | undefined
                if (hasBackSide && backTemplateImageUrl && backFieldMappings?.length > 0) {
                  previewBack = await renderIdCard(backTemplateImageUrl, backFieldMappings, student, getFlagUrl(student))
                }
                previewData.push({ serialNumber: student.serialNumber, frontDataUrl: previewFront, backDataUrl: previewBack })
              }
            } catch (err) {
              console.error(`Error rendering SVG for ${student.serialNumber}`, err)
            }
          }

          const currentProgress = Math.min(i + CHUNK_SIZE, totalCount)
          setProgress({ current: currentProgress, total: totalCount, status: `Generated ${currentProgress}/${totalCount} SVG cards...` })
          await new Promise(r => setTimeout(r, 0))
        }

        setPreviewCards(previewData)
        setProgress({ current: totalCount, total: totalCount, status: "Creating CDR ZIP..." })

        const className = classes.find((c) => c.id === selectedClassId)?.name || "All"
        await downloadAsCdrZip(svgCards, `${schoolName}-${className}-IDCards-CDR.zip`)

        // Mark as printed
        await fetch(`/api/schools/${schoolId}/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ studentIds }),
        })

        setProgress({ current: totalCount, total: totalCount, status: "Done! ✅" })
        toast.success(`${svgCards.length} SVG files + CorelDRAW converter script exported!`)

      // ──── BMP PATH ────
      } else if (outputFormat === "BMP") {
        const renderedCards: { serialNumber: string; frontDataUrl: string; backDataUrl?: string; id: string }[] = []
        const CHUNK_SIZE = 4

        for (let i = 0; i < students.length; i += CHUNK_SIZE) {
          const chunk = students.slice(i, i + CHUNK_SIZE)
          const promises = chunk.map(async (student: any) => {
            try {
              const frontDataUrl = await renderIdCard(templateImageUrl, fieldMappings, student, getFlagUrl(student))
              let backDataUrl: string | undefined
              if (hasBackSide && backTemplateImageUrl && backFieldMappings?.length > 0) {
                backDataUrl = await renderIdCard(backTemplateImageUrl, backFieldMappings, student, getFlagUrl(student))
              }
              return { serialNumber: student.serialNumber, frontDataUrl, backDataUrl, id: student.id }
            } catch (err) {
              console.error(`Error rendering ${student.serialNumber}`, err)
              return null
            }
          })
          const results = await Promise.all(promises)
          results.forEach(c => { if (c) renderedCards.push(c) })
          const currentProgress = Math.min(i + CHUNK_SIZE, totalCount)
          setProgress({ current: currentProgress, total: totalCount, status: `Rendered ${currentProgress}/${totalCount} cards...` })
          await new Promise(r => setTimeout(r, 0))
        }

        setPreviewCards(renderedCards.slice(0, 8).map(c => ({
          serialNumber: c.serialNumber,
          frontDataUrl: c.frontDataUrl,
          backDataUrl: c.backDataUrl,
        })))

        setProgress({ current: 0, total: renderedCards.length, status: "Converting to BMP & saving..." })
        await saveBmpFilesToFolder(renderedCards, (done, total) => {
          setProgress({ current: done, total, status: `Saving BMP ${done}/${total}...` })
        })

        const studentIds = renderedCards.map(c => c.id)
        await fetch(`/api/schools/${schoolId}/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ studentIds }),
        })

        setProgress({ current: renderedCards.length, total: renderedCards.length, status: "Done! ✅" })
        toast.success(`${renderedCards.length} ID cards saved as BMP files!`)

      // ──── JPEG PATH (existing) ────
      } else {
        const renderedCards: { name: string; dataUrl: string; id: string; serialNumber: string; frontDataUrl: string; backDataUrl?: string }[] = []
        const CHUNK_SIZE = 4

        for (let i = 0; i < students.length; i += CHUNK_SIZE) {
          const chunk = students.slice(i, i + CHUNK_SIZE)
          const promises = chunk.map(async (student: any) => {
            try {
              const frontDataUrl = await renderIdCard(templateImageUrl, fieldMappings, student, getFlagUrl(student))
              let backDataUrl: string | undefined
              if (hasBackSide && backTemplateImageUrl && backFieldMappings?.length > 0) {
                backDataUrl = await renderIdCard(backTemplateImageUrl, backFieldMappings, student, getFlagUrl(student))
              }
              return {
                name: `${student.serialNumber}_front.jpg`,
                dataUrl: frontDataUrl,
                id: student.id,
                serialNumber: student.serialNumber,
                frontDataUrl,
                backDataUrl,
              }
            } catch (err) {
              console.error(`Error rendering ${student.serialNumber}`, err)
              return null
            }
          })

          const results = await Promise.all(promises)
          results.forEach(c => { if(c) renderedCards.push(c) })

          const currentProgress = Math.min(i + CHUNK_SIZE, totalCount)
          setProgress({ current: currentProgress, total: totalCount, status: `Generated ${currentProgress}/${totalCount} cards...` })
          await new Promise(r => setTimeout(r, 0))
        }

        setPreviewCards(renderedCards.slice(0, 8).map(c => ({
          serialNumber: c.serialNumber,
          frontDataUrl: c.frontDataUrl,
          backDataUrl: c.backDataUrl,
        })))

        setProgress({ current: totalCount, total: totalCount, status: "Creating ZIP file..." })
        
        const zipCards: { name: string; dataUrl: string }[] = []
        for (const card of renderedCards) {
          zipCards.push({ name: `${card.serialNumber}_front.jpg`, dataUrl: card.frontDataUrl })
          if (card.backDataUrl) {
            zipCards.push({ name: `${card.serialNumber}_back.jpg`, dataUrl: card.backDataUrl })
          }
        }

        const className = classes.find((c) => c.id === selectedClassId)?.name || "All"
        await downloadAsZip(zipCards, `${schoolName}-${className}-IDCards.zip`)

        const studentIds = renderedCards.map((c) => c.id)
        await fetch(`/api/schools/${schoolId}/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ studentIds }),
        })

        setProgress({ current: totalCount, total: totalCount, status: "Done! ✅" })
        toast.success(`${renderedCards.length} ID cards exported! (${zipCards.length} images in ZIP)`)
      }
    } catch (err: any) {
      console.error(err)
      toast.error("Generation failed: " + (err?.message || "Unknown error"))
    } finally {
      setGenerating(false)
      // Release student photo cache to prevent memory build-up across runs
      clearStudentImageCache()
    }
  }, [schoolId, schoolName, selectedClassId, statusFilter, outputFormat, classes])

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Controls */}
      <div
        style={{
          background: "white",
          borderRadius: 16,
          border: "1px solid #e2e8f0",
          padding: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "linear-gradient(135deg, #22c55e, #16a34a)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
            }}
          >
            🖨️
          </div>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", marginBottom: 2 }}>
              Generate & Download ID Cards
            </h3>
            <p style={{ fontSize: 13, color: "#94a3b8" }}>
              Render print-quality ID cards and download as ZIP (manufacturer only)
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
          <div style={{ flex: "1 1 200px" }}>
            <label
              style={{ fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 6, display: "block" }}
            >
              Select Class
            </label>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              style={{
                width: "100%",
                height: 42,
                padding: "0 12px",
                border: "1.5px solid #e2e8f0",
                borderRadius: 10,
                fontSize: 14,
              }}
            >
              <option value="">All Classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c._count.students} students)
                </option>
              ))}
            </select>
          </div>

          <div style={{ flex: "1 1 160px" }}>
            <label
              style={{ fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 6, display: "block" }}
            >
              Student Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                width: "100%",
                height: 42,
                padding: "0 12px",
                border: "1.5px solid #e2e8f0",
                borderRadius: 10,
                fontSize: 14,
              }}
            >
              <option value="APPROVED">Approved Only</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="PRINTED">Already Printed</option>
            </select>
          </div>

          <div style={{ flex: "1 1 160px" }}>
            <label
              style={{ fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 6, display: "block" }}
            >
              Output Format
            </label>
            <select
              value={outputFormat}
              onChange={(e) => setOutputFormat(e.target.value as OutputFormat)}
              style={{
                width: "100%",
                height: 42,
                padding: "0 12px",
                border: outputFormat === "CDR" ? "1.5px solid #8b5cf6" : outputFormat === "PDF_PRINT" ? "1.5px solid #fca5a5" : outputFormat === "BMP" ? "1.5px solid #86efac" : "1.5px solid #e2e8f0",
                borderRadius: 10,
                fontSize: 14,
                background: outputFormat === "CDR" ? "#f5f3ff" : outputFormat === "PDF_PRINT" ? "#fef2f2" : outputFormat === "BMP" ? "#f0fdf4" : "white",
              }}
            >
              <option value="JPEG">📷 JPEG (Print-Ready Images)</option>
              <option value="CDR">📐 CDR (CorelDRAW Vector)</option>
              <option value="PDF_PRINT">📄 PDF Print (Best for Printing)</option>
              <option value="BMP">🖼️ BMP (Save Locally per Person)</option>
            </select>
          </div>
        </div>

        {/* CDR format info banner */}
        {outputFormat === "CDR" && (
          <div style={{
            background: "linear-gradient(135deg, #f5f3ff, #ede9fe)",
            borderRadius: 10,
            padding: 14,
            marginBottom: 16,
            border: "1px solid #c4b5fd",
            fontSize: 12,
            color: "#5b21b6",
            lineHeight: 1.5,
          }}>
            <strong>📐 CDR Export:</strong> Downloads SVG files with vector text + a one-click
            <strong> convert_to_cdr.vbs</strong> script. Double-click the script and CorelDRAW
            will automatically convert all SVGs to .cdr files.
          </div>
        )}

        {/* BMP format info banner */}
        {outputFormat === "BMP" && (
          <div style={{
            background: "linear-gradient(135deg, #f0fdf4, #dcfce7)",
            borderRadius: 10,
            padding: 14,
            marginBottom: 16,
            border: "1px solid #86efac",
            fontSize: 12,
            color: "#14532d",
            lineHeight: 1.5,
          }}>
            <strong>🖼️ BMP Save — Save Locally per Person:</strong> Renders each ID card and saves individual
            <strong> .bmp files</strong> to a folder you choose on your computer. Each file is named
            by the student&apos;s serial number. Requires a modern browser (Chrome/Edge/Electron).
            On unsupported browsers, downloads a ZIP of BMP files instead.
          </div>
        )}

        {/* PDF Print format info banner */}
        {outputFormat === "PDF_PRINT" && (
          <div style={{
            background: "linear-gradient(135deg, #fef2f2, #fee2e2)",
            borderRadius: 10,
            padding: 14,
            marginBottom: 16,
            border: "1px solid #fca5a5",
            fontSize: 12,
            color: "#991b1b",
            lineHeight: 1.5,
          }}>
            <strong>📄 PDF Print — Best for Printing:</strong> Generates a high-quality PDF with
            multiple ID cards per page. You can choose page size (A4, Letter, etc.), customize
            card dimensions, add cut marks, and configure layout — all with <strong>zero quality loss</strong>.
            Just like Canva&apos;s &ldquo;PDF Print&rdquo; option.
          </div>
        )}

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginTop: 16 }}>
          <button
            className="btn btn-outline"
            onClick={() => setShowPrintDialog(true)}
            style={{
              padding: "13px 24px",
              fontSize: 14,
              minHeight: 48,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              flex: "0 1 220px",
            }}
          >
            🖨️ Print Setup...
          </button>

          <button
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={generating}
            style={{
              padding: "13px 28px",
              fontSize: 15,
              minHeight: 48,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              flex: "1 1 280px",
              maxWidth: 380,
              background: outputFormat === "CDR"
                ? "linear-gradient(135deg, #8b5cf6, #6d28d9)"
                : outputFormat === "PDF_PRINT"
                  ? "linear-gradient(135deg, #dc2626, #b91c1c)"
                  : outputFormat === "BMP"
                    ? "linear-gradient(135deg, #34c759, #2ecc71)"
                    : undefined,
            }}
          >
            {generating ? (
              <>
                <div
                  className="login-spinner"
                  style={{
                    width: 18,
                    height: 18,
                    borderColor: "rgba(255,255,255,0.3)",
                    borderTopColor: "#fff",
                  }}
                />
                Generating...
              </>
            ) : (
              <>{outputFormat === "CDR" ? "📐 Generate CorelDRAW Files (ZIP)" : outputFormat === "PDF_PRINT" ? "📄 Generate PDF Print" : outputFormat === "BMP" ? "🖼️ Generate & Save as BMP" : "🖨️ Generate & Download ID Cards (ZIP)"}</>
            )}
          </button>
        </div>
      </div>

      {/* Progress */}
      {(generating || progress.total > 0) && (
        <div
          style={{
            background: "white",
            borderRadius: 16,
            border: "1px solid #e2e8f0",
            padding: 24,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 13,
              color: "#64748b",
              marginBottom: 8,
            }}
          >
            <span>{progress.status}</span>
            {progress.total > 0 && (
              <span style={{ fontWeight: 600 }}>
                {progress.current}/{progress.total}
              </span>
            )}
          </div>
          <div
            style={{
              height: 8,
              borderRadius: 4,
              background: "#f1f5f9",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                borderRadius: 4,
                background: progress.status.includes("Done")
                  ? "linear-gradient(90deg, #22c55e, #16a34a)"
                  : "linear-gradient(90deg, #3b82f6, #2563eb)",
                width: progress.total > 0
                  ? `${(progress.current / progress.total) * 100}%`
                  : "0%",
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>
      )}

      {/* Preview Grid */}
      {previewCards.length > 0 && (
        <div
          style={{
            background: "white",
            borderRadius: 16,
            border: "1px solid #e2e8f0",
            padding: 24,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
            <h4 style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
              Preview ({previewCards.length} of {progress.total})
            </h4>
            {pdfPrintCards.length > 0 && (
              <button
                onClick={async () => {
                  await generateDirectPdf({
                    cards: pdfPrintCards,
                    schoolName,
                    paperWidth: printConfig.paperWidth,
                    paperHeight: printConfig.paperHeight,
                    cardWidth: printConfig.h2ndPosition > 0 ? printConfig.h2ndPosition : lastCardDims.w,
                    cardHeight: printConfig.v2ndPosition > 0 ? printConfig.v2ndPosition : lastCardDims.h,
                    h1stPosition: printConfig.h1stPosition,
                    v1stPosition: printConfig.v1stPosition,
                  })
                }}
                style={{
                  padding: "8px 16px",
                  borderRadius: 10,
                  border: "none",
                  background: "linear-gradient(135deg, #dc2626, #b91c1c)",
                  color: "white",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  boxShadow: "0 2px 10px rgba(220,38,38,0.3)",
                }}
              >
                📄 Re-download PDF
              </button>
            )}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: 16,
            }}
          >
            {previewCards.map((card) => (
              <div key={card.serialNumber}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 4, textAlign: "center" }}>FRONT</div>
                <img
                  src={card.frontDataUrl}
                  alt={`ID Card Front ${card.serialNumber}`}
                  style={{
                    width: "100%",
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                  }}
                />
                {card.backDataUrl && (
                  <>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 4, marginTop: 8, textAlign: "center" }}>BACK</div>
                    <img
                      src={card.backDataUrl}
                      alt={`ID Card Back ${card.serialNumber}`}
                      style={{
                        width: "100%",
                        borderRadius: 8,
                        border: "1px solid #e2e8f0",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                      }}
                    />
                  </>
                )}
                <div
                  style={{
                    textAlign: "center",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#64748b",
                    marginTop: 6,
                    fontFamily: "monospace",
                  }}
                >
                  {card.serialNumber}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}


      {/* ── Print Setup Dialog ── */}
      {showPrintDialog && (
        <PrintDialog
          initial={printConfig}
          onOk={(cfg: PrintConfig) => {
            setPrintConfig(cfg)
            setShowPrintDialog(false)
            toast.success(`Print setup saved: ${cfg.paper} (${cfg.paperWidth}×${cfg.paperHeight} mm)`)
          }}
          onCancel={() => setShowPrintDialog(false)}
        />
      )}
    </div>
  )
}
