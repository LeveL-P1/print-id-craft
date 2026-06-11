import { describe, it, expect } from "vitest"
import {
  PhotoFileNameAllocator,
  getStudentFullName,
  safePhotoBaseName,
} from "@/lib/export/student-export"
import { buildStudentExportEntry } from "@/lib/export/build-student-export-entry"

describe("PhotoFileNameAllocator", () => {
  it("uses student name only for photo files", () => {
    const allocator = new PhotoFileNameAllocator()
    const name = allocator.assign("Rahul Kumar", "VILLOO-0244", "stu-1", "students/s1/stu-1.jpg")
    expect(name).toBe("Rahul Kumar.jpg")
  })

  it("avoids overwriting when two students share a name", () => {
    const allocator = new PhotoFileNameAllocator()
    const first = allocator.assign("Rahul Kumar", "VILLOO-0244", "stu-1", "a.jpg")
    const second = allocator.assign("Rahul Kumar", "VILLOO-0340", "stu-2", "b.jpg")
    expect(first).toBe("Rahul Kumar.jpg")
    expect(second).toBe("Rahul Kumar (2).jpg")
  })

  it("falls back to serial number when name is missing", () => {
    const allocator = new PhotoFileNameAllocator()
    const name = allocator.assign("", "VILLOO-0244", "stu-1", "a.jpg")
    expect(name).toBe("VILLOO-0244.jpg")
  })
})

describe("buildStudentExportEntry", () => {
  it("links excel row photo path to the assigned photo filename", () => {
    const allocator = new PhotoFileNameAllocator()
    const entry = buildStudentExportEntry(
      {
        id: "stu-1",
        serialNumber: "VILLOO-0244",
        status: "APPROVED",
        formData: { fullName: "Rahul Kumar" },
        class: { name: "Class 5" },
        photoPath: "students/s1/stu-1.jpg",
        photoUrl: "https://example.com/photo.jpg",
        submittedAt: new Date("2026-01-15"),
      },
      "Villoo School",
      allocator
    )

    expect(getStudentFullName(entry.exportRecord.formData)).toBe("Rahul Kumar")
    expect(entry.photoFile).toBe("Rahul Kumar.jpg")
    expect(entry.row[11]).toBe("photos/Rahul Kumar.jpg")
    expect(entry.mapping.fullName).toBe("Rahul Kumar")
    expect(entry.mapping.photoFile).toBe("Rahul Kumar.jpg")
  })
})

describe("safePhotoBaseName", () => {
  it("keeps spaces and removes invalid path characters", () => {
    expect(safePhotoBaseName('Rahul/Kumar:Test')).toBe("RahulKumarTest")
    expect(safePhotoBaseName("  Priya Sharma  ")).toBe("Priya Sharma")
  })
})
