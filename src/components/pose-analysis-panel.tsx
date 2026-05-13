"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DrawingUtils,
  FilesetResolver,
  PoseLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

import { comparePoseFrames, type PoseFrame } from "@/lib/pose";
import { isYouTubeUrl } from "@/lib/youtube";

const SAMPLE_INTERVAL_MS = 500;
const WASM_ROOT = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
const MODEL_ASSET_PATH =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

type PoseAnalysisPanelProps = {
  analysisId: string;
  referenceVideoUrl: string | null;
  submissionVideoUrl: string | null;
  existingIssueCount: number;
  autoRun?: boolean;
};

type Preview = {
  timestampMs: number;
  referenceImage: string;
  submissionImage: string;
};

function formatTimestampMs(timestampMs: number) {
  const totalSeconds = Math.max(0, Math.floor(timestampMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatOffsetMs(offsetMs: number) {
  const direction = offsetMs > 0 ? "submission behind" : offsetMs < 0 ? "submission ahead" : "synced";
  if (offsetMs === 0) {
    return direction;
  }
  return `${formatTimestampMs(Math.abs(offsetMs))} (${direction})`;
}

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

async function estimateAudioOffsetMs(referenceUrl: string, submissionUrl: string) {
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) {
    return null;
  }

  const [referenceResponse, submissionResponse] = await Promise.all([fetch(referenceUrl), fetch(submissionUrl)]);
  if (!referenceResponse.ok || !submissionResponse.ok) {
    return null;
  }

  const [referenceBytes, submissionBytes] = await Promise.all([
    referenceResponse.arrayBuffer(),
    submissionResponse.arrayBuffer(),
  ]);

  const audioContext = new AudioContextCtor();
  try {
    const [referenceBuffer, submissionBuffer] = await Promise.all([
      audioContext.decodeAudioData(referenceBytes.slice(0)),
      audioContext.decodeAudioData(submissionBytes.slice(0)),
    ]);

    const sampleRate = Math.min(referenceBuffer.sampleRate, submissionBuffer.sampleRate);
    const step = Math.max(1, Math.floor(sampleRate * 0.05)); // 50ms windows
    const maxLagWindows = Math.floor(3000 / 50); // +/- 3s

    const toMono = (buffer: AudioBuffer) => {
      const channel = buffer.numberOfChannels > 0 ? buffer.getChannelData(0) : new Float32Array(0);
      return channel;
    };

    const refMono = toMono(referenceBuffer);
    const subMono = toMono(submissionBuffer);

    const buildEnergy = (samples: Float32Array) => {
      const energy: number[] = [];
      for (let i = 0; i + step <= samples.length; i += step) {
        let sum = 0;
        for (let j = i; j < i + step; j += 1) {
          const sample = samples[j] ?? 0;
          sum += sample * sample;
        }
        energy.push(Math.sqrt(sum / step));
      }
      return energy;
    };

    const refEnergy = buildEnergy(refMono);
    const subEnergy = buildEnergy(subMono);
    if (refEnergy.length < 10 || subEnergy.length < 10) {
      return null;
    }

    let bestLag = 0;
    let bestCost = Number.POSITIVE_INFINITY;
    let secondBestCost = Number.POSITIVE_INFINITY;

    for (let lag = -maxLagWindows; lag <= maxLagWindows; lag += 1) {
      let total = 0;
      let count = 0;
      for (let i = 0; i < refEnergy.length; i += 1) {
        const j = i + lag;
        if (j < 0 || j >= subEnergy.length) {
          continue;
        }
        total += Math.abs((refEnergy[i] ?? 0) - (subEnergy[j] ?? 0));
        count += 1;
      }
      if (count < 20) {
        continue;
      }
      const avg = total / count;
      if (avg < bestCost) {
        secondBestCost = bestCost;
        bestCost = avg;
        bestLag = lag;
      } else if (avg < secondBestCost) {
        secondBestCost = avg;
      }
    }

    if (!Number.isFinite(bestCost)) {
      return null;
    }

    const separation =
      Number.isFinite(secondBestCost) && secondBestCost > 0
        ? Math.max(0, Math.min(1, (secondBestCost - bestCost) / secondBestCost))
        : 0;
    const confidence = Math.round((0.35 + separation * 0.65) * 100) / 100;

    // Positive means submission is later than reference.
    return {
      offsetMs: -bestLag * 50,
      confidence,
    };
  } catch {
    return null;
  } finally {
    void audioContext.close();
  }
}

async function samplePoseFrames(
  video: HTMLVideoElement,
  poseLandmarker: PoseLandmarker,
  previewCanvas: HTMLCanvasElement,
  inferenceTimestampBaseMs: number,
) {
  const frames: PoseFrame[] = [];
  const previews: Array<{ timestampMs: number; image: string }> = [];
  const maxDuration = Math.max(0, Math.floor(video.duration * 1000));

  for (let timestampMs = 0; timestampMs <= maxDuration; timestampMs += SAMPLE_INTERVAL_MS) {
    video.currentTime = timestampMs / 1000;
    await waitForEvent(video, "seeked");

    const result = poseLandmarker.detectForVideo(video, inferenceTimestampBaseMs + timestampMs);
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
  autoRun = false,
}: PoseAnalysisPanelProps) {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [issueCount, setIssueCount] = useState(existingIssueCount);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const hasAutoTriggeredRef = useRef(false);

  const isConfigured = useMemo(() => {
    return Boolean(referenceVideoUrl && submissionVideoUrl);
  }, [referenceVideoUrl, submissionVideoUrl]);

  async function runAnalysis() {
    if (!referenceVideoUrl || !submissionVideoUrl) {
      setError("Both videos must be available before analysis can run.");
      return;
    }
    if (isYouTubeUrl(referenceVideoUrl)) {
      setError(
        "YouTube references are currently view-only. Upload a file-based reference to run pose analysis.",
      );
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
        0,
      );
      const submissionResult = await samplePoseFrames(
        submissionResource.video,
        poseLandmarker,
        previewCanvas,
        Math.max(0, Math.floor(referenceResource.video.duration * 1000)) + SAMPLE_INTERVAL_MS,
      );

      const audioAlignment = await estimateAudioOffsetMs(referenceVideoUrl, submissionVideoUrl);
      const comparison = comparePoseFrames(referenceResult.frames, submissionResult.frames, {
        preferredOffsetMs: audioAlignment?.offsetMs,
        preferredOffsetConfidence: audioAlignment?.confidence,
      });
      const mirrorNote =
        comparison.mirrorMode === "mirrored"
          ? " Mirror orientation was detected and auto-corrected during alignment."
          : "";
      const audioNote =
        audioAlignment === null
          ? ""
          : ` Audio correlation suggested ${formatOffsetMs(audioAlignment.offsetMs)} (confidence ${Math.round(
              audioAlignment.confidence * 100,
            )}%).`;
      const nextSummary =
        comparison.issues.length === 0
          ? `MirrorMe aligned the clips with ${formatOffsetMs(comparison.alignmentOffsetMs)} and did not flag any critical joint-angle mismatches in ${comparison.alignedFrameCount} sampled frames.${mirrorNote}${audioNote}`
          : `MirrorMe aligned the clips with ${formatOffsetMs(comparison.alignmentOffsetMs)}, compared ${comparison.alignedFrameCount} sampled frames, and flagged ${comparison.issues.length} critical issue${comparison.issues.length === 1 ? "" : "s"} with an average weighted joint delta of ${comparison.averageDelta} degrees.${mirrorNote}${audioNote}`;

      const processResponse = await fetch(`/api/analyses/${analysisId}/process`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          referenceFrames: comparison.alignedReferenceFrames,
          submissionFrames: comparison.alignedSubmissionFrames,
          issues: comparison.issues,
          overallScore: comparison.overallScore,
          summary: nextSummary,
        }),
      });
      const processPayload = (await processResponse.json()) as { error?: string };

      if (!processResponse.ok) {
        throw new Error(processPayload.error ?? "Failed to process analysis.");
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
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Pose analysis failed.");
    } finally {
      referenceResource?.dispose();
      submissionResource?.dispose();
      setIsRunning(false);
    }
  }

  useEffect(() => {
    if (
      autoRun
      && !hasAutoTriggeredRef.current
      && !isRunning
      && isConfigured
      && referenceVideoUrl
      && !isYouTubeUrl(referenceVideoUrl)
    ) {
      hasAutoTriggeredRef.current = true;
      void runAnalysis();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, isRunning, isConfigured, referenceVideoUrl]);

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
            This samples the full duration of both videos at 0.5-second intervals, computes
            weighted joint-angle differences, stores frames and issues, and updates the analysis record.
          </p>
        </div>

        <button
          type="button"
          onClick={runAnalysis}
          disabled={!isConfigured || isRunning || isYouTubeUrl(referenceVideoUrl)}
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
          <p className="mt-2 text-sm font-medium text-slate-200">Entire clip, every 0.5s</p>
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
                {formatTimestampMs(preview.timestampMs)}
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
