import test from "node:test";
import assert from "node:assert/strict";

import { comparePoseFrames, type PoseFrame } from "./pose.ts";

const BASE_POINTS = Array.from({ length: 33 }, () => ({
  x: 0,
  y: 0,
  z: 0,
  visibility: 1,
}));

function withPoint(frame: PoseFrame, index: number, x: number, y: number) {
  frame.landmarks[index] = {
    ...frame.landmarks[index],
    x,
    y,
    visibility: 1,
  };
}

function makeFrame(timestampMs: number, bend = false): PoseFrame {
  const frame: PoseFrame = {
    timestampMs,
    landmarks: BASE_POINTS.map((point) => ({ ...point })),
  };

  withPoint(frame, 11, 0, 0);
  withPoint(frame, 13, 1, 0);
  withPoint(frame, 15, bend ? 1 : 2, bend ? 1 : 0);

  withPoint(frame, 12, 0, 0);
  withPoint(frame, 14, -1, 0);
  withPoint(frame, 16, bend ? -1 : -2, bend ? 1 : 0);

  withPoint(frame, 23, 0, -1);
  withPoint(frame, 24, 0, -1);
  withPoint(frame, 25, 0, -2);
  withPoint(frame, 26, 0, -2);
  withPoint(frame, 27, 0, -3);
  withPoint(frame, 28, 0, -3);

  return frame;
}

test("selects a positive alignment offset when submission is delayed", () => {
  const reference = [0, 1000, 2000, 3000].map((time) => makeFrame(time));
  const submission = [700, 1700, 2700, 3700].map((time) => makeFrame(time));
  const result = comparePoseFrames(reference, submission);

  assert.equal(result.alignmentOffsetMs, 500);
  assert.equal(result.issues.length, 0);
  assert.equal(result.overallScore, 100);
});

test("flags major issues for large elbow divergence", () => {
  const reference = [0, 1000, 2000].map((time) => makeFrame(time, false));
  const submission = [0, 1000, 2000].map((time) => makeFrame(time, true));
  const result = comparePoseFrames(reference, submission);

  assert.ok(result.issues.length > 0);
  assert.ok(result.issues.some((issue) => issue.severity === "major"));
  assert.ok(result.overallScore < 100);
});
