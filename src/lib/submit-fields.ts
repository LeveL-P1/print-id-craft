/**
 * Shared helpers for the public submission endpoints. Centralises:
 *   1. Form-field derivation — the public form must show the EXACT
 *      column names that the admin table already shows for that
 *      school (e.g. "GR NO", "MOBILE", "Name") so submissions land
 *      in the same columns and the table doesn't grow new ones.
 *   2. Auto-assignment of system-managed keys (`NO`, `PHOTO NO.`)
 *      so parents never have to type them.
 *
 * The same helpers are used by both /api/submit/[token]/* (per-class
 * link) and /api/submit/school/[token]/* (school-wide link).
 */

import { prisma } from "@/lib/prisma"
import {
  normalizeFormValue,
  resolveFieldValue,
} from "@/lib/field-resolver"
import { buildStudentIndexData } from "@/lib/student-index"

export type FormField = {
  key: string
  label: string
  type: string
  required: boolean
  /** Semantic role for validation/sorting — set by manufacturer template or inferred */
  role?: string
}

/** Keys that are auto-managed by the server and must never be asked
 *  from the parent. Compared after `normalizeKey` so case / spacing /
 *  punctuation differences don't slip through. */
const AUTO_KEYS_NORM = new Set<string>([
  "class",
  "classsection",
  "photourl",
  "qrcodeurl",
  "srno",          // sr.no.
  "no",            // common alias of sr.no. used as a column header
  "photoid",
  "photono",
  "photonum",
  "photonumber",
])

export const normalizeKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")

/** Detects keys that should render as a phone-input. */
const isPhoneKey = (k: string) => {
  const n = normalizeKey(k)
  return n === "mobile" || n === "phone" || n.includes("mob") || n.includes("phone")
}

/**
 * Build the public form's field list from a school's existing student
 * data. Uses actual keys from the database (most frequent first) so
 * labels match the admin table exactly. Skips auto-managed keys.
 *
 * `fallbackFromTemplate` is used only for brand-new schools that have
 * no student data yet — in that case we fall back to the template's
 * fieldConfig so the form still works.
 */
export async function buildFormFields(
  schoolId: string,
  fallbackFromTemplate: FormField[]
): Promise<FormField[]> {
  if (fallbackFromTemplate.length > 0) {
    return fallbackFromTemplate.filter(f => !AUTO_KEYS_NORM.has(normalizeKey(f.key)))
  }

  // Pull a bounded sample of existing students. 500 is plenty to learn
  // the column vocabulary without scanning huge tables.
  const existing = await prisma.student.findMany({
    where: { schoolId },
    select: { formData: true },
    take: 500,
    orderBy: { submittedAt: "desc" },
  })

  if (existing.length === 0) {
    // No data yet — fall back to template's fieldConfig but still drop
    // auto-managed keys so the parent never sees them.
    return fallbackFromTemplate.filter(f => !AUTO_KEYS_NORM.has(normalizeKey(f.key)))
  }

  // Frequency map of every key seen in existing data.
  const freq: Record<string, number> = {}
  for (const s of existing) {
    const fd = (s.formData as Record<string, unknown> | null) || {}
    for (const k of Object.keys(fd)) {
      const v = fd[k]
      if (v != null && String(v).trim() !== "") {
        freq[k] = (freq[k] || 0) + 1
      }
    }
  }

  // Keep keys present in at least 30% of records — drops one-off junk
  // (e.g. a single student with a typoed key) but keeps every column
  // that the admin actually uses.
  const minFreq = Math.max(2, Math.floor(existing.length * 0.3))
  const dataKeys = Object.entries(freq)
    .filter(([_, n]) => n >= minFreq)
    .filter(([k]) => !AUTO_KEYS_NORM.has(normalizeKey(k)))
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k)

  return dataKeys.map(k => ({
    key: k,
    label: k, // Use the actual data key as the form label — matches
              // the admin table column header verbatim.
    type: isPhoneKey(k) ? "tel" : "text",
    required: true,
  }))
}

/**
 * Compute auto-assigned values for system-managed keys (`NO`,
 * `PHOTO NO.`) for a new submission. Picks a sequential per-school
 * number based on the maximum already in use, so the new student
 * slots into the same numbering scheme as Excel-imported rows.
 *
 * Returns a partial formData object that the caller should merge
 * INTO the parent's submission (auto-fields override anything the
 * parent might have sent for these keys).
 */
export async function computeAutoAssignedFields(
  schoolId: string
): Promise<Record<string, string>> {
  // Find what variants of NO / PHOTO NO. the school actually uses,
  // so we write to the same key the admin already sees.
  const sample = await prisma.student.findMany({
    where: { schoolId },
    select: { formData: true },
    take: 200,
    orderBy: { submittedAt: "desc" },
  })

  const noKeys = new Set<string>()      // sr.no.
  const photoNoKeys = new Set<string>() // photo no.
  const noValues: number[] = []
  const photoNoValues: number[] = []

  for (const s of sample) {
    const fd = (s.formData as Record<string, unknown> | null) || {}
    for (const k of Object.keys(fd)) {
      const n = normalizeKey(k)
      const raw = fd[k]
      if (n === "no" || n === "srno") {
        noKeys.add(k)
        const num = parseInt(String(raw ?? "").replace(/[^0-9]/g, ""), 10)
        if (Number.isFinite(num)) noValues.push(num)
      } else if (n === "photono" || n === "photoid" || n === "photonumber" || n === "photonum") {
        photoNoKeys.add(k)
        const num = parseInt(String(raw ?? "").replace(/[^0-9]/g, ""), 10)
        if (Number.isFinite(num)) photoNoValues.push(num)
      }
    }
  }

  const out: Record<string, string> = {}

  // ── NO (sr.no.) ──
  if (noKeys.size > 0) {
    const nextNo = (noValues.length > 0 ? Math.max(...noValues) : 0) + 1
    for (const k of Array.from(noKeys)) out[k] = String(nextNo)
  }

  // ── PHOTO NO. ──
  // Existing data uses values like "IMG_2811". We preserve the prefix
  // by inspecting the most recent value's leading non-digit run; if
  // none exists we just write a plain number.
  if (photoNoKeys.size > 0) {
    let prefix = ""
    const photoNoKeysArr = Array.from(photoNoKeys)
    for (const s of sample) {
      const fd = (s.formData as Record<string, unknown> | null) || {}
      for (const k of photoNoKeysArr) {
        const v = String(fd[k] ?? "")
        const m = v.match(/^([^0-9]*)([0-9]+)$/)
        if (m) { prefix = m[1]; break }
      }
      if (prefix) break
    }
    const nextNum = (photoNoValues.length > 0 ? Math.max(...photoNoValues) : 0) + 1
    const padded = prefix ? String(nextNum).padStart(4, "0") : String(nextNum)
    for (const k of photoNoKeysArr) out[k] = `${prefix}${padded}`
  }

  return out
}

export type DuplicateCheckResult =
  | { isDuplicate: false }
  | {
      isDuplicate: true
      kind: "roll" | "identity"
      error: "DUPLICATE_ROLL" | "DUPLICATE_NAME"
      message: string
      existing: {
        serialNumber: string
        submittedAt: Date
        studentName: string
      }
    }

export type SubmissionStatusResult =
  | { submitted: false }
  | {
      submitted: true
      serialNumber: string
      submittedAt: string
      studentName: string
    }

export function extractIdentityFields(formData: Record<string, string>) {
  return {
    name: resolveFieldValue(formData, "name"),
    father: resolveFieldValue(formData, "father"),
    dob: resolveFieldValue(formData, "dateofbirth"),
    roll: resolveFieldValue(formData, "rollno"),
  }
}

function identityMatches(
  fd: Record<string, string>,
  name: string,
  father: string,
  dob: string,
  requireDob: boolean
): boolean {
  const n = normalizeFormValue(resolveFieldValue(fd, "name"))
  const f = normalizeFormValue(resolveFieldValue(fd, "father"))
  const d = normalizeFormValue(resolveFieldValue(fd, "dateofbirth"))
  if (!n || n !== normalizeFormValue(name)) return false
  if (!f || f !== normalizeFormValue(father)) return false
  if (requireDob && dob) return !!d && d === normalizeFormValue(dob)
  return true
}

function toDuplicateResult(
  kind: "roll" | "identity",
  error: "DUPLICATE_ROLL" | "DUPLICATE_NAME",
  message: string,
  existing: { serialNumber: string; submittedAt: Date; formData: unknown },
  fallbackName: string
): DuplicateCheckResult {
  const fd = (existing.formData as Record<string, string>) || {}
  return {
    isDuplicate: true,
    kind,
    error,
    message,
    existing: {
      serialNumber: existing.serialNumber,
      submittedAt: existing.submittedAt,
      studentName: resolveFieldValue(fd, "name") || fallbackName,
    },
  }
}

export async function checkDuplicateSubmission(
  classId: string,
  formData: Record<string, string>
): Promise<DuplicateCheckResult> {
  const { name, father, dob, roll } = extractIdentityFields(formData)
  const indexData = buildStudentIndexData(formData, classId)
  const fingerprint = indexData.duplicateFingerprint

  if (fingerprint) {
    const byFingerprint = await prisma.student.findFirst({
      where: {
        classId,
        duplicateFingerprint: fingerprint,
        status: { not: "FLAGGED" },
      },
      select: { serialNumber: true, submittedAt: true, formData: true },
    })
    if (byFingerprint) {
      return toDuplicateResult(
        "identity",
        "DUPLICATE_NAME",
        "This student is already registered in this class. Contact the school for changes.",
        byFingerprint,
        name
      )
    }
  }

  if (indexData.normalizedRollNo) {
    const byRoll = await prisma.student.findFirst({
      where: {
        classId,
        normalizedRollNo: indexData.normalizedRollNo,
        status: { not: "FLAGGED" },
      },
      select: { serialNumber: true, submittedAt: true, formData: true },
    })
    if (byRoll) {
      return toDuplicateResult(
        "roll",
        "DUPLICATE_ROLL",
        "This roll number is already registered in this class.",
        byRoll,
        name
      )
    }
  }

  if (indexData.normalizedName && indexData.normalizedFatherName) {
    const byIdentity = await prisma.student.findFirst({
      where: {
        classId,
        normalizedName: indexData.normalizedName,
        normalizedFatherName: indexData.normalizedFatherName,
        ...(indexData.normalizedDob ? { normalizedDob: indexData.normalizedDob } : {}),
        status: { not: "FLAGGED" },
      },
      select: { serialNumber: true, submittedAt: true, formData: true },
    })
    if (byIdentity) {
      return toDuplicateResult(
        "identity",
        "DUPLICATE_NAME",
        "This student is already registered in this class. Contact the school for changes.",
        byIdentity,
        name
      )
    }
  }

  if (roll || (name && father)) {
    const normRoll = normalizeFormValue(roll)
    const requireDob = !!dob
    const existingStudents = await prisma.student.findMany({
      where: { classId, status: { not: "FLAGGED" } },
      select: { formData: true, serialNumber: true, submittedAt: true },
    })

    for (const s of existingStudents) {
      const fd = (s.formData as Record<string, string>) || {}

      if (normRoll) {
        const existingRoll = normalizeFormValue(resolveFieldValue(fd, "rollno"))
        if (existingRoll && existingRoll === normRoll) {
          return toDuplicateResult(
            "roll",
            "DUPLICATE_ROLL",
            "This roll number is already registered in this class.",
            s,
            name
          )
        }
      }

      if (name && father && identityMatches(fd, name, father, dob, requireDob)) {
        return toDuplicateResult(
          "identity",
          "DUPLICATE_NAME",
          "This student is already registered in this class. Contact the school for changes.",
          s,
          name
        )
      }
    }
  }

  return { isDuplicate: false }
}

export async function checkSubmissionStatus(
  classId: string,
  formData: Record<string, string>
): Promise<SubmissionStatusResult> {
  const dup = await checkDuplicateSubmission(classId, formData)
  if (!dup.isDuplicate) return { submitted: false }
  return {
    submitted: true,
    serialNumber: dup.existing.serialNumber,
    submittedAt: dup.existing.submittedAt.toISOString(),
    studentName: dup.existing.studentName,
  }
}
