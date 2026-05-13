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
  severity: "major";
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
  mirrorMode: "original" | "mirrored";
  alignedReferenceFrames: PoseFrame[];
  alignedSubmissionFrames: PoseFrame[];
};

type CompareOptions = {
  preferredOffsetMs?: number;
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

const COARSE_OFFSET_CANDIDATES_MS = Array.from({ length: 121 }, (_, index) => -12000 + index * 200);
const FINE_OFFSET_STEP_MS = 25;
const FINE_OFFSET_WINDOW_MS = 500;
const MATCH_TOLERANCE_MS = 180;
const VERY_MAJOR_THRESHOLD = 60;
const ACTIVITY_START_THRESHOLD = 0.06;
const ACTIVE_FRAME_MOTION_THRESHOLD = 0.015;
const START_STREAK_FRAMES = 2;

function toDegrees(radians: number) {
  return (radians * 180) / Math.PI;
}

function roundToTwoDecimals(value: number) {
  return Math.round(value * 100) / 100;
}

function roundToNearestFive(value: number) {
  return Math.round(value / 5) * 5;
}

function humanJointName(jointName: string) {
  switch (jointName) {
    case "left_elbow":
      return "left arm";
    case "right_elbow":
      return "right arm";
    case "left_shoulder":
      return "left shoulder";
    case "right_shoulder":
      return "right shoulder";
    case "left_knee":
      return "left leg";
    case "right_knee":
      return "right leg";
    default:
      return jointName.replaceAll("_", " ");
  }
}

function buildCoachingNote(jointName: string, expectedAngle: number, actualAngle: number) {
  const expectedRounded = roundToNearestFive(expectedAngle);
  const actualRounded = roundToNearestFive(actualAngle);
  const direction =
    actualRounded > expectedRounded ? "more open" : "more bent";
  return `Your ${humanJointName(jointName)} is around ${actualRounded}\u00b0, while the reference is closer to ${expectedRounded}\u00b0. Try making it ${direction} to match the target shape.`;
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

function getLandmarkMotion(previous: PosePoint[], current: PosePoint[]) {
  const trackedIndexes = [
    POSE_LANDMARK_NAMES.leftShoulder,
    POSE_LANDMARK_NAMES.rightShoulder,
    POSE_LANDMARK_NAMES.leftElbow,
    POSE_LANDMARK_NAMES.rightElbow,
    POSE_LANDMARK_NAMES.leftWrist,
    POSE_LANDMARK_NAMES.rightWrist,
    POSE_LANDMARK_NAMES.leftHip,
    POSE_LANDMARK_NAMES.rightHip,
    POSE_LANDMARK_NAMES.leftKnee,
    POSE_LANDMARK_NAMES.rightKnee,
    POSE_LANDMARK_NAMES.leftAnkle,
    POSE_LANDMARK_NAMES.rightAnkle,
  ];
  let total = 0;
  let count = 0;

  for (const index of trackedIndexes) {
    const prev = previous[index];
    const next = current[index];
    if (!isVisible(prev) || !isVisible(next)) {
      continue;
    }

    total += Math.hypot(next.x - prev.x, next.y - prev.y);
    count += 1;
  }

  return count === 0 ? 0 : total / count;
}

function detectDanceStartTimestamp(frames: PoseFrame[]) {
  if (frames.length < 2) {
    return frames[0]?.timestampMs ?? 0;
  }

  let streak = 0;
  for (let i = 1; i < frames.length; i += 1) {
    const prevFrame = frames[i - 1];
    const currentFrame = frames[i];
    if (!prevFrame || !currentFrame) {
      continue;
    }
    const motion = getLandmarkMotion(prevFrame.landmarks, currentFrame.landmarks);
    if (motion >= ACTIVITY_START_THRESHOLD) {
      streak += 1;
      if (streak >= START_STREAK_FRAMES) {
        const startIndex = Math.max(0, i - START_STREAK_FRAMES);
        return frames[startIndex]?.timestampMs ?? 0;
      }
    } else {
      streak = 0;
    }
  }

  return frames[0]?.timestampMs ?? 0;
}

function normalizeFramesFromDanceStart(frames: PoseFrame[]) {
  if (frames.length === 0) {
    return { frames: [], startTimestampMs: 0 };
  }

  const sorted = [...frames].sort((a, b) => a.timestampMs - b.timestampMs);
  const startTimestampMs = detectDanceStartTimestamp(sorted);
  const trimmed = sorted
    .filter((frame) => frame.timestampMs >= startTimestampMs)
    .map((frame) => ({
      ...frame,
      timestampMs: frame.timestampMs - startTimestampMs,
    }));

  return {
    frames: trimmed.length > 0 ? trimmed : sorted,
    startTimestampMs,
  };
}

function isActiveFrame(frame: PoseFrame, previous: PoseFrame | null) {
  if (!previous) {
    return true;
  }
  return getLandmarkMotion(previous.landmarks, frame.landmarks) >= ACTIVE_FRAME_MOTION_THRESHOLD;
}

function getCameraFacingFactor(landmarks: PosePoint[]) {
  const leftShoulder = landmarks[POSE_LANDMARK_NAMES.leftShoulder];
  const rightShoulder = landmarks[POSE_LANDMARK_NAMES.rightShoulder];
  const leftHip = landmarks[POSE_LANDMARK_NAMES.leftHip];
  const rightHip = landmarks[POSE_LANDMARK_NAMES.rightHip];
  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) {
    return 1;
  }

  const shoulderDepthDelta = Math.abs((leftShoulder.z ?? 0) - (rightShoulder.z ?? 0));
  const hipDepthDelta = Math.abs((leftHip.z ?? 0) - (rightHip.z ?? 0));
  const averageDepthDelta = (shoulderDepthDelta + hipDepthDelta) / 2;

  // Higher depth delta means torso is more rotated relative to camera; reduce angular penalty accordingly.
  const compensation = 1 - Math.min(0.35, averageDepthDelta * 1.2);
  return Math.max(0.65, compensation);
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

function buildMotionSeries(frames: PoseFrame[]) {
  const points: Array<{ timestampMs: number; motion: number }> = [];
  for (let i = 1; i < frames.length; i += 1) {
    const prev = frames[i - 1];
    const cur = frames[i];
    if (!prev || !cur) {
      continue;
    }
    points.push({
      timestampMs: cur.timestampMs,
      motion: getLandmarkMotion(prev.landmarks, cur.landmarks),
    });
  }
  return points;
}

function getClosestMotion(targetTimestampMs: number, series: Array<{ timestampMs: number; motion: number }>) {
  let best: { timestampMs: number; motion: number } | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const point of series) {
    const distance = Math.abs(point.timestampMs - targetTimestampMs);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = point;
    }
  }
  if (!best || bestDistance > MATCH_TOLERANCE_MS) {
    return null;
  }
  return best.motion;
}

function getMotionEnergyOffset(referenceFrames: PoseFrame[], submissionFrames: PoseFrame[]) {
  const refSeries = buildMotionSeries(referenceFrames);
  const subSeries = buildMotionSeries(submissionFrames);
  if (refSeries.length === 0 || subSeries.length === 0) {
    return 0;
  }

  let bestOffset = 0;
  let bestCost = Number.POSITIVE_INFINITY;
  for (let offsetMs = -3000; offsetMs <= 3000; offsetMs += 100) {
    let totalCost = 0;
    let count = 0;
    for (const refPoint of refSeries) {
      const subMotion = getClosestMotion(refPoint.timestampMs + offsetMs, subSeries);
      if (subMotion === null) {
        continue;
      }
      totalCost += Math.abs(refPoint.motion - subMotion);
      count += 1;
    }
    if (count < 4) {
      continue;
    }
    const avgCost = totalCost / count;
    if (avgCost < bestCost) {
      bestCost = avgCost;
      bestOffset = offsetMs;
    }
  }
  return bestOffset;
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

    const referenceIndex = referenceFrames.findIndex((frame) => frame.timestampMs === referenceFrame.timestampMs);
    const submissionIndex = submissionFrames.findIndex((frame) => frame.timestampMs === submissionFrame.timestampMs);
    const previousReferenceFrame = referenceIndex > 0 ? referenceFrames[referenceIndex - 1] ?? null : null;
    const previousSubmissionFrame = submissionIndex > 0 ? submissionFrames[submissionIndex - 1] ?? null : null;
    const activePair =
      isActiveFrame(referenceFrame, previousReferenceFrame) && isActiveFrame(submissionFrame, previousSubmissionFrame);
    if (!activePair) {
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

function getBestAlignmentOffset(
  referenceFrames: PoseFrame[],
  submissionFrames: PoseFrame[],
  preferredOffsetMs?: number,
) {
  const energyOffset = getMotionEnergyOffset(referenceFrames, submissionFrames);
  const energyCandidates = Array.from({ length: 25 }, (_, index) => energyOffset - 1200 + index * 100);
  const preferredCandidates =
    typeof preferredOffsetMs === "number" && Number.isFinite(preferredOffsetMs)
      ? Array.from({ length: 41 }, (_, index) => Math.round(preferredOffsetMs - 2000 + index * 100))
      : [];
  const candidateOffsets = Array.from(
    new Set([...COARSE_OFFSET_CANDIDATES_MS, ...energyCandidates, ...preferredCandidates]),
  ).sort((a, b) => a - b);

  let bestCandidate = {
    offsetMs: 0,
    alignedFrameCount: 0,
    averageDelta: Number.POSITIVE_INFINITY,
  };

  for (const offsetMs of candidateOffsets) {
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

  const fineStart = bestCandidate.offsetMs - FINE_OFFSET_WINDOW_MS;
  const fineEnd = bestCandidate.offsetMs + FINE_OFFSET_WINDOW_MS;
  for (let offsetMs = fineStart; offsetMs <= fineEnd; offsetMs += FINE_OFFSET_STEP_MS) {
    const candidate = evaluateOffset(referenceFrames, submissionFrames, offsetMs);
    if (candidate.alignedFrameCount > bestCandidate.alignedFrameCount) {
      bestCandidate = candidate;
      continue;
    }
    if (
      candidate.alignedFrameCount === bestCandidate.alignedFrameCount
      && candidate.averageDelta < bestCandidate.averageDelta
    ) {
      bestCandidate = candidate;
    }
  }

  return bestCandidate;
}

function mirrorSubmissionFrames(frames: PoseFrame[]) {
  return frames.map((frame) => ({
    ...frame,
    landmarks: frame.landmarks.map((point) => ({
      ...point,
      x: 1 - point.x,
    })),
  }));
}

function mirrorAndSwapSubmissionFrames(frames: PoseFrame[]) {
  const swapPairs: Array<[number, number]> = [
    [POSE_LANDMARK_NAMES.leftShoulder, POSE_LANDMARK_NAMES.rightShoulder],
    [POSE_LANDMARK_NAMES.leftElbow, POSE_LANDMARK_NAMES.rightElbow],
    [POSE_LANDMARK_NAMES.leftWrist, POSE_LANDMARK_NAMES.rightWrist],
    [POSE_LANDMARK_NAMES.leftHip, POSE_LANDMARK_NAMES.rightHip],
    [POSE_LANDMARK_NAMES.leftKnee, POSE_LANDMARK_NAMES.rightKnee],
    [POSE_LANDMARK_NAMES.leftAnkle, POSE_LANDMARK_NAMES.rightAnkle],
  ];

  return frames.map((frame) => {
    const mirroredLandmarks = frame.landmarks.map((point) => ({
      ...point,
      x: 1 - point.x,
    }));
    for (const [leftIndex, rightIndex] of swapPairs) {
      const leftPoint = mirroredLandmarks[leftIndex];
      const rightPoint = mirroredLandmarks[rightIndex];
      if (!leftPoint || !rightPoint) {
        continue;
      }
      mirroredLandmarks[leftIndex] = rightPoint;
      mirroredLandmarks[rightIndex] = leftPoint;
    }
    return {
      ...frame,
      landmarks: mirroredLandmarks,
    };
  });
}

function comparePoseFramesCore(
  referenceFrames: PoseFrame[],
  submissionFrames: PoseFrame[],
  mirrorMode: "original" | "mirrored",
  options?: CompareOptions,
): PoseComparisonResult {
  const normalizedReference = normalizeFramesFromDanceStart(referenceFrames).frames;
  const normalizedSubmission = normalizeFramesFromDanceStart(submissionFrames).frames;
  const alignment = getBestAlignmentOffset(
    normalizedReference,
    normalizedSubmission,
    options?.preferredOffsetMs,
  );
  const issues: PoseIssue[] = [];
  let weightedDeltaSum = 0;
  let weightedJointCount = 0;
  let comparableJointSamples = 0;
  const latestIssueByJoint = new Map<string, number>();

  for (const referenceFrame of normalizedReference) {
    const submissionFrame = getClosestFrame(
      referenceFrame.timestampMs + alignment.offsetMs,
      normalizedSubmission,
    );

    if (!submissionFrame) {
      continue;
    }
    const referenceIndex = normalizedReference.findIndex((frame) => frame.timestampMs === referenceFrame.timestampMs);
    const submissionIndex = normalizedSubmission.findIndex((frame) => frame.timestampMs === submissionFrame.timestampMs);
    const previousReferenceFrame = referenceIndex > 0 ? normalizedReference[referenceIndex - 1] ?? null : null;
    const previousSubmissionFrame = submissionIndex > 0 ? normalizedSubmission[submissionIndex - 1] ?? null : null;
    const activePair =
      isActiveFrame(referenceFrame, previousReferenceFrame) && isActiveFrame(submissionFrame, previousSubmissionFrame);
    if (!activePair) {
      continue;
    }

    for (const definition of JOINT_DEFINITIONS) {
      const expectedAngle = getJointAngle(referenceFrame.landmarks, definition.points);
      const actualAngle = getJointAngle(submissionFrame.landmarks, definition.points);

      if (expectedAngle === null || actualAngle === null) {
        continue;
      }

      const rawDelta = Math.abs(expectedAngle - actualAngle);
      const cameraFactor = Math.min(
        getCameraFacingFactor(referenceFrame.landmarks),
        getCameraFacingFactor(submissionFrame.landmarks),
      );
      const delta = rawDelta * cameraFactor;
      weightedJointCount += definition.weight;
      weightedDeltaSum += delta * definition.weight;
      comparableJointSamples += 1;

      if (delta < VERY_MAJOR_THRESHOLD) {
        continue;
      }

      const lastIssueTimestamp = latestIssueByJoint.get(definition.jointName) ?? Number.NEGATIVE_INFINITY;
      if (referenceFrame.timestampMs - lastIssueTimestamp < 3000) {
        continue;
      }
      latestIssueByJoint.set(definition.jointName, referenceFrame.timestampMs);

      issues.push({
        timestampMs: referenceFrame.timestampMs,
        jointName: definition.jointName,
        severity: "major",
        expectedAngle: roundToTwoDecimals(expectedAngle),
        actualAngle: roundToTwoDecimals(actualAngle),
        delta: roundToTwoDecimals(delta),
        notes: buildCoachingNote(definition.jointName, expectedAngle, actualAngle),
      });
    }
  }

  const averageDelta =
    weightedJointCount === 0 ? 0 : roundToTwoDecimals(weightedDeltaSum / weightedJointCount);

  const totalJointCapacity = Math.max(1, comparableJointSamples);
  const issueRate = issues.length / totalJointCapacity;
  const issuePenalty = Math.min(24, issueRate * 160);
  const deltaPenalty = averageDelta * 1.05;
  const coveragePenalty =
    alignment.alignedFrameCount === 0
      ? 35
      : Math.max(0, normalizedReference.length - alignment.alignedFrameCount) * 0.75;
  const overallScore = Math.max(
    0,
    roundToTwoDecimals(100 - deltaPenalty - issuePenalty - coveragePenalty),
  );

  const shiftedReference = normalizedReference.map((frame) => ({
    ...frame,
    timestampMs: frame.timestampMs,
  }));
  const shiftedSubmission = normalizedSubmission.map((frame) => ({
    ...frame,
    timestampMs: frame.timestampMs - alignment.offsetMs,
  }));
  const minRefTs = shiftedReference.length > 0 ? shiftedReference[0]?.timestampMs ?? 0 : 0;
  const minSubTs =
    shiftedSubmission.length > 0
      ? shiftedSubmission.reduce((min, frame) => Math.min(min, frame.timestampMs), Number.POSITIVE_INFINITY)
      : 0;
  const minTimestamp = Math.min(minRefTs, minSubTs);
  const normalizationShift = minTimestamp < 0 ? Math.abs(minTimestamp) : 0;

  const alignedReferenceFrames = shiftedReference.map((frame) => ({
    ...frame,
    timestampMs: Math.max(0, Math.round(frame.timestampMs + normalizationShift)),
  }));
  const alignedSubmissionFrames = shiftedSubmission
    .map((frame) => ({
      ...frame,
      timestampMs: Math.round(frame.timestampMs + normalizationShift),
    }))
    .filter((frame) => frame.timestampMs >= 0);

  return {
    issues,
    overallScore,
    alignmentOffsetMs: alignment.offsetMs,
    alignedFrameCount: alignment.alignedFrameCount,
    averageDelta,
    mirrorMode,
    alignedReferenceFrames,
    alignedSubmissionFrames,
  };
}

export function comparePoseFrames(
  referenceFrames: PoseFrame[],
  submissionFrames: PoseFrame[],
  options?: CompareOptions,
): PoseComparisonResult {
  const original = comparePoseFramesCore(referenceFrames, submissionFrames, "original", options);
  const mirrored = comparePoseFramesCore(
    referenceFrames,
    mirrorSubmissionFrames(submissionFrames),
    "mirrored",
    options,
  );
  const mirroredSwap = comparePoseFramesCore(
    referenceFrames,
    mirrorAndSwapSubmissionFrames(submissionFrames),
    "mirrored",
    options,
  );
  const mirroredBest =
    mirroredSwap.overallScore > mirrored.overallScore || mirroredSwap.issues.length < mirrored.issues.length
      ? mirroredSwap
      : mirrored;

  if (mirroredBest.overallScore > original.overallScore + 4) {
    return mirroredBest;
  }
  if (
    mirroredBest.overallScore >= original.overallScore
    && mirroredBest.issues.length <= original.issues.length
  ) {
    return mirroredBest;
  }
  return original;
}
