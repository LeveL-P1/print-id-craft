"use client"
import { useState, useRef, useCallback, useEffect } from "react"

const BG_COLOR_PRESETS = [
  { id: "white", label: "White", hex: "#FFFFFF", textColor: "#333" },
  { id: "light-blue", label: "Light Blue", hex: "#DBEAFE", textColor: "#333" },
  { id: "sky-blue", label: "Sky Blue", hex: "#BAE6FD", textColor: "#333" },
  { id: "light-grey", label: "Light Grey", hex: "#F1F5F9", textColor: "#333" },
  { id: "maroon", label: "Maroon", hex: "#7F1D1D", textColor: "#fff" },
  { id: "cream", label: "Cream", hex: "#FEF3C7", textColor: "#333" },
] as const

type Props = {
  photoUrl: string
  defaultBgColor: string
  onProcessed: (processedDataUrl: string) => void
  onSkip: () => void
}

/**
 * Robustly convert any photo URL (data URL, blob URL, or remote URL) to a Blob.
 * fetch() works for data URLs in modern browsers, but we fall back to manual
 * base64 decoding if it fails.
 */
async function urlToBlob(url: string): Promise<Blob> {
  // Try fetch first (works for blob URLs, data URLs in most browsers, and remote URLs)
  try {
    const response = await fetch(url)
    if (response.ok) {
      return await response.blob()
    }
  } catch { /* fall through to manual approach */ }

  // Manual fallback for data URLs
  if (url.startsWith("data:")) {
    const [header, base64] = url.split(",")
    const mimeMatch = header.match(/data:([^;]+)/)
    const mime = mimeMatch ? mimeMatch[1] : "image/jpeg"
    const binary = atob(base64)
    const array = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      array[i] = binary.charCodeAt(i)
    }
    return new Blob([array], { type: mime })
  }

  // Last resort: load via Image + Canvas
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext("2d")
      if (!ctx) { reject(new Error("Canvas context failed")); return }
      ctx.drawImage(img, 0, 0)
      canvas.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error("Canvas toBlob failed"))
      }, "image/jpeg", 0.95)
    }
    img.onerror = () => reject(new Error("Image load failed"))
    img.src = url
  })
}

/**
 * Downscale large images before background removal to dramatically reduce processing time.
 * Phone cameras produce 4000x3000px images; AI model only needs ~1024px max.
 */
async function downscaleBlob(blob: Blob, maxDim = 1024): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const { naturalWidth: w, naturalHeight: h } = img
      // If already small enough, return as-is
      if (w <= maxDim && h <= maxDim) {
        resolve(blob)
        return
      }
      const scale = maxDim / Math.max(w, h)
      const nw = Math.round(w * scale)
      const nh = Math.round(h * scale)
      const canvas = document.createElement("canvas")
      canvas.width = nw
      canvas.height = nh
      const ctx = canvas.getContext("2d")
      if (!ctx) { resolve(blob); return }
      ctx.drawImage(img, 0, 0, nw, nh)
      canvas.toBlob(
        (result) => result ? resolve(result) : resolve(blob),
        "image/jpeg",
        0.90
      )
    }
    img.onerror = () => resolve(blob) // fallback to original on error
    img.src = URL.createObjectURL(blob)
  })
}

export default function PhotoBgProcessor({ photoUrl, defaultBgColor, onProcessed, onSkip }: Props) {
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressMsg, setProgressMsg] = useState("")
  const [selectedColor, setSelectedColor] = useState(defaultBgColor || "#FFFFFF")
  const [removedBgUrl, setRemovedBgUrl] = useState<string | null>(null)
  const [processedUrl, setProcessedUrl] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [photoLoaded, setPhotoLoaded] = useState(false)
  const [photoDataUrl, setPhotoDataUrl] = useState<string>("")
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const activePreset = BG_COLOR_PRESETS.find(p => p.hex.toLowerCase() === selectedColor.toLowerCase())

  // Verify the photo URL is valid on mount & ensure we have a displayable data URL
  useEffect(() => {
    if (!photoUrl) {
      setError("No photo provided. Please go back and upload a photo.")
      return
    }

    const img = new Image()
    img.onload = () => {
      setPhotoLoaded(true)
      // If it's already a data URL, use as-is; otherwise convert for reliable display
      if (photoUrl.startsWith("data:")) {
        setPhotoDataUrl(photoUrl)
      } else {
        // Convert blob/remote URL to data URL for stable display
        const canvas = document.createElement("canvas")
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext("2d")
        if (ctx) {
          ctx.drawImage(img, 0, 0)
          setPhotoDataUrl(canvas.toDataURL("image/jpeg", 0.92))
        } else {
          setPhotoDataUrl(photoUrl)
        }
      }
    }
    img.onerror = () => {
      console.error("PhotoBgProcessor: Failed to load photoUrl:", photoUrl?.substring(0, 100))
      setError("Could not load the photo. Please go back and re-upload.")
    }
    img.src = photoUrl
  }, [photoUrl])

  const removeBackground = useCallback(async () => {
    const sourceUrl = photoDataUrl || photoUrl
    if (!sourceUrl) {
      setError("No photo to process.")
      return
    }

    setProcessing(true)
    setProgress(5)
    setProgressMsg("Loading AI model...")
    setError("")

    try {
      // Import the library — it bundles its own onnxruntime-web internally.
      // Do NOT import onnxruntime-web directly as it causes version conflicts
      // ("a_OrtGetInputOutputMetadata is not a function" error).
      const { removeBackground: removeBg } = await import("@imgly/background-removal")

      setProgress(15)
      setProgressMsg("Preparing image...")

      // Use our robust url-to-blob converter
      let blob = await urlToBlob(sourceUrl)
      
      // Downscale large images (phones send 4000px+, AI model only needs ~1024px)
      // This alone reduces inference time by 3-4x
      blob = await downscaleBlob(blob, 1024)

      setProgress(25)
      setProgressMsg("Removing background...")

      // Use quantized model (isnet_quint8, ~8MB) instead of full-precision (isnet, ~30MB).
      // 3-4x faster inference with nearly identical quality for ID card photos.
      // Enable Web Worker to avoid blocking the main thread.
      const resultBlob = await removeBg(blob, {
        device: "cpu",
        model: "isnet_quint8",
        proxyToWorker: true,
        fetchArgs: { cache: "force-cache" as RequestCache },
        progress: (key: string, current: number, total: number) => {
          const pct = Math.round((current / total) * 100)
          if (key.includes("fetch")) {
            setProgress(25 + pct * 0.3)
            setProgressMsg("Downloading AI model...")
          } else if (key.includes("inference")) {
            setProgress(55 + pct * 0.4)
            setProgressMsg("Processing photo...")
          }
        },
      })

      setProgress(95)
      setProgressMsg("Finalizing...")

      const reader = new FileReader()
      reader.onload = () => {
        const transparentUrl = reader.result as string
        setRemovedBgUrl(transparentUrl)
        setProgress(100)
        setProcessing(false)
        applyBackground(transparentUrl, selectedColor)
      }
      reader.readAsDataURL(resultBlob)
    } catch (err: any) {
      console.error("Background removal failed:", err)
      setError("Background removal failed. You can skip this step and use the original photo.")
      setProcessing(false)
      setProgress(0)
    }
  }, [photoUrl, photoDataUrl, selectedColor])

  const applyBackground = useCallback((transparentUrl: string, bgColor: string) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const img = new Image()
    img.onload = () => {
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight

      // Step 1: Draw the transparent image to read alpha channel
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)

      // Step 2: Refine edges — apply slight alpha feathering to reduce harsh cutout edges
      // This smooths the semi-transparent boundary pixels for more natural compositing
      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const data = imageData.data
        const w = canvas.width
        const h = canvas.height

        // Create a copy of alpha channel for edge detection
        const alphaOrig = new Uint8Array(w * h)
        for (let i = 0; i < w * h; i++) {
          alphaOrig[i] = data[i * 4 + 3]
        }

        // Apply 3x3 gaussian-style alpha smoothing on edge pixels only
        // (pixels where alpha is between 10 and 245 — the boundary region)
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const idx = y * w + x
            const a = alphaOrig[idx]
            // Only smooth boundary pixels
            if (a > 10 && a < 245) {
              // Sample 3x3 neighborhood
              const sum =
                alphaOrig[(y - 1) * w + (x - 1)] +
                alphaOrig[(y - 1) * w + x] * 2 +
                alphaOrig[(y - 1) * w + (x + 1)] +
                alphaOrig[y * w + (x - 1)] * 2 +
                alphaOrig[y * w + x] * 4 +
                alphaOrig[y * w + (x + 1)] * 2 +
                alphaOrig[(y + 1) * w + (x - 1)] +
                alphaOrig[(y + 1) * w + x] * 2 +
                alphaOrig[(y + 1) * w + (x + 1)]
              data[idx * 4 + 3] = Math.round(sum / 16)
            }
          }
        }

        ctx.putImageData(imageData, 0, 0)
      } catch {
        // If edge refinement fails, continue with original alpha
      }

      // Step 3: Composite — draw bg color behind, then the refined foreground on top
      const finalCanvas = document.createElement("canvas")
      finalCanvas.width = canvas.width
      finalCanvas.height = canvas.height
      const fCtx = finalCanvas.getContext("2d")
      if (fCtx) {
        fCtx.fillStyle = bgColor
        fCtx.fillRect(0, 0, finalCanvas.width, finalCanvas.height)
        fCtx.drawImage(canvas, 0, 0)
        const resultUrl = finalCanvas.toDataURL("image/jpeg", 0.95)
        setProcessedUrl(resultUrl)
      } else {
        // Fallback: simple composite without edge refinement
        ctx.globalCompositeOperation = "destination-over"
        ctx.fillStyle = bgColor
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.globalCompositeOperation = "source-over"
        const resultUrl = canvas.toDataURL("image/jpeg", 0.95)
        setProcessedUrl(resultUrl)
      }
    }
    img.src = transparentUrl
  }, [])

  useEffect(() => {
    if (removedBgUrl) {
      applyBackground(removedBgUrl, selectedColor)
    }
  }, [selectedColor, removedBgUrl, applyBackground])

  // Auto-start background removal on mount if photo is valid
  useEffect(() => {
    if (photoLoaded && photoDataUrl) {
      removeBackground()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoLoaded, photoDataUrl])

  const handleConfirm = () => {
    if (processedUrl) {
      onProcessed(processedUrl)
    }
  }

  // Use the stable data URL for display
  const displayUrl = photoDataUrl || photoUrl

  return (
    <div style={{ padding: 0 }}>
      <canvas ref={canvasRef} style={{ display: "none" }} />

      {/* Header */}
      <div style={{
        fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 4,
        display: 'flex', alignItems: 'center', gap: 8
      }}>
        <span style={{
          width: 28, height: 28, borderRadius: 8,
          background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, color: 'white'
        }}>🎨</span>
        Smart Background Processor
      </div>
      <p style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
        AI-powered background removal for a professional ID card photo
      </p>

      {/* Original Photo Preview (always visible when not processing) */}
      {!processing && !processedUrl && photoLoaded && !error && (
        <div style={{
          background: '#f8fafc', borderRadius: 12, padding: 16,
          border: '1px solid #e2e8f0', marginBottom: 16, textAlign: 'center'
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>
            Your Uploaded Photo
          </div>
          <div style={{
            maxWidth: 160, margin: '0 auto', borderRadius: 10,
            overflow: 'hidden', border: '2px solid #e2e8f0', aspectRatio: '3/4'
          }}>
            <img src={displayUrl} alt="Original" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        </div>
      )}

      {/* Processing State */}
      {processing && (
        <div style={{
          background: '#f0f9ff', borderRadius: 14, padding: 24,
          border: '1px solid #bae6fd', textAlign: 'center'
        }}>
          <div className="login-spinner" style={{
            width: 36, height: 36,
            borderColor: 'rgba(59,130,246,0.2)', borderTopColor: '#3b82f6',
            margin: '0 auto 12px'
          }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1e40af', marginBottom: 8 }}>
            {progressMsg}
          </div>
          <div style={{
            height: 6, borderRadius: 3, background: '#e0f2fe',
            overflow: 'hidden', maxWidth: 280, margin: '0 auto'
          }}>
            <div style={{
              height: '100%', borderRadius: 3,
              background: 'linear-gradient(90deg, #3b82f6, #6366f1)',
              width: `${progress}%`, transition: 'width 0.5s ease'
            }} />
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>
            {progress < 55 ? "First-time model download (~30MB, cached after)" : `${Math.round(progress)}% complete`}
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div style={{
          background: '#fef2f2', borderRadius: 12, padding: 16,
          border: '1px solid #fecaca', marginBottom: 16
        }}>
          <div style={{ fontSize: 13, color: '#dc2626', fontWeight: 600, marginBottom: 4 }}>
            ⚠️ {error}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {photoLoaded && (
              <button
                onClick={() => { setError(""); removeBackground() }}
                style={{
                  fontSize: 12, padding: '8px 16px', background: '#3b82f6',
                  color: 'white', border: 'none', borderRadius: 8,
                  cursor: 'pointer', fontWeight: 600
                }}
              >
                Retry
              </button>
            )}
            <button
              onClick={onSkip}
              style={{
                fontSize: 12, padding: '8px 16px', background: '#f1f5f9',
                color: '#475569', border: 'none', borderRadius: 8,
                cursor: 'pointer', fontWeight: 600
              }}
            >
              Skip & Use Original
            </button>
          </div>
        </div>
      )}

      {/* Result Preview */}
      {!processing && processedUrl && (
        <>
          <div style={{
            display: 'flex', gap: 12, marginBottom: 16,
            flexWrap: 'wrap', justifyContent: 'center'
          }}>
            <div style={{ flex: '1 1 120px', maxWidth: 160, textAlign: 'center' }}>
              <div style={{
                fontSize: 11, fontWeight: 600, color: '#94a3b8',
                textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6
              }}>Before</div>
              <div style={{
                borderRadius: 10, overflow: 'hidden',
                border: '2px solid #e2e8f0', aspectRatio: '3/4'
              }}>
                <img src={displayUrl} alt="Original" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, color: '#94a3b8', alignSelf: 'center'
            }}>→</div>

            <div style={{ flex: '1 1 120px', maxWidth: 160, textAlign: 'center' }}>
              <div style={{
                fontSize: 11, fontWeight: 600, color: '#22c55e',
                textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6
              }}>After</div>
              <div style={{
                borderRadius: 10, overflow: 'hidden',
                border: '2px solid #22c55e', aspectRatio: '3/4'
              }}>
                <img src={processedUrl} alt="Processed" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            </div>
          </div>

          {/* Background Color Selector */}
          <div style={{
            background: '#f8fafc', borderRadius: 12, padding: 14,
            border: '1px solid #e2e8f0', marginBottom: 16
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 10 }}>
              Choose Background Color
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              {BG_COLOR_PRESETS.map(preset => (
                <button
                  key={preset.id}
                  onClick={() => setSelectedColor(preset.hex)}
                  style={{
                    width: 44, height: 44, borderRadius: 10,
                    background: preset.hex,
                    border: selectedColor === preset.hex ? '3px solid #3b82f6' : '2px solid #d1d5db',
                    cursor: 'pointer', position: 'relative',
                    boxShadow: selectedColor === preset.hex ? '0 0 0 2px rgba(59,130,246,0.3)' : 'none',
                    transition: 'all 0.15s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                  title={preset.label}
                >
                  {selectedColor === preset.hex && (
                    <span style={{ fontSize: 16, color: preset.textColor }}>✓</span>
                  )}
                </button>
              ))}
            </div>
            <div style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', marginTop: 8 }}>
              {activePreset?.label || "Custom"} Background
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={onSkip}
              style={{
                flex: 1, padding: '12px', fontSize: 13, fontWeight: 600,
                background: '#f1f5f9', color: '#475569', border: 'none',
                borderRadius: 10, cursor: 'pointer'
              }}
            >
              Use Original Instead
            </button>
            <button
              onClick={handleConfirm}
              style={{
                flex: 2, padding: '12px', fontSize: 13, fontWeight: 700,
                background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                color: 'white', border: 'none', borderRadius: 10,
                cursor: 'pointer', letterSpacing: '-0.01em'
              }}
            >
              ✓ Use Processed Photo
            </button>
          </div>
        </>
      )}
    </div>
  )
}
