"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Landmark = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
};

type Issue = {
  id: string;
  timestampMs: number;
  jointName: string;
  severity: "major";
  notes: string | null;
};

type FramePayload = {
  timestampMs: number;
  referenceLandmarks: Landmark[];
  submissionLandmarks: Landmark[];
};

type Props = {
  analysisId: string;
  issues: Issue[];
  referenceVideoUrl: string | null;
  submissionVideoUrl: string | null;
};

const JOINTS = {
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

const CONNECTIONS: Array<[number, number]> = [
  [JOINTS.leftShoulder, JOINTS.rightShoulder],
  [JOINTS.leftShoulder, JOINTS.leftElbow],
  [JOINTS.leftElbow, JOINTS.leftWrist],
  [JOINTS.rightShoulder, JOINTS.rightElbow],
  [JOINTS.rightElbow, JOINTS.rightWrist],
  [JOINTS.leftShoulder, JOINTS.leftHip],
  [JOINTS.rightShoulder, JOINTS.rightHip],
  [JOINTS.leftHip, JOINTS.rightHip],
  [JOINTS.leftHip, JOINTS.leftKnee],
  [JOINTS.leftKnee, JOINTS.leftAnkle],
  [JOINTS.rightHip, JOINTS.rightKnee],
  [JOINTS.rightKnee, JOINTS.rightAnkle],
];

const JOINT_DEFS: Array<{ key: string; points: [number, number, number] }> = [
  { key: "left_elbow", points: [JOINTS.leftShoulder, JOINTS.leftElbow, JOINTS.leftWrist] },
  { key: "right_elbow", points: [JOINTS.rightShoulder, JOINTS.rightElbow, JOINTS.rightWrist] },
  { key: "left_shoulder", points: [JOINTS.leftHip, JOINTS.leftShoulder, JOINTS.leftElbow] },
  { key: "right_shoulder", points: [JOINTS.rightHip, JOINTS.rightShoulder, JOINTS.rightElbow] },
  { key: "left_knee", points: [JOINTS.leftHip, JOINTS.leftKnee, JOINTS.leftAnkle] },
  { key: "right_knee", points: [JOINTS.rightHip, JOINTS.rightKnee, JOINTS.rightAnkle] },
];

function formatTimestampMs(timestampMs: number) {
  const totalSeconds = Math.max(0, Math.floor(timestampMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatJointName(jointName: string) {
  return jointName
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isVisible(point: Landmark | undefined) {
  return Boolean(point && (point.visibility ?? 1) >= 0.5);
}

function getAngle(points: [Landmark, Landmark, Landmark]) {
  const [first, middle, last] = points;
  const ab = { x: first.x - middle.x, y: first.y - middle.y };
  const cb = { x: last.x - middle.x, y: last.y - middle.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const magAB = Math.hypot(ab.x, ab.y);
  const magCB = Math.hypot(cb.x, cb.y);
  if (magAB === 0 || magCB === 0) {
    return null;
  }
  const cosine = Math.min(1, Math.max(-1, dot / (magAB * magCB)));
  return (Math.acos(cosine) * 180) / Math.PI;
}

function getBadJointKeys(reference: Landmark[], submission: Landmark[]) {
  const badKeys = new Set<string>();
  for (const joint of JOINT_DEFS) {
    const refPoints = joint.points.map((idx) => reference[idx]) as [Landmark, Landmark, Landmark];
    const subPoints = joint.points.map((idx) => submission[idx]) as [Landmark, Landmark, Landmark];
    if (!refPoints.every(isVisible) || !subPoints.every(isVisible)) {
      continue;
    }
    const refAngle = getAngle(refPoints);
    const subAngle = getAngle(subPoints);
    if (refAngle === null || subAngle === null) {
      continue;
    }
    if (Math.abs(refAngle - subAngle) >= 60) {
      badKeys.add(joint.key);
    }
  }
  return badKeys;
}

function getRedPointIndexes(badKeys: Set<string>) {
  const indexes = new Set<number>();
  for (const joint of JOINT_DEFS) {
    if (!badKeys.has(joint.key)) {
      continue;
    }
    for (const idx of joint.points) {
      indexes.add(idx);
    }
  }
  return indexes;
}

function drawPose(
  canvas: HTMLCanvasElement,
  landmarks: Landmark[],
  redPointIndexes: Set<number>,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  // Draw connectors first.
  for (const [from, to] of CONNECTIONS) {
    const a = landmarks[from];
    const b = landmarks[to];
    if (!isVisible(a) || !isVisible(b)) {
      continue;
    }
    const isRed = redPointIndexes.has(from) || redPointIndexes.has(to);
    ctx.strokeStyle = isRed ? "#ef4444" : "#22c55e";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(a.x * width, a.y * height);
    ctx.lineTo(b.x * width, b.y * height);
    ctx.stroke();
  }

  // Draw pivot points.
  landmarks.forEach((point, index) => {
    if (!isVisible(point)) {
      return;
    }
    ctx.fillStyle = redPointIndexes.has(index) ? "#ef4444" : "#22c55e";
    ctx.beginPath();
    ctx.arc(point.x * width, point.y * height, 4, 0, Math.PI * 2);
    ctx.fill();
  });
}

export function IssueSideBySide({
  analysisId,
  issues,
  referenceVideoUrl,
  submissionVideoUrl,
}: Props) {
  const [activeIssue, setActiveIssue] = useState<Issue | null>(null);
  const [frameData, setFrameData] = useState<FramePayload | null>(null);
  const [frameError, setFrameError] = useState<string | null>(null);
  const [isFrameLoading, setIsFrameLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const referenceRef = useRef<HTMLVideoElement | null>(null);
  const submissionRef = useRef<HTMLVideoElement | null>(null);
  const referenceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const submissionCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!activeIssue) {
      return;
    }

    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    const targetTimeSeconds = activeIssue.timestampMs / 1000;
    const setVideoTime = (video: HTMLVideoElement | null) => {
      if (!video) {
        return;
      }
      const seek = () => {
        try {
          video.currentTime = targetTimeSeconds;
        } catch {
          // noop
        }
      };
      if (video.readyState >= 1) {
        seek();
      } else {
        video.addEventListener("loadedmetadata", seek, { once: true });
      }
    };

    setVideoTime(referenceRef.current);
    setVideoTime(submissionRef.current);

    const controller = new AbortController();
    fetch(`/api/analyses/${analysisId}/frame?timestampMs=${activeIssue.timestampMs}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as FramePayload | { error: string };
        if (!response.ok || "error" in payload) {
          throw new Error("error" in payload ? payload.error : "Failed to load frame data.");
        }
        setFrameData(payload);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setFrameError(error instanceof Error ? error.message : "Failed to load frame data.");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsFrameLoading(false);
        }
      });

    return () => controller.abort();
  }, [activeIssue, analysisId]);

  const badJointKeys = useMemo(() => {
    if (!frameData) {
      return new Set<string>();
    }
    return getBadJointKeys(frameData.referenceLandmarks, frameData.submissionLandmarks);
  }, [frameData]);

  const redPointIndexes = useMemo(() => getRedPointIndexes(badJointKeys), [badJointKeys]);

  useEffect(() => {
    if (!frameData) {
      return;
    }
    if (referenceCanvasRef.current) {
      drawPose(referenceCanvasRef.current, frameData.referenceLandmarks, redPointIndexes);
    }
    if (submissionCanvasRef.current) {
      drawPose(submissionCanvasRef.current, frameData.submissionLandmarks, redPointIndexes);
    }
  }, [frameData, redPointIndexes]);

  return (
    <section className="rounded-[2rem] border border-white/15 soft-panel p-6 shadow-[0_20px_70px_rgba(0,0,0,0.55)] sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#8fd4ff]">Critical Flags</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-white">Very major deviations</h2>

      {issues.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-white/25 bg-[#161922] p-5 text-sm text-slate-300">
          No critical mismatches were flagged.
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {issues.map((issue) => (
            <article key={issue.id} className="rounded-2xl border border-white/15 bg-[#161922] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{formatJointName(issue.jointName)}</p>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                    {formatTimestampMs(issue.timestampMs)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFrameData(null);
                    setFrameError(null);
                    setIsFrameLoading(true);
                    setActiveIssue(issue);
                  }}
                  className="rounded-full border border-[#8fd4ff]/55 px-3 py-1 text-xs font-semibold text-[#8fd4ff]"
                >
                  View side-by-side
                </button>
              </div>
              {issue.notes ? <p className="mt-2 text-sm text-slate-300">{issue.notes}</p> : null}
            </article>
          ))}
        </div>
      )}

      {activeIssue ? (
        <div ref={panelRef} className="mt-6 rounded-2xl border border-white/15 bg-[#121527] p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-white">
              Side-by-side at {formatTimestampMs(activeIssue.timestampMs)}
            </p>
            <button
              type="button"
              onClick={() => {
                setActiveIssue(null);
                setFrameData(null);
                setFrameError(null);
                setIsFrameLoading(false);
              }}
              className="text-xs font-semibold text-[#8fd4ff] underline"
            >
              Close
            </button>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <video ref={referenceRef} src={referenceVideoUrl ?? undefined} controls className="w-full rounded-xl" />
            <video ref={submissionRef} src={submissionVideoUrl ?? undefined} controls className="w-full rounded-xl" />
          </div>

          <div className="mt-4 rounded-xl border border-white/15 bg-[#101625] p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Pose Map</p>
            <p className="mt-1 text-xs text-slate-400">Green = relatively aligned. Red = high deviation pivots/connectors.</p>
            {isFrameLoading ? <p className="mt-2 text-xs text-slate-300">Loading pose frame...</p> : null}
            {frameError ? <p className="mt-2 text-xs text-rose-300">{frameError}</p> : null}
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <canvas ref={referenceCanvasRef} width={360} height={240} className="w-full rounded-lg bg-[#0a1020]" />
              <canvas ref={submissionCanvasRef} width={360} height={240} className="w-full rounded-lg bg-[#0a1020]" />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
