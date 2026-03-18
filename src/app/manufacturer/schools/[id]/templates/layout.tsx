import { ReactNode } from "react"
import Link from "next/link"

export default function TemplateLayout({ children, params }: { children: ReactNode, params: { id: string } }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0f172a' }}>
      <header style={{ 
        height: 60, 
        borderBottom: '1px solid rgba(255,255,255,0.1)', 
        display: 'flex', 
        alignItems: 'center', 
        padding: '0 24px', 
        gap: 16,
        background: '#1e293b' 
      }}>
        <Link href={`/manufacturer/schools/${params.id}`} passHref>
          <button style={{ 
            background: 'transparent', 
            border: 'none', 
            color: '#cbd5e1', 
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 14,
            fontWeight: 600
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m15 18-6-6 6-6"/></svg>
            Back to School
          </button>
        </Link>
        <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)' }} />
        <h1 style={{ fontSize: 16, fontWeight: 700, color: 'white', margin: 0 }}>ID Card Template Studio</h1>
      </header>
      <main style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {children}
      </main>
    </div>
  )
}
