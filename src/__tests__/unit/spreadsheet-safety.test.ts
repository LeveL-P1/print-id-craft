import { describe, expect, it } from "vitest"
import { csvCell, normalizeImportedRows, parseCsvRows } from "@/lib/spreadsheet-safety"

describe("spreadsheet safety", () => {
  it("neutralizes formula-like CSV cells", () => {
    expect(csvCell("=IMPORTXML(\"http://example.com\")")).toBe("\"'=IMPORTXML(\"\"http://example.com\"\")\"")
    expect(csvCell("+SUM(1,2)")).toBe("\"'+SUM(1,2)\"")
    expect(csvCell("@cmd")).toBe("\"'@cmd\"")
  })

  it("parses CSV without using xlsx and preserves quoted commas", () => {
    const rows = parseCsvRows("Full Name,Address\n\"Jane Doe\",\"Apt 1, Main Road\"")
    expect(rows).toEqual([{ "Full Name": "Jane Doe", Address: "Apt 1, Main Road" }])
  })

  it("caps normalized imports at the configured row limit", () => {
    const rows = Array.from({ length: 5001 }, (_, index) => ({ Name: `Student ${index}` }))
    expect(() => normalizeImportedRows(rows)).toThrow("Maximum 5000 students per import")
  })
})
