import { getFieldRole } from "@/lib/field-resolver"
import { applyFixedBranchToFormData } from "@/lib/fixed-branch"

export type FormField = {
  key: string
  label: string
  type: string
  required: boolean
  role?: string
}

const ADDRESS_MIN_WORDS = 5

export function stripIndianPrefix(raw: string): string {
  if (!raw) return ""
  const explicit = raw.match(/^\+?\s*91[\s-]*(\d{0,10})\s*$/)
  if (explicit) return explicit[1]
  const digits = raw.replace(/\D/g, "")
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2)
  return digits.slice(0, 10)
}

function wordCount(value: string): number {
  return (value || "").trim().split(/\s+/).filter(Boolean).length
}

export function isHiddenFixedBranchField(
  field: FormField,
  fixedBranch?: string
): boolean {
  if (!fixedBranch?.trim()) return false
  return getFieldRole(field.key, field.label, field.role) === "branch"
}

export function validatePublicSubmissionDetails(
  formData: Record<string, unknown>,
  fields: FormField[],
  options?: { fixedBranch?: string }
): { ok: true } | { ok: false; error: string } {
  const fixedBranch = options?.fixedBranch?.trim() || ""
  const fd = applyFixedBranchToFormData(formData, fixedBranch, fields)

  for (const field of fields) {
    if (field.key === "class") continue
    if (isHiddenFixedBranchField(field, fixedBranch)) continue
    const value = (fd[field.key] || "").trim()
    const label = field.label || field.key
    const role = getFieldRole(field.key, field.label, field.role)

    if (field.required && !value) {
      return { ok: false, error: `Please fill in ${label}.` }
    }
    if (!value) continue

    if (role === "address" && field.required && wordCount(value) < ADDRESS_MIN_WORDS) {
      return { ok: false, error: `Please write the full address with at least ${ADDRESS_MIN_WORDS} words.` }
    }
    if (role === "mobile" && field.required && stripIndianPrefix(value).length !== 10) {
      return { ok: false, error: "Mobile number must be exactly 10 digits." }
    }
    if (role === "branch" && field.required && value.length < 2) {
      return { ok: false, error: "Please enter the branch name." }
    }
  }

  return { ok: true }
}
