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
