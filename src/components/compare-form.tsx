"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

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

export function CompareForm() {
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [submissionFile, setSubmissionFile] = useState<File | null>(null);
  const [referenceTitle, setReferenceTitle] = useState("Reference choreography");
  const [submissionTitle, setSubmissionTitle] = useState("Dancer submission");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ analysisId: string; reviewPath: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!referenceFile || !submissionFile) {
      setError("Upload both a reference video and a dancer submission.");
      return;
    }

    const formData = new FormData();
    formData.append("referenceTitle", referenceTitle);
    formData.append("submissionTitle", submissionTitle);
    formData.append("referenceVideo", referenceFile);
    formData.append("submissionVideo", submissionFile);

    startTransition(async () => {
      const response = await fetch("/api/compare", {
        method: "POST",
        body: formData,
      });

      const data = (await response.json()) as CompareResponse;

      if (!response.ok || "error" in data) {
        setError("error" in data ? data.error : "Upload failed.");
        return;
      }

      setSuccess(data);
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
