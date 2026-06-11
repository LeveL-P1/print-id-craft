import {
  computeDuplicateFingerprint,
  normalizeFormValue,
  resolveFieldValue,
} from "@/lib/field-resolver"

export type StudentIndexData = {
  duplicateFingerprint: string | null
  fullName: string
  normalizedName: string
  normalizedFatherName: string
  normalizedDob: string
  normalizedRollNo: string
  normalizedSearchText: string
}

function compactSearchParts(parts: string[]) {
  return Array.from(new Set(parts.map(normalizeFormValue).filter(Boolean))).join(" ")
}

export function buildStudentIndexData(
  formData: Record<string, unknown>,
  classId: string
): StudentIndexData {
  const fd = Object.fromEntries(
    Object.entries(formData || {}).map(([key, value]) => [key, String(value ?? "").trim()])
  ) as Record<string, string>

  const fullName = resolveFieldValue(fd, "name")
  const fatherName = resolveFieldValue(fd, "father")
  const dob = resolveFieldValue(fd, "dateofbirth")
  const rollNo = resolveFieldValue(fd, "rollno")
  const phone = resolveFieldValue(fd, "mobile")
  const admissionNo = resolveFieldValue(fd, "admissionno")

  const normalizedName = normalizeFormValue(fullName)
  const normalizedFatherName = normalizeFormValue(fatherName)
  const normalizedDob = normalizeFormValue(dob)
  const normalizedRollNo = normalizeFormValue(rollNo)

  return {
    duplicateFingerprint: computeDuplicateFingerprint(fd, classId) || null,
    fullName,
    normalizedName,
    normalizedFatherName,
    normalizedDob,
    normalizedRollNo,
    normalizedSearchText: compactSearchParts([
      fullName,
      fatherName,
      dob,
      rollNo,
      phone,
      admissionNo,
      ...Object.values(fd).map(String),
    ]),
  }
}
