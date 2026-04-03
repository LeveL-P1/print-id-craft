"use client"
import { useState, useCallback } from "react"
import { toast } from "sonner"

type FieldMapping = {
  id: string
  fieldKey: string
  label: string
  type: "text" | "photo"
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

/**
 * Normalized key helper
 */
const normalizeKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "")

const FIELD_GROUPS: Record<string, string[]> = {
  name: ["fullname", "studentname", "name", "student_name", "full_name", "full name", "student name"],
  father: ["fathername", "father", "fatherphone", "mobfather", "mob_father", "fatherno", "father name", "father mobile"],
  mother: ["mothername", "mother", "motherphone", "motherno", "mother name", "mother mobile"],
  mob_father: ["mobfather", "mob_father", "fatherphone", "father", "fathername", "phone", "mobile no", "contact no", "telephone"],
  phone: ["phone", "mobile", "contact", "fatherphone", "mobfather", "contact no", "mobile no"],
  class: ["class", "classsection", "class_section", "standard", "grade"],
  branch: ["branch", "campus", "location"],
  rollno: ["rollno", "roll", "srno", "no", "admissionno", "roll number"],
  address: ["address", "addr", "location"],
  dateofbirth: ["dob", "dateofbirth", "birthdate", "birthday"],
  bloodgroup: ["bloodgroup", "blood group", "bg"],
  admissionno: ["admissionno", "admno", "registrationno", "regno"],
  photoid: ["photoid", "photo_id", "imageid", "imgid"],
  serialnumber: ["serialnumber", "serial", "sr"],
}

function resolveFieldValue(fd: Record<string, string>, fieldKey: string): string {
  if (fd[fieldKey] && String(fd[fieldKey]).trim()) return String(fd[fieldKey])
  const fdNormalized: Record<string, string> = {}
  for (const [k, v] of Object.entries(fd)) {
    if (v) fdNormalized[normalizeKey(k)] = String(v)
  }
  const normKey = normalizeKey(fieldKey)
  if (fdNormalized[normKey]) return fdNormalized[normKey]
  const patterns = FIELD_GROUPS[normKey]
  if (patterns) {
    for (const p of patterns) {
      if (fdNormalized[p]) return fdNormalized[p]
      const simpleP = normalizeKey(p)
      for (const [nk, nv] of Object.entries(fdNormalized)) {
        if (nk.includes(simpleP) || simpleP.includes(nk)) return nv
      }
    }
  }
  return ""
}

const imageCache: Record<string, HTMLImageElement> = {}
const dataUrlCache: Record<string, string> = {}

async function getCachedImage(url: string): Promise<HTMLImageElement | null> {
  if (imageCache[url]) return imageCache[url]
  try {
    const img = new Image()
    img.crossOrigin = "anonymous"
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject()
      img.src = url
    })
    imageCache[url] = img
    return img
  } catch { return null }
}

/** Convert an image URL to a base64 data URL (needed for SVG embedding) */
async function imageToDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url
  if (dataUrlCache[url]) return dataUrlCache[url]
  const img = await getCachedImage(url)
  if (!img) return url
  const canvas = document.createElement("canvas")
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext("2d")
  if (!ctx) return url
  ctx.drawImage(img, 0, 0)
  const dataUrl = canvas.toDataURL("image/jpeg", 0.92)
  dataUrlCache[url] = dataUrl
  return dataUrl
}

async function renderIdCard(
  templateImageUrl: string,
  fieldMappings: FieldMapping[],
  student: StudentRenderData,
  outputScale: number = 1
): Promise<string> {
  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas context failed")

  const templateImg = await getCachedImage(templateImageUrl)
  if (!templateImg) throw new Error("Failed to load template")

  canvas.width = templateImg.naturalWidth * outputScale
  canvas.height = templateImg.naturalHeight * outputScale
  const w = canvas.width
  const h = canvas.height

  ctx.drawImage(templateImg, 0, 0, w, h)

  for (const field of fieldMappings) {
    const fx = (field.x / 100) * w
    const fy = (field.y / 100) * h
    const fw = (field.width / 100) * w
    const fh = (field.height / 100) * h

    if (field.type === "photo") {
      if (student.photoUrl) {
        const photoImg = await getCachedImage(student.photoUrl)
        if (photoImg) {
          const aspectRatio = photoImg.naturalWidth / photoImg.naturalHeight
          const targetAspect = fw / fh
          let sx = 0, sy = 0, sw = photoImg.naturalWidth, sh = photoImg.naturalHeight
          if (aspectRatio > targetAspect) {
            sw = photoImg.naturalHeight * targetAspect
            sx = (photoImg.naturalWidth - sw) / 2
          } else {
            sh = photoImg.naturalWidth / targetAspect
            sy = (photoImg.naturalHeight - sh) / 2
          }
          ctx.drawImage(photoImg, sx, sy, sw, sh, fx, fy, fw, fh)
        }
      }
    } else {
      const pId = field.fieldKey === "photoId" ? "photoid" : field.fieldKey
      const val = resolveFieldValue(student.formData, pId) || 
                  (field.fieldKey === "class" ? student.className : 
                   field.fieldKey === "serialNumber" ? student.serialNumber : "")
      
      const value = String(val || "").trim()
      if (value) {
        const padding = 4 * outputScale
        const maxWidth = fw - padding * 2
        const fontPrefix = field.fontWeight === "bold" ? "bold " : ""
        let fontSize = fh * 0.78
        const minFontSize = Math.max(8 * outputScale, fh * 0.3)
        
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
  return canvas.toDataURL("image/jpeg", 0.95)
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
    } else {
      const pId = field.fieldKey === "photoId" ? "photoid" : field.fieldKey
      const val = resolveFieldValue(student.formData, pId) ||
                  (field.fieldKey === "class" ? student.className :
                   field.fieldKey === "serialNumber" ? student.serialNumber : "")
      const value = String(val || "").trim()
      if (value) {
        const fontSize = Math.round(fh * 0.78)
        const textAnchor = field.textAlign === "center" ? "middle" : field.textAlign === "right" ? "end" : "start"
        const padding = 4
        const textX = field.textAlign === "center" ? fx + fw / 2 : field.textAlign === "right" ? fx + fw - padding : fx + padding
        const textY = fy + fh / 2
        const fontWeight = field.fontWeight || "normal"
        const fontFamily = field.fontFamily || "Arial"
        const fill = field.fontColor || "#0f172a"
        const escaped = value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
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

type OutputFormat = "JPEG" | "CDR"

export default function BatchGenerator({ schoolId, schoolName, classes }: BatchGeneratorProps) {
  const [selectedClassId, setSelectedClassId] = useState("")
  const [statusFilter, setStatusFilter] = useState("APPROVED")
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("JPEG")
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, status: "" })
  const [previewCards, setPreviewCards] = useState<{ serialNumber: string; frontDataUrl: string; backDataUrl?: string }[]>([])

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

      const { templateImageUrl, fieldMappings, backTemplateImageUrl, backFieldMappings, hasBackSide, students, totalCount } = data.data
      
      if (!templateImageUrl) {
        toast.error("No template image configured. Please upload a template first.")
        setGenerating(false)
        return
      }

      setProgress({ current: 0, total: totalCount, status: "Rendering front side..." })

      // Pre-load template images
      await getCachedImage(templateImageUrl)
      if (hasBackSide && backTemplateImageUrl) {
        await getCachedImage(backTemplateImageUrl)
      }

      // ──── CDR (SVG) PATH ────
      if (outputFormat === "CDR") {
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
              const frontSvg = await renderIdCardSvg(templateImageUrl, fieldMappings, student)
              svgCards.push({ name: `${student.serialNumber}_front.svg`, svgContent: frontSvg })
              studentIds.push(student.id)

              if (hasBackSide && backTemplateImageUrl && backFieldMappings?.length > 0) {
                const backSvg = await renderIdCardSvg(backTemplateImageUrl, backFieldMappings, student)
                svgCards.push({ name: `${student.serialNumber}_back.svg`, svgContent: backSvg })
              }

              // Render JPEG preview for the first 8 (for on-screen display)
              if (previewData.length < 8) {
                const previewFront = await renderIdCard(templateImageUrl, fieldMappings, student, 1)
                let previewBack: string | undefined
                if (hasBackSide && backTemplateImageUrl && backFieldMappings?.length > 0) {
                  previewBack = await renderIdCard(backTemplateImageUrl, backFieldMappings, student, 1)
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

      // ──── JPEG PATH (existing) ────
      } else {
        const renderedCards: { name: string; dataUrl: string; id: string; serialNumber: string; frontDataUrl: string; backDataUrl?: string }[] = []
        const CHUNK_SIZE = 4

        for (let i = 0; i < students.length; i += CHUNK_SIZE) {
          const chunk = students.slice(i, i + CHUNK_SIZE)
          const promises = chunk.map(async (student: any) => {
            try {
              const frontDataUrl = await renderIdCard(templateImageUrl, fieldMappings, student, 1)
              let backDataUrl: string | undefined
              if (hasBackSide && backTemplateImageUrl && backFieldMappings?.length > 0) {
                backDataUrl = await renderIdCard(backTemplateImageUrl, backFieldMappings, student, 1)
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
                border: outputFormat === "CDR" ? "1.5px solid #8b5cf6" : "1.5px solid #e2e8f0",
                borderRadius: 10,
                fontSize: 14,
                background: outputFormat === "CDR" ? "#f5f3ff" : "white",
              }}
            >
              <option value="JPEG">📷 JPEG (Print-Ready Images)</option>
              <option value="CDR">📐 CDR (CorelDRAW Vector)</option>
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

        <button
          className="btn btn-primary"
          onClick={handleGenerate}
          disabled={generating}
          style={{
            padding: "14px 32px",
            fontSize: 15,
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: outputFormat === "CDR"
              ? "linear-gradient(135deg, #8b5cf6, #6d28d9)"
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
            <>{outputFormat === "CDR" ? "📐 Generate CorelDRAW Files (ZIP)" : "🖨️ Generate & Download ID Cards (ZIP)"}</>
          )}
        </button>
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
          <h4 style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 16 }}>
            Preview ({previewCards.length} of {progress.total})
          </h4>
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
    </div>
  )
}
