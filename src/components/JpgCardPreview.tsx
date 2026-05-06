"use client"
import { useRef, useEffect, useState, useCallback, memo } from "react"

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

type JpgCardPreviewProps = {
  templateImageUrl: string
  fieldMappings: FieldMapping[]
  formData: Record<string, string>
  studentPhoto?: string
  flagImageUrl?: string
  scale?: number
  className?: string
  watermark?: string
}

const MAPPER_REFERENCE_WIDTH = 600

// In-memory cache for loaded images to speed up rendering
const imageCache: Record<string, HTMLImageElement> = {}

async function loadImage(url: string): Promise<HTMLImageElement> {
  if (imageCache[url]) return imageCache[url]
  const img = new Image()
  img.crossOrigin = "anonymous"
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error("Failed to load: " + url))
    img.src = url
  })
  imageCache[url] = img
  return img
}

const normalizeKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "")

const FIELD_GROUPS: Record<string, string[]> = {
  name: ["fullname", "studentname", "name", "student_name", "full_name"],
  father: ["fathername", "father", "fatherphone", "mobfather", "mob_father", "fatherno"],
  mother: ["mothername", "mother", "motherphone", "motherno"],
  mob_father: ["mobfather", "mob_father", "fatherphone", "father", "fathername", "phone"],
  phone: ["phone", "mobile", "contact", "fatherphone", "mobfather"],
  class: ["class", "classsection", "class_section"],
  branch: ["branch"],
  rollno: ["rollno", "roll", "srno", "no", "admissionno"],
  address: ["address", "addr"],
  dateofbirth: ["dob", "dateofbirth", "birthdate"],
  bloodgroup: ["bloodgroup"],
  admissionno: ["admissionno", "admno"],
  photoid: ["photoid", "photo_id", "photono", "photo_no", "photonumber", "img", "imgno", "img_no", "imageno", "image_no"],
  serialnumber: ["serialnumber", "serial"],
  flagcolor: ["flagcolor", "flag_color", "flag", "house", "housecolor", "house_color", "colour", "color", "team"],
}

export function resolveFieldValue(fd: Record<string, string>, fieldKey: string): string {
  if (fd[fieldKey] && String(fd[fieldKey]).trim()) return String(fd[fieldKey])
  const fdNormalized: Record<string, string> = {}
  for (const [k, v] of Object.entries(fd)) {
    if (v && String(v).trim()) fdNormalized[normalizeKey(k)] = String(v)
  }
  const normKey = normalizeKey(fieldKey)
  if (fdNormalized[normKey]) return fdNormalized[normKey]
  const patterns = FIELD_GROUPS[normKey]
  if (patterns) {
    for (const p of patterns) {
      if (fdNormalized[p]) return fdNormalized[p]
      for (const [nk, nv] of Object.entries(fdNormalized)) {
        if (nk.includes(p) || p.includes(nk)) return nv
      }
    }
  }
  return ""
}

export default function JpgCardPreview({
  templateImageUrl,
  fieldMappings,
  formData,
  studentPhoto,
  flagImageUrl,
  scale = 1,
  className,
  watermark,
}: JpgCardPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [dimensions, setDimensions] = useState({ width: 600, height: 380 })

  const render = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    try {
      const img = await loadImage(templateImageUrl)
      const w = img.naturalWidth * scale
      const h = img.naturalHeight * scale
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        setDimensions({ width: w, height: h })
      }

      ctx.clearRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)

      for (const field of fieldMappings) {
        const fx = (field.x / 100) * w
        const fy = (field.y / 100) * h
        const fw = (field.width / 100) * w
        const fh = (field.height / 100) * h

        if (field.type === "photo") {
          if (studentPhoto) {
            try {
              const photoImg = await loadImage(studentPhoto)
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
            } catch (err) {
              ctx.fillStyle = "#e2e8f0"
              ctx.fillRect(fx, fy, fw, fh)
            }
          }
        } else if (field.type === "flag") {
          if (flagImageUrl) {
            try {
              const flagImg = await loadImage(flagImageUrl)
              ctx.drawImage(flagImg, 0, 0, flagImg.naturalWidth, flagImg.naturalHeight, fx, fy, fw, fh)
            } catch (err) {
              // Flag image failed to load — skip silently
            }
          }
        } else {
          const value = resolveFieldValue(formData, field.fieldKey)
          if (value) {
            const padding = 4 * scale
            const maxWidth = fw - padding * 2
            const fontPrefix = field.fontWeight === "bold" ? "bold " : ""
            let fontSize = fh * 0.78
            const minFontSize = Math.max(8 * scale, fh * 0.3)

            ctx.font = `${fontPrefix}${fontSize}px ${field.fontFamily || "Arial"}`
            let textWidth = ctx.measureText(value).width

            while (textWidth > maxWidth && fontSize > minFontSize) {
              fontSize -= 0.5
              ctx.font = `${fontPrefix}${fontSize}px ${field.fontFamily || "Arial"}`
              textWidth = ctx.measureText(value).width
            }

            ctx.fillStyle = field.fontColor || "#000"
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

      if (watermark) {
        ctx.save()
        ctx.globalAlpha = 0.15
        const wmFontSize = Math.max(w * 0.05, 20)
        ctx.font = `bold ${wmFontSize}px Arial`
        ctx.fillStyle = "#ef4444"
        ctx.textAlign = "center"
        ctx.translate(w / 2, h / 2)
        ctx.rotate(-Math.PI / 6)
        for (let row = -2; row <= 2; row++) {
          ctx.fillText(watermark, 0, row * wmFontSize * 2.5)
        }
        ctx.restore()
      }
    } catch (err) {
      console.error("Render failed", err)
    }
  }, [templateImageUrl, fieldMappings, formData, studentPhoto, flagImageUrl, scale, watermark])

  const renderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Debounce canvas rendering to prevent lag on rapid form edits
    if (renderTimerRef.current) clearTimeout(renderTimerRef.current)
    renderTimerRef.current = setTimeout(() => {
      render()
    }, 50)
    return () => {
      if (renderTimerRef.current) clearTimeout(renderTimerRef.current)
    }
  }, [render])

  return (
    <div className={`${className} fade-in`} style={{ display: "inline-block" }}>
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "auto",
          maxWidth: Math.round(dimensions.width / (scale > 1 ? scale : 1)),
          borderRadius: 12,
          boxShadow: "0 10px 40px rgba(0,0,0,0.12)",
        }}
      />
    </div>
  )
}

export async function generateJpgCard(
  templateImageUrl: string,
  fieldMappings: FieldMapping[],
  formData: Record<string, string>,
  studentPhoto?: string,
  outputScale: number = 1,
  flagImageUrl?: string
): Promise<string> {
  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas context failed")

  const img = await loadImage(templateImageUrl)
  const w = img.naturalWidth * outputScale
  const h = img.naturalHeight * outputScale
  canvas.width = w
  canvas.height = h

  ctx.drawImage(img, 0, 0, w, h)

  for (const field of fieldMappings) {
    const fx = (field.x / 100) * w
    const fy = (field.y / 100) * h
    const fw = (field.width / 100) * w
    const fh = (field.height / 100) * h

    if (field.type === "photo" && studentPhoto) {
      try {
        const photoImg = await loadImage(studentPhoto)
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
      } catch {}
    } else if (field.type === "flag" && flagImageUrl) {
      try {
        const flagImg = await loadImage(flagImageUrl)
        ctx.drawImage(flagImg, 0, 0, flagImg.naturalWidth, flagImg.naturalHeight, fx, fy, fw, fh)
      } catch {}
    } else if (field.type === "text") {
      const value = resolveFieldValue(formData, field.fieldKey)
      if (value) {
        const padding = 4 * outputScale
        const maxWidth = fw - padding * 2
        const fontPrefix = field.fontWeight === "bold" ? "bold " : ""
        let fontSize = fh * 0.78
        const minFontSize = Math.max(8 * outputScale, fh * 0.3)

        ctx.font = `${fontPrefix}${fontSize}px ${field.fontFamily || "Arial"}`
        let textWidth = ctx.measureText(value).width
        while (textWidth > maxWidth && fontSize > minFontSize) {
          fontSize -= 0.5
          ctx.font = `${fontPrefix}${fontSize}px ${field.fontFamily || "Arial"}`
          textWidth = ctx.measureText(value).width
        }

        ctx.fillStyle = field.fontColor || "#000"
        ctx.textAlign = field.textAlign || "left"
        ctx.textBaseline = "middle"
        ctx.save()
        ctx.beginPath()
        ctx.rect(fx, fy, fw, fh)
        ctx.clip()
        const textX = ctx.textAlign === "center" ? fx + fw / 2 : ctx.textAlign === "right" ? fx + fw - padding : fx + padding
        ctx.fillText(value, textX, fy + fh / 2)
        ctx.restore()
      }
    }
  }

  return canvas.toDataURL("image/jpeg", 0.92)
}
