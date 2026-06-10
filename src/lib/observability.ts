import * as Sentry from "@sentry/nextjs"
import { prisma } from "@/lib/prisma"
import type { EventSeverity, SystemEventType } from "@prisma/client"

type EventInput = {
  type: SystemEventType
  severity?: EventSeverity
  message: string
  schoolId?: string | null
  userId?: string | null
  metadata?: Record<string, any>
}

export function captureError(error: unknown, context?: Record<string, any>) {
  Sentry.captureException(error, { extra: context })
}

export async function recordEvent(input: EventInput) {
  try {
    await prisma.systemEvent.create({
      data: {
        type: input.type,
        severity: input.severity || "INFO",
        message: input.message,
        schoolId: input.schoolId || null,
        userId: input.userId || null,
        metadata: input.metadata || undefined,
      },
    })
  } catch (error) {
    console.error("Failed to record system event:", error)
  }
}

export async function reportError(
  error: unknown,
  event: Omit<EventInput, "message"> & { message?: string }
) {
  const message = event.message || (error instanceof Error ? error.message : "Unknown error")
  captureError(error, event.metadata)
  await recordEvent({
    ...event,
    severity: event.severity || "ERROR",
    message,
    metadata: {
      ...event.metadata,
      error: error instanceof Error ? error.message : String(error),
    },
  })
}
