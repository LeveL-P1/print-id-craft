"use client"

const DEFAULT_MAX_DIMENSION = 768
const DEFAULT_JPEG_QUALITY = 0.86
const DEFAULT_MAX_BYTES = 1.25 * 1024 * 1024

type CompressOptions = {
  maxDimension?: number
  quality?: number
  maxBytes?: number
  fileName?: string
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, data] = dataUrl.split(",")
  const mime = meta.match(/data:([^;]+)/)?.[1] || "image/jpeg"
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error("Could not prepare photo for upload"))
    }, type, quality)
  })
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Could not load photo for upload"))
    img.src = src
  })
}

export async function prepareStudentPhotoForUpload(
  sourceUrl: string,
  options: CompressOptions = {}
): Promise<File> {
  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  const baseQuality = options.quality ?? DEFAULT_JPEG_QUALITY
  const fileName = options.fileName ?? `photo-${Date.now()}.jpg`

  const sourceBlob = sourceUrl.startsWith("data:")
    ? dataUrlToBlob(sourceUrl)
    : await fetch(sourceUrl).then((r) => {
        if (!r.ok) throw new Error("Could not read photo for upload")
        return r.blob()
      })

  const objectUrl = URL.createObjectURL(sourceBlob)
  try {
    const img = await loadImage(objectUrl)
    const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight))
    const width = Math.max(1, Math.round(img.naturalWidth * scale))
    const height = Math.max(1, Math.round(img.naturalHeight * scale))
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Photo compression is not supported on this device")

    ctx.drawImage(img, 0, 0, width, height)

    let output = await canvasToBlob(canvas, "image/jpeg", baseQuality)
    for (const quality of [0.78, 0.7, 0.62]) {
      if (output.size <= maxBytes) break
      output = await canvasToBlob(canvas, "image/jpeg", quality)
    }

    return new File([output], fileName, {
      type: "image/jpeg",
      lastModified: Date.now(),
    })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

const UPLOAD_TIMEOUT_MS = 45_000
const UPLOAD_RETRY_TIMEOUT_MS = 60_000
const MAX_UPLOAD_ATTEMPTS = 3

export type StudentPhotoUploadResult = {
  photoUrl: string
  photoPath: string
  photoDataUrl: string
  uploadFailed: boolean
  lastError?: string
}

async function parseUploadApiError(res: Response, fallback: string) {
  const contentType = res.headers.get("content-type") || ""
  if (contentType.includes("application/json")) {
    const data = await res.json().catch(() => null)
    return data?.error || data?.detail || fallback
  }
  const text = await res.text().catch(() => "")
  if (text && !text.trim().startsWith("<!DOCTYPE")) return text.slice(0, 180)
  return fallback
}

async function uploadFormWithTimeout(formData: FormData, timeoutMs: number) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch("/api/upload", {
      method: "POST",
      body: formData,
      signal: controller.signal,
    })
  } finally {
    window.clearTimeout(timeout)
  }
}

function isUploadAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError"
}

function uploadNetworkErrorMessage(error: unknown) {
  if (isUploadAbortError(error)) {
    return "Photo upload is taking too long. Your details will still be saved."
  }
  return error instanceof Error
    ? error.message
    : "Photo upload failed. Your details will still be saved."
}

async function dataUrlFromFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error("Could not read photo"))
    reader.readAsDataURL(file)
  })
}

/** Upload with retries; never throws — submit API can fall back to photoDataUrl. */
export async function uploadStudentPhotoResilient(options: {
  croppedPhoto: string
  schoolId: string
  submitToken: string
  onProgress?: (pct: number) => void
}): Promise<StudentPhotoUploadResult> {
  const { croppedPhoto, schoolId, submitToken, onProgress } = options
  let lastError = ""

  try {
    onProgress?.(10)
    const uploadFile = await prepareStudentPhotoForUpload(croppedPhoto)
    const photoDataUrl = await dataUrlFromFile(uploadFile).catch(() => croppedPhoto)
    onProgress?.(25)

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return {
        photoUrl: "",
        photoPath: "",
        photoDataUrl,
        uploadFailed: true,
        lastError: "You appear to be offline. Your details will still be saved.",
      }
    }

    const fd = new FormData()
    fd.append("file", uploadFile)
    fd.append("folder", `students/${schoolId}`)
    fd.append("submitToken", submitToken)

    for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt++) {
      onProgress?.(25 + attempt * 15)
      const timeoutMs = attempt === 1 ? UPLOAD_TIMEOUT_MS : UPLOAD_RETRY_TIMEOUT_MS
      try {
        let uploadRes = await uploadFormWithTimeout(fd, timeoutMs)
        if (!uploadRes.ok && uploadRes.status >= 500 && attempt < MAX_UPLOAD_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, 800 * attempt))
          uploadRes = await uploadFormWithTimeout(fd, UPLOAD_RETRY_TIMEOUT_MS)
        }
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json().catch(() => null)
          if (uploadData?.success) {
            onProgress?.(80)
            return {
              photoUrl: uploadData.url || "",
              photoPath: uploadData.path || "",
              photoDataUrl,
              uploadFailed: false,
            }
          }
        }
        lastError = await parseUploadApiError(uploadRes, "Photo upload failed")
      } catch (error) {
        lastError = uploadNetworkErrorMessage(error)
      }
      if (attempt < MAX_UPLOAD_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 600 * attempt))
      }
    }

    onProgress?.(80)
    return {
      photoUrl: "",
      photoPath: "",
      photoDataUrl,
      uploadFailed: true,
      lastError,
    }
  } catch (error) {
    console.error("Photo upload pipeline error:", error)
    return {
      photoUrl: "",
      photoPath: "",
      photoDataUrl: croppedPhoto,
      uploadFailed: true,
      lastError: error instanceof Error ? error.message : "Photo preparation failed",
    }
  }
}
