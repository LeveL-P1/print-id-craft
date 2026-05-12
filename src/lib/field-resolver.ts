/**
 * Field resolution utilities for ID card data mapping.
 * Maps student form data keys to their canonical field names using
 * normalization and fuzzy group matching.
 */

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
export function resolveFieldValue(fd: Record<string, string>, fieldKey: string): string {
  // 1. Direct exact match (skip empty/whitespace-only values)
  const directVal = fd[fieldKey]
  if (directVal != null && String(directVal).trim()) return String(directVal).trim()

  // 2. Build normalized lookup
  const fdNormalized: Record<string, string> = {}
  for (const [k, v] of Object.entries(fd)) {
    if (v && String(v).trim()) fdNormalized[normalizeKey(k)] = String(v).trim()
  }

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
