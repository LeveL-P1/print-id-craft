"use client"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

type Student = {
  id: string
  serialNumber: string
  photoUrl: string | null
  formData: any
  status: string
  classGroup: { name: string, school: { name: string, id: string } }
}

export default function ManufacturerDashboardBatching() {
  const router = useRouter()
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null)

  const fetchStudents = async () => {
    try {
      const res = await fetch("/api/manufacturer/students?status=APPROVED")
      const json = await res.json()
      if (json.success) setStudents(json.data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchStudents() }, [])

  const toggleSelect = (id: string, schoolId: string) => {
    if (selectedIds.size === 0) {
      setSelectedSchoolId(schoolId)
    } else if (schoolId !== selectedSchoolId) {
      alert("Please batch students from the same school only.")
      return
    }

    const newSet = new Set(selectedIds)
    if (newSet.has(id)) {
      newSet.delete(id)
      if (newSet.size === 0) setSelectedSchoolId(null)
    } else {
      newSet.add(id)
    }
    setSelectedIds(newSet)
  }

  const handleCreateBatch = async () => {
    if (selectedIds.size === 0 || !selectedSchoolId) return
    const res = await fetch("/api/manufacturer/batches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
         schoolId: selectedSchoolId,
         studentIds: Array.from(selectedIds)
      })
    })
    const json = await res.json()
    if (json.success) {
      alert("Batch created successfully")
      setSelectedIds(new Set())
      setSelectedSchoolId(null)
      fetchStudents()
      // You can redirect to batch view later
      // router.push("/manufacturer/batches")
    } else {
      alert("Failed creating batch")
    }
  }

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Print Batches Engine</h1>
          <p>Group approved students into printable batches</p>
        </div>
        <button 
          className="btn btn-primary" 
          onClick={handleCreateBatch} 
          disabled={selectedIds.size === 0}
          style={{ opacity: selectedIds.size === 0 ? 0.5 : 1 }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          Generate Batch ({selectedIds.size})
        </button>
      </div>
      <div className="page-body">
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}><input type="checkbox" disabled /></th>
                <th>School</th>
                <th>Class</th>
                <th>ID Number</th>
                <th>Extracted Name</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
               {students.map(s => (
                 <tr key={s.id} onClick={() => toggleSelect(s.id, s.classGroup.school.id)} style={{ cursor: 'pointer', background: selectedIds.has(s.id) ? 'rgba(59,130,246,0.05)' : 'white' }}>
                   <td>
                     <input 
                       type="checkbox" 
                       checked={selectedIds.has(s.id)} 
                       readOnly 
                       style={{ pointerEvents: 'none', cursor: 'pointer', width: 16, height: 16, accentColor: '#3b82f6' }}
                     />
                   </td>
                   <td style={{ fontWeight: 600 }}>{s.classGroup.school.name}</td>
                   <td>{s.classGroup.name}</td>
                   <td style={{ fontFamily: 'monospace' }}>{s.serialNumber}</td>
                   <td>{s.formData?.['Student Name'] || s.formData?.['Name'] || s.formData?.['studentName'] || '-'}</td>
                   <td><span className="status-badge status-approved">Approved</span></td>
                 </tr>
               ))}
               {students.length === 0 && !loading && (
                 <tr>
                   <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                      No approved students awaiting print pooling.
                   </td>
                 </tr>
               )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
