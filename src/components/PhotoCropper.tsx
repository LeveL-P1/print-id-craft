"use client"
import { useState, useRef, useEffect, useCallback } from "react"

type Props = {
  /** Data URL or blob URL of the image to crop. */
  photoUrl: string
  /** Aspect ratio width / height (default 3/4 = passport portrait). */
  aspectRatio?: number
  /** Called when the user accepts a crop. Receives a JPEG data URL. */
  onCropped: (croppedDataUrl: string) => void
  /** Called when the user cancels / wants the un-cropped image. */
  onCancel: () => void
}

type Rect = { x: number; y: number; w: number; h: number }

const CROP_OUTPUT_MAX_WIDTH = 720
const CROP_JPEG_QUALITY = 0.88
const MAX_VIEWPORT_WIDTH = 480
const MAX_VIEWPORT_HEIGHT_RATIO = 0.58
const MIN_IMAGE_SCALE = 0.5
const MAX_IMAGE_SCALE = 3
const DEFAULT_CROP_FRACTION = 0.72

function fitImageViewport(
  naturalW: number,
  naturalH: number,
  maxW: number,
  maxH: number
): { w: number; h: number } {
  const iAspect = naturalW / naturalH
  if (iAspect >= maxW / maxH) {
    return { w: maxW, h: maxW / iAspect }
  }
  return { w: maxH * iAspect, h: maxH }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function defaultCropRect(imgBox: Rect, aspectRatio: number): Rect {
  let cropW = imgBox.w * DEFAULT_CROP_FRACTION
  let cropH = cropW / aspectRatio
  if (cropH > imgBox.h * DEFAULT_CROP_FRACTION) {
    cropH = imgBox.h * DEFAULT_CROP_FRACTION
    cropW = cropH * aspectRatio
  }
  cropW = Math.min(cropW, imgBox.w)
  cropH = Math.min(cropH, imgBox.h)
  return {
    x: imgBox.x + (imgBox.w - cropW) / 2,
    y: imgBox.y + (imgBox.h - cropH) / 2,
    w: cropW,
    h: cropH,
  }
}

/**
 * PhotoCropper — interactive crop UI with a fixed aspect ratio.
 * Supports zoom/pan on the source image so parents can see the entire
 * photo and frame the crop box anywhere on it.
 */
export default function PhotoCropper({
  photoUrl,
  aspectRatio = 3 / 4,
  onCropped,
  onCancel,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [viewport, setViewport] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const [imgBox, setImgBox] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 })
  const [crop, setCrop] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 })
  const [natural, setNatural] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const [imageScale, setImageScale] = useState(1)
  const [imagePan, setImagePan] = useState({ x: 0, y: 0 })
  const [showFullPreview, setShowFullPreview] = useState(false)
  const [dragMode, setDragMode] = useState<
    | { kind: "move"; startX: number; startY: number; orig: Rect }
    | { kind: "resize"; corner: "tl" | "tr" | "bl" | "br"; startX: number; startY: number; orig: Rect }
    | { kind: "pan"; startX: number; startY: number; origPan: { x: number; y: number } }
    | null
  >(null)
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null)

  const computeImgBox = useCallback(
    (vp: { w: number; h: number }, scale: number, pan: { x: number; y: number }): Rect => {
      const sw = vp.w * scale
      const sh = vp.h * scale
      return {
        x: (vp.w - sw) / 2 + pan.x,
        y: (vp.h - sh) / 2 + pan.y,
        w: sw,
        h: sh,
      }
    },
    []
  )

  const clampCrop = useCallback(
    (r: Rect, bounds: Rect): Rect => {
      const minW = 40
      const minH = minW / aspectRatio
      let w = Math.max(minW, Math.min(r.w, bounds.w))
      let h = Math.max(minH, Math.min(r.h, bounds.h))
      if (Math.abs(w / h - aspectRatio) > 0.01) {
        if (w / aspectRatio <= bounds.h) h = w / aspectRatio
        else w = h * aspectRatio
      }
      const x = Math.max(bounds.x, Math.min(r.x, bounds.x + bounds.w - w))
      const y = Math.max(bounds.y, Math.min(r.y, bounds.y + bounds.h - h))
      return { x, y, w, h }
    },
    [aspectRatio]
  )

  const layout = useCallback(() => {
    const container = containerRef.current
    const img = imgRef.current
    if (!container || !img || !img.naturalWidth) return

    const parentW = container.parentElement?.getBoundingClientRect().width ?? MAX_VIEWPORT_WIDTH
    const maxW = Math.min(
      MAX_VIEWPORT_WIDTH,
      parentW,
      typeof window !== "undefined" ? window.innerWidth - 48 : MAX_VIEWPORT_WIDTH
    )
    const maxH = typeof window !== "undefined"
      ? Math.min(window.innerHeight * MAX_VIEWPORT_HEIGHT_RATIO, 560)
      : 560

    const { w: dispW, h: dispH } = fitImageViewport(
      img.naturalWidth,
      img.naturalHeight,
      maxW,
      maxH
    )

    const vp = { w: dispW, h: dispH }
    setViewport(vp)
    setNatural({ w: img.naturalWidth, h: img.naturalHeight })
    setImageScale(1)
    setImagePan({ x: 0, y: 0 })

    const box = computeImgBox(vp, 1, { x: 0, y: 0 })
    setImgBox(box)
    setCrop(defaultCropRect(box, aspectRatio))
  }, [aspectRatio, computeImgBox])

  useEffect(() => {
    if (!viewport.w) return
    const box = computeImgBox(viewport, imageScale, imagePan)
    setImgBox(box)
    setCrop((prev) => (prev.w > 0 ? clampCrop(prev, box) : defaultCropRect(box, aspectRatio)))
  }, [viewport, imageScale, imagePan, computeImgBox, clampCrop, aspectRatio])

  useEffect(() => {
    if (typeof window === "undefined") return
    const onResize = () => layout()
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [layout])

  const fitEntirePhoto = () => {
    setShowFullPreview(false)
    setImageScale(1)
    setImagePan({ x: 0, y: 0 })
    if (viewport.w) {
      const box = computeImgBox(viewport, 1, { x: 0, y: 0 })
      setImgBox(box)
      setCrop(defaultCropRect(box, aspectRatio))
    }
  }

  const adjustZoom = (delta: number) => {
    setShowFullPreview(false)
    setImageScale((s) => clamp(Number((s + delta).toFixed(2)), MIN_IMAGE_SCALE, MAX_IMAGE_SCALE))
  }

  const onPointerDown = (e: React.PointerEvent, kind: "move" | "tl" | "tr" | "bl" | "br" | "pan") => {
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    if (kind === "pan") {
      setDragMode({ kind: "pan", startX: e.clientX, startY: e.clientY, origPan: imagePan })
    } else if (kind === "move") {
      setDragMode({ kind: "move", startX: e.clientX, startY: e.clientY, orig: crop })
    } else {
      setDragMode({ kind: "resize", corner: kind, startX: e.clientX, startY: e.clientY, orig: crop })
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragMode) return
    const dx = e.clientX - dragMode.startX
    const dy = e.clientY - dragMode.startY

    if (dragMode.kind === "pan") {
      setImagePan({
        x: dragMode.origPan.x + dx,
        y: dragMode.origPan.y + dy,
      })
      return
    }

    if (dragMode.kind === "move") {
      setCrop(clampCrop({ ...dragMode.orig, x: dragMode.orig.x + dx, y: dragMode.orig.y + dy }, imgBox))
      return
    }

    const o = dragMode.orig
    const right = o.x + o.w
    const bottom = o.y + o.h
    let nx = o.x, ny = o.y, nw = o.w, nh = o.h
    if (dragMode.corner === "br") {
      nw = o.w + dx
      nh = nw / aspectRatio
    } else if (dragMode.corner === "tr") {
      nw = o.w + dx
      nh = nw / aspectRatio
      ny = bottom - nh
    } else if (dragMode.corner === "bl") {
      nw = o.w - dx
      nh = nw / aspectRatio
      nx = right - nw
    } else if (dragMode.corner === "tl") {
      nw = o.w - dx
      nh = nw / aspectRatio
      nx = right - nw
      ny = bottom - nh
    }
    setCrop(clampCrop({ x: nx, y: ny, w: nw, h: nh }, imgBox))
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (dragMode) {
      try { (e.target as HTMLElement).releasePointerCapture(e.pointerId) } catch { /* ignore */ }
    }
    setDragMode(null)
  }

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]]
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
      pinchRef.current = { dist, scale: imageScale }
    }
  }

  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length !== 2 || !pinchRef.current) return
    e.preventDefault()
    const [a, b] = [e.touches[0], e.touches[1]]
    const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
    const next = pinchRef.current.scale * (dist / pinchRef.current.dist)
    setImageScale(clamp(Number(next.toFixed(2)), MIN_IMAGE_SCALE, MAX_IMAGE_SCALE))
    setShowFullPreview(false)
  }

  const onTouchEnd = () => {
    pinchRef.current = null
  }

  const handleConfirm = () => {
    if (!natural.w || !imgBox.w) return
    const scaleX = natural.w / imgBox.w
    const scaleY = natural.h / imgBox.h
    const sx = Math.max(0, Math.round((crop.x - imgBox.x) * scaleX))
    const sy = Math.max(0, Math.round((crop.y - imgBox.y) * scaleY))
    const sw = Math.max(1, Math.round(crop.w * scaleX))
    const sh = Math.max(1, Math.round(crop.h * scaleY))
    const img = imgRef.current
    if (!img) return
    const outputScale = Math.min(1, CROP_OUTPUT_MAX_WIDTH / sw)
    const outputW = Math.max(1, Math.round(sw * outputScale))
    const outputH = Math.max(1, Math.round(sh * outputScale))
    const canvas = document.createElement("canvas")
    canvas.width = outputW
    canvas.height = outputH
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outputW, outputH)
    onCropped(canvas.toDataURL("image/jpeg", CROP_JPEG_QUALITY))
  }

  const handleStyle: React.CSSProperties = {
    position: "absolute",
    width: 16,
    height: 16,
    background: "#fff",
    border: "2px solid #3b82f6",
    borderRadius: 3,
    cursor: "nwse-resize",
    touchAction: "none",
    zIndex: 4,
  }

  const aspectLabel = aspectRatio === 3 / 4 ? "3:4" : `${aspectRatio.toFixed(2)}:1`
  const zoomPercent = Math.round(imageScale * 100)

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 10,
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        <button
          type="button"
          onClick={() => adjustZoom(-0.15)}
          style={toolBtnStyle}
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          onClick={fitEntirePhoto}
          style={{ ...toolBtnStyle, flex: "1 1 140px", maxWidth: 220, fontWeight: 700, color: "#1d4ed8" }}
        >
          Fit entire photo
        </button>
        <button
          type="button"
          onClick={() => adjustZoom(0.15)}
          style={toolBtnStyle}
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => setShowFullPreview((v) => !v)}
          style={{
            ...toolBtnStyle,
            flex: "1 1 120px",
            background: showFullPreview ? "#dbeafe" : "#f8fafc",
            color: showFullPreview ? "#1d4ed8" : "#475569",
          }}
        >
          {showFullPreview ? "Back to crop" : "Preview full photo"}
        </button>
      </div>

      <div style={{ fontSize: 11, color: "#64748b", textAlign: "center", marginBottom: 8 }}>
        Zoom {zoomPercent}% · Pinch or use −/+ · Drag dark area to move photo
      </div>

      <div
        ref={containerRef}
        style={{
          position: "relative",
          width: viewport.w ? `${viewport.w}px` : "100%",
          height: viewport.h ? `${viewport.h}px` : 280,
          maxWidth: "100%",
          margin: "0 auto",
          background: "#0f172a",
          borderRadius: 12,
          overflow: "hidden",
          userSelect: "none",
          touchAction: "none",
        }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <img
          ref={imgRef}
          src={photoUrl}
          alt="Crop source"
          crossOrigin="anonymous"
          onLoad={layout}
          draggable={false}
          style={{
            position: "absolute",
            left: imgBox.x,
            top: imgBox.y,
            width: imgBox.w || "100%",
            height: imgBox.h || "100%",
            pointerEvents: "none",
            objectFit: "fill",
          }}
        />

        {!showFullPreview && crop.w > 0 && (
          <>
            <div
              style={{ position: "absolute", left: 0, top: 0, right: 0, height: crop.y, background: "rgba(0,0,0,0.55)", cursor: "grab", touchAction: "none" }}
              onPointerDown={(e) => onPointerDown(e, "pan")}
            />
            <div
              style={{ position: "absolute", left: 0, top: crop.y, width: crop.x, height: crop.h, background: "rgba(0,0,0,0.55)", cursor: "grab", touchAction: "none" }}
              onPointerDown={(e) => onPointerDown(e, "pan")}
            />
            <div
              style={{ position: "absolute", left: crop.x + crop.w, top: crop.y, right: 0, height: crop.h, background: "rgba(0,0,0,0.55)", cursor: "grab", touchAction: "none" }}
              onPointerDown={(e) => onPointerDown(e, "pan")}
            />
            <div
              style={{ position: "absolute", left: 0, top: crop.y + crop.h, right: 0, bottom: 0, background: "rgba(0,0,0,0.55)", cursor: "grab", touchAction: "none" }}
              onPointerDown={(e) => onPointerDown(e, "pan")}
            />

            <div
              onPointerDown={(e) => onPointerDown(e, "move")}
              style={{
                position: "absolute",
                left: crop.x,
                top: crop.y,
                width: crop.w,
                height: crop.h,
                border: "2px solid #3b82f6",
                boxShadow: "0 0 0 1px rgba(255,255,255,0.5) inset",
                cursor: "move",
                touchAction: "none",
                zIndex: 3,
              }}
            >
              <div style={{ position: "absolute", left: "33.33%", top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.35)", pointerEvents: "none" }} />
              <div style={{ position: "absolute", left: "66.66%", top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.35)", pointerEvents: "none" }} />
              <div style={{ position: "absolute", top: "33.33%", left: 0, right: 0, height: 1, background: "rgba(255,255,255,0.35)", pointerEvents: "none" }} />
              <div style={{ position: "absolute", top: "66.66%", left: 0, right: 0, height: 1, background: "rgba(255,255,255,0.35)", pointerEvents: "none" }} />
            </div>

            <div style={{ ...handleStyle, left: crop.x - 8, top: crop.y - 8 }} onPointerDown={(e) => onPointerDown(e, "tl")} />
            <div style={{ ...handleStyle, left: crop.x + crop.w - 8, top: crop.y - 8 }} onPointerDown={(e) => onPointerDown(e, "tr")} />
            <div style={{ ...handleStyle, left: crop.x - 8, top: crop.y + crop.h - 8 }} onPointerDown={(e) => onPointerDown(e, "bl")} />
            <div style={{ ...handleStyle, left: crop.x + crop.w - 8, top: crop.y + crop.h - 8 }} onPointerDown={(e) => onPointerDown(e, "br")} />
          </>
        )}
      </div>

      <div style={{ marginTop: 10, fontSize: 11, color: "#64748b", textAlign: "center", lineHeight: 1.5 }}>
        {showFullPreview
          ? "Full photo preview — tap Back to crop when ready."
          : `Move crop box · Resize corners · Pan photo on dark area · Aspect ${aspectLabel}`}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button type="button" onClick={onCancel} style={secondaryBtnStyle}>
          Skip Cropping
        </button>
        <button type="button" onClick={handleConfirm} style={primaryBtnStyle}>
          ✓ Apply Crop
        </button>
      </div>
    </div>
  )
}

const toolBtnStyle: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: 13,
  fontWeight: 600,
  background: "#f8fafc",
  color: "#334155",
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  cursor: "pointer",
  minWidth: 44,
}

const secondaryBtnStyle: React.CSSProperties = {
  flex: 1,
  padding: "11px",
  fontSize: 13,
  fontWeight: 600,
  background: "#f1f5f9",
  color: "#475569",
  border: "none",
  borderRadius: 10,
  cursor: "pointer",
}

const primaryBtnStyle: React.CSSProperties = {
  flex: 2,
  padding: "11px",
  fontSize: 13,
  fontWeight: 700,
  background: "linear-gradient(135deg, #3b82f6, #6366f1)",
  color: "white",
  border: "none",
  borderRadius: 10,
  cursor: "pointer",
}
