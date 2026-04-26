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

const JOINT_DEFINITIONS = [
  {
    jointName: "left_elbow",
    points: [
      POSE_LANDMARK_NAMES.leftShoulder,
      POSE_LANDMARK_NAMES.leftElbow,
      POSE_LANDMARK_NAMES.leftWrist,
    ],
  },
  {
    jointName: "right_elbow",
    points: [
      POSE_LANDMARK_NAMES.rightShoulder,
      POSE_LANDMARK_NAMES.rightElbow,
      POSE_LANDMARK_NAMES.rightWrist,
    ],
  },
  {
    jointName: "left_shoulder",
    points: [
      POSE_LANDMARK_NAMES.leftHip,
      POSE_LANDMARK_NAMES.leftShoulder,
      POSE_LANDMARK_NAMES.leftElbow,
    ],
  },
  {
    jointName: "right_shoulder",
    points: [
      POSE_LANDMARK_NAMES.rightHip,
      POSE_LANDMARK_NAMES.rightShoulder,
      POSE_LANDMARK_NAMES.rightElbow,
    ],
  },
  {
    jointName: "left_knee",
    points: [
      POSE_LANDMARK_NAMES.leftHip,
      POSE_LANDMARK_NAMES.leftKnee,
      POSE_LANDMARK_NAMES.leftAnkle,
    ],
  },
  {
    jointName: "right_knee",
    points: [
      POSE_LANDMARK_NAMES.rightHip,
      POSE_LANDMARK_NAMES.rightKnee,
      POSE_LANDMARK_NAMES.rightAnkle,
    ],
  },
];

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

export function comparePoseFrames(referenceFrames: PoseFrame[], submissionFrames: PoseFrame[]) {
  const issues: PoseIssue[] = [];

  for (const referenceFrame of referenceFrames) {
    const submissionFrame = submissionFrames.find(
      (frame) => frame.timestampMs === referenceFrame.timestampMs,
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

      if (delta < 15) {
        continue;
      }

      issues.push({
        timestampMs: referenceFrame.timestampMs,
        jointName: definition.jointName,
        severity: delta >= 30 ? "major" : "minor",
        expectedAngle: roundToTwoDecimals(expectedAngle),
        actualAngle: roundToTwoDecimals(actualAngle),
        delta: roundToTwoDecimals(delta),
        notes:
          delta >= 30
            ? "Joint angle diverges substantially from the reference."
            : "Joint angle is drifting outside the target range.",
      });
    }
  }

  return issues;
}

export function scorePoseComparison(issues: PoseIssue[]) {
  const penalty = issues.reduce((sum, issue) => {
    return sum + (issue.severity === "major" ? 12 : 5);
  }, 0);

  return Math.max(0, roundToTwoDecimals(100 - penalty));
}
