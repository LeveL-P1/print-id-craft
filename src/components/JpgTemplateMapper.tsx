"use client"
import { useState, useRef, useEffect, useCallback } from "react"
import {
  IdSizeDialog, FontDialog, PhotoSizeDialog, PhotoBorderDialog,
  ColorPickerDialog, WrapTextDialog, FieldContextMenu,
  type IdSizeConfig, type FontConfig, type PhotoSizeConfig,
  type PhotoBorderConfig, type WrapTextConfig,
} from "./IDMakerDialogs"
import { resolveDisplayFieldValue, formatDateValue, isPrefixedAddressField } from "@/lib/field-resolver"
import { isClassDivisionFieldKey } from "@/lib/section-class"

const BG_COLOR_PRESETS = [
  // Neutrals
  { id: "white", label: "White", hex: "#FFFFFF", textColor: "#333" },
  { id: "light-grey", label: "Light Grey", hex: "#F1F5F9", textColor: "#333" },
  { id: "silver", label: "Silver", hex: "#E2E8F0", textColor: "#333" },
  { id: "cream", label: "Cream", hex: "#FEF3C7", textColor: "#333" },
  { id: "ivory", label: "Ivory", hex: "#FFFBEB", textColor: "#333" },
  // Blues
  { id: "light-blue", label: "Light Blue", hex: "#DBEAFE", textColor: "#333" },
  { id: "sky-blue", label: "Sky Blue", hex: "#BAE6FD", textColor: "#333" },
  { id: "steel-blue", label: "Steel Blue", hex: "#93C5FD", textColor: "#333" },
  { id: "navy", label: "Navy", hex: "#1E3A5F", textColor: "#fff" },
  // Greens
  { id: "mint", label: "Mint", hex: "#D1FAE5", textColor: "#333" },
  { id: "sage", label: "Sage", hex: "#A7F3D0", textColor: "#333" },
  { id: "forest", label: "Forest", hex: "#14532D", textColor: "#fff" },
  // Warm
  { id: "peach", label: "Peach", hex: "#FED7AA", textColor: "#333" },
  { id: "rose", label: "Rose", hex: "#FECDD3", textColor: "#333" },
  { id: "lavender", label: "Lavender", hex: "#E9D5FF", textColor: "#333" },
  // Dark
  { id: "maroon", label: "Maroon", hex: "#7F1D1D", textColor: "#fff" },
  { id: "charcoal", label: "Charcoal", hex: "#334155", textColor: "#fff" },
  { id: "black", label: "Black", hex: "#000000", textColor: "#fff" },
]

type FieldMapping = {
  id: string
  fieldKey: string
  label: string
  type: "text" | "photo" | "flag"
  x: number // percentage from left
  y: number // percentage from top
  width: number // percentage of image width
  height: number // percentage of image height
  fontSize: number // in px relative to the image
  fontColor: string
  fontWeight: "normal" | "bold"
  fontFamily: string
  textAlign?: "left" | "center" | "right"
  // New properties for enhanced text formatting
  fontStyle?: "normal" | "italic" // italic support
  textDecoration?: "none" | "underline" | "line-through" // underline/strikethrough
  textWrap?: "nowrap" | "wrap" | "multiline" // text wrapping (nowrap=truncate, wrap=auto-shrink to one line, multiline=wrap to next line preserving font size)
  letterSpacing?: number // letter spacing in px
  lineHeight?: number // line height multiplier
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize"
  // Date format for date fields
  dateFormat?: string // e.g. "DD/MM/YYYY", "MM-DD-YYYY", "YYYY-MM-DD"
  // Photo-specific properties
  photoBorderWidth?: number // border width in px
  photoBorderColor?: string // border color
  photoBorderRadius?: number // border radius in px for round corners
  // Lock field to prevent accidental moves
  locked?: boolean
}

type CardSettings = {
  cardSizePreset: string
  cardWidth: number
  cardHeight: number
  cardOrientation: "landscape" | "portrait"
  printSides: "front" | "both"
  cardDpi: number
  bleedMargin: number
  backImageUrl?: string | null
  backMappings?: FieldMapping[]
  cardSizeLocked?: boolean
  fixedBranch?: string
}

type JpgTemplateMapperProps = {
  schoolId: string
  templateImageUrl: string | null
  fieldMappings: FieldMapping[]
  fieldConfig: { key: string; label: string; type: string; required: boolean }[]
  onSave: (templateImageUrl: string, fieldMappings: FieldMapping[], photoBgColor?: string, cardSettings?: CardSettings) => Promise<void>
  onUploadImage: (file: File) => Promise<string>
  initialPhotoBgColor?: string
  initialCardSettings?: CardSettings
  /**
   * Optional sample student from the current school used to populate the
   * editor preview with REAL data. When omitted, the editor falls back
   * to the generic SAMPLE_DATA placeholders so admins can still place
   * fields before any students are imported.
   */
  previewStudent?: {
    formData: Record<string, string>
    photoUrl?: string | null
  } | null
}

const DATE_FORMATS = [
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY", example: "15/08/2022" },
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY", example: "08/15/2022" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD", example: "2022-08-15" },
  { value: "DD-MM-YYYY", label: "DD-MM-YYYY", example: "15-08-2022" },
  { value: "DD.MM.YYYY", label: "DD.MM.YYYY", example: "15.08.2022" },
  { value: "DD MMM YYYY", label: "DD MMM YYYY", example: "15 Aug 2022" },
  { value: "MMMM DD, YYYY", label: "MMMM DD, YYYY", example: "August 15, 2022" },
]

const FONT_FAMILIES = [
  // Sans-Serif
  "Arial", "Arial Narrow", "Helvetica", "Verdana", "Tahoma", "Trebuchet MS",
  "Calibri", "Segoe UI", "Lucida Sans", "Franklin Gothic Medium", "Century Gothic",
  // Condensed / Narrow — used when columns are tight (parents' addresses,
  // long names). Combine with fontWeight=bold to get "Narrow Bold".
  "Roboto Condensed", "Oswald", "Open Sans Condensed", "Barlow Condensed",
  // Serif
  "Times New Roman", "Georgia", "Palatino", "Garamond",
  "Book Antiqua", "Cambria", "Constantia", "Didot",
  // Monospace
  "Courier New", "Lucida Console", "Consolas", "Monaco",
  // Display & Fun
  "Impact", "Comic Sans MS", "Copperplate", "Papyrus",
  // Google Fonts (loaded via CDN)
  "Roboto", "Open Sans", "Lato", "Montserrat", "Poppins",
  "Raleway", "Inter", "Nunito", "Playfair Display",
  "Merriweather", "Ubuntu", "Rubik", "Outfit", "Mukta",
  // Indian Language Friendly
  "Noto Sans Devanagari", "Noto Sans", "Tiro Devanagari Hindi",
]

const SAMPLE_DATA: Record<string, string> = {
  name: "Avneesh Abhishek Awachat",
  fullName: "Avneesh Abhishek Awachat",
  Student_Name: "Avneesh Abhishek Awachat",
  class: "VI - A",
  classSection: "VI - A",
  classDivision: "VI - A",
  branch: "Bibwewadi",
  father: "9650319700",
  mother: "8850257336",
  mob_father: "9650319700",
  fatherName: "Mr. Abhishek Awachat",
  motherName: "Mrs. Priya Awachat",
  fatherPhone: "9650319700",
  motherPhone: "8850257336",
  phone: "9650319700",
  rollNo: "1",
  srNo: "1",
  NO: "1",
  dateOfBirth: "15/08/2022",
  bloodGroup: "B+",
  address: "Flat No. 503, A-Wing, Sai Shilp Society, Pune",
  addressWithLabel: "Address: Flat No. 503, A-Wing, Sai Shilp Society, Pune",
  addWithLabel: "Add: Flat No. 503, A-Wing, Sai Shilp Society, Pune",
  admissionNo: "ADM-2025-001",
  photoId: "BB25035",
  serialNumber: "PLAY-B1-0001",
}

function FixedWrapText({
  text,
  style,
}: {
  text: string
  style: React.CSSProperties
}) {
  return (
    <span
      style={{
        ...style,
        whiteSpace: "normal",
        overflowWrap: "break-word",
        wordBreak: "break-word",
        overflow: "hidden",
        width: "100%",
        height: "100%",
        display: "block",
      }}
    >
      {text}
    </span>
  )
}

export default function JpgTemplateMapper({
  schoolId,
  templateImageUrl: initialImageUrl,
  fieldMappings: initialMappings,
  fieldConfig,
  onSave,
  onUploadImage,
  initialPhotoBgColor,
  initialCardSettings,
  previewStudent,
}: JpgTemplateMapperProps) {
  const [imageUrl, setImageUrl] = useState(initialImageUrl || "")
  const [mappings, setMappings] = useState<FieldMapping[]>(
    initialMappings && initialMappings.length > 0 ? initialMappings : []
  )
  const [photoBgColor, setPhotoBgColor] = useState(initialPhotoBgColor || "#FFFFFF")

  // Sync state when props change
  useEffect(() => {
    if (initialImageUrl) setImageUrl(initialImageUrl)
    if (initialMappings && initialMappings.length > 0) setMappings(initialMappings)
  }, [initialImageUrl, initialMappings])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [dragState, setDragState] = useState<{
    id: string
    startX: number
    startY: number
    origX: number
    origY: number
    origW: number
    origH: number
    mode: "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"
  } | null>(null)
  const [imageDragOver, setImageDragOver] = useState(false)

  // ── ID Maker Dialog State ──
  // Opened only from the explicit "ID Size..." action. Auto-opening this modal
  // on mobile interrupts scrolling through the template setup flow.
  const [showIdSizeDialog, setShowIdSizeDialog] = useState(false)
  const [showFontDialog, setShowFontDialog] = useState(false)
  const [showPhotoSizeDialog, setShowPhotoSizeDialog] = useState(false)
  const [showPhotoBorderDialog, setShowPhotoBorderDialog] = useState(false)
  const [showColorDialog, setShowColorDialog] = useState(false)
  const [showWrapDialog, setShowWrapDialog] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; fieldId: string } | null>(null)
  // Snapshot of the field state when a dialog opens — used for Cancel-revert when live-preview is enabled
  const dialogSnapshotRef = useRef<{ id: string; mapping: FieldMapping } | null>(null)

  // ── Professional Features State ──
  // Editor image render width in CSS pixels. Used to scale per-field font
  // sizes so they preview at the same proportional size as the final card.
  // `field.fontSize` is interpreted as typographic POINTS (pt). We
  // convert pt → editor pixels using the actual rendered image width
  // and the card's mm width:
  //
  //     pxPerPt = editorImgWidth × 25.4 / (cardWidth × 72)
  //
  // This is the same formula used by JpgCardPreview and BatchGenerator,
  // so what the user sees in the editor matches the printed card
  // exactly (and "size 10" in the picker really is 10 pt on print).
  const EDITOR_REFERENCE_WIDTH = 600
  const [editorImgWidth, setEditorImgWidth] = useState(EDITOR_REFERENCE_WIDTH)
  useEffect(() => {
    if (typeof window === "undefined") return
    const update = () => {
      const w = imageRef.current?.getBoundingClientRect().width
      if (w && w > 0) setEditorImgWidth(w)
    }
    update()
    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== "undefined" && imageRef.current) {
      ro = new ResizeObserver(update)
      ro.observe(imageRef.current)
    }
    window.addEventListener("resize", update)
    return () => {
      window.removeEventListener("resize", update)
      ro?.disconnect()
    }
  }, [imageUrl])

  const [zoomLevel, setZoomLevel] = useState(100) // percentage
  const [showGrid, setShowGrid] = useState(false)
  const [snapToGrid, setSnapToGrid] = useState(false)
  const [gridSize, setGridSize] = useState(5) // percentage
  const [showRulers, setShowRulers] = useState(false)
  const [showCoordinates, setShowCoordinates] = useState(true)

  // ── Undo/Redo History ──
  const MAX_HISTORY = 50
  const [undoStack, setUndoStack] = useState<FieldMapping[][]>([])
  const [redoStack, setRedoStack] = useState<FieldMapping[][]>([])

  const pushToHistory = useCallback((currentMappings: FieldMapping[]) => {
    setUndoStack(prev => {
      const next = [...prev, JSON.parse(JSON.stringify(currentMappings))]
      if (next.length > MAX_HISTORY) next.shift()
      return next
    })
    setRedoStack([])
  }, [])

  const undo = useCallback(() => {
    if (undoStack.length === 0) return
    const prev = [...undoStack]
    const lastState = prev.pop()!
    setUndoStack(prev)
    setRedoStack(r => [...r, JSON.parse(JSON.stringify(mappings))])
    setMappings(lastState)
  }, [undoStack, mappings])

  const redo = useCallback(() => {
    if (redoStack.length === 0) return
    const next = [...redoStack]
    const nextState = next.pop()!
    setRedoStack(next)
    setUndoStack(u => [...u, JSON.parse(JSON.stringify(mappings))])
    setMappings(nextState)
  }, [redoStack, mappings])

  // ── Layer Ordering ──
  const bringToFront = useCallback((id: string) => {
    pushToHistory(mappings)
    setMappings(prev => {
      const idx = prev.findIndex(m => m.id === id)
      if (idx < 0 || idx === prev.length - 1) return prev
      const next = [...prev]
      const [item] = next.splice(idx, 1)
      next.push(item)
      return next
    })
  }, [mappings, pushToHistory])

  const sendToBack = useCallback((id: string) => {
    pushToHistory(mappings)
    setMappings(prev => {
      const idx = prev.findIndex(m => m.id === id)
      if (idx <= 0) return prev
      const next = [...prev]
      const [item] = next.splice(idx, 1)
      next.unshift(item)
      return next
    })
  }, [mappings, pushToHistory])

  const moveLayerUp = useCallback((id: string) => {
    pushToHistory(mappings)
    setMappings(prev => {
      const idx = prev.findIndex(m => m.id === id)
      if (idx < 0 || idx === prev.length - 1) return prev
      const next = [...prev]
      ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
      return next
    })
  }, [mappings, pushToHistory])

  const moveLayerDown = useCallback((id: string) => {
    pushToHistory(mappings)
    setMappings(prev => {
      const idx = prev.findIndex(m => m.id === id)
      if (idx <= 0) return prev
      const next = [...prev]
      ;[next[idx], next[idx - 1]] = [next[idx - 1], next[idx]]
      return next
    })
  }, [mappings, pushToHistory])

  // ── Duplicate Field ──
  const duplicateField = useCallback((id: string) => {
    const source = mappings.find(m => m.id === id)
    if (!source) return
    pushToHistory(mappings)
    const clone: FieldMapping = {
      ...source,
      id: `field-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      x: Math.min(95, source.x + 3),
      y: Math.min(95, source.y + 3),
      fieldKey: `${source.fieldKey}_copy`,
      label: `${source.label} (copy)`,
    }
    setMappings(prev => [...prev, clone])
    setSelectedId(clone.id)
  }, [mappings, pushToHistory])

  // ── Snap helper ──
  const snapValue = useCallback((val: number) => {
    if (!snapToGrid) return val
    return Math.round(val / gridSize) * gridSize
  }, [snapToGrid, gridSize])

  // Custom field creation
  const [newFieldLabel, setNewFieldLabel] = useState("")
  const [newFieldType, setNewFieldType] = useState<"text" | "tel">("text")

  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  // ── Card Settings State ──
  const CARD_SIZE_PRESETS = [
    { id: "cr80", label: "CR-80 (Standard)", width: 85.6, height: 53.98, desc: "ISO/IEC 7810 ID-1 — most common" },
    { id: "cr79", label: "CR-79 (Adhesive)", width: 83.9, height: 51.4, desc: "For adhesive-backed overlays" },
    { id: "cr100", label: "CR-100 (Large)", width: 104, height: 66, desc: "Military CAC / oversized" },
    { id: "a4third", label: "A4 Third", width: 99, height: 55, desc: "1/3 A4 size badge" },
    { id: "custom", label: "Custom Size", width: 85.6, height: 53.98, desc: "Enter your own dimensions" },
  ]

  const [cardSizePreset, setCardSizePreset] = useState(initialCardSettings?.cardSizePreset || "cr80")
  const [cardWidth, setCardWidth] = useState(initialCardSettings?.cardWidth || 85.6)   // mm
  const [cardHeight, setCardHeight] = useState(initialCardSettings?.cardHeight || 53.98) // mm
  const [cardOrientation, setCardOrientation] = useState<"landscape" | "portrait">(initialCardSettings?.cardOrientation || "landscape")
  const [printSides, setPrintSides] = useState<"front" | "both">(initialCardSettings?.printSides || "front")
  const [cardDpi, setCardDpi] = useState(initialCardSettings?.cardDpi || 300)
  const [bleedMargin, setBleedMargin] = useState(initialCardSettings?.bleedMargin ?? 1) // mm
  const [backImageUrl, setBackImageUrl] = useState<string | null>(initialCardSettings?.backImageUrl || null)
  const [backMappings, setBackMappings] = useState<FieldMapping[]>(initialCardSettings?.backMappings || [])
  const [activeCardSide, setActiveCardSide] = useState<"front" | "back">("front")
  const [cardSizeLocked, setCardSizeLocked] = useState(initialCardSettings?.cardSizeLocked || false)
  const [fixedBranch, setFixedBranch] = useState(initialCardSettings?.fixedBranch || "")

  // String-based intermediates for width/height inputs so user can type freely
  const [cardWidthStr, setCardWidthStr] = useState(String(initialCardSettings?.cardWidth || 85.6))
  const [cardHeightStr, setCardHeightStr] = useState(String(initialCardSettings?.cardHeight || 53.98))

  // Handle card size preset change
  const handleCardSizeChange = (presetId: string) => {
    if (cardSizeLocked) return
    setCardSizePreset(presetId)
    const preset = CARD_SIZE_PRESETS.find(p => p.id === presetId)
    if (preset && presetId !== "custom") {
      if (cardOrientation === "landscape") {
        setCardWidth(preset.width)
        setCardHeight(preset.height)
        setCardWidthStr(String(preset.width))
        setCardHeightStr(String(preset.height))
        autoSaveCardSize(preset.width, preset.height, cardOrientation)
      } else {
        setCardWidth(preset.height)
        setCardHeight(preset.width)
        setCardWidthStr(String(preset.height))
        setCardHeightStr(String(preset.width))
        autoSaveCardSize(preset.height, preset.width, cardOrientation)
      }
    }
  }

  // Handle orientation change
  const handleOrientationChange = (orient: "landscape" | "portrait") => {
    if (cardSizeLocked) return
    setCardOrientation(orient)
    // Swap width and height
    if ((orient === "portrait" && cardWidth > cardHeight) ||
        (orient === "landscape" && cardHeight > cardWidth)) {
      setCardWidth(cardHeight)
      setCardHeight(cardWidth)
      setCardWidthStr(String(cardHeight))
      setCardHeightStr(String(cardWidth))
      autoSaveCardSize(cardHeight, cardWidth, orient)
    } else {
      autoSaveCardSize(cardWidth, cardHeight, orient)
    }
  }

  // ── Auto-save card size to backend immediately ──
  // Called when the ID Size dialog is confirmed so dimensions persist universally
  // for this school without requiring an explicit "Save Template" click.
  const autoSaveCardSize = useCallback(async (width: number, height: number, orientation: "landscape" | "portrait", dpi?: number) => {
    try {
      await fetch(`/api/schools/${schoolId}/template`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardWidthMm: width,
          cardHeightMm: height,
          orientation: orientation === "landscape" ? "LANDSCAPE" : "PORTRAIT",
          ...(dpi ? { printDpi: dpi } : {}),
        }),
      })
    } catch (err) {
      console.error("Auto-save card size failed:", err)
    }
  }, [schoolId])

  const handleImageUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("Please upload a valid image file (JPG, PNG, or WebP)")
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      alert("File too large. Maximum 10MB allowed.")
      return
    }
    setUploading(true)
    try {
      const url = await onUploadImage(file)
      setImageUrl(url)
    } catch (err: any) {
      console.error("Upload failed:", err)
      alert(err?.message || "Upload failed. Please ensure the storage bucket is set up correctly.")
    } finally {
      setUploading(false)
    }
  }

  // Convert label → unique key: "Mob.- Father -" → "mob_father"
  const labelToKey = (label: string): string => {
    const normalizedLabel = label.toLowerCase().replace(/[^a-z0-9]/g, "")
    if (["address", "addressprefix", "addresswithlabel", "addresslabel"].includes(normalizedLabel)) {
      return "addressWithLabel"
    }
    if (["add", "addprefix", "addwithlabel", "addlabel"].includes(normalizedLabel)) {
      return "addWithLabel"
    }

    return label
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "") || `field_${Date.now()}`
  }

  const addFieldMapping = (fieldKey: string, label: string, type: "text" | "photo" | "flag" = "text") => {
    // Prevent duplicate fieldKeys
    if (mappings.find((m) => m.fieldKey === fieldKey)) {
      alert(`Field "${label}" is already placed on the template.`)
      return
    }

    pushToHistory(mappings)
    const isDateField = fieldKey === "dateOfBirth" || fieldKey.toLowerCase().includes("date")
    const isPrefixedAddress = isPrefixedAddressField(fieldKey)
    const newMapping: FieldMapping = {
      id: `field-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      fieldKey,
      label,
      type,
      x: type === "photo" ? 5 : type === "flag" ? 75 : 40,
      y: type === "photo" ? 25 : type === "flag" ? 5 : 30 + mappings.filter((m) => m.type === "text").length * 6,
      width: type === "photo" ? 18 : type === "flag" ? 12 : isPrefixedAddress ? 55 : 30,
      height: type === "photo" ? 32 : type === "flag" ? 18 : isPrefixedAddress ? 8 : 4.5,
      fontSize: 14,
      fontColor: "#000000",
      fontWeight: fieldKey === "name" || fieldKey === "fullName" ? "bold" : "normal",
      fontFamily: "Arial",
      textAlign: "left",
      fontStyle: "normal",
      textDecoration: "none",
      textWrap: isPrefixedAddress ? "multiline" : "nowrap",
      letterSpacing: 0,
      lineHeight: isPrefixedAddress ? 1 : 1.2,
      textTransform: "none",
      dateFormat: isDateField ? "DD/MM/YYYY" : undefined,
      photoBorderWidth: type === "photo" ? 0 : undefined,
      photoBorderColor: type === "photo" ? "#000000" : undefined,
      photoBorderRadius: type === "photo" ? 0 : undefined,
    }
    setMappings((prev) => [...prev, newMapping])
    setSelectedId(newMapping.id)
  }

  const addCustomField = () => {
    const label = newFieldLabel.trim()
    if (!label) return
    const key = labelToKey(label)
    addFieldMapping(key, label, "text")
    setNewFieldLabel("")
  }

  const removeFieldMapping = (id: string) => {
    pushToHistory(mappings)
    setMappings((prev) => prev.filter((m) => m.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  const updateMapping = (id: string, updates: Partial<FieldMapping>) => {
    setMappings((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
    )
  }

  // ── Snapshot helpers for dialogs that support live-preview ──
  // Call openDialogWithSnapshot before opening a dialog; if user clicks Cancel, call revertDialogSnapshot()
  const openDialogWithSnapshot = useCallback((opener: () => void) => {
    const sel = mappings.find((m) => m.id === selectedId)
    if (sel) dialogSnapshotRef.current = { id: sel.id, mapping: { ...sel } }
    opener()
  }, [mappings, selectedId])

  const revertDialogSnapshot = useCallback(() => {
    const snap = dialogSnapshotRef.current
    if (!snap) return
    setMappings((prev) => prev.map((m) => (m.id === snap.id ? snap.mapping : m)))
    dialogSnapshotRef.current = null
  }, [])

  const clearDialogSnapshot = useCallback(() => {
    dialogSnapshotRef.current = null
  }, [])

  // Mouse/touch handlers for dragging fields on the image
  const handleMouseDown = (
    e: React.MouseEvent,
    id: string,
    mode: "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw" = "move"
  ) => {
    e.preventDefault()
    e.stopPropagation()
    const mapping = mappings.find((m) => m.id === id)
    if (!mapping) return
    setSelectedId(id)
    // Prevent dragging locked fields
    if (mapping.locked) return
    setDragState({
      id,
      startX: e.clientX,
      startY: e.clientY,
      origX: mapping.x,
      origY: mapping.y,
      origW: mapping.width,
      origH: mapping.height,
      mode,
    })
  }

  const lastMoveTimeRef = useRef(0)
  const dragFrameRef = useRef<number | null>(null)
  const pendingDragUpdateRef = useRef<{ id: string; updates: Partial<FieldMapping> } | null>(null)

  const queueDragMappingUpdate = useCallback((id: string, updates: Partial<FieldMapping>) => {
    pendingDragUpdateRef.current = { id, updates }
    if (dragFrameRef.current !== null) return
    dragFrameRef.current = window.requestAnimationFrame(() => {
      const pending = pendingDragUpdateRef.current
      pendingDragUpdateRef.current = null
      dragFrameRef.current = null
      if (!pending) return
      setMappings((prev) =>
        prev.map((m) => (m.id === pending.id ? { ...m, ...pending.updates } : m))
      )
    })
  }, [])

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragState || !containerRef.current) return
      // Throttle to ~60fps for smooth but not excessive updates
      const now = performance.now()
      if (now - lastMoveTimeRef.current < 16) return
      lastMoveTimeRef.current = now

      const rect = containerRef.current.getBoundingClientRect()
      const dx = ((e.clientX - dragState.startX) / rect.width) * 100
      const dy = ((e.clientY - dragState.startY) / rect.height) * 100

      if (dragState.mode === "move") {
        queueDragMappingUpdate(dragState.id, {
          x: Math.max(0, Math.min(95, dragState.origX + dx)),
          y: Math.max(0, Math.min(95, dragState.origY + dy)),
        })
      } else {
        const mapping = mappings.find((m) => m.id === dragState.id)
        if (!mapping) return

        let newX = dragState.origX
        let newY = dragState.origY
        let newW = dragState.origW
        let newH = dragState.origH

        if (dragState.mode.includes("e")) newW = Math.max(2, dragState.origW + dx)
        if (dragState.mode.includes("s")) newH = Math.max(2, dragState.origH + dy)
        if (dragState.mode.includes("w")) {
            const maxWAdd = dragState.origW - 2
            const actualDx = Math.min(dx, maxWAdd)
            newX = dragState.origX + actualDx
            newW = dragState.origW - actualDx
        }
        if (dragState.mode.includes("n")) {
            const maxHAdd = dragState.origH - 2
            const actualDy = Math.min(dy, maxHAdd)
            newY = dragState.origY + actualDy
            newH = dragState.origH - actualDy
        }

        queueDragMappingUpdate(dragState.id, {
          x: snapValue(newX),
          y: snapValue(newY),
          width: snapValue(newW),
          height: snapValue(newH),
        })
      }
    },
    [dragState, mappings, queueDragMappingUpdate, snapValue]
  )

  const handleMouseUp = useCallback(() => {
    if (dragState) {
      if (dragFrameRef.current !== null) {
        window.cancelAnimationFrame(dragFrameRef.current)
        dragFrameRef.current = null
      }
      const pending = pendingDragUpdateRef.current
      if (pending) {
        setMappings((prev) =>
          prev.map((m) => (m.id === pending.id ? { ...m, ...pending.updates } : m))
        )
        pendingDragUpdateRef.current = null
      }
      // Save undo state when drag ends
      pushToHistory(mappings.map(m => {
        if (m.id === dragState.id) {
          return { ...m, x: m.x, y: m.y, width: m.width, height: m.height }
        }
        return m
      }))
    }
    setDragState(null)
  }, [dragState, mappings, pushToHistory])

  // ── Keyboard Shortcuts ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return

      // Ctrl+Z = Undo, Ctrl+Shift+Z / Ctrl+Y = Redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
        return
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        redo()
        return
      }

      // Delete/Backspace = remove selected field
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault()
        removeFieldMapping(selectedId)
        return
      }

      // Ctrl+D = duplicate selected field
      if ((e.ctrlKey || e.metaKey) && e.key === 'd' && selectedId) {
        e.preventDefault()
        duplicateField(selectedId)
        return
      }

      // Arrow keys = nudge selected field (1% or 0.5% with shift for fine-tuning)
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && selectedId) {
        e.preventDefault()
        const step = e.shiftKey ? 0.2 : 1
        const mapping = mappings.find(m => m.id === selectedId)
        if (!mapping) return
        const updates: Partial<FieldMapping> = {}
        if (e.key === 'ArrowUp') updates.y = Math.max(0, mapping.y - step)
        if (e.key === 'ArrowDown') updates.y = Math.min(95, mapping.y + step)
        if (e.key === 'ArrowLeft') updates.x = Math.max(0, mapping.x - step)
        if (e.key === 'ArrowRight') updates.x = Math.min(95, mapping.x + step)
        updateMapping(selectedId, updates)
        return
      }

      // Escape = deselect
      if (e.key === 'Escape') {
        setSelectedId(null)
        return
      }

      // + / - = zoom
      if (e.key === '+' || e.key === '=') {
        setZoomLevel(z => Math.min(300, z + 25))
        return
      }
      if (e.key === '-' || e.key === '_') {
        setZoomLevel(z => Math.max(25, z - 25))
        return
      }

      // G = toggle grid
      if (e.key === 'g' && !e.ctrlKey) {
        setShowGrid(g => !g)
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedId, mappings, undo, redo, removeFieldMapping, duplicateField, updateMapping])

  useEffect(() => {
    if (dragState) {
      window.addEventListener("mousemove", handleMouseMove)
      window.addEventListener("mouseup", handleMouseUp)
      return () => {
        window.removeEventListener("mousemove", handleMouseMove)
        window.removeEventListener("mouseup", handleMouseUp)
      }
    }
  }, [dragState, handleMouseMove, handleMouseUp])

  useEffect(() => {
    return () => {
      if (dragFrameRef.current !== null) {
        window.cancelAnimationFrame(dragFrameRef.current)
      }
    }
  }, [])

  const handleSave = async () => {
    if (!imageUrl) return
    setSaving(true)
    try {
      const settings: CardSettings = {
        cardSizePreset,
        cardWidth,
        cardHeight,
        cardOrientation,
        printSides,
        cardDpi,
        bleedMargin,
        backImageUrl,
        backMappings,
        cardSizeLocked,
        fixedBranch,
      }
      await onSave(imageUrl, mappings, photoBgColor, settings)
    } finally {
      setSaving(false)
    }
  }

  const selectedMapping = mappings.find((m) => m.id === selectedId)

  // ---------------------------------------------------------------
  // UPLOAD UI — if no image uploaded yet
  // ---------------------------------------------------------------
  if (!imageUrl) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div
          style={{
            background: "white",
            borderRadius: 20,
            border: "1px solid #e2e8f0",
            padding: 40,
          }}
        >
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: 20,
                background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px",
                fontSize: 36,
              }}
            >
              🖼️
            </div>
            <h3
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: "#0f172a",
                marginBottom: 8,
              }}
            >
              Step 1: Upload School ID Card Template
            </h3>
            <p style={{ fontSize: 14, color: "#64748b", maxWidth: 480, margin: "0 auto" }}>
              Upload the pre-designed JPG/PNG template image of the school's ID
              card. You'll then place text boxes in front of each printed field.
            </p>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault()
              setImageDragOver(true)
            }}
            onDragLeave={() => setImageDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setImageDragOver(false)
              const file = e.dataTransfer.files[0]
              if (file) handleImageUpload(file)
            }}
            onClick={() =>
              document.getElementById("jpg-template-upload")?.click()
            }
            style={{
              border: `3px dashed ${imageDragOver ? "#3b82f6" : "#e2e8f0"}`,
              borderRadius: 16,
              padding: 48,
              textAlign: "center",
              cursor: uploading ? "wait" : "pointer",
              background: imageDragOver
                ? "linear-gradient(135deg, #eff6ff, #f0f9ff)"
                : "#fafafa",
              transition: "all 0.2s",
            }}
          >
            <input
              id="jpg-template-upload"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleImageUpload(file)
              }}
            />
            {uploading ? (
              <>
                <div
                  className="login-spinner"
                  style={{
                    width: 32,
                    height: 32,
                    borderColor: "rgba(59,130,246,0.2)",
                    borderTopColor: "#3b82f6",
                    margin: "0 auto 12px",
                  }}
                />
                <div style={{ fontSize: 14, color: "#3b82f6", fontWeight: 600 }}>
                  Uploading template...
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📤</div>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: "#334155",
                    marginBottom: 4,
                  }}
                >
                  Drop your ID card template here
                </div>
                <div style={{ fontSize: 13, color: "#94a3b8" }}>
                  or click to browse • JPG, PNG, WebP • Max 10MB
                </div>
              </>
            )}
          </div>

          {/* How it works */}
          <div
            style={{
              marginTop: 32,
              padding: 20,
              background: "#f0f9ff",
              borderRadius: 14,
              border: "1px solid #bae6fd",
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#0369a1",
                marginBottom: 12,
              }}
            >
              💡 How it works
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                "Upload the school's printed ID card JPG template",
                "Place text boxes in front of each field (Name, Class, etc.)",
                "Add custom fields like Father, Mother, Phone, etc.",
                "Save → Form auto-generates for students to fill",
                "Generate ID cards with student data auto-filled",
              ].map((text, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 13,
                    color: "#0c4a6e",
                  }}
                >
                  <span
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      background: "#0ea5e9",
                      color: "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}
                  </span>
                  {text}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------
  // MAIN MAPPER UI — image loaded, map fields
  // ---------------------------------------------------------------
  return (
    <div
      className="mapper-root"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        touchAction: "pan-y",
        overscrollBehavior: "auto",
      }}
    >
      {/* Top Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h3
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "#0f172a",
              marginBottom: 2,
            }}
          >
            Step 2: Place Text Boxes on Template
          </h3>
          <p style={{ fontSize: 13, color: "#94a3b8" }}>
            Add fields and drag them in front of the printed labels on the template
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => setShowIdSizeDialog(true)}
            style={{
              fontSize: 13, padding: "8px 16px", borderRadius: 8,
              border: "2px solid #000080", background: "#d4d0c8",
              color: "#000080", fontWeight: 700, cursor: "pointer",
              fontFamily: "Tahoma, Arial, sans-serif",
            }}
          >
            📐 ID Size...
          </button>
          <button
            className="btn btn-outline"
            onClick={() => setShowPreview(!showPreview)}
            style={{ fontSize: 13, padding: "8px 16px" }}
          >
            {showPreview ? "📝 Edit Mode" : "👁 Preview"}
          </button>

          {/* Front/Back Side Toggle — only when dual-sided */}
          {printSides === "both" && (
            <div style={{
              display: "flex", borderRadius: 8, overflow: "hidden",
              border: "1.5px solid #3b82f6",
            }}>
              <button
                onClick={() => {
                  if (activeCardSide === "back") {
                    // Save back state, load front
                    setBackImageUrl(imageUrl)
                    setBackMappings(mappings)
                    setImageUrl(initialImageUrl || "")
                    setMappings(initialMappings && initialMappings.length > 0 ? initialMappings : [])
                    setActiveCardSide("front")
                    setSelectedId(null)
                  }
                }}
                style={{
                  padding: "8px 16px", border: "none",
                  background: activeCardSide === "front" ? "#3b82f6" : "white",
                  color: activeCardSide === "front" ? "white" : "#3b82f6",
                  fontSize: 12, fontWeight: 700, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 4,
                }}
              >
                <span style={{ fontSize: 14 }}>🪪</span> Front
              </button>
              <button
                onClick={() => {
                  if (activeCardSide === "front") {
                    // Save front state to props-level, load back
                    // (front is the "primary" state — already in imageUrl/mappings)
                    const frontImg = imageUrl
                    const frontMaps = [...mappings]
                    setImageUrl(backImageUrl || "")
                    setMappings(backMappings || [])
                    // Store front for restore
                    ;(window as any).__frontImgTemp = frontImg
                    ;(window as any).__frontMapsTemp = frontMaps
                    setActiveCardSide("back")
                    setSelectedId(null)
                  }
                }}
                style={{
                  padding: "8px 16px", border: "none",
                  background: activeCardSide === "back" ? "#3b82f6" : "white",
                  color: activeCardSide === "back" ? "white" : "#3b82f6",
                  fontSize: 12, fontWeight: 700, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 4,
                }}
              >
                <span style={{ fontSize: 14 }}>🔄</span> Back
              </button>
            </div>
          )}

          <button
            className="btn btn-outline"
            onClick={() => {
              if (confirm("Replace the template image? Your field positions will be reset.")) {
                setImageUrl("")
                setMappings([])
              }
            }}
            style={{
              fontSize: 13,
              padding: "8px 16px",
              borderColor: "#ef4444",
              color: "#dc2626",
            }}
          >
            🗑 Replace {activeCardSide === "back" ? "Back" : "Template"}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
            style={{ fontSize: 13, padding: "8px 20px" }}
          >
            {saving ? "Saving..." : "💾 Save Template"}
          </button>
        </div>
      </div>

      <div className="mapper-layout">
        {/* Left: Image Canvas */}
        <div
          className="mapper-canvas"
          style={{
            background: "#0f172a",
            borderRadius: 16,
            padding: 0,
            overflow: "hidden",
            boxSizing: "border-box",
            contain: "layout paint",
            touchAction: "pan-y",
          }}
        >
          {/* ── Professional Canvas Toolbar ── */}
          <div
            className="mapper-toolbar"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 12px",
              background: "linear-gradient(135deg, #1e293b, #0f172a)",
              borderBottom: "1px solid #334155",
              flexWrap: "wrap",
              fontSize: 11,
            }}
          >
            {/* Undo / Redo */}
            <div style={{ display: "flex", gap: 2, marginRight: 6 }}>
              <button
                onClick={undo}
                disabled={undoStack.length === 0}
                title="Undo (Ctrl+Z)"
                style={{
                  width: 30, height: 28, borderRadius: "6px 0 0 6px", border: "1px solid #475569",
                  background: undoStack.length > 0 ? "#334155" : "#1e293b",
                  color: undoStack.length > 0 ? "#f1f5f9" : "#475569",
                  cursor: undoStack.length > 0 ? "pointer" : "not-allowed",
                  fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >↶</button>
              <button
                onClick={redo}
                disabled={redoStack.length === 0}
                title="Redo (Ctrl+Y)"
                style={{
                  width: 30, height: 28, borderRadius: "0 6px 6px 0", border: "1px solid #475569", borderLeft: "none",
                  background: redoStack.length > 0 ? "#334155" : "#1e293b",
                  color: redoStack.length > 0 ? "#f1f5f9" : "#475569",
                  cursor: redoStack.length > 0 ? "pointer" : "not-allowed",
                  fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >↷</button>
            </div>

            {/* Divider */}
            <div style={{ width: 1, height: 20, background: "#475569", marginRight: 6 }} />

            {/* Zoom controls */}
            <div style={{ display: "flex", alignItems: "center", gap: 2, marginRight: 6 }}>
              <button
                onClick={() => setZoomLevel(z => Math.max(25, z - 25))}
                title="Zoom Out (−)"
                style={{
                  width: 26, height: 28, borderRadius: "6px 0 0 6px", border: "1px solid #475569",
                  background: "#334155", color: "#f1f5f9", cursor: "pointer", fontSize: 14,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >−</button>
              <div style={{
                padding: "0 8px", height: 28, border: "1px solid #475569", borderLeft: "none", borderRight: "none",
                background: "#1e293b", color: "#94a3b8", display: "flex", alignItems: "center",
                fontSize: 11, fontWeight: 600, minWidth: 46, justifyContent: "center", fontFamily: "monospace",
              }}>
                {zoomLevel}%
              </div>
              <button
                onClick={() => setZoomLevel(z => Math.min(300, z + 25))}
                title="Zoom In (+)"
                style={{
                  width: 26, height: 28, borderRadius: "0 6px 6px 0", border: "1px solid #475569",
                  background: "#334155", color: "#f1f5f9", cursor: "pointer", fontSize: 14,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >+</button>
              <button
                onClick={() => setZoomLevel(100)}
                title="Reset Zoom"
                style={{
                  marginLeft: 4, padding: "0 8px", height: 28, borderRadius: 6, border: "1px solid #475569",
                  background: zoomLevel === 100 ? "#1e293b" : "#334155", color: "#94a3b8",
                  cursor: "pointer", fontSize: 10, fontWeight: 600,
                }}
              >FIT</button>
            </div>

            {/* Divider */}
            <div style={{ width: 1, height: 20, background: "#475569", marginRight: 6 }} />

            {/* Grid & Snap */}
            <button
              onClick={() => setShowGrid(g => !g)}
              title="Toggle Grid (G)"
              style={{
                padding: "0 8px", height: 28, borderRadius: 6, border: `1.5px solid ${showGrid ? "#3b82f6" : "#475569"}`,
                background: showGrid ? "#1e3a5f" : "#1e293b", color: showGrid ? "#60a5fa" : "#94a3b8",
                cursor: "pointer", fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", gap: 4,
              }}
            >
              <span style={{ fontSize: 12 }}>⊞</span> Grid
            </button>
            <button
              onClick={() => setSnapToGrid(s => !s)}
              title="Snap to Grid"
              style={{
                padding: "0 8px", height: 28, borderRadius: 6, border: `1.5px solid ${snapToGrid ? "#22c55e" : "#475569"}`,
                background: snapToGrid ? "#14532d" : "#1e293b", color: snapToGrid ? "#4ade80" : "#94a3b8",
                cursor: "pointer", fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", gap: 4,
              }}
            >
              <span style={{ fontSize: 12 }}>⊕</span> Snap
            </button>
            {showGrid && (
              <select
                value={gridSize}
                onChange={(e) => setGridSize(Number(e.target.value))}
                title="Grid Size"
                style={{
                  height: 28, padding: "0 6px", borderRadius: 6, border: "1px solid #475569",
                  background: "#1e293b", color: "#94a3b8", fontSize: 10,
                }}
              >
                <option value={2}>2%</option>
                <option value={5}>5%</option>
                <option value={10}>10%</option>
                <option value={20}>20%</option>
              </select>
            )}

            {/* Divider */}
            <div style={{ width: 1, height: 20, background: "#475569", marginRight: 6 }} />

            {/* Rulers */}
            <button
              onClick={() => setShowRulers(r => !r)}
              title="Toggle Rulers"
              style={{
                padding: "0 8px", height: 28, borderRadius: 6, border: `1.5px solid ${showRulers ? "#f59e0b" : "#475569"}`,
                background: showRulers ? "#451a03" : "#1e293b", color: showRulers ? "#fbbf24" : "#94a3b8",
                cursor: "pointer", fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", gap: 4,
              }}
            >
              <span style={{ fontSize: 12 }}>📏</span> Rulers
            </button>

            {/* Spacer */}
            <div style={{ flex: 1 }} />

            {/* Selected field coordinates */}
            {selectedMapping && showCoordinates && (
              <div style={{
                padding: "3px 10px", borderRadius: 6, background: "#1e293b", border: "1px solid #475569",
                color: "#94a3b8", fontSize: 10, fontFamily: "monospace", display: "flex", gap: 8,
              }}>
                <span>X: {(selectedMapping.x ?? 0).toFixed(1)}%</span>
                <span>Y: {(selectedMapping.y ?? 0).toFixed(1)}%</span>
                <span>W: {(selectedMapping.width ?? 0).toFixed(1)}%</span>
                <span>H: {(selectedMapping.height ?? 0).toFixed(1)}%</span>
              </div>
            )}

            {/* Keyboard shortcuts hint */}
            <div style={{ fontSize: 9, color: "#475569", fontStyle: "italic" }}>
              ↑↓←→ nudge · Del remove · Ctrl+D copy
            </div>
          </div>

          {/* Canvas Area with Zoom */}
          <div
            style={{
              overflowX: "auto",
              overflowY: "visible",
              WebkitOverflowScrolling: "touch",
              overscrollBehaviorX: "contain",
              overscrollBehaviorY: "auto",
              touchAction: "pan-x pan-y",
              padding: showRulers && !showPreview ? "36px 36px 36px 40px" : "16px",
              background: "#0f172a",
              display: "flex",
              justifyContent: "center",
              alignItems: "flex-start",
            }}
          >
          <div
            ref={containerRef}
            style={{
              position: "relative",
              display: "block",
              width: `${zoomLevel}%`,
              background: "transparent",
              border: "none",
              borderRadius: 8,
              overflow: showRulers && !showPreview ? "visible" : "hidden",
              transformOrigin: "top left",
              flexShrink: 0,
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setImageDragOver(true)
            }}
            onDragLeave={() => setImageDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setImageDragOver(false)
              const file = e.dataTransfer.files[0]
              if (file) handleImageUpload(file)
            }}
          >
            {/* Ruler overlays — real mm scale */}
            {showRulers && !showPreview && (() => {
              const cw = cardWidth || 85.6
              const ch = cardHeight || 54
              const stepMm = 5
              const hTicks = Math.floor(cw / stepMm)
              const vTicks = Math.floor(ch / stepMm)
              return (
                <>
                  {/* Top ruler (mm) */}
                  <div style={{
                    position: "absolute", top: -20, left: 0, right: 0, height: 20,
                    background: "rgba(30,41,59,0.92)", zIndex: 20, pointerEvents: "none",
                    borderBottom: "1px solid #f59e0b",
                  }}>
                    {Array.from({ length: hTicks + 1 }).map((_, i) => {
                      const mm = i * stepMm
                      const pct = (mm / cw) * 100
                      const isMajor = mm % 10 === 0
                      return (
                        <div key={i} style={{
                          position: "absolute", left: `${pct}%`, top: 0, height: "100%",
                          borderLeft: `1px solid ${isMajor ? "#f59e0b" : "rgba(148,163,184,0.4)"}`,
                          display: "flex", alignItems: "flex-end", paddingLeft: 1,
                        }}>
                          {isMajor && (
                            <span style={{ fontSize: 8, color: "#fbbf24", fontFamily: "monospace", fontWeight: 700 }}>{mm}</span>
                          )}
                        </div>
                      )
                    })}
                    <span style={{ position: "absolute", right: 2, top: 1, fontSize: 7, color: "#94a3b8", fontFamily: "monospace" }}>mm</span>
                  </div>
                  {/* Left ruler (mm) */}
                  <div style={{
                    position: "absolute", top: 0, left: -22, bottom: 0, width: 22,
                    background: "rgba(30,41,59,0.92)", zIndex: 20, pointerEvents: "none",
                    borderRight: "1px solid #f59e0b",
                  }}>
                    {Array.from({ length: vTicks + 1 }).map((_, i) => {
                      const mm = i * stepMm
                      const pct = (mm / ch) * 100
                      const isMajor = mm % 10 === 0
                      return (
                        <div key={i} style={{
                          position: "absolute", top: `${pct}%`, left: 0, width: "100%",
                          borderTop: `1px solid ${isMajor ? "#f59e0b" : "rgba(148,163,184,0.4)"}`,
                          display: "flex", alignItems: "flex-start", justifyContent: "flex-end", paddingRight: 2, paddingTop: 1,
                        }}>
                          {isMajor && (
                            <span style={{ fontSize: 8, color: "#fbbf24", fontFamily: "monospace", fontWeight: 700 }}>{mm}</span>
                          )}
                        </div>
                      )
                    })}
                    <span style={{ position: "absolute", left: 1, bottom: 2, fontSize: 7, color: "#94a3b8", fontFamily: "monospace", writingMode: "vertical-lr" }}>mm</span>
                  </div>
                  {/* Bottom width label */}
                  <div style={{
                    position: "absolute", bottom: -18, left: 0, right: 0, height: 18,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    pointerEvents: "none", zIndex: 20,
                  }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, color: "#fbbf24", fontFamily: "monospace",
                      background: "rgba(30,41,59,0.9)", padding: "1px 8px", borderRadius: 4,
                    }}>↔ {cw} mm</span>
                  </div>
                  {/* Right height label */}
                  <div style={{
                    position: "absolute", top: 0, right: -20, bottom: 0, width: 20,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    pointerEvents: "none", zIndex: 20,
                  }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, color: "#fbbf24", fontFamily: "monospace",
                      background: "rgba(30,41,59,0.9)", padding: "1px 6px", borderRadius: 4,
                      writingMode: "vertical-lr",
                    }}>↕ {ch} mm</span>
                  </div>
                </>
              )
            })()}

            {/* Grid overlay */}
            {showGrid && !showPreview && (
              <div style={{
                position: "absolute", inset: 0, zIndex: 15, pointerEvents: "none",
              }}>
                {/* Vertical lines */}
                {Array.from({ length: Math.floor(100 / gridSize) }).map((_, i) => (
                  <div key={`v${i}`} style={{
                    position: "absolute",
                    left: `${(i + 1) * gridSize}%`,
                    top: 0,
                    bottom: 0,
                    width: 1,
                    background: (i + 1) * gridSize === 50 ? "rgba(59,130,246,0.35)" : "rgba(148,163,184,0.2)",
                  }} />
                ))}
                {/* Horizontal lines */}
                {Array.from({ length: Math.floor(100 / gridSize) }).map((_, i) => (
                  <div key={`h${i}`} style={{
                    position: "absolute",
                    top: `${(i + 1) * gridSize}%`,
                    left: 0,
                    right: 0,
                    height: 1,
                    background: (i + 1) * gridSize === 50 ? "rgba(59,130,246,0.35)" : "rgba(148,163,184,0.2)",
                  }} />
                ))}
              </div>
            )}

            <img
              ref={imageRef}
              src={imageUrl}
              alt="Template"
              style={{
                width: "100%",
                height: "auto",
                display: "block",
                borderRadius: 8,
              }}
              draggable={false}
            />

            {/* Smart Alignment Guides */}
            {dragState && !showPreview && (() => {
              const dragging = mappings.find(m => m.id === dragState.id)
              if (!dragging) return null
              const guides: { type: "h" | "v"; pos: number }[] = []
              const ALIGN_THRESHOLD = 1 // 1% tolerance

              const dLeft = dragging.x
              const dRight = dragging.x + dragging.width
              const dCenterX = dragging.x + dragging.width / 2
              const dTop = dragging.y
              const dBottom = dragging.y + dragging.height
              const dCenterY = dragging.y + dragging.height / 2

              mappings.forEach(other => {
                if (other.id === dragState.id) return
                const oLeft = other.x
                const oRight = other.x + other.width
                const oCenterX = other.x + other.width / 2
                const oTop = other.y
                const oBottom = other.y + other.height
                const oCenterY = other.y + other.height / 2

                // Vertical alignment guides (x-axis matches)
                const vChecks = [
                  { a: dLeft, b: oLeft }, { a: dLeft, b: oRight }, { a: dLeft, b: oCenterX },
                  { a: dRight, b: oLeft }, { a: dRight, b: oRight }, { a: dRight, b: oCenterX },
                  { a: dCenterX, b: oLeft }, { a: dCenterX, b: oRight }, { a: dCenterX, b: oCenterX },
                ]
                vChecks.forEach(({ a, b }) => {
                  if (Math.abs(a - b) < ALIGN_THRESHOLD) {
                    guides.push({ type: "v", pos: b })
                  }
                })

                // Horizontal alignment guides (y-axis matches)
                const hChecks = [
                  { a: dTop, b: oTop }, { a: dTop, b: oBottom }, { a: dTop, b: oCenterY },
                  { a: dBottom, b: oTop }, { a: dBottom, b: oBottom }, { a: dBottom, b: oCenterY },
                  { a: dCenterY, b: oTop }, { a: dCenterY, b: oBottom }, { a: dCenterY, b: oCenterY },
                ]
                hChecks.forEach(({ a, b }) => {
                  if (Math.abs(a - b) < ALIGN_THRESHOLD) {
                    guides.push({ type: "h", pos: b })
                  }
                })
              })

              // Also check 50% center of canvas
              if (Math.abs(dCenterX - 50) < ALIGN_THRESHOLD) guides.push({ type: "v", pos: 50 })
              if (Math.abs(dCenterY - 50) < ALIGN_THRESHOLD) guides.push({ type: "h", pos: 50 })

              // Deduplicate
              const uniqueGuides = guides.filter((g, i, arr) =>
                arr.findIndex(o => o.type === g.type && Math.abs(o.pos - g.pos) < 0.5) === i
              )

              return uniqueGuides.map((g, i) => (
                <div key={`guide-${i}`} style={{
                  position: "absolute",
                  ...(g.type === "v" ? {
                    left: `${g.pos}%`, top: 0, bottom: 0, width: 1,
                  } : {
                    top: `${g.pos}%`, left: 0, right: 0, height: 1,
                  }),
                  background: "#22c55e",
                  opacity: 0.7,
                  zIndex: 25,
                  pointerEvents: "none",
                }} />
              ))
            })()}

            {/* Field overlays */}
            {mappings.map((m) => {
              const isSelected = m.id === selectedId
              const isClassDivField = isClassDivisionFieldKey(m.fieldKey)
              // Resolve preview value with this priority:
              //   1. Real student data from the current school (passed via
              //      previewStudent — uses the shared field-resolver so
              //      "mobile" → "phone", etc.).
              //   2. Generic SAMPLE_DATA placeholders.
              //   3. Field label as a last-resort placeholder.
              let sampleValue = ""
              if (m.type !== "photo" && m.type !== "flag") {
                const realValue = previewStudent?.formData
                  ? resolveDisplayFieldValue(previewStudent.formData, m.fieldKey)
                  : ""
                sampleValue = realValue || SAMPLE_DATA[m.fieldKey] || m.label
              }

              return (
                <div
                  key={m.id}
                  onMouseDown={(e) => handleMouseDown(e, m.id, "move")}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setSelectedId(m.id)
                    setContextMenu({ x: e.clientX, y: e.clientY, fieldId: m.id })
                  }}
                  style={{
                    position: "absolute",
                    left: `${m.x}%`,
                    top: `${m.y}%`,
                    width: `${m.width}%`,
                    height: `${m.height}%`,
                    border: (m.type === "photo" || m.type === "flag") && (m.photoBorderWidth || 0) > 0
                      ? `${m.photoBorderWidth}px solid ${m.photoBorderColor || "#000"}`
                      : showPreview
                      ? "none"
                      : `2px ${isSelected ? "solid" : "dashed"} ${
                          isSelected ? "#3b82f6" : isClassDivField ? "#eab308" : m.type === "flag" ? "#f59e0b" : "rgba(255,255,255,0.6)"
                        }`,
                    borderRadius: (m.type === "photo" || m.type === "flag")
                      ? `${m.photoBorderRadius || 0}px`
                      : 2,
                    background: m.type === "photo"
                      ? showPreview ? "transparent" : "rgba(59, 130, 246, 0.15)"
                      : m.type === "flag"
                      ? showPreview ? "transparent" : "rgba(245, 158, 11, 0.15)"
                      : isClassDivField
                      ? showPreview ? "transparent" : "rgba(234, 179, 8, 0.15)"
                      : showPreview
                      ? "transparent"
                      : isSelected
                      ? "rgba(59, 130, 246, 0.1)"
                      : "rgba(255, 255, 255, 0.08)",
                    cursor: showPreview ? "default" : "move",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: (m.type === "photo" || m.type === "flag") ? "center" : "flex-start",
                    padding: (m.type === "photo" || m.type === "flag") ? 0 : "0 4px",
                    overflow: "hidden",
                    boxShadow: isSelected
                      ? "0 0 0 2px rgba(59,130,246,0.3)"
                      : "none",
                    transition: "box-shadow 0.15s",
                    zIndex: isSelected ? 10 : 1,
                    touchAction: "pan-y",
                  }}
                >
                  {m.type === "photo" ? (
                    showPreview ? (
                      previewStudent?.photoUrl ? (
                        // Show the real student's photo (contain-fit so the full
                        // image is visible, matching JpgCardPreview behavior).
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={previewStudent.photoUrl}
                          alt="Student"
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            borderRadius: `${m.photoBorderRadius || 0}px`,
                          }}
                        />
                      ) : (
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          background: "#ddd",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <svg
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#94a3b8"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <polyline points="21 15 16 10 5 21" />
                        </svg>
                      </div>
                      )
                    ) : (
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="rgba(255,255,255,0.8)"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                          <circle cx="12" cy="13" r="4" />
                        </svg>
                      </div>
                    )
                  ) : m.type === "flag" ? (
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <span style={{ fontSize: showPreview ? 20 : 16, opacity: showPreview ? 0.5 : 0.9 }}>🏴</span>
                    </div>
                  ) : (
                    (() => {
                      const displayText =
                        m.dateFormat && showPreview
                          ? formatDateValue(sampleValue, m.dateFormat)
                          : sampleValue
                      // pt → editor-pixels using the rendered image width
                      // and the card's mm width. Same formula as the
                      // renderer (JpgCardPreview / BatchGenerator) so the
                      // editor preview matches the printed card exactly.
                      const fontScale = editorImgWidth > 0 && cardWidth > 0
                        ? (editorImgWidth * 25.4) / (cardWidth * 72)
                        : editorImgWidth / EDITOR_REFERENCE_WIDTH
                      const baseStyle: React.CSSProperties = {
                        fontSize: m.fontSize * fontScale,
                        color: m.fontColor,
                        fontWeight: m.fontWeight,
                        fontFamily: m.fontFamily,
                        fontStyle: m.fontStyle || "normal",
                        textDecoration: m.textDecoration || "none",
                        letterSpacing: `${m.letterSpacing || 0}px`,
                        lineHeight: m.lineHeight || 1.2,
                        textTransform: (m.textTransform || "none") as any,
                        textShadow: showPreview ? "none" : `0 0 3px rgba(0,0,0,0.4), 0 0 1px rgba(0,0,0,0.6)`,
                        WebkitTextStroke: !showPreview ? "0.3px rgba(0,0,0,0.2)" : undefined,
                        textAlign: m.textAlign || "left",
                      }
                      // "multiline" mode → wrap to next line while preserving the chosen
                      // font size. Best for long addresses where shrinking the text would
                      // make it unreadable. Text that overflows the box vertically is
                      // clipped (overflow:hidden) rather than truncated with "...".
                      if (m.textWrap === "multiline") {
                        return (
                          <span
                            style={{
                              ...baseStyle,
                              whiteSpace: "normal",
                              overflowWrap: "break-word",
                              wordBreak: "break-word",
                              overflow: "hidden",
                              width: "100%",
                              height: "100%",
                              display: "block",
                            }}
                          >
                            {displayText}
                          </span>
                        )
                      }
                      // "wrap" mode → keep selected font size and wrap text inside the box.
                      if (m.textWrap === "wrap") {
                        return (
                          <FixedWrapText
                            text={displayText}
                            style={baseStyle}
                          />
                        )
                      }
                      // "nowrap" mode → single line, ellipsis if overflow
                      return (
                        <span
                          style={{
                            ...baseStyle,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            width: "100%",
                            height: "auto",
                            display: "block",
                          }}
                        >
                          {displayText}
                        </span>
                      )
                    })()
                  )}

                  {/* Resize handles */}
                  {isSelected && !showPreview && (
                    <>
                      {/* Corners */}
                      <div onMouseDown={(e) => handleMouseDown(e, m.id, "nw")} style={{ position: "absolute", left: -4, top: -4, width: 8, height: 8, background: "#3b82f6", cursor: "nwse-resize", border: "1px solid white", borderRadius: 2 }} />
                      <div onMouseDown={(e) => handleMouseDown(e, m.id, "ne")} style={{ position: "absolute", right: -4, top: -4, width: 8, height: 8, background: "#3b82f6", cursor: "nesw-resize", border: "1px solid white", borderRadius: 2 }} />
                      <div onMouseDown={(e) => handleMouseDown(e, m.id, "sw")} style={{ position: "absolute", left: -4, bottom: -4, width: 8, height: 8, background: "#3b82f6", cursor: "nesw-resize", border: "1px solid white", borderRadius: 2 }} />
                      <div onMouseDown={(e) => handleMouseDown(e, m.id, "se")} style={{ position: "absolute", right: -4, bottom: -4, width: 8, height: 8, background: "#3b82f6", cursor: "nwse-resize", border: "1px solid white", borderRadius: 2 }} />
                      
                      {/* Edges */}
                      <div onMouseDown={(e) => handleMouseDown(e, m.id, "n")} style={{ position: "absolute", left: "50%", top: -4, transform: "translateX(-50%)", width: 8, height: 8, background: "#3b82f6", cursor: "ns-resize", border: "1px solid white", borderRadius: 2 }} />
                      <div onMouseDown={(e) => handleMouseDown(e, m.id, "s")} style={{ position: "absolute", left: "50%", bottom: -4, transform: "translateX(-50%)", width: 8, height: 8, background: "#3b82f6", cursor: "ns-resize", border: "1px solid white", borderRadius: 2 }} />
                      <div onMouseDown={(e) => handleMouseDown(e, m.id, "w")} style={{ position: "absolute", left: -4, top: "50%", transform: "translateY(-50%)", width: 8, height: 8, background: "#3b82f6", cursor: "ew-resize", border: "1px solid white", borderRadius: 2 }} />
                      <div onMouseDown={(e) => handleMouseDown(e, m.id, "e")} style={{ position: "absolute", right: -4, top: "50%", transform: "translateY(-50%)", width: 8, height: 8, background: "#3b82f6", cursor: "ew-resize", border: "1px solid white", borderRadius: 2 }} />
                    </>
                  )}
                </div>
              )
            })}
          </div>
          </div>
        </div>

        {/* Right: Sidebar */}
        <div
          className="mapper-sidebar"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            WebkitOverflowScrolling: "touch",
            touchAction: "pan-y",
            contain: "layout paint",
          }}
        >

          {/* Card Settings Panel */}
          {!showPreview && (
            <div
              style={{
                background: cardSizeLocked
                  ? "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)"
                  : "linear-gradient(135deg, #f0f4ff 0%, #e8f0fe 100%)",
                borderRadius: 14,
                border: cardSizeLocked ? "1.5px solid #86efac" : "1px solid #bfdbfe",
                padding: 16,
              }}
            >
              <h4
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: cardSizeLocked ? "#166534" : "#1e40af",
                  marginBottom: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span style={{ fontSize: 16 }}>🪪</span> Card Settings
                {cardSizeLocked && (
                  <span style={{ fontSize: 10, background: "#16a34a", color: "white", padding: "2px 8px", borderRadius: 10, marginLeft: "auto" }}>
                    🔒 SIZE LOCKED
                  </span>
                )}
              </h4>

              {/* Saved Size Badge — always visible */}
              <div style={{
                background: cardSizeLocked ? "#f0fdf4" : "#eff6ff",
                border: cardSizeLocked ? "1px solid #bbf7d0" : "1px solid #bfdbfe",
                borderRadius: 8,
                padding: "8px 12px",
                marginBottom: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "#6b7280", marginBottom: 2 }}>
                    Current Card Size
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: cardSizeLocked ? "#166534" : "#1e40af" }}>
                    {cardWidth} × {cardHeight} mm
                  </div>
                  <div style={{ fontSize: 9, color: "#6b7280" }}>
                    {Math.round(cardWidth * cardDpi / 25.4)} × {Math.round(cardHeight * cardDpi / 25.4)} px at {cardDpi} DPI
                  </div>
                </div>
                <button
                  onClick={() => setCardSizeLocked(!cardSizeLocked)}
                  title={cardSizeLocked ? "Unlock card size to allow changes" : "Lock card size to prevent accidental changes"}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    border: cardSizeLocked ? "2px solid #16a34a" : "2px solid #d1d5db",
                    background: cardSizeLocked ? "#dcfce7" : "white",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                  }}
                >
                  {cardSizeLocked ? "🔒" : "🔓"}
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10, opacity: cardSizeLocked ? 0.6 : 1 }}>
                {/* Card Size Preset */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#3b82f6", marginBottom: 4, display: "block" }}>
                    Card Size Standard
                  </label>
                  <select
                    value={cardSizePreset}
                    onChange={(e) => handleCardSizeChange(e.target.value)}
                    disabled={cardSizeLocked}
                    style={{
                      width: "100%",
                      height: 34,
                      padding: "0 8px",
                      border: "1.5px solid #bfdbfe",
                      borderRadius: 8,
                      fontSize: 12,
                      background: cardSizeLocked ? "#f3f4f6" : "white",
                    }}
                  >
                    {CARD_SIZE_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label} ({p.width}×{p.height} mm)
                      </option>
                    ))}
                  </select>
                  <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>
                    {CARD_SIZE_PRESETS.find(p => p.id === cardSizePreset)?.desc}
                  </div>
                </div>

                {/* Width × Height Inputs — text mode for free typing */}
                <div style={{ display: "flex", gap: 6 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 2 }}>
                      Width (mm)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={cardWidthStr}
                      disabled={cardSizeLocked}
                      onChange={(e) => {
                        const v = e.target.value
                        if (v === "" || /^\d*\.?\d*$/.test(v)) {
                          setCardWidthStr(v)
                          const n = parseFloat(v)
                          if (!isNaN(n) && n > 0) { setCardWidth(n); setCardSizePreset("custom") }
                        }
                      }}
                      onBlur={() => {
                        const n = parseFloat(cardWidthStr)
                        if (!isNaN(n) && n > 0) { setCardWidth(n); setCardWidthStr(String(n)); autoSaveCardSize(n, cardHeight, cardOrientation) }
                        else { setCardWidthStr(String(cardWidth)) }
                      }}
                      style={{
                        width: "100%",
                        height: 30,
                        padding: "0 8px",
                        border: "1.5px solid #bfdbfe",
                        borderRadius: 6,
                        fontSize: 12,
                        textAlign: "center",
                        background: cardSizeLocked ? "#f3f4f6" : "white",
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 6, fontSize: 14, color: "#94a3b8" }}>×</div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 2 }}>
                      Height (mm)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={cardHeightStr}
                      disabled={cardSizeLocked}
                      onChange={(e) => {
                        const v = e.target.value
                        if (v === "" || /^\d*\.?\d*$/.test(v)) {
                          setCardHeightStr(v)
                          const n = parseFloat(v)
                          if (!isNaN(n) && n > 0) { setCardHeight(n); setCardSizePreset("custom") }
                        }
                      }}
                      onBlur={() => {
                        const n = parseFloat(cardHeightStr)
                        if (!isNaN(n) && n > 0) { setCardHeight(n); setCardHeightStr(String(n)); autoSaveCardSize(cardWidth, n, cardOrientation) }
                        else { setCardHeightStr(String(cardHeight)) }
                      }}
                      style={{
                        width: "100%",
                        height: 30,
                        padding: "0 8px",
                        border: "1.5px solid #bfdbfe",
                        borderRadius: 6,
                        fontSize: 12,
                        textAlign: "center",
                        background: cardSizeLocked ? "#f3f4f6" : "white",
                      }}
                    />
                  </div>
                </div>

                {/* Orientation */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#3b82f6", marginBottom: 4, display: "block" }}>
                    Orientation
                  </label>
                  <div style={{ display: "flex", gap: 4 }}>
                    {(["landscape", "portrait"] as const).map((orient) => (
                      <button
                        key={orient}
                        type="button"
                        disabled={cardSizeLocked}
                        onClick={() => handleOrientationChange(orient)}
                        style={{
                          flex: 1,
                          padding: "6px 10px",
                          borderRadius: 6,
                          border: `1.5px solid ${cardOrientation === orient ? "#3b82f6" : "#d1d5db"}`,
                          background: cardOrientation === orient ? "#dbeafe" : "white",
                          color: cardOrientation === orient ? "#1e40af" : "#6b7280",
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: cardSizeLocked ? "not-allowed" : "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 4,
                        }}
                      >
                        <span style={{
                          display: "inline-block",
                          width: orient === "landscape" ? 16 : 10,
                          height: orient === "landscape" ? 10 : 16,
                          border: "2px solid currentColor",
                          borderRadius: 2,
                        }} />
                        {orient === "landscape" ? "Landscape" : "Portrait"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
                {/* Print Sides */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#3b82f6", marginBottom: 4, display: "block" }}>
                    Print Sides
                  </label>
                  <div style={{ display: "flex", gap: 4 }}>
                    {(["front", "both"] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setPrintSides(mode)}
                        style={{
                          flex: 1,
                          padding: "6px 10px",
                          borderRadius: 6,
                          border: `1.5px solid ${printSides === mode ? "#3b82f6" : "#d1d5db"}`,
                          background: printSides === mode ? "#dbeafe" : "white",
                          color: printSides === mode ? "#1e40af" : "#6b7280",
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {mode === "front" ? "🔲 Front Only" : "🔳 Front & Back"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Front/Back Side Switcher (when both sides enabled) */}
                {printSides === "both" && (
                  <div style={{ display: "flex", gap: 4 }}>
                    {(["front", "back"] as const).map((side) => (
                      <button
                        key={side}
                        onClick={() => setActiveCardSide(side)}
                        style={{
                          flex: 1,
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: `2px solid ${activeCardSide === side ? "#2563eb" : "#e2e8f0"}`,
                          background: activeCardSide === side
                            ? "linear-gradient(135deg, #3b82f6, #2563eb)"
                            : "white",
                          color: activeCardSide === side ? "white" : "#6b7280",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                          transition: "all 0.2s",
                        }}
                      >
                        {side === "front" ? "▶ Front Side" : "◀ Back Side"}
                      </button>
                    ))}
                  </div>
                )}

                {/* DPI & Bleed */}
                <div style={{ display: "flex", gap: 6 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 2 }}>
                      DPI (Resolution)
                    </label>
                    <select
                      value={cardDpi}
                      onChange={(e) => setCardDpi(Number(e.target.value))}
                      style={{
                        width: "100%",
                        height: 30,
                        padding: "0 6px",
                        border: "1.5px solid #bfdbfe",
                        borderRadius: 6,
                        fontSize: 11,
                        background: "white",
                      }}
                    >
                      <option value={150}>150 DPI (Draft)</option>
                      <option value={300}>300 DPI (Standard)</option>
                      <option value={600}>600 DPI (High)</option>
                      <option value={1200}>1200 DPI (Ultra)</option>
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 2 }}>
                      Bleed (mm)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={5}
                      step={0.5}
                      value={bleedMargin}
                      onChange={(e) => setBleedMargin(Number(e.target.value))}
                      style={{
                        width: "100%",
                        height: 30,
                        padding: "0 8px",
                        border: "1.5px solid #bfdbfe",
                        borderRadius: 6,
                        fontSize: 11,
                        textAlign: "center",
                        background: "white",
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Fixed Branch (Optional) */}
              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#3b82f6", marginBottom: 4, display: "block" }}>
                  Fixed Branch (Optional)
                </label>
                <input
                  type="text"
                  value={fixedBranch}
                  onChange={(e) => setFixedBranch(e.target.value)}
                  placeholder="e.g. Bibvewadi Branch"
                  style={{
                    width: "100%",
                    height: 34,
                    padding: "0 8px",
                    border: "1.5px solid #bfdbfe",
                    borderRadius: 8,
                    fontSize: 12,
                    background: "white",
                  }}
                />
                <div style={{ fontSize: 9, color: "#6b7280", marginTop: 3, lineHeight: 1.35 }}>
                  If set, the branch will be pre-filled/fixed for this template, and the student registration form will hide the branch field.
                </div>
              </div>
            </div>
          )}

          {/* Selected Field Properties */}
          {selectedMapping && !showPreview && (
            <div
              style={{
                background: "white",
                borderRadius: 14,
                border: "1px solid #3b82f6",
                padding: 16,
              }}
            >
              <h4
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#0f172a",
                  marginBottom: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span style={{ fontSize: 16 }}>⚙️</span> {selectedMapping.label}{" "}
                Properties
              </h4>

              {/* Layer & Action Controls */}
              <div style={{
                display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap",
              }}>
                {/* Layer ordering */}
                <div style={{
                  display: "flex", gap: 1, background: "#f1f5f9", borderRadius: 6, padding: 2,
                }}>
                  <button
                    onClick={() => sendToBack(selectedMapping.id)}
                    title="Send to Back"
                    style={{
                      width: 28, height: 24, border: "none", borderRadius: 4,
                      background: "transparent", color: "#64748b", cursor: "pointer",
                      fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >⏬</button>
                  <button
                    onClick={() => moveLayerDown(selectedMapping.id)}
                    title="Move Down"
                    style={{
                      width: 28, height: 24, border: "none", borderRadius: 4,
                      background: "transparent", color: "#64748b", cursor: "pointer",
                      fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >🔽</button>
                  <button
                    onClick={() => moveLayerUp(selectedMapping.id)}
                    title="Move Up"
                    style={{
                      width: 28, height: 24, border: "none", borderRadius: 4,
                      background: "transparent", color: "#64748b", cursor: "pointer",
                      fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >🔼</button>
                  <button
                    onClick={() => bringToFront(selectedMapping.id)}
                    title="Bring to Front"
                    style={{
                      width: 28, height: 24, border: "none", borderRadius: 4,
                      background: "transparent", color: "#64748b", cursor: "pointer",
                      fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >⏫</button>
                </div>

                <div style={{ flex: 1 }} />

                {/* Actions */}
                <button
                  onClick={() => duplicateField(selectedMapping.id)}
                  title="Duplicate (Ctrl+D)"
                  style={{
                    padding: "0 8px", height: 28, borderRadius: 6,
                    border: "1px solid #dbeafe", background: "#eff6ff",
                    color: "#3b82f6", cursor: "pointer", fontSize: 10, fontWeight: 600,
                    display: "flex", alignItems: "center", gap: 3,
                  }}
                >📋 Duplicate</button>
                <button
                  onClick={() => removeFieldMapping(selectedMapping.id)}
                  title="Delete (Del)"
                  style={{
                    padding: "0 8px", height: 28, borderRadius: 6,
                    border: "1px solid #fecaca", background: "#fef2f2",
                    color: "#ef4444", cursor: "pointer", fontSize: 10, fontWeight: 600,
                    display: "flex", alignItems: "center", gap: 3,
                  }}
                >🗑 Delete</button>
              </div>

              {/* Position & Size (precise input) */}
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4,
                marginBottom: 12, padding: 8, background: "#f8fafc", borderRadius: 8,
                border: "1px solid #e2e8f0",
              }}>
                {[
                  { label: "X", key: "x" as const },
                  { label: "Y", key: "y" as const },
                  { label: "W", key: "width" as const },
                  { label: "H", key: "height" as const },
                ].map(({ label, key }) => (
                  <div key={key}>
                    <label style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", display: "block", textAlign: "center" }}>
                      {label} (%)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={Number(selectedMapping[key]).toFixed(1)}
                      onChange={(e) => updateMapping(selectedMapping.id, { [key]: Number(e.target.value) })}
                      style={{
                        width: "100%", height: 26, padding: "0 4px",
                        border: "1px solid #e2e8f0", borderRadius: 4,
                        fontSize: 11, textAlign: "center", fontFamily: "monospace",
                      }}
                    />
                  </div>
                ))}
              </div>

              {selectedMapping.type === "text" && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  {/* Field Form Label */}
                  <div>
                    <label
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#64748b",
                        marginBottom: 4,
                        display: "block",
                      }}
                    >
                      Form Question Title (What students see)
                    </label>
                    <input
                      type="text"
                      value={selectedMapping.label}
                      onChange={(e) =>
                        updateMapping(selectedMapping.id, {
                          label: e.target.value,
                        })
                      }
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "1.5px solid #e2e8f0",
                        fontSize: 13,
                        outline: "none",
                      }}
                      placeholder="e.g. Father's Mobile Number"
                    />
                  </div>
                  
                  {/* Font Size */}
                  <div>
                    <label
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#64748b",
                        marginBottom: 4,
                        display: "block",
                      }}
                    >
                      Font Size: {selectedMapping.fontSize}px
                    </label>
                    <input
                      type="range"
                      min="8"
                      max="48"
                      value={selectedMapping.fontSize}
                      onChange={(e) =>
                        updateMapping(selectedMapping.id, {
                          fontSize: Number(e.target.value),
                        })
                      }
                      style={{ width: "100%", accentColor: "#3b82f6" }}
                    />
                  </div>

                  {/* Font Color */}
                  <div>
                    <label
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#64748b",
                        marginBottom: 4,
                        display: "block",
                      }}
                    >
                      Font Color
                    </label>
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        alignItems: "center",
                      }}
                    >
                      <input
                        type="color"
                        value={selectedMapping.fontColor}
                        onChange={(e) =>
                          updateMapping(selectedMapping.id, {
                            fontColor: e.target.value,
                          })
                        }
                        style={{
                          width: 36,
                          height: 36,
                          border: "1px solid #e2e8f0",
                          borderRadius: 8,
                          cursor: "pointer",
                          padding: 2,
                        }}
                      />
                      {[
                        "#000000", "#FFFFFF", "#1e3a5f", "#334155", "#64748b",
                        "#dc2626", "#ea580c", "#d97706", "#16a34a", "#0891b2",
                        "#2563eb", "#7c3aed", "#db2777", "#8B4513", "#6B7280",
                      ].map((color) => (
                        <button
                          key={color}
                          onClick={() =>
                            updateMapping(selectedMapping.id, {
                              fontColor: color,
                            })
                          }
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: 6,
                            background: color,
                            border: `2px solid ${
                              selectedMapping.fontColor === color
                                ? "#3b82f6"
                                : "#d1d5db"
                            }`,
                            cursor: "pointer",
                            transition: "all 0.15s",
                            transform: selectedMapping.fontColor === color ? "scale(1.15)" : "scale(1)",
                            boxShadow: selectedMapping.fontColor === color ? "0 0 0 2px rgba(59,130,246,0.3)" : "none",
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Font Weight */}
                  <div>
                    <label
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#64748b",
                        marginBottom: 4,
                        display: "block",
                      }}
                    >
                      Font Weight
                    </label>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() =>
                          updateMapping(selectedMapping.id, {
                            fontWeight: "normal",
                          })
                        }
                        style={{
                          flex: 1,
                          padding: "6px 12px",
                          borderRadius: 6,
                          border: `1.5px solid ${
                            selectedMapping.fontWeight === "normal"
                              ? "#3b82f6"
                              : "#e2e8f0"
                          }`,
                          background:
                            selectedMapping.fontWeight === "normal"
                              ? "#eff6ff"
                              : "white",
                          color:
                            selectedMapping.fontWeight === "normal"
                              ? "#2563eb"
                              : "#64748b",
                          fontSize: 12,
                          fontWeight: 400,
                          cursor: "pointer",
                        }}
                      >
                        Normal
                      </button>
                      <button
                        onClick={() =>
                          updateMapping(selectedMapping.id, {
                            fontWeight: "bold",
                          })
                        }
                        style={{
                          flex: 1,
                          padding: "6px 12px",
                          borderRadius: 6,
                          border: `1.5px solid ${
                            selectedMapping.fontWeight === "bold"
                              ? "#3b82f6"
                              : "#e2e8f0"
                          }`,
                          background:
                            selectedMapping.fontWeight === "bold"
                              ? "#eff6ff"
                              : "white",
                          color:
                            selectedMapping.fontWeight === "bold"
                              ? "#2563eb"
                              : "#64748b",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Bold
                      </button>
                    </div>
                  </div>

                  {/* Font Family */}
                  <div>
                    <label
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#64748b",
                        marginBottom: 4,
                        display: "block",
                      }}
                    >
                      Font Family
                    </label>
                    <select
                      value={selectedMapping.fontFamily}
                      onChange={(e) =>
                        updateMapping(selectedMapping.id, {
                          fontFamily: e.target.value,
                        })
                      }
                      style={{
                        width: "100%",
                        height: 36,
                        padding: "0 8px",
                        border: "1.5px solid #e2e8f0",
                        borderRadius: 8,
                        fontSize: 13,
                        fontFamily: selectedMapping.fontFamily,
                      }}
                    >
                      {FONT_FAMILIES.map((f) => (
                        <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
                      ))}
                    </select>
                  </div>

                  {/* Quick Dialog Buttons */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button
                      onClick={() => openDialogWithSnapshot(() => setShowFontDialog(true))}
                      style={{
                        flex: 1, padding: "6px 10px", borderRadius: 6,
                        border: "1.5px solid #3b82f6", background: "#eff6ff",
                        color: "#2563eb", fontSize: 12, fontWeight: 700, cursor: "pointer",
                        fontFamily: "Tahoma, Arial, sans-serif",
                      }}
                    >
                      A Font...
                    </button>
                    <button
                      onClick={() => openDialogWithSnapshot(() => setShowColorDialog(true))}
                      style={{
                        flex: 1, padding: "6px 10px", borderRadius: 6,
                        border: "1.5px solid #e2e8f0", background: "white",
                        color: "#334155", fontSize: 12, fontWeight: 700, cursor: "pointer",
                      }}
                    >
                      🎨 Color...
                    </button>
                    <button
                      onClick={() => setShowWrapDialog(true)}
                      style={{
                        flex: 1, padding: "6px 10px", borderRadius: 6,
                        border: "1.5px solid #e2e8f0", background: "white",
                        color: "#334155", fontSize: 12, fontWeight: 700, cursor: "pointer",
                      }}
                    >
                      ↩ Wrap...
                    </button>
                  </div>

                  {/* Font Style (Italic) & Text Decoration (Underline/Strikethrough) */}
                  <div>
                    <label
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#64748b",
                        marginBottom: 4,
                        display: "block",
                      }}
                    >
                      Font Style
                    </label>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        onClick={() =>
                          updateMapping(selectedMapping.id, {
                            fontStyle: selectedMapping.fontStyle === "italic" ? "normal" : "italic",
                          })
                        }
                        style={{
                          flex: 1,
                          padding: "6px 10px",
                          borderRadius: 6,
                          border: `1.5px solid ${selectedMapping.fontStyle === "italic" ? "#3b82f6" : "#e2e8f0"}`,
                          background: selectedMapping.fontStyle === "italic" ? "#eff6ff" : "white",
                          color: selectedMapping.fontStyle === "italic" ? "#2563eb" : "#64748b",
                          fontSize: 13,
                          fontStyle: "italic",
                          cursor: "pointer",
                        }}
                      >
                        I
                      </button>
                      <button
                        onClick={() =>
                          updateMapping(selectedMapping.id, {
                            textDecoration: selectedMapping.textDecoration === "underline" ? "none" : "underline",
                          })
                        }
                        style={{
                          flex: 1,
                          padding: "6px 10px",
                          borderRadius: 6,
                          border: `1.5px solid ${selectedMapping.textDecoration === "underline" ? "#3b82f6" : "#e2e8f0"}`,
                          background: selectedMapping.textDecoration === "underline" ? "#eff6ff" : "white",
                          color: selectedMapping.textDecoration === "underline" ? "#2563eb" : "#64748b",
                          fontSize: 13,
                          textDecoration: "underline",
                          cursor: "pointer",
                        }}
                      >
                        U
                      </button>
                      <button
                        onClick={() =>
                          updateMapping(selectedMapping.id, {
                            textDecoration: selectedMapping.textDecoration === "line-through" ? "none" : "line-through",
                          })
                        }
                        style={{
                          flex: 1,
                          padding: "6px 10px",
                          borderRadius: 6,
                          border: `1.5px solid ${selectedMapping.textDecoration === "line-through" ? "#3b82f6" : "#e2e8f0"}`,
                          background: selectedMapping.textDecoration === "line-through" ? "#eff6ff" : "white",
                          color: selectedMapping.textDecoration === "line-through" ? "#2563eb" : "#64748b",
                          fontSize: 13,
                          textDecoration: "line-through",
                          cursor: "pointer",
                        }}
                      >
                        S
                      </button>
                    </div>
                  </div>

                  {/* Text Alignment */}
                  <div>
                    <label
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#64748b",
                        marginBottom: 4,
                        display: "block",
                      }}
                    >
                      Text Alignment
                    </label>
                    <div style={{ display: "flex", gap: 6 }}>
                      {(["left", "center", "right"] as const).map((align) => (
                        <button
                          key={align}
                          onClick={() =>
                            updateMapping(selectedMapping.id, {
                              textAlign: align,
                            })
                          }
                          style={{
                            flex: 1,
                            padding: "6px 12px",
                            borderRadius: 6,
                            border: `1.5px solid ${
                              (selectedMapping.textAlign || "left") === align
                                ? "#3b82f6"
                                : "#e2e8f0"
                            }`,
                            background:
                              (selectedMapping.textAlign || "left") === align
                                ? "#eff6ff"
                                : "white",
                            color:
                              (selectedMapping.textAlign || "left") === align
                                ? "#2563eb"
                                : "#64748b",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                            textTransform: "capitalize",
                          }}
                        >
                          {align === "left" ? "◁ Left" : align === "center" ? "◈ Center" : "▷ Right"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Text Wrap */}
                  <div>
                    <label
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#64748b",
                        marginBottom: 4,
                        display: "block",
                      }}
                    >
                      Text Wrap
                    </label>
                    <div style={{ display: "flex", gap: 6 }}>
                      {(["nowrap", "multiline", "wrap"] as const).map((mode) => (
                        <button
                          key={mode}
                          onClick={() =>
                            updateMapping(selectedMapping.id, { textWrap: mode })
                          }
                          style={{
                            flex: 1,
                            padding: "6px 8px",
                            borderRadius: 6,
                            border: `1.5px solid ${
                              (selectedMapping.textWrap || "nowrap") === mode
                                ? "#3b82f6"
                                : "#e2e8f0"
                            }`,
                            background:
                              (selectedMapping.textWrap || "nowrap") === mode
                                ? "#eff6ff"
                                : "white",
                            color:
                              (selectedMapping.textWrap || "nowrap") === mode
                                ? "#2563eb"
                                : "#64748b",
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          {mode === "nowrap" ? "No Wrap" : mode === "multiline" ? "↵ Multi-line" : "↔ Auto-fit"}
                        </button>
                      ))}
                    </div>
                    <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>
                      {(selectedMapping.textWrap || "nowrap") === "multiline"
                        ? "Text wraps to the next line and keeps your chosen font size — best for long addresses."
                        : (selectedMapping.textWrap || "nowrap") === "wrap"
                        ? "Long text auto-shrinks to fit on one line — full name always visible, no \"...\""
                        : "Text stays on a single line; long text is truncated with \"...\""}
                    </div>
                  </div>

                  {/* Text Transform */}
                  <div>
                    <label
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#64748b",
                        marginBottom: 4,
                        display: "block",
                      }}
                    >
                      Text Transform
                    </label>
                    <div style={{ display: "flex", gap: 4 }}>
                      {(["none", "uppercase", "lowercase", "capitalize"] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() =>
                            updateMapping(selectedMapping.id, { textTransform: t })
                          }
                          style={{
                            flex: 1,
                            padding: "5px 6px",
                            borderRadius: 6,
                            border: `1.5px solid ${
                              (selectedMapping.textTransform || "none") === t
                                ? "#3b82f6"
                                : "#e2e8f0"
                            }`,
                            background:
                              (selectedMapping.textTransform || "none") === t
                                ? "#eff6ff"
                                : "white",
                            color:
                              (selectedMapping.textTransform || "none") === t
                                ? "#2563eb"
                                : "#64748b",
                            fontSize: 10,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          {t === "none" ? "Aa" : t === "uppercase" ? "AA" : t === "lowercase" ? "aa" : "Aa+"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Letter Spacing & Line Height */}
                  <div style={{ display: "flex", gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <label
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#64748b",
                          marginBottom: 4,
                          display: "block",
                        }}
                      >
                        Letter Spacing: {selectedMapping.letterSpacing || 0}px
                      </label>
                      <input
                        type="range"
                        min="-2"
                        max="10"
                        step="0.5"
                        value={selectedMapping.letterSpacing || 0}
                        onChange={(e) =>
                          updateMapping(selectedMapping.id, {
                            letterSpacing: Number(e.target.value),
                          })
                        }
                        style={{ width: "100%", accentColor: "#3b82f6" }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#64748b",
                          marginBottom: 4,
                          display: "block",
                        }}
                      >
                        Line Height: {(selectedMapping.lineHeight || 1.2).toFixed(1)}
                      </label>
                      <input
                        type="range"
                        min="0.8"
                        max="3"
                        step="0.1"
                        value={selectedMapping.lineHeight || 1.2}
                        onChange={(e) =>
                          updateMapping(selectedMapping.id, {
                            lineHeight: Number(e.target.value),
                          })
                        }
                        style={{ width: "100%", accentColor: "#3b82f6" }}
                      />
                    </div>
                  </div>

                  {/* Date Format (only for date fields) */}
                  {(selectedMapping.fieldKey === "dateOfBirth" ||
                    selectedMapping.fieldKey.toLowerCase().includes("date") ||
                    selectedMapping.dateFormat) && (
                    <div>
                      <label
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#64748b",
                          marginBottom: 4,
                          display: "block",
                        }}
                      >
                        📅 Date Format
                      </label>
                      <select
                        value={selectedMapping.dateFormat || "DD/MM/YYYY"}
                        onChange={(e) =>
                          updateMapping(selectedMapping.id, {
                            dateFormat: e.target.value,
                          })
                        }
                        style={{
                          width: "100%",
                          height: 36,
                          padding: "0 8px",
                          border: "1.5px solid #e2e8f0",
                          borderRadius: 8,
                          fontSize: 13,
                        }}
                      >
                        {DATE_FORMATS.map((df) => (
                          <option key={df.value} value={df.value}>
                            {df.label} → {df.example}
                          </option>
                        ))}
                      </select>
                      <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>
                        Preview: {formatDateValue("15/08/2022", selectedMapping.dateFormat || "DD/MM/YYYY")}
                      </div>
                    </div>
                  )}

                  {/* Position (fine-tune) with numeric inputs */}
                  <div>
                    <label
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#64748b",
                        marginBottom: 4,
                        display: "block",
                      }}
                    >
                      Position & Size (%)
                    </label>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 6,
                      }}
                    >
                      {[
                        { label: "X", key: "x" as const, min: 0, max: 95 },
                        { label: "Y", key: "y" as const, min: 0, max: 95 },
                        { label: "W", key: "width" as const, min: 2, max: 60 },
                        { label: "H", key: "height" as const, min: 2, max: 50 },
                      ].map(({ label: lbl, key, min, max }) => (
                        <div key={key}>
                          <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                            <span style={{ fontSize: 10, color: "#94a3b8", flex: 1 }}>
                              {lbl}:
                            </span>
                            <input
                              type="number"
                              min={min}
                              max={max}
                              step={0.5}
                              value={Number(selectedMapping[key]).toFixed(1)}
                              onChange={(e) =>
                                updateMapping(selectedMapping.id, {
                                  [key]: Math.max(min, Math.min(max, Number(e.target.value))),
                                })
                              }
                              style={{
                                width: 52,
                                padding: "2px 4px",
                                border: "1px solid #e2e8f0",
                                borderRadius: 4,
                                fontSize: 11,
                                textAlign: "right",
                              }}
                            />
                          </div>
                          <input
                            type="range"
                            min={min}
                            max={max}
                            step={0.5}
                            value={selectedMapping[key]}
                            onChange={(e) =>
                              updateMapping(selectedMapping.id, {
                                [key]: Number(e.target.value),
                              })
                            }
                            style={{ width: "100%", accentColor: "#3b82f6" }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Actions: Duplicate & Delete */}
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <button
                      onClick={() => {
                        const dup: FieldMapping = {
                          ...selectedMapping,
                          id: `field-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                          fieldKey: `${selectedMapping.fieldKey}_copy`,
                          label: `${selectedMapping.label} (Copy)`,
                          y: Math.min(95, selectedMapping.y + 5),
                        }
                        setMappings(prev => [...prev, dup])
                        setSelectedId(dup.id)
                      }}
                      style={{
                        flex: 1,
                        padding: "7px 10px",
                        borderRadius: 6,
                        border: "1.5px solid #e2e8f0",
                        background: "white",
                        color: "#334155",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      📋 Duplicate
                    </button>
                    <button
                      onClick={() => removeFieldMapping(selectedMapping.id)}
                      style={{
                        flex: 1,
                        padding: "7px 10px",
                        borderRadius: 6,
                        border: "1.5px solid #fecaca",
                        background: "#fef2f2",
                        color: "#dc2626",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      🗑 Delete
                    </button>
                  </div>
                </div>
              )}

              {selectedMapping.type === "photo" && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <label
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#64748b",
                      marginBottom: 4,
                      display: "block",
                    }}
                  >
                    📷 Photo Properties
                  </label>

                  {/* Photo action buttons */}
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => openDialogWithSnapshot(() => setShowPhotoSizeDialog(true))}
                      style={{
                        flex: 1, padding: "6px 10px", borderRadius: 6,
                        border: "1.5px solid #3b82f6", background: "#eff6ff",
                        color: "#2563eb", fontSize: 12, fontWeight: 700, cursor: "pointer",
                        fontFamily: "Tahoma, Arial, sans-serif",
                      }}
                    >
                      📐 Photo Size...
                    </button>
                    <button
                      onClick={() => openDialogWithSnapshot(() => setShowPhotoBorderDialog(true))}
                      style={{
                        flex: 1, padding: "6px 10px", borderRadius: 6,
                        border: "1.5px solid #e2e8f0", background: "white",
                        color: "#334155", fontSize: 12, fontWeight: 700, cursor: "pointer",
                      }}
                    >
                      ◻ Border & Corner...
                    </button>
                  </div>

                  {/* Photo Shape Presets */}
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", marginBottom: 4, display: "block" }}>
                      Shape Preset
                    </label>
                    <div style={{ display: "flex", gap: 4 }}>
                      {[
                        { label: "□ Square", radius: 0 },
                        { label: "▢ Rounded", radius: 8 },
                        { label: "⬭ Pill", radius: 16 },
                        { label: "○ Circle", radius: 999 },
                      ].map((shape) => (
                        <button
                          key={shape.label}
                          onClick={() =>
                            updateMapping(selectedMapping.id, {
                              photoBorderRadius: shape.radius,
                            })
                          }
                          style={{
                            flex: 1,
                            padding: "5px 4px",
                            borderRadius: 6,
                            border: `1.5px solid ${
                              (selectedMapping.photoBorderRadius || 0) === shape.radius
                                ? "#3b82f6"
                                : "#e2e8f0"
                            }`,
                            background:
                              (selectedMapping.photoBorderRadius || 0) === shape.radius
                                ? "#eff6ff"
                                : "white",
                            color:
                              (selectedMapping.photoBorderRadius || 0) === shape.radius
                                ? "#2563eb"
                                : "#64748b",
                            fontSize: 10,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          {shape.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Border Radius (custom) */}
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", marginBottom: 4, display: "block" }}>
                      Corner Radius: {selectedMapping.photoBorderRadius || 0}px
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={selectedMapping.photoBorderRadius || 0}
                      onChange={(e) =>
                        updateMapping(selectedMapping.id, {
                          photoBorderRadius: Number(e.target.value),
                        })
                      }
                      style={{ width: "100%", accentColor: "#3b82f6" }}
                    />
                  </div>

                  {/* Border Width */}
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", marginBottom: 4, display: "block" }}>
                      Border Width: {selectedMapping.photoBorderWidth || 0}px
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      step="0.5"
                      value={selectedMapping.photoBorderWidth || 0}
                      onChange={(e) =>
                        updateMapping(selectedMapping.id, {
                          photoBorderWidth: Number(e.target.value),
                        })
                      }
                      style={{ width: "100%", accentColor: "#3b82f6" }}
                    />
                  </div>

                  {/* Border Color */}
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", marginBottom: 4, display: "block" }}>
                      Border Color
                    </label>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input
                        type="color"
                        value={selectedMapping.photoBorderColor || "#000000"}
                        onChange={(e) =>
                          updateMapping(selectedMapping.id, {
                            photoBorderColor: e.target.value,
                          })
                        }
                        style={{
                          width: 32,
                          height: 32,
                          border: "2px solid #e2e8f0",
                          borderRadius: 6,
                          cursor: "pointer",
                          padding: 0,
                        }}
                      />
                      <div style={{ display: "flex", gap: 4, flex: 1, alignItems: "center" }}>
                        {["#000000", "#ffffff", "#1e3a5f", "#8b0000", "#2e7d32", "#c0c0c0"].map((c) => {
                          const isSel = (selectedMapping.photoBorderColor || "").toLowerCase() === c.toLowerCase()
                          const lum = parseInt(c.slice(1, 3), 16) * 0.299 + parseInt(c.slice(3, 5), 16) * 0.587 + parseInt(c.slice(5, 7), 16) * 0.114
                          const checkColor = lum > 140 ? "#000" : "#fff"
                          return (
                            <button
                              key={c}
                              onClick={() => updateMapping(selectedMapping.id, { photoBorderColor: c })}
                              aria-label={`Border color ${c}`}
                              aria-pressed={isSel}
                              style={{
                                width: 24,
                                height: 24,
                                borderRadius: 6,
                                background: c,
                                padding: 0,
                                border: isSel ? "2px solid #3b82f6" : "1.5px solid #d1d5db",
                                boxShadow: isSel ? "0 0 0 3px rgba(59,130,246,0.35)" : "none",
                                transform: isSel ? "scale(1.12)" : "scale(1)",
                                transition: "transform .15s ease, box-shadow .15s ease",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                position: "relative",
                                zIndex: isSel ? 2 : 1,
                              }}
                            >
                              {isSel && <span style={{ color: checkColor, fontSize: 13, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Position & Size */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 6,
                    }}
                  >
                    <div>
                      <span style={{ fontSize: 10, color: "#94a3b8" }}>
                        X: {(selectedMapping.x ?? 0).toFixed(1)}%
                      </span>
                      <input
                        type="range"
                        min="0"
                        max="80"
                        step="0.5"
                        value={selectedMapping.x ?? 0}
                        onChange={(e) =>
                          updateMapping(selectedMapping.id, {
                            x: Number(e.target.value),
                          })
                        }
                        style={{ width: "100%", accentColor: "#3b82f6" }}
                      />
                    </div>
                    <div>
                      <span style={{ fontSize: 10, color: "#94a3b8" }}>
                        Y: {(selectedMapping.y ?? 0).toFixed(1)}%
                      </span>
                      <input
                        type="range"
                        min="0"
                        max="80"
                        step="0.5"
                        value={selectedMapping.y ?? 0}
                        onChange={(e) =>
                          updateMapping(selectedMapping.id, {
                            y: Number(e.target.value),
                          })
                        }
                        style={{ width: "100%", accentColor: "#3b82f6" }}
                      />
                    </div>
                    <div>
                      <span style={{ fontSize: 10, color: "#94a3b8" }}>
                        W: {(selectedMapping.width ?? 0).toFixed(1)}%
                      </span>
                      <input
                        type="range"
                        min="5"
                        max="50"
                        step="0.5"
                        value={selectedMapping.width ?? 0}
                        onChange={(e) =>
                          updateMapping(selectedMapping.id, {
                            width: Number(e.target.value),
                          })
                        }
                        style={{ width: "100%", accentColor: "#3b82f6" }}
                      />
                    </div>
                    <div>
                      <span style={{ fontSize: 10, color: "#94a3b8" }}>
                        H: {(selectedMapping.height ?? 0).toFixed(1)}%
                      </span>
                      <input
                        type="range"
                        min="5"
                        max="60"
                        step="0.5"
                        value={selectedMapping.height ?? 0}
                        onChange={(e) =>
                          updateMapping(selectedMapping.id, {
                            height: Number(e.target.value),
                          })
                        }
                        style={{ width: "100%", accentColor: "#3b82f6" }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          {/* Quick Add Common Fields */}
          <div
            style={{
              background: "white",
              borderRadius: 14,
              border: "1px solid #e2e8f0",
              padding: 16,
            }}
          >
            <h4
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#0f172a",
                marginBottom: 12,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span style={{ fontSize: 16 }}>⚡</span> Quick Add
            </h4>

            {/* Photo button */}
            {!mappings.find((m) => m.type === "photo") && (
              <button
                onClick={() => addFieldMapping("photo", "Student Photo", "photo")}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1.5px dashed #3b82f6",
                  borderRadius: 8,
                  background: "#eff6ff",
                  color: "#2563eb",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  marginBottom: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                📷 Add Photo Placeholder
              </button>
            )}

            {/* Class - Division button (single combined placeholder) */}
            {!mappings.find((m) => isClassDivisionFieldKey(m.fieldKey)) && (
              <button
                onClick={() => addFieldMapping("class", "Class - Division")}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1.5px dashed #eab308",
                  borderRadius: 8,
                  background: "#fefce8",
                  color: "#a16207",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  marginBottom: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                📚 Add Class - Division Placeholder
              </button>
            )}

            {/* Flag button */}
            {!mappings.find((m) => m.type === "flag") && (
              <button
                onClick={() => addFieldMapping("flag", "House Flag", "flag")}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1.5px dashed #f59e0b",
                  borderRadius: 8,
                  background: "#fffbeb",
                  color: "#d97706",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  marginBottom: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                🏴 Add Flag Placeholder
              </button>
            )}

            {/* Common fields - quick add buttons */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {[
                { key: "name", label: "Student Name" },
                { key: "branch", label: "Branch" },
                { key: "rollNo", label: "Roll No. / NO" },
                { key: "father", label: "Father's Mobile No." },
                { key: "mother", label: "Mother's Mobile No." },
                { key: "fatherName", label: "Father's Name" },
                { key: "motherName", label: "Mother's Name" },
                { key: "mob_father", label: "Father's Mobile No." },
                { key: "phone", label: "Phone" },
                { key: "address", label: "Address" },
                { key: "addressWithLabel", label: "Address:", prefix: true },
                { key: "addWithLabel", label: "Add:", prefix: true },
                { key: "dateOfBirth", label: "Date of Birth" },
                { key: "bloodGroup", label: "Blood Group" },
                { key: "admissionNo", label: "Admission No." },
                { key: "photoId", label: "Photo ID" },
                { key: "serialNumber", label: "Serial Number" },
              ]
                .filter((f) => !mappings.find((m) => m.fieldKey === f.key))
                .map((f) => (
                  <button
                    key={f.key}
                    onClick={() => addFieldMapping(f.key, f.label)}
                    title={f.prefix ? `${f.label} will be added before the student address` : undefined}
                    style={{
                      padding: "6px 12px",
                      border: f.prefix ? "1px solid #fecaca" : "1px solid #e2e8f0",
                      borderRadius: 6,
                      background: f.prefix ? "#fff1f2" : "white",
                      color: f.prefix ? "#b91c1c" : "#334155",
                      fontSize: 12,
                      fontWeight: f.prefix ? 700 : 400,
                      cursor: "pointer",
                      transition: "all 0.15s",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = f.prefix ? "#ffe4e6" : "#f8fafc"
                      e.currentTarget.style.borderColor = f.prefix ? "#f87171" : "#3b82f6"
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = f.prefix ? "#fff1f2" : "white"
                      e.currentTarget.style.borderColor = f.prefix ? "#fecaca" : "#e2e8f0"
                    }}
                  >
                    <span style={{ color: f.prefix ? "#dc2626" : "#3b82f6" }}>+</span> {f.label}
                  </button>
                ))}
            </div>
          </div>

          {/* Custom Field Creator */}
          <div
            style={{
              background: "white",
              borderRadius: 14,
              border: "1px solid #e2e8f0",
              padding: 16,
            }}
          >
            <h4
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#0f172a",
                marginBottom: 12,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span style={{ fontSize: 16 }}>✏️</span> Add Custom Field
            </h4>
            <p style={{ fontSize: 11, color: "#94a3b8", marginBottom: 10 }}>
              Type the exact label as printed on your ID card template
            </p>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                type="text"
                value={newFieldLabel}
                onChange={(e) => setNewFieldLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCustomField()}
                placeholder="e.g. Father, Adhar No."
                style={{
                  flex: 1,
                  height: 36,
                  padding: "0 10px",
                  border: "1.5px solid #e2e8f0",
                  borderRadius: 8,
                  fontSize: 13,
                }}
              />
              <button
                onClick={addCustomField}
                disabled={!newFieldLabel.trim()}
                style={{
                  height: 36,
                  padding: "0 14px",
                  borderRadius: 8,
                  border: "none",
                  background: newFieldLabel.trim() ? "#3b82f6" : "#e2e8f0",
                  color: newFieldLabel.trim() ? "white" : "#94a3b8",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: newFieldLabel.trim() ? "pointer" : "default",
                  whiteSpace: "nowrap",
                }}
              >
                + Add
              </button>
            </div>
          </div>

          {/* Placed Fields */}
          <div
            style={{
              background: "white",
              borderRadius: 14,
              border: "1px solid #e2e8f0",
              padding: 16,
            }}
          >
            <h4
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#0f172a",
                marginBottom: 12,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span style={{ fontSize: 16 }}>📋</span> Layers ({mappings.length})
              <span style={{ fontSize: 9, color: "#94a3b8", fontWeight: 400, marginLeft: "auto" }}>
                top → bottom
              </span>
            </h4>

            {/* Photo Background Color Picker */}
            <div
              style={{
                background: "#faf5ff",
                borderRadius: 12,
                border: "1px solid #e9d5ff",
                padding: 14,
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#7c3aed",
                  marginBottom: 10,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span style={{ fontSize: 14 }}>🎨</span> Student Photo Background
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "#8b5cf6",
                  marginBottom: 10,
                  lineHeight: 1.5,
                }}
              >
                AI will auto-replace the photo background with this color during student submission.
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {BG_COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => setPhotoBgColor(preset.hex)}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: preset.hex,
                      border: photoBgColor === preset.hex
                        ? "3px solid #7c3aed"
                        : "2px solid #d1d5db",
                      cursor: "pointer",
                      boxShadow: photoBgColor === preset.hex
                        ? "0 0 0 3px rgba(124,58,237,0.35)"
                        : "none",
                      transition: "all 0.2s ease",
                      transform: photoBgColor === preset.hex ? "scale(1.12)" : "scale(1)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    title={preset.label}
                  >
                    {photoBgColor === preset.hex && (
                      <span style={{ fontSize: 16, color: preset.textColor, fontWeight: 800 }}>✓</span>
                    )}
                  </button>
                ))}
                {/* Native color picker for custom colors */}
                <div style={{ position: "relative" }}>
                  <input
                    type="color"
                    value={photoBgColor}
                    onChange={(e) => setPhotoBgColor(e.target.value)}
                    style={{
                      width: 36, height: 36, border: "2px solid #d1d5db",
                      borderRadius: 8, cursor: "pointer", padding: 2,
                    }}
                    title="Pick custom color"
                  />
                </div>
              </div>
              <div style={{ fontSize: 11, color: "#7c3aed", marginTop: 6, fontWeight: 600 }}>
                {BG_COLOR_PRESETS.find((p) => p.hex === photoBgColor)?.label || photoBgColor} selected
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {[...mappings].reverse().map((m, revIdx) => {
                const layerIdx = mappings.length - revIdx
                return (
                <div
                  key={m.id}
                  onClick={() => setSelectedId(m.id)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: `1.5px solid ${
                      m.id === selectedId ? "#3b82f6" : "#e2e8f0"
                    }`,
                    background:
                      m.id === selectedId ? "#eff6ff" : "white",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    transition: "all 0.15s",
                  }}
                >
                  {/* Layer index badge */}
                  <span style={{
                    width: 20, height: 20, borderRadius: 4,
                    background: m.id === selectedId ? "#3b82f6" : "#f1f5f9",
                    color: m.id === selectedId ? "white" : "#94a3b8",
                    fontSize: 9, fontWeight: 700, fontFamily: "monospace",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    {layerIdx}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: "#334155",
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {m.type === "photo" ? "📷 " : "Aa "}
                    {m.label}
                  </span>
                  <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        updateMapping(m.id, { locked: !m.locked })
                      }}
                      title={m.locked ? "Unlock" : "Lock"}
                      style={{
                        width: 20, height: 20, borderRadius: 3,
                        border: "none", background: m.locked ? "#fef3c7" : "transparent",
                        color: m.locked ? "#d97706" : "#94a3b8", cursor: "pointer", fontSize: 10,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >{m.locked ? "🔒" : "🔓"}</button>
                    <button
                      onClick={(e) => { e.stopPropagation(); duplicateField(m.id) }}
                      title="Duplicate"
                      style={{
                        width: 20, height: 20, borderRadius: 3,
                        border: "none", background: "transparent",
                        color: "#94a3b8", cursor: "pointer", fontSize: 10,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >📋</button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        removeFieldMapping(m.id)
                      }}
                      style={{
                        width: 20, height: 20, borderRadius: 3,
                        border: "none", background: "#fef2f2",
                        color: "#ef4444", cursor: "pointer", fontSize: 10,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >✕</button>
                  </div>
                </div>
              )})}
              {mappings.length === 0 && (
                <div
                  style={{
                    textAlign: "center",
                    padding: 16,
                    color: "#94a3b8",
                    fontSize: 12,
                  }}
                >
                  No fields placed yet.
                  <br />
                  Use Quick Add or Create Custom Field above.
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ── ID Size Dialog ── */}
      {showIdSizeDialog && (
        <IdSizeDialog
          initial={{ preset: cardSizePreset, width: cardWidth, height: cardHeight, orientation: cardOrientation === "landscape" ? "horizontal" : "vertical", sides: printSides === "both" ? "both" : "one" }}
          onOk={(cfg: IdSizeConfig) => {
            if (!cardSizeLocked) {
              const orient = cfg.orientation === "horizontal" ? "landscape" : "portrait" as const
              setCardWidth(cfg.width)
              setCardHeight(cfg.height)
              setCardWidthStr(String(cfg.width))
              setCardHeightStr(String(cfg.height))
              setCardOrientation(orient)
              setPrintSides(cfg.sides === "both" ? "both" : "front")
              setCardSizePreset(cfg.preset)
              autoSaveCardSize(cfg.width, cfg.height, orient)
            }
            setShowIdSizeDialog(false)
          }}
          onLoadTemplate={(cfg: IdSizeConfig) => {
            if (!cardSizeLocked) {
              const orient = cfg.orientation === "horizontal" ? "landscape" : "portrait" as const
              setCardWidth(cfg.width)
              setCardHeight(cfg.height)
              setCardWidthStr(String(cfg.width))
              setCardHeightStr(String(cfg.height))
              setCardOrientation(orient)
              setPrintSides(cfg.sides === "both" ? "both" : "front")
              setCardSizePreset(cfg.preset)
              autoSaveCardSize(cfg.width, cfg.height, orient)
            }
            setShowIdSizeDialog(false)
          }}
          onClose={() => setShowIdSizeDialog(false)}
        />
      )}

      {/* ── Font Dialog ── */}
      {showFontDialog && selectedMapping && selectedMapping.type === "text" && (
        <FontDialog
          initial={{
            fontFamily: selectedMapping.fontFamily || "Arial",
            fontStyle: selectedMapping.fontStyle === "italic" ? (selectedMapping.fontWeight === "bold" ? "Bold Italic" : "Italic") : (selectedMapping.fontWeight === "bold" ? (/(narrow|condensed|century gothic)/i.test(selectedMapping.fontFamily || "") ? "Narrow Bold" : "Bold") : "Regular"),
            fontSize: selectedMapping.fontSize,
            strikeout: selectedMapping.textDecoration === "line-through",
            underline: selectedMapping.textDecoration === "underline",
          }}
          onChange={(cfg: FontConfig) => {
            const isNarrowBold = cfg.fontStyle.toLowerCase().includes("narrow")
            const nextFontFamily = isNarrowBold && !/(narrow|condensed|century gothic)/i.test(cfg.fontFamily) ? "Arial Narrow" : cfg.fontFamily
            updateMapping(selectedMapping.id, {
              fontFamily: nextFontFamily,
              fontWeight: cfg.fontStyle.toLowerCase().includes("bold") ? "bold" : "normal",
              fontStyle: cfg.fontStyle.toLowerCase().includes("italic") ? "italic" : "normal",
              fontSize: cfg.fontSize,
              textDecoration: cfg.strikeout ? "line-through" : cfg.underline ? "underline" : "none",
            })
          }}
          onOk={() => { clearDialogSnapshot(); setShowFontDialog(false) }}
          onCancel={() => { revertDialogSnapshot(); setShowFontDialog(false) }}
        />
      )}

      {/* ── Color Dialog ── */}
      {showColorDialog && selectedMapping && selectedMapping.type === "text" && (
        <ColorPickerDialog
          initialColor={selectedMapping.fontColor || "#000000"}
          onChange={(color: string) => updateMapping(selectedMapping.id, { fontColor: color })}
          onOk={() => { clearDialogSnapshot(); setShowColorDialog(false) }}
          onCancel={() => { revertDialogSnapshot(); setShowColorDialog(false) }}
        />
      )}

      {/* ── Wrap Text Dialog ── */}
      {showWrapDialog && selectedMapping && selectedMapping.type === "text" && (
        <WrapTextDialog
          initial={{
            wrap: (selectedMapping.textWrap || "nowrap") !== "nowrap",
            mode: (selectedMapping.textWrap as any) || "nowrap",
            rowsPerField: 2,
          }}
          onSave={(cfg: WrapTextConfig) => {
            // Prefer the explicit `mode` field; fall back to the legacy boolean.
            const next = cfg.mode || (cfg.wrap ? "wrap" : "nowrap")
            updateMapping(selectedMapping.id, { textWrap: next })
          }}
          onClose={() => setShowWrapDialog(false)}
        />
      )}

      {/* ── Photo Size Dialog ── */}
      {showPhotoSizeDialog && selectedMapping && selectedMapping.type === "photo" && (
        <PhotoSizeDialog
          initial={{ keepAspect: true, width: selectedMapping.width, height: selectedMapping.height }}
          onChange={(cfg: PhotoSizeConfig) => updateMapping(selectedMapping.id, { width: cfg.width, height: cfg.height })}
          onOk={() => { clearDialogSnapshot(); setShowPhotoSizeDialog(false) }}
          onCancel={() => { revertDialogSnapshot(); setShowPhotoSizeDialog(false) }}
        />
      )}

      {/* ── Photo Border & Rounded Corner Dialog ── */}
      {showPhotoBorderDialog && selectedMapping && selectedMapping.type === "photo" && (
        <PhotoBorderDialog
          initial={{
            borderWidth: selectedMapping.photoBorderWidth || 0,
            borderColor: selectedMapping.photoBorderColor || "#000000",
            borderRadius: selectedMapping.photoBorderRadius || 0,
          }}
          onChange={(cfg: PhotoBorderConfig) => {
            updateMapping(selectedMapping.id, {
              photoBorderWidth: cfg.borderWidth,
              photoBorderColor: cfg.borderColor,
              photoBorderRadius: cfg.borderRadius,
            })
          }}
          onOk={() => { clearDialogSnapshot(); setShowPhotoBorderDialog(false) }}
          onCancel={() => { revertDialogSnapshot(); setShowPhotoBorderDialog(false) }}
        />
      )}

      {/* ── Right-Click Context Menu ── */}
      {contextMenu && (() => {
        const field = mappings.find(m => m.id === contextMenu.fieldId)
        if (!field) return null
        return (
          <FieldContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            fieldType={field.type === "photo" ? "photo" : "text"}
            onAction={(action) => {
              if (action === "font" || action === "textProperties") openDialogWithSnapshot(() => setShowFontDialog(true))
              else if (action === "color" || action === "backgroundProperties") openDialogWithSnapshot(() => setShowColorDialog(true))
              else if (action === "wrapBitmapReduceFontSize") openDialogWithSnapshot(() => setShowWrapDialog(true))
              else if (action === "imageProperties" || action === "setPhotoSize") openDialogWithSnapshot(() => setShowPhotoSizeDialog(true))
              else if (action === "photoBorderRoundedCorner") openDialogWithSnapshot(() => setShowPhotoBorderDialog(true))
              else if (action === "gridView") setShowGrid((v) => !v)
            }}
            onClose={() => setContextMenu(null)}
          />
        )
      })()}
    </div>
  )
}
