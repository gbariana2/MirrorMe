export const POSE_LANDMARK_NAMES = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

type PosePoint = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
};

export type PoseFrame = {
  timestampMs: number;
  landmarks: PosePoint[];
};

export type PoseIssue = {
  timestampMs: number;
  jointName: string;
  severity: "minor" | "major";
  expectedAngle: number;
  actualAngle: number;
  delta: number;
  notes: string;
};

export type PoseComparisonResult = {
  issues: PoseIssue[];
  overallScore: number;
  alignmentOffsetMs: number;
  alignedFrameCount: number;
  averageDelta: number;
};

const JOINT_DEFINITIONS = [
  {
    jointName: "left_elbow",
    points: [
      POSE_LANDMARK_NAMES.leftShoulder,
      POSE_LANDMARK_NAMES.leftElbow,
      POSE_LANDMARK_NAMES.leftWrist,
    ],
    weight: 1,
  },
  {
    jointName: "right_elbow",
    points: [
      POSE_LANDMARK_NAMES.rightShoulder,
      POSE_LANDMARK_NAMES.rightElbow,
      POSE_LANDMARK_NAMES.rightWrist,
    ],
    weight: 1,
  },
  {
    jointName: "left_shoulder",
    points: [
      POSE_LANDMARK_NAMES.leftHip,
      POSE_LANDMARK_NAMES.leftShoulder,
      POSE_LANDMARK_NAMES.leftElbow,
    ],
    weight: 1.2,
  },
  {
    jointName: "right_shoulder",
    points: [
      POSE_LANDMARK_NAMES.rightHip,
      POSE_LANDMARK_NAMES.rightShoulder,
      POSE_LANDMARK_NAMES.rightElbow,
    ],
    weight: 1.2,
  },
  {
    jointName: "left_knee",
    points: [
      POSE_LANDMARK_NAMES.leftHip,
      POSE_LANDMARK_NAMES.leftKnee,
      POSE_LANDMARK_NAMES.leftAnkle,
    ],
    weight: 1.1,
  },
  {
    jointName: "right_knee",
    points: [
      POSE_LANDMARK_NAMES.rightHip,
      POSE_LANDMARK_NAMES.rightKnee,
      POSE_LANDMARK_NAMES.rightAnkle,
    ],
    weight: 1.1,
  },
];

const OFFSET_CANDIDATES_MS = [-2000, -1500, -1000, -500, 0, 500, 1000, 1500, 2000];
const MATCH_TOLERANCE_MS = 600;
const MINOR_THRESHOLD = 15;
const MAJOR_THRESHOLD = 30;

function toDegrees(radians: number) {
  return (radians * 180) / Math.PI;
}

function roundToTwoDecimals(value: number) {
  return Math.round(value * 100) / 100;
}

function getAngle(first: PosePoint, middle: PosePoint, last: PosePoint) {
  const ab = { x: first.x - middle.x, y: first.y - middle.y };
  const cb = { x: last.x - middle.x, y: last.y - middle.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const magnitudeAB = Math.hypot(ab.x, ab.y);
  const magnitudeCB = Math.hypot(cb.x, cb.y);

  if (magnitudeAB === 0 || magnitudeCB === 0) {
    return null;
  }

  const cosine = Math.min(1, Math.max(-1, dot / (magnitudeAB * magnitudeCB)));
  return toDegrees(Math.acos(cosine));
}

function isVisible(point: PosePoint | undefined) {
  if (!point) {
    return false;
  }

  return (point.visibility ?? 1) >= 0.5;
}

function getJointAngle(landmarks: PosePoint[], pointIndexes: readonly number[]) {
  const [firstIndex, middleIndex, lastIndex] = pointIndexes;
  const first = landmarks[firstIndex];
  const middle = landmarks[middleIndex];
  const last = landmarks[lastIndex];

  if (!isVisible(first) || !isVisible(middle) || !isVisible(last)) {
    return null;
  }

  return getAngle(first, middle, last);
}

function getClosestFrame(targetTimestampMs: number, frames: PoseFrame[]) {
  let closestFrame: PoseFrame | null = null;
  let smallestDistance = Number.POSITIVE_INFINITY;

  for (const frame of frames) {
    const distance = Math.abs(frame.timestampMs - targetTimestampMs);

    if (distance < smallestDistance) {
      smallestDistance = distance;
      closestFrame = frame;
    }
  }

  if (smallestDistance > MATCH_TOLERANCE_MS) {
    return null;
  }

  return closestFrame;
}

function evaluateOffset(referenceFrames: PoseFrame[], submissionFrames: PoseFrame[], offsetMs: number) {
  let alignedFrameCount = 0;
  let weightedDeltaSum = 0;
  let weightedJointCount = 0;

  for (const referenceFrame of referenceFrames) {
    const submissionFrame = getClosestFrame(referenceFrame.timestampMs + offsetMs, submissionFrames);

    if (!submissionFrame) {
      continue;
    }

    let comparableJointCount = 0;

    for (const definition of JOINT_DEFINITIONS) {
      const expectedAngle = getJointAngle(referenceFrame.landmarks, definition.points);
      const actualAngle = getJointAngle(submissionFrame.landmarks, definition.points);

      if (expectedAngle === null || actualAngle === null) {
        continue;
      }

      comparableJointCount += 1;
      weightedJointCount += definition.weight;
      weightedDeltaSum += Math.abs(expectedAngle - actualAngle) * definition.weight;
    }

    if (comparableJointCount > 0) {
      alignedFrameCount += 1;
    }
  }

  const averageDelta =
    weightedJointCount === 0 ? Number.POSITIVE_INFINITY : weightedDeltaSum / weightedJointCount;

  return {
    offsetMs,
    alignedFrameCount,
    averageDelta,
  };
}

function getBestAlignmentOffset(referenceFrames: PoseFrame[], submissionFrames: PoseFrame[]) {
  let bestCandidate = {
    offsetMs: 0,
    alignedFrameCount: 0,
    averageDelta: Number.POSITIVE_INFINITY,
  };

  for (const offsetMs of OFFSET_CANDIDATES_MS) {
    const candidate = evaluateOffset(referenceFrames, submissionFrames, offsetMs);

    if (candidate.alignedFrameCount > bestCandidate.alignedFrameCount) {
      bestCandidate = candidate;
      continue;
    }

    if (
      candidate.alignedFrameCount === bestCandidate.alignedFrameCount &&
      candidate.averageDelta < bestCandidate.averageDelta
    ) {
      bestCandidate = candidate;
    }
  }

  return bestCandidate;
}

export function comparePoseFrames(
  referenceFrames: PoseFrame[],
  submissionFrames: PoseFrame[],
): PoseComparisonResult {
  const alignment = getBestAlignmentOffset(referenceFrames, submissionFrames);
  const issues: PoseIssue[] = [];
  let weightedDeltaSum = 0;
  let weightedJointCount = 0;

  for (const referenceFrame of referenceFrames) {
    const submissionFrame = getClosestFrame(
      referenceFrame.timestampMs + alignment.offsetMs,
      submissionFrames,
    );

    if (!submissionFrame) {
      continue;
    }

    for (const definition of JOINT_DEFINITIONS) {
      const expectedAngle = getJointAngle(referenceFrame.landmarks, definition.points);
      const actualAngle = getJointAngle(submissionFrame.landmarks, definition.points);

      if (expectedAngle === null || actualAngle === null) {
        continue;
      }

      const delta = Math.abs(expectedAngle - actualAngle);
      weightedJointCount += definition.weight;
      weightedDeltaSum += delta * definition.weight;

      if (delta < MINOR_THRESHOLD) {
        continue;
      }

      issues.push({
        timestampMs: referenceFrame.timestampMs,
        jointName: definition.jointName,
        severity: delta >= MAJOR_THRESHOLD ? "major" : "minor",
        expectedAngle: roundToTwoDecimals(expectedAngle),
        actualAngle: roundToTwoDecimals(actualAngle),
        delta: roundToTwoDecimals(delta),
        notes:
          delta >= MAJOR_THRESHOLD
            ? "Joint angle diverges substantially from the aligned reference frame."
            : "Joint angle is drifting outside the target range after alignment.",
      });
    }
  }

  const averageDelta =
    weightedJointCount === 0 ? 0 : roundToTwoDecimals(weightedDeltaSum / weightedJointCount);

  const issuePenalty = issues.reduce((sum, issue) => {
    return sum + (issue.severity === "major" ? 6 : 2.5);
  }, 0);
  const deltaPenalty = averageDelta * 1.35;
  const coveragePenalty =
    alignment.alignedFrameCount === 0
      ? 35
      : Math.max(0, referenceFrames.length - alignment.alignedFrameCount) * 2.5;
  const overallScore = Math.max(
    0,
    roundToTwoDecimals(100 - deltaPenalty - issuePenalty - coveragePenalty),
  );

  return {
    issues,
    overallScore,
    alignmentOffsetMs: alignment.offsetMs,
    alignedFrameCount: alignment.alignedFrameCount,
    averageDelta,
  };
}
