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

    if (!batch || !batch.manifestPath) {
      return NextResponse.json({ error: "Manifest not found" }, { status: 404 })
    }

    const { data, error } = await supabase.storage
      .from("student-photos")
      .download(batch.manifestPath)

    if (error || !data) {
      console.error("Manifest download error:", error)
      return NextResponse.json({ error: "Failed to download manifest" }, { status: 500 })
    }

    const buffer = Buffer.from(await data.arrayBuffer())
    const dateStr = new Date().toISOString().slice(0, 10)
    const schoolName = (school?.name || "school").replace(/[^a-zA-Z0-9]/g, "-")

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="manifest-${schoolName}-${dateStr}.csv"`,
      },
    })
  } catch (error) {
    console.error("Download manifest error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
