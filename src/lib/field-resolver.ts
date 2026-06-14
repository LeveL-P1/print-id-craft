/**
 * Field resolution utilities for ID card data mapping.
 * Maps student form data keys to their canonical field names using
 * normalization and fuzzy group matching.
 */

import { createHash } from "crypto"
import {
  resolveClassDisplayValue,
  resolveDivisionDisplayValue,
} from "@/lib/section-class"

/**
 * Normalizes a field key by lowercasing and stripping non-alphanumeric chars.
 */
export function normalizeKey(k: string): string {
  return k.toLowerCase().replace(/[^a-z0-9]/g, "")
}

/**
 * Known field group aliases — maps canonical keys to their common variants.
 */
export const FIELD_GROUPS: Record<string, string[]> = {
  name: ["fullname", "studentname", "name", "student_name", "full_name", "full name", "student name"],
  father: ["fathername", "father", "fatherphone", "mobfather", "mob_father", "fatherno", "father name", "father mobile"],
  mother: ["mothername", "mother", "motherphone", "motherno", "mother name", "mother mobile"],
  mob_father: ["mobfather", "mob_father", "fatherphone", "father", "fathername", "phone", "mobile no", "contact no", "telephone"],
  phone: ["phone", "mobile", "contact", "fatherphone", "mobfather", "contact no", "mobile no", "mob", "ph", "phno", "phoneno"],
  mobile: ["mobile", "phone", "contact", "fatherphone", "mobfather", "mob_father", "mob", "ph", "phno", "phoneno", "mobile no", "contact no", "telephone", "motherphone"],
  class: ["class", "classsection", "class_section", "standard", "grade"],
  division: ["division", "div", "section"],
  branch: ["branch", "campus", "location"],
  rollno: ["rollno", "roll", "srno", "no", "admissionno", "roll number"],
  address: ["address", "addr", "location"],
  dateofbirth: ["dob", "dateofbirth", "birthdate", "birthday"],
  bloodgroup: ["bloodgroup", "blood group", "bg"],
  admissionno: ["admissionno", "admno", "registrationno", "regno"],
  photoid: ["photoid", "photo_id", "imageid", "imgid", "photono", "photo_no", "photonumber", "img", "imgno", "img_no", "imageno", "image_no"],
  serialnumber: ["serialnumber", "serial", "sr"],
  flagcolor: ["flagcolor", "flag_color", "flag", "house", "housecolor", "house_color", "colour", "color", "team", "group"],
}

/**
 * Reverse-lookup: find which FIELD_GROUPS canonical key a normalized
 * field-key belongs to.
 *
 * This lets custom-built keys like "mobile_no" (→ "mobileno"),
 * "studentmobile", "mobno", "fathermobileno" resolve to the same
 * group ("mobile") even though they aren't a canonical FIELD_GROUPS key.
 */
function findGroupForKey(normKey: string): string | null {
  if (!normKey) return null
  // Direct canonical hit
  if (FIELD_GROUPS[normKey]) return normKey
  // Search every group's aliases for a normalized substring match
  for (const [canonical, aliases] of Object.entries(FIELD_GROUPS)) {
    const nc = normalizeKey(canonical)
    if (normKey.includes(nc) || nc.includes(normKey)) return canonical
    for (const a of aliases) {
      const na = normalizeKey(a)
      if (!na) continue
      if (na === normKey || normKey.includes(na) || na.includes(normKey)) {
        return canonical
      }
    }
  }
  return null
}

/** Semantic roles used for validation, sorting, and duplicate detection. */
export type FieldRole =
  | "name"
  | "father"
  | "mother"
  | "address"
  | "mobile"
  | "rollno"
  | "dob"
  | "branch"
  | "flag"
  | "bloodgroup"
  | "default"

const VALID_ROLES = new Set<string>([
  "name", "father", "mother", "address", "mobile", "rollno",
  "dob", "branch", "flag", "bloodgroup", "default",
])

const GROUP_TO_ROLE: Record<string, FieldRole> = {
  name: "name",
  father: "father",
  mother: "mother",
  dateofbirth: "dob",
  address: "address",
  mobile: "mobile",
  phone: "mobile",
  mob_father: "mobile",
  rollno: "rollno",
  admissionno: "rollno",
  branch: "branch",
  flagcolor: "flag",
  bloodgroup: "bloodgroup",
}

/** Display order for public registration forms (lower = earlier). */
export const FIELD_ROLE_SORT_ORDER: Record<FieldRole, number> = {
  name: 10,
  father: 20,
  mother: 30,
  dob: 40,
  rollno: 50,
  branch: 55,
  address: 60,
  mobile: 70,
  flag: 80,
  bloodgroup: 90,
  default: 100,
}

/**
 * Classify a form field's semantic role from explicit config, key, and label.
 * Works across schools with different column names ("GR NO", "नाव", etc.).
 */
export function getFieldRole(
  key: string,
  label: string = "",
  explicitRole?: string
): FieldRole {
  if (explicitRole && VALID_ROLES.has(explicitRole)) {
    return explicitRole as FieldRole
  }

  const k = (key || "").toLowerCase()
  const l = (label || "").toLowerCase()
  const hay = `${k} ${l}`

  // Phone/mobile fields — check before father/mother name heuristics
  if (
    k === "mob_father" || k === "mother_phone" || k === "fatherphone" ||
    k === "motherphone" || /\b(mobile|phone|contact|whatsapp|tel)\b/.test(hay) ||
    (k.includes("mob") && !k.includes("mother") && !/\bfather\b/.test(l)) ||
    /\b(mother|father)\s*\(no\.?\)/.test(l) ||
    /\bmob\.?-\s*father\b/.test(l) ||
    l.includes("mother's mobile") || l.includes("father's mobile") || l.includes("mothers mobile") || l.includes("fathers mobile")
  ) {
    if (!/\b(father|mother)\s*name\b/.test(hay) && !/\bname\b/.test(l)) {
      return "mobile"
    }
  }

  if (/\b(addr|address)\b/.test(hay)) return "address"
  if (/\b(roll|gr\.?\s*no|gr\b|general\s*register|admission\s*no|adm\.?\s*no)\b/.test(hay)) {
    return "rollno"
  }
  if (/\b(house ?flag|flag ?colou?r|^house$|colou?r ?house|^colour$|^color$)\b/.test(hay)) {
    return "flag"
  }
  if (/\b(blood ?group|bloodgroup)\b/.test(hay)) return "bloodgroup"
  if (/\b(dob|dateofbirth|date of birth|birthdate|birthday)\b/.test(hay)) return "dob"
  if (/\b(branch|campus)\b/.test(hay)) return "branch"

  if ((l.includes("father") || k.includes("father")) && !/\b(mobile|phone|mob|contact)\b/.test(hay)) {
    return "father"
  }
  if ((l.includes("mother") || k.includes("mother")) && !/\b(mobile|phone|mob|contact)\b/.test(hay)) {
    return "mother"
  }
  if (/\b(surname)\b/.test(hay)) return "name"
  if (/\b(name|student)\b/.test(hay) && !l.includes("father") && !l.includes("mother")) {
    return "name"
  }

  const group = findGroupForKey(normalizeKey(key))
  if (group && GROUP_TO_ROLE[group]) return GROUP_TO_ROLE[group]

  return "default"
}

/** Infer role for storage on fieldConfig (undefined when unknown). */
export function inferFieldRole(key: string, label?: string): FieldRole | undefined {
  const role = getFieldRole(key, label || "")
  return role === "default" ? undefined : role
}

export type SortableFormField = {
  key: string
  label: string
  type: string
  required: boolean
  role?: string
}

/** Sort dynamic school fields into a parent-friendly order. */
export function sortFieldsByRole<T extends SortableFormField>(fields: T[]): T[] {
  return [...fields].sort((a, b) => {
    const orderA = FIELD_ROLE_SORT_ORDER[getFieldRole(a.key, a.label, a.role)]
    const orderB = FIELD_ROLE_SORT_ORDER[getFieldRole(b.key, b.label, b.role)]
    if (orderA !== orderB) return orderA - orderB
    return a.label.localeCompare(b.label)
  })
}

/** Normalize a value for duplicate comparison (case/space/punctuation insensitive). */
export function normalizeFormValue(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}

/**
 * Stable fingerprint for duplicate detection: class + name + father + DOB.
 * Returns empty string when name or father is missing.
 */
export function computeDuplicateFingerprint(
  formData: Record<string, string>,
  classId: string
): string {
  const name = normalizeFormValue(resolveFieldValue(formData, "name"))
  const father = normalizeFormValue(resolveFieldValue(formData, "father"))
  const dob = normalizeFormValue(resolveFieldValue(formData, "dateofbirth"))
  if (!name || !father) return ""
  const payload = dob
    ? `${classId}|${name}|${father}|${dob}`
    : `${classId}|${name}|${father}`
  return createHash("sha256").update(payload).digest("hex")
}

/**
 * Resolves a field value from student form data using:
 * 1. Direct key match
 * 2. Normalized key match
 * 3. Field group alias matching (fuzzy, bidirectional reverse-lookup)
 *
 * @param fd       - student form data key-value pairs
 * @param fieldKey - the canonical field key to resolve
 * @returns the resolved value (trimmed string) or empty string
 */
// WeakMap-based cache: normalized lookup is built once per formData object,
// then reused across all resolveFieldValue calls for the same student.
// This avoids O(fields × keys) normalization work during batch rendering
// (2000 students × 10 fields → 20K loops → 2K loops).
const _fdNormCache = new WeakMap<Record<string, string>, Record<string, string>>()

function getNormalizedFd(fd: Record<string, string>): Record<string, string> {
  let cached = _fdNormCache.get(fd)
  if (cached) return cached
  cached = {}
  for (const [k, v] of Object.entries(fd)) {
    if (v && String(v).trim()) cached[normalizeKey(k)] = String(v).trim()
  }
  _fdNormCache.set(fd, cached)
  return cached
}

export function resolveFieldValue(fd: Record<string, string>, fieldKey: string): string {
  // 1. Direct exact match (skip empty/whitespace-only values)
  const directVal = fd[fieldKey]
  if (directVal != null && String(directVal).trim()) return String(directVal).trim()

  // 2. Build normalized lookup (cached per formData object)
  const fdNormalized = getNormalizedFd(fd)

  const normKey = normalizeKey(fieldKey)
  if (fdNormalized[normKey]) return fdNormalized[normKey]

  // 3. Field group alias match — resolve via the group that owns this key
  //    (works for canonical keys AND custom keys like "mobile_no", "mobno").
  const groupKey = findGroupForKey(normKey)
  if (groupKey) {
    const patterns = FIELD_GROUPS[groupKey]
    for (const p of patterns) {
      const simpleP = normalizeKey(p)
      if (fdNormalized[simpleP]) return fdNormalized[simpleP]
      for (const [nk, nv] of Object.entries(fdNormalized)) {
        if (nk === simpleP || nk.includes(simpleP) || simpleP.includes(nk)) return nv
      }
    }
  }

  return ""
}

const PREFIXED_ADDRESS_FIELDS: Record<string, string> = {
  addresswithlabel: "Address:",
  addresslabel: "Address:",
  addressprefix: "Address:",
  prefixedaddress: "Address:",
  addwithlabel: "Add:",
  addlabel: "Add:",
  addprefix: "Add:",
  prefixedadd: "Add:",
}

export function isPrefixedAddressField(fieldKey: string): boolean {
  return Boolean(PREFIXED_ADDRESS_FIELDS[normalizeKey(fieldKey)])
}

/**
 * Resolves the value that should be printed on a card. Most fields return the
 * raw resolved value. Special display-only placeholders can add fixed prefixes
 * while still pulling the underlying student data from the canonical field.
 */
export function resolveDisplayFieldValue(fd: Record<string, string>, fieldKey: string): string {
  const nk = normalizeKey(fieldKey)
  if (nk === "class" || nk === "classsection" || nk === "classdivision") {
    return resolveClassDisplayValue(fd)
  }
  if (nk === "division" || nk === "div") {
    return resolveDivisionDisplayValue(fd)
  }

  const prefix = PREFIXED_ADDRESS_FIELDS[nk]
  if (!prefix) return resolveFieldValue(fd, fieldKey)

  const address = resolveFieldValue(fd, "address")
  return address ? `${prefix} ${address}` : ""
}

/** Class fields auto-shrink to fit; never truncate with ellipsis on ID cards. */
export function getCardTextWrapMode(
  fieldKey: string,
  configured?: string
): "nowrap" | "wrap" | "multiline" {
  const nk = normalizeKey(fieldKey)
  if (nk === "class" || nk === "classsection" || nk === "classdivision" || nk === "division") return "wrap"
  if (configured === "nowrap" || configured === "wrap" || configured === "multiline") {
    return configured
  }
  return "wrap"
}

/**
 * Formats a date string according to the user's chosen format.
 * Parses DD/MM/YYYY, YYYY-MM-DD, and DD-MM-YYYY inputs.
 * Returns the original value if parsing fails.
 */
export function formatDateValue(value: string, format: string): string {
  if (!value || !format) return value
  const datePatterns = [
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, // DD/MM/YYYY or MM/DD/YYYY
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/, // YYYY-MM-DD
    /^(\d{1,2})-(\d{1,2})-(\d{4})$/, // DD-MM-YYYY
  ]
  let day = "", month = "", year = ""
  for (const pattern of datePatterns) {
    const match = value.match(pattern)
    if (match) {
      if (pattern === datePatterns[1]) {
        year = match[1]; month = match[2]; day = match[3]
      } else {
        day = match[1]; month = match[2]; year = match[3]
      }
      break
    }
  }
  if (!day || !month || !year) return value
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"]
  const monthShort = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
  const mIdx = parseInt(month, 10) - 1
  switch (format) {
    case "DD/MM/YYYY": return `${day.padStart(2,"0")}/${month.padStart(2,"0")}/${year}`
    case "MM/DD/YYYY": return `${month.padStart(2,"0")}/${day.padStart(2,"0")}/${year}`
    case "YYYY-MM-DD": return `${year}-${month.padStart(2,"0")}-${day.padStart(2,"0")}`
    case "DD-MM-YYYY": return `${day.padStart(2,"0")}-${month.padStart(2,"0")}-${year}`
    case "DD.MM.YYYY": return `${day.padStart(2,"0")}.${month.padStart(2,"0")}.${year}`
    case "DD MMM YYYY": return `${day.padStart(2,"0")} ${monthShort[mIdx] || month} ${year}`
    case "MMMM DD, YYYY": return `${months[mIdx] || month} ${day}, ${year}`
    default: return value
  }
}
