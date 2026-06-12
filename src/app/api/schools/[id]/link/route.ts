import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

/**
 * Manufacturer-only endpoint for managing the school-wide registration
 * link (`School.linkToken` + active flag + expiry). Mirrors the per-class
 * link controls but operates at the school level so admins only have to
 * share/manage one URL.
 */
const patchSchema = z.object({
  // Set null/empty to clear; otherwise an ISO string.
  expiresAt: z.string().nullable().optional(),
  linkActive: z.boolean().optional(),
  // When true, generate a brand-new token (invalidates the old URL).
  regenerate: z.boolean().optional(),
})

const isManufacturer = (session: any) => session?.user?.role === "MANUFACTURER"

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions)
    if (!isManufacturer(session)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const school = await prisma.school.findUnique({
      where: { id: params.id },
      select: { linkToken: true, linkActive: true, linkExpiresAt: true },
    })
    if (!school) {
      return NextResponse.json({ error: "School not found" }, { status: 404 })
    }
    return NextResponse.json({ success: true, data: school })
  } catch (error) {
    console.error("GET /api/schools/[id]/link error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions)
    if (!isManufacturer(session)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const body = await req.json()
    const v = patchSchema.parse(body)

    const data: Record<string, unknown> = {}
    if (typeof v.linkActive === "boolean") data.linkActive = v.linkActive
    if (v.expiresAt !== undefined) {
      data.linkExpiresAt = v.expiresAt ? new Date(v.expiresAt) : null
    }
    if (v.regenerate) {
      // Generate a fresh opaque token. We don't need the cuid format
      // specifically — `linkToken` is just a unique URL identifier, so
      // a random base-36 string of generous length is sufficient and
      // avoids adding a runtime dep.
      const { randomBytes } = await import("crypto")
      data.linkToken = "s" + randomBytes(16).toString("base64url")
    }

    const school = await prisma.school.update({
      where: { id: params.id },
      data,
      select: { linkToken: true, linkActive: true, linkExpiresAt: true },
    })

    return NextResponse.json({ success: true, data: school })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("PATCH /api/schools/[id]/link error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
