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
  phone: ["phone", "mobile", "contact", "fatherphone", "mobfather", "contact no", "mobile no"],
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
 * Resolves a field value from student form data using:
 * 1. Direct key match
 * 2. Normalized key match
 * 3. Field group alias matching (fuzzy)
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

  // 3. Field group alias match
  const patterns = FIELD_GROUPS[normKey]
  if (patterns) {
    for (const p of patterns) {
      if (fdNormalized[p]) return fdNormalized[p]
      const simpleP = normalizeKey(p)
      for (const [nk, nv] of Object.entries(fdNormalized)) {
        if (nk.includes(simpleP) || simpleP.includes(nk)) return nv
      }
    }
  }

  return ""
}
