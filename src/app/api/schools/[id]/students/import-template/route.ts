import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { buildExcelBuffer, columnWidthsFromRows } from "@/lib/excel"
import { getDefaultTemplate } from "@/lib/template-resolver"

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
        classes: { select: { id: true, name: true } },
      },
    })

    if (!school) {
      return NextResponse.json({ error: "School not found" }, { status: 404 })
    }

    const defaultTemplate = await getDefaultTemplate(params.id)
    const fieldConfig = (defaultTemplate?.fieldConfig || []) as Array<{
      key: string
      label: string
      type: string
      required: boolean
    }>

    const headers = fieldConfig.filter((f) => f.key !== "class").map((f) => f.label)
    headers.push("Photo URL")

    const className = classId ? school.classes.find((c) => c.id === classId)?.name || "" : ""

    const wsData: unknown[][] = [
      [`Import Template — ${school.name}`],
      [`Class: ${className || "Select class during import"}`],
      [`Instructions: Fill the data below. Required fields are marked with *. Do NOT modify the header row.`],
      [],
      headers.map((h) => {
        const field = fieldConfig.find((f) => f.label === h)
        return field?.required ? `${h} *` : h
      }),
      ...Array.from({ length: 3 }, (_, i) =>
        headers.map((h) => {
          const field = fieldConfig.find((f) => f.label === h)
          if (!field) return h === "Photo URL" ? "" : ""
          switch (field.key) {
            case "fullName":
              return i === 0 ? "Aarav Sharma" : i === 1 ? "Priya Patel" : ""
            case "rollNo":
              return i === 0 ? "101" : i === 1 ? "102" : ""
            case "dob":
              return i === 0 ? "2010-05-15" : i === 1 ? "2011-02-20" : ""
            case "bloodGroup":
              return i === 0 ? "B+" : i === 1 ? "O+" : ""
            case "fatherName":
              return i === 0 ? "Rajesh Sharma" : i === 1 ? "Anil Patel" : ""
            case "motherName":
              return i === 0 ? "Sunita Sharma" : i === 1 ? "Meena Patel" : ""
            case "phone":
              return i === 0 ? "9876543210" : i === 1 ? "9876543211" : ""
            case "address":
              return i === 0 ? "123 Main St, City" : i === 1 ? "456 Park Ave, Town" : ""
            default:
              return ""
          }
        })
      ),
    ]

    const buffer = await buildExcelBuffer([
      {
        name: "Students",
        rows: wsData,
        columnWidths: headers.map((h, i) => {
          const maxLen = Math.max(
            h.length + 2,
            ...wsData.slice(5).map((row) => String((row as unknown[])[i] || "").length)
          )
          return Math.min(maxLen + 4, 35)
        }),
      },
    ])

    const filename = `${school.name.replace(/[^a-zA-Z0-9]/g, "-")}-import-template.xlsx`
    return new NextResponse(new Uint8Array(buffer), {
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
