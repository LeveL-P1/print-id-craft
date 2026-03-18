"use client"
import { TemplateElement } from "./Designer"

export default function Sidebar({ side, setSide, config, setConfig, selectedId, updateElement, addElement, fields, handleSave, saving, deleteSelected }: any) {
  const selectedEl = config.elements.find((el: TemplateElement) => el.id === selectedId)

  return (
    <div style={{ width: 340, background: '#1e293b', borderRight: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', color: '#f8fafc' }}>
      
      {/* Side Toggle */}
      <div style={{ display: 'flex', padding: 16, gap: 4, background: '#0f172a' }}>
        <button 
          style={{ flex: 1, padding: '8px 0', border: '1px solid #334155', borderRadius: 6, background: side === "FRONT" ? '#3b82f6' : 'transparent', color: side === "FRONT" ? 'white' : '#94a3b8', fontWeight: 600, cursor: 'pointer' }}
          onClick={() => setSide("FRONT")}
        >
          FRONT
        </button>
        <button 
          style={{ flex: 1, padding: '8px 0', border: '1px solid #334155', borderRadius: 6, background: side === "BACK" ? '#3b82f6' : 'transparent', color: side === "BACK" ? 'white' : '#94a3b8', fontWeight: 600, cursor: 'pointer' }}
          onClick={() => setSide("BACK")}
        >
          BACK
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {/* Properties Panel (if selected) */}
        {selectedEl ? (
          <div style={{ background: 'rgba(255,255,255,0.03)', padding: 16, borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Element Properties</h3>
              <button 
                onClick={deleteSelected}
                style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}
                title="Delete Element"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
              </button>
            </div>

            {selectedEl.type === "TEXT" && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Content (Text / Variable)</label>
                <input 
                  value={selectedEl.content} 
                  onChange={e => updateElement(selectedId, { content: e.target.value })} 
                  style={{ width: '100%', padding: '8px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: 6, color: 'white', fontSize: 13 }}
                />
              </div>
            )}
            
            {selectedEl.type === "TEXT" && (
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Color</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input type="color" value={selectedEl.fill} onChange={e => updateElement(selectedId, { fill: e.target.value })} style={{ width: 32, height: 32, padding: 0, background: 'transparent', border: 'none', cursor: 'pointer' }} />
                    <input value={selectedEl.fill} onChange={e => updateElement(selectedId, { fill: e.target.value })} style={{ flex: 1, padding: '4px 8px', background: '#0f172a', border: '1px solid #334155', borderRadius: 4, color: 'white', fontSize: 13 }} />
                  </div>
                </div>
                <div style={{ width: 80 }}>
                   <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Font Size</label>
                   <input type="number" value={selectedEl.fontSize} onChange={e => updateElement(selectedId, { fontSize: Number(e.target.value) })} style={{ width: '100%', padding: '8px', background: '#0f172a', border: '1px solid #334155', borderRadius: 6, color: 'white', fontSize: 13 }} />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 12 }}>
               <div style={{ flex: 1 }}>
                 <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>X Pos</label>
                 <input type="number" value={Math.round(selectedEl.x)} onChange={e => updateElement(selectedId, { x: Number(e.target.value) })} style={{ width: '100%', padding: '8px', background: '#0f172a', border: '1px solid #334155', borderRadius: 6, color: 'white', fontSize: 13 }} />
               </div>
               <div style={{ flex: 1 }}>
                 <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Y Pos</label>
                 <input type="number" value={Math.round(selectedEl.y)} onChange={e => updateElement(selectedId, { y: Number(e.target.value) })} style={{ width: '100%', padding: '8px', background: '#0f172a', border: '1px solid #334155', borderRadius: 6, color: 'white', fontSize: 13 }} />
               </div>
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: 24, padding: 16, background: 'rgba(59,130,246,0.1)', border: '1px dashed rgba(59,130,246,0.3)', borderRadius: 12, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
            Select an element on the canvas to edit its properties.
          </div>
        )}

        {/* Global Settings */}
        <h3 style={{ margin: '0 0 12px 0', fontSize: 13, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Canvas Settings</h3>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <span style={{ fontSize: 14 }}>Background Color</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="color" value={config.background} onChange={e => setConfig({ ...config, background: e.target.value })} style={{ width: 28, height: 28, padding: 0, background: 'transparent', border: 'none', cursor: 'pointer' }} />
          </div>
        </div>

        {/* Toolbox */}
        <h3 style={{ margin: '0 0 12px 0', fontSize: 13, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Add Static Elements</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 24 }}>
          <button onClick={() => addElement("TEXT")} style={{ padding: '10px 0', background: '#0f172a', border: '1px solid #334155', borderRadius: 8, color: 'white', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/></svg>
            <span style={{ fontSize: 12 }}>Text</span>
          </button>
          <button onClick={() => addElement("IMAGE")} style={{ padding: '10px 0', background: '#0f172a', border: '1px solid #334155', borderRadius: 8, color: 'white', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
             <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
            <span style={{ fontSize: 12 }}>Image Placeholder</span>
          </button>
        </div>

        {/* Variables mapping Database */}
        <h3 style={{ margin: '0 0 12px 0', fontSize: 13, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Add Dynamic Variables</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button onClick={() => addElement("TEXT", true, "studentName")} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#0f172a', border: '1px solid #334155', borderRadius: 8, color: '#e2e8f0', cursor: 'pointer', textAlign: 'left', fontSize: 13 }}>
            <span style={{ color: '#3b82f6', fontFamily: 'monospace', fontWeight: 'bold' }}>{"{}"}</span> Built-in: Student Name
          </button>
          <button onClick={() => addElement("TEXT", true, "serialNumber")} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#0f172a', border: '1px solid #334155', borderRadius: 8, color: '#e2e8f0', cursor: 'pointer', textAlign: 'left', fontSize: 13 }}>
            <span style={{ color: '#3b82f6', fontFamily: 'monospace', fontWeight: 'bold' }}>{"{}"}</span> Built-in: ID Number
          </button>
          <button onClick={() => addElement("QR")} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#0f172a', border: '1px solid #334155', borderRadius: 8, color: '#e2e8f0', cursor: 'pointer', textAlign: 'left', fontSize: 13 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round"><rect x="2" y="2" width="8" height="8" rx="1" /><rect x="14" y="2" width="8" height="8" rx="1" /><rect x="2" y="14" width="8" height="8" rx="1" /><rect x="14" y="14" width="4" height="4" rx="0.5" /></svg>
             Built-in: Verification QR
          </button>

          {fields?.length > 0 && <div style={{ height: 1, background: '#334155', margin: '4px 0' }} />}
          
          {fields?.map((f: any) => (
            <button key={f.id} onClick={() => addElement(f.fieldType === 'PHOTO' || f.fieldType === 'SIGNATURE' ? "IMAGE" : "TEXT", true, f.fieldName)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#0f172a', border: '1px dashed #334155', borderRadius: 8, color: '#cbd5e1', cursor: 'pointer', textAlign: 'left', fontSize: 13 }}>
              {f.fieldType === 'PHOTO' || f.fieldType === 'SIGNATURE' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
              ) : (
                <span style={{ color: '#94a3b8', fontFamily: 'monospace', fontWeight: 'bold' }}>{"{}"}</span>
              )}
              Custom: {f.fieldName}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: 16, borderTop: '1px solid rgba(255,255,255,0.1)', background: '#0f172a' }}>
        <button 
          onClick={handleSave} 
          disabled={saving}
          style={{ width: '100%', height: 44, background: '#3b82f6', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
        >
          {saving ? 'Saving...' : 'Save Template'}
        </button>
      </div>
    </div>
  )
}
