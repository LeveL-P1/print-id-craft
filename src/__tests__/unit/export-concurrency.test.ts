import { describe, it, expect } from "vitest"
import { mapWithConcurrency } from "@/lib/export/concurrency"

describe("mapWithConcurrency", () => {
  it("runs all tasks and preserves order", async () => {
    const input = [1, 2, 3, 4, 5]
    const results = await mapWithConcurrency(input, 2, async (value) => value * 2)
    expect(results).toEqual([2, 4, 6, 8, 10])
  })

  it("limits parallel workers", async () => {
    let active = 0
    let maxActive = 0

    await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((r) => setTimeout(r, 5))
      active -= 1
      return true
    })

    expect(maxActive).toBeLessThanOrEqual(4)
  })
})
