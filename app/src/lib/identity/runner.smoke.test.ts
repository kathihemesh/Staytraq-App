import { describe, it, expect } from "vitest"
import fc from "fast-check"

// Smoke test confirming the owner-app vitest + fast-check runner is wired up.
// Replace/remove once the real identity logic modules land (tasks 2.2+).
describe("owner-app identity test runner", () => {
  it("runs a vitest assertion", () => {
    expect(1 + 1).toBe(2)
  })

  it("runs a fast-check property", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => a + b === b + a),
    )
  })
})
