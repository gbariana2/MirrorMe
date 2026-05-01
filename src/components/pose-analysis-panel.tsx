"use client";

import { useMemo, useState } from "react";
import {
  DrawingUtils,
  FilesetResolver,
  PoseLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

import { comparePoseFrames, type PoseFrame } from "@/lib/pose";

const SAMPLE_INTERVAL_MS = 1000;
const MAX_ANALYSIS_DURATION_MS = 10000;
const WASM_ROOT = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
const MODEL_ASSET_PATH =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

type PoseAnalysisPanelProps = {
  analysisId: string;
  referenceVideoUrl: string | null;
  submissionVideoUrl: string | null;
  existingIssueCount: number;
};

type Preview = {
  timestampMs: number;
  referenceImage: string;
  submissionImage: string;
};

function waitForEvent(target: HTMLMediaElement, eventName: "loadeddata" | "seeked") {
  return new Promise<void>((resolve, reject) => {
    const handleSuccess = () => {
      cleanup();
      resolve();
    };

    const handleError = () => {
      cleanup();
      reject(new Error(`Video event failed: ${eventName}`));
    };

    function cleanup() {
      target.removeEventListener(eventName, handleSuccess);
      target.removeEventListener("error", handleError);
    }

    target.addEventListener(eventName, handleSuccess, { once: true });
    target.addEventListener("error", handleError, { once: true });
  });
}

async function createVideoElement(url: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch video asset: ${response.statusText}`);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = objectUrl;

  await waitForEvent(video, "loadeddata");

  return {
    video,
    dispose() {
      URL.revokeObjectURL(objectUrl);
    },
  };
}

function drawPosePreview(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  landmarks: NormalizedLandmark[],
) {
  const context = canvas.getContext("2d");

  if (!context) {
    return "";
  }

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  const drawingUtils = new DrawingUtils(context);
  drawingUtils.drawLandmarks(landmarks, {
    color: "#f97316",
    fillColor: "#f97316",
    lineWidth: 2,
    radius: 3,
  });
  drawingUtils.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, {
    color: "#ea580c",
    lineWidth: 2,
  });

  return canvas.toDataURL("image/jpeg", 0.8);
}

async function samplePoseFrames(
  video: HTMLVideoElement,
  poseLandmarker: PoseLandmarker,
  previewCanvas: HTMLCanvasElement,
) {
  const frames: PoseFrame[] = [];
  const previews: Array<{ timestampMs: number; image: string }> = [];
  const maxDuration = Math.min(video.duration * 1000, MAX_ANALYSIS_DURATION_MS);

  for (let timestampMs = 0; timestampMs <= maxDuration; timestampMs += SAMPLE_INTERVAL_MS) {
    video.currentTime = timestampMs / 1000;
    await waitForEvent(video, "seeked");

    const result = poseLandmarker.detectForVideo(video, timestampMs);
    const landmarks = result.landmarks[0];

    if (!landmarks) {
      continue;
    }

    frames.push({
      timestampMs,
      landmarks: landmarks.map((point) => ({
        x: point.x,
        y: point.y,
        z: point.z,
        visibility: point.visibility,
      })),
    });

    if (previews.length < 4) {
      previews.push({
        timestampMs,
        image: drawPosePreview(previewCanvas, video, landmarks),
      });
    }
  }

  return { frames, previews };
}

export function PoseAnalysisPanel({
  analysisId,
  referenceVideoUrl,
  submissionVideoUrl,
  existingIssueCount,
}: PoseAnalysisPanelProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [issueCount, setIssueCount] = useState(existingIssueCount);
  const [previews, setPreviews] = useState<Preview[]>([]);

  const isConfigured = useMemo(() => {
    return Boolean(referenceVideoUrl && submissionVideoUrl);
  }, [referenceVideoUrl, submissionVideoUrl]);

  async function runAnalysis() {
    if (!referenceVideoUrl || !submissionVideoUrl) {
      setError("Both videos must be available before analysis can run.");
      return;
    }

    setIsRunning(true);
    setError(null);

    let referenceResource: Awaited<ReturnType<typeof createVideoElement>> | null = null;
    let submissionResource: Awaited<ReturnType<typeof createVideoElement>> | null = null;

    try {
      const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
      const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_ASSET_PATH,
        },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      referenceResource = await createVideoElement(referenceVideoUrl);
      submissionResource = await createVideoElement(submissionVideoUrl);

      const previewCanvas = document.createElement("canvas");
      const referenceResult = await samplePoseFrames(
        referenceResource.video,
        poseLandmarker,
        previewCanvas,
      );
      const submissionResult = await samplePoseFrames(
        submissionResource.video,
        poseLandmarker,
        previewCanvas,
      );

      const comparison = comparePoseFrames(referenceResult.frames, submissionResult.frames);
      const nextSummary =
        comparison.issues.length === 0
          ? `MirrorMe aligned the clips with a ${comparison.alignmentOffsetMs} ms offset and did not flag any major joint-angle mismatches in ${comparison.alignedFrameCount} sampled frames.`
          : `MirrorMe aligned the clips with a ${comparison.alignmentOffsetMs} ms offset, compared ${comparison.alignedFrameCount} sampled frames, and flagged ${comparison.issues.length} issue${comparison.issues.length === 1 ? "" : "s"} with an average weighted joint delta of ${comparison.averageDelta} degrees.`;

      const enqueueResponse = await fetch(`/api/analyses/${analysisId}/enqueue`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          referenceFrames: referenceResult.frames,
          submissionFrames: submissionResult.frames,
          issues: comparison.issues,
          overallScore: comparison.overallScore,
          summary: nextSummary,
        }),
      });

      const enqueuePayload = (await enqueueResponse.json()) as { error?: string };

      if (!enqueueResponse.ok) {
        throw new Error(enqueuePayload.error ?? "Failed to enqueue analysis.");
      }

      const processResponse = await fetch("/api/internal/analysis-jobs/process-next", {
        method: "POST",
      });
      const processPayload = (await processResponse.json()) as { error?: string };

      if (!processResponse.ok) {
        throw new Error(processPayload.error ?? "Failed to process analysis job.");
      }

      const mergedPreviews = referenceResult.previews.map((referencePreview, index) => ({
        timestampMs: referencePreview.timestampMs,
        referenceImage: referencePreview.image,
        submissionImage: submissionResult.previews[index]?.image ?? "",
      }));

      setPreviews(mergedPreviews);
      setIssueCount(comparison.issues.length);
      setScore(comparison.overallScore);
      setSummary(nextSummary);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Pose analysis failed.");
    } finally {
      referenceResource?.dispose();
      submissionResource?.dispose();
      setIsRunning(false);
    }
  }

  return (
    <section className="rounded-[2rem] border border-white/15 soft-panel p-6 shadow-[0_20px_70px_rgba(0,0,0,0.55)] sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#8fd4ff]">
            Pose Analysis
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-white">
            Run the first MediaPipe comparison pass
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
            This samples the first 10 seconds of both videos, computes a small set of joint
            angles, stores the resulting frames and issues, and updates the analysis record.
          </p>
        </div>

        <button
          type="button"
          onClick={runAnalysis}
          disabled={!isConfigured || isRunning}
          className="rounded-full bg-[#2fa8ff] px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_10px_20px_rgba(47,168,255,0.35)] transition hover:bg-[#66c2ff] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRunning ? "Analyzing..." : "Run pose analysis"}
        </button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-white/15 bg-[#161922] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Stored issues</p>
          <p className="mt-2 text-3xl font-semibold text-white">{issueCount}</p>
        </div>
        <div className="rounded-2xl border border-white/15 bg-[#161922] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Latest score</p>
          <p className="mt-2 text-3xl font-semibold text-white">
            {score === null ? "--" : score}
          </p>
        </div>
        <div className="rounded-2xl border border-white/15 bg-[#161922] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Sampling window</p>
          <p className="mt-2 text-sm font-medium text-slate-200">0s to 10s, every 1s</p>
        </div>
      </div>

      {summary ? (
        <div className="mt-6 rounded-2xl border border-emerald-300/35 bg-emerald-500/10 px-4 py-4 text-sm leading-6 text-emerald-200">
          {summary}
        </div>
      ) : null}

      {error ? (
        <div className="mt-6 rounded-2xl border border-rose-400/40 bg-rose-500/15 px-4 py-4 text-sm leading-6 text-rose-200">
          {error}
        </div>
      ) : null}

      {previews.length > 0 ? (
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          {previews.map((preview) => (
            <div
              key={preview.timestampMs}
              className="rounded-2xl border border-white/15 bg-[#161922] p-4"
            >
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                {preview.timestampMs} ms
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {/* These preview images are generated client-side from canvas snapshots. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview.referenceImage}
                  alt={`Reference pose preview at ${preview.timestampMs} ms`}
                  className="aspect-video w-full rounded-xl object-cover"
                />
                {/* These preview images are generated client-side from canvas snapshots. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview.submissionImage}
                  alt={`Submission pose preview at ${preview.timestampMs} ms`}
                  className="aspect-video w-full rounded-xl object-cover"
                />
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
