import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { supabase } from "@/lib/supabase"

export async function GET(req: Request, props: { params: Promise<{ id: string; bid: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const batch = await prisma.printBatch.findFirst({
      where: { id: params.bid, schoolId: params.id },
    })

    const school = await prisma.school.findUnique({
      where: { id: params.id },
      select: { name: true },
    })

    if (!batch || !batch.backPdfPath) {
      return NextResponse.json({ error: "Back PDF not found" }, { status: 404 })
    }

    const { data, error } = await supabase.storage
      .from("student-photos")
      .download(batch.backPdfPath)

    if (error || !data) {
      console.error("Back PDF download error:", error)
      return NextResponse.json({ error: "Failed to download back PDF" }, { status: 500 })
    }

    // Mark as DOWNLOADED
    if (batch.status === "READY") {
      await prisma.printBatch.update({
        where: { id: params.bid },
        data: { status: "DOWNLOADED" },
      })
    }

    const buffer = Buffer.from(await data.arrayBuffer())
    const dateStr = new Date().toISOString().slice(0, 10)
    const schoolName = (school?.name || "school").replace(/[^a-zA-Z0-9]/g, "-")

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="back-batch-${schoolName}-${dateStr}.pdf"`,
      },
    })
  } catch (error) {
    console.error("Download back PDF error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
