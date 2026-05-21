"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
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
type SyncDiagnostics = {
  confidence: number;
  method: "pose_weighted" | "pose_only";
  selectedOffsetMs: number;
  candidates: Array<{
    offsetMs: number;
    alignedFrameCount: number;
    averageDelta: number;
    score: number;
  }>;
} | null;

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

type AudioAlignment = {
  offsetMs: number;
  confidence: number;
  method: "hybrid" | "correlation" | "onset";
};

function percentile(sortedValues: number[], ratio: number) {
  if (sortedValues.length === 0) {
    return 0;
  }
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.floor(ratio * sortedValues.length)));
  return sortedValues[index] ?? 0;
}

function buildRmsEnvelope(samples: Float32Array, sampleRate: number, windowMs: number, hopMs: number) {
  const windowSize = Math.max(16, Math.floor((sampleRate * windowMs) / 1000));
  const hopSize = Math.max(8, Math.floor((sampleRate * hopMs) / 1000));
  const envelope: number[] = [];
  for (let start = 0; start + windowSize <= samples.length; start += hopSize) {
    let sum = 0;
    for (let i = start; i < start + windowSize; i += 1) {
      const value = samples[i] ?? 0;
      sum += value * value;
    }
    envelope.push(Math.sqrt(sum / windowSize));
  }
  return envelope;
}

function zNormalize(values: number[]) {
  if (values.length === 0) {
    return values;
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);
  if (std <= 1e-6) {
    return values.map(() => 0);
  }
  return values.map((value) => (value - mean) / std);
}

function findOnsetOffsetMs(referenceEnvelope: number[], submissionEnvelope: number[], hopMs: number) {
  const detectOnsetIndex = (series: number[]) => {
    if (series.length < 6) {
      return null;
    }
    const sorted = [...series].sort((a, b) => a - b);
    const median = percentile(sorted, 0.5);
    const p90 = percentile(sorted, 0.9);
    const threshold = median + (p90 - median) * 0.35;
    let streak = 0;
    for (let i = 0; i < series.length; i += 1) {
      if ((series[i] ?? 0) >= threshold) {
        streak += 1;
        if (streak >= 4) {
          return i - 3;
        }
      } else {
        streak = 0;
      }
    }
    return null;
  };

  const refOnset = detectOnsetIndex(referenceEnvelope);
  const subOnset = detectOnsetIndex(submissionEnvelope);
  if (refOnset === null || subOnset === null) {
    return null;
  }
  const offsetMs = (subOnset - refOnset) * hopMs;
  return {
    offsetMs,
    confidence: 0.6,
  };
}

function findCorrelationOffsetMs(referenceEnvelope: number[], submissionEnvelope: number[], hopMs: number) {
  const normalizedReference = zNormalize(referenceEnvelope);
  const normalizedSubmission = zNormalize(submissionEnvelope);
  if (normalizedReference.length < 20 || normalizedSubmission.length < 20) {
    return null;
  }

  const maxLagSteps = Math.floor(3000 / hopMs);
  let bestLag = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  let secondBest = Number.NEGATIVE_INFINITY;

  for (let lag = -maxLagSteps; lag <= maxLagSteps; lag += 1) {
    let dot = 0;
    let refNorm = 0;
    let subNorm = 0;
    let count = 0;
    for (let i = 0; i < normalizedReference.length; i += 1) {
      const j = i + lag;
      if (j < 0 || j >= normalizedSubmission.length) {
        continue;
      }
      const ref = normalizedReference[i] ?? 0;
      const sub = normalizedSubmission[j] ?? 0;
      dot += ref * sub;
      refNorm += ref * ref;
      subNorm += sub * sub;
      count += 1;
    }
    if (count < 25 || refNorm <= 0 || subNorm <= 0) {
      continue;
    }
    const score = dot / Math.sqrt(refNorm * subNorm);
    if (score > bestScore) {
      secondBest = bestScore;
      bestScore = score;
      bestLag = lag;
    } else if (score > secondBest) {
      secondBest = score;
    }
  }

  if (!Number.isFinite(bestScore)) {
    return null;
  }

  const separation = Number.isFinite(secondBest) ? Math.max(0, bestScore - secondBest) : 0;
  const confidence = Math.max(0, Math.min(1, bestScore * 0.75 + Math.min(0.25, separation * 2.5)));
  return {
    offsetMs: -bestLag * hopMs,
    confidence: Math.round(confidence * 100) / 100,
  };
}

async function estimateAudioOffsetMs(referenceUrl: string, submissionUrl: string): Promise<AudioAlignment | null> {
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

    const toMono = (buffer: AudioBuffer) => {
      const channel = buffer.numberOfChannels > 0 ? buffer.getChannelData(0) : new Float32Array(0);
      return channel;
    };

    const refMono = toMono(referenceBuffer);
    const subMono = toMono(submissionBuffer);
    const sampleRate = Math.min(referenceBuffer.sampleRate, submissionBuffer.sampleRate);
    const hopMs = 20;
    const refEnergy = buildRmsEnvelope(refMono, sampleRate, 40, hopMs);
    const subEnergy = buildRmsEnvelope(subMono, sampleRate, 40, hopMs);
    if (refEnergy.length < 10 || subEnergy.length < 10) {
      return null;
    }

    const onset = findOnsetOffsetMs(refEnergy, subEnergy, hopMs);
    const correlation = findCorrelationOffsetMs(refEnergy, subEnergy, hopMs);

    if (onset && correlation) {
      const divergenceMs = Math.abs(onset.offsetMs - correlation.offsetMs);
      if (divergenceMs <= 500) {
        const totalWeight = onset.confidence + correlation.confidence;
        const combinedOffset = Math.round(
          (onset.offsetMs * onset.confidence + correlation.offsetMs * correlation.confidence) / Math.max(totalWeight, 1e-6),
        );
        const agreementBoost = Math.max(0, 1 - divergenceMs / 500) * 0.2;
        return {
          offsetMs: combinedOffset,
          confidence: Math.min(1, Math.round((Math.max(onset.confidence, correlation.confidence) + agreementBoost) * 100) / 100),
          method: "hybrid",
        };
      }
      return correlation.confidence >= onset.confidence
        ? { ...correlation, method: "correlation" }
        : { ...onset, method: "onset" };
    }

    if (correlation) {
      return { ...correlation, method: "correlation" };
    }
    if (onset) {
      return { ...onset, method: "onset" };
    }
    return null;
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
  const { userId } = useAuth();
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [issueCount, setIssueCount] = useState(existingIssueCount);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [syncDiagnostics, setSyncDiagnostics] = useState<SyncDiagnostics>(null);
  const scoreTone =
    score === null
      ? "text-slate-700"
      : score >= 85
        ? "text-emerald-300"
        : score >= 70
          ? "text-amber-300"
          : score >= 50
            ? "text-orange-300"
            : "text-rose-300";
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
          : ` Audio sync (${audioAlignment.method}) suggested ${formatOffsetMs(audioAlignment.offsetMs)} (confidence ${Math.round(
              audioAlignment.confidence * 100,
            )}%).`;
      const syncNote = ` Final sync used ${formatOffsetMs(comparison.alignmentOffsetMs)} (${comparison.syncMethod.replace("_", " ")}; confidence ${Math.round(comparison.syncConfidence * 100)}%).`;
      const nextSummary =
        comparison.issues.length === 0
          ? `MirrorMe aligned the clips with ${formatOffsetMs(comparison.alignmentOffsetMs)} and did not flag any critical joint-angle mismatches in ${comparison.alignedFrameCount} sampled frames.${mirrorNote}${audioNote}${syncNote}`
          : `MirrorMe aligned the clips with ${formatOffsetMs(comparison.alignmentOffsetMs)}, compared ${comparison.alignedFrameCount} sampled frames, and flagged ${comparison.issues.length} critical issue${comparison.issues.length === 1 ? "" : "s"} with an average weighted joint delta of ${comparison.averageDelta} degrees.${mirrorNote}${audioNote}${syncNote}`;

      const processResponse = await fetch(`/api/analyses/${analysisId}/process`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: userId ?? undefined,
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
      setSyncDiagnostics({
        confidence: comparison.syncConfidence,
        method: comparison.syncMethod,
        selectedOffsetMs: comparison.alignmentOffsetMs,
        candidates: comparison.syncCandidates,
      });
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
    <section className="rounded-[2rem] border border-[#e8dccf] soft-panel p-6 shadow-[0_20px_70px_rgba(0,0,0,0.55)] sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#d64f72]">
            Pose Analysis
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-900">
            Run the first MediaPipe comparison pass
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-700">
            This samples the full duration of both videos at 0.5-second intervals, computes
            weighted joint-angle differences, stores frames and issues, and updates the analysis record.
          </p>
        </div>

        <button
          type="button"
          onClick={runAnalysis}
          disabled={!isConfigured || isRunning || isYouTubeUrl(referenceVideoUrl)}
          className="rounded-full bg-[#ff7f5f] px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_10px_20px_rgba(47,168,255,0.35)] transition hover:bg-[#ff997f] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRunning ? "Analyzing..." : "Run pose analysis"}
        </button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-[#e8dccf] bg-[#fff6ef] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Stored issues</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{issueCount}</p>
        </div>
        <div className="rounded-2xl border border-[#e8dccf] bg-[#fff6ef] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Latest score</p>
          <p className={`mt-2 text-3xl font-semibold ${scoreTone}`}>
            {score === null ? "--" : `${score}/100`}
          </p>
        </div>
        <div className="rounded-2xl border border-[#e8dccf] bg-[#fff6ef] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Sampling window</p>
          <p className="mt-2 text-sm font-medium text-slate-900">Entire clip, every 0.5s</p>
        </div>
      </div>

      {summary ? (
        <div className="mt-6 rounded-2xl border border-emerald-300/70 bg-emerald-100 px-4 py-4 text-sm leading-6 text-emerald-900">
          {summary}
        </div>
      ) : null}

      {syncDiagnostics ? (
        <div className="mt-6 rounded-2xl border border-[#e8dccf] bg-[#fff6ef] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Sync diagnostics</p>
          <p className="mt-2 text-sm text-slate-900">
            Selected offset: {formatOffsetMs(syncDiagnostics.selectedOffsetMs)} | Method: {syncDiagnostics.method.replace("_", " ")} | Confidence: {Math.round(syncDiagnostics.confidence * 100)}%
          </p>
          <div className="mt-3 space-y-2">
            {syncDiagnostics.candidates.map((candidate, index) => (
              <p key={`${candidate.offsetMs}-${index}`} className="text-xs text-slate-700">
                #{index + 1}: {formatOffsetMs(candidate.offsetMs)} | aligned {candidate.alignedFrameCount} frames | avg delta {candidate.averageDelta} | score {candidate.score}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mt-6 rounded-2xl border border-rose-300/70 bg-rose-100 px-4 py-4 text-sm leading-6 text-rose-900">
          {error}
        </div>
      ) : null}

      {previews.length > 0 ? (
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          {previews.map((preview) => (
            <div
              key={preview.timestampMs}
              className="rounded-2xl border border-[#e8dccf] bg-[#fff6ef] p-4"
            >
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
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
