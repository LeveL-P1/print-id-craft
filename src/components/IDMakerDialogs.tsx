"use client"
import { useState, useEffect, useRef, useCallback } from "react"
import { createPortal } from "react-dom"

// Render children into document.body so position:fixed overlays can never be
// clipped or repositioned by transformed/filtered ancestors (the modal would
// otherwise be confined to its parent's bounding box and look "stuck").
function BodyPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted || typeof document === "undefined") return null
  return createPortal(children, document.body)
}

// ─────────────────────────────────────────────────────────────
// Shared dialog shell (Windows-style classic look)
// ─────────────────────────────────────────────────────────────
function DialogShell({
  title,
  children,
  onClose,
  width = 420,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
  width?: number
}) {
  const dialogRef = useRef<HTMLDivElement>(null)

  // Escape key to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  // Lock body scroll while dialog is open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = prev }
  }, [])

  // Auto-focus dialog on mount for accessibility
  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  return (
    <BodyPortal>
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        zIndex: 9999,
        padding: "clamp(8px, 3vh, 24px) 12px",
        overflowY: "auto",
        animation: "idm-fadein .15s ease-out",
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <style>{`@keyframes idm-fadein{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}`}</style>
      <div
        ref={dialogRef}
        tabIndex={-1}
        style={{
          width: `min(${width}px, 96vw)`,
          maxWidth: "95vw",
          maxHeight: "calc(100dvh - 24px)",
          margin: "auto 0",
          display: "flex",
          flexDirection: "column",
          background: "#d4d0c8",
          border: "2px solid",
          borderColor: "#ffffff #808080 #808080 #ffffff",
          boxShadow: "2px 2px 8px rgba(0,0,0,0.4)",
          fontFamily: "Tahoma, Arial, sans-serif",
          fontSize: 12,
          outline: "none",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title bar */}
        <div
          style={{
            background: "linear-gradient(to right, #000080, #1084d0)",
            color: "white",
            padding: "3px 6px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 12,
            fontWeight: 700,
            userSelect: "none",
            flexShrink: 0,
          }}
        >
          <span>{title}</span>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            style={{
              width: 16,
              height: 14,
              background: "#d4d0c8",
              border: "1px solid",
              borderColor: "#ffffff #808080 #808080 #ffffff",
              color: "black",
              fontSize: 9,
              fontWeight: 900,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
              padding: 0,
            }}
          >
            ✕
          </button>
        </div>
        {/* Body — scrolls on small screens */}
        <div style={{ padding: "clamp(12px, 2.5vw, 20px)", overflowY: "auto", flex: 1, minHeight: 0 }}>{children}</div>
      </div>
    </div>
    </BodyPortal>
  )
}

// Classic Windows-style button
function WinButton({
  onClick,
  children,
  style,
  disabled,
}: {
  onClick?: () => void
  children: React.ReactNode
  style?: React.CSSProperties
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        minWidth: 72,
        padding: "3px 10px",
        background: "#d4d0c8",
        border: "1px solid",
        borderColor: "#ffffff #808080 #808080 #ffffff",
        fontSize: 12,
        fontFamily: "Tahoma, Arial, sans-serif",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.6 : 1,
        transition: "opacity 0.1s",
        ...style,
      }}
      onMouseDown={(e) => {
        if (!disabled) {
          const btn = e.currentTarget
          btn.style.borderColor = "#808080 #ffffff #ffffff #808080"
        }
      }}
      onMouseUp={(e) => {
        const btn = e.currentTarget
        btn.style.borderColor = "#ffffff #808080 #808080 #ffffff"
      }}
      onMouseLeave={(e) => {
        const btn = e.currentTarget
        btn.style.borderColor = "#ffffff #808080 #808080 #ffffff"
      }}
    >
      {children}
    </button>
  )
}

// Classic Windows-style input
function WinInput({
  value,
  onChange,
  type = "text",
  style,
  placeholder,
  min,
  max,
  step,
}: {
  value: string | number
  onChange: (v: string) => void
  type?: string
  style?: React.CSSProperties
  placeholder?: string
  min?: number
  max?: number
  step?: number
}) {
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value
    // For number inputs, allow free typing without clamping on every
    // keystroke — clamping is only applied on blur so the user can
    // type multi-digit values like "85.6" without interference.
    if (type === "text") {
      v = v.replace(/[<>]/g, "")
    }
    onChange(v)
  }, [onChange, type])

  return (
    <input
      type={type}
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      min={min}
      max={max}
      step={step}
      autoComplete="off"
      spellCheck={false}
      style={{
        border: "1px solid",
        borderColor: "#808080 #ffffff #ffffff #808080",
        background: "white",
        padding: "2px 4px",
        fontFamily: "Tahoma, Arial, sans-serif",
        fontSize: 12,
        outline: "none",
        maxWidth: "100%",
        boxSizing: "border-box",
        ...style,
      }}
    />
  )
}

// ─────────────────────────────────────────────────────────────
// 1. ID SIZE DIALOG  (Step 2)
// ─────────────────────────────────────────────────────────────
export type IdSizeConfig = {
  preset: string
  width: number
  height: number
  orientation: "horizontal" | "vertical"
  sides: "one" | "both"
}

const ID_SIZE_PRESETS: Record<string, { width: number; height: number; label: string }> = {
  "Custom": { width: 85.6, height: 53.98, label: "Custom" },
  "CR-80 Horizontal": { width: 85.6, height: 53.98, label: "CR-80 Horizontal" },
  "CR-80 Vertical": { width: 53.98, height: 85.6, label: "CR-80 Vertical" },
  "School ID (100×58)": { width: 100, height: 58, label: "School ID (100×58)" },
  "A4 Third": { width: 99, height: 55, label: "A4 Third" },
}

export function IdSizeDialog({
  initial,
  onOk,
  onLoadTemplate,
  onClose,
}: {
  initial?: Partial<IdSizeConfig>
  onOk: (cfg: IdSizeConfig) => void
  onLoadTemplate: (cfg: IdSizeConfig) => void
  onClose: () => void
}) {
  const [preset, setPreset] = useState(initial?.preset || "School ID (100×58)")
  const [width, setWidth] = useState<number | string>(initial?.width ?? 100)
  const [height, setHeight] = useState<number | string>(initial?.height ?? 58)
  const [orientation, setOrientation] = useState<"horizontal" | "vertical">(
    initial?.orientation || "horizontal"
  )
  const [sides, setSides] = useState<"one" | "both">(initial?.sides || "one")

  const handlePresetChange = (key: string) => {
    setPreset(key)
    if (key !== "Custom") {
      const p = ID_SIZE_PRESETS[key]
      setWidth(p.width)
      setHeight(p.height)
      if (p.width > p.height) setOrientation("horizontal")
      else setOrientation("vertical")
    }
  }

  const cfg = (): IdSizeConfig => ({ preset, width: Number(width) || 0, height: Number(height) || 0, orientation, sides })

  return (
    <DialogShell title="Id Size" onClose={onClose} width={370}>
      <div style={{ fontSize: 14, fontWeight: 700, textAlign: "center", marginBottom: 14, color: "#000080" }}>
        Enter Id-Size in MM
      </div>

      {/* Select ID Size */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <label style={{ width: 100, textAlign: "right", flexShrink: 0 }}>Select ID Size</label>
        <select
          value={preset}
          onChange={(e) => handlePresetChange(e.target.value)}
          style={{
            flex: 1,
            border: "1px solid",
            borderColor: "#808080 #ffffff #ffffff #808080",
            background: "#003087",
            color: "white",
            padding: "2px 4px",
            fontFamily: "Tahoma, Arial, sans-serif",
            fontSize: 12,
          }}
        >
          {Object.keys(ID_SIZE_PRESETS).map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
      </div>

      {/* Width */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <label style={{ width: 100, textAlign: "right", flexShrink: 0 }}>Width</label>
        <WinInput
          type="number"
          value={width}
          onChange={(v) => { setWidth(v); setPreset("Custom") }}
          style={{ width: 70 }}
          min={10}
          max={500}
          step={0.1}
        />
        <span style={{ color: "#444" }}>(in mm Only)</span>
      </div>

      {/* Height */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <label style={{ width: 100, textAlign: "right", flexShrink: 0 }}>Height</label>
        <WinInput
          type="number"
          value={height}
          onChange={(v) => { setHeight(v); setPreset("Custom") }}
          style={{ width: 70 }}
          min={10}
          max={500}
          step={0.1}
        />
        <span style={{ color: "#444" }}>(in mm Only)</span>
      </div>

      {/* Orientation (via Width/Height — implicit) */}
      <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 12, paddingLeft: 108 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
          <input
            type="radio"
            name="orient"
            checked={orientation === "horizontal"}
            onChange={() => setOrientation("horizontal")}
          />
          Horizontal
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
          <input
            type="radio"
            name="orient"
            checked={orientation === "vertical"}
            onChange={() => setOrientation("vertical")}
          />
          Vertical
        </label>
      </div>

      {/* Sides */}
      <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 16, paddingLeft: 108 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
          <input
            type="radio"
            name="sides"
            checked={sides === "one"}
            onChange={() => setSides("one")}
          />
          One Side Only
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
          <input
            type="radio"
            name="sides"
            checked={sides === "both"}
            onChange={() => setSides("both")}
          />
          Both Side
        </label>
      </div>

      {/* Buttons */}
      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        <WinButton onClick={() => onOk(cfg())}>Ok</WinButton>
        <WinButton onClick={() => onLoadTemplate(cfg())}>Load Template</WinButton>
        <WinButton onClick={onClose}>Close</WinButton>
      </div>
    </DialogShell>
  )
}

// ─────────────────────────────────────────────────────────────
// 2. FONT DIALOG  (exact screenshot match)
// ─────────────────────────────────────────────────────────────
const NARROW_STYLE_FONTS = /(narrow|condensed|century gothic)/i

const FONT_LIST = [
  "Microsoft Sans Serif", "Arial", "Arial Narrow", "Helvetica", "Tahoma", "Verdana",
  "Times New Roman", "Georgia", "Courier New", "Impact", "Mohol",
  "Modern No. 20", "Monotype Corsiva", "Montserrat",
  "Roboto", "Roboto Condensed", "Open Sans", "Lato", "Poppins", "Raleway",
  "Oswald", "PT Sans Narrow", "Century Gothic",
  "Noto Sans Devanagari", "Noto Sans",
]
const FONT_STYLES = ["Regular", "Italic", "Bold", "Bold Italic", "Narrow Bold"]
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 48, 72]

export type FontConfig = {
  fontFamily: string
  fontStyle: string
  fontSize: number
  strikeout: boolean
  underline: boolean
}

export function FontDialog({
  initial,
  onOk,
  onCancel,
  onChange,
}: {
  initial: FontConfig
  onOk: (cfg: FontConfig) => void
  onCancel: () => void
  onChange?: (cfg: FontConfig) => void
}) {
  const [fontFamily, setFontFamily] = useState(initial.fontFamily)
  const [fontStyle, setFontStyle] = useState(initial.fontStyle || "Regular")
  const [fontSize, setFontSize] = useState(initial.fontSize)
  const [sizeInput, setSizeInput] = useState(String(initial.fontSize))
  const [strikeout, setStrikeout] = useState(initial.strikeout || false)
  const [underline, setUnderline] = useState(initial.underline || false)

  // ✨ Live preview
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    onChange?.({ fontFamily, fontStyle, fontSize, strikeout, underline })
  }, [fontFamily, fontStyle, fontSize, strikeout, underline, onChange])

  const previewStyle: React.CSSProperties = {
    fontFamily: fontStyle.toLowerCase().includes("narrow") && !NARROW_STYLE_FONTS.test(fontFamily) ? "Arial Narrow" : fontFamily,
    fontSize: Math.min(fontSize, 24),
    fontWeight: fontStyle.toLowerCase().includes("bold") ? "bold" : "normal",
    fontStyle: fontStyle.toLowerCase().includes("italic") ? "italic" : "normal",
    textDecoration: underline ? "underline" : strikeout ? "line-through" : "none",
  }

  return (
    <DialogShell title="Font" onClose={onCancel} width={440}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {/* Font list */}
        <div style={{ flex: "2 1 140px", minWidth: 0 }}>
          <label style={{ fontSize: 11, fontWeight: 700, display: "block", marginBottom: 3 }}>Font</label>
          <WinInput
            value={fontFamily}
            onChange={setFontFamily}
            style={{ width: "100%", marginBottom: 3 }}
          />
          <div style={{
            height: 120, border: "1px solid", borderColor: "#808080 #ffffff #ffffff #808080",
            background: "white", overflowY: "auto",
          }}>
            {FONT_LIST.map((f) => (
              <div
                key={f}
                onClick={() => setFontFamily(f)}
                style={{
                  padding: "2px 4px", cursor: "pointer", fontSize: 12,
                  background: fontFamily === f ? "#000080" : "transparent",
                  color: fontFamily === f ? "white" : "black",
                }}
              >
                {f}
              </div>
            ))}
          </div>
        </div>

        {/* Style list */}
        <div style={{ flex: "1.2 1 90px", minWidth: 0 }}>
          <label style={{ fontSize: 11, fontWeight: 700, display: "block", marginBottom: 3 }}>Font Style</label>
          <WinInput
            value={fontStyle}
            onChange={setFontStyle}
            style={{ width: "100%", marginBottom: 3 }}
          />
          <div style={{
            height: 120, border: "1px solid", borderColor: "#808080 #ffffff #ffffff #808080",
            background: "white", overflowY: "auto",
          }}>
            {FONT_STYLES.map((s) => (
              <div
                key={s}
                onClick={() => setFontStyle(s)}
                style={{
                  padding: "2px 4px", cursor: "pointer", fontSize: 12,
                  fontWeight: s.toLowerCase().includes("bold") ? "bold" : "normal",
                  fontStyle: s.toLowerCase().includes("italic") ? "italic" : "normal",
                  background: fontStyle === s ? "#000080" : "transparent",
                  color: fontStyle === s ? "white" : "black",
                }}
              >
                {s}
              </div>
            ))}
          </div>
        </div>

        {/* Size list */}
        <div style={{ flex: "0.8 1 60px", minWidth: 0 }}>
          <label style={{ fontSize: 11, fontWeight: 700, display: "block", marginBottom: 3 }}>Size</label>
          <WinInput
            type="number"
            value={sizeInput}
            onChange={(v) => { setSizeInput(v); setFontSize(Number(v)) }}
            style={{ width: "100%", marginBottom: 3 }}
          />
          <div style={{
            height: 120, border: "1px solid", borderColor: "#808080 #ffffff #ffffff #808080",
            background: "white", overflowY: "auto",
          }}>
            {FONT_SIZES.map((s) => (
              <div
                key={s}
                onClick={() => { setFontSize(s); setSizeInput(String(s)) }}
                style={{
                  padding: "2px 4px", cursor: "pointer", fontSize: 12,
                  background: fontSize === s ? "#000080" : "transparent",
                  color: fontSize === s ? "white" : "black",
                }}
              >
                {s}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Effects */}
      <div style={{ marginTop: 12, border: "1px solid #808080", padding: "8px 10px" }}>
        <label style={{ fontSize: 11, fontWeight: 700, display: "block", marginBottom: 6 }}>Effects</label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, cursor: "pointer" }}>
          <input type="checkbox" checked={strikeout} onChange={(e) => setStrikeout(e.target.checked)} />
          Strikeout
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={underline} onChange={(e) => setUnderline(e.target.checked)} />
          Underline
        </label>
      </div>

      {/* Sample preview */}
      <div style={{ marginTop: 10, border: "1px solid #808080", padding: "6px 10px", minHeight: 48, background: "white" }}>
        <label style={{ fontSize: 10, color: "#666", display: "block", marginBottom: 4 }}>Sample</label>
        <div style={previewStyle}>AaBbYyZz</div>
      </div>

      {/* Script row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
        <label style={{ fontSize: 11, fontWeight: 700 }}>Script</label>
        <select style={{
          border: "1px solid", borderColor: "#808080 #ffffff #ffffff #808080",
          background: "white", padding: "2px 4px", fontSize: 12,
          fontFamily: "Tahoma, Arial, sans-serif",
        }}>
          <option>Western</option>
          <option>Devanagari</option>
        </select>
      </div>

      {/* Buttons */}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
        <WinButton onClick={() => onOk({ fontFamily, fontStyle, fontSize, strikeout, underline })}>OK</WinButton>
        <WinButton onClick={onCancel}>Cancel</WinButton>
      </div>
    </DialogShell>
  )
}

// ─────────────────────────────────────────────────────────────
// 3. PHOTO SIZE DIALOG  (Image Properties > Set Photo Size)
// ─────────────────────────────────────────────────────────────
export type PhotoSizeConfig = {
  keepAspect: boolean
  width: number
  height: number
}

export function PhotoSizeDialog({
  initial,
  onOk,
  onCancel,
  onChange,
}: {
  initial: PhotoSizeConfig
  onOk: (cfg: PhotoSizeConfig) => void
  onCancel: () => void
  onChange?: (cfg: PhotoSizeConfig) => void
}) {
  const [keepAspect, setKeepAspect] = useState(initial.keepAspect)
  const [width, setWidth] = useState(initial.width)
  const [height, setHeight] = useState(initial.height)

  // ✨ Live preview
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    onChange?.({ keepAspect, width, height })
  }, [keepAspect, width, height, onChange])
  const aspectRatio = initial.width / initial.height

  const handleWidthChange = (v: string) => {
    const w = Number(v)
    setWidth(w)
    if (keepAspect) setHeight(Math.round(w / aspectRatio))
  }
  const handleHeightChange = (v: string) => {
    const h = Number(v)
    setHeight(h)
    if (keepAspect) setWidth(Math.round(h * aspectRatio))
  }

  return (
    <DialogShell title="Photo Size" onClose={onCancel} width={260}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Photo Size</div>
      <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, cursor: "pointer" }}>
        <input type="checkbox" checked={keepAspect} onChange={(e) => setKeepAspect(e.target.checked)} />
        Keep Aspect
      </label>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <label style={{ width: 60, textAlign: "right" }}>Width</label>
        <WinInput type="number" value={width} onChange={handleWidthChange} style={{ width: 60 }} />
        <span>%</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <label style={{ width: 60, textAlign: "right" }}>Height</label>
        <WinInput type="number" value={height} onChange={handleHeightChange} style={{ width: 60 }} />
        <span>%</span>
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        <WinButton onClick={() => onOk({ keepAspect, width, height })}>OK</WinButton>
        <WinButton onClick={onCancel}>Cancel</WinButton>
      </div>
    </DialogShell>
  )
}

// ─────────────────────────────────────────────────────────────
// 4. BORDER RADIUS & PHOTO BORDER DIALOG
// ─────────────────────────────────────────────────────────────
export type PhotoBorderConfig = {
  borderWidth: number
  borderColor: string
  borderRadius: number
}

export function PhotoBorderDialog({
  initial,
  onOk,
  onCancel,
  onChange,
}: {
  initial: PhotoBorderConfig
  onOk: (cfg: PhotoBorderConfig) => void
  onCancel: () => void
  onChange?: (cfg: PhotoBorderConfig) => void
}) {
  const [borderWidth, setBorderWidth] = useState(initial.borderWidth)
  const [borderColor, setBorderColor] = useState(initial.borderColor)
  const [borderRadius, setBorderRadius] = useState(initial.borderRadius)

  // ✨ Live preview: push every change up to parent so canvas updates in real-time
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    onChange?.({ borderWidth, borderColor, borderRadius })
  }, [borderWidth, borderColor, borderRadius, onChange])

  return (
    <DialogShell title="Photo Border & Rounded Corner" onClose={onCancel} width={320}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>PhotoBorder</div>

      {/* Border color */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <label style={{ width: 100 }}>Border Color</label>
        <input
          type="color"
          value={borderColor}
          onChange={(e) => setBorderColor(e.target.value)}
          style={{ width: 36, height: 24, border: "1px solid #808080", cursor: "pointer" }}
        />
        <WinInput value={borderColor} onChange={setBorderColor} style={{ width: 80 }} />
      </div>

      {/* Border thickness */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <label style={{ width: 100 }}>Border Thick.</label>
        <WinInput
          type="number"
          value={borderWidth}
          onChange={(v) => setBorderWidth(Number(v))}
          style={{ width: 60 }}
          min={0}
          max={20}
        />
        <span>px</span>
      </div>

      {/* Radius preview box */}
      <div style={{ marginBottom: 12, padding: 10, border: "1px solid #c0c0c0", background: "#e0e0e0" }}>
        <label style={{ fontSize: 11, display: "block", marginBottom: 6 }}>Thickness Value</label>
        <div style={{
          width: 80, height: 80, border: `${borderWidth}px solid ${borderColor}`,
          borderRadius: borderRadius, background: "#aaaaaa",
          margin: "0 auto",
        }} />
      </div>

      {/* Border radius */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <label style={{ width: 100 }}>Corner Radius</label>
        <input
          type="range"
          min={0}
          max={100}
          value={borderRadius}
          onChange={(e) => setBorderRadius(Number(e.target.value))}
          style={{ flex: 1 }}
        />
        <WinInput
          type="number"
          value={borderRadius}
          onChange={(v) => setBorderRadius(Number(v))}
          style={{ width: 50 }}
        />
        <span>px</span>
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        <WinButton onClick={() => onOk({ borderWidth, borderColor, borderRadius })}>Done</WinButton>
        <WinButton onClick={onCancel}>Close</WinButton>
      </div>
    </DialogShell>
  )
}

// ─────────────────────────────────────────────────────────────
// 5. COLOR PICKER DIALOG  (Basic + Custom colors grid)
// ─────────────────────────────────────────────────────────────
const BASIC_COLORS = [
  "#FFFFFF","#C0C0C0","#808080","#000000","#FF0000","#800000","#FFFF00","#808000",
  "#00FF00","#008000","#00FFFF","#008080","#0000FF","#000080","#FF00FF","#800080",
  "#FF8080","#FF8040","#FFFF80","#80FF80","#80FFFF","#8080FF","#FF80FF","#E0E0E0",
  "#FFC0C0","#FFE0C0","#FFFFC0","#C0FFC0","#C0FFFF","#C0C0FF","#FFC0FF","#F0F0F0",
  "#FF4040","#FF8000","#FFFF00","#40FF40","#00FFFF","#4040FF","#FF40FF","#808080",
  "#FF0000","#FF8000","#FFFF00","#00FF00","#00FFFF","#0000FF","#FF00FF","#404040",
]

export function ColorPickerDialog({
  initialColor,
  onOk,
  onCancel,
  onChange,
}: {
  initialColor: string
  onOk: (color: string) => void
  onCancel: () => void
  onChange?: (color: string) => void
}) {
  const [selected, setSelected] = useState(initialColor)
  const [custom, setCustom] = useState(initialColor)

  // ✨ Live preview
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    onChange?.(selected)
  }, [selected, onChange])

  return (
    <DialogShell title="Color" onClose={onCancel} width={340}>
      {/* Basic colors */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 11, fontWeight: 700, display: "block", marginBottom: 6 }}>Basic colors:</label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(20px, 1fr))", gap: 3 }}>
          {BASIC_COLORS.map((c, i) => {
            const isSel = selected.toUpperCase() === c.toUpperCase()
            // Auto-pick contrasting checkmark color
            const lum = parseInt(c.slice(1, 3), 16) * 0.299 + parseInt(c.slice(3, 5), 16) * 0.587 + parseInt(c.slice(5, 7), 16) * 0.114
            const checkColor = lum > 140 ? "#000" : "#fff"
            return (
              <button
                key={i}
                onClick={() => { setSelected(c); setCustom(c) }}
                aria-label={`Select color ${c}`}
                aria-pressed={isSel}
                style={{
                  width: 20, height: 20, background: c, padding: 0,
                  border: isSel ? "2px solid #000080" : "1px solid #808080",
                  outline: isSel ? "2px solid #ffeb00" : "none",
                  outlineOffset: isSel ? -1 : 0,
                  cursor: "pointer", boxSizing: "border-box",
                  transform: isSel ? "scale(1.15)" : "scale(1)",
                  transition: "transform .12s ease, outline .12s ease",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  zIndex: isSel ? 2 : 1, position: "relative",
                }}
              >
                {isSel && <span style={{ color: checkColor, fontSize: 12, fontWeight: 900, lineHeight: 1 }}>✓</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* Custom colors */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 11, fontWeight: 700, display: "block", marginBottom: 6 }}>Custom colors:</label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 2, marginBottom: 8 }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} style={{ width: 18, height: 18, background: "#ffffff", border: "1px solid #808080" }} />
          ))}
        </div>
        <button
          style={{
            background: "#d4d0c8", border: "1px solid", borderColor: "#ffffff #808080 #808080 #ffffff",
            padding: "2px 10px", fontSize: 11, cursor: "pointer",
          }}
          onClick={() => document.getElementById("color-custom-input")?.click()}
        >
          Define Custom Colors &gt;&gt;
        </button>
        <input
          id="color-custom-input"
          type="color"
          value={custom}
          onChange={(e) => { setCustom(e.target.value); setSelected(e.target.value) }}
          style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
        />
      </div>

      {/* Selected preview */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ width: 40, height: 24, background: selected, border: "1px solid #808080", flexShrink: 0 }} />
        <label style={{ fontSize: 11 }}>Color</label>
        <WinInput value={selected} onChange={setSelected} style={{ flex: "1 1 80px", minWidth: 60 }} />
        <button
          style={{
            background: "#d4d0c8", border: "1px solid", borderColor: "#ffffff #808080 #808080 #ffffff",
            padding: "2px 8px", fontSize: 11, cursor: "pointer",
          }}
          onClick={() => setSelected(custom)}
        >
          Add to Custom Colors
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        <WinButton onClick={() => onOk(selected)}>OK</WinButton>
        <WinButton onClick={onCancel}>Cancel</WinButton>
      </div>
    </DialogShell>
  )
}

// ─────────────────────────────────────────────────────────────
// 6. WRAP TEXT DIALOG  (Do you want to use Wrap text? + rows per field)
// ─────────────────────────────────────────────────────────────
export type WrapMode = "nowrap" | "multiline" | "wrap"
export type WrapTextConfig = {
  /** @deprecated Use `mode` instead. Kept for backwards compatibility — true == "wrap" (auto-fit), false == "nowrap". */
  wrap: boolean
  /** Preferred field: explicit wrap mode. */
  mode?: WrapMode
  rowsPerField: number
}

export function WrapTextDialog({
  initial,
  onSave,
  onClose,
}: {
  initial: WrapTextConfig
  onSave: (cfg: WrapTextConfig) => void
  onClose: () => void
}) {
  // Resolve initial mode from either the new `mode` field or the legacy `wrap` boolean.
  const initialMode: WrapMode = initial.mode || (initial.wrap ? "wrap" : "nowrap")
  const [mode, setMode] = useState<WrapMode>(initialMode)
  const rowsPerField = initial.rowsPerField || 2

  return (
    <DialogShell title="Text Wrap" onClose={onClose} width={360}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>How should long text be displayed?</div>

      <div style={{ marginBottom: 12, padding: "8px 12px", border: "1px solid #c0c0c0", background: "#ececec" }}>
        <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8, cursor: "pointer" }}>
          <input type="radio" name="wrap" checked={mode === "multiline"} onChange={() => setMode("multiline")} style={{ marginTop: 3 }} />
          <span>
            <b>Multi-line (best for addresses) ⭐</b>
            <div style={{ fontSize: 11, color: "#555" }}>
              Long text wraps onto a new line and keeps your chosen font size. Make the box tall enough for 2–3 lines.
            </div>
          </span>
        </label>
        <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8, cursor: "pointer" }}>
          <input type="radio" name="wrap" checked={mode === "wrap"} onChange={() => setMode("wrap")} style={{ marginTop: 3 }} />
          <span>
            <b>Auto-fit (best for names)</b>
            <div style={{ fontSize: 11, color: "#555" }}>
              Long names automatically shrink to fit on a single line — full text is always visible, never truncated with &quot;...&quot;.
            </div>
          </span>
        </label>
        <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer" }}>
          <input type="radio" name="wrap" checked={mode === "nowrap"} onChange={() => setMode("nowrap")} style={{ marginTop: 3 }} />
          <span>
            <b>Single Line (truncate)</b>
            <div style={{ fontSize: 11, color: "#555" }}>
              Keep text at its original size. Long text overflowing the box is truncated with &quot;...&quot;.
            </div>
          </span>
        </label>
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        <WinButton onClick={() => { onSave({ wrap: mode !== "nowrap", mode, rowsPerField }); onClose() }}>Save</WinButton>
        <WinButton onClick={onClose}>Close</WinButton>
      </div>
    </DialogShell>
  )
}

// ─────────────────────────────────────────────────────────────
// 7. PRINT DIALOG  (Select Paper, Paper Setting, ID Card Position)
// ─────────────────────────────────────────────────────────────
export type PrintConfig = {
  paper: string
  paperWidth: number
  paperHeight: number
  h1stPosition: number
  h2ndPosition: number
  v1stPosition: number
  v2ndPosition: number
  /** Card dimensions at time of save — used to detect stale pitch values */
  cardWidthMm?: number
  cardHeightMm?: number
}

const PAPER_PRESETS: Record<string, { width: number; height: number }> = {
  "A4 Horizontal": { width: 297, height: 210 },
  "A4 Vertical":   { width: 210, height: 297 },
  "A3 Horizontal": { width: 420, height: 297 },
  "A3 Vertical":   { width: 297, height: 420 },
  "A5 Horizontal": { width: 210, height: 148 },
  "A5 Vertical":   { width: 148, height: 210 },
  "Letter (8.5×11)": { width: 279, height: 216 },
  "Legal (8.5×14)": { width: 356, height: 216 },
  "Custom":          { width: 297, height: 210 },
}

export function PrintDialog({
  initial,
  cardWidthMm,
  cardHeightMm,
  onOk,
  onCancel,
}: {
  initial?: Partial<PrintConfig>
  /** Locked card width from the template — displayed read-only. */
  cardWidthMm?: number
  /** Locked card height from the template — displayed read-only. */
  cardHeightMm?: number
  onOk: (cfg: PrintConfig) => void
  onCancel: () => void
}) {
  // Card size is sourced from the template (locked). Fall back to the
  // initial config's snapshot, then to standard 85.6×54 if neither is set.
  const cardW = Number(cardWidthMm ?? initial?.cardWidthMm ?? 85.6) || 85.6
  const cardH = Number(cardHeightMm ?? initial?.cardHeightMm ?? 54) || 54

  const [paper, setPaper] = useState(initial?.paper || "A4 Horizontal")
  const [paperWidth, setPaperWidth] = useState(initial?.paperWidth ?? 297)
  const [paperHeight, setPaperHeight] = useState(initial?.paperHeight ?? 210)
  const [h1, setH1] = useState(initial?.h1stPosition ?? 0)
  const [v1, setV1] = useState(initial?.v1stPosition ?? 0)
  // Derive gap from pitch (= cardSize + gap) stored on the saved config.
  // Defaults: 3 mm horizontal, 15 mm vertical (Aaryans spec) when not yet configured.
  const initHPitch = initial?.h2ndPosition ?? 0
  const initVPitch = initial?.v2ndPosition ?? 0
  const initGapH = initHPitch > 0 ? Math.max(0, initHPitch - cardW) : 3
  const initGapV = initVPitch > 0 ? Math.max(0, initVPitch - cardH) : 15
  const [gapH, setGapH] = useState<number>(initGapH)
  const [gapV, setGapV] = useState<number>(initGapV)

  const handlePaperChange = (key: string) => {
    setPaper(key)
    const p = PAPER_PRESETS[key]
    if (p) { setPaperWidth(p.width); setPaperHeight(p.height) }
  }

  // Computed pitches (card-to-card distance) — these are what's persisted.
  const hPitch = cardW + Math.max(0, gapH)
  const vPitch = cardH + Math.max(0, gapV)

  // Live layout preview
  const availW = h1 > 0 ? paperWidth - h1 : paperWidth
  const availH = v1 > 0 ? paperHeight - v1 : paperHeight
  const cols = Math.max(0, Math.floor((availW + (hPitch - cardW)) / hPitch))
  const rows = Math.max(0, Math.floor((availH + (vPitch - cardH)) / vPitch))
  const cardsPerPage = cols * rows

  const lockedBoxStyle: React.CSSProperties = {
    width: 60,
    border: "1px solid #c0c0c0",
    background: "#f0f0f0",
    color: "#555",
    padding: "2px 4px",
    fontFamily: "Tahoma, Arial, sans-serif",
    fontSize: 12,
    textAlign: "right",
  }

  return (
    <DialogShell title="Print Setup" onClose={onCancel} width={480}>
      {/* Select Paper row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <label style={{ width: 90, fontWeight: 700, flexShrink: 0 }}>Select Paper</label>
        <select
          value={paper}
          onChange={(e) => handlePaperChange(e.target.value)}
          style={{
            flex: 1,
            border: "1px solid", borderColor: "#808080 #ffffff #ffffff #808080",
            background: "white", padding: "2px 4px",
            fontFamily: "Tahoma, Arial, sans-serif", fontSize: 12,
          }}
        >
          {Object.keys(PAPER_PRESETS).map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
      </div>

      {/* Paper Setting box */}
      <div style={{ border: "1px solid #808080", padding: "10px 14px", marginBottom: 14, minWidth: 0 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Paper Setting</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <label style={{ width: 80 }}>Paper Size</label>
          <WinInput
            type="number"
            value={paperWidth}
            onChange={(v) => { setPaperWidth(Number(v)) }}
            style={{ width: 60 }}
          />
          <span>×</span>
          <WinInput
            type="number"
            value={paperHeight}
            onChange={(v) => { setPaperHeight(Number(v)) }}
            style={{ width: 60 }}
          />
          <span style={{ fontSize: 11, color: "#555" }}>(mm)</span>
        </div>
        <div style={{ fontSize: 11, color: "#444", textAlign: "center" }}>
          (Width X Height: (in MM))
        </div>
      </div>

      {/* ID Card Size — locked, sourced from template */}
      <div style={{ border: "1px solid #808080", padding: "10px 14px", marginBottom: 14, minWidth: 0, background: "#f8f8f8" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <div style={{ fontWeight: 700 }}>🪪 ID Card Size</div>
          <span style={{
            fontSize: 10, padding: "1px 6px", borderRadius: 4,
            background: "#fde68a", color: "#78350f", fontWeight: 700,
            border: "1px solid #f59e0b",
          }}>LOCKED</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ width: 80, fontSize: 11 }}>Card Size</label>
          <div style={lockedBoxStyle}>{cardW}</div>
          <span>×</span>
          <div style={lockedBoxStyle}>{cardH}</div>
          <span style={{ fontSize: 11, color: "#555" }}>(mm)</span>
        </div>
        <div style={{ fontSize: 10, color: "#666", marginTop: 4 }}>
          PDF output uses this exact size. Adjust only the gap/position below to control spacing.
        </div>
      </div>

      {/* Gap between cards */}
      <div style={{ border: "1px solid #808080", padding: "10px 14px", marginBottom: 14, minWidth: 0 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Gap Between Cards</div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <label style={{ width: 150, fontSize: 11 }}>Horizontal Gap (column)</label>
          <WinInput
            type="number"
            value={gapH}
            onChange={(v) => setGapH(Math.max(0, Number(v) || 0))}
            style={{ width: 55 }}
          />
          <span style={{ fontSize: 11, color: "#555" }}>(mm)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <label style={{ width: 150, fontSize: 11 }}>Vertical Gap (row)</label>
          <WinInput
            type="number"
            value={gapV}
            onChange={(v) => setGapV(Math.max(0, Number(v) || 0))}
            style={{ width: 55 }}
          />
          <span style={{ fontSize: 11, color: "#555" }}>(mm)</span>
        </div>
        <div style={{ fontSize: 10, color: "#666" }}>
          Pitch (card-to-card): H {hPitch.toFixed(1)} mm · V {vPitch.toFixed(1)} mm
        </div>
      </div>

      {/* Page Margin / First Card Position */}
      <div style={{ border: "1px solid #808080", padding: "10px 14px", marginBottom: 14, minWidth: 0 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>ID-Card Position</div>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Horizontal</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <label style={{ width: 150, fontSize: 11 }}>1st ID-Card Position</label>
          <WinInput
            type="number"
            value={h1}
            onChange={(v) => setH1(Math.max(0, Number(v) || 0))}
            style={{ width: 55 }}
          />
          <span style={{ fontSize: 11, color: "#555" }}>(in mm)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <label style={{ width: 150, fontSize: 11 }}>2nd Card Start X (pitch)</label>
          <WinInput
            type="number"
            value={Number(hPitch.toFixed(1))}
            onChange={(v) => setGapH(Math.max(0, (Number(v) || cardW) - cardW))}
            style={{ width: 55 }}
          />
          <span style={{ fontSize: 11, color: "#555" }}>(in mm)</span>
        </div>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Vertical</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <label style={{ width: 150, fontSize: 11 }}>1st ID-Card Position</label>
          <WinInput
            type="number"
            value={v1}
            onChange={(v) => setV1(Math.max(0, Number(v) || 0))}
            style={{ width: 55 }}
          />
          <span style={{ fontSize: 11, color: "#555" }}>(in mm)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ width: 150, fontSize: 11 }}>2nd Card Start Y (pitch)</label>
          <WinInput
            type="number"
            value={Number(vPitch.toFixed(1))}
            onChange={(v) => setGapV(Math.max(0, (Number(v) || cardH) - cardH))}
            style={{ width: 55 }}
          />
          <span style={{ fontSize: 11, color: "#555" }}>(in mm)</span>
        </div>
      </div>

      {/* Cards-per-page preview */}
      <div style={{
        background: "#e8f4fd", border: "1px inset #93c5fd",
        padding: "8px 12px", marginBottom: 12, fontSize: 12,
      }}>
        <span>
          Layout preview: <strong>{cols} cols × {rows} rows = {cardsPerPage} cards/page</strong>
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        <WinButton onClick={() => onOk({
          paper, paperWidth, paperHeight,
          h1stPosition: h1,
          h2ndPosition: hPitch,
          v1stPosition: v1,
          v2ndPosition: vPitch,
          cardWidthMm: cardW,
          cardHeightMm: cardH,
        })}>
          Ok
        </WinButton>
        <WinButton onClick={onCancel}>Cancel</WinButton>
      </div>
    </DialogShell>
  )
}

// ─────────────────────────────────────────────────────────────
// 8. RIGHT-CLICK CONTEXT MENU (exact screenshot)
// ─────────────────────────────────────────────────────────────
type ContextMenuAction =
  | "imageProperties"
  | "textProperties"
  | "backgroundProperties"
  | "alignments"
  | "gridView"
  | "insertImage"
  | "setPhotoSize"
  | "photoBorderRoundedCorner"
  | "setTextAxis"
  | "color"
  | "rotate"
  | "font"
  | "splitHoldSize"
  | "wrapBitmapReduceFontSize"
  | "setBarcode"
  | "shadow"

type ContextMenuType = "image" | "text" | "photo"

export function FieldContextMenu({
  x,
  y,
  fieldType,
  onAction,
  onClose,
}: {
  x: number
  y: number
  fieldType: ContextMenuType
  onAction: (action: ContextMenuAction) => void
  onClose: () => void
}) {
  const menuWidth = 220
  const menuHeight = fieldType === "text" ? 310 : fieldType === "photo" ? 260 : 210
  const viewportW = typeof window !== "undefined" ? window.innerWidth : 1200
  const viewportH = typeof window !== "undefined" ? window.innerHeight : 800
  const clampedX = Math.min(Math.max(8, x), Math.max(8, viewportW - menuWidth - 8))
  const clampedY = Math.min(Math.max(8, y), Math.max(8, viewportH - menuHeight - 8))

  const menuStyle: React.CSSProperties = {
    position: "fixed",
    left: Math.max(0, clampedX),
    top: Math.max(0, clampedY),
    background: "#d4d0c8",
    border: "1px solid",
    borderColor: "#ffffff #808080 #808080 #ffffff",
    boxShadow: "2px 2px 6px rgba(0,0,0,0.3)",
    zIndex: 9999,
    fontFamily: "Tahoma, Arial, sans-serif",
    fontSize: 12,
    minWidth: menuWidth,
    maxHeight: "calc(100dvh - 16px)",
    overflowY: "auto",
    maxWidth: "90vw",
    padding: "2px 0",
    animation: "idm-fadein .1s ease-out",
  }

  const itemStyle: React.CSSProperties = {
    padding: "3px 20px 3px 24px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    whiteSpace: "nowrap",
  }

  const Item = ({
    label,
    action,
    hasSubmenu,
  }: {
    label: string
    action?: ContextMenuAction
    hasSubmenu?: boolean
  }) => (
    <div
      style={itemStyle}
      onClick={() => { if (action) { onAction(action); onClose() } }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#000080"; (e.currentTarget as HTMLDivElement).style.color = "white" }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; (e.currentTarget as HTMLDivElement).style.color = "black" }}
    >
      <span>{label}</span>
      {hasSubmenu && <span style={{ fontSize: 10 }}>▶</span>}
    </div>
  )

  const Separator = () => (
    <div style={{ height: 1, background: "#808080", margin: "2px 4px" }} />
  )

  return (
    <BodyPortal>
      <div style={{ position: "fixed", inset: 0, zIndex: 9998 }} onClick={onClose} />
      <div style={menuStyle}>
        {/* Top level: always show */}
        <Item label="Image Properties" action="imageProperties" hasSubmenu />
        <Item label="Text Properties" action="textProperties" hasSubmenu />
        <Item label="Background Properties" action="backgroundProperties" hasSubmenu />
        <Item label="Alignments" action="alignments" hasSubmenu />
        <Item label="Grid View" action="gridView" />

        {fieldType === "photo" && (
          <>
            <Separator />
            <Item label="Insert Image" action="insertImage" />
            <Item label="Set Photo Size" action="setPhotoSize" />
            <Item label="Photo Border & Rounded Corner" action="photoBorderRoundedCorner" />
          </>
        )}

        {fieldType === "text" && (
          <>
            <Separator />
            <Item label="Set Text Axis" action="setTextAxis" />
            <Item label="Color" action="color" />
            <Item label="Rotate" action="rotate" hasSubmenu />
            <Item label="Font" action="font" />
            <Separator />
            <Item label="Split Hold Size" action="splitHoldSize" />
            <Item label="WordWrap /Rotate Reduce Font Size" action="wrapBitmapReduceFontSize" />
            <Item label="Set Barcode" action="setBarcode" />
            <Item label="Shadow" action="shadow" />
          </>
        )}
      </div>
    </BodyPortal>
  )
}
