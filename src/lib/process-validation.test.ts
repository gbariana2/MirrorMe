import test from "node:test";
import assert from "node:assert/strict";

import { parseProcessPayload } from "./analysis-payload.ts";

function makePayload() {
  return {
    referenceFrames: [
      {
        timestampMs: 0,
        landmarks: [{ x: 0.123456, y: 0.654321, visibility: 2 }],
      },
    ],
    submissionFrames: [
      {
        timestampMs: 0,
        landmarks: [{ x: 0, y: 0 }],
      },
    ],
    issues: [
      {
        timestampMs: 0,
        jointName: "left_elbow",
        severity: "minor",
        expectedAngle: 12.3456,
        actualAngle: 25.6789,
        delta: 13.3333,
        notes: "note",
      },
    ],
    overallScore: 120,
    summary: "  hello  ",
  };
}

test("parseProcessPayload clamps and sanitizes expected fields", () => {
  const parsed = parseProcessPayload(makePayload());

  assert.equal(parsed.overallScore, 100);
  assert.equal(parsed.summary, "hello");
  assert.equal(parsed.referenceFrames[0]?.landmarks[0]?.x, 0.12346);
  assert.equal(parsed.referenceFrames[0]?.landmarks[0]?.visibility, 1);
  assert.equal(parsed.issues[0]?.expectedAngle, 12.35);
});

test("parseProcessPayload rejects malformed payloads", () => {
  assert.throws(
    () =>
      parseProcessPayload({
        referenceFrames: [],
        submissionFrames: [],
        issues: [],
        overallScore: "bad",
      }),
    /overallScore must be a finite number/,
  );

  assert.throws(
    () =>
      parseProcessPayload({
        ...makePayload(),
        issues: [
          {
            timestampMs: 0,
            jointName: "bad-name",
            severity: "minor",
            expectedAngle: 1,
            actualAngle: 1,
            delta: 0,
          },
        ],
      }),
    /jointName is invalid/,
  );
});
