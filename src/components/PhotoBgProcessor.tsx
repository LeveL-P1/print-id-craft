"use client"
import { useState, useRef, useCallback, useEffect } from "react"
import {
  downscaleBlob,
  loadImageToCanvas,
  recolorPlainBackgroundOnCanvas,
  removeBackgroundWithBestModel,
} from "@/lib/photo-background"

type Props = {
  photoUrl: string
  /** School-wide ID photo background — same for every student in this class. */
  defaultBgColor: string
  onProcessed: (processedDataUrl: string) => void
  onSkip: () => void
  /** When true, apply the school background and continue without manual confirm. */
  autoConfirm?: boolean
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

export default function PhotoBgProcessor({
  photoUrl,
  defaultBgColor,
  onProcessed,
  onSkip,
  autoConfirm = false,
}: Props) {
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressMsg, setProgressMsg] = useState("")
  const schoolBgColor = defaultBgColor || "#FFFFFF"
  const [removedBgUrl, setRemovedBgUrl] = useState<string | null>(null)
  const [processedUrl, setProcessedUrl] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [photoLoaded, setPhotoLoaded] = useState(false)
  const [photoDataUrl, setPhotoDataUrl] = useState<string>("")
  const [bgQualityIssue, setBgQualityIssue] = useState<string>("")
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const autoConfirmedRef = useRef(false)

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
    setProgress(10)
    setProgressMsg("Preparing your photo…")
    setError("")

    try {
      // Tier 2: plain wall with wrong colour — instant flood-fill (no AI).
      const { canvas, ctx } = await loadImageToCanvas(sourceUrl)
      const recolored = recolorPlainBackgroundOnCanvas(
        ctx, canvas.width, canvas.height, schoolBgColor
      )
      if (recolored) {
        setProgress(100)
        setProgressMsg("Background updated!")
        const resultUrl = canvas.toDataURL("image/jpeg", 0.95)
        setProcessedUrl(resultUrl)
        setProcessing(false)
        return
      }

      // Tier 3: messy background — IMG.LY isnet_fp16 + WebGPU (free, best in-browser).
      setProgress(20)
      setProgressMsg("Cleaning background with AI…")

      let blob = await urlToBlob(sourceUrl)
      blob = await downscaleBlob(blob, 768)

      const resultBlob = await removeBackgroundWithBestModel(blob, (msg, pct) => {
        setProgress(30 + pct * 0.6)
        setProgressMsg(msg)
      })

      setProgress(95)
      setProgressMsg("Almost done…")

      const reader = new FileReader()
      reader.onload = () => {
        const transparentUrl = reader.result as string
        setRemovedBgUrl(transparentUrl)
        setProgress(100)
        setProcessing(false)
        applyBackground(transparentUrl, schoolBgColor)
      }
      reader.readAsDataURL(resultBlob)
    } catch (err: any) {
      console.error("Background removal failed:", err)
      setError("Could not clean the background. You can still continue with your photo.")
      setProcessing(false)
      setProgress(0)
    }
  }, [photoUrl, photoDataUrl, schoolBgColor])

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

      // Step 2: Edge cleanup — produce a fully-plain background with no
      // halo of the original wall colour bleeding around the subject.
      //
      // The previous approach (3×3 Gaussian alpha smoothing on boundary
      // pixels) actually MADE the halo worse: semi-transparent pixels
      // composite as `originalRGB * a + bgColor * (1 - a)`, so any pixel
      // whose original RGB differed from the chosen bg colour shows up
      // as a coloured fringe around the subject — exactly what the user
      // is complaining about.
      //
      // New approach (per user request "background completely plain"):
      //   1. Hard alpha threshold at 128 — every pixel is either fully
      //      foreground (255) or fully background (0). No partial alpha
      //      means no halo by construction.
      //   2. 1-pixel erosion of the foreground mask — pulls the
      //      silhouette inward by one pixel, dropping the fringe that
      //      typically contains contaminated colour from the original
      //      background.
      //   3. Connected-component cleanup (Step 2b below, unchanged).
      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const data = imageData.data
        const w = canvas.width
        const h = canvas.height
        const total = w * h

        // 1) Hard threshold the AI mask.
        for (let i = 0; i < total; i++) {
          data[i * 4 + 3] = data[i * 4 + 3] >= 128 ? 255 : 0
        }

        // 2) 1-pixel erosion of the foreground mask. We mark every FG
        //    pixel that has at least one BG neighbour and zero its alpha
        //    in a single pass over a snapshot of the thresholded mask.
        //    Boundary rows/columns are processed conservatively (treat
        //    out-of-bounds as BG to also erode the image edge).
        const fgMask = new Uint8Array(total)
        for (let i = 0; i < total; i++) fgMask[i] = data[i * 4 + 3] === 255 ? 1 : 0

        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const idx = y * w + x
            if (!fgMask[idx]) continue
            // Any 4-neighbour is BG (or out-of-bounds) → this pixel is on
            // the boundary; erode it.
            const isEdge =
              (x === 0)         || !fgMask[idx - 1] ||
              (x === w - 1)     || !fgMask[idx + 1] ||
              (y === 0)         || !fgMask[idx - w] ||
              (y === h - 1)     || !fgMask[idx + w]
            if (isEdge) data[idx * 4 + 3] = 0
          }
        }

        // Step 2b: Connected-component cleanup. The AI segmenter sometimes
        // leaves small isolated "islands" of alpha>0 inside the background
        // region — chunks of dark wall mis-classified as foreground because
        // they're similar in colour to hair / dark clothes. These show up
        // as black spots on the final ID card. We BFS the foreground mask,
        // keep only the biggest blob (the person, which touches the centre)
        // and zero-out everything else.
        try {
          const total = w * h
          const fg = new Uint8Array(total)
          for (let i = 0; i < total; i++) fg[i] = data[i * 4 + 3] > 128 ? 1 : 0

          const label = new Int32Array(total) // 0 = unvisited
          const sizes: number[] = [0] // dummy for label 0
          const centreLabels = new Set<number>()
          // Centre region used to identify the "main" component (the person
          // is always near the middle of an ID portrait).
          const cxMin = Math.floor(w * 0.30), cxMax = Math.floor(w * 0.70)
          const cyMin = Math.floor(h * 0.20), cyMax = Math.floor(h * 0.70)
          // Queue: flat Int32Array used as a ring buffer to avoid GC churn.
          const queue = new Int32Array(total)
          let nextLabel = 1
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const idx = y * w + x
              if (!fg[idx] || label[idx]) continue
              const lbl = nextLabel++
              let size = 0
              let head = 0, tail = 0
              queue[tail++] = idx
              label[idx] = lbl
              while (head < tail) {
                const p = queue[head++]
                size++
                const py = (p / w) | 0
                const px = p - py * w
                if (px >= cxMin && px < cxMax && py >= cyMin && py < cyMax) {
                  centreLabels.add(lbl)
                }
                if (px > 0) {
                  const n = p - 1
                  if (fg[n] && !label[n]) { label[n] = lbl; queue[tail++] = n }
                }
                if (px < w - 1) {
                  const n = p + 1
                  if (fg[n] && !label[n]) { label[n] = lbl; queue[tail++] = n }
                }
                if (py > 0) {
                  const n = p - w
                  if (fg[n] && !label[n]) { label[n] = lbl; queue[tail++] = n }
                }
                if (py < h - 1) {
                  const n = p + w
                  if (fg[n] && !label[n]) { label[n] = lbl; queue[tail++] = n }
                }
              }
              sizes[lbl] = size
            }
          }
          // Pick the largest component that overlaps the centre region. If
          // none overlap the centre (weird selfie), fall back to overall
          // largest component.
          let keepLabel = 0, keepSize = 0
          centreLabels.forEach(lbl => {
            if (sizes[lbl] > keepSize) { keepSize = sizes[lbl]; keepLabel = lbl }
          })
          if (keepLabel === 0) {
            for (let lbl = 1; lbl < sizes.length; lbl++) {
              if (sizes[lbl] > keepSize) { keepSize = sizes[lbl]; keepLabel = lbl }
            }
          }
          // Zero alpha on every pixel whose label != keepLabel. Tiny
          // components (size < 0.05% of image) are always dropped even
          // if they border the centre, as those are clearly noise.
          const noiseThreshold = Math.max(50, Math.floor(total * 0.0005))
          for (let i = 0; i < total; i++) {
            const lbl = label[i]
            if (lbl === 0) continue
            if (lbl !== keepLabel && sizes[lbl] < noiseThreshold * 20) {
              data[i * 4 + 3] = 0
            } else if (lbl !== keepLabel && sizes[lbl] < noiseThreshold) {
              data[i * 4 + 3] = 0
            }
          }
        } catch (e) {
          console.warn("Connected-component cleanup skipped:", e)
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
      const ctxToRead = fCtx || ctx
      if (fCtx) {
        fCtx.fillStyle = bgColor
        fCtx.fillRect(0, 0, finalCanvas.width, finalCanvas.height)
        fCtx.drawImage(canvas, 0, 0)
      } else {
        // Fallback: simple composite without edge refinement
        ctx.globalCompositeOperation = "destination-over"
        ctx.fillStyle = bgColor
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.globalCompositeOperation = "source-over"
      }

      // Step 4: Verify the output background is uniformly the target colour
      // — count edge-region pixels that deviate by > ΔE 30 from bgColor.
      // If more than 3% deviate, surface a warning so the parent can retake
      // the photo rather than submit one with visible mask artefacts.
      try {
        const targetRgb = (() => {
          const hex = bgColor.replace(/^#/, "")
          if (/^[0-9a-fA-F]{6}$/.test(hex)) {
            return {
              r: parseInt(hex.slice(0, 2), 16),
              g: parseInt(hex.slice(2, 4), 16),
              b: parseInt(hex.slice(4, 6), 16),
            }
          }
          return { r: 255, g: 255, b: 255 }
        })()
        const w2 = (fCtx ? finalCanvas : canvas).width
        const h2 = (fCtx ? finalCanvas : canvas).height
        const sourceCtx = ctxToRead
        const topBand = sourceCtx.getImageData(0, 0, w2, Math.max(20, Math.floor(h2 * 0.08))).data
        const sideW = Math.max(20, Math.floor(w2 * 0.06))
        const leftBand = sourceCtx.getImageData(0, 0, sideW, Math.floor(h2 * 0.6)).data
        const rightBand = sourceCtx.getImageData(w2 - sideW, 0, sideW, Math.floor(h2 * 0.6)).data
        let off = 0, total = 0
        const test = (band: Uint8ClampedArray) => {
          for (let i = 0; i < band.length; i += 16) {
            total++
            const dr = band[i] - targetRgb.r
            const dg = band[i + 1] - targetRgb.g
            const db = band[i + 2] - targetRgb.b
            if (Math.sqrt(dr * dr + dg * dg + db * db) > 30) off++
          }
        }
        test(topBand); test(leftBand); test(rightBand)
        const offRatio = total > 0 ? off / total : 0
        if (offRatio > 0.03) {
          setBgQualityIssue(`Background has ${Math.round(offRatio * 100)}% off-colour pixels (mask artefacts). Consider retaking the photo against a plainer wall for a cleaner ID card.`)
        } else {
          setBgQualityIssue("")
        }
      } catch {
        setBgQualityIssue("")
      }

      const resultUrl = fCtx
        ? finalCanvas.toDataURL("image/jpeg", 0.95)
        : canvas.toDataURL("image/jpeg", 0.95)
      setProcessedUrl(resultUrl)
    }
    img.src = transparentUrl
  }, [])

  useEffect(() => {
    if (removedBgUrl) {
      applyBackground(removedBgUrl, schoolBgColor)
    }
  }, [schoolBgColor, removedBgUrl, applyBackground])

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

  useEffect(() => {
    if (autoConfirm && processedUrl && !processing && !autoConfirmedRef.current) {
      autoConfirmedRef.current = true
      onProcessed(processedUrl)
    }
  }, [autoConfirm, processedUrl, processing, onProcessed])

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
        Preparing Your Photo
      </div>
      <p style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
        Please wait — we are making the background the same colour for every student
        {schoolBgColor && (
          <>
            {" "}
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle',
            }}>
              <span style={{
                display: 'inline-block', width: 12, height: 12, borderRadius: 3,
                background: schoolBgColor, border: '1px solid rgba(0,0,0,0.12)',
              }} />
              <code style={{ fontSize: 11 }}>{schoolBgColor.toUpperCase()}</code>
            </span>
          </>
        )}
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
            {progress < 40 ? "First time may take a little longer" : `${Math.round(progress)}%`}
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

      {/* Result Preview — manual confirm only when autoConfirm is off */}
      {!processing && processedUrl && !autoConfirm && (
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

          {bgQualityIssue && (
            <div style={{
              padding: '10px 14px', background: '#fffbeb',
              border: '1px solid #fde68a', borderRadius: 10,
              marginBottom: 16, fontSize: 12, color: '#92400e',
              display: 'flex', alignItems: 'flex-start', gap: 8,
            }}>
              <span style={{ flexShrink: 0, fontSize: 16 }}>⚠️</span>
              <div style={{ lineHeight: 1.5 }}>
                <strong>Background not fully clean</strong>
                <div style={{ marginTop: 2 }}>{bgQualityIssue}</div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={onSkip}
              className="btn btn-outline"
              style={{ flex: '1 1 140px', justifyContent: 'center', whiteSpace: 'normal', lineHeight: 1.35, minHeight: 44 }}
            >
              Use Original Instead
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="btn btn-primary"
              style={{
                flex: '2 1 180px', justifyContent: 'center',
                background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                whiteSpace: 'normal', lineHeight: 1.35, minHeight: 44, padding: '12px 16px',
              }}
            >
              Use Processed Photo
            </button>
          </div>
        </>
      )}

      {!processing && processedUrl && autoConfirm && (
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <div className="login-spinner" style={{
            width: 28, height: 28,
            borderColor: 'rgba(34,197,94,0.2)', borderTopColor: '#22c55e',
            margin: '0 auto 10px'
          }} />
          <div style={{ fontSize: 13, fontWeight: 600, color: '#16a34a' }}>
            Photo ready — continuing…
          </div>
          {bgQualityIssue && (
            <div style={{
              marginTop: 12, padding: '10px 14px', background: '#fffbeb',
              border: '1px solid #fde68a', borderRadius: 10,
              fontSize: 12, color: '#92400e', textAlign: 'left', lineHeight: 1.5,
            }}>
              <strong>Tip:</strong> {bgQualityIssue}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
