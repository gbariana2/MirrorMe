"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Landmark = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
};

type TimelineFrame = {
  timestampMs: number;
  referenceLandmarks: Landmark[];
  submissionLandmarks: Landmark[];
};

type Props = {
  analysisId: string;
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

const JOINT_DEFS: Array<{ points: [number, number, number] }> = [
  { points: [JOINTS.leftShoulder, JOINTS.leftElbow, JOINTS.leftWrist] },
  { points: [JOINTS.rightShoulder, JOINTS.rightElbow, JOINTS.rightWrist] },
  { points: [JOINTS.leftHip, JOINTS.leftShoulder, JOINTS.leftElbow] },
  { points: [JOINTS.rightHip, JOINTS.rightShoulder, JOINTS.rightElbow] },
  { points: [JOINTS.leftHip, JOINTS.leftKnee, JOINTS.leftAnkle] },
  { points: [JOINTS.rightHip, JOINTS.rightKnee, JOINTS.rightAnkle] },
];

const ISSUE_THRESHOLD_DEGREES = 60;

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

function getRedPointIndexes(reference: Landmark[], submission: Landmark[]) {
  const red = new Set<number>();
  for (const joint of JOINT_DEFS) {
    const ref = joint.points.map((idx) => reference[idx]) as [Landmark, Landmark, Landmark];
    const sub = joint.points.map((idx) => submission[idx]) as [Landmark, Landmark, Landmark];
    if (!ref.every(isVisible) || !sub.every(isVisible)) {
      continue;
    }
    const refAngle = getAngle(ref);
    const subAngle = getAngle(sub);
    if (refAngle === null || subAngle === null) {
      continue;
    }
    if (Math.abs(refAngle - subAngle) >= ISSUE_THRESHOLD_DEGREES) {
      for (const pointIndex of joint.points) {
        red.add(pointIndex);
      }
    }
  }
  return red;
}

function drawOverlay(
  canvas: HTMLCanvasElement,
  landmarks: Landmark[],
  redPointIndexes: Set<number>,
  width: number,
  height: number,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  canvas.width = width;
  canvas.height = height;
  ctx.clearRect(0, 0, width, height);

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

function findNearestFrame(frames: TimelineFrame[], timestampMs: number) {
  let best: TimelineFrame | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const frame of frames) {
    const distance = Math.abs(frame.timestampMs - timestampMs);
    if (distance < bestDistance) {
      best = frame;
      bestDistance = distance;
    }
  }
  return best;
}

export function FullPlaybackComparison({ analysisId, referenceVideoUrl, submissionVideoUrl }: Props) {
  const [frames, setFrames] = useState<TimelineFrame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSyncedPlaying, setIsSyncedPlaying] = useState(false);

  const referenceVideoRef = useRef<HTMLVideoElement | null>(null);
  const submissionVideoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const syncingRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch(`/api/analyses/${analysisId}/timeline`, { signal: controller.signal });
        const payload = (await response.json()) as { frames?: TimelineFrame[]; error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to load analysis timeline.");
        }
        setFrames(payload.frames ?? []);
      } catch (caughtError) {
        if (controller.signal.aborted) {
          return;
        }
        setError(caughtError instanceof Error ? caughtError.message : "Failed to load analysis timeline.");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    })();
    return () => controller.abort();
  }, [analysisId]);

  const canRender = useMemo(
    () => Boolean(referenceVideoUrl && submissionVideoUrl && frames.length > 0),
    [referenceVideoUrl, submissionVideoUrl, frames.length],
  );

  const syncReferenceTime = useCallback(() => {
    const reference = referenceVideoRef.current;
    const submission = submissionVideoRef.current;
    if (!reference || !submission) {
      return;
    }
    if (syncingRef.current) {
      return;
    }
    syncingRef.current = true;
    reference.currentTime = submission.currentTime;
    syncingRef.current = false;
  }, []);

  const updateOverlayFromCurrentTime = useCallback(() => {
    const submission = submissionVideoRef.current;
    const canvas = overlayCanvasRef.current;
    if (!submission || !canvas || frames.length === 0) {
      return;
    }

    const nearest = findNearestFrame(frames, submission.currentTime * 1000);
    if (!nearest) {
      return;
    }

    const redPointIndexes = getRedPointIndexes(nearest.referenceLandmarks, nearest.submissionLandmarks);
    const width = Math.max(320, Math.floor(submission.clientWidth || submission.videoWidth || 640));
    const height = Math.max(180, Math.floor(submission.clientHeight || submission.videoHeight || 360));
    drawOverlay(canvas, nearest.submissionLandmarks, redPointIndexes, width, height);
  }, [frames]);

  async function toggleSyncedPlayback() {
    const reference = referenceVideoRef.current;
    const submission = submissionVideoRef.current;
    if (!reference || !submission) {
      return;
    }

    if (isSyncedPlaying) {
      reference.pause();
      submission.pause();
      setIsSyncedPlaying(false);
      return;
    }

    reference.currentTime = submission.currentTime;
    await Promise.allSettled([reference.play(), submission.play()]);
    setIsSyncedPlaying(true);
  }

  useEffect(() => {
    const submission = submissionVideoRef.current;
    if (!submission) {
      return;
    }

    let rafId = 0;
    const onPlay = () => {
      const tick = () => {
        syncReferenceTime();
        updateOverlayFromCurrentTime();
        if (!submission.paused) {
          rafId = window.requestAnimationFrame(tick);
        }
      };
      tick();
    };
    const onPause = () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      setIsSyncedPlaying(false);
    };
    const onSeeked = () => {
      syncReferenceTime();
      updateOverlayFromCurrentTime();
    };

    const onLoadedMetadata = () => {
      updateOverlayFromCurrentTime();
    };

    submission.addEventListener("play", onPlay);
    submission.addEventListener("pause", onPause);
    submission.addEventListener("seeked", onSeeked);
    submission.addEventListener("loadedmetadata", onLoadedMetadata);

    updateOverlayFromCurrentTime();

    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      submission.removeEventListener("play", onPlay);
      submission.removeEventListener("pause", onPause);
      submission.removeEventListener("seeked", onSeeked);
      submission.removeEventListener("loadedmetadata", onLoadedMetadata);
    };
  }, [frames, syncReferenceTime, updateOverlayFromCurrentTime]);

  return (
    <section className="rounded-[2rem] border border-white/15 soft-panel p-6 shadow-[0_20px_70px_rgba(0,0,0,0.55)] sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#8fd4ff]">Full Playback</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-white">Synced side-by-side with live submission overlay</h2>
      <p className="mt-3 text-sm text-slate-300">
        Submission skeleton colors update over time. Green means relatively aligned at current playback moment; red indicates a major deviation.
      </p>

      {loading ? <p className="mt-4 text-sm text-slate-300">Loading timeline...</p> : null}
      {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}
      {!loading && !error && !canRender ? (
        <p className="mt-4 text-sm text-slate-300">Timeline or videos are unavailable for this analysis.</p>
      ) : null}

      {canRender ? (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                void toggleSyncedPlayback();
              }}
              className="rounded-full border border-white/25 px-3 py-1 text-xs font-semibold text-slate-200"
            >
              {isSyncedPlaying ? "Pause Both" : "Play Both (Synced)"}
            </button>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <video
              ref={referenceVideoRef}
              src={referenceVideoUrl ?? undefined}
              controls
              muted
              className="w-full rounded-xl"
            />
            <div className="relative">
              <video
                ref={submissionVideoRef}
                src={submissionVideoUrl ?? undefined}
                controls
                muted
                className="w-full rounded-xl"
              />
              <canvas
                ref={overlayCanvasRef}
                className="pointer-events-none absolute inset-0 h-full w-full rounded-xl"
              />
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
