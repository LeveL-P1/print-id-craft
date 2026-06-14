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

/**
 * PhotoCropper — interactive crop UI with a fixed aspect ratio.
 *
 * The user drags the crop box to reposition it and drags its corner
 * handles to resize. The box stays inside the image bounds and locks
 * to the configured aspect ratio. On confirm, the selected region is
 * rasterised to a JPEG data URL via an off-screen canvas at the
 * image's natural resolution (no upscaling).
 *
 * Mouse + touch supported. Designed to be lightweight (no external
 * deps) and used inside the public submission flow.
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
  // Rendered image bounds inside the container (CSS px). When the viewport
  // matches the photo aspect ratio this covers the full image.
  const [imgBox, setImgBox] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 })
  const [crop, setCrop] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 })
  const [natural, setNatural] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const [dragMode, setDragMode] = useState<
    | { kind: "move"; startX: number; startY: number; orig: Rect }
    | { kind: "resize"; corner: "tl" | "tr" | "bl" | "br"; startX: number; startY: number; orig: Rect }
    | null
  >(null)

  // ─── Initial layout: position a default crop box that covers ~80% of
  //     the image, centred, with the configured aspect ratio. ───
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

    setViewport({ w: dispW, h: dispH })
    setNatural({ w: img.naturalWidth, h: img.naturalHeight })

    const box: Rect = { x: 0, y: 0, w: dispW, h: dispH }
    setImgBox(box)

    // Default crop: centred portrait frame, clamped to the full photo bounds.
    let cropW = Math.min(dispW, dispH * aspectRatio)
    let cropH = cropW / aspectRatio
    if (cropH > dispH) {
      cropH = dispH
      cropW = cropH * aspectRatio
    }
    setCrop({
      x: (dispW - cropW) / 2,
      y: (dispH - cropH) / 2,
      w: cropW,
      h: cropH,
    })
  }, [aspectRatio])

  useEffect(() => {
    if (typeof window === "undefined") return
    const onResize = () => layout()
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [layout])

  // ─── Clamp the crop box inside the displayed image bounds. ───
  const clamp = (r: Rect): Rect => {
    const minW = 40
    const minH = minW / aspectRatio
    let w = Math.max(minW, Math.min(r.w, imgBox.w))
    let h = Math.max(minH, Math.min(r.h, imgBox.h))
    // Re-lock aspect after clamping w/h independently.
    if (Math.abs(w / h - aspectRatio) > 0.01) {
      if (w / aspectRatio <= imgBox.h) h = w / aspectRatio
      else w = h * aspectRatio
    }
    let x = Math.max(imgBox.x, Math.min(r.x, imgBox.x + imgBox.w - w))
    let y = Math.max(imgBox.y, Math.min(r.y, imgBox.y + imgBox.h - h))
    return { x, y, w, h }
  }

  // ─── Pointer handlers (works for mouse & touch via pointer events). ───
  const onPointerDown = (e: React.PointerEvent, kind: "move" | "tl" | "tr" | "bl" | "br") => {
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    if (kind === "move") {
      setDragMode({ kind: "move", startX: e.clientX, startY: e.clientY, orig: crop })
    } else {
      setDragMode({ kind: "resize", corner: kind, startX: e.clientX, startY: e.clientY, orig: crop })
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragMode) return
    const dx = e.clientX - dragMode.startX
    const dy = e.clientY - dragMode.startY
    if (dragMode.kind === "move") {
      setCrop(clamp({ ...dragMode.orig, x: dragMode.orig.x + dx, y: dragMode.orig.y + dy }))
      return
    }
    // Resize: drag the chosen corner. We keep the OPPOSITE corner pinned
    // and recompute width/height while locking aspect.
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
    setCrop(clamp({ x: nx, y: ny, w: nw, h: nh }))
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (dragMode) {
      try { (e.target as HTMLElement).releasePointerCapture(e.pointerId) } catch { /* ignore */ }
    }
    setDragMode(null)
  }

  // ─── Confirm: rasterise the selected crop at the image's native
  //     resolution and return a JPEG data URL. ───
  const handleConfirm = () => {
    if (!natural.w || !imgBox.w) return
    // Map crop (in CSS px relative to container) → image natural px.
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
    const dataUrl = canvas.toDataURL("image/jpeg", CROP_JPEG_QUALITY)
    onCropped(dataUrl)
  }

  // ─── Handle styles ───
  const handleStyle: React.CSSProperties = {
    position: "absolute",
    width: 14,
    height: 14,
    background: "#fff",
    border: "2px solid #3b82f6",
    borderRadius: 3,
    cursor: "nwse-resize",
    touchAction: "none",
  }

  const aspectLabel = aspectRatio === 3 / 4 ? "3:4" : `${aspectRatio.toFixed(2)}:1`

  return (
    <div>
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
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "contain",
            pointerEvents: "none",
          }}
        />

        {/* Darkened mask outside the crop rectangle. We achieve this with
            four absolutely-positioned overlays around the crop box rather
            than SVG so we don't need an extra canvas. */}
        {crop.w > 0 && (
          <>
            <div style={{ position: "absolute", left: 0, top: 0, right: 0, height: crop.y, background: "rgba(0,0,0,0.55)", pointerEvents: "none" }} />
            <div style={{ position: "absolute", left: 0, top: crop.y, width: crop.x, height: crop.h, background: "rgba(0,0,0,0.55)", pointerEvents: "none" }} />
            <div style={{ position: "absolute", left: crop.x + crop.w, top: crop.y, right: 0, height: crop.h, background: "rgba(0,0,0,0.55)", pointerEvents: "none" }} />
            <div style={{ position: "absolute", left: 0, top: crop.y + crop.h, right: 0, bottom: 0, background: "rgba(0,0,0,0.55)", pointerEvents: "none" }} />

            {/* Crop frame */}
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
              }}
            >
              {/* Rule of thirds guides */}
              <div style={{ position: "absolute", left: "33.33%", top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.35)", pointerEvents: "none" }} />
              <div style={{ position: "absolute", left: "66.66%", top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.35)", pointerEvents: "none" }} />
              <div style={{ position: "absolute", top: "33.33%", left: 0, right: 0, height: 1, background: "rgba(255,255,255,0.35)", pointerEvents: "none" }} />
              <div style={{ position: "absolute", top: "66.66%", left: 0, right: 0, height: 1, background: "rgba(255,255,255,0.35)", pointerEvents: "none" }} />
            </div>

            {/* Corner resize handles. Positioned in container coords so
                pointer events don't conflict with the drag-to-move frame. */}
            <div style={{ ...handleStyle, left: crop.x - 7, top: crop.y - 7, cursor: "nwse-resize" }} onPointerDown={(e) => onPointerDown(e, "tl")} />
            <div style={{ ...handleStyle, left: crop.x + crop.w - 7, top: crop.y - 7, cursor: "nesw-resize" }} onPointerDown={(e) => onPointerDown(e, "tr")} />
            <div style={{ ...handleStyle, left: crop.x - 7, top: crop.y + crop.h - 7, cursor: "nesw-resize" }} onPointerDown={(e) => onPointerDown(e, "bl")} />
            <div style={{ ...handleStyle, left: crop.x + crop.w - 7, top: crop.y + crop.h - 7, cursor: "nwse-resize" }} onPointerDown={(e) => onPointerDown(e, "br")} />
          </>
        )}
      </div>

      <div style={{ marginTop: 10, fontSize: 11, color: "#64748b", textAlign: "center", lineHeight: 1.5 }}>
        Drag the box to move · Drag corners to resize · Crop anywhere on the full photo · Aspect locked to {aspectLabel}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button
          onClick={onCancel}
          style={{
            flex: 1,
            padding: "11px",
            fontSize: 13,
            fontWeight: 600,
            background: "#f1f5f9",
            color: "#475569",
            border: "none",
            borderRadius: 10,
            cursor: "pointer",
          }}
        >
          Skip Cropping
        </button>
        <button
          onClick={handleConfirm}
          style={{
            flex: 2,
            padding: "11px",
            fontSize: 13,
            fontWeight: 700,
            background: "linear-gradient(135deg, #3b82f6, #6366f1)",
            color: "white",
            border: "none",
            borderRadius: 10,
            cursor: "pointer",
          }}
        >
          ✓ Apply Crop
        </button>
      </div>
    </div>
  )
}
