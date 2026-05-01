import type { PoseFrame, PoseIssue } from "@/lib/pose";

export type ProcessPayload = {
  referenceFrames: PoseFrame[];
  submissionFrames: PoseFrame[];
  issues: PoseIssue[];
  overallScore: number;
  summary: string;
};

const MAX_FRAMES = 300;
const MAX_ISSUES = 1000;
const MAX_TIMESTAMP_MS = 10 * 60 * 1000;
const MAX_LANDMARKS = 33;
const MAX_SUMMARY_LENGTH = 1200;
const JOINT_NAME_PATTERN = /^[a-z_]+$/;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= 0;
}

function sanitizeNumber(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function assertValidFrames(frames: unknown, label: string): PoseFrame[] {
  if (!Array.isArray(frames)) {
    throw new Error(`${label} must be an array.`);
  }

  if (frames.length > MAX_FRAMES) {
    throw new Error(`${label} exceeds max frame count (${MAX_FRAMES}).`);
  }

  return frames.map((frame, index) => {
    if (!frame || typeof frame !== "object") {
      throw new Error(`${label}[${index}] is invalid.`);
    }

    const timestampMs = (frame as { timestampMs?: unknown }).timestampMs;
    const landmarks = (frame as { landmarks?: unknown }).landmarks;

    if (!isNonNegativeInteger(timestampMs) || timestampMs > MAX_TIMESTAMP_MS) {
      throw new Error(`${label}[${index}].timestampMs is invalid.`);
    }
    const safeTimestampMs = timestampMs;

    if (!Array.isArray(landmarks) || landmarks.length > MAX_LANDMARKS) {
      throw new Error(`${label}[${index}].landmarks is invalid.`);
    }

    return {
      timestampMs: safeTimestampMs,
      landmarks: landmarks.map((point, landmarkIndex) => {
        if (!point || typeof point !== "object") {
          throw new Error(`${label}[${index}].landmarks[${landmarkIndex}] is invalid.`);
        }

        const x = (point as { x?: unknown }).x;
        const y = (point as { y?: unknown }).y;
        const z = (point as { z?: unknown }).z;
        const visibility = (point as { visibility?: unknown }).visibility;

        if (!isFiniteNumber(x) || !isFiniteNumber(y)) {
          throw new Error(
            `${label}[${index}].landmarks[${landmarkIndex}] has invalid coordinates.`,
          );
        }

        return {
          x: sanitizeNumber(clamp(x, -4, 4), 5),
          y: sanitizeNumber(clamp(y, -4, 4), 5),
          z: isFiniteNumber(z) ? sanitizeNumber(clamp(z, -6, 6), 5) : undefined,
          visibility: isFiniteNumber(visibility)
            ? sanitizeNumber(clamp(visibility, 0, 1), 5)
            : undefined,
        };
      }),
    };
  });
}

function assertValidIssues(issues: unknown): PoseIssue[] {
  if (!Array.isArray(issues)) {
    throw new Error("issues must be an array.");
  }

  if (issues.length > MAX_ISSUES) {
    throw new Error(`issues exceeds max count (${MAX_ISSUES}).`);
  }

  return issues.map((issue, index) => {
    if (!issue || typeof issue !== "object") {
      throw new Error(`issues[${index}] is invalid.`);
    }

    const timestampMs = (issue as { timestampMs?: unknown }).timestampMs;
    const jointName = (issue as { jointName?: unknown }).jointName;
    const severity = (issue as { severity?: unknown }).severity;
    const expectedAngle = (issue as { expectedAngle?: unknown }).expectedAngle;
    const actualAngle = (issue as { actualAngle?: unknown }).actualAngle;
    const delta = (issue as { delta?: unknown }).delta;
    const notes = (issue as { notes?: unknown }).notes;

    if (!isNonNegativeInteger(timestampMs) || timestampMs > MAX_TIMESTAMP_MS) {
      throw new Error(`issues[${index}].timestampMs is invalid.`);
    }
    const safeTimestampMs = timestampMs;

    if (
      typeof jointName !== "string" ||
      !JOINT_NAME_PATTERN.test(jointName) ||
      jointName.length > 64
    ) {
      throw new Error(`issues[${index}].jointName is invalid.`);
    }

    if (severity !== "minor" && severity !== "major") {
      throw new Error(`issues[${index}].severity is invalid.`);
    }

    if (!isFiniteNumber(expectedAngle) || !isFiniteNumber(actualAngle) || !isFiniteNumber(delta)) {
      throw new Error(`issues[${index}] has invalid angle values.`);
    }

    if (notes !== undefined && typeof notes !== "string") {
      throw new Error(`issues[${index}].notes is invalid.`);
    }

    return {
      timestampMs: safeTimestampMs,
      jointName,
      severity,
      expectedAngle: sanitizeNumber(clamp(expectedAngle, 0, 360)),
      actualAngle: sanitizeNumber(clamp(actualAngle, 0, 360)),
      delta: sanitizeNumber(clamp(delta, 0, 360)),
      notes: typeof notes === "string" ? notes.slice(0, 600) : "",
    };
  });
}

export function parseProcessPayload(rawPayload: unknown): ProcessPayload {
  if (!rawPayload || typeof rawPayload !== "object") {
    throw new Error("Invalid request body.");
  }

  const payload = rawPayload as Partial<ProcessPayload>;
  const summary =
    typeof payload.summary === "string"
      ? payload.summary.trim().slice(0, MAX_SUMMARY_LENGTH)
      : "";
  const overallScore = isFiniteNumber(payload.overallScore)
    ? sanitizeNumber(clamp(payload.overallScore, 0, 100))
    : NaN;

  if (!Number.isFinite(overallScore)) {
    throw new Error("overallScore must be a finite number.");
  }

  return {
    referenceFrames: assertValidFrames(payload.referenceFrames, "referenceFrames"),
    submissionFrames: assertValidFrames(payload.submissionFrames, "submissionFrames"),
    issues: assertValidIssues(payload.issues),
    overallScore,
    summary,
  };
}
