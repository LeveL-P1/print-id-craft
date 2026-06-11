import { describe, it, expect } from "vitest"
import {
  normalizeKey,
  resolveDisplayFieldValue,
  resolveFieldValue,
  FIELD_GROUPS,
  getFieldRole,
  computeDuplicateFingerprint,
  normalizeFormValue,
  sortFieldsByRole,
  isPrefixedAddressField,
} from "@/lib/field-resolver"
import { extractIdentityFields } from "@/lib/submit-fields"

/* ══════════════════════════════════════════════════════════════
 * normalizeKey — key normalization
 * ═════════════════════════════════════════════════════════════ */
describe("normalizeKey", () => {
  it("lowercases uppercase characters", () => {
    expect(normalizeKey("FullName")).toBe("fullname")
  })

  it("strips spaces", () => {
    expect(normalizeKey("full name")).toBe("fullname")
  })

  it("strips underscores", () => {
    expect(normalizeKey("student_name")).toBe("studentname")
  })

  it("strips hyphens", () => {
    expect(normalizeKey("roll-number")).toBe("rollnumber")
  })

  it("strips special characters", () => {
    expect(normalizeKey("Father's Phone #")).toBe("fathersphone")
  })

  it("handles empty string", () => {
    expect(normalizeKey("")).toBe("")
  })

  it("preserves digits", () => {
    expect(normalizeKey("Class10A")).toBe("class10a")
  })
})

/* ══════════════════════════════════════════════════════════════
 * FIELD_GROUPS — constants validation
 * ═════════════════════════════════════════════════════════════ */
describe("FIELD_GROUPS", () => {
  it("has a 'name' group with common name variants", () => {
    expect(FIELD_GROUPS.name).toEqual(
      expect.arrayContaining(["fullname", "studentname", "name"])
    )
  })

  it("has a 'father' group", () => {
    expect(FIELD_GROUPS.father).toBeDefined()
    expect(FIELD_GROUPS.father.length).toBeGreaterThan(0)
  })

  it("has a 'class' group with common class variants", () => {
    expect(FIELD_GROUPS.class).toEqual(
      expect.arrayContaining(["class", "standard", "grade"])
    )
  })

  it("has a 'dateofbirth' group with dob alias", () => {
    expect(FIELD_GROUPS.dateofbirth).toEqual(
      expect.arrayContaining(["dob", "dateofbirth"])
    )
  })

  it("has a 'bloodgroup' group", () => {
    expect(FIELD_GROUPS.bloodgroup).toEqual(
      expect.arrayContaining(["bloodgroup", "bg"])
    )
  })
})

/* ══════════════════════════════════════════════════════════════
 * resolveFieldValue — 3-tier resolution
 * ═════════════════════════════════════════════════════════════ */
describe("resolveFieldValue", () => {
  describe("Tier 1: Direct key match", () => {
    it("resolves exact key match", () => {
      const fd = { name: "Rahul", class: "10A" }
      expect(resolveFieldValue(fd, "name")).toBe("Rahul")
    })

    it("resolves exact key with case-sensitive match", () => {
      const fd = { FullName: "Priya", class: "5B" }
      expect(resolveFieldValue(fd, "FullName")).toBe("Priya")
    })

    it("skips empty string values", () => {
      const fd = { name: "", FullName: "Amit" }
      // "name" key exists but is empty → should fall through
      expect(resolveFieldValue(fd, "name")).toBe("Amit")
    })

    it("skips whitespace-only values", () => {
      const fd = { name: "   ", FullName: "Sita" }
      expect(resolveFieldValue(fd, "name")).toBe("Sita")
    })
  })

  describe("Tier 2: Normalized key match", () => {
    it("matches 'Father Name' when looking for 'fathername'", () => {
      const fd = { "Father Name": "Mr. Sharma" }
      expect(resolveFieldValue(fd, "fathername")).toBe("Mr. Sharma")
    })

    it("matches 'student_name' when looking for 'studentname'", () => {
      const fd = { student_name: "Neha" }
      expect(resolveFieldValue(fd, "studentname")).toBe("Neha")
    })

    it("matches case-insensitively", () => {
      const fd = { BLOODGROUP: "O+" }
      expect(resolveFieldValue(fd, "bloodgroup")).toBe("O+")
    })
  })

  describe("Tier 3: Field group alias matching", () => {
    it("resolves 'name' from 'fullname' alias", () => {
      const fd = { fullname: "Arjun Kumar" }
      expect(resolveFieldValue(fd, "name")).toBe("Arjun Kumar")
    })

    it("resolves 'class' from 'standard' alias", () => {
      const fd = { standard: "8th" }
      expect(resolveFieldValue(fd, "class")).toBe("8th")
    })

    it("resolves 'class' from 'grade' alias", () => {
      const fd = { grade: "12" }
      expect(resolveFieldValue(fd, "class")).toBe("12")
    })

    it("resolves 'dateofbirth' from 'dob' alias", () => {
      const fd = { dob: "2010-05-15" }
      expect(resolveFieldValue(fd, "dateofbirth")).toBe("2010-05-15")
    })

    it("resolves 'bloodgroup' from 'bg' alias", () => {
      const fd = { bg: "A+" }
      expect(resolveFieldValue(fd, "bloodgroup")).toBe("A+")
    })

    it("resolves 'rollno' from 'roll number' alias", () => {
      const fd = { "roll number": "42" }
      expect(resolveFieldValue(fd, "rollno")).toBe("42")
    })

    it("resolves 'admissionno' from 'regno' alias", () => {
      const fd = { regno: "ADM001" }
      expect(resolveFieldValue(fd, "admissionno")).toBe("ADM001")
    })
  })

  describe("No match", () => {
    it("returns empty string when no match found", () => {
      const fd = { unrelated_field: "value" }
      expect(resolveFieldValue(fd, "bloodgroup")).toBe("")
    })

    it("returns empty string for empty form data", () => {
      expect(resolveFieldValue({}, "name")).toBe("")
    })

    it("returns empty string for unknown field key", () => {
      const fd = { name: "Test" }
      expect(resolveFieldValue(fd, "zzz_nonexistent_xyz")).toBe("")
    })
  })

  describe("Custom mobile/phone-style keys (regression)", () => {
    // Bug: students imported from Excel store phone numbers under the
    // canonical key "phone", but admins often add a custom template field
    // labelled "Mobile" / "Mobile No." / "Mob No.", which produces
    // fieldKeys like "mobile_no" or "mobno" that aren't direct
    // FIELD_GROUPS keys. The resolver must still find the phone value.
    it("resolves 'mobile' from 'phone' fd key", () => {
      expect(resolveFieldValue({ phone: "9823203293" }, "mobile")).toBe("9823203293")
    })
    it("resolves 'mobile_no' (custom field) from 'phone' fd key", () => {
      expect(resolveFieldValue({ phone: "9823203293" }, "mobile_no")).toBe("9823203293")
    })
    it("resolves 'mobileno' (custom field) from 'phone' fd key", () => {
      expect(resolveFieldValue({ phone: "9823203293" }, "mobileno")).toBe("9823203293")
    })
    it("resolves 'Mobile No.' label-style key from 'phone' fd key", () => {
      // Label "Mobile No." → fieldKey "mobile_no" → normalized "mobileno"
      expect(resolveFieldValue({ phone: "9999999999" }, "mobile_no")).toBe("9999999999")
    })
    it("resolves 'contact_no' (custom field) from 'phone' fd key", () => {
      expect(resolveFieldValue({ phone: "8888888888" }, "contact_no")).toBe("8888888888")
    })
  })

  describe("Prefixed address placeholders", () => {
    it("prints an Address prefix while resolving the canonical address", () => {
      expect(resolveDisplayFieldValue(
        { address: "Flat 503, Pune" },
        "addressWithLabel"
      )).toBe("Address: Flat 503, Pune")
    })

    it("prints an ADD prefix while resolving imported Address columns", () => {
      expect(resolveDisplayFieldValue(
        { Address: "Sai Shilp Society" },
        "addWithLabel"
      )).toBe("ADD: Sai Shilp Society")
    })

    it("keeps raw address resolution unprefixed", () => {
      expect(resolveDisplayFieldValue(
        { address: "Flat 503, Pune" },
        "address"
      )).toBe("Flat 503, Pune")
    })

    it("identifies prefixed address field keys", () => {
      expect(isPrefixedAddressField("Address:")).toBe(false)
      expect(isPrefixedAddressField("addressWithLabel")).toBe(true)
      expect(isPrefixedAddressField("add_prefix")).toBe(true)
    })
  })

  describe("getFieldRole", () => {
    it("maps address label to address role", () => {
      expect(getFieldRole("Address", "Full Address")).toBe("address")
    })

    it("detects GR NO as rollno", () => {
      expect(getFieldRole("GR NO", "GR NO")).toBe("rollno")
    })

    it("detects mob_father as mobile", () => {
      expect(getFieldRole("mob_father", "Father Mobile")).toBe("mobile")
    })

    it("detects parent (no.) fields as mobile", () => {
      expect(getFieldRole("mother", "Mother (No.)")).toBe("mobile")
      expect(getFieldRole("father", "Father (No.)")).toBe("mobile")
      expect(getFieldRole("mob_father", "Mob.- Father")).toBe("mobile")
      expect(getFieldRole("mother_mobile", "Mother's Mobile No.")).toBe("mobile")
    })

    it("uses explicit role from template", () => {
      expect(getFieldRole("custom_key", "Custom", "address")).toBe("address")
    })
  })

  describe("computeDuplicateFingerprint", () => {
    it("is deterministic", () => {
      const fd = { name: "Test", father: "Parent" }
      expect(computeDuplicateFingerprint(fd, "cls1")).toBe(
        computeDuplicateFingerprint(fd, "cls1")
      )
    })

    it("differs across classes", () => {
      const fd = { name: "Amit", father: "Ravi", dob: "2014-01-01" }
      expect(computeDuplicateFingerprint(fd, "class-1")).not.toBe(
        computeDuplicateFingerprint(fd, "class-2")
      )
    })
  })

  describe("normalizeFormValue", () => {
    it("strips case and punctuation", () => {
      expect(normalizeFormValue("Darshan Choudhari")).toBe("darshanchoudhari")
    })
  })

  describe("extractIdentityFields", () => {
    it("resolves school-specific column names", () => {
      const fd = {
        "Student Name": "Neha Patel",
        "Father Name": "Ramesh Patel",
        "GR NO": "108",
        dob: "2016-03-15",
      }
      const id = extractIdentityFields(fd)
      expect(id.name).toBe("Neha Patel")
      expect(id.father).toBe("Ramesh Patel")
      expect(id.roll).toBe("108")
      expect(id.dob).toBe("2016-03-15")
    })
  })

  describe("sortFieldsByRole", () => {
    it("orders name before address and mobile", () => {
      const sorted = sortFieldsByRole([
        { key: "MOBILE", label: "MOBILE", type: "tel", required: true },
        { key: "Name", label: "Name", type: "text", required: true },
        { key: "Address", label: "Address", type: "textarea", required: true },
      ])
      expect(sorted.map(f => f.key)).toEqual(["Name", "Address", "MOBILE"])
    })
  })

  describe("Edge cases", () => {
    it("prefers direct match over normalized match", () => {
      const fd = { name: "Direct", fullname: "Normalized" }
      expect(resolveFieldValue(fd, "name")).toBe("Direct")
    })

    it("handles numeric values correctly", () => {
      const fd = { rollno: "123" as string }
      expect(resolveFieldValue(fd, "rollno")).toBe("123")
    })

    it("handles data with many fields without error", () => {
      const fd: Record<string, string> = {}
      for (let i = 0; i < 100; i++) fd[`field_${i}`] = `value_${i}`
      fd["name"] = "Found"
      expect(resolveFieldValue(fd, "name")).toBe("Found")
    })
  })
})
