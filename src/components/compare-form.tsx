"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";

type CompareResponse =
  | {
      analysisId: string;
      reviewPath: string;
    }
  | {
      error: string;
    };

function formatFileLabel(file: File | null) {
  if (!file) {
    return "No file selected";
  }

  const sizeInMb = (file.size / (1024 * 1024)).toFixed(1);
  return `${file.name} (${sizeInMb} MB)`;
}

function getVideoDurationMs(file: File) {
  return new Promise<number | null>((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = objectUrl;
    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
    };
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? Math.max(0, Math.floor(video.duration * 1000)) : null;
      cleanup();
      resolve(duration);
    };
    video.onerror = () => {
      cleanup();
      resolve(null);
    };
  });
}

export function CompareForm() {
  const { userId } = useAuth();
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [submissionFile, setSubmissionFile] = useState<File | null>(null);
  const [referenceTitle, setReferenceTitle] = useState("Reference choreography");
  const [submissionTitle, setSubmissionTitle] = useState("Dancer submission");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ analysisId: string; reviewPath: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [uploadEtaSeconds, setUploadEtaSeconds] = useState<number | null>(null);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);

  async function readJsonSafe<T>(response: Response) {
    try {
      return (await response.json()) as T;
    } catch {
      return null;
    }
  }

  async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs = 45000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  function uploadFileToSignedUrl(signedUrl: string, file: File, progressOffset = 0) {
    return new Promise<void>((resolve, reject) => {
      const request = new XMLHttpRequest();
      const startedAt = Date.now();
      const timer = setTimeout(() => {
        request.abort();
        reject(new Error("Upload timed out."));
      }, 240000);

      request.open("PUT", signedUrl);
      request.setRequestHeader("x-upsert", "false");
      request.setRequestHeader("Content-Type", file.type);
      request.upload.onprogress = (event) => {
        if (!event.lengthComputable) {
          return;
        }
        const currentFilePercent = Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100)));
        setUploadPercent(Math.max(0, Math.min(100, progressOffset + Math.round(currentFilePercent / 2))));
        const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.25);
        const bytesPerSecond = event.loaded / elapsedSeconds;
        if (bytesPerSecond > 0) {
          const remainingBytes = event.total - event.loaded;
          const rawEtaSeconds = Math.max(0, Math.round(remainingBytes / bytesPerSecond));
          setUploadEtaSeconds((current) =>
            current === null ? rawEtaSeconds : Math.max(0, Math.round(current * 0.7 + rawEtaSeconds * 0.3)),
          );
        }
      };

      request.onload = () => {
        clearTimeout(timer);
        if (request.status >= 200 && request.status < 300) {
          resolve();
          return;
        }
        reject(new Error(`Storage upload failed (HTTP ${request.status}).`));
      };
      request.onerror = () => {
        clearTimeout(timer);
        reject(new Error("Storage upload failed."));
      };
      request.onabort = () => {
        clearTimeout(timer);
        reject(new Error("Upload was aborted."));
      };
      request.send(file);
    });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setUploadPercent(null);
    setUploadEtaSeconds(null);
    setProgressLabel("Preparing upload...");

    if (!referenceFile || !submissionFile) {
      setError("Upload both a reference video and a dancer submission.");
      return;
    }

    startTransition(async () => {
      try {
        const [referenceDurationMs, submissionDurationMs] = await Promise.all([
          getVideoDurationMs(referenceFile),
          getVideoDurationMs(submissionFile),
        ]);
        setProgressLabel("Preparing reference upload...");
        const refPrepareResponse = await fetchWithTimeout("/api/videos/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "reference",
            filename: referenceFile.name,
            mimeType: referenceFile.type,
          }),
        });
        const refPreparePayload = await readJsonSafe<{ path?: string; signedUrl?: string; error?: string }>(
          refPrepareResponse,
        );
        if (!refPrepareResponse.ok || !refPreparePayload?.path || !refPreparePayload.signedUrl) {
          setError(refPreparePayload?.error ?? "Failed to prepare reference upload.");
          return;
        }

        let refUploadPath = refPreparePayload.path;
        let refUploadUrl = refPreparePayload.signedUrl;
        setProgressLabel("Uploading reference video...");
        try {
          await uploadFileToSignedUrl(refUploadUrl, referenceFile, 0);
        } catch {
          setProgressLabel("Retrying reference upload...");
          const retryPrepareResponse = await fetchWithTimeout("/api/videos/upload-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind: "reference",
              filename: referenceFile.name,
              mimeType: referenceFile.type,
            }),
          });
          const retryPreparePayload = await readJsonSafe<{ path?: string; signedUrl?: string; error?: string }>(
            retryPrepareResponse,
          );
          if (!retryPrepareResponse.ok || !retryPreparePayload?.path || !retryPreparePayload.signedUrl) {
            setError(retryPreparePayload?.error ?? "Failed to retry reference upload.");
            return;
          }
          refUploadPath = retryPreparePayload.path;
          refUploadUrl = retryPreparePayload.signedUrl;
          await uploadFileToSignedUrl(refUploadUrl, referenceFile, 0);
        }
        setUploadPercent(50);

        setProgressLabel("Finalizing reference...");
        setUploadEtaSeconds(null);
        const refFinalizeResponse = await fetchWithTimeout("/api/videos/finalize-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "reference",
            title: referenceTitle,
            path: refUploadPath,
            mimeType: referenceFile.type,
            durationMs: referenceDurationMs ?? undefined,
          }),
        });
        const refFinalizePayload = await readJsonSafe<{ videoId?: string; error?: string }>(refFinalizeResponse);
        if (!refFinalizeResponse.ok || !refFinalizePayload?.videoId) {
          setError(refFinalizePayload?.error ?? "Failed to finalize reference upload.");
          return;
        }

        setProgressLabel("Preparing dancer upload...");
        setUploadEtaSeconds(null);
        const subPrepareResponse = await fetchWithTimeout("/api/videos/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "submission",
            filename: submissionFile.name,
            mimeType: submissionFile.type,
          }),
        });
        const subPreparePayload = await readJsonSafe<{ path?: string; signedUrl?: string; error?: string }>(
          subPrepareResponse,
        );
        if (!subPrepareResponse.ok || !subPreparePayload?.path || !subPreparePayload.signedUrl) {
          setError(subPreparePayload?.error ?? "Failed to prepare submission upload.");
          return;
        }

        let subUploadPath = subPreparePayload.path;
        let subUploadUrl = subPreparePayload.signedUrl;
        setProgressLabel("Uploading dancer video...");
        try {
          await uploadFileToSignedUrl(subUploadUrl, submissionFile, 50);
        } catch {
          setProgressLabel("Retrying dancer upload...");
          const retryPrepareResponse = await fetchWithTimeout("/api/videos/upload-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind: "submission",
              filename: submissionFile.name,
              mimeType: submissionFile.type,
            }),
          });
          const retryPreparePayload = await readJsonSafe<{ path?: string; signedUrl?: string; error?: string }>(
            retryPrepareResponse,
          );
          if (!retryPrepareResponse.ok || !retryPreparePayload?.path || !retryPreparePayload.signedUrl) {
            setError(retryPreparePayload?.error ?? "Failed to retry submission upload.");
            return;
          }
          subUploadPath = retryPreparePayload.path;
          subUploadUrl = retryPreparePayload.signedUrl;
          await uploadFileToSignedUrl(subUploadUrl, submissionFile, 50);
        }
        setUploadPercent(100);
        setUploadEtaSeconds(null);

        setProgressLabel("Finalizing dancer upload...");
        setUploadEtaSeconds(null);
        const subFinalizeResponse = await fetchWithTimeout("/api/videos/finalize-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "submission",
            title: submissionTitle,
            path: subUploadPath,
            mimeType: submissionFile.type,
            durationMs: submissionDurationMs ?? undefined,
          }),
        });
        const subFinalizePayload = await readJsonSafe<{ videoId?: string; error?: string }>(subFinalizeResponse);
        if (!subFinalizeResponse.ok || !subFinalizePayload?.videoId) {
          setError(subFinalizePayload?.error ?? "Failed to finalize submission upload.");
          return;
        }

        setProgressLabel("Creating analysis...");
        setUploadEtaSeconds(null);
        const response = await fetchWithTimeout("/api/compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: userId ?? undefined,
            referenceVideoId: refFinalizePayload.videoId,
            submissionVideoId: subFinalizePayload.videoId,
          }),
        });
        const data = (await response.json()) as CompareResponse;

        if (!response.ok || "error" in data) {
          setError("error" in data ? data.error : "Failed to create analysis.");
          return;
        }

        setProgressLabel("Analysis created. Opened review in a new tab.");
        setSuccess(data);
        window.open(`${data.reviewPath}?autorun=1`, "_blank", "noopener,noreferrer");
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Upload failed. Please retry; if it persists, reduce file size or network contention.",
        );
      }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <form
        onSubmit={handleSubmit}
        className="rounded-[2rem] border border-white/15 soft-panel p-6 shadow-[0_20px_70px_rgba(0,0,0,0.55)] sm:p-8"
      >
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#8fd4ff]">
            Upload Pair
          </p>
          <h1 className="mt-2 bg-gradient-to-r from-[#b8e4ff] via-[#7ecbff] to-[#37adff] bg-clip-text text-3xl font-semibold tracking-[-0.03em] text-transparent">
            Start a comparison run
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
            This first pass uploads both videos, stores them in Supabase, and creates
            a real analysis record you can build the pose-comparison pipeline on top of.
          </p>
        </div>

        <div className="grid gap-5">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-slate-100">Reference title</span>
            <input
              value={referenceTitle}
              onChange={(event) => setReferenceTitle(event.target.value)}
              className="rounded-2xl border border-white/15 bg-[#101625] px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-[#5ab8ff]"
              placeholder="Reference choreography"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-slate-100">Reference video</span>
            <input
              type="file"
              accept="video/*"
              onChange={(event) => setReferenceFile(event.target.files?.[0] ?? null)}
              className="rounded-2xl border border-dashed border-white/30 bg-[#101625] px-4 py-3 text-sm text-slate-200"
            />
            <span className="text-xs text-slate-400">{formatFileLabel(referenceFile)}</span>
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-slate-100">Submission title</span>
            <input
              value={submissionTitle}
              onChange={(event) => setSubmissionTitle(event.target.value)}
              className="rounded-2xl border border-white/15 bg-[#101625] px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-[#5ab8ff]"
              placeholder="Dancer submission"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-slate-100">Dancer video</span>
            <input
              type="file"
              accept="video/*"
              onChange={(event) => setSubmissionFile(event.target.files?.[0] ?? null)}
              className="rounded-2xl border border-dashed border-white/30 bg-[#101625] px-4 py-3 text-sm text-slate-200"
            />
            <span className="text-xs text-slate-400">{formatFileLabel(submissionFile)}</span>
          </label>
        </div>

        {error ? (
          <div className="mt-6 rounded-2xl border border-rose-400/40 bg-rose-500/15 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        ) : null}

        {progressLabel ? (
          <div className="mt-6 rounded-2xl border border-white/20 bg-white/5 px-4 py-3">
            <p className="text-sm text-slate-200">{progressLabel}</p>
            {uploadPercent !== null ? (
              <>
                <div className="mt-2 h-2 w-full rounded-full bg-white/15">
                  <div
                    className="h-full rounded-full bg-[#2fa8ff] transition-all"
                    style={{ width: `${uploadPercent}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-300">
                  {uploadPercent}% complete
                  {progressLabel?.startsWith("Uploading") && uploadEtaSeconds !== null && uploadEtaSeconds > 0
                    ? ` · ~${uploadEtaSeconds}s remaining`
                    : ""}
                </p>
              </>
            ) : null}
          </div>
        ) : null}

        {success ? (
          <div className="mt-6 rounded-2xl border border-emerald-300/35 bg-emerald-500/10 px-4 py-4 text-sm text-emerald-200">
            Analysis created. Review it at{" "}
            <Link className="font-semibold underline" href={success.reviewPath}>
              {success.reviewPath}
            </Link>
            .
          </div>
        ) : null}

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-full bg-[#2fa8ff] px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_10px_20px_rgba(47,168,255,0.35)] transition hover:bg-[#66c2ff] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Uploading..." : "Create analysis"}
          </button>
          <Link
            href="/"
            className="rounded-full border border-white/25 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/15"
          >
            Back home
          </Link>
        </div>
      </form>

      <aside className="rounded-[2rem] border border-white/15 soft-panel p-6 text-slate-100 shadow-[0_20px_70px_rgba(0,0,0,0.55)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#8fd4ff]">
          Current Scope
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-white">
          What this step proves
        </h2>

        <ul className="mt-6 space-y-3 text-sm leading-6 text-slate-300">
          <li>Both video assets can be stored in a durable bucket.</li>
          <li>A comparison job gets a stable database record and review URL.</li>
          <li>The project now has a real substrate for pose extraction and scoring.</li>
        </ul>

        <div className="mt-8 rounded-2xl border border-white/15 bg-white/5 p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-300">
            Next after this
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Add frame sampling and landmark extraction, then populate `analysis_frames`
            and `analysis_issues` instead of leaving the job in a pending state.
          </p>
        </div>
      </aside>
    </div>
  );
}
