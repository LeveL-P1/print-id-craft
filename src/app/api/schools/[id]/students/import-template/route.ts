import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import * as XLSX from "xlsx"

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const url = new URL(req.url)
    const classId = url.searchParams.get("classId")

    const school = await prisma.school.findUnique({
      where: { id: params.id },
      include: {
        template: { select: { fieldConfig: true } },
        classes: { select: { id: true, name: true } },
      },
    })

    if (!school) {
      return NextResponse.json({ error: "School not found" }, { status: 404 })
    }

    const fieldConfig = (school.template?.fieldConfig || []) as Array<{
      key: string; label: string; type: string; required: boolean
    }>

    // Build headers from field config (exclude "class" since it's auto-assigned)
    const headers = fieldConfig
      .filter(f => f.key !== "class")
      .map(f => f.label)

    // Add Photo URL column at the end
    headers.push("Photo URL")

    // Build worksheet
    const className = classId
      ? school.classes.find(c => c.id === classId)?.name || ""
      : ""

    const wsData: any[][] = [
      [`Import Template — ${school.name}`],
      [`Class: ${className || "Select class during import"}`],
      [`Instructions: Fill the data below. Required fields are marked with *. Do NOT modify the header row.`],
      [],
      headers.map(h => {
        const field = fieldConfig.find(f => f.label === h)
        return field?.required ? `${h} *` : h
      }),
      // Add 3 sample rows
      ...Array.from({ length: 3 }, (_, i) => {
        return headers.map(h => {
          const field = fieldConfig.find(f => f.label === h)
          if (!field) return h === "Photo URL" ? "" : ""
          switch (field.key) {
            case "fullName": return i === 0 ? "Aarav Sharma" : i === 1 ? "Priya Patel" : ""
            case "rollNo": return i === 0 ? "101" : i === 1 ? "102" : ""
            case "dob": return i === 0 ? "2010-05-15" : i === 1 ? "2011-02-20" : ""
            case "bloodGroup": return i === 0 ? "B+" : i === 1 ? "O+" : ""
            case "fatherName": return i === 0 ? "Rajesh Sharma" : i === 1 ? "Anil Patel" : ""
            case "motherName": return i === 0 ? "Sunita Sharma" : i === 1 ? "Meena Patel" : ""
            case "phone": return i === 0 ? "9876543210" : i === 1 ? "9876543211" : ""
            case "address": return i === 0 ? "123 Main St, City" : i === 1 ? "456 Park Ave, Town" : ""
            default: return ""
          }
        })
      }),
    ]

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(wsData)

    // Auto column widths
    const colWidths = headers.map((h, i) => {
      const maxLen = Math.max(
        h.length + 2,
        ...wsData.slice(5).map(row => String(row[i] || "").length)
      )
      return { wch: Math.min(maxLen + 4, 35) }
    })
    ws["!cols"] = colWidths

    XLSX.utils.book_append_sheet(wb, ws, "Students")
    const xlsxBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })

    const filename = `${school.name.replace(/[^a-zA-Z0-9]/g, "-")}-import-template.xlsx`

    return new NextResponse(xlsxBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error("Template download error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
