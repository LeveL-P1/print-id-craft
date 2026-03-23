"use client"
import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import IDCardPreview from "@/components/IDCardPreview"

type FieldConfig = { key: string; label: string; type: string; required: boolean }
type TemplateElement = {
  id: string
  type: "text" | "image" | "qr" | "shape" | "photo" | "logo"
  x: number; y: number; width: number; height: number
  content: string
  fontSize?: number; fontFamily?: string; fill?: string
  align?: string; bold?: boolean; italic?: boolean
}

type TemplateData = {
  frontLayout: TemplateElement[]
  backLayout: TemplateElement[]
  cardWidthMm: number; cardHeightMm: number
  printDpi: number; orientation: "PORTRAIT" | "LANDSCAPE"
  fieldConfig: FieldConfig[]
}

const DEFAULT_FIELDS: FieldConfig[] = [
  { key: "fullName", label: "Full Name", type: "text", required: true },
  { key: "class", label: "Class", type: "text", required: true },
  { key: "rollNo", label: "Roll No.", type: "text", required: true },
  { key: "dob", label: "Date of Birth", type: "date", required: true },
  { key: "bloodGroup", label: "Blood Group", type: "select", required: false },
  { key: "fatherName", label: "Father Name", type: "text", required: true },
  { key: "motherName", label: "Mother Name", type: "text", required: false },
  { key: "phone", label: "Phone", type: "tel", required: true },
  { key: "address", label: "Address", type: "textarea", required: false },
]

export default function TemplatePage() {
  const params = useParams()
  const router = useRouter()
  const schoolId = params.id as string
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [side, setSide] = useState<"front" | "back">("front")
  const [template, setTemplate] = useState<TemplateData>({
    frontLayout: [],
    backLayout: [],
    cardWidthMm: 85.6, cardHeightMm: 54.0,
    printDpi: 300, orientation: "LANDSCAPE",
    fieldConfig: DEFAULT_FIELDS,
  })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [history, setHistory] = useState<TemplateData[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [hasUnsaved, setHasUnsaved] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [bgColor, setBgColor] = useState("#ffffff")

  const currentLayout = side === "front" ? template.frontLayout : template.backLayout
  const selectedElement = currentLayout.find(el => el.id === selectedId)

  // Scale factor for canvas display
  const CANVAS_SCALE = 4 // px per mm
  const canvasW = template.cardWidthMm * CANVAS_SCALE
  const canvasH = template.cardHeightMm * CANVAS_SCALE

  useEffect(() => {
    fetch(`/api/schools/${schoolId}/template`)
      .then(r => r.json())
      .then(data => {
        if (data.success && data.data) {
          setTemplate({
            frontLayout: data.data.frontLayout || [],
            backLayout: data.data.backLayout || [],
            cardWidthMm: data.data.cardWidthMm || 85.6,
            cardHeightMm: data.data.cardHeightMm || 54.0,
            printDpi: data.data.printDpi || 300,
            orientation: data.data.orientation || "LANDSCAPE",
            fieldConfig: data.data.fieldConfig || DEFAULT_FIELDS,
          })
        }
      })
      .finally(() => setLoading(false))
  }, [schoolId])

  const pushHistory = useCallback((newState: TemplateData) => {
    setHistory(prev => [...prev.slice(0, historyIndex + 1), newState].slice(-20))
    setHistoryIndex(prev => Math.min(prev + 1, 19))
  }, [historyIndex])

  const updateLayout = (elements: TemplateElement[]) => {
    const newTemplate = {
      ...template,
      [side === "front" ? "frontLayout" : "backLayout"]: elements,
    }
    setTemplate(newTemplate)
    pushHistory(newTemplate)
    setHasUnsaved(true)
  }

  const addElement = (type: TemplateElement["type"], content: string = "") => {
    const newEl: TemplateElement = {
      id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      x: canvasW / 2 - 50, y: canvasH / 2 - 15,
      width: type === "photo" || type === "logo" || type === "qr" ? 80 : 120,
      height: type === "photo" || type === "logo" || type === "qr" ? 80 : 24,
      content: content || (type === "text" ? "Text" : type === "photo" ? "[Photo]" : type === "logo" ? "[Logo]" : type === "qr" ? "[QR Code]" : ""),
      fontSize: 14, fontFamily: "Arial", fill: "#0f172a",
      align: "center", bold: false, italic: false,
    }
    updateLayout([...currentLayout, newEl])
    setSelectedId(newEl.id)
  }

  const updateElement = (id: string, updates: Partial<TemplateElement>) => {
    updateLayout(currentLayout.map(el => el.id === id ? { ...el, ...updates } : el))
  }

  const deleteElement = () => {
    if (!selectedId) return
    updateLayout(currentLayout.filter(el => el.id !== selectedId))
    setSelectedId(null)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/schools/${schoolId}/template`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(template),
      })
      const data = await res.json()
      if (data.success) {
        toast.success("Template saved!")
      } else {
        toast.error("Failed to save template")
      }
    } catch (err) {
      toast.error("Save error")
    } finally {
      setSaving(false)
      setHasUnsaved(false)
    }
  }

  // Unsaved changes warning
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsaved) {
        e.preventDefault()
        e.returnValue = "You have unsaved changes. Are you sure you want to leave?"
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [hasUnsaved])

  const DUMMY_DATA: Record<string, string> = {
    fullName: "Aarav Sharma",
    class: "Grade 5-A",
    rollNo: "23",
    dob: "2012-05-15",
    bloodGroup: "B+",
    fatherName: "Rajesh Sharma",
    motherName: "Sunita Sharma",
    phone: "9876543210",
    address: "42, MG Road, Mumbai",
    serialNumber: "STXAVI-0023",
  }

  const applyCR80Preset = () => {
    setTemplate(p => ({
      ...p,
      cardWidthMm: 85.6,
      cardHeightMm: 54.0,
      printDpi: 300,
    }))
    setHasUnsaved(true)
    toast.success("CR80 preset applied (85.6mm × 54.0mm)")
  }

  // Keyboard handler
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedId && !(document.activeElement instanceof HTMLInputElement)) {
          e.preventDefault()
          deleteElement()
        }
      }
      if (e.ctrlKey && e.key === "z") {
        e.preventDefault()
        if (historyIndex > 0) {
          setHistoryIndex(prev => prev - 1)
          setTemplate(history[historyIndex - 1])
        }
      }
      if (e.ctrlKey && e.key === "y") {
        e.preventDefault()
        if (historyIndex < history.length - 1) {
          setHistoryIndex(prev => prev + 1)
          setTemplate(history[historyIndex + 1])
        }
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [selectedId, history, historyIndex])

  // Dragging
  const [dragging, setDragging] = useState<{ id: string; startX: number; startY: number; elX: number; elY: number } | null>(null)

  const handleMouseDown = (e: React.MouseEvent, el: TemplateElement) => {
    e.stopPropagation()
    setSelectedId(el.id)
    setDragging({ id: el.id, startX: e.clientX, startY: e.clientY, elX: el.x, elY: el.y })
  }

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging) return
    const dx = e.clientX - dragging.startX
    const dy = e.clientY - dragging.startY
    updateElement(dragging.id, {
      x: Math.max(0, Math.min(canvasW - 20, dragging.elX + dx)),
      y: Math.max(0, Math.min(canvasH - 20, dragging.elY + dy)),
    })
  }, [dragging, canvasW, canvasH])

  const handleMouseUp = useCallback(() => {
    setDragging(null)
  }, [])

  useEffect(() => {
    if (dragging) {
      window.addEventListener("mousemove", handleMouseMove)
      window.addEventListener("mouseup", handleMouseUp)
      return () => {
        window.removeEventListener("mousemove", handleMouseMove)
        window.removeEventListener("mouseup", handleMouseUp)
      }
    }
  }, [dragging, handleMouseMove, handleMouseUp])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80vh' }}>
      <div className="login-spinner" style={{ width: 32, height: 32, borderColor: 'rgba(59,130,246,0.2)', borderTopColor: '#3b82f6' }} />
    </div>
  )

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 0px)', overflow: 'hidden' }}>
      {/* Left Sidebar */}
      <div style={{ width: 280, background: '#0f172a', color: 'white', display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(255,255,255,0.06)', overflow: 'auto' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <button className="btn-ghost" onClick={() => router.back()} style={{ color: '#94a3b8', marginBottom: 8, fontSize: 13 }}>← Back to School</button>
          <h3 style={{ fontSize: 16, fontWeight: 700 }}>Template Studio</h3>
        </div>

        {/* Side Toggle */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: 3 }}>
            <button onClick={() => setSide("front")} style={{ flex: 1, padding: '8px', borderRadius: 6, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', background: side === "front" ? '#3b82f6' : 'transparent', color: side === "front" ? 'white' : '#94a3b8' }}>Front Side</button>
            <button onClick={() => setSide("back")} style={{ flex: 1, padding: '8px', borderRadius: 6, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', background: side === "back" ? '#3b82f6' : 'transparent', color: side === "back" ? 'white' : '#94a3b8' }}>Back Side</button>
          </div>
        </div>

        {/* Card Settings */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>Card Settings</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={{ fontSize: 11, color: '#94a3b8' }}>Width (mm)</label>
              <input type="number" value={template.cardWidthMm} onChange={e => setTemplate(p => ({ ...p, cardWidthMm: parseFloat(e.target.value) || 85.6 }))} style={{ width: '100%', height: 32, padding: '0 8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: 'white', fontSize: 13 }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#94a3b8' }}>Height (mm)</label>
              <input type="number" value={template.cardHeightMm} onChange={e => setTemplate(p => ({ ...p, cardHeightMm: parseFloat(e.target.value) || 54 }))} style={{ width: '100%', height: 32, padding: '0 8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: 'white', fontSize: 13 }} />
            </div>
          </div>
          <div style={{ marginTop: 8 }}>
            <label style={{ fontSize: 11, color: '#94a3b8' }}>DPI</label>
            <select value={template.printDpi} onChange={e => setTemplate(p => ({ ...p, printDpi: parseInt(e.target.value) }))} style={{ width: '100%', height: 32, padding: '0 8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: 'white', fontSize: 13 }}>
              <option value={150}>150 DPI</option>
              <option value={300}>300 DPI</option>
              <option value={600}>600 DPI</option>
            </select>
          </div>
          <div style={{ marginTop: 8 }}>
            <label style={{ fontSize: 11, color: '#94a3b8' }}>Orientation</label>
            <select value={template.orientation} onChange={e => setTemplate(p => ({ ...p, orientation: e.target.value as any }))} style={{ width: '100%', height: 32, padding: '0 8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: 'white', fontSize: 13 }}>
              <option value="LANDSCAPE">Landscape</option>
              <option value="PORTRAIT">Portrait</option>
            </select>
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
            <button onClick={applyCR80Preset} style={{ flex: 1, padding: '8px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 6, color: '#22c55e', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>CR80 Preset</button>
          </div>
          <div style={{ marginTop: 8 }}>
            <label style={{ fontSize: 11, color: '#94a3b8' }}>Background Color</label>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} style={{ width: 32, height: 28, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', padding: 1 }} />
              <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>{bgColor}</span>
            </div>
          </div>
        </div>

        {/* Add Elements */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>Add Elements</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <button onClick={() => addElement("text")} style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#e2e8f0', fontSize: 12, cursor: 'pointer' }}>📝 Text</button>
            <button onClick={() => addElement("photo")} style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#e2e8f0', fontSize: 12, cursor: 'pointer' }}>📷 Photo</button>
            <button onClick={() => addElement("logo")} style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#e2e8f0', fontSize: 12, cursor: 'pointer' }}>🏫 Logo</button>
            <button onClick={() => addElement("qr")} style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#e2e8f0', fontSize: 12, cursor: 'pointer' }}>📱 QR Code</button>
            <button onClick={() => addElement("shape", "——————")} style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#e2e8f0', fontSize: 12, cursor: 'pointer' }}>➖ Line</button>
          </div>
        </div>

        {/* Field Variables */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>Field Variables</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {template.fieldConfig.map(f => (
              <button key={f.key} onClick={() => addElement("text", `{{${f.key}}}`)} style={{ padding: '6px 10px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 6, color: '#60a5fa', fontSize: 12, cursor: 'pointer', textAlign: 'left' }}>
                {`{{${f.label}}}`} {f.required && <span style={{ color: '#ef4444' }}>*</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Selected Element Properties */}
        {selectedElement && (
          <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>Properties</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div>
                <label style={{ fontSize: 11, color: '#94a3b8' }}>Content</label>
                <input value={selectedElement.content} onChange={e => updateElement(selectedElement.id, { content: e.target.value })} style={{ width: '100%', height: 32, padding: '0 8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: 'white', fontSize: 12 }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#94a3b8' }}>Font Size</label>
                  <input type="number" value={selectedElement.fontSize || 14} onChange={e => updateElement(selectedElement.id, { fontSize: parseInt(e.target.value) || 14 })} style={{ width: '100%', height: 28, padding: '0 6px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: 'white', fontSize: 12 }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#94a3b8' }}>Color</label>
                  <input type="color" value={selectedElement.fill || "#000000"} onChange={e => updateElement(selectedElement.id, { fill: e.target.value })} style={{ width: '100%', height: 28, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', padding: 2 }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#94a3b8' }}>Width</label>
                  <input type="number" value={selectedElement.width} onChange={e => updateElement(selectedElement.id, { width: parseInt(e.target.value) || 100 })} style={{ width: '100%', height: 28, padding: '0 6px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: 'white', fontSize: 12 }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#94a3b8' }}>Height</label>
                  <input type="number" value={selectedElement.height} onChange={e => updateElement(selectedElement.id, { height: parseInt(e.target.value) || 24 })} style={{ width: '100%', height: 28, padding: '0 6px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: 'white', fontSize: 12 }} />
                </div>
              </div>
              <button onClick={deleteElement} style={{ padding: '8px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, color: '#ef4444', fontSize: 12, cursor: 'pointer' }}>🗑️ Delete Element</button>
            </div>
          </div>
        )}

        {/* Save + Preview Buttons */}
        <div style={{ padding: '16px', marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={() => setShowPreview(true)} style={{ width: '100%', padding: '10px', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 10, color: '#a78bfa', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            👁 Preview with Dummy Data
          </button>
          <button onClick={handleSave} disabled={saving} style={{ width: '100%', padding: '12px', background: saving ? '#1e40af' : 'linear-gradient(135deg, #3b82f6, #2563eb)', border: 'none', borderRadius: 10, color: 'white', fontSize: 14, fontWeight: 600, cursor: saving ? 'default' : 'pointer' }}>
            {saving ? "Saving..." : "💾 Save Template"}
          </button>
          {hasUnsaved && <div style={{ fontSize: 11, color: '#f59e0b', textAlign: 'center' }}>⚠ Unsaved changes</div>}
        </div>
      </div>

      {/* Canvas Area */}
      <div style={{ flex: 1, background: '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, overflow: 'auto' }} onClick={() => setSelectedId(null)}>
        <div style={{ position: 'relative', width: canvasW, height: canvasH, background: bgColor, borderRadius: 8, boxShadow: '0 25px 50px rgba(0,0,0,0.5)', border: '1px solid #e2e8f0', overflow: 'hidden' }} onClick={e => { e.stopPropagation(); setSelectedId(null) }}>
          {/* Elements */}
          {currentLayout.map(el => (
            <div
              key={el.id}
              onMouseDown={(e) => handleMouseDown(e, el)}
              onClick={e => { e.stopPropagation(); setSelectedId(el.id) }}
              style={{
                position: 'absolute',
                left: el.x, top: el.y,
                width: el.width, height: el.height,
                border: selectedId === el.id ? '2px solid #3b82f6' : '1px dashed rgba(0,0,0,0.15)',
                borderRadius: 4,
                cursor: dragging?.id === el.id ? 'grabbing' : 'grab',
                display: 'flex', alignItems: 'center', justifyContent: el.align === 'left' ? 'flex-start' : el.align === 'right' ? 'flex-end' : 'center',
                padding: 4,
                fontSize: el.fontSize || 14,
                fontFamily: el.fontFamily || 'Arial',
                color: el.fill || '#000',
                fontWeight: el.bold ? 'bold' : 'normal',
                fontStyle: el.italic ? 'italic' : 'normal',
                background: el.type === 'photo' ? '#f1f5f9' : el.type === 'logo' ? '#eff6ff' : el.type === 'qr' ? '#f0fdf4' : 'transparent',
                userSelect: 'none',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                boxSizing: 'border-box',
              }}
            >
              {el.type === 'photo' && <span style={{ fontSize: 24, opacity: 0.5 }}>📷</span>}
              {el.type === 'logo' && <span style={{ fontSize: 20, opacity: 0.5 }}>🏫</span>}
              {el.type === 'qr' && <span style={{ fontSize: 20, opacity: 0.5 }}>📱</span>}
              {(el.type === 'text' || el.type === 'shape') && el.content}
            </div>
          ))}

          {currentLayout.length === 0 && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 14 }}>
              Click elements on the left to add them here
            </div>
          )}
        </div>
      </div>

      {/* PREVIEW MODAL */}
      {showPreview && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }} onClick={() => setShowPreview(false)}>
          <div style={{ background: 'white', borderRadius: 20, maxWidth: 800, width: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.25)', padding: 32 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Template Preview (Dummy Data)</h2>
              <button onClick={() => setShowPreview(false)} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#f1f5f9', cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 8, textAlign: 'center' }}>FRONT</div>
                <IDCardPreview
                  layout={template.frontLayout}
                  widthMm={template.cardWidthMm}
                  heightMm={template.cardHeightMm}
                  formData={DUMMY_DATA}
                  serialNumber="ABCDEF-0023"
                  scale={3.8}
                />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 8, textAlign: 'center' }}>BACK</div>
                <IDCardPreview
                  layout={template.backLayout}
                  widthMm={template.cardWidthMm}
                  heightMm={template.cardHeightMm}
                  formData={DUMMY_DATA}
                  serialNumber="ABCDEF-0023"
                  scale={3.8}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
