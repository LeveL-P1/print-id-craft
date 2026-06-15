import { NextRequest, NextResponse } from "next/server"
import {
  configuredBgRemovalServiceUrl,
  ensureBgRemovalServiceReady,
  wakeBgRemovalService,
} from "@/lib/bg-removal-service"

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const serviceUrl = configuredBgRemovalServiceUrl()
  if (!serviceUrl) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        error: "BG_REMOVAL_SERVICE_URL is not set",
        hint: "Set BG_REMOVAL_SERVICE_URL=https://teamsasd-wisemelon-bg-removal.hf.space",
      },
      { status: 503 }
    )
  }

  const quick = req.nextUrl.searchParams.get("quick") === "1"

  try {
    if (quick) {
      // Preload during crop — single fast ping, no multi-minute poll loop.
      const body = await wakeBgRemovalService(serviceUrl, 25_000)
      if (!body?.ok) {
        return NextResponse.json(
          {
            ok: false,
            configured: true,
            serviceUrl,
            waking: true,
            error: "rembg is waking up",
          },
          { status: 202 }
        )
      }
      return NextResponse.json({ ok: true, configured: true, serviceUrl, upstream: body })
    }

    const { ready, health: body } = await ensureBgRemovalServiceReady(serviceUrl, 2)

    if (!ready || !body?.ok) {
      return NextResponse.json(
        {
          ok: false,
          configured: true,
          serviceUrl,
          error: "Upstream service did not respond — Hugging Face Space may be sleeping",
          hint: "Wait 1-2 minutes and retry, or open the Space URL in a browser to wake it",
        },
        { status: 502 }
      )
    }

    return NextResponse.json(
      {
        ok: true,
        configured: true,
        serviceUrl,
        upstream: body,
        mergeReady: body.mergeMask === true && Boolean(body.mergeModel),
      },
      { status: 200 }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Health check failed"
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        serviceUrl,
        error: message,
      },
      { status: 502 }
    )
  }
}
